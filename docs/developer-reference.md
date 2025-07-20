# Developer Reference: Complete Tool Catalog & Integration Guide

## Overview

The **PostgreSQL Schema Sage & PostgREST Query Maker** provides 11 comprehensive MCP tools organized into three categories: PostgreSQL Migration Tools, PostgREST Query Tools, and Database Utility Tools. This reference provides complete specifications, parameters, and integration examples for each tool.

## Tool Categories

### 1. PostgreSQL Migration Tools (6 tools)
- `analyze_schema` - AI-enhanced schema analysis with Gemini optimization
- `analyze_migrations` - Migration file parsing and pattern analysis
- `compare_schema_migrations` - Schema drift detection and analysis
- `generate_migration` - Create dbmate-compatible migration files
- `preview_migration` - Preview migration content without saving
- `get_database_object_definition` - Get specific database object definitions

### 2. PostgREST Query Tools (4 tools)
- `postgrest_generate_query` - Natural language to PostgREST query conversion
- `postgrest_execute_query` - Execute PostgREST queries with authentication
- `postgrest_schema_info` - Get PostgREST API documentation and endpoints
- `postgrest_test_connection` - Validate PostgREST and Keycloak connectivity

### 3. Database Utility Tools (1 tool)
- `execute_sql_query` - Safe execution of SELECT and read-only queries

## PostgreSQL Migration Tools

### 1. analyze_schema

**Purpose**: Extract and analyze PostgreSQL database schema with AI-enhanced optimization for large databases.

**Schema Definition**:
```typescript
const analyzeSchemaSchema = z.object({
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
```

**Parameters**:
- `includeSystemSchemas` (boolean): Include PostgreSQL system schemas (pg_catalog, information_schema)
- `tableFilter` (string): Filter tables by name pattern (e.g., "user", "order")
- `schemaFilter` (string): Filter by schema name (e.g., "public", "auth")
- `useGeminiSummarization` (boolean): Enable AI-powered schema summarization for large databases
- `useGeminiLargeSchemaFiltering` (boolean): Use Gemini for intelligent object filtering
- `geminiObjectTypeFilter` (enum): Focus AI filtering on specific object types
- `analysisIntent` (enum): Optimize analysis for specific use case
- `maxTables` (number): Maximum tables to include in response (1-50)
- `maxViews` (number): Maximum views to include in response (1-20)
- `returnFullSchema` (boolean): Include complete schema in response
- `maxResponseSizeKB` (number): Maximum response size in KB (10-500)

**Example Usage**:
```json
{
  "includeSystemSchemas": false,
  "tableFilter": "user",
  "useGeminiSummarization": true,
  "analysisIntent": "migration_analysis",
  "maxTables": 25,
  "maxResponseSizeKB": 150
}
```

**Response Structure**:
```json
{
  "success": true,
  "data": {
    "analysis": {
      "databaseOverview": {
        "totalTables": 155,
        "totalViews": 12,
        "totalFunctions": 8,
        "keyBusinessTables": ["app_user", "organizations", "projects"],
        "relationships": ["app_user.organization_id -> organizations.id"]
      },
      "coreEntities": [
        {
          "name": "app_user",
          "schema": "public",
          "primaryKey": "id",
          "foreignKeys": [
            {
              "column": "organization_id",
              "referencedTable": "organizations",
              "referencedColumn": "id"
            }
          ],
          "columnCount": 12,
          "hasIndexes": true
        }
      ],
      "schemaMetrics": {
        "originalBytes": 2500000,
        "filteredBytes": 350000,
        "compressionRatio": 86,
        "geminiEnhanced": true
      }
    },
    "insights": {
      "insights": ["Database contains 25 core business entities"],
      "recommendations": ["Consider using views for complex queries"],
      "queryPatterns": ["Optimized for migration_analysis operations"]
    }
  }
}
```

### 2. analyze_migrations

**Purpose**: Parse and analyze existing dbmate migration files to understand patterns and history.

**Schema Definition**:
```typescript
const analyzeMigrationsSchema = z.object({
  includeContent: z.boolean().default(false),
  migrationsTable: z.string().default("schema_migrations"),
  validateStructure: z.boolean().default(true),
  includePending: z.boolean().default(true)
});
```

