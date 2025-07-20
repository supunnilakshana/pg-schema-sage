import { 
  PostgRESTQuery, 
  PostgRESTSchemaDefinition, 
  QueryGenerationRequest, 
  QueryGenerationResponse,
  SystemPromptContext,
  PostgRESTFilter,
  PostgRESTOrder
} from '../types/postgrest.js';

export interface QuerySafetyResult {
  isReadOnly: boolean;
  safetyLevel: 'SAFE' | 'CAUTION' | 'UNSAFE';
  issues: string[];
  warnings: string[];
  allowedInReadOnlyMode: boolean;
}

export class PostgRESTQueryGenerator {
  private schemaDefinitions: PostgRESTSchemaDefinition[];
  private systemPrompt: string;
  private readOnlyMode: boolean;

  constructor(schemaDefinitions: PostgRESTSchemaDefinition[], readOnlyMode: boolean = false) {
    this.schemaDefinitions = schemaDefinitions;
    this.readOnlyMode = readOnlyMode;
    this.systemPrompt = this.generateSystemPrompt();
  }

  private generateSystemPrompt(): string {
    const tableInfo = this.schemaDefinitions.map(def => {
      const columns = def.columns.map(col => 
        `${col.name} (${col.type}${col.nullable ? ', nullable' : ', not null'}${col.default ? `, default: ${col.default}` : ''})`
      ).join(', ');
      
      const foreignKeys = def.foreignKeys.map(fk => 
        `${fk.columnName} -> ${fk.referencedTable}.${fk.referencedColumn}`
      ).join(', ');

      return `Table: ${def.table}
Schema: ${def.schema}
Columns: ${columns}
Primary Key: ${def.primaryKey?.join(', ') || 'none'}
Foreign Keys: ${foreignKeys || 'none'}
Indexes: ${def.indexes.map(idx => `${idx.name} (${idx.columns.join(', ')})`).join(', ') || 'none'}`;
    }).join('\n\n');

    return `You are a PostgREST query generator. Your task is to generate PostgREST API queries based on natural language descriptions.

## Available Database Schema:
${tableInfo}

## PostgREST Query Syntax:
- SELECT: GET /table?select=col1,col2&filter=value
- INSERT: POST /table with JSON body
- UPDATE: PATCH /table?filter=value with JSON body
- DELETE: DELETE /table?filter=value
- UPSERT: POST /table with prefer header

## Common Filters:
- eq: column=eq.value (equals)
- neq: column=neq.value (not equals)
- gt: column=gt.value (greater than)
- gte: column=gte.value (greater than or equal)
- lt: column=lt.value (less than)
- lte: column=lte.value (less than or equal)
- like: column=like.*pattern* (pattern matching)
- ilike: column=ilike.*pattern* (case-insensitive pattern matching)
- in: column=in.(value1,value2,value3) (in list)
- is: column=is.null or column=is.true/false
- not: column=not.eq.value (negation)

## Ordering:
- order=column (ascending)
- order=column.desc (descending)
- order=column.asc.nullsfirst (nulls first)

## Examples:
1. Get all users: GET /users
2. Get user by ID: GET /users?id=eq.123
3. Get users with pagination: GET /users?limit=10&offset=20
4. Create user: POST /users with {"name": "John", "email": "john@example.com"}
5. Update user: PATCH /users?id=eq.123 with {"name": "Jane"}
6. Delete user: DELETE /users?id=eq.123
7. Search users: GET /users?name=ilike.*john*
8. Get users with orders: GET /users?select=*,orders(*)
9. Get users with orders and profiles: GET /users?select=*,orders(*),profiles(*)
10. Get orders with customer details: GET /orders?select=*,customers(*)
11. Filter by date: GET /orders?created_at=gte.2023-01-01
12. Complex filter: GET /products?price=gte.100&category=eq.electronics&in_stock=is.true
13. Nested relationships: GET /users?select=name,email,orders(id,total,items(*))

## Best Practices:
- Use specific column selection instead of * when possible
- Add appropriate filters to limit results
- Use indexes for efficient querying
- Consider pagination for large datasets
- Use proper data types in filters
- Handle null values appropriately

## Response Format:
Generate a structured PostgREST query with:
1. HTTP method and endpoint
2. Query parameters
3. Request body (if applicable)
4. Expected response structure
5. Explanation of the query logic

When generating queries, consider:
- Data relationships (foreign keys) and auto-detect joins from natural language
- Query performance (use indexes)
- Security (validate inputs)
- Error handling
- Pagination needs
- Embedded resource syntax for related data (table_name(columns))
- Deep nesting capabilities for complex relationships`;
  }

