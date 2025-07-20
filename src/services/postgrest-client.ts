import { 
  PostgRESTConfig,
  PostgRESTQuery, 
  PostgRESTResponse, 
  PostgRESTExecutionResult,
  PostgRESTError,
  PostgRESTFilter,
  PostgRESTOrder,
  PostgRESTMetadata
} from '../types/postgrest.js';

export interface SafetyValidationResult {
  allowed: boolean;
  reason: string;
  violations: string[];
  safetyLevel: 'SAFE' | 'CAUTION' | 'UNSAFE';
}
import { KeycloakAuthService } from './keycloak-auth.js';

export class PostgRESTClient {
  private config: PostgRESTConfig;
  private authService: KeycloakAuthService;
  private readOnlyMode: boolean;
  private allowedOperations: Set<string>;

  constructor(config: PostgRESTConfig, readOnlyMode: boolean = false) {
    this.config = config;
    this.authService = new KeycloakAuthService(config.keycloak);
    this.readOnlyMode = readOnlyMode;
    this.allowedOperations = new Set(readOnlyMode ? ['SELECT'] : ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'UPSERT']);
  }

  async executeQuery(query: PostgRESTQuery, options?: { bypassSafetyChecks?: boolean }): Promise<PostgRESTExecutionResult> {
    const startTime = Date.now();
    
    try {
      // Perform safety checks unless bypassed
      if (!options?.bypassSafetyChecks) {
        const safetyCheck = this.validateQuerySafety(query);
        if (!safetyCheck.allowed) {
          return {
            success: false,
            error: {
              code: 'SAFETY_VIOLATION',
              message: safetyCheck.reason,
              details: safetyCheck.violations.join(', ')
            },
            executionTime: 0,
            queryUrl: '',
          };
        }
      }
      
      const token = await this.authService.getAccessToken();
      const url = this.buildUrl(query);
      const requestOptions = await this.buildRequestOptions(query, token);
      
      const response = await fetch(url, requestOptions);
      const executionTime = Date.now() - startTime;
      
      if (!response.ok) {
        const error = await this.parseError(response);
        return {
          success: false,
          error,
          executionTime,
          queryUrl: url,
        };
      }

      const data = await response.json();
      const count = this.extractCount(response);
      
      return {
        success: true,
        data,
        count,
        executionTime,
        queryUrl: url,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown network error',
        },
        executionTime,
        queryUrl: '',
      };
    }
  }

  private buildUrl(query: PostgRESTQuery): string {
    const baseUrl = `${this.config.endpoint}/${query.table}`;
    const params = new URLSearchParams();

    // Add select clause
    if (query.select && query.select.length > 0) {
      params.append('select', query.select.join(','));
    }

    // Add filters
    if (query.filters) {
      for (const filter of query.filters) {
        const filterKey = filter.negate ? `${filter.column}.not.${filter.operator}` : `${filter.column}.${filter.operator}`;
        params.append(filterKey, this.formatFilterValue(filter.value));
      }
    }

    // Add ordering
    if (query.orderBy && query.orderBy.length > 0) {
      const orderStrings = query.orderBy.map(order => {
        let orderStr = order.column;
        if (!order.ascending) orderStr += '.desc';
        if (order.nullsFirst) orderStr += '.nullsfirst';
        return orderStr;
      });
      params.append('order', orderStrings.join(','));
    }

    // Add limit and offset
    if (query.limit !== undefined) {
      params.append('limit', query.limit.toString());
    }
    if (query.offset !== undefined) {
      params.append('offset', query.offset.toString());
    }

    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }

  private async buildRequestOptions(query: PostgRESTQuery, token: string): Promise<RequestInit> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    let method = 'GET';
    let body: string | undefined;

    switch (query.operation) {
      case 'SELECT':
        method = 'GET';
        headers['Prefer'] = 'count=exact';
        break;
      
      case 'INSERT':
        method = 'POST';
        headers['Prefer'] = 'return=representation';
        body = JSON.stringify(query.data);
        break;
      
      case 'UPDATE':
        method = 'PATCH';
        headers['Prefer'] = 'return=representation';
        body = JSON.stringify(query.data);
        break;
      
      case 'DELETE':
        method = 'DELETE';
        headers['Prefer'] = 'return=representation';
        break;
      
      case 'UPSERT':
        method = 'POST';
        headers['Prefer'] = 'return=representation';
        if (query.upsert?.onConflict) {
          headers['Prefer'] += `,resolution=merge-duplicates`;
        }
        if (query.upsert?.ignoreDuplicates) {
          headers['Prefer'] += `,resolution=ignore-duplicates`;
        }
        body = JSON.stringify(query.data);
        break;
    }

    return {
      method,
      headers,
      body,
    };
  }

  private formatFilterValue(value: any): string {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return value.toString();
    if (typeof value === 'number') return value.toString();
    if (Array.isArray(value)) return `(${value.map(v => this.formatFilterValue(v)).join(',')})`;
    return value.toString();
  }

  private extractCount(response: Response): number | undefined {
    const contentRange = response.headers.get('content-range');
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)$/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    return undefined;
  }

  private async parseError(response: Response): Promise<PostgRESTError> {
    try {
      const errorData = await response.json();
      return {
        code: errorData.code || response.status.toString(),
        message: errorData.message || response.statusText,
        details: errorData.details,
        hint: errorData.hint,
      };
    } catch {
      return {
        code: response.status.toString(),
        message: response.statusText,
      };
    }
  }

  async getMetadata(): Promise<PostgRESTMetadata> {
    try {
      const token = await this.authService.getAccessToken();
      const response = await fetch(`${this.config.endpoint}/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/openapi+json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get metadata: ${response.status} ${response.statusText}`);
      }

      const openapi = await response.json();
      
      return {
        tables: Object.keys(openapi.paths || {}),
        views: [], // PostgREST doesn't distinguish views in OpenAPI
        functions: Object.keys(openapi.paths || {}).filter(path => path.startsWith('/rpc/')),
        totalRows: {},
        lastUpdated: new Date(),
      };
    } catch (error) {
      throw new Error(`Failed to get PostgREST metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const token = await this.authService.getAccessToken();
      const response = await fetch(`${this.config.endpoint}/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async callRPC(functionName: string, params: Record<string, any> = {}): Promise<PostgRESTExecutionResult> {
    const startTime = Date.now();
    
    try {
      const token = await this.authService.getAccessToken();
      const url = `${this.config.endpoint}/rpc/${functionName}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });
      
      const executionTime = Date.now() - startTime;
      
      if (!response.ok) {
        const error = await this.parseError(response);
        return {
          success: false,
          error,
          executionTime,
          queryUrl: url,
        };
      }

      const data = await response.json();
      
      return {
        success: true,
        data,
        executionTime,
        queryUrl: url,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown network error',
        },
        executionTime,
        queryUrl: '',
      };
    }
  }

  validateQuerySafety(query: PostgRESTQuery): SafetyValidationResult {
    const violations: string[] = [];
    let allowed = true;
    let reason = '';

    // Check if operation is allowed
    if (!this.allowedOperations.has(query.operation)) {
      violations.push(`Operation '${query.operation}' is not allowed`);
      allowed = false;
      reason = `Operation '${query.operation}' is not permitted in current mode`;
    }

    // Check for read-only mode violations
    if (this.readOnlyMode && query.operation !== 'SELECT') {
      violations.push(`Read-only mode enabled: ${query.operation} operations are prohibited`);
      allowed = false;
      reason = `Read-only mode is enabled. Only SELECT operations are allowed.`;
    }

    // Check for potentially dangerous queries
    if (query.operation === 'DELETE' && (!query.filters || query.filters.length === 0)) {
      violations.push('DELETE operation without filters could affect all records');
      allowed = false;
      reason = 'DELETE operations require filters to prevent accidental data loss';
    }

    if (query.operation === 'UPDATE' && (!query.filters || query.filters.length === 0)) {
      violations.push('UPDATE operation without filters could affect all records');
      allowed = false;
      reason = 'UPDATE operations require filters to prevent accidental data modification';
    }

    return {
      allowed,
      reason,
      violations,
      safetyLevel: this.calculateSafetyLevel(query, violations)
    };
  }

  private calculateSafetyLevel(query: PostgRESTQuery, violations: string[]): 'SAFE' | 'CAUTION' | 'UNSAFE' {
    if (violations.length > 0) {
      return 'UNSAFE';
    }

    if (query.operation !== 'SELECT') {
      return 'CAUTION';
    }

    // Check for potentially expensive SELECT operations
    if (!query.limit && (!query.filters || query.filters.length === 0)) {
      return 'CAUTION';
    }

    return 'SAFE';
  }

  setReadOnlyMode(enabled: boolean): void {
    this.readOnlyMode = enabled;
    this.allowedOperations = new Set(enabled ? ['SELECT'] : ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'UPSERT']);
  }

  isInReadOnlyMode(): boolean {
    return this.readOnlyMode;
  }

  setAllowedOperations(operations: string[]): void {
    this.allowedOperations = new Set(operations);
  }

  getAllowedOperations(): string[] {
    return Array.from(this.allowedOperations);
  }
}