**Parameters**:
- `includeContent` (boolean): Include full migration file content in response
- `migrationsTable` (string): Name of the migrations tracking table
- `validateStructure` (boolean): Validate migration file structure (up/down sections)
- `includePending` (boolean): Include migrations not yet applied to database

**Example Usage**:
```json
{
  "includeContent": true,
  "migrationsTable": "schema_migrations",
  "validateStructure": true,
  "includePending": false
}
```

**Response Structure**:
```json
{
  "migrations": [
    {
      "filename": "20240131120000_add_email_verification.sql",
      "version": "20240131120000",
      "name": "add email verification",
      "applied": true,
      "appliedAt": "2024-01-31T12:00:00Z",
      "hasValidStructure": true,
      "upSql": "ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;",
      "downSql": "ALTER TABLE users DROP COLUMN email_verified;",
      "errors": []
    }
  ],
  "summary": {
    "totalMigrations": 15,
    "appliedMigrations": 12,
    "pendingMigrations": 3,
    "invalidMigrations": 0,
    "patterns": {
      "commonOperations": ["ALTER TABLE", "CREATE INDEX", "CREATE TABLE"],
      "namingConventions": "timestamp_descriptive_name",
      "averageSize": "2.5KB"
    }
  }
}
```

### 3. compare_schema_migrations

**Purpose**: Compare current database schema with applied migrations to detect schema drift.

**Schema Definition**:
```typescript
const compareSchemaMigrationsSchema = z.object({
  migrationsTable: z.string().default("schema_migrations"),
  includeDetails: z.boolean().default(true),
  checkRLSPolicies: z.boolean().default(true),
  checkTriggers: z.boolean().default(true),
  checkIndexes: z.boolean().default(true)
});
```

**Parameters**:
- `migrationsTable` (string): Migrations tracking table name
- `includeDetails` (boolean): Include detailed comparison information
- `checkRLSPolicies` (boolean): Include Row Level Security policies in comparison
- `checkTriggers` (boolean): Include triggers in drift detection
- `checkIndexes` (boolean): Include indexes in comparison

**Example Usage**:
```json
{
  "migrationsTable": "schema_migrations",
  "includeDetails": true,
  "checkRLSPolicies": true,
  "checkTriggers": true
}
```

**Response Structure**:
```json
{
  "driftDetected": true,
  "summary": {
    "tablesInSync": 145,
    "tablesWithDrift": 3,
    "extraIndexes": 5,
    "missingConstraints": 1,
    "rlsPolicyDifferences": 2
  },
  "details": {
    "extraObjects": [
      {
        "type": "index",
        "name": "idx_users_email_manual",
        "table": "users",
        "reason": "Exists in database but not in migrations"
      }
    ],
    "missingObjects": [
      {
        "type": "constraint",
        "name": "fk_user_sessions_user_id",
        "table": "user_sessions",
        "reason": "Defined in migrations but missing from database"
      }
    ],
    "recommendations": [
      "Create migration to formalize manually added indexes",
      "Add missing foreign key constraint to user_sessions table"
    ]
  }
}
```

### 4. generate_migration

**Purpose**: Create new dbmate-compatible migration files with proper timestamp and structure.

**Schema Definition**:
```typescript
const generateMigrationSchema = z.object({
  name: z.string().describe("Migration name (will be sanitized)"),
  upSql: z.string().describe("SQL for the up migration"),
  downSql: z.string().describe("SQL for the down migration"),
  saveToFile: z.boolean().default(true),
  validateSql: z.boolean().default(true),
  format: z.enum(["formatted", "minified"]).default("formatted")
});
```

**Parameters**:
- `name` (string): Descriptive name for the migration (auto-sanitized)
- `upSql` (string): SQL commands for applying the migration
- `downSql` (string): SQL commands for rolling back the migration
- `saveToFile` (boolean): Whether to save migration to filesystem
- `validateSql` (boolean): Validate SQL syntax before saving
- `format` (enum): Output format for generated migration file

**Example Usage**:
```json
{
  "name": "add user email verification",
  "upSql": "ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;",
  "downSql": "ALTER TABLE users DROP COLUMN email_verified;",
  "saveToFile": true,
  "validateSql": true
}
```

