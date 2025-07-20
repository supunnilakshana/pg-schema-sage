# Quick Integration Test

## Test 1: Verify MCP Server Connection

**In Claude Desktop, ask:**
```
Use the analyzeSchema tool to show me a summary of my database schema.
```

**Expected Response:**
```
- 155 tables found
- 9 views found  
- 165 RLS policies found
- List of schemas (public, storage, graphile_worker, etc.)
- Summary of key tables like app_user, client, task, etc.
```

## Test 2: Test Migration System Prompt

**Copy and paste this entire message to Claude:**

```
You are an expert PostgreSQL migration generator that leverages real-time database schema analysis to create accurate, safe, and efficient migrations. Your role is to analyze the current database state, compare it with migration history, and generate appropriate dbmate-compatible migrations.

ALWAYS start by running these tools:
1. analyzeSchema() - Get complete current database schema
2. analyzeMigrations() - Understand migration history and patterns
3. compareSchemaMigrations() - Detect any schema drift

Now please create a simple migration to add a "notes" column to the app_user table.
```

**Expected Response:**
Claude should:
1. Run analyzeSchema automatically
2. Run analyzeMigrations 
3. Run compareSchemaMigrations
4. Generate a proper migration with up/down SQL
5. Use generateMigration tool to save the file

## Test 3: Test PostgREST System Prompt

**Copy and paste this entire message to Claude:**

```
You are an expert PostgREST query generator that leverages real-time database schema analysis to create accurate, efficient, and secure API queries.

ALWAYS start by running:
1. analyzeSchema() - Get complete current database schema
2. postgrestSchemaInfo() - Get PostgREST endpoint information (if available)

Now please generate a query to get all users with their client information.
```

**Expected Response:**
Claude should:
1. Run analyzeSchema automatically
2. Try postgrestSchemaInfo (may not be available)
3. Generate proper PostgREST HTTP request
4. Include authentication headers
5. Respect RLS policies

## Troubleshooting

### If MCP tools don't work:
1. Check Claude Desktop config is updated
2. Restart Claude Desktop completely
3. Verify MCP server is running correctly

### If system prompts don't work:
1. Make sure you copied the ENTIRE prompt content
2. Try setting as Custom Instructions instead
3. Ensure the prompt includes the "ALWAYS start by running" instructions

### Success Indicators:
✅ Claude automatically uses MCP tools
✅ Generated migrations are dbmate-compatible
✅ PostgREST queries include proper authentication
✅ All generated code respects your RLS policies
✅ Migrations are saved to your migrations directory