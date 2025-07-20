# PostgREST Query Maker: From Natural Language to REST API Queries

## Overview

The **PostgREST Query Maker** is a revolutionary feature that transforms natural language descriptions into production-ready PostgREST API queries. By analyzing your actual database schema and understanding table relationships, it generates optimized queries with proper authentication, filtering, and performance considerations.

## Quick Start

### 1. Configuration

First, ensure your PostgREST and Keycloak services are configured:

```bash
# PostgREST Configuration
POSTGREST_ENDPOINT=https://api.yourcompany.com
POSTGREST_PORT=3000

# Keycloak Authentication
KEYCLOAK_URL=https://auth.yourcompany.com
KEYCLOAK_CLIENT_ID=postgrest-client
KEYCLOAK_USERNAME=api_user
KEYCLOAK_PASSWORD=api_password
KEYCLOAK_REALM=production
```

### 2. Basic Usage

Using Claude with the MCP server, simply describe what data you need:

```
You: "Get all active users with their email addresses"

Claude: I'll generate a PostgREST query for you.

*Uses postgrest_generate_query tool*

Generated Query:
GET /app_user?select=id,email,status&status=eq.active
Authorization: Bearer <your-jwt-token>
Content-Type: application/json
```

## Core Features

### 1. Schema-Aware Query Generation

The system analyzes your database schema in real-time to understand:
- **Table Structures**: Column names, data types, constraints
- **Relationships**: Foreign key connections between tables
- **Indexes**: Available indexes for performance optimization
- **RLS Policies**: Row Level Security configurations
- **Permissions**: Required access levels for operations

### 2. Natural Language Processing

Transform conversational requests into precise API calls:

**Input:** "Show me recent orders with customer information"
**Output:** Optimized PostgREST query with proper joins and filtering

### 3. Complete HTTP Request Generation

Get production-ready requests including:
- **HTTP Method**: GET, POST, PATCH, DELETE
- **Authentication Headers**: Keycloak JWT tokens
- **Query Parameters**: Filtering, sorting, pagination
- **Request Body**: For POST/PATCH operations
- **Response Preferences**: Return formats and metadata

## Real-World Examples

### Example 1: E-commerce Data Retrieval

#### Simple Product Listing

**Request:**
```
"Get all products with their categories and current inventory"
```

**Generated Query:**
```http
GET /products?select=*,category(*),inventory(quantity,warehouse_location)
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
Content-Type: application/json
Prefer: count=exact
```

**Claude's Explanation:**
- Selects all product fields using `*`
- Includes related category information via foreign key relationship
- Fetches inventory data with specific fields (quantity, warehouse_location)
- Adds count preference for pagination metadata

#### Filtered Product Search

**Request:**
```
"Show me all electronics products under $500 that are in stock"
```

**Generated Query:**
```http
GET /products?select=*,category(name),inventory(quantity)&category.name=eq.Electronics&price=lt.500&inventory.quantity=gt.0
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
Content-Type: application/json
```

### Example 2: User Management Queries

#### User Profile with Permissions

**Request:**
```
"Get user profile for john@example.com with their role assignments and client access"
```

**Generated Query:**
```http
GET /app_user?select=*,user_role(role(name,permissions)),client_user(client(name,slug))&email=eq.john@example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
Content-Type: application/json
```

**Query Breakdown:**
- `app_user` - Main user table
- `user_role(role(name,permissions))` - Nested join to get role information
- `client_user(client(name,slug))` - Client access through junction table
- `email=eq.john@example.com` - Exact email filter

#### Active Users by Client

**Request:**
```
"List all active users for client 'acme-corp' with their last login dates"
```

**Generated Query:**
```http
GET /app_user?select=id,email,first_name,last_name,last_login,client_user(client(name))&status=eq.active&client_user.client.slug=eq.acme-corp&order=last_login.desc
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
Content-Type: application/json
```

### Example 3: Analytics and Reporting

#### Sales Dashboard Data

**Request:**
```
"Get monthly sales totals for the last 6 months with customer counts"
```

**Generated Query:**
```http
GET /orders?select=created_at,total_amount,customer_id&created_at=gte.2023-06-01&created_at=lt.2024-01-01
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
Content-Type: application/json
```

