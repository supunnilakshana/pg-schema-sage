import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { PostgRESTClient } from '../services/postgrest-client.js';
import { PostgRESTConfig, PostgRESTQuery } from '../types/postgrest.js';

export const PostgRESTExecuteQuerySchema = z.object({
  query: z.object({
    table: z.string().describe('Target table name'),
    operation: z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'UPSERT']).describe('Operation type'),
    select: z.array(z.string()).optional().describe('Columns to select'),
    filters: z.array(z.object({
      column: z.string(),
      operator: z.string(),
      value: z.any(),
      negate: z.boolean().optional(),
    })).optional().describe('Query filters'),
    orderBy: z.array(z.object({
      column: z.string(),
      ascending: z.boolean().optional(),
      nullsFirst: z.boolean().optional(),
    })).optional().describe('Order by clauses'),
    limit: z.number().optional().describe('Maximum number of results'),
    offset: z.number().optional().describe('Result offset'),
    data: z.record(z.any()).optional().describe('Data for INSERT/UPDATE/UPSERT operations'),
    upsert: z.object({
      onConflict: z.string().optional(),
      ignoreDuplicates: z.boolean().optional(),
    }).optional().describe('Upsert options'),
  }).describe('PostgREST query to execute'),
  dryRun: z.boolean().optional().describe('Preview the query without executing'),
  readOnlyMode: z.boolean().optional().describe('Enable read-only mode (only SELECT operations allowed)'),
  bypassSafetyChecks: z.boolean().optional().describe('Bypass safety validation (use with caution)'),
});

export class PostgRESTExecuteQueryTool {
  private client: PostgRESTClient;

  constructor(config: PostgRESTConfig) {
    this.client = new PostgRESTClient(config);
  }

  async execute(params: z.infer<typeof PostgRESTExecuteQuerySchema>): Promise<string> {
    try {
      const query = params.query as PostgRESTQuery;
      const readOnlyMode = params.readOnlyMode ?? false;
      
      // Update client read-only mode if specified
      if (readOnlyMode !== this.client.isInReadOnlyMode()) {
        this.client.setReadOnlyMode(readOnlyMode);
      }

      // Perform safety validation before execution
      const safetyCheck = this.client.validateQuerySafety(query);

      if (params.dryRun) {
        return JSON.stringify({
          dryRun: true,
          query,
          url: this.buildPreviewUrl(query),
          httpMethod: this.getHttpMethod(query.operation),
          headers: this.getRequiredHeaders(query.operation),
          requestBody: query.data || null,
          safetyValidation: safetyCheck,
          readOnlyModeEnabled: readOnlyMode,
        }, null, 2);
      }

      const result = await this.client.executeQuery(query, {
        bypassSafetyChecks: params.bypassSafetyChecks ?? false
      });
      
      const response = {
        success: result.success,
        data: result.data,
        count: result.count,
        error: result.error,
        executionTime: result.executionTime,
        queryUrl: result.queryUrl,
        safetyValidation: safetyCheck,
        readOnlyModeEnabled: readOnlyMode,
        bypassedSafetyChecks: params.bypassSafetyChecks ?? false,
        metadata: {
          httpMethod: this.getHttpMethod(query.operation),
          operation: query.operation,
          table: query.table,
          hasFilters: !!(query.filters && query.filters.length > 0),
          hasOrdering: !!(query.orderBy && query.orderBy.length > 0),
          hasLimit: !!query.limit,
          estimatedComplexity: this.estimateComplexity(query),
          relationships: query.select?.filter(col => col.includes('(')) || [],
        },
      };

      return JSON.stringify(response, null, 2);
    } catch (error) {
      throw new Error(`Failed to execute PostgREST query: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private buildPreviewUrl(query: PostgRESTQuery): string {
    const params = new URLSearchParams();
    
    if (query.select) {
      params.append('select', query.select.join(','));
    }
    
    if (query.filters) {
      for (const filter of query.filters) {
        const key = filter.negate ? `${filter.column}.not.${filter.operator}` : `${filter.column}.${filter.operator}`;
        params.append(key, filter.value.toString());
      }
    }
    
    if (query.orderBy) {
      const orderStrings = query.orderBy.map(order => {
        let str = order.column;
        if (!order.ascending) str += '.desc';
        if (order.nullsFirst) str += '.nullsfirst';
        return str;
      });
      params.append('order', orderStrings.join(','));
    }
    
    if (query.limit) {
      params.append('limit', query.limit.toString());
    }
    
    if (query.offset) {
      params.append('offset', query.offset.toString());
    }
    
    const queryString = params.toString();
    return `/${query.table}${queryString ? `?${queryString}` : ''}`;
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

  private estimateComplexity(query: PostgRESTQuery): 'LOW' | 'MEDIUM' | 'HIGH' {
    let complexity = 0;
    
    // Base complexity
    complexity += 1;
    
    // Add complexity for filters
    if (query.filters) {
      complexity += query.filters.length;
      
      // Pattern matching is more expensive
      const hasPatternMatching = query.filters.some(f => 
        f.operator === 'like' || f.operator === 'ilike'
      );
      if (hasPatternMatching) {
        complexity += 2;
      }
    }
    
    // Add complexity for ordering
    if (query.orderBy && query.orderBy.length > 0) {
      complexity += query.orderBy.length;
    }
    
    // Large result sets
    if (!query.limit || query.limit > 1000) {
      complexity += 2;
    }
    
    // Write operations are more complex
    if (query.operation !== 'SELECT') {
      complexity += 1;
    }
    
    if (complexity <= 2) return 'LOW';
    if (complexity <= 5) return 'MEDIUM';
    return 'HIGH';
  }
}