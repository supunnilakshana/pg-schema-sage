import { z } from 'zod';
import { MigrationParser } from '../services/migration-parser.js';

export const previewMigrationSchema = z.object({
  name: z.string().min(1, 'Migration name is required'),
  upSql: z.string().min(1, 'Up SQL is required'),
  downSql: z.string().min(1, 'Down SQL is required'),
  format: z.enum(['formatted', 'raw']).default('formatted'),
});

export type PreviewMigrationInput = z.infer<typeof previewMigrationSchema>;

export async function previewMigration(
  input: PreviewMigrationInput,
  migrationParser: MigrationParser
) {
  try {
    const timestamp = migrationParser.generateMigrationTimestamp();
    const filename = migrationParser.generateMigrationFilename(input.name);
    const content = migrationParser.formatMigrationContent(input.upSql, input.downSql);
    
    const result = {
      filename,
      version: timestamp,
      name: input.name,
      content: input.format === 'formatted' ? content : {
        upSql: input.upSql,
        downSql: input.downSql,
      },
      preview: {
        lines: content.split('\n').length,
        size: content.length,
        timestamp: new Date().toISOString(),
      },
    };
    
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