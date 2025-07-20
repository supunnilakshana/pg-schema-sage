import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { PostgRESTQueryGenerator } from '../services/postgrest-query-generator.js';
import { PostgRESTSchemaGenerator } from '../services/postgrest-schema-generator.js';
import { DatabaseService } from '../services/database.js';

export const PostgRESTGenerateQuerySchema = z.object({
  description: z.string().describe('Natural language description of the query to generate'),
  tables: z.array(z.string()).optional().describe('Specific tables to focus on (optional)'),
  expectedOutput: z.enum(['json', 'csv', 'count']).optional().describe('Expected output format'),
  includeMetadata: z.boolean().optional().describe('Include metadata in response'),
  maxRows: z.number().optional().describe('Maximum number of rows to return'),
  readOnlyMode: z.boolean().optional().describe('Enable read-only mode (only SELECT operations allowed)'),
  includeRelationships: z.boolean().optional().describe('Automatically include related data via joins'),
});

export class PostgRESTGenerateQueryTool {
  private databaseService: DatabaseService;
  private schemaGenerator: PostgRESTSchemaGenerator;
  private queryGenerator: PostgRESTQueryGenerator | null = null;

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
    this.schemaGenerator = new PostgRESTSchemaGenerator(databaseService);
  }

  private async initializeQueryGenerator(readOnlyMode: boolean = false): Promise<void> {
    if (!this.queryGenerator) {
      const schemaDefinitions = await this.schemaGenerator.generatePostgRESTSchema();
      this.queryGenerator = new PostgRESTQueryGenerator(schemaDefinitions, readOnlyMode);
    } else if (this.queryGenerator.isInReadOnlyMode() !== readOnlyMode) {
      // Recreate generator if read-only mode changed
      const schemaDefinitions = await this.schemaGenerator.generatePostgRESTSchema();
      this.queryGenerator = new PostgRESTQueryGenerator(schemaDefinitions, readOnlyMode);
    }
  }

  async execute(params: z.infer<typeof PostgRESTGenerateQuerySchema>): Promise<string> {
    try {
      const readOnlyMode = params.readOnlyMode ?? false;
      await this.initializeQueryGenerator(readOnlyMode);
      
      if (!this.queryGenerator) {
        throw new Error('Failed to initialize query generator');
      }

      const result = await this.queryGenerator.generateQuery({
        description: params.description,
        tables: params.tables,
        expectedOutput: params.expectedOutput,
        includeMetadata: params.includeMetadata,
        maxRows: params.maxRows,
      });

      const response = {
        query: result.query,
        url: result.url,
        explanation: result.explanation,
        estimatedRows: result.estimatedRows,
        requiredPermissions: result.requiredPermissions,
        potentialIssues: result.potentialIssues,
        isReadOnly: result.isReadOnly,
        safetyLevel: result.safetyLevel,
        relationships: result.query.select?.filter(col => col.includes('(')) || [],
        readOnlyModeEnabled: readOnlyMode,
        httpMethod: this.getHttpMethod(result.query.operation),
        headers: this.getRequiredHeaders(result.query.operation),
        requestBody: this.getRequestBody(result.query),
      };

      // Add safety warnings if any
      if (result.safetyLevel === 'UNSAFE') {
        (response as any).warnings = ['⚠️  This query has been flagged as potentially unsafe'];
      } else if (result.safetyLevel === 'CAUTION') {
        (response as any).warnings = ['⚠️  This query may require careful monitoring'];
      }

      return JSON.stringify(response, null, 2);
    } catch (error) {
      throw new Error(`Failed to generate PostgREST query: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getHttpMethod(operation: string): string {
    switch (operation) {
      case 'SELECT':
        return 'GET';
      case 'INSERT':
        return 'POST';
      case 'UPDATE':
        return 'PATCH';
      case 'DELETE':
        return 'DELETE';
      case 'UPSERT':
        return 'POST';
      default:
        return 'GET';
    }
  }

  private getRequiredHeaders(operation: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Authorization': 'Bearer <token>',
      'Content-Type': 'application/json',
    };

    switch (operation) {
      case 'INSERT':
        headers['Prefer'] = 'return=representation';
        break;
      case 'UPDATE':
        headers['Prefer'] = 'return=representation';
        break;
      case 'DELETE':
        headers['Prefer'] = 'return=representation';
        break;
      case 'UPSERT':
        headers['Prefer'] = 'return=representation,resolution=merge-duplicates';
        break;
      case 'SELECT':
        headers['Prefer'] = 'count=exact';
        break;
    }

    return headers;
  }

  private getRequestBody(query: any): any {
    if (query.operation === 'SELECT' || query.operation === 'DELETE') {
      return null;
    }

    if (query.data) {
      return query.data;
    }

    // Return example structure for INSERT/UPDATE/UPSERT
    return {
      example: 'Add your data here according to the table schema',
    };
  }
}