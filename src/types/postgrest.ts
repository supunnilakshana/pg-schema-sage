export interface PostgRESTConfig {
  endpoint: string;
  keycloak: KeycloakConfig;
}

export interface KeycloakConfig {
  url: string;
  clientId: string;
  username: string;
  password: string;
  realm?: string;
}

export interface KeycloakToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface PostgRESTQuery {
  table: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT';
  select?: string[];
  filters?: PostgRESTFilter[];
  orderBy?: PostgRESTOrder[];
  limit?: number;
  offset?: number;
  data?: Record<string, any>;
  upsert?: {
    onConflict?: string;
    ignoreDuplicates?: boolean;
  };
}

export interface PostgRESTFilter {
  column: string;
  operator: PostgRESTOperator;
  value: any;
  negate?: boolean;
}

export type PostgRESTOperator = 
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'like' | 'ilike' | 'match' | 'imatch'
  | 'in' | 'is' | 'fts' | 'plfts' | 'phfts' | 'wfts'
  | 'cs' | 'cd' | 'ov' | 'sl' | 'sr' | 'nxr' | 'nxl' | 'adj';

export interface PostgRESTOrder {
  column: string;
  ascending?: boolean;
  nullsFirst?: boolean;
}

export interface PostgRESTResponse<T = any> {
  data: T[];
  count?: number;
  error?: PostgRESTError;
}

export interface PostgRESTError {
  code: string;
  message: string;
  details?: string;
  hint?: string;
}

export interface PostgRESTSchemaDefinition {
  table: string;
  schema: string;
  columns: PostgRESTColumn[];
  primaryKey?: string[];
  foreignKeys: PostgRESTForeignKey[];
  indexes: PostgRESTIndex[];
  permissions: PostgRESTPermission[];
}

export interface PostgRESTColumn {
  name: string;
  type: string;
  nullable: boolean;
  default?: string;
  description?: string;
  isGenerated?: boolean;
  isIdentity?: boolean;
}

export interface PostgRESTForeignKey {
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
  constraintName: string;
}

export interface PostgRESTIndex {
  name: string;
  columns: string[];
  unique: boolean;
  method: string;
}

export interface PostgRESTPermission {
  role: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  columns?: string[];
  check?: string;
  using?: string;
}

export interface QueryGenerationRequest {
  description: string;
  tables?: string[];
  expectedOutput?: 'json' | 'csv' | 'count';
  includeMetadata?: boolean;
  maxRows?: number;
}

export interface QueryGenerationResponse {
  query: PostgRESTQuery;
  url: string;
  explanation: string;
  estimatedRows?: number;
  requiredPermissions: string[];
  potentialIssues?: string[];
  isReadOnly?: boolean;
  safetyLevel?: 'SAFE' | 'CAUTION' | 'UNSAFE';
}

export interface PostgRESTExecutionResult {
  success: boolean;
  data?: any;
  count?: number;
  error?: PostgRESTError;
  executionTime: number;
  queryUrl: string;
}

export interface PostgRESTMetadata {
  tables: string[];
  views: string[];
  functions: string[];
  totalRows: Record<string, number>;
  lastUpdated: Date;
}

export interface SystemPromptContext {
  availableTables: PostgRESTSchemaDefinition[];
  userRoles: string[];
  commonQueries: string[];
  bestPractices: string[];
}