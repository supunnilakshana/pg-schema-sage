import { GoogleGenerativeAI } from "@google/generative-ai";
import { GeminiConfig } from "../types/config.js";
import { FilteredSchema, SchemaFilter } from "../utils/schema-filter.js";
import { log } from "../utils/logger.js";

export class GeminiService {
  private static instance: GeminiService;
  private genAI: GoogleGenerativeAI;
  private model: any;

  private constructor(private config: GeminiConfig) {
    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  }

  static getInstance(config?: GeminiConfig): GeminiService | null {
    if (!GeminiService.instance && config) {
      GeminiService.instance = new GeminiService(config);
    }
    return GeminiService.instance || null;
  }

  private getSystemPrompt(): string {
    return `You are a database schema analyst. Your task is to summarize and extract only the essential database objects (tables, views, functions) relevant for query generation or analysis.

    When analyzing a database schema, focus on:
    1. Core business entities (main tables that represent key domain objects)
    2. Important relationships between tables (foreign key constraints)
    3. Critical indexes that affect performance
    4. Essential views and functions used for data access
    5. Key constraints that enforce business rules

    Exclude or de-emphasize:
    1. System or audit tables (unless specifically relevant)
    2. Temporary or staging tables
    3. Overly detailed column metadata for non-essential tables
    4. Redundant or duplicate information

    Return a concise JSON summary that preserves the essential structure while reducing noise and token usage. Maintain enough detail for meaningful query generation and analysis.`;
  }

  async summarizeSchema(schema: any, context?: string): Promise<any> {
    const geminiLogger = log.schema("gemini-summarize");
    const timer = log.timer("gemini-schema-summarization");

    try {
      geminiLogger.info("Starting schema summarization with Gemini", {
        totalTables: schema.tables?.length || 0,
        totalViews: schema.views?.length || 0,
        totalFunctions: schema.functions?.length || 0,
        context: context || "general analysis"
      });

      const prompt = `${this.getSystemPrompt()}

Context: ${context || "General schema analysis for query generation"}

Please analyze and summarize the following database schema, focusing on the most essential elements:

${JSON.stringify(schema, null, 2)}

Return a concise JSON response with the most important tables, relationships, and metadata.`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Try to parse as JSON, fallback to text if parsing fails
      let summarizedSchema;
      try {
        summarizedSchema = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, ''));
      } catch (parseError) {
        geminiLogger.warn("Failed to parse Gemini response as JSON, using text response", {
          error: parseError instanceof Error ? parseError.message : String(parseError)
        });
        summarizedSchema = {
          summary: text,
          originalTableCount: schema.tables?.length || 0,
          error: "Failed to parse as structured JSON"
        };
      }

      geminiLogger.info("Schema summarization completed", {
        originalSize: JSON.stringify(schema).length,
        summarizedSize: JSON.stringify(summarizedSchema).length,
        compressionRatio: Math.round((1 - JSON.stringify(summarizedSchema).length / JSON.stringify(schema).length) * 100)
      });

      timer();
      return summarizedSchema;

    } catch (error) {
      geminiLogger.error(
        "Schema summarization failed",
        error instanceof Error ? error : new Error(String(error))
      );
      timer();
      
      // Return original schema as fallback
      geminiLogger.info("Falling back to original schema due to Gemini error");
      return schema;
    }
  }

  async filterRelevantTables(schema: any, intent: string): Promise<any> {
    const geminiLogger = log.schema("gemini-filter");
    const timer = log.timer("gemini-table-filtering");

    try {
      geminiLogger.info("Filtering tables based on intent", {
        intent,
        totalTables: schema.tables?.length || 0
      });

      const prompt = `${this.getSystemPrompt()}

Task: Filter and identify the most relevant database tables and objects for the following intent: "${intent}"

Available schema:
${JSON.stringify(schema, null, 2)}

Return a JSON response containing only the tables, views, and functions that are most relevant to the specified intent. Include essential relationships and constraints that connect these objects.`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      let filteredSchema;
      try {
        filteredSchema = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, ''));
      } catch (parseError) {
        geminiLogger.warn("Failed to parse filtered schema, falling back to summary", {
          error: parseError instanceof Error ? parseError.message : String(parseError)
        });
        return await this.summarizeSchema(schema, intent);
      }

      geminiLogger.info("Table filtering completed", {
        originalTableCount: schema.tables?.length || 0,
        filteredTableCount: filteredSchema.tables?.length || 0,
        intent
      });

      timer();
      return filteredSchema;

    } catch (error) {
      geminiLogger.error(
        "Table filtering failed",
        error instanceof Error ? error : new Error(String(error))
      );
      timer();
      
      // Fallback to summarization
      return await this.summarizeSchema(schema, intent);
    }
  }

  async shouldSummarize(schema: any, threshold: number = 50): Promise<boolean> {
    const totalTables = schema.tables?.length || 0;
    const totalObjects = totalTables + 
                        (schema.views?.length || 0) + 
                        (schema.functions?.length || 0) + 
                        (schema.materializedViews?.length || 0);
    
    return totalObjects > threshold;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    const geminiLogger = log.schema("gemini-test");
    
    try {
      geminiLogger.info("Testing Gemini API connection");
      
      const testPrompt = "Test connection. Please respond with 'OK'.";
      const result = await this.model.generateContent(testPrompt);
      const response = await result.response;
      const text = response.text();
      
      geminiLogger.info("Gemini connection test successful", { response: text });
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      geminiLogger.error("Gemini connection test failed", new Error(errorMsg));
      return { success: false, error: errorMsg };
    }
  }

  async enhanceSchemaAnalysis(
    filteredSchema: FilteredSchema, 
    intent: string
  ): Promise<any> {
    const geminiLogger = log.schema("gemini-enhance");
    const timer = log.timer("gemini-enhancement");

    try {
      geminiLogger.info("Starting schema enhancement with Gemini", {
        coreEntities: filteredSchema.coreEntities.length,
        relationships: filteredSchema.overview.relationships.length,
        intent,
        sizeKB: Math.round(filteredSchema.schemaSize.filteredBytes / 1024)
      });

      // Check if the filtered schema is still too large
      const maxContextSize = 50000; // 50KB should be safe for Gemini
      if (filteredSchema.schemaSize.filteredBytes > maxContextSize) {
        geminiLogger.warn("Filtered schema still too large, using minimal overview");
        return this.generateMinimalInsights(filteredSchema, intent);
      }

      const enhancementPrompt = `${this.getSystemPrompt()}

Context: Database schema analysis for ${intent}

Based on the following filtered database schema, provide intelligent insights and recommendations:

${JSON.stringify(filteredSchema, null, 2)}

Please provide a JSON response with:
1. "insights": Key observations about the database structure
2. "recommendations": Suggestions for optimization or best practices  
3. "queryPatterns": Common query patterns for this schema
4. "relationships": Analysis of entity relationships
5. "potentialIssues": Any concerns or optimization opportunities

Focus on practical, actionable insights that would help developers work with this database.`;

      const result = await this.model.generateContent(enhancementPrompt);
      const response = await result.response;
      const text = response.text();

      let enhancedAnalysis;
      try {
        enhancedAnalysis = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, ''));
      } catch (parseError) {
        geminiLogger.warn("Failed to parse Gemini enhancement as JSON, using text response");
        enhancedAnalysis = {
          insights: text,
          note: "Gemini response could not be parsed as structured JSON"
        };
      }

      geminiLogger.info("Schema enhancement completed successfully");
      timer();
      return enhancedAnalysis;

    } catch (error) {
      geminiLogger.error(
        "Schema enhancement failed",
        error instanceof Error ? error : new Error(String(error))
      );
      timer();
      
      // Fallback to minimal insights
      return this.generateMinimalInsights(filteredSchema, intent);
    }
  }

  async filterLargeSchemaForSpecificObjects(
    schema: any, 
    targetFilter: string,
    objectType: 'tables' | 'views' | 'functions' | 'all' = 'all'
  ): Promise<any> {
    const geminiLogger = log.schema("gemini-large-filter");
    const startTime = Date.now();

    try {
      geminiLogger.info("Filtering large schema for specific objects", {
        targetFilter,
        objectType,
        totalTables: schema.tables?.length || 0,
        totalViews: schema.views?.length || 0,
        totalFunctions: schema.functions?.length || 0,
        sizeKB: Math.round(JSON.stringify(schema).length / 1024)
      });

      // First, extract just object names and basic metadata to reduce token usage
      const objectsOverview = this.extractObjectsOverview(schema, objectType);
      
      const prompt = `You are a database schema analyst. I need you to identify and extract specific database objects from a large schema.

Task: Find objects matching the pattern/filter: "${targetFilter}"
Object type focus: ${objectType}

Available objects in database:
${JSON.stringify(objectsOverview, null, 2)}

CRITICAL: Return ONLY the objects that match the filter "${targetFilter}". 
- If filtering for a specific table/view/function name, return exact matches
- If filtering for a pattern (like "user", "task", "resource"), return all objects containing that term
- Include the complete definition/structure for matched objects
- Return as JSON with matched objects only

Example response format:
{
  "matchedObjects": [
    {
      "type": "view|table|function",
      "name": "object_name", 
      "schema": "schema_name",
      "definition": "complete_definition_here",
      "metadata": {...}
    }
  ],
  "totalMatches": 1,
  "filterUsed": "${targetFilter}"
}`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      let filteredResults;
      try {
        filteredResults = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, ''));
      } catch (parseError) {
        geminiLogger.warn("Failed to parse Gemini filter response, using fallback");
        
        // Fallback: Use local filtering
        filteredResults = this.localFilterSchema(schema, targetFilter, objectType);
      }

      geminiLogger.info("Large schema filtering completed", {
        matchedObjects: filteredResults.matchedObjects?.length || 0,
        filterUsed: targetFilter,
        processingTimeMs: Date.now() - startTime
      });
      return filteredResults;

    } catch (error) {
      geminiLogger.error(
        "Large schema filtering failed",
        error instanceof Error ? error : new Error(String(error))
      );
      
      // Fallback to local filtering
      return this.localFilterSchema(schema, targetFilter, objectType);
    }
  }

  private extractObjectsOverview(schema: any, objectType: string): any {
    const overview: any = {
      metadata: {
        totalTables: schema.tables?.length || 0,
        totalViews: schema.views?.length || 0,
        totalFunctions: schema.functions?.length || 0
      }
    };

    if (objectType === 'all' || objectType === 'tables') {
      overview.tables = schema.tables?.map((table: any) => ({
        name: table.name,
        schema: table.schema,
        columnCount: table.columns?.length || 0,
        constraintCount: table.constraints?.length || 0,
        comment: table.comment
      })) || [];
    }

    if (objectType === 'all' || objectType === 'views') {
      overview.views = schema.views?.map((view: any) => ({
        name: view.name,
        schema: view.schema,
        owner: view.owner,
        comment: view.comment,
        isUpdatable: view.isUpdatable
      })) || [];
    }

    if (objectType === 'all' || objectType === 'functions') {
      overview.functions = schema.functions?.map((func: any) => ({
        name: func.name,
        schema: func.schema,
        returnType: func.returnType,
        language: func.language,
        kind: func.kind
      })) || [];
    }

    return overview;
  }

  private localFilterSchema(schema: any, targetFilter: string, objectType: string): any {
    const matchedObjects: any[] = [];
    const filterLower = targetFilter.toLowerCase();

    if (objectType === 'all' || objectType === 'tables') {
      schema.tables?.forEach((table: any) => {
        if (table.name.toLowerCase().includes(filterLower)) {
          matchedObjects.push({
            type: 'table',
            name: table.name,
            schema: table.schema,
            definition: table,
            metadata: { objectType: 'table' }
          });
        }
      });
    }

    if (objectType === 'all' || objectType === 'views') {
      schema.views?.forEach((view: any) => {
        if (view.name.toLowerCase().includes(filterLower)) {
          matchedObjects.push({
            type: 'view',
            name: view.name,
            schema: view.schema,
            definition: view.definition,
            metadata: { objectType: 'view', owner: view.owner }
          });
        }
      });
    }

    if (objectType === 'all' || objectType === 'functions') {
      schema.functions?.forEach((func: any) => {
        if (func.name.toLowerCase().includes(filterLower)) {
          matchedObjects.push({
            type: 'function',
            name: func.name,
            schema: func.schema,
            definition: func.fullDefinition || func.definition,
            metadata: { objectType: 'function', language: func.language }
          });
        }
      });
    }

    return {
      matchedObjects,
      totalMatches: matchedObjects.length,
      filterUsed: targetFilter,
      note: "Results generated using local filtering (Gemini not available)"
    };
  }

  private generateMinimalInsights(filteredSchema: FilteredSchema, intent: string): any {
    const coreTableCount = filteredSchema.coreEntities.length;
    const relationshipCount = filteredSchema.overview.relationships.length;
    
    return {
      insights: [
        `Database contains ${coreTableCount} core business entities`,
        `Found ${relationshipCount} entity relationships`,
        `Schema compression: ${filteredSchema.schemaSize.compressionRatio}% size reduction achieved`
      ],
      recommendations: [
        coreTableCount > 20 ? "Consider using views to simplify complex queries" : "Schema size is manageable",
        relationshipCount > 15 ? "Complex relationships - ensure proper indexing" : "Simple relationship structure"
      ],
      queryPatterns: [`Optimized for ${intent} operations`],
      note: "Generated using local analysis due to Gemini service limitations"
    };
  }
}