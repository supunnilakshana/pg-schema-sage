# Migration Generation Example

## How to Use the Migration System Prompt

### Step 1: Copy the System Prompt
Copy the content from `system-prompts/migration-generator-prompt.md` and paste it at the beginning of your conversation with Claude.

### Step 2: Make Your Request
After pasting the system prompt, make your migration request.

### Example Conversation:

**User:** 
```
[Paste the entire migration-generator-prompt.md content here]

Now please add email verification fields to the app_user table.
```

**Claude Response (using the system prompt):**
```
I'll help you add email verification fields to the app_user table. Let me start by analyzing the current database schema.

[Uses analyzeSchema tool]
[Uses analyzeMigrations tool] 
[Uses compareSchemaMigrations tool]

Based on the schema analysis, I can see that:
- app_user table exists with columns: id, first_name, last_name, email, mobile, etc.
- RLS is enabled with policies for user access
- No email verification columns currently exist

Here's the migration I'll generate:

[Uses generateMigration tool with proper SQL]
```

## Expected Workflow:

1. **Schema Analysis**: Claude automatically runs analyzeSchema()
2. **Migration History**: Claude checks existing patterns with analyzeMigrations()
3. **Drift Detection**: Claude ensures clean state with compareSchemaMigrations()
4. **Safe Migration**: Claude generates proper up/down SQL
5. **File Creation**: Claude uses generateMigration() to save the migration

## Real Example Output:

```sql
-- migrate:up
ALTER TABLE app_user ADD COLUMN email_verified BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE app_user ADD COLUMN email_verification_token VARCHAR(255);
ALTER TABLE app_user ADD COLUMN email_verification_expires_at TIMESTAMP;

CREATE INDEX CONCURRENTLY idx_app_user_email_verification_token 
ON app_user (email_verification_token) 
WHERE email_verification_token IS NOT NULL;

-- migrate:down
DROP INDEX CONCURRENTLY idx_app_user_email_verification_token;
ALTER TABLE app_user DROP COLUMN email_verification_expires_at;
ALTER TABLE app_user DROP COLUMN email_verification_token;
ALTER TABLE app_user DROP COLUMN email_verified;
```