**Follow-up Processing Note:**
The system suggests using PostgREST's built-in aggregation or creating a database view for complex analytics.

#### Customer Activity Report

**Request:**
```
"Show customers who placed orders in the last 30 days with order counts and total spending"
```

**Generated Query:**
```http
GET /customers?select=*,orders(count,total_amount.sum)&orders.created_at=gte.2024-01-01
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
Content-Type: application/json
```

### Example 4: Multi-tenant Scenarios

#### Tenant-Specific Data Access

**Request:**
```
"Get all projects for the current user's organization with team member details"
```

**Generated Query:**
```http
GET /projects?select=*,project_members(user(first_name,last_name,email))&organization_id=eq.123
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
RLS-Context: organization_id=123
Content-Type: application/json
```

**Security Note:** The system automatically detects RLS policies and includes appropriate context.

## Advanced Query Patterns

### 1. Aggregations and Calculations

**Request:**
```
"Calculate average order value by customer segment for this quarter"
```

**Generated Query:**
```http
GET /orders?select=customer(segment),total_amount.avg&created_at=gte.2024-01-01&created_at=lt.2024-04-01&group=customer.segment
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
Content-Type: application/json
```

### 2. Complex Filtering

**Request:**
```
"Find users who haven't logged in for 30 days but have active subscriptions"
```

**Generated Query:**
```http
GET /app_user?select=*,subscription(status,expires_at)&last_login=lt.2024-01-01&subscription.status=eq.active&subscription.expires_at=gt.2024-01-31
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
Content-Type: application/json
```

### 3. Pagination and Sorting

**Request:**
```
"Get the latest 20 blog posts with author information, sorted by publish date"
```

**Generated Query:**
```http
GET /blog_posts?select=*,author(name,avatar_url)&status=eq.published&order=published_at.desc&limit=20
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
Content-Type: application/json
Range: 0-19
```

## Data Modification Operations

### 1. Creating Records (POST)

**Request:**
```
"Create a new customer with email 'new@example.com' and name 'New Customer'"
```

**Generated Query:**
```http
POST /customers
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
Content-Type: application/json
Prefer: return=representation

{
  "email": "new@example.com",
  "name": "New Customer",
  "status": "active",
  "created_at": "2024-01-31T10:00:00Z"
}
```

### 2. Updating Records (PATCH)

**Request:**
```
"Update user john@example.com to set status as inactive"
```

**Generated Query:**
```http
PATCH /app_user?email=eq.john@example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
Content-Type: application/json
Prefer: return=representation

{
  "status": "inactive",
  "updated_at": "2024-01-31T10:00:00Z"
}
```

### 3. Bulk Operations

**Request:**
```
"Mark all pending orders from yesterday as processing"
```

**Generated Query:**
```http
PATCH /orders?status=eq.pending&created_at=gte.2024-01-30&created_at=lt.2024-01-31
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
Content-Type: application/json
Prefer: return=representation

{
  "status": "processing",
  "updated_at": "2024-01-31T10:00:00Z"
}
```

## Authentication and Security

### 1. Keycloak Integration

The system automatically handles Keycloak authentication:

```typescript
// Automatic token management
const authToken = await keycloakAuth.getAccessToken({
  username: process.env.KEYCLOAK_USERNAME,
  password: process.env.KEYCLOAK_PASSWORD,
  clientId: process.env.KEYCLOAK_CLIENT_ID,
  realm: process.env.KEYCLOAK_REALM
});
```

### 2. Row Level Security (RLS) Awareness

When RLS policies are detected, the system:
- Includes appropriate filtering in queries
- Adds RLS context headers when needed
- Respects tenant isolation rules
- Validates permissions before query generation

**Example RLS-Aware Query:**
```http
GET /sensitive_data?select=*&organization_id=eq.current_user_org
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
RLS-Policy: organization_isolation
```

### 3. Permission Validation

Before generating queries, the system checks:
- **Table Access**: Can the user read from the specified tables?
- **Column Permissions**: Are all requested columns accessible?
- **Operation Rights**: Can the user perform the requested operation?
- **Row-Level Access**: Do RLS policies permit the query?

## Performance Optimization

### 1. Index Utilization

The system analyzes available indexes and suggests optimizations:

