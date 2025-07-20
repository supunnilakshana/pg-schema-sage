# System Prompt Testing Example

This document demonstrates how to test the migration and PostgREST system prompts with real MCP tools.

## Test Scenario: User Profile Enhancement

**Objective:** Add user profile features including email verification and user preferences.

### Step 1: Initial Schema Analysis

First, let's analyze the current database state:

```
MCP Tool: analyzeSchema
Input: {}
```

**Expected Output:** Complete schema analysis showing:
- Current tables (155 tables found)
- Views (9 views including user-related views)
- RLS policies (165 policies including user access policies)
- Functions and triggers
- Current user-related table structures

### Step 2: Migration History Analysis

```
MCP Tool: analyzeMigrations
Input: {
  "includeContent": false,
  "migrationsTable": "schema_migrations"
}
```

**Expected Output:** 
- Applied vs pending migrations
- Migration naming patterns
- Historical database changes

### Step 3: Schema Drift Detection

```
MCP Tool: compareSchemaMigrations
Input: {
  "migrationsTable": "schema_migrations",
  "includeDetails": true
}
```

**Expected Output:**
- Any differences between current schema and migration history
- Drift analysis results
- Schema consistency status

## Test Case 1: Migration Generation

**User Request:** "Add email verification fields to the app_user table"

### Expected Migration Generator Response:

Based on the schema analysis, the system should:

1. **Analyze Current State:**
   - Check if `app_user` table exists (it does based on our schema analysis)
   - Verify current column structure
   - Check existing RLS policies on app_user table
   - Look for existing email-related columns

2. **Generate Safe Migration:**
   ```sql
   -- migrate:up
   ALTER TABLE app_user ADD COLUMN email_verified BOOLEAN DEFAULT FALSE NOT NULL;
   ALTER TABLE app_user ADD COLUMN email_verification_token VARCHAR(255);
   ALTER TABLE app_user ADD COLUMN email_verification_expires_at TIMESTAMP;
   
   CREATE INDEX CONCURRENTLY idx_app_user_email_verification_token 
   ON app_user (email_verification_token) 
   WHERE email_verification_token IS NOT NULL;
   
   -- Update existing RLS policies if needed
   -- Based on analysis, app_user has existing RLS policies
   
   -- migrate:down
   DROP INDEX CONCURRENTLY idx_app_user_email_verification_token;
   ALTER TABLE app_user DROP COLUMN email_verification_expires_at;
   ALTER TABLE app_user DROP COLUMN email_verification_token;
   ALTER TABLE app_user DROP COLUMN email_verified;
   ```

3. **Save Migration:**
   ```
   MCP Tool: generateMigration
   Input: {
     "name": "add_email_verification_to_app_user",
     "upSql": "...", 
     "downSql": "...",
     "saveToFile": true
   }
   ```

## Test Case 2: PostgREST Query Generation

**User Request:** "Get all verified users with their client information"

### Expected PostgREST Generator Response:

1. **Schema Analysis Results:**
   - `app_user` table with email verification fields
   - `client_user` table linking users to clients
   - `client` table with client details
   - RLS policies requiring authentication
   - Foreign key relationships between tables

2. **Generated Query:**
   ```http
   GET /app_user?select=*,client_user(client(*))&email_verified=eq.true
   Authorization: Bearer <token>
   Content-Type: application/json
   Prefer: count=exact
   ```

3. **Alternative Approaches:**
   - Direct join vs nested selection
   - Performance considerations for large datasets
   - Pagination recommendations

## Test Case 3: Complex Migration with Data

**User Request:** "Create a user_preferences table and migrate existing user settings"

### Expected Migration Generator Response:

1. **Multi-Step Migration Plan:**
   - Create user_preferences table
   - Migrate existing data (if any settings exist)
   - Add foreign key constraints
   - Apply appropriate RLS policies
   - Create indexes for performance

2. **Generated Migration:**
   ```sql
   -- migrate:up
   -- Step 1: Create user_preferences table
   CREATE TABLE user_preferences (
     id SERIAL PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
     preference_key VARCHAR(255) NOT NULL,
     preference_value JSONB,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     UNIQUE(user_id, preference_key)
   );
   
   -- Step 2: Enable RLS (following existing pattern)
   ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
   
   -- Step 3: Create RLS policies (based on existing app_user policies)
   CREATE POLICY "Users can access own preferences" ON user_preferences
     FOR ALL TO authenticated
     USING (auth.uid() = user_id)
     WITH CHECK (auth.uid() = user_id);
   
   -- Step 4: Create indexes
   CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);
   CREATE INDEX idx_user_preferences_key ON user_preferences(preference_key);
   
   -- migrate:down
   DROP TABLE user_preferences CASCADE;
   ```

## Testing the System Prompts

### Manual Testing Steps:

1. **Start the MCP Server:**
   ```bash
   npm run build && npm start
   ```

2. **Test Schema Analysis:**
   - Use `analyzeSchema` tool in Claude Desktop
   - Verify all database objects are detected
   - Check RLS policy information is included

3. **Test Migration Tools:**
   - Use the migration generator prompt
   - Generate a simple migration
   - Verify the migration file is created
   - Check migration format is dbmate-compatible

4. **Test PostgREST Tools:**
   - Use the PostgREST generator prompt
   - Generate queries for existing tables
   - Verify queries respect RLS policies
   - Test query execution (if PostgREST is configured)

### Validation Criteria:

✅ **Schema Analysis Integration:**
- System prompts correctly use `analyzeSchema` before generation
- Generated content reflects actual database state
- RLS policies are properly considered

✅ **Migration Safety:**
- All migrations include proper down operations
- CONCURRENTLY is used for index operations
- Foreign key dependencies are handled correctly

✅ **PostgREST Accuracy:**
- Generated queries work with actual table structures
- Relationships are correctly identified and used
- Authentication requirements are included

✅ **Error Handling:**
- Graceful fallback when tools are unavailable
- Clear error messages for schema mismatches
- Helpful suggestions for fixing issues

### Expected Results:

The system prompts should demonstrate:
- **Real-time schema awareness** - adapting to your actual database structure
- **Security consciousness** - respecting existing RLS policies
- **Performance optimization** - using indexes and efficient query patterns
- **Safety first** - generating reversible, non-destructive migrations

This testing approach validates that the system prompts effectively leverage the MCP schema analysis tools to generate accurate, safe, and efficient database operations.