**Response Structure**:
```json
{
  "filename": "20240131120000_add_user_email_verification.sql",
  "filepath": "/path/to/migrations/20240131120000_add_user_email_verification.sql",
  "content": "-- migrate:up\nALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;\n\n-- migrate:down\nALTER TABLE users DROP COLUMN email_verified;",
  "version": "20240131120000",
  "saved": true,
  "validation": {
    "sqlValid": true,
    "hasUpSection": true,
    "hasDownSection": true,
    "warnings": []
  }
}
```

### 5. preview_migration

**Purpose**: Preview generated migration content without saving to filesystem.

**Schema Definition**:
```typescript
const previewMigrationSchema = z.object({
  name: z.string(),
  upSql: z.string(),
  downSql: z.string(),
  format: z.enum(["formatted", "raw"]).default("formatted"),
  includeAnalysis: z.boolean().default(true)
});
```

**Parameters**:
- `name` (string): Migration name for preview
- `upSql` (string): Up migration SQL
- `downSql` (string): Down migration SQL  
- `format` (enum): Preview format (formatted with syntax highlighting or raw)
- `includeAnalysis` (boolean): Include impact analysis in preview

**Example Usage**:
```json
{
  "name": "add user profile fields",
  "upSql": "ALTER TABLE users ADD COLUMN bio TEXT, ADD COLUMN avatar_url TEXT;",
  "downSql": "ALTER TABLE users DROP COLUMN bio, DROP COLUMN avatar_url;",
  "format": "formatted",
  "includeAnalysis": true
}
```

### 6. get_database_object_definition

**Purpose**: Retrieve complete definition of specific database objects (tables, views, functions, etc.).

**Schema Definition**:
```typescript
const getDatabaseObjectDefinitionSchema = z.object({
  objectName: z.string(),
  objectType: z.enum(['table', 'view', 'function', 'trigger', 'policy', 'index', 'constraint']).optional(),
  schema: z.string().default('public'),
  includeRelated: z.boolean().default(false),
  format: z.enum(['sql', 'json']).default('sql')
});
```

**Parameters**:
- `objectName` (string): Name of the database object
- `objectType` (enum): Type of object (auto-detected if not specified)
- `schema` (string): Schema containing the object
- `includeRelated` (boolean): Include related objects (triggers, indexes, etc.)
- `format` (enum): Response format (SQL DDL or JSON structure)

**Example Usage**:
```json
{
  "objectName": "app_user",
  "objectType": "table",
  "schema": "public",
  "includeRelated": true,
  "format": "sql"
}
```

## PostgREST Query Tools

### 1. postgrest_generate_query

**Purpose**: Convert natural language descriptions into PostgREST API queries with authentication and optimization.

**Schema Definition**:
```typescript
const PostgRESTGenerateQuerySchema = z.object({
  description: z.string().describe('Natural language description of the query'),
  tables: z.array(z.string()).optional().describe('Specific tables to focus on'),
  expectedOutput: z.enum(['json', 'csv', 'count']).optional().describe('Expected output format'),
  includeMetadata: z.boolean().optional().describe('Include metadata in response'),
  maxRows: z.number().optional().describe('Maximum number of rows to return')
});
```

**Parameters**:
- `description` (string): Natural language description of desired query
- `tables` (array): Specific tables to focus the query on
- `expectedOutput` (enum): Preferred response format from PostgREST
- `includeMetadata` (boolean): Include count and pagination metadata
- `maxRows` (number): Limit result set size

**Example Usage**:
```json
{
  "description": "Get all active users with their recent orders and client information",
  "tables": ["app_user", "orders", "clients"],
  "expectedOutput": "json",
  "includeMetadata": true,
  "maxRows": 100
}
```

**Response Structure**:
```json
{
  "query": {
    "operation": "SELECT",
    "endpoint": "/app_user",
    "select": "*,orders(*),client_user(client(*))",
    "filters": "status=eq.active",
    "ordering": "created_at.desc",
    "pagination": "limit=100"
  },
  "url": "https://api.example.com/app_user?select=*,orders(*),client_user(client(*))&status=eq.active&order=created_at.desc&limit=100",
  "httpMethod": "GET",
  "headers": {
    "Authorization": "Bearer <token>",
    "Content-Type": "application/json",
    "Prefer": "count=exact"
  },
  "explanation": "Fetches active users with embedded order history and client relationships",
  "estimatedRows": 250,
  "requiredPermissions": ["read:app_user", "read:orders", "read:clients"],
  "potentialIssues": ["Large result set - consider pagination"]
}
```