  async generateQuery(request: QueryGenerationRequest): Promise<QueryGenerationResponse> {
    const analysis = this.analyzeRequest(request);
    const query = this.buildQuery(analysis);
    const url = this.buildUrl(query);
    
    return {
      query,
      url,
      explanation: this.generateExplanation(query, analysis),
      estimatedRows: this.estimateRows(query, analysis),
      requiredPermissions: this.getRequiredPermissions(query),
      potentialIssues: this.identifyPotentialIssues(query, analysis),
    };
  }

  private analyzeRequest(request: QueryGenerationRequest): RequestAnalysis {
    const description = request.description.toLowerCase();
    
    // Determine operation type
    let operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT' = 'SELECT';
    if (description.includes('create') || description.includes('insert') || description.includes('add')) {
      operation = 'INSERT';
    } else if (description.includes('update') || description.includes('modify') || description.includes('change')) {
      operation = 'UPDATE';
    } else if (description.includes('delete') || description.includes('remove')) {
      operation = 'DELETE';
    } else if (description.includes('upsert') || description.includes('insert or update')) {
      operation = 'UPSERT';
    }

    // Identify target table
    const targetTable = this.identifyTargetTable(description, request.tables);
    
    // Extract filters
    const filters = this.extractFilters(description);
    
    // Extract columns (with join detection)
    const columns = this.extractColumns(description, targetTable);
    
    // Extract ordering
    const orderBy = this.extractOrderBy(description);
    
    // Extract pagination
    const { limit, offset } = this.extractPagination(description, request.maxRows);

    // Detect relationships and joins
    const relationships = this.analyzeRelationships(description, targetTable);

    return {
      operation,
      table: targetTable,
      columns,
      filters,
      orderBy,
      limit,
      offset,
      description,
      relationships
    };
  }

  private identifyTargetTable(description: string, suggestedTables?: string[]): string {
    // If specific tables are suggested, prioritize them
    if (suggestedTables && suggestedTables.length > 0) {
      for (const table of suggestedTables) {
        if (description.includes(table)) {
          return table;
        }
      }
      return suggestedTables[0];
    }

    // Try to find table names in the description
    for (const schema of this.schemaDefinitions) {
      if (description.includes(schema.table)) {
        return schema.table;
      }
    }

    // Default to first table if none found
    return this.schemaDefinitions[0]?.table || 'unknown';
  }

