export function formatSql(sql: string): string {
  if (!sql.trim()) return '';
  
  let formatted = sql.trim();
  
  // Add line breaks after semicolons
  formatted = formatted.replace(/;\s*/g, ';\n');
  
  // Add proper indentation for common SQL keywords
  formatted = formatted.replace(/\b(SELECT|FROM|WHERE|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|ORDER BY|GROUP BY|HAVING|UNION|INSERT INTO|UPDATE|DELETE FROM|VALUES|SET)\b/gi, '\n$1');
  
  // Indent sub-clauses
  const lines = formatted.split('\n');
  const indented = lines.map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    
    // Keywords that should be at the base level
    const baseKeywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'ORDER BY', 'GROUP BY', 'HAVING', 'UNION', 'INSERT INTO', 'UPDATE', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE INDEX', 'DROP INDEX'];
    
    const isBaseKeyword = baseKeywords.some(keyword => 
      trimmed.toUpperCase().startsWith(keyword)
    );
    
    if (isBaseKeyword) {
      return trimmed;
    }
    
    // Check if previous line was a base keyword
    const prevLine = index > 0 ? lines[index - 1].trim() : '';
    const prevIsBase = baseKeywords.some(keyword => 
      prevLine.toUpperCase().startsWith(keyword)
    );
    
    if (prevIsBase || trimmed.startsWith('(') || trimmed.startsWith(')')) {
      return `  ${trimmed}`;
    }
    
    return trimmed;
  });
  
  // Clean up empty lines and extra spaces
  formatted = indented.join('\n').replace(/\n\s*\n/g, '\n').trim();
  
  return formatted;
}

export function formatCreateTable(tableName: string, columns: string[], constraints: string[] = []): string {
  const formattedColumns = columns.map(col => `  ${col}`).join(',\n');
  const formattedConstraints = constraints.length > 0 
    ? constraints.map(constraint => `  ${constraint}`).join(',\n')
    : '';
  
  const allItems = [formattedColumns, formattedConstraints].filter(Boolean).join(',\n');
  
  return `CREATE TABLE ${tableName} (\n${allItems}\n);`;
}

export function formatAlterTable(tableName: string, action: string): string {
  return `ALTER TABLE ${tableName} ${action};`;
}

export function formatCreateIndex(indexName: string, tableName: string, columns: string[], options: { unique?: boolean; concurrent?: boolean; condition?: string } = {}): string {
  const unique = options.unique ? 'UNIQUE ' : '';
  const concurrent = options.concurrent ? 'CONCURRENTLY ' : '';
  const condition = options.condition ? ` WHERE ${options.condition}` : '';
  
  return `CREATE ${unique}INDEX ${concurrent}${indexName} ON ${tableName} (${columns.join(', ')})${condition};`;
}

export function formatDropIndex(indexName: string, options: { concurrent?: boolean } = {}): string {
  const concurrent = options.concurrent ? 'CONCURRENTLY ' : '';
  return `DROP INDEX ${concurrent}${indexName};`;
}

export function formatAddColumn(tableName: string, columnName: string, columnType: string, options: { notNull?: boolean; defaultValue?: string } = {}): string {
  const notNull = options.notNull ? ' NOT NULL' : '';
  const defaultValue = options.defaultValue ? ` DEFAULT ${options.defaultValue}` : '';
  
  return `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}${notNull}${defaultValue};`;
}

export function formatDropColumn(tableName: string, columnName: string): string {
  return `ALTER TABLE ${tableName} DROP COLUMN ${columnName};`;
}

export function formatAddConstraint(tableName: string, constraintName: string, constraintDefinition: string): string {
  return `ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} ${constraintDefinition};`;
}

export function formatDropConstraint(tableName: string, constraintName: string): string {
  return `ALTER TABLE ${tableName} DROP CONSTRAINT ${constraintName};`;
}

export function formatCreateEnum(enumName: string, values: string[]): string {
  const quotedValues = values.map(v => `'${v}'`).join(', ');
  return `CREATE TYPE ${enumName} AS ENUM (${quotedValues});`;
}

