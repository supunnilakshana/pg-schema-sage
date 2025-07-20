import { z } from 'zod';
import { MigrationParser } from '../services/migration-parser.js';
import { DatabaseService } from '../services/database.js';

export const analyzeMigrationsSchema = z.object({
  includeContent: z.boolean().default(false),
  migrationsTable: z.string().default('schema_migrations'),
});

export type AnalyzeMigrationsInput = z.infer<typeof analyzeMigrationsSchema>;

export async function analyzeMigrations(
  input: AnalyzeMigrationsInput,
  migrationParser: MigrationParser,
  databaseService: DatabaseService
) {
  try {
    const [analysis, appliedMigrations] = await Promise.all([
      migrationParser.analyzeMigrations(),
      databaseService.getAppliedMigrations(input.migrationsTable),
    ]);
    
    const migrationHistory = await migrationParser.getMigrationHistory(appliedMigrations);
    
    const result = {
      analysis,
      history: migrationHistory,
      appliedMigrations: appliedMigrations.map(m => ({
        version: m.version,
        appliedAt: m.appliedAt.toISOString(),
      })),
    };
    
    if (input.includeContent) {
      const files = await migrationParser.parseMigrationFiles();
      (result as any).files = files.map(f => ({
        filename: f.filename,
        content: f.content,
        parsed: f.parsed,
      }));
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