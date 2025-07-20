#!/usr/bin/env node

import "dotenv/config";
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {DatabaseService} from "./services/database.js";
import {MigrationParser} from "./services/migration-parser.js";
import {SchemaAnalyzer} from "./services/schema-analyzer.js";
import {GeminiService} from "./services/gemini-service.js";
import {ConfigLoader} from "./utils/config-loader.js";
import {log} from "./utils/logger.js";
import {analyzeSchema, analyzeSchemaSchema} from "./tools/analyze-schema.js";
import {
  analyzeMigrations,
  analyzeMigrationsSchema,
} from "./tools/analyze-migrations.js";
import {
  compareSchemaMigrations,
  compareSchemaMigrationsSchema,
} from "./tools/compare-schema.js";
import {
  generateMigration,
  generateMigrationSchema,
} from "./tools/generate-migration.js";
import {
  previewMigration,
  previewMigrationSchema,
} from "./tools/preview-migration.js";
import {
  getDatabaseObjectDefinition,
  getDatabaseObjectDefinitionSchema,
} from "./tools/get-database-object-definition.js";
import {
  executeSqlQuery,
  executeSqlQuerySchema,
} from "./tools/execute-sql-query.js";
import {PostgRESTGenerateQueryTool} from "./tools/postgrest-generate-query.js";
import {PostgRESTExecuteQueryTool} from "./tools/postgrest-execute-query.js";
import {PostgRESTSchemaInfoTool} from "./tools/postgrest-schema-info.js";
import {PostgRESTTestConnectionTool} from "./tools/postgrest-test-connection.js";
import {PostgRESTGenerateQuerySchema} from "./tools/postgrest-generate-query.js";
import {PostgRESTExecuteQuerySchema} from "./tools/postgrest-execute-query.js";
import {PostgRESTSchemaInfoSchema} from "./tools/postgrest-schema-info.js";
import {PostgRESTTestConnectionSchema} from "./tools/postgrest-test-connection.js";

function getConfigLoader(): ConfigLoader {
  return ConfigLoader.getInstance();
}

