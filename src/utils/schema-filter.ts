import { DatabaseSchema, Table, View, Function as DBFunction } from "../types/schema.js";
import { log } from "./logger.js";

export interface FilteredSchema {
  overview: {
    totalTables: number;
    totalViews: number;
    totalFunctions: number;
    totalEnums: number;
    totalExtensions: number;
    keyBusinessTables: string[];
    systemTables: string[];
    relationships: string[];
  };
  coreEntities: {
    name: string;
    schema: string;
    primaryKey?: string;
    foreignKeys: Array<{
      column: string;
      referencedTable: string;
      referencedColumn: string;
    }>;
    columnCount: number;
    hasIndexes: boolean;
  }[];
  essentialViews: {
    name: string;
    schema: string;
    dependencies: string[];
  }[];
  criticalFunctions: {
    name: string;
    schema: string;
    parameters: number;
    returnType?: string;
  }[];
  schemaSize: {
    originalBytes: number;
    filteredBytes: number;
    compressionRatio: number;
  };
}

export interface SchemaFilterOptions {
  maxTables?: number;
  maxViews?: number;
  maxFunctions?: number;
  includeSystemSchemas?: boolean;
  includeDetailedColumns?: boolean;
  focusIntent?: 'query_generation' | 'migration_analysis' | 'overview' | 'relationships';
}

export class SchemaFilter {
  private static readonly SYSTEM_SCHEMAS = [
    'information_schema',
    'pg_catalog',
    'pg_toast',
    'pg_temp',
    'public'  // Sometimes public contains only system objects
  ];

  private static readonly SYSTEM_TABLE_PATTERNS = [
    /^pg_/,
    /^information_schema/,
    /migration/i,
    /^schema_migrations?$/,
    /audit/i,
    /log/i,
    /_log$/,
    /session/i,
    /temp/i,
    /^temp_/
  ];

  static calculateSize(obj: any): number {
    return JSON.stringify(obj).length;
  }

  static isBusinessTable(table: Table): boolean {
    // Filter out system tables and common audit/log tables
    const tableName = table.name.toLowerCase();
    const schemaName = table.schema.toLowerCase();

    // Check if it's a system schema
    if (this.SYSTEM_SCHEMAS.includes(schemaName)) {
      return false;
    }

    // Check against system table patterns
    return !this.SYSTEM_TABLE_PATTERNS.some(pattern => pattern.test(tableName));
  }

  static extractTableOverview(table: Table): FilteredSchema['coreEntities'][0] {
    const primaryKey = table.constraints?.find(c => c.type === 'PRIMARY KEY')?.columns[0];
    const foreignKeys = table.constraints?.filter(c => c.type === 'FOREIGN KEY').map(fk => ({
      column: fk.columns[0],
      referencedTable: fk.referencedTable || '',
      referencedColumn: fk.referencedColumns?.[0] || ''
    })) || [];

    return {
      name: table.name,
      schema: table.schema,
      primaryKey,
      foreignKeys,
      columnCount: table.columns?.length || 0,
      hasIndexes: (table.indexes?.length || 0) > 0
    };
  }

  static filterForIntent(schema: DatabaseSchema, intent: SchemaFilterOptions['focusIntent']): Partial<DatabaseSchema> {
    switch (intent) {
      case 'query_generation':
        return {
          tables: schema.tables?.filter(this.isBusinessTable).slice(0, 20),
          views: schema.views?.slice(0, 10),
          enums: schema.enums,
          functions: schema.functions?.filter(f => f.name.includes('get') || f.name.includes('find')).slice(0, 5)
        };
      
      case 'relationships':
        return {
          tables: schema.tables?.filter(this.isBusinessTable).map(table => ({
            ...table,
            columns: table.columns?.filter(col => 
              table.constraints?.some(c => 
                (c.type === 'PRIMARY KEY' || c.type === 'FOREIGN KEY') && 
                c.columns.includes(col.name)
              )
            ) || []
          }))
        };
      
      case 'migration_analysis':
        return {
          tables: schema.tables?.slice(0, 30),
          indexes: schema.indexes,
          triggers: schema.triggers
        };
      
      default:
        return {
          tables: schema.tables?.filter(this.isBusinessTable).slice(0, 15),
          views: schema.views?.slice(0, 5),
          functions: schema.functions?.slice(0, 3),
          enums: schema.enums
        };
    }
  }

  static createFilteredSchema(
    schema: DatabaseSchema, 
    options: SchemaFilterOptions = {}
  ): FilteredSchema {
    const filterLogger = log.schema("filter");
    const timer = log.timer("schema-filtering");

    const {
      maxTables = 20,
      maxViews = 10,
      maxFunctions = 5,
      includeSystemSchemas = false,
      focusIntent = 'overview'
    } = options;

    try {
      filterLogger.info("Starting schema filtering", {
        originalTables: schema.tables?.length || 0,
        originalViews: schema.views?.length || 0,
        originalFunctions: schema.functions?.length || 0,
        intent: focusIntent,
        options
      });

      // Filter tables based on business relevance
      const allTables = schema.tables || [];
      const businessTables = includeSystemSchemas ? 
        allTables : 
        allTables.filter(this.isBusinessTable);
      
      const systemTables = allTables.filter(t => !this.isBusinessTable(t));

      // Apply intent-based filtering
      const intentFiltered = this.filterForIntent(schema, focusIntent);
      const tablesToProcess = (intentFiltered.tables || businessTables).slice(0, maxTables);

      // Extract core entities with relationships
      const coreEntities = tablesToProcess.map(this.extractTableOverview);

      // Extract relationship information
      const relationships: string[] = [];
      tablesToProcess.forEach(table => {
        table.constraints?.forEach(constraint => {
          if (constraint.type === 'FOREIGN KEY' && constraint.referencedTable) {
            relationships.push(`${table.name}.${constraint.columns[0]} -> ${constraint.referencedTable}.${constraint.referencedColumns?.[0] || 'id'}`);
          }
        });
      });

      // Filter views
      const essentialViews = (schema.views || []).slice(0, maxViews).map(view => ({
        name: view.name,
        schema: view.schema,
        dependencies: view.dependencies?.map(d => d.name) || []
      }));

      // Filter functions
      const criticalFunctions = (schema.functions || []).slice(0, maxFunctions).map(func => ({
        name: func.name,
        schema: func.schema,
        parameters: func.parameters?.length || 0,
        returnType: func.returnType
      }));

      // Calculate sizes
      const originalSize = this.calculateSize(schema);
      const filteredSchema: FilteredSchema = {
        overview: {
          totalTables: allTables.length,
          totalViews: schema.views?.length || 0,
          totalFunctions: schema.functions?.length || 0,
          totalEnums: schema.enums?.length || 0,
          totalExtensions: schema.extensions?.length || 0,
          keyBusinessTables: businessTables.slice(0, 10).map(t => t.name),
          systemTables: systemTables.slice(0, 5).map(t => t.name),
          relationships: relationships.slice(0, 20)
        },
        coreEntities,
        essentialViews,
        criticalFunctions,
        schemaSize: {
          originalBytes: originalSize,
          filteredBytes: 0, // Will be calculated below
          compressionRatio: 0
        }
      };

      const filteredSize = this.calculateSize(filteredSchema);
      filteredSchema.schemaSize.filteredBytes = filteredSize;
      filteredSchema.schemaSize.compressionRatio = Math.round((1 - filteredSize / originalSize) * 100);

      filterLogger.info("Schema filtering completed", {
        originalSize,
        filteredSize,
        compressionRatio: filteredSchema.schemaSize.compressionRatio,
        tablesIncluded: coreEntities.length,
        relationshipsFound: relationships.length
      });

      timer();
      return filteredSchema;

    } catch (error) {
      filterLogger.error(
        "Schema filtering failed",
        error instanceof Error ? error : new Error(String(error))
      );
      timer();
      throw error;
    }
  }

  static createMinimalOverview(schema: DatabaseSchema): {
    summary: string;
    keyTables: string[];
    tableCount: number;
    hasComplexRelationships: boolean;
  } {
    const businessTables = (schema.tables || []).filter(this.isBusinessTable);
    const keyTables = businessTables.slice(0, 5).map(t => t.name);
    
    const totalRelationships = businessTables.reduce((count, table) => {
      return count + (table.constraints?.filter(c => c.type === 'FOREIGN KEY').length || 0);
    }, 0);

    return {
      summary: `Database contains ${businessTables.length} business tables with ${totalRelationships} relationships`,
      keyTables,
      tableCount: businessTables.length,
      hasComplexRelationships: totalRelationships > 10
    };
  }
}