### 2. postgrest_execute_query

**Purpose**: Execute PostgREST queries with full Keycloak authentication and error handling.

**Schema Definition**:
```typescript
const PostgRESTExecuteQuerySchema = z.object({
  query: z.string().describe('PostgREST query URL or endpoint'),
  method: z.enum(['GET', 'POST', 'PATCH', 'DELETE']).default('GET'),
  body: z.object({}).optional().describe('Request body for POST/PATCH'),
  headers: z.record(z.string()).optional().describe('Additional headers'),
  timeout: z.number().default(30000).describe('Request timeout in milliseconds')
});
```

**Parameters**:
- `query` (string): Complete PostgREST query URL or just the endpoint path
- `method` (enum): HTTP method for the request
- `body` (object): Request body for data modification operations
- `headers` (object): Additional headers beyond authentication
- `timeout` (number): Request timeout in milliseconds

**Example Usage**:
```json
{
  "query": "/app_user?select=*&status=eq.active&limit=10",
  "method": "GET",
  "headers": {
    "Prefer": "count=exact"
  },
  "timeout": 15000
}
```

### 3. postgrest_schema_info

**Purpose**: Get PostgREST schema information, endpoint documentation, and API specifications.

**Schema Definition**:
```typescript
const PostgRESTSchemaInfoSchema = z.object({
  endpoint: z.string().optional().describe('Specific endpoint to analyze'),
  includeOpenAPI: z.boolean().default(false).describe('Include OpenAPI specification'),
  format: z.enum(['json', 'yaml']).default('json').describe('Response format')
});
```

**Parameters**:
- `endpoint` (string): Specific endpoint to get detailed information about
- `includeOpenAPI` (boolean): Generate OpenAPI specification for the API
- `format` (enum): Response format preference

### 4. postgrest_test_connection

**Purpose**: Validate PostgREST endpoint connectivity and Keycloak authentication.

**Schema Definition**:
```typescript
const PostgRESTTestConnectionSchema = z.object({
  includeAuth: z.boolean().default(true).describe('Test authentication'),
  testEndpoint: z.string().optional().describe('Specific endpoint to test'),
  verbose: z.boolean().default(false).describe('Include detailed connection info')
});
```

## Database Utility Tools

### 1. execute_sql_query

**Purpose**: Execute safe, read-only SQL queries for analysis and debugging.

**Schema Definition**:
```typescript
const executeSqlQuerySchema = z.object({
  query: z.string().describe("SQL query to execute (SELECT only)"),
  limit: z.number().default(100).describe("Maximum rows to return"),
  format: z.enum(["table", "json", "csv"]).default("table").describe("Output format"),
  timeout: z.number().default(30000).describe("Query timeout in milliseconds")
});
```

**Parameters**:
- `query` (string): SQL SELECT query to execute
- `limit` (number): Maximum number of rows in response
- `format` (enum): Response format for results
- `timeout` (number): Query execution timeout

**Security Note**: This tool only allows SELECT statements and other read-only operations. INSERT, UPDATE, DELETE, and DDL statements are blocked for safety.

## Integration Examples

### Claude Desktop Integration

**MCP Configuration** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "postgresql-schema-sage": {
      "command": "node",
      "args": ["/path/to/migration_server/build/index.js"],
      "env": {
        "DB_HOST": "localhost",
        "DB_PORT": "5432",
        "DB_NAME": "myapp_production",
        "DB_USER": "postgres",
        "DB_PASSWORD": "secure_password",
        "GEMINI_API_KEY": "your_gemini_key",
        "POSTGREST_ENDPOINT": "https://api.myapp.com",
        "KEYCLOAK_URL": "https://auth.myapp.com"
      }
    }
  }
}
```

### Programmatic Integration

**Node.js Example**:
```typescript
import { McpClient } from '@modelcontextprotocol/sdk/client/mcp.js';

const client = new McpClient();

// Analyze database schema
const schemaAnalysis = await client.callTool('analyze_schema', {
  useGeminiSummarization: true,
  analysisIntent: 'migration_analysis',
  maxTables: 30
});