async function main() {
  try {
    log.info("Starting MCP server");
    const configLoader = getConfigLoader();

    // Validate configuration
    const validation = configLoader.validateConfig();
    if (!validation.valid) {
      log.error("Configuration validation failed", undefined, { errors: validation.errors });
      log.info("Required environment variables:", {
        variables: configLoader.getRequiredEnvironmentVariables()
      });
      log.warn("Server will start but some features may not work properly");
      log.warn("Database-dependent tools will fail until proper configuration is provided");
    } else {
      log.info("Configuration validation passed");
    }

    let databaseService: DatabaseService | null = null;
    let migrationParser: MigrationParser | null = null;
    let schemaAnalyzer: SchemaAnalyzer | null = null;
    let geminiService: GeminiService | null = null;

    // Only initialize database-dependent services if configuration is valid
    if (validation.valid) {
      log.info("Initializing database services");
      databaseService = new DatabaseService(configLoader.getDatabaseConfig());

      // Test database connection
      try {
        log.info("Testing database connection");
        await databaseService.connect();
        log.info("Database connection test successful");
      } catch (error) {
        log.error("Database connection test failed", error instanceof Error ? error : new Error(String(error)));
        log.warn("Server will continue but database-dependent tools may fail");
      }

      migrationParser = new MigrationParser(
        configLoader.getMigrationsConfig().directory
      );
      schemaAnalyzer = new SchemaAnalyzer();
      log.info("Database services initialized successfully");
    }

    // Initialize Gemini service if configured
    if (configLoader.isGeminiEnabled()) {
      log.info("Initializing Gemini service");
      const geminiConfig = configLoader.getGeminiConfig()!;
      try {
        geminiService = GeminiService.getInstance(geminiConfig);
        
        // Test Gemini connectivity
        log.info("Testing Gemini API connectivity");
        const connectionTest = await geminiService!.testConnection();
        if (connectionTest.success) {
          log.info("Gemini service initialized and connected successfully");
        } else {
          log.error("Gemini API connection test failed", new Error(connectionTest.error || "Unknown error"));
          log.warn("Gemini service available but may have connectivity issues");
        }
      } catch (error) {
        log.error("Failed to initialize Gemini service", error instanceof Error ? error : new Error(String(error)));
        log.warn("Schema summarization features will not be available");
        geminiService = null;
      }
    } else {
      log.info("Gemini service not configured - schema summarization features disabled");
    }

    // Initialize PostgREST tools if configured
    let postgrestTools: {
      generateQuery: PostgRESTGenerateQueryTool;
      executeQuery: PostgRESTExecuteQueryTool;
      schemaInfo: PostgRESTSchemaInfoTool;
      testConnection: PostgRESTTestConnectionTool;
    } | null = null;

    if (configLoader.isPostgRESTEnabled() && databaseService) {
      log.info("Initializing PostgREST tools");
      const postgrestConfig = configLoader.getPostgRESTConfig()!;
      postgrestTools = {
        generateQuery: new PostgRESTGenerateQueryTool(databaseService),
        executeQuery: new PostgRESTExecuteQueryTool(postgrestConfig),
        schemaInfo: new PostgRESTSchemaInfoTool(databaseService),
        testConnection: new PostgRESTTestConnectionTool(postgrestConfig),
      };
      log.info("PostgREST tools initialized successfully");
    }

    log.info("Creating MCP server");
    const server = new McpServer({
      name: "postgresql-migration-server",
      version: "1.0.0",
    });
    log.info("MCP server created successfully");

    log.info("Registering tools");
    server.registerTool(
      "analyze_schema",
      {
        title: "Analyze PostgreSQL Schema",
        description:
          "Extract and analyze the current PostgreSQL database schema including tables, columns, indexes, constraints, enums, and functions. Optionally use Gemini AI for intelligent schema summarization to handle large databases.",
        inputSchema: analyzeSchemaSchema.shape,
      },
      async (input) => {
        const toolLogger = log.mcp("analyze_schema", input);
        toolLogger.info("analyze_schema called");
        if (!databaseService) {
          log.error("Database service not available");
          throw new Error(
            "Database service not available. Please check your database configuration."
          );
        }
        try {
          const parsedInput = analyzeSchemaSchema.parse(input);
          toolLogger.info("Executing analyze_schema");
          const result = await analyzeSchema(parsedInput, databaseService, geminiService);
          toolLogger.info("analyze_schema completed successfully");
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          toolLogger.error("analyze_schema failed", error instanceof Error ? error : new Error(String(error)));
          throw error;
        }
      }
    );

    server.registerTool(
      "analyze_migrations",
      {
        title: "Analyze Migration Files",
        description:
          "Parse and analyze existing dbmate migration files, showing migration history and validation results",
        inputSchema: analyzeMigrationsSchema.shape,
      },
      async (input) => {
        if (!migrationParser || !databaseService) {
          throw new Error(
            "Migration parser or database service not available. Please check your configuration."
          );
        }
        const parsedInput = analyzeMigrationsSchema.parse(input);
        const result = await analyzeMigrations(
          parsedInput,
          migrationParser,
          databaseService
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
    );

    server.registerTool(
      "compare_schema_migrations",
      {
        title: "Compare Schema with Migrations",
        description:
          "Compare current database schema with applied migrations to detect schema drift",
        inputSchema: compareSchemaMigrationsSchema.shape,
      },
      async (input) => {
        if (!databaseService || !migrationParser || !schemaAnalyzer) {
          throw new Error(
            "Database service, migration parser, or schema analyzer not available. Please check your configuration."
          );
        }
        const parsedInput = compareSchemaMigrationsSchema.parse(input);
        const result = await compareSchemaMigrations(
          parsedInput,
          databaseService,
          migrationParser,
          schemaAnalyzer
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
    );

    server.registerTool(
      "generate_migration",
      {
        title: "Generate Migration File",
        description:
          "Create a new dbmate-compatible migration file with proper timestamp and up/down sections",
        inputSchema: generateMigrationSchema.shape,
      },
      async (input) => {
        if (!migrationParser) {
          throw new Error(
            "Migration parser not available. Please check your configuration."
          );
        }
        const parsedInput = generateMigrationSchema.parse(input);
        const result = await generateMigration(parsedInput, migrationParser);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
    );

    server.registerTool(
      "preview_migration",
      {
        title: "Preview Migration Content",
        description: "Show generated migration content without saving to file",
        inputSchema: previewMigrationSchema.shape,
      },
      async (input) => {
        if (!migrationParser) {
          throw new Error(
            "Migration parser not available. Please check your configuration."
          );
        }
        const parsedInput = previewMigrationSchema.parse(input);
        const result = await previewMigration(parsedInput, migrationParser);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
    );

    server.registerTool(
      "get_database_object_definition",
      {
        title: "Get Database Object Definition",
        description:
          "Get the complete definition of any PostgreSQL database object (views, tables, functions, triggers, RLS policies, enums, indexes, etc.)",
        inputSchema: getDatabaseObjectDefinitionSchema.shape,
      },
      async (input) => {
        const toolLogger = log.mcp("get_database_object_definition", input);
        toolLogger.info("get_database_object_definition called");
        if (!databaseService) {
          log.error("Database service not available");
          throw new Error(
            "Database service not available. Please check your database configuration."
          );
        }
        try {
          const parsedInput = getDatabaseObjectDefinitionSchema.parse(input);
          toolLogger.info("Executing get_database_object_definition");
          const result = await getDatabaseObjectDefinition(parsedInput, databaseService);
          toolLogger.info("get_database_object_definition completed successfully");
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          toolLogger.error("get_database_object_definition failed", error instanceof Error ? error : new Error(String(error)));
          throw error;
        }
      }
    );

    server.registerTool(
      "execute_sql_query",
      {
        title: "Execute SQL Query",
        description:
          "Execute SELECT queries and other read-only SQL commands safely with built-in security restrictions",
        inputSchema: executeSqlQuerySchema.shape,
      },
      async (input) => {
        const toolLogger = log.mcp("execute_sql_query", input);
        toolLogger.info("execute_sql_query called");
        if (!databaseService) {
          log.error("Database service not available");
          throw new Error(
            "Database service not available. Please check your database configuration."
          );
        }
        try {
          const parsedInput = executeSqlQuerySchema.parse(input);
          toolLogger.info("Executing SQL query");
          const result = await executeSqlQuery(parsedInput, databaseService);
          toolLogger.info("execute_sql_query completed successfully");
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          toolLogger.error("execute_sql_query failed", error instanceof Error ? error : new Error(String(error)));
          throw error;
        }
      }
    );

    // Register PostgREST tools if enabled
    if (postgrestTools) {
      server.registerTool(
        "postgrest_generate_query",
        {
          title: "Generate PostgREST Query",
          description:
            "Generate PostgREST API queries from natural language descriptions",
          inputSchema: PostgRESTGenerateQuerySchema.shape,
        },
        async (input) => {
          const parsedInput = PostgRESTGenerateQuerySchema.parse(input);
          const result = await postgrestTools!.generateQuery.execute(
            parsedInput
          );
          return {
            content: [
              {
                type: "text" as const,
                text: result,
              },
            ],
          };
        }
      );

      server.registerTool(
        "postgrest_execute_query",
        {
          title: "Execute PostgREST Query",
          description: "Execute PostgREST queries with Keycloak authentication",
          inputSchema: PostgRESTExecuteQuerySchema.shape,
        },
        async (input) => {
          const parsedInput = PostgRESTExecuteQuerySchema.parse(input);
          const result = await postgrestTools!.executeQuery.execute(
            parsedInput
          );
          return {
            content: [
              {
                type: "text" as const,
                text: result,
              },
            ],
          };
        }
      );

      server.registerTool(
        "postgrest_schema_info",
        {
          title: "Get PostgREST Schema Info",
          description: "Get PostgREST schema information and API documentation",
          inputSchema: PostgRESTSchemaInfoSchema.shape,
        },
        async (input) => {
          const parsedInput = PostgRESTSchemaInfoSchema.parse(input);
          const result = await postgrestTools!.schemaInfo.execute(parsedInput);
          return {
            content: [
              {
                type: "text" as const,
                text: result,
              },
            ],
          };
        }
      );

      server.registerTool(
        "postgrest_test_connection",
        {
          title: "Test PostgREST Connection",
          description: "Test PostgREST connection and Keycloak authentication",
          inputSchema: PostgRESTTestConnectionSchema.shape,
        },
        async (input) => {
          const parsedInput = PostgRESTTestConnectionSchema.parse(input);
          const result = await postgrestTools!.testConnection.execute(
            parsedInput
          );
          return {
            content: [
              {
                type: "text" as const,
                text: result,
              },
            ],
          };
        }
      );
    }

    console.error("Tools registered successfully");

    console.error("Creating transport...");
    const transport = new StdioServerTransport();
    console.error("Transport created successfully");

    // Handle cleanup on exit
    process.on("SIGINT", async () => {
      console.error("Received SIGINT, shutting down...");
      if (databaseService) {
        await databaseService.disconnect();
      }
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.error("Received SIGTERM, shutting down...");
      if (databaseService) {
        await databaseService.disconnect();
      }
      process.exit(0);
    });

    console.error("Connecting to transport...");

    // Add error handling for transport
    transport.onclose = () => {
      console.error("Transport closed");
    };

    transport.onerror = (error) => {
      console.error("Transport error:", error);
    };

    await server.connect(transport);
    console.error("Server connected successfully and ready for requests");
  } catch (error) {
    console.error("Error during server startup:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
