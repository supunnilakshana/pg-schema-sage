#!/usr/bin/env node

import "dotenv/config";
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {z} from "zod";

const TestSchema = z.object({
  message: z
    .string()
    .optional()
    .default("Hello from PostgreSQL Migration Server"),
});

async function main() {
  try {
    const server = new McpServer({
      name: "postgresql-migration-server",
      version: "1.0.0",
    });

    // Register one simple tool first
    server.registerTool(
      "test_connection",
      {
        title: "Test Connection",
        description: "Test if the MCP server is working",
        inputSchema: TestSchema.shape,
      },
      async (input) => {
        const parsed = TestSchema.parse(input);
        return {
          content: [
            {
              type: "text" as const,
              text: `Server is working! Message: ${parsed.message}`,
            },
          ],
        };
      }
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