  private extractFilters(description: string): PostgRESTFilter[] {
    const filters: PostgRESTFilter[] = [];
    
    // Common filter patterns
    const patterns = [
      { regex: /where\s+(\w+)\s*=\s*['"']?([^'"]+)['"']?/gi, operator: 'eq' as const },
      { regex: /(\w+)\s*=\s*['"']?([^'"]+)['"']?/gi, operator: 'eq' as const },
      { regex: /(\w+)\s*>\s*(\d+)/gi, operator: 'gt' as const },
      { regex: /(\w+)\s*<\s*(\d+)/gi, operator: 'lt' as const },
      { regex: /(\w+)\s*>=\s*(\d+)/gi, operator: 'gte' as const },
      { regex: /(\w+)\s*<=\s*(\d+)/gi, operator: 'lte' as const },
      { regex: /(\w+)\s+like\s+['"']([^'"]+)['"']/gi, operator: 'like' as const },
      { regex: /(\w+)\s+contains?\s+['"']([^'"]+)['"']/gi, operator: 'ilike' as const },
      { regex: /(\w+)\s+is\s+null/gi, operator: 'is' as const, value: 'null' },
      { regex: /(\w+)\s+is\s+not\s+null/gi, operator: 'is' as const, value: 'not.null' },
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(description)) !== null) {
        filters.push({
          column: match[1],
          operator: pattern.operator,
          value: pattern.value || match[2],
        });
      }
    }

    return filters;
  }

  private extractColumns(description: string, tableName: string): string[] {
    const tableSchema = this.schemaDefinitions.find(def => def.table === tableName);
    if (!tableSchema) return ['*'];

    // Look for specific column mentions
    const mentionedColumns = tableSchema.columns.filter(col => 
      description.includes(col.name)
    ).map(col => col.name);

    // Check for join/relationship requests
    const joinColumns = this.detectJoinRequests(description, tableName);
    
    if (mentionedColumns.length > 0) {
      // Combine mentioned columns with any detected joins
      return joinColumns.length > 0 ? [...mentionedColumns, ...joinColumns] : mentionedColumns;
    }

    // If joins are detected, include them with base selection
    if (joinColumns.length > 0) {
      return ['*', ...joinColumns];
    }

    // Default selections based on common patterns
    if (description.includes('count')) {
      return ['*']; // Will be handled with count=exact
    }

    return ['*'];
  }

  private extractOrderBy(description: string): PostgRESTOrder[] {
    const orders: PostgRESTOrder[] = [];
    
    const orderPatterns = [
      { regex: /order\s+by\s+(\w+)\s*(asc|desc)?/gi },
      { regex: /sort\s+by\s+(\w+)\s*(asc|desc)?/gi },
      { regex: /sorted?\s+by\s+(\w+)\s*(asc|desc)?/gi },
    ];

    for (const pattern of orderPatterns) {
      let match;
      while ((match = pattern.regex.exec(description)) !== null) {
        orders.push({
          column: match[1],
          ascending: !match[2] || match[2].toLowerCase() === 'asc',
        });
      }
    }

    return orders;
  }

  private extractPagination(description: string, maxRows?: number): { limit?: number; offset?: number } {
    let limit = maxRows;
    let offset: number | undefined;

    // Look for specific pagination mentions
    const limitMatch = description.match(/limit\s+(\d+)/i);
    if (limitMatch) {
      limit = parseInt(limitMatch[1], 10);
    }

    const offsetMatch = description.match(/offset\s+(\d+)/i);
    if (offsetMatch) {
      offset = parseInt(offsetMatch[1], 10);
    }

    const pageMatch = description.match(/page\s+(\d+)/i);
    const pageSizeMatch = description.match(/page\s+size\s+(\d+)/i);
    if (pageMatch && pageSizeMatch) {
      const page = parseInt(pageMatch[1], 10);
      const pageSize = parseInt(pageSizeMatch[1], 10);
      limit = pageSize;
      offset = (page - 1) * pageSize;
    }

    return { limit, offset };
  }

  private buildQuery(analysis: RequestAnalysis): PostgRESTQuery {
    return {
      table: analysis.table,
      operation: analysis.operation,
      select: analysis.columns.length > 0 ? analysis.columns : undefined,
      filters: analysis.filters.length > 0 ? analysis.filters : undefined,
      orderBy: analysis.orderBy.length > 0 ? analysis.orderBy : undefined,
      limit: analysis.limit,
      offset: analysis.offset,
    };
  }

  private buildUrl(query: PostgRESTQuery): string {
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

  private generateExplanation(query: PostgRESTQuery, analysis: RequestAnalysis): string {
    const parts = [
      `This query performs a ${query.operation} operation on the ${query.table} table.`,
    ];

    if (query.select && query.select.length > 0 && !query.select.includes('*')) {
      // Separate regular columns from embedded resources
      const regularColumns = query.select.filter(col => !col.includes('('));
      const embeddedResources = query.select.filter(col => col.includes('('));
      
      if (regularColumns.length > 0) {
        parts.push(`It selects the following columns: ${regularColumns.join(', ')}.`);
      }
      
      if (embeddedResources.length > 0) {
        const resourceDescriptions = embeddedResources.map(resource => {
          const tableName = resource.split('(')[0];
          return `related ${tableName} data`;
        });
        parts.push(`It also includes: ${resourceDescriptions.join(', ')}.`);
      }
    }

    // Add relationship information
    if (analysis.relationships && analysis.relationships.length > 0) {
      const relationshipDescriptions = analysis.relationships.map(rel => 
        `${rel.relatedTable} (${rel.type} relationship, confidence: ${Math.round(rel.confidence * 100)}%)`
      );
      parts.push(`Detected relationships: ${relationshipDescriptions.join(', ')}.`);
    }

    if (query.filters && query.filters.length > 0) {
      const filterDescriptions = query.filters.map(filter => 
        `${filter.column} ${filter.operator} ${filter.value}`
      );
      parts.push(`Filters applied: ${filterDescriptions.join(', ')}.`);
    }

    if (query.orderBy && query.orderBy.length > 0) {
      const orderDescriptions = query.orderBy.map(order => 
        `${order.column} ${order.ascending ? 'ascending' : 'descending'}`
      );
      parts.push(`Results ordered by: ${orderDescriptions.join(', ')}.`);
    }

    if (query.limit) {
      parts.push(`Limited to ${query.limit} results.`);
    }

    if (query.offset) {
      parts.push(`Offset by ${query.offset} records.`);
    }

    return parts.join(' ');
  }

  private detectJoinRequests(description: string, tableName: string): string[] {
    const joinColumns: string[] = [];
    const tableSchema = this.schemaDefinitions.find(def => def.table === tableName);
    if (!tableSchema) return joinColumns;

    // Join patterns in natural language
    const joinPatterns = [
      /with\s+(their|its|the)\s+(\w+)/gi,
      /including\s+(\w+)/gi,
      /and\s+(\w+)\s+data/gi,
      /along\s+with\s+(\w+)/gi,
      /together\s+with\s+(\w+)/gi,
      /(\w+)\s+details/gi,
      /related\s+(\w+)/gi
    ];

    const description_lower = description.toLowerCase();
    
    // Check for explicit mentions of related tables
    for (const relatedSchema of this.schemaDefinitions) {
      if (relatedSchema.table !== tableName && description_lower.includes(relatedSchema.table)) {
        // Check if there's a foreign key relationship
        const hasRelationship = this.findRelationship(tableName, relatedSchema.table);
        if (hasRelationship) {
          joinColumns.push(`${relatedSchema.table}(*)`);
        }
      }
    }

    // Check join patterns and map to actual table relationships
    for (const pattern of joinPatterns) {
      let match;
      while ((match = pattern.exec(description)) !== null) {
        const potentialTable = match[2] || match[1];
        if (potentialTable) {
          // Try to find a matching table (handle plurals)
          const relatedTable = this.findRelatedTableByName(potentialTable, tableName);
          if (relatedTable) {
            joinColumns.push(`${relatedTable}(*)`);
          }
        }
      }
    }

    // Remove duplicates and return
    return [...new Set(joinColumns)];
  }

  private findRelationship(fromTable: string, toTable: string): boolean {
    const fromSchema = this.schemaDefinitions.find(def => def.table === fromTable);
    const toSchema = this.schemaDefinitions.find(def => def.table === toTable);
    
    if (!fromSchema || !toSchema) return false;

    // Check if fromTable has foreign key to toTable
    const hasForeignKey = fromSchema.foreignKeys.some(fk => 
      fk.referencedTable === toTable
    );

    // Check if toTable has foreign key to fromTable
    const hasReverseForeignKey = toSchema.foreignKeys.some(fk => 
      fk.referencedTable === fromTable
    );

    return hasForeignKey || hasReverseForeignKey;
  }

  private findRelatedTableByName(searchName: string, currentTable: string): string | null {
    const searchLower = searchName.toLowerCase();
    
    // Direct match
    let match = this.schemaDefinitions.find(def => 
      def.table.toLowerCase() === searchLower && def.table !== currentTable
    );
    
    if (match && this.findRelationship(currentTable, match.table)) {
      return match.table;
    }

    // Try singular/plural variations
    const variations = [
      searchLower + 's',    // add 's'
      searchLower + 'es',   // add 'es' 
      searchLower.endsWith('s') ? searchLower.slice(0, -1) : searchLower + 's', // toggle 's'
      searchLower.endsWith('ies') ? searchLower.slice(0, -3) + 'y' : searchLower, // handle 'ies' -> 'y'
      searchLower.endsWith('y') ? searchLower.slice(0, -1) + 'ies' : searchLower  // handle 'y' -> 'ies'
    ];

    for (const variation of variations) {
      match = this.schemaDefinitions.find(def => 
        def.table.toLowerCase() === variation && def.table !== currentTable
      );
      
      if (match && this.findRelationship(currentTable, match.table)) {
        return match.table;
      }
    }

    return null;
  }

  private analyzeRelationships(description: string, tableName: string): RelationshipAnalysis[] {
    const relationships: RelationshipAnalysis[] = [];
    const tableSchema = this.schemaDefinitions.find(def => def.table === tableName);
    if (!tableSchema) return relationships;

    // Advanced join detection patterns
    const joinIndicators = [
      // Explicit relationship words
      { pattern: /\b(with|including|along\s+with|together\s+with)\s+(their|its|the)?\s*(\w+)/gi, confidence: 0.9, reason: 'explicit relationship indicator' },
      // Possessive patterns
      { pattern: /(\w+)'s\s+(\w+)/gi, confidence: 0.8, reason: 'possessive relationship' },
      // Detail/info patterns
      { pattern: /(\w+)\s+(details?|info|information|data)/gi, confidence: 0.7, reason: 'detail request' },
      // Association patterns
      { pattern: /\b(and|plus)\s+(their|its|the)?\s*(\w+)/gi, confidence: 0.6, reason: 'association keyword' },
      // Related patterns
      { pattern: /related\s+(\w+)/gi, confidence: 0.8, reason: 'explicit related mention' },
      // Nested patterns
      { pattern: /(\w+)\s+with\s+(\w+)/gi, confidence: 0.7, reason: 'nested relationship' }
    ];

    for (const indicator of joinIndicators) {
      let match;
      while ((match = indicator.pattern.exec(description)) !== null) {
        const potentialTable = this.extractTableFromMatch(match);
        if (potentialTable && potentialTable !== tableName) {
          const relatedTable = this.findRelatedTableByName(potentialTable, tableName);
          if (relatedTable) {
            const relationshipType = this.determineRelationshipType(tableName, relatedTable);
            relationships.push({
              type: relationshipType,
              relatedTable,
              joinColumns: this.getJoinColumns(tableName, relatedTable),
              confidence: indicator.confidence,
              reason: indicator.reason
            });
          }
        }
      }
    }

    // Direct table mentions with relationship verification
    for (const relatedSchema of this.schemaDefinitions) {
      if (relatedSchema.table !== tableName && description.includes(relatedSchema.table)) {
        if (this.findRelationship(tableName, relatedSchema.table)) {
          const relationshipType = this.determineRelationshipType(tableName, relatedSchema.table);
          relationships.push({
            type: relationshipType,
            relatedTable: relatedSchema.table,
            joinColumns: this.getJoinColumns(tableName, relatedSchema.table),
            confidence: 0.95,
            reason: 'direct table mention with verified relationship'
          });
        }
      }
    }

    // Remove duplicates and sort by confidence
    const uniqueRelationships = relationships.filter((rel, index, self) => 
      index === self.findIndex(r => r.relatedTable === rel.relatedTable)
    );

    return uniqueRelationships.sort((a, b) => b.confidence - a.confidence);
  }

  private extractTableFromMatch(match: RegExpExecArray): string | null {
    // Try to extract the most likely table name from regex match
    for (let i = match.length - 1; i >= 1; i--) {
      if (match[i] && match[i] !== 'their' && match[i] !== 'its' && match[i] !== 'the') {
        return match[i];
      }
    }
    return null;
  }

  private determineRelationshipType(fromTable: string, toTable: string): RelationshipAnalysis['type'] {
    const fromSchema = this.schemaDefinitions.find(def => def.table === fromTable);
    const toSchema = this.schemaDefinitions.find(def => def.table === toTable);
    
    if (!fromSchema || !toSchema) return 'direct';

    // Check if fromTable has foreign key to toTable
    const hasForeignKey = fromSchema.foreignKeys.some(fk => fk.referencedTable === toTable);
    // Check if toTable has foreign key to fromTable  
    const hasReverseForeignKey = toSchema.foreignKeys.some(fk => fk.referencedTable === fromTable);

    if (hasForeignKey && hasReverseForeignKey) {
      return 'many-to-many';
    } else if (hasForeignKey) {
      return 'direct';
    } else if (hasReverseForeignKey) {
      return 'reverse';
    }

    return 'direct';
  }

  private getJoinColumns(fromTable: string, toTable: string): string[] {
    const fromSchema = this.schemaDefinitions.find(def => def.table === fromTable);
    
    if (!fromSchema) return ['*'];

    // For PostgREST, we typically want all columns from related table
    // But we can be more specific based on the relationship
    const foreignKey = fromSchema.foreignKeys.find(fk => fk.referencedTable === toTable);
    
    if (foreignKey) {
      // If we have a direct foreign key, include all columns
      return ['*'];
    }

    // For reverse relationships, also include all columns
    return ['*'];
  }

  private estimateRows(query: PostgRESTQuery, analysis: RequestAnalysis): number {
    // This is a simplified estimation
    // In a real implementation, you would use actual table statistics
    
    let baseEstimate = 1000; // Default table size estimate
    
    // Reduce estimate based on filters
    if (query.filters) {
      for (const filter of query.filters) {
        switch (filter.operator) {
          case 'eq':
            baseEstimate = Math.floor(baseEstimate * 0.1);
            break;
          case 'gt':
          case 'lt':
          case 'gte':
          case 'lte':
            baseEstimate = Math.floor(baseEstimate * 0.3);
            break;
          case 'like':
          case 'ilike':
            baseEstimate = Math.floor(baseEstimate * 0.2);
            break;
          case 'in':
            baseEstimate = Math.floor(baseEstimate * 0.1);
            break;
        }
      }
    }
    
    // Apply limit
    if (query.limit && query.limit < baseEstimate) {
      baseEstimate = query.limit;
    }
    
    return Math.max(1, baseEstimate);
  }

  private getRequiredPermissions(query: PostgRESTQuery): string[] {
    const permissions: string[] = [];
    
    switch (query.operation) {
      case 'SELECT':
        permissions.push('SELECT');
        break;
      case 'INSERT':
        permissions.push('INSERT');
        break;
      case 'UPDATE':
        permissions.push('UPDATE');
        break;
      case 'DELETE':
        permissions.push('DELETE');
        break;
      case 'UPSERT':
        permissions.push('INSERT', 'UPDATE');
        break;
    }
    
    return permissions;
  }

  private identifyPotentialIssues(query: PostgRESTQuery, analysis: RequestAnalysis): string[] {
    const issues: string[] = [];
    
    // Check for missing indexes
    const tableSchema = this.schemaDefinitions.find(def => def.table === query.table);
    if (tableSchema && query.filters) {
      for (const filter of query.filters) {
        const hasIndex = tableSchema.indexes.some(idx => 
          idx.columns.includes(filter.column)
        );
        if (!hasIndex) {
          issues.push(`No index found for filtered column: ${filter.column}`);
        }
      }
    }
    
    // Check for potential large result sets
    if (!query.limit && (!query.filters || query.filters.length === 0)) {
      issues.push('Query may return large result set without limit or filters');
    }
    
    // Check for expensive operations
    if (query.filters?.some(f => f.operator === 'like' || f.operator === 'ilike')) {
      issues.push('Pattern matching operations can be expensive on large datasets');
    }
    
    return issues;
  }

  isReadOnlyOperation(operation: string): boolean {
    return operation === 'SELECT';
  }

  validateQuerySafety(query: PostgRESTQuery): QuerySafetyResult {
    const issues: string[] = [];
    const warnings: string[] = [];
    let safetyLevel: 'SAFE' | 'CAUTION' | 'UNSAFE' = 'SAFE';

    // Check operation type
    if (!this.isReadOnlyOperation(query.operation)) {
      issues.push(`Non-read-only operation: ${query.operation}`);
      safetyLevel = 'UNSAFE';
    }

    // Check for potentially expensive operations
    if (!query.limit && (!query.filters || query.filters.length === 0)) {
      warnings.push('Query may return large result set without limit or filters');
      if (safetyLevel === 'SAFE') safetyLevel = 'CAUTION';
    }

    // Check for pattern matching without indexes
    if (query.filters?.some(f => f.operator === 'like' || f.operator === 'ilike')) {
      warnings.push('Pattern matching operations can be expensive on large datasets');
      if (safetyLevel === 'SAFE') safetyLevel = 'CAUTION';
    }

    // Check for complex nested selects
    const nestedSelects = query.select?.filter(col => col.includes('(')) || [];
    if (nestedSelects.length > 3) {
      warnings.push('Complex nested queries may impact performance');
      if (safetyLevel === 'SAFE') safetyLevel = 'CAUTION';
    }

    return {
      isReadOnly: this.isReadOnlyOperation(query.operation),
      safetyLevel,
      issues,
      warnings,
      allowedInReadOnlyMode: this.isReadOnlyOperation(query.operation)
    };
  }

  private calculateSafetyLevel(query: PostgRESTQuery, analysis: RequestAnalysis): 'SAFE' | 'CAUTION' | 'UNSAFE' {
    const safetyResult = this.validateQuerySafety(query);
    return safetyResult.safetyLevel;
  }

  setReadOnlyMode(enabled: boolean): void {
    this.readOnlyMode = enabled;
  }

  isInReadOnlyMode(): boolean {
    return this.readOnlyMode;
  }
}

interface RequestAnalysis {
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT';
  table: string;
  columns: string[];
  filters: PostgRESTFilter[];
  orderBy: PostgRESTOrder[];
  limit?: number;
  offset?: number;
  description: string;
  relationships?: RelationshipAnalysis[];
}

interface RelationshipAnalysis {
  type: 'direct' | 'reverse' | 'many-to-many';
  relatedTable: string;
  joinColumns: string[];
  confidence: number;
  reason: string;
}