export function formatDropEnum(enumName: string): string {
  return `DROP TYPE ${enumName};`;
}

export function formatCreateExtension(extensionName: string, schema?: string): string {
  const withSchema = schema ? ` WITH SCHEMA ${schema}` : '';
  return `CREATE EXTENSION IF NOT EXISTS ${extensionName}${withSchema};`;
}

export function formatDropExtension(extensionName: string): string {
  return `DROP EXTENSION IF EXISTS ${extensionName};`;
}

export function formatInsert(tableName: string, columns: string[], values: string[]): string {
  const columnList = columns.join(', ');
  const valueList = values.join(', ');
  return `INSERT INTO ${tableName} (${columnList}) VALUES (${valueList});`;
}

export function formatUpdate(tableName: string, setClause: string, whereClause?: string): string {
  const where = whereClause ? ` WHERE ${whereClause}` : '';
  return `UPDATE ${tableName} SET ${setClause}${where};`;
}

export function formatDelete(tableName: string, whereClause?: string): string {
  const where = whereClause ? ` WHERE ${whereClause}` : '';
  return `DELETE FROM ${tableName}${where};`;
}

export function minifySql(sql: string): string {
  return sql
    .replace(/\s+/g, ' ')
    .replace(/\s*([()=<>!,;])\s*/g, '$1')
    .trim();
}

export function prettifySql(sql: string): string {
  return formatSql(sql);
}

export function extractTableName(sql: string): string | null {
  const createTableMatch = sql.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)/i);
  if (createTableMatch) return createTableMatch[1];
  
  const alterTableMatch = sql.match(/ALTER TABLE\s+(\w+)/i);
  if (alterTableMatch) return alterTableMatch[1];
  
  const dropTableMatch = sql.match(/DROP TABLE\s+(?:IF EXISTS\s+)?(\w+)/i);
  if (dropTableMatch) return dropTableMatch[1];
  
  return null;
}

export function extractIndexName(sql: string): string | null {
  const createIndexMatch = sql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(\w+)/i);
  if (createIndexMatch) return createIndexMatch[1];
  
  const dropIndexMatch = sql.match(/DROP INDEX\s+(?:CONCURRENTLY\s+)?(?:IF EXISTS\s+)?(\w+)/i);
  if (dropIndexMatch) return dropIndexMatch[1];
  
  return null;
}

