# MCP Server Connection Troubleshooting Guide

## Common Connection Issues and Solutions

### 1. "Connection Error - Check if your MCP server is running"

This error typically occurs when:
- The server process isn't running
- The server exits immediately due to configuration issues
- The client can't communicate with the server

### 2. Quick Diagnosis Steps

#### Step 1: Check if the server builds successfully
```bash
npm run build
```
If this fails, fix the TypeScript compilation errors first.

#### Step 2: Test server startup
```bash
node build/index.js
```

**Expected behavior:** 
- Server should start and show configuration warnings (if not configured)
- Should not exit immediately
- Should wait for MCP protocol messages

#### Step 3: Test with minimal configuration
```bash
DB_NAME=test_db DB_USER=test_user DB_PASSWORD=test_pass node build/index.js
```

**Expected behavior:**
- No configuration warnings
- Server starts successfully
- Database connection may fail (if test database doesn't exist) but server should still run

### 3. MCP Client Configuration

#### For Claude Desktop (MCP client):
Add this to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "postgresql-migration": {
      "command": "node",
      "args": ["build/index.js"],
      "cwd": "/full/path/to/migration_server",
      "env": {
        "DB_NAME": "your_database_name",
        "DB_USER": "your_db_user",
        "DB_PASSWORD": "your_db_password",
        "DB_HOST": "localhost",
        "DB_PORT": "5432",
        "DB_SSL": "false"
      }
    }
  }
}
```

#### For other MCP clients:
- **Command**: `node`
- **Args**: `["build/index.js"]`
- **Working Directory**: Full path to the migration_server directory
- **Environment**: Set the required database variables

### 4. Environment Variables

#### Required Variables:
```bash
DB_NAME=your_database_name      # PostgreSQL database name
DB_USER=your_db_user            # PostgreSQL username
DB_PASSWORD=your_db_password    # PostgreSQL password
```

#### Optional Variables:
```bash
DB_HOST=localhost               # Database host (default: localhost)
DB_PORT=5432                   # Database port (default: 5432)
DB_SSL=false                   # Enable SSL (default: false)
MIGRATIONS_DIR=./db/migrations  # Migration files directory
MIGRATIONS_TABLE=schema_migrations  # Migration tracking table
```

#### PostgREST Variables (optional):
```bash
POSTGREST_ENDPOINT=http://localhost:3000
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_CLIENT_ID=your_client_id
KEYCLOAK_USERNAME=your_username
KEYCLOAK_PASSWORD=your_password
KEYCLOAK_REALM=master
```

### 5. Common Issues and Solutions

#### Issue: "Database service not available"
**Solution:** Set the required environment variables (DB_NAME, DB_USER, DB_PASSWORD).

#### Issue: Server exits immediately
**Solution:** 
1. Check if you have the latest version with improved error handling
2. Make sure all required environment variables are set
3. Check for any error messages in the console

#### Issue: "ECONNREFUSED" database connection errors
**Solution:**
1. Verify PostgreSQL is running
2. Check database credentials
3. Verify database host/port
4. Test database connection manually: `psql -h localhost -U username -d database_name`

#### Issue: Tools not appearing in MCP client
**Solution:**
1. Check server logs for any startup errors
2. Verify MCP client configuration syntax
3. Restart the MCP client after configuration changes
4. Check working directory path is correct

### 6. Testing the Server

#### Basic Connectivity Test:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | DB_NAME=test DB_USER=test DB_PASSWORD=test node build/index.js
```

#### Check Available Tools:
The server should register these tools:
- `analyze_schema` - Analyze PostgreSQL schema
- `analyze_migrations` - Analyze migration files
- `compare_schema_migrations` - Compare schema vs migrations
- `generate_migration` - Generate new migration files
- `preview_migration` - Preview migration content

If PostgREST is configured:
- `postgrest_generate_query` - Generate PostgREST queries
- `postgrest_execute_query` - Execute PostgREST queries
- `postgrest_schema_info` - Get schema information
- `postgrest_test_connection` - Test PostgREST connection

### 7. Debugging Steps

#### Enable Verbose Logging:
```bash
DEBUG=* node build/index.js
```

#### Check File Permissions:
```bash
ls -la build/index.js
```
Should be readable and executable.

#### Check Node.js Version:
```bash
node --version
```
Requires Node.js 18+ for ES modules support.

#### Verify Dependencies:
```bash
npm list
```
Should show all dependencies installed without errors.

### 8. Development Mode

For development, you can run:
```bash
npm run dev
```

This will:
- Watch for file changes
- Rebuild automatically
- Restart the server

### 9. Error Handling

The server now includes improved error handling:
- **Graceful startup**: Server starts even without database configuration
- **Clear error messages**: Database-dependent tools show helpful error messages
- **Configuration validation**: Warns about missing configuration without crashing

### 10. Getting Help

If you're still having issues:

1. **Check the console output** for specific error messages
2. **Verify your MCP client configuration** matches the expected format
3. **Test the server independently** using the commands above
4. **Check database connectivity** separately from the MCP server

### 11. Example Working Configuration

Here's a complete working example:

**Environment file (.env):**
```bash
DB_NAME=my_app_db
DB_USER=postgres
DB_PASSWORD=password123
DB_HOST=localhost
DB_PORT=5432
DB_SSL=false
MIGRATIONS_DIR=./db/migrations
```

**MCP Client Configuration:**
```json
{
  "mcpServers": {
    "postgresql-migration": {
      "command": "node",
      "args": ["build/index.js"],
      "cwd": "/Users/username/projects/migration_server",
      "env": {
        "DB_NAME": "my_app_db",
        "DB_USER": "postgres",
        "DB_PASSWORD": "password123",
        "DB_HOST": "localhost",
        "DB_PORT": "5432",
        "DB_SSL": "false"
      }
    }
  }
}
```

This configuration should result in a successful connection to the MCP server.