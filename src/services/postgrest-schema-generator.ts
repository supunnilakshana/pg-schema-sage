import { 
  PostgRESTSchemaDefinition,
  PostgRESTColumn,
  PostgRESTForeignKey,
  PostgRESTIndex,
  PostgRESTPermission
} from '../types/postgrest.js';
import { DatabaseSchema, Table, Column, Index, Constraint } from '../types/schema.js';
import { DatabaseService } from './database.js';

export class PostgRESTSchemaGenerator {
  private databaseService: DatabaseService;

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
  }

  async generatePostgRESTSchema(tableFilter?: string): Promise<PostgRESTSchemaDefinition[]> {
    const schema = await this.databaseService.getSchema();
    const definitions: PostgRESTSchemaDefinition[] = [];

    for (const table of schema.tables) {
      if (tableFilter && !table.name.includes(tableFilter)) {
        continue;
      }

      const definition = await this.generateTableDefinition(table, schema);
      definitions.push(definition);
    }

    return definitions;
  }

  private async generateTableDefinition(table: Table, schema: DatabaseSchema): Promise<PostgRESTSchemaDefinition> {
    const columns = table.columns.map(col => this.convertColumn(col));
    const foreignKeys = this.extractForeignKeys(table.constraints);
    const indexes = this.extractIndexes(table.indexes, schema.indexes);
    const permissions = await this.extractPermissions(table);

    return {
      table: table.name,
      schema: table.schema,
      columns,
      primaryKey: this.extractPrimaryKey(table.constraints),
      foreignKeys,
      indexes,
      permissions,
    };
  }

  private convertColumn(column: Column): PostgRESTColumn {
    return {
      name: column.name,
      type: this.mapPostgreSQLToPostgRESTType(column.dataType),
      nullable: column.isNullable,
      default: column.defaultValue,
      description: column.comment,
      isGenerated: column.isGenerated,
      isIdentity: column.isIdentity,
    };
  }

  private mapPostgreSQLToPostgRESTType(pgType: string): string {
    const typeMap: Record<string, string> = {
      'integer': 'integer',
      'bigint': 'bigint',
      'smallint': 'smallint',
      'serial': 'serial',
      'bigserial': 'bigserial',
      'real': 'real',
      'double precision': 'double precision',
      'numeric': 'numeric',
      'decimal': 'decimal',
      'boolean': 'boolean',
      'char': 'char',
      'varchar': 'varchar',
      'text': 'text',
      'json': 'json',
      'jsonb': 'jsonb',
      'xml': 'xml',
      'uuid': 'uuid',
      'date': 'date',
      'time': 'time',
      'timestamp': 'timestamp',
      'timestamptz': 'timestamptz',
      'interval': 'interval',
      'inet': 'inet',
      'cidr': 'cidr',
      'macaddr': 'macaddr',
      'bytea': 'bytea',
      'point': 'point',
      'line': 'line',
      'lseg': 'lseg',
      'box': 'box',
      'path': 'path',
      'polygon': 'polygon',
      'circle': 'circle',
    };

    // Handle array types
    if (pgType.endsWith('[]')) {
      const baseType = pgType.slice(0, -2);
      const mappedBaseType = typeMap[baseType] || baseType;
      return `${mappedBaseType}[]`;
    }

    return typeMap[pgType] || pgType;
  }

  private extractPrimaryKey(constraints: Constraint[]): string[] | undefined {
    const primaryKey = constraints.find(c => c.type === 'PRIMARY KEY');
    return primaryKey?.columns;
  }

  private extractForeignKeys(constraints: Constraint[]): PostgRESTForeignKey[] {
    return constraints
      .filter(c => c.type === 'FOREIGN KEY')
      .map(c => ({
        columnName: c.columns[0], // Assuming single column FK for simplicity
        referencedTable: c.foreignKeyTable || '',
        referencedColumn: c.foreignKeyColumns?.[0] || '',
        constraintName: c.name,
      }));
  }

  private extractIndexes(tableIndexes: Index[], schemaIndexes: Index[]): PostgRESTIndex[] {
    // Find all indexes for this table
    const allIndexes = [...tableIndexes, ...schemaIndexes.filter(idx => 
      tableIndexes.some(tIdx => tIdx.name === idx.name)
    )];

    return allIndexes.map(idx => ({
      name: idx.name,
      columns: idx.columns.map(col => typeof col === 'string' ? col : col.name),
      unique: idx.isUnique,
      method: idx.method,
    }));
  }

  private async extractPermissions(table: Table): Promise<PostgRESTPermission[]> {
    try {
      const permissions = await this.databaseService.getTablePermissions(table.schema, table.name);
      return permissions.map(p => ({
        role: p.grantee,
        operation: p.privilege_type as any,
        columns: p.column_name ? [p.column_name] : undefined,
      }));
    } catch (error) {
      console.warn(`Failed to extract permissions for table ${table.name}:`, error);
      return [];
    }
  }

  async generateOpenAPISpec(schemaDefinitions: PostgRESTSchemaDefinition[]): Promise<any> {
    const spec = {
      openapi: '3.0.0',
      info: {
        title: 'PostgREST API',
        version: '1.0.0',
        description: 'Auto-generated PostgREST API documentation',
      },
      paths: {} as Record<string, any>,
      components: {
        schemas: {} as Record<string, any>,
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ bearerAuth: [] }],
    };

    for (const definition of schemaDefinitions) {
      // Generate schema components
      spec.components.schemas[definition.table] = this.generateTableSchema(definition);
      
      // Generate paths
      const tablePath = `/${definition.table}`;
      spec.paths[tablePath] = this.generateTablePaths(definition);
    }

    return spec;
  }

  private generateTableSchema(definition: PostgRESTSchemaDefinition): any {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const column of definition.columns) {
      properties[column.name] = {
        type: this.mapPostgRESTToOpenAPIType(column.type),
        description: column.description,
        readOnly: column.isGenerated || column.isIdentity,
      };

      if (column.default !== undefined) {
        properties[column.name].default = column.default;
      }

      if (!column.nullable && !column.isGenerated) {
        required.push(column.name);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  private mapPostgRESTToOpenAPIType(postgrestType: string): string {
    const typeMap: Record<string, string> = {
      'integer': 'integer',
      'bigint': 'integer',
      'smallint': 'integer',
      'serial': 'integer',
      'bigserial': 'integer',
      'real': 'number',
      'double precision': 'number',
      'numeric': 'number',
      'decimal': 'number',
      'boolean': 'boolean',
      'char': 'string',
      'varchar': 'string',
      'text': 'string',
      'json': 'object',
      'jsonb': 'object',
      'xml': 'string',
      'uuid': 'string',
      'date': 'string',
      'time': 'string',
      'timestamp': 'string',
      'timestamptz': 'string',
      'interval': 'string',
      'inet': 'string',
      'cidr': 'string',
      'macaddr': 'string',
      'bytea': 'string',
    };

    // Handle array types
    if (postgrestType.endsWith('[]')) {
      const baseType = postgrestType.slice(0, -2);
      const mappedBaseType = typeMap[baseType] || 'string';
      return 'array';
    }

    return typeMap[postgrestType] || 'string';
  }

  private generateTablePaths(definition: PostgRESTSchemaDefinition): any {
    const tableName = definition.table;
    const schemaRef = `#/components/schemas/${tableName}`;

    return {
      get: {
        tags: [definition.schema],
        summary: `Retrieve ${tableName} records`,
        parameters: this.generateQueryParameters(definition),
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: schemaRef },
                },
              },
            },
          },
        },
      },
      post: {
        tags: [definition.schema],
        summary: `Create ${tableName} record`,
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: schemaRef },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created',
            content: {
              'application/json': {
                schema: { $ref: schemaRef },
              },
            },
          },
        },
      },
      patch: {
        tags: [definition.schema],
        summary: `Update ${tableName} records`,
        parameters: this.generateFilterParameters(definition),
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: schemaRef },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: schemaRef },
                },
              },
            },
          },
        },
      },
      delete: {
        tags: [definition.schema],
        summary: `Delete ${tableName} records`,
        parameters: this.generateFilterParameters(definition),
        responses: {
          '204': {
            description: 'No Content',
          },
        },
      },
    };
  }

  private generateQueryParameters(definition: PostgRESTSchemaDefinition): any[] {
    const params = [
      {
        name: 'select',
        in: 'query',
        description: 'Columns to select',
        schema: { type: 'string' },
      },
      {
        name: 'order',
        in: 'query',
        description: 'Order by columns',
        schema: { type: 'string' },
      },
      {
        name: 'limit',
        in: 'query',
        description: 'Limit number of results',
        schema: { type: 'integer' },
      },
      {
        name: 'offset',
        in: 'query',
        description: 'Offset results',
        schema: { type: 'integer' },
      },
    ];

    // Add filter parameters for each column
    for (const column of definition.columns) {
      params.push({
        name: `${column.name}`,
        in: 'query',
        description: `Filter by ${column.name}`,
        schema: { type: 'string' },
      });
    }

    return params;
  }

  private generateFilterParameters(definition: PostgRESTSchemaDefinition): any[] {
    const params = [];

    // Add filter parameters for each column
    for (const column of definition.columns) {
      params.push({
        name: `${column.name}`,
        in: 'query',
        description: `Filter by ${column.name}`,
        schema: { type: 'string' },
      });
    }

    return params;
  }
}