export function validateSqlSyntax(sql: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Basic syntax checks
  const openParens = (sql.match(/\(/g) || []).length;
  const closeParens = (sql.match(/\)/g) || []).length;
  
  if (openParens !== closeParens) {
    errors.push('Mismatched parentheses');
  }
  
  // Check for common SQL injection patterns (basic)
  const suspiciousPatterns = [
    /;\s*DROP\s+/i,
    /;\s*DELETE\s+/i,
    /;\s*UPDATE\s+/i,
    /UNION.*SELECT/i,
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(sql)) {
      errors.push('Potentially unsafe SQL pattern detected');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// View formatting utilities
export function formatCreateView(viewName: string, selectStatement: string, options: { replace?: boolean } = {}): string {
  const replace = options.replace ? 'OR REPLACE ' : '';
  return `CREATE ${replace}VIEW ${viewName} AS
${selectStatement};`;
}

export function formatDropView(viewName: string, options: { cascade?: boolean } = {}): string {
  const cascade = options.cascade ? ' CASCADE' : '';
  return `DROP VIEW ${viewName}${cascade};`;
}

export function formatAlterView(viewName: string, newSelectStatement: string): string {
  return `CREATE OR REPLACE VIEW ${viewName} AS
${newSelectStatement};`;
}

// Trigger formatting utilities
export function formatCreateTrigger(
  triggerName: string,
  tableName: string,
  timing: string,
  events: string[],
  orientation: string,
  functionName: string,
  options: { condition?: string } = {}
): string {
  const eventList = events.join(' OR ');
  const condition = options.condition ? `\n  WHEN (${options.condition})` : '';
  
  return `CREATE TRIGGER ${triggerName}
  ${timing} ${eventList} ON ${tableName}
  FOR EACH ${orientation}${condition}
  EXECUTE FUNCTION ${functionName}();`;
}

export function formatDropTrigger(triggerName: string, tableName: string): string {
  return `DROP TRIGGER ${triggerName} ON ${tableName};`;
}

export function formatCreateTriggerFunction(
  functionName: string,
  functionBody: string,
  options: { replace?: boolean; language?: string } = {}
): string {
  const replace = options.replace ? 'OR REPLACE ' : '';
  const language = options.language || 'plpgsql';
  
  return `CREATE ${replace}FUNCTION ${functionName}()
RETURNS TRIGGER AS $$
BEGIN
  ${functionBody}
  RETURN NEW;
END;
$$ LANGUAGE ${language};`;
}

export function formatDropTriggerFunction(functionName: string): string {
  return `DROP FUNCTION ${functionName}();`;
}

// RLS formatting utilities
export function formatCreateRLSPolicy(
  policyName: string,
  tableName: string,
  command: string,
  roles: string[],
  options: {
    permissive?: boolean;
    usingExpression?: string;
    withCheckExpression?: string;
  } = {}
): string {
  const permissive = options.permissive === false ? 'AS RESTRICTIVE' : 'AS PERMISSIVE';
  const roleList = roles.join(', ');
  const usingClause = options.usingExpression ? `\n  USING (${options.usingExpression})` : '';
  const withCheckClause = options.withCheckExpression ? `\n  WITH CHECK (${options.withCheckExpression})` : '';
  
  return `CREATE POLICY ${policyName} ON ${tableName}
  ${permissive} FOR ${command}
  TO ${roleList}${usingClause}${withCheckClause};`;
}

export function formatDropRLSPolicy(policyName: string, tableName: string): string {
  return `DROP POLICY ${policyName} ON ${tableName};`;
}

export function formatEnableRLS(tableName: string): string {
  return `ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`;
}

export function formatDisableRLS(tableName: string): string {
  return `ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY;`;
}

export function formatForceRLS(tableName: string, enable: boolean = true): string {
  const action = enable ? 'ENABLE' : 'DISABLE';
  return `ALTER TABLE ${tableName} ${action} ROW LEVEL SECURITY;`;
}

// Enhanced extraction utilities
export function extractViewName(sql: string): string | null {
  const createViewMatch = sql.match(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(\w+)/i);
  if (createViewMatch) return createViewMatch[1];
  
  const dropViewMatch = sql.match(/DROP\s+VIEW\s+(?:IF\s+EXISTS\s+)?(\w+)/i);
  if (dropViewMatch) return dropViewMatch[1];
  
  return null;
}

export function extractTriggerName(sql: string): string | null {
  const createTriggerMatch = sql.match(/CREATE\s+TRIGGER\s+(\w+)/i);
  if (createTriggerMatch) return createTriggerMatch[1];
  
  const dropTriggerMatch = sql.match(/DROP\s+TRIGGER\s+(\w+)/i);
  if (dropTriggerMatch) return dropTriggerMatch[1];
  
  return null;
}

export function extractPolicyName(sql: string): string | null {
  const createPolicyMatch = sql.match(/CREATE\s+POLICY\s+(\w+)/i);
  if (createPolicyMatch) return createPolicyMatch[1];
  
  const dropPolicyMatch = sql.match(/DROP\s+POLICY\s+(\w+)/i);
  if (dropPolicyMatch) return dropPolicyMatch[1];
  
  return null;
}

// Pretty formatting for view definitions
export function formatViewDefinition(selectStatement: string): string {
  return formatSql(selectStatement);
}

// Format trigger function body
export function formatTriggerFunctionBody(functionBody: string): string {
  const lines = functionBody.split('\n');
  const indentedLines = lines.map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    
    // Add indentation for function body
    if (index === 0 || trimmed.startsWith('--')) {
      return `  ${trimmed}`;
    }
    
    return `  ${trimmed}`;
  });
  
  return indentedLines.join('\n');
}