// Generate PostgREST query
const postgrestQuery = await client.callTool('postgrest_generate_query', {
  description: 'Get all orders from last month with customer details',
  expectedOutput: 'json',
  maxRows: 500
});

// Execute the generated query
const results = await client.callTool('postgrest_execute_query', {
  query: postgrestQuery.url,
  method: 'GET'
});
```

### Custom Integration Scripts

**Migration Automation Script**:
```bash
#!/bin/bash
# Automated migration workflow

# 1. Analyze current schema
claude_mcp_tool analyze_schema '{"analysisIntent": "migration_analysis"}'

# 2. Check for drift
claude_mcp_tool compare_schema_migrations '{"includeDetails": true}'

# 3. Generate migration (user provides SQL)
claude_mcp_tool generate_migration '{
  "name": "add_user_preferences",
  "upSql": "ALTER TABLE users ADD COLUMN preferences JSONB DEFAULT \"{}\"",
  "downSql": "ALTER TABLE users DROP COLUMN preferences"
}'
```

**API Query Generation Workflow**:
```python
import mcp_client

def generate_dashboard_queries():
    """Generate multiple queries for dashboard"""
    
    queries = [
        "Get monthly active users count",
        "Show top 10 customers by revenue",
        "List pending orders with customer info",
        "Get product sales by category"
    ]
    
    results = []
    for description in queries:
        query = mcp_client.call_tool('postgrest_generate_query', {
            'description': description,
            'expectedOutput': 'json',
            'includeMetadata': True
        })
        results.append(query)
    
    return results
```

## Error Handling

### Common Error Patterns

**Database Connection Errors**:
```json
{
  "error": "Database service not available",
  "code": "DB_CONNECTION_FAILED",
  "message": "Please check your database configuration",
  "details": {
    "host": "localhost",
    "port": 5432,
    "database": "myapp",
    "ssl": false
  }
}
```

**Gemini Service Errors**:
```json
{
  "error": "Gemini enhancement failed",
  "code": "GEMINI_API_ERROR", 
  "message": "Falling back to local schema analysis",
  "fallback": true
}
```

**PostgREST Authentication Errors**:
```json
{
  "error": "Keycloak authentication failed",
  "code": "AUTH_FAILED",
  "message": "Invalid credentials or token expired",
  "suggestion": "Check KEYCLOAK_USERNAME and KEYCLOAK_PASSWORD"
}
```

### Tool-Specific Error Handling

Each tool implements comprehensive error handling:

- **Validation Errors**: Invalid parameters are caught by Zod schemas
- **Database Errors**: Connection issues and SQL errors are gracefully handled
- **Service Errors**: AI and API service failures fall back to local processing
- **Permission Errors**: Authentication and authorization failures provide clear guidance

## Performance Considerations

### Schema Analysis Optimization

- **Large Databases**: Use `useGeminiSummarization` for databases with 50+ tables
- **Targeted Analysis**: Use `tableFilter` and `schemaFilter` to focus on relevant objects
- **Response Size**: Set appropriate `maxResponseSizeKB` to balance detail and performance

### PostgREST Query Optimization

- **Pagination**: Always include `maxRows` parameter for large datasets
- **Index Awareness**: Generated queries leverage available database indexes
- **Selective Fields**: Specify exact fields needed rather than using `*`

### Migration Performance

- **CONCURRENTLY Operations**: All index operations use `CONCURRENTLY` by default
- **Chunked Updates**: Large data migrations are split into manageable chunks
- **Non-blocking Changes**: Prefer additive changes over destructive operations

## Conclusion

The **PostgreSQL Schema Sage & PostgREST Query Maker** provides a comprehensive toolkit for database development workflows. With 11 specialized tools covering migration management, API query generation, and database analysis, it transforms complex database operations into simple, AI-enhanced workflows.

Key benefits for developers:

- **Complete Coverage**: Tools for every aspect of database development
- **AI Enhancement**: Intelligent analysis and optimization for large schemas
- **Safety First**: Built-in validation and safety mechanisms
- **Production Ready**: Comprehensive error handling and performance optimization
- **Flexible Integration**: Works with Claude Desktop, custom scripts, and programmatic interfaces

This toolset enables developers to work confidently with complex PostgreSQL databases while maintaining the highest standards of safety, performance, and code quality.