import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { PostgRESTSchemaGenerator } from '../services/postgrest-schema-generator.js';
import { DatabaseService } from '../services/database.js';

export const PostgRESTSchemaInfoSchema = z.object({
  tableFilter: z.string().optional().describe('Filter tables by name pattern'),
  includeOpenAPI: z.boolean().optional().describe('Include OpenAPI specification'),
  includePermissions: z.boolean().optional().describe('Include permission information'),
  format: z.enum(['json', 'summary', 'openapi']).optional().describe('Output format'),
});

export class PostgRESTSchemaInfoTool {
  private databaseService: DatabaseService;
  private schemaGenerator: PostgRESTSchemaGenerator;

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
    this.schemaGenerator = new PostgRESTSchemaGenerator(databaseService);
  }

  async execute(params: z.infer<typeof PostgRESTSchemaInfoSchema>): Promise<string> {
    try {
      const schemaDefinitions = await this.schemaGenerator.generatePostgRESTSchema(params.tableFilter);
      
      if (params.format === 'openapi' || params.includeOpenAPI) {
        const openapi = await this.schemaGenerator.generateOpenAPISpec(schemaDefinitions);
        
        if (params.format === 'openapi') {
          return JSON.stringify(openapi, null, 2);
        }
        
        return JSON.stringify({
          schemas: schemaDefinitions,
          openapi,
          summary: this.generateSummary(schemaDefinitions),
        }, null, 2);
      }

      if (params.format === 'summary') {
        return JSON.stringify({
          summary: this.generateSummary(schemaDefinitions),
          tableCount: schemaDefinitions.length,
          tables: schemaDefinitions.map(def => ({
            name: def.table,
            schema: def.schema,
            columnCount: def.columns.length,
            indexCount: def.indexes.length,
            foreignKeyCount: def.foreignKeys.length,
            primaryKey: def.primaryKey,
          })),
        }, null, 2);
      }

      // Default JSON format
      const response = {
        schemas: schemaDefinitions,
        summary: this.generateSummary(schemaDefinitions),
        metadata: {
          totalTables: schemaDefinitions.length,
          totalColumns: schemaDefinitions.reduce((sum, def) => sum + def.columns.length, 0),
          totalIndexes: schemaDefinitions.reduce((sum, def) => sum + def.indexes.length, 0),
          totalForeignKeys: schemaDefinitions.reduce((sum, def) => sum + def.foreignKeys.length, 0),
          schemasWithPermissions: schemaDefinitions.filter(def => def.permissions.length > 0).length,
        },
      };

      return JSON.stringify(response, null, 2);
    } catch (error) {
      throw new Error(`Failed to get PostgREST schema info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateSummary(schemaDefinitions: any[]): any {
    const summary = {
      totalTables: schemaDefinitions.length,
      schemas: {} as Record<string, any>,
      dataTypes: {} as Record<string, number>,
      constraints: {
        primaryKeys: 0,
        foreignKeys: 0,
        uniqueConstraints: 0,
      },
      indexes: {
        total: 0,
        unique: 0,
        btree: 0,
        other: 0,
      },
      permissions: {
        tablesWithPermissions: 0,
        totalPermissions: 0,
        roles: new Set<string>(),
      },
    };

    for (const def of schemaDefinitions) {
      // Schema summary
      if (!summary.schemas[def.schema]) {
        summary.schemas[def.schema] = {
          tables: 0,
          columns: 0,
          indexes: 0,
        };
      }
      summary.schemas[def.schema].tables += 1;
      summary.schemas[def.schema].columns += def.columns.length;
      summary.schemas[def.schema].indexes += def.indexes.length;

      // Data types
      for (const column of def.columns) {
        summary.dataTypes[column.type] = (summary.dataTypes[column.type] || 0) + 1;
      }

      // Constraints
      if (def.primaryKey && def.primaryKey.length > 0) {
        summary.constraints.primaryKeys += 1;
      }
      summary.constraints.foreignKeys += def.foreignKeys.length;

      // Indexes
      summary.indexes.total += def.indexes.length;
      summary.indexes.unique += def.indexes.filter((idx: any) => idx.unique).length;
      summary.indexes.btree += def.indexes.filter((idx: any) => idx.method === 'btree').length;
      summary.indexes.other += def.indexes.filter((idx: any) => idx.method !== 'btree').length;

      // Permissions
      if (def.permissions.length > 0) {
        summary.permissions.tablesWithPermissions += 1;
        summary.permissions.totalPermissions += def.permissions.length;
        for (const perm of def.permissions) {
          summary.permissions.roles.add(perm.role);
        }
      }
    }

    return {
      ...summary,
      permissions: {
        ...summary.permissions,
        roles: Array.from(summary.permissions.roles),
      },
      topDataTypes: Object.entries(summary.dataTypes)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([type, count]) => ({ type, count })),
    };
  }
}