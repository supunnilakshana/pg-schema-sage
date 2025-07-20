import {z} from "zod";
import {DatabaseService} from "../services/database.js";
import {log} from "../utils/logger.js";

export const getDatabaseObjectDefinitionSchema = z.object({
  objectName: z.string().min(1),
  objectType: z.enum(['view', 'materialized_view', 'matview', 'function', 'procedure', 'table', 'trigger', 'policy', 'rls', 'table_policies', 'table_rls', 'enum', 'index']),
  schemaName: z.string().default('public'),
});

export type GetDatabaseObjectDefinitionInput = z.infer<typeof getDatabaseObjectDefinitionSchema>;

export async function getDatabaseObjectDefinition(
  input: GetDatabaseObjectDefinitionInput,
  databaseService: DatabaseService
) {
  const objectLogger = log.schema("getDatabaseObjectDefinition", undefined, input.schemaName);
  const startTime = Date.now();

  try {
    objectLogger.info("Getting database object definition", {
      objectName: input.objectName,
      objectType: input.objectType,
      schemaName: input.schemaName,
    });

    const result = await databaseService.getDatabaseObjectDefinition(
      input.objectName, 
      input.objectType, 
      input.schemaName
    );
    
    const processingTimeMs = Date.now() - startTime;
    
    objectLogger.info("Database object definition retrieved successfully", {
      objectName: result.name,
      objectType: result.object_type,
      schemaName: result.schema,
      hasComment: !!result.comment,
      processingTimeMs,
    });

    return {
      success: true,
      data: result,
      metadata: {
        processingTimeMs,
        objectType: result.object_type,
        schemaName: result.schema,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const processingTimeMs = Date.now() - startTime;
    
    objectLogger.error("Failed to get database object definition", new Error(errorMessage));

    return {
      success: false,
      error: errorMessage,
      metadata: {
        processingTimeMs,
        objectName: input.objectName,
        objectType: input.objectType,
        schemaName: input.schemaName,
      },
    };
  }
}