```
Query Analysis:
- Detected index on (user_id, created_at) for orders table
- Suggested filter order: user_id first, then created_at
- Recommended: Add limit to prevent large result sets
```

### 2. Query Optimization Suggestions

**Automatic Optimizations:**
- **Selective Fields**: Only request needed columns
- **Proper Joins**: Use foreign key relationships efficiently
- **Filter Placement**: Position filters for index utilization
- **Pagination**: Include range headers for large datasets

### 3. Performance Warnings

The system provides warnings for potentially expensive operations:

```
⚠️  Warning: Query may return large dataset
💡 Suggestion: Add date range filter or pagination
🔍 Optimization: Consider using database view for complex aggregation
```

## Error Handling and Troubleshooting

### 1. Common Query Issues

#### Missing Relationships
```
Error: Cannot join 'orders' to 'customers' - no foreign key found
Solution: Verify table relationships in database schema
```

#### Permission Denied
```
Error: Insufficient permissions for table 'sensitive_data'
Solution: Check user roles and RLS policies
```

#### Invalid Filters
```
Error: Column 'non_existent_field' not found in table 'users'
Solution: Use analyze_schema tool to verify available columns
```

### 2. Authentication Issues

#### Token Expiry
```
Error: JWT token expired
Solution: System automatically refreshes tokens, but check Keycloak configuration
```

#### Invalid Credentials
```
Error: Keycloak authentication failed
Solution: Verify KEYCLOAK_USERNAME and KEYCLOAK_PASSWORD environment variables
```

### 3. Schema Mismatches

#### Outdated Schema Information
```
Error: Generated query references non-existent table
Solution: Run analyze_schema tool to refresh schema cache
```

## Best Practices

### 1. Query Design

**DO:**
- Use specific field selection instead of `SELECT *` for performance
- Include pagination for large datasets
- Leverage indexes in filter conditions
- Use proper date range filters for time-based queries

**DON'T:**
- Request unnecessary nested relationships
- Create overly complex queries that should be database views
- Ignore RLS policies in multi-tenant applications
- Forget authentication headers

### 2. Security Considerations

**Always:**
- Use JWT tokens for authentication
- Respect RLS policies
- Validate user permissions before query execution
- Include audit trails for sensitive operations

**Never:**
- Expose sensitive data without proper authorization
- Bypass authentication mechanisms
- Ignore tenant isolation rules
- Cache authentication tokens improperly

### 3. Performance Guidelines

**Optimize for:**
- Minimal data transfer (select only needed fields)
- Index utilization (filter on indexed columns)
- Proper pagination (use range headers)
- Connection pooling (reuse database connections)

## Integration Examples

### 1. Frontend Application Integration

```javascript
// React/Vue.js example
const fetchUserDashboard = async (userId) => {
  const query = await claude.generatePostgRESTQuery(
    `Get user dashboard data for user ${userId} including recent orders and notifications`
  );
  
  const response = await fetch(query.url, {
    headers: query.headers,
    method: query.httpMethod
  });
  
  return response.json();
};
```

### 2. API Gateway Integration

```yaml
# OpenAPI specification generated from PostgREST schema
paths:
  /users:
    get:
      summary: Get users with advanced filtering
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [active, inactive]
      responses:
        200:
          description: User list with embedded relationships
```

### 3. Analytics Dashboard

```python
# Python analytics script
def generate_sales_report(start_date, end_date):
    query_description = f"""
    Generate sales report from {start_date} to {end_date} 
    including customer demographics and product categories
    """
    
    postgrest_query = claude.generate_query(query_description)
    return execute_query(postgrest_query)
```

## Conclusion

The **PostgREST Query Maker** transforms the way developers interact with REST APIs by providing:

- **Natural Language Interface**: Describe what you need in plain English
- **Schema Intelligence**: Leverages actual database structure for accurate queries
- **Security Awareness**: Respects authentication, authorization, and RLS policies
- **Performance Optimization**: Generates efficient queries with proper indexing
- **Complete Integration**: Provides production-ready HTTP requests

This tool eliminates the complexity of manually crafting PostgREST queries while ensuring best practices for security, performance, and maintainability. Whether you're building a simple CRUD application or a complex analytics dashboard, the PostgREST Query Maker provides the intelligence needed to work effectively with your PostgreSQL database through REST APIs.