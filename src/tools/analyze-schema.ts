import {z} from "zod";
import {DatabaseService} from "../services/database.js";
import {GeminiService} from "../services/gemini-service.js";
import {SchemaFilter, FilteredSchema, SchemaFilterOptions} from "../utils/schema-filter.js";
import {log} from "../utils/logger.js";

export const analyzeSchemaSchema = z.object({
  includeSystemSchemas: z.boolean().default(false),
  tableFilter: z.string().optional(),
  schemaFilter: z.string().optional(),
  useGeminiSummarization: z.boolean().default(false),
  useGeminiLargeSchemaFiltering: z.boolean().default(false),
  geminiObjectTypeFilter: z.enum(['tables', 'views', 'functions', 'all']).default('all'),
  analysisIntent: z.enum(['query_generation', 'migration_analysis', 'overview', 'relationships']).default('overview'),
  maxTables: z.number().min(1).max(50).default(20),
  maxViews: z.number().min(1).max(20).default(10),
  returnFullSchema: z.boolean().default(false),
  maxResponseSizeKB: z.number().min(10).max(500).default(100),
});

export type AnalyzeSchemaInput = z.infer<typeof analyzeSchemaSchema>;

export async function analyzeSchema(
  input: AnalyzeSchemaInput,
  databaseService: DatabaseService,
  geminiService?: GeminiService | null
) {
  const schemaLogger = log.schema("analyze", undefined, input.schemaFilter);
  const timer = log.timer("analyze-schema");

  try {
    schemaLogger.info("Starting schema analysis", {
      includeSystemSchemas: input.includeSystemSchemas,
      tableFilter: input.tableFilter,
      schemaFilter: input.schemaFilter,
      useGeminiSummarization: input.useGeminiSummarization,
      analysisIntent: input.analysisIntent,
      maxTables: input.maxTables,
      maxResponseSizeKB: input.maxResponseSizeKB,
      geminiAvailable: !!geminiService,
    });

    const rawSchema = await databaseService.getSchema();
    
    schemaLogger.info("Raw schema fetched from database", {
      totalTables: rawSchema.tables?.length || 0,
      totalViews: rawSchema.views?.length || 0,
      totalFunctions: rawSchema.functions?.length || 0,
      totalEnums: rawSchema.enums?.length || 0,
      rawSizeKB: Math.round(SchemaFilter.calculateSize(rawSchema) / 1024)
    });

    // Check if we should use Gemini large schema filtering first
    let workingSchema = { ...rawSchema };
    let geminiFilteredResults: any = null;

    if (input.useGeminiLargeSchemaFiltering && geminiService && input.tableFilter) {
      try {
        schemaLogger.info("Using Gemini large schema filtering", {
          filter: input.tableFilter,
          objectType: input.geminiObjectTypeFilter,
          rawSizeKB: Math.round(SchemaFilter.calculateSize(rawSchema) / 1024)
        });

        geminiFilteredResults = await geminiService.filterLargeSchemaForSpecificObjects(
          rawSchema,
          input.tableFilter,
          input.geminiObjectTypeFilter
        );

        if (geminiFilteredResults.matchedObjects && geminiFilteredResults.matchedObjects.length > 0) {
          // Reconstruct schema with only matched objects
          workingSchema = reconstructSchemaFromGeminiResults(geminiFilteredResults, rawSchema);
          schemaLogger.info("Gemini filtering applied successfully", {
            matchedObjects: geminiFilteredResults.matchedObjects.length,
            originalSizeKB: Math.round(SchemaFilter.calculateSize(rawSchema) / 1024),
            filteredSizeKB: Math.round(SchemaFilter.calculateSize(workingSchema) / 1024)
          });
        } else {
          schemaLogger.warn("No objects matched Gemini filter, using traditional filtering");
        }
      } catch (geminiError) {
        schemaLogger.warn("Gemini large schema filtering failed, falling back to traditional filtering", {
          error: geminiError instanceof Error ? geminiError.message : String(geminiError)
        });
      }
    }

    // Apply basic filtering if Gemini filtering wasn't used or didn't match anything
    if (!geminiFilteredResults || !geminiFilteredResults.matchedObjects?.length) {
      // Apply schema filtering
      if (input.schemaFilter) {
        schemaLogger.info("Applying schema filter", { filter: input.schemaFilter });
        workingSchema.tables = (rawSchema.tables || []).filter((table: any) =>
          table.schema.includes(input.schemaFilter!)
        );
        workingSchema.enums = (rawSchema.enums || []).filter((enumType: any) =>
          enumType.schema.includes(input.schemaFilter!)
        );
      }

      // Apply table filtering
      if (input.tableFilter) {
        schemaLogger.info("Applying table filter", { filter: input.tableFilter });
        workingSchema.tables = (workingSchema.tables || []).filter((table: any) =>
          table.name.includes(input.tableFilter!)
        );
      }
    }

    // Create filtered schema using SchemaFilter utility
    const filterOptions: SchemaFilterOptions = {
      maxTables: input.maxTables,
      maxViews: input.maxViews,
      includeSystemSchemas: input.includeSystemSchemas,
      focusIntent: input.analysisIntent
    };

    const filteredResult = SchemaFilter.createFilteredSchema(workingSchema, filterOptions);

    // Apply Gemini enhancement if requested and available
    let geminiInsights: any = null;
    let geminiEnhanced = false;

    if (input.useGeminiSummarization && geminiService) {
      try {
        schemaLogger.info("Applying Gemini enhancement", {
          filteredTableCount: filteredResult.coreEntities.length,
          intent: input.analysisIntent,
        });

        // Use filtered schema for Gemini (much smaller payload)
        geminiInsights = await geminiService.enhanceSchemaAnalysis(filteredResult, input.analysisIntent);
        geminiEnhanced = true;
        schemaLogger.info("Gemini enhancement applied successfully");
      } catch (geminiError) {
        schemaLogger.warn("Gemini enhancement failed, using filtered results only", {
          error: geminiError instanceof Error ? geminiError.message : String(geminiError)
        });
      }
    } else if (input.useGeminiSummarization && !geminiService) {
      schemaLogger.warn("Gemini enhancement requested but service not available");
    }

    // Prepare final response
    let finalResponse: any = {
      analysis: {
        databaseOverview: filteredResult.overview,
        coreEntities: filteredResult.coreEntities,
        essentialViews: filteredResult.essentialViews,
        criticalFunctions: filteredResult.criticalFunctions,
        schemaMetrics: {
          ...filteredResult.schemaSize,
          maxResponseSizeKB: input.maxResponseSizeKB,
          geminiEnhanced
        }
      }
    };

    // Add Gemini insights if available
    if (geminiInsights) {
      finalResponse.insights = geminiInsights;
    }

    // Add full schema only if specifically requested and size allows
    if (input.returnFullSchema) {
      const fullSchemaSize = SchemaFilter.calculateSize(workingSchema);
      const maxSizeBytes = input.maxResponseSizeKB * 1024;
      
      if (fullSchemaSize <= maxSizeBytes) {
        finalResponse.fullSchema = workingSchema;
        schemaLogger.info("Full schema included in response");
      } else {
        schemaLogger.warn("Full schema too large for response", {
          sizeKB: Math.round(fullSchemaSize / 1024),
          maxSizeKB: input.maxResponseSizeKB
        });
        finalResponse.warning = `Full schema (${Math.round(fullSchemaSize / 1024)}KB) exceeds max response size (${input.maxResponseSizeKB}KB). Use returnFullSchema: false for optimal performance.`;
      }
    }

    // Check final response size
    const responseSize = SchemaFilter.calculateSize(finalResponse);
    const responseSizeKB = Math.round(responseSize / 1024);

    schemaLogger.info("Schema analysis completed", {
      responseSizeKB,
      maxAllowedKB: input.maxResponseSizeKB,
      entitiesIncluded: filteredResult.coreEntities.length,
      compressionRatio: filteredResult.schemaSize.compressionRatio,
      geminiEnhanced
    });

    timer();

    return {
      success: true,
      data: finalResponse,
      metadata: {
        responseSizeKB,
        processingTimeMs: Date.now() - Date.now(), // Will be set by timer
        originalTableCount: rawSchema.tables?.length || 0,
        includedTableCount: filteredResult.coreEntities.length
      }
    };
  } catch (error) {
    schemaLogger.error(
      "Schema analysis failed",
      error instanceof Error ? error : new Error(String(error))
    );
    timer();
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

function getSchemaBreakdown(tables: any[]) {
  const breakdown: {[schema: string]: number} = {};

  for (const table of tables) {
    breakdown[table.schema] = (breakdown[table.schema] || 0) + 1;
  }

  return breakdown;
}

function reconstructSchemaFromGeminiResults(geminiResults: any, originalSchema: any): any {
  const reconstructed: any = {
    tables: [],
    views: [],
    functions: [],
    materializedViews: originalSchema.materializedViews || [],
    enums: originalSchema.enums || [],
    extensions: originalSchema.extensions || [],
    triggers: originalSchema.triggers || [],
    rlsPolicies: originalSchema.rlsPolicies || [],
    sequences: originalSchema.sequences || [],
    temporaryTables: originalSchema.temporaryTables || []
  };

  // Process matched objects from Gemini
  for (const matchedObj of geminiResults.matchedObjects) {
    switch (matchedObj.type) {
      case 'table':
        // Find the complete table definition from original schema
        const fullTable = originalSchema.tables?.find((t: any) => 
          t.name === matchedObj.name && t.schema === matchedObj.schema
        );
        if (fullTable) {
          reconstructed.tables.push(fullTable);
        }
        break;
        
      case 'view':
        const fullView = originalSchema.views?.find((v: any) => 
          v.name === matchedObj.name && v.schema === matchedObj.schema
        );
        if (fullView) {
          reconstructed.views.push(fullView);
        } else {
          // Use the definition from Gemini if not found in original
          reconstructed.views.push({
            name: matchedObj.name,
            schema: matchedObj.schema,
            definition: matchedObj.definition,
            owner: matchedObj.metadata?.owner,
            comment: null
          });
        }
        break;
        
      case 'function':
        const fullFunction = originalSchema.functions?.find((f: any) => 
          f.name === matchedObj.name && f.schema === matchedObj.schema
        );
        if (fullFunction) {
          reconstructed.functions.push(fullFunction);
        }
        break;
    }
  }

  return reconstructed;
}
