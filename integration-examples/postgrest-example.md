# PostgREST Query Generation Example

## How to Use the PostgREST System Prompt

### Step 1: Copy the System Prompt
Copy the content from `system-prompts/postgrest-query-generator-prompt.md` and paste it at the beginning of your conversation with Claude.

### Step 2: Make Your Query Request
After pasting the system prompt, describe the API query you need.

### Example Conversation:

**User:**
```
[Paste the entire postgrest-query-generator-prompt.md content here]

I need to get all active users with their client information and recent posts.
```

**Claude Response (using the system prompt):**
```
I'll help you generate a PostgREST query to get active users with their client information and recent posts. Let me first analyze the current database schema to understand the table relationships.

[Uses analyzeSchema tool]
[Uses postgrestSchemaInfo tool if available]

Based on the schema analysis, I can see:
- app_user table with user data
- client_user table linking users to clients  
- client table with client details
- RLS policies are enabled requiring authentication

Here's the optimized PostgREST query:

GET /app_user?select=*,client_user(client(*))&status=eq.active&order=created_at.desc
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
Prefer: count=exact
```

## Expected Workflow:

1. **Schema Analysis**: Claude runs analyzeSchema() to understand table structures
2. **Relationship Discovery**: Claude identifies foreign keys and relationships
3. **RLS Awareness**: Claude checks RLS policies for security requirements
4. **Query Optimization**: Claude generates efficient queries using available indexes
5. **Complete HTTP Request**: Claude provides headers, auth, and parameters

## Real Query Examples:

### Simple User Lookup:
```http
GET /app_user?select=id,first_name,last_name,email&id=eq.123
Authorization: Bearer <token>
```

### Complex Relationship Query:
```http
GET /app_user?select=*,client_user(client(name,status)),employee(*)&status=eq.active&client_user.client.status=eq.active
Authorization: Bearer <token>
Prefer: count=exact
```

### Filtered with Pagination:
```http
GET /app_user?select=*&created_at=gte.2024-01-01&order=created_at.desc&limit=50&offset=0
Authorization: Bearer <token>
Range: 0-49
```