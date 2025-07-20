import {z} from "zod";
import {DatabaseService} from "../services/database.js";
import {log} from "../utils/logger.js";

export const executeSqlQuerySchema = z.object({
  query: z.string().min(1),
  maxRows: z.number().min(1).max(1000).default(100),
  timeout: z.number().min(1000).max(30000).default(10000), // 10 seconds default
});

export type ExecuteSqlQueryInput = z.infer<typeof executeSqlQuerySchema>;

export async function executeSqlQuery(
  input: ExecuteSqlQueryInput,
  databaseService: DatabaseService
) {
  const queryLogger = log.db("executeSqlQuery", input.query.substring(0, 100));
  const startTime = Date.now();

  try {
    // Security check: Only allow SELECT statements and some utility queries
    const normalizedQuery = input.query.trim().toLowerCase();
    
    const allowedPrefixes = [
      'select',
      'with',
      'show',
      'explain',
      'describe',
      '\\d',
      '\\dt',
      '\\dv',
      '\\df'
    ];

    const isAllowed = allowedPrefixes.some(prefix => normalizedQuery.startsWith(prefix));
    
    if (!isAllowed) {
      throw new Error("Only SELECT, WITH, SHOW, EXPLAIN, DESCRIBE, and \\d commands are allowed for security reasons");
    }

    // Additional security: prevent dangerous patterns
    const dangerousPatterns = [
      /drop\s+/i,
      /delete\s+/i,
      /update\s+/i,
      /insert\s+/i,
      /create\s+/i,
      /alter\s+/i,
      /truncate\s+/i,
      /grant\s+/i,
      /revoke\s+/i,
      /pg_sleep/i,
      /pg_terminate_backend/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(input.query)) {
        throw new Error(`Query contains prohibited pattern: ${pattern.source}`);
      }
    }

    queryLogger.info("Executing SQL query", {
      queryLength: input.query.length,
      maxRows: input.maxRows,
      timeout: input.timeout,
    });

    // Add limit to prevent huge result sets
    let queryToExecute = input.query;
    if (!normalizedQuery.includes('limit') && normalizedQuery.startsWith('select')) {
      queryToExecute = `${input.query} LIMIT ${input.maxRows}`;
    }

    // Execute with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Query timeout')), input.timeout);
    });

    const queryPromise = databaseService.executeQuery(queryToExecute);
    const result = await Promise.race([queryPromise, timeoutPromise]) as any;
    
    const processingTimeMs = Date.now() - startTime;
    
    queryLogger.info("SQL query executed successfully", {
      rowCount: result.rows.length,
      columnCount: result.fields?.length || 0,
      processingTimeMs,
    });

    // Format the results nicely
    const formattedResult = {
      rows: result.rows,
      rowCount: result.rows.length,
      fields: result.fields?.map((field: any) => ({
        name: field.name,
        dataTypeID: field.dataTypeID,
        tableID: field.tableID,
        columnID: field.columnID
      })) || [],
      command: result.command,
      query: queryToExecute
    };

    return {
      success: true,
      data: formattedResult,
      metadata: {
        processingTimeMs,
        queryLength: input.query.length,
        resultSizeKB: Math.round(JSON.stringify(formattedResult).length / 1024),
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const processingTimeMs = Date.now() - startTime;
    
    queryLogger.error("SQL query execution failed", new Error(errorMessage));

    return {
      success: false,
      error: errorMessage,
      metadata: {
        processingTimeMs,
        query: input.query.substring(0, 200) + (input.query.length > 200 ? '...' : ''),
      },
    };
  }
}