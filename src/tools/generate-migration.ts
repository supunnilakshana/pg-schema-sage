import { z } from 'zod';
import { MigrationParser } from '../services/migration-parser.js';
import { GeneratedMigration } from '../types/migration.js';

export const generateMigrationSchema = z.object({
  name: z.string().min(1, 'Migration name is required'),
  upSql: z.string().min(1, 'Up SQL is required'),
  downSql: z.string().min(1, 'Down SQL is required'),
  saveToFile: z.boolean().default(true),
});

export type GenerateMigrationInput = z.infer<typeof generateMigrationSchema>;

export async function generateMigration(
  input: GenerateMigrationInput,
  migrationParser: MigrationParser
) {
  try {
    const timestamp = migrationParser.generateMigrationTimestamp();
    const filename = migrationParser.generateMigrationFilename(input.name);
    const content = migrationParser.formatMigrationContent(input.upSql, input.downSql);
    
    const migration: GeneratedMigration = {
      version: timestamp,
      name: input.name,
      filename,
      upSql: input.upSql,
      downSql: input.downSql,
      timestamp: new Date(),
      operations: [], // TODO: Parse operations from SQL
    };
    
    if (input.saveToFile) {
      await migrationParser.ensureMigrationsDirectory();
      await migrationParser.writeMigrationFile(filename, content);
    }
    
    return {
      success: true,
      data: {
        migration,
        content,
        saved: input.saveToFile,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}