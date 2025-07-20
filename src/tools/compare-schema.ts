import { z } from 'zod';
import { DatabaseService } from '../services/database.js';
import { MigrationParser } from '../services/migration-parser.js';
import { SchemaAnalyzer } from '../services/schema-analyzer.js';
import { Migration } from '../types/migration.js';

export const compareSchemaMigrationsSchema = z.object({
  migrationsTable: z.string().default('schema_migrations'),
  includeDetails: z.boolean().default(true),
});

export type CompareSchemaMigrationsInput = z.infer<typeof compareSchemaMigrationsSchema>;

export async function compareSchemaMigrations(
  input: CompareSchemaMigrationsInput,
  databaseService: DatabaseService,
  migrationParser: MigrationParser,
  schemaAnalyzer: SchemaAnalyzer
) {
  try {
    const [currentSchema, appliedMigrations] = await Promise.all([
      databaseService.getSchema(),
      databaseService.getAppliedMigrations(input.migrationsTable),
    ]);
    
    const migrationHistory = await migrationParser.getMigrationHistory(appliedMigrations);
    
    const appliedMigrationList = migrationHistory.migrationChain
      .filter((m: Migration) => appliedMigrations.some(am => am.version === m.version))
      .sort((a: Migration, b: Migration) => a.version.localeCompare(b.version));
    
    const schemaDrift = schemaAnalyzer.compareSchemasWithMigrations(
      currentSchema,
      appliedMigrationList
    );
    
    const result = {
      drift: schemaDrift,
      appliedMigrations: appliedMigrations.length,
      pendingMigrations: migrationHistory.pendingMigrations.length,
      lastAppliedVersion: migrationHistory.lastAppliedVersion,
    };
    
    if (input.includeDetails) {
      (result as any).details = {
        currentSchema: {
          tables: currentSchema.tables.length,
          indexes: currentSchema.indexes.length,
          enums: currentSchema.enums.length,
          functions: currentSchema.functions.length,
          extensions: currentSchema.extensions.length,
        },
        migrationAnalysis: {
          totalMigrations: appliedMigrationList.length,
          migrationVersions: appliedMigrationList.map((m: Migration) => m.version),
        },
      };
    }
    
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}