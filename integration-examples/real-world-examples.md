# Real-World Integration Examples

Based on your actual database (155 tables, 9 views, 165 RLS policies), here are practical examples:

## Example 1: Add User Preferences Table

**Your Request:**
```
Add a user_preferences table to store user settings as JSON
```

**System Prompt Response:**
```
1. Analyzes your schema - finds app_user table structure
2. Checks existing RLS patterns - sees user access policies
3. Generates migration:

-- migrate:up
CREATE TABLE user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    preferences JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Enable RLS (following your existing pattern)
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Create policy based on your app_user policies
CREATE POLICY "Users can access own preferences" ON user_preferences
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- migrate:down
DROP TABLE user_preferences CASCADE;
```

## Example 2: Get User Data with Client Info

**Your Request:**
```
Get all active users with their client details for the dashboard
```

**System Prompt Response:**
```
1. Analyzes schema - finds app_user, client_user, client tables
2. Identifies relationships - client_user.user_id -> app_user.id
3. Checks RLS policies - requires authentication
4. Generates query:

GET /app_user?select=id,first_name,last_name,email,mobile,client_user(client(id,name,status))&order=created_at.desc
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
Prefer: count=exact

Alternative for better performance:
GET /client_user?select=user:user_id(first_name,last_name,email),client(name,status)&client.status=eq.active
```

## Example 3: Complex Migration with Data

**Your Request:**
```
Split the full_name column in users into first_name and last_name
```

**System Prompt Response:**
```
1. Analyzes current app_user structure
2. Sees existing first_name, last_name columns
3. Generates safe migration:

-- migrate:up
-- Step 1: Add temporary column for backup
ALTER TABLE app_user ADD COLUMN full_name_backup TEXT;

-- Step 2: Populate backup from existing data
UPDATE app_user SET full_name_backup = CONCAT(first_name, ' ', last_name) 
WHERE first_name IS NOT NULL AND last_name IS NOT NULL;

-- Step 3: Create function to split names (if needed)
-- [Only if you had a full_name column to split]

-- migrate:down
ALTER TABLE app_user DROP COLUMN full_name_backup;
```

## Example 4: Performance Optimization Query

**Your Request:**
```
Get task data with resources but optimize for performance
```

**System Prompt Response:**
```
1. Analyzes your existing views - finds task_resources_view
2. Recommends using existing optimized view:

GET /task_resources_view?select=*&task_status=eq.active&order=estimated_start_date.asc&limit=100
Authorization: Bearer <token>

Or for custom filtering:
GET /task?select=*,resource_schedule(resource(*))&status=eq.active&estimated_start_date=gte.2024-01-01
```

## Key Integration Benefits:

### ✅ Schema-Aware Generation
- Knows your 155 tables and their relationships
- Respects your 165 RLS policies
- Uses your existing naming conventions

### ✅ Safety-First Approach  
- Generates reversible migrations
- Warns about destructive operations
- Follows your security patterns

### ✅ Performance Optimization
- Uses your existing indexes
- Leverages your 9 views when appropriate
- Suggests CONCURRENTLY for large tables

### ✅ Real-Time Analysis
- Always checks current state first
- Adapts to schema changes
- Detects conflicts before generation