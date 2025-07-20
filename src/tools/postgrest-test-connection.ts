import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { PostgRESTClient } from '../services/postgrest-client.js';
import { PostgRESTConfig } from '../types/postgrest.js';

export const PostgRESTTestConnectionSchema = z.object({
  includeMetadata: z.boolean().optional().describe('Include PostgREST metadata in response'),
  testQuery: z.string().optional().describe('Optional test query table to verify access'),
});

export class PostgRESTTestConnectionTool {
  private client: PostgRESTClient;

  constructor(config: PostgRESTConfig) {
    this.client = new PostgRESTClient(config);
  }

  async execute(params: z.infer<typeof PostgRESTTestConnectionSchema>): Promise<string> {
    try {
      const startTime = Date.now();
      
      // Test basic connection
      const isConnected = await this.client.testConnection();
      const connectionTime = Date.now() - startTime;
      
      const response: any = {
        success: isConnected,
        connectionTime,
        timestamp: new Date().toISOString(),
      };

      if (!isConnected) {
        response.error = 'Failed to connect to PostgREST endpoint or authenticate with Keycloak';
        return JSON.stringify(response, null, 2);
      }

      // Get metadata if requested
      if (params.includeMetadata) {
        try {
          const metadata = await this.client.getMetadata();
          response.metadata = metadata;
        } catch (error) {
          response.metadataError = error instanceof Error ? error.message : 'Unknown error';
        }
      }

      // Test query if provided
      if (params.testQuery) {
        try {
          const testResult = await this.client.executeQuery({
            table: params.testQuery,
            operation: 'SELECT',
            limit: 1,
          });
          
          response.testQuery = {
            table: params.testQuery,
            success: testResult.success,
            executionTime: testResult.executionTime,
            hasData: testResult.data && testResult.data.length > 0,
            error: testResult.error,
          };
        } catch (error) {
          response.testQuery = {
            table: params.testQuery,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }

      // Additional connection details
      response.details = {
        authenticationMethod: 'Keycloak',
        connectionType: 'PostgREST API',
        features: [
          'Query Generation',
          'Schema Introspection',
          'CRUD Operations',
          'RPC Functions',
          'Authentication',
        ],
      };

      return JSON.stringify(response, null, 2);
    } catch (error) {
      const response = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
      
      return JSON.stringify(response, null, 2);
    }
  }
}