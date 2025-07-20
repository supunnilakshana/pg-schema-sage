import { MigrationTemplate } from '../types/migration.js';

export const migrationTemplates: MigrationTemplate[] = [
  {
    name: 'create_table',
    description: 'Create a new table with columns',
    upTemplate: `CREATE TABLE {{tableName}} (
  id SERIAL PRIMARY KEY,
  {{columns}}
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
    downTemplate: `DROP TABLE {{tableName}};`,
    variables: [
      {
        name: 'tableName',
        type: 'string',
        description: 'Name of the table to create',
        required: true,
      },
      {
        name: 'columns',
        type: 'string',
        description: 'Column definitions (name type constraints,)',
        required: true,
      },
    ],
  },
  {
    name: 'add_column',
    description: 'Add a new column to an existing table',
    upTemplate: `ALTER TABLE {{tableName}} ADD COLUMN {{columnName}} {{columnType}}{{#if notNull}} NOT NULL{{/if}}{{#if defaultValue}} DEFAULT {{defaultValue}}{{/if}};`,
    downTemplate: `ALTER TABLE {{tableName}} DROP COLUMN {{columnName}};`,
    variables: [
      {
        name: 'tableName',
        type: 'string',
        description: 'Name of the table',
        required: true,
      },
      {
        name: 'columnName',
        type: 'string',
        description: 'Name of the column to add',
        required: true,
      },
      {
        name: 'columnType',
        type: 'string',
        description: 'PostgreSQL column type (e.g., VARCHAR(255), INTEGER)',
        required: true,
      },
      {
        name: 'notNull',
        type: 'boolean',
        description: 'Whether the column should be NOT NULL',
        required: false,
        defaultValue: 'false',
      },
      {
        name: 'defaultValue',
        type: 'string',
        description: 'Default value for the column',
        required: false,
      },
    ],
  },
  {
    name: 'create_index',
    description: 'Create an index on table columns',
    upTemplate: `CREATE{{#if unique}} UNIQUE{{/if}} INDEX{{#if concurrent}} CONCURRENTLY{{/if}} {{indexName}} ON {{tableName}} ({{columns}}){{#if condition}} WHERE {{condition}}{{/if}};`,
    downTemplate: `DROP INDEX{{#if concurrent}} CONCURRENTLY{{/if}} {{indexName}};`,
    variables: [
      {
        name: 'indexName',
        type: 'string',
        description: 'Name of the index',
        required: true,
      },
      {
        name: 'tableName',
        type: 'string',
        description: 'Name of the table',
        required: true,
      },
      {
        name: 'columns',
        type: 'string',
        description: 'Comma-separated list of column names',
        required: true,
      },
      {
        name: 'unique',
        type: 'boolean',
        description: 'Whether the index should be unique',
        required: false,
        defaultValue: 'false',
      },
      {
        name: 'concurrent',
        type: 'boolean',
        description: 'Whether to create the index concurrently',
        required: false,
        defaultValue: 'false',
      },
      {
        name: 'condition',
        type: 'string',
        description: 'Optional WHERE condition for partial index',
        required: false,
      },
    ],
  },
  {
    name: 'add_foreign_key',
    description: 'Add a foreign key constraint',
    upTemplate: `ALTER TABLE {{tableName}} ADD CONSTRAINT {{constraintName}} FOREIGN KEY ({{columnName}}) REFERENCES {{referencedTable}}({{referencedColumn}}){{#if onDelete}} ON DELETE {{onDelete}}{{/if}}{{#if onUpdate}} ON UPDATE {{onUpdate}}{{/if}};`,
    downTemplate: `ALTER TABLE {{tableName}} DROP CONSTRAINT {{constraintName}};`,
    variables: [
      {
        name: 'tableName',
        type: 'string',
        description: 'Name of the table',
        required: true,
      },
      {
        name: 'constraintName',
        type: 'string',
        description: 'Name of the foreign key constraint',
        required: true,
      },
      {
        name: 'columnName',
        type: 'string',
        description: 'Name of the column with foreign key',
        required: true,
      },
      {
        name: 'referencedTable',
        type: 'string',
        description: 'Name of the referenced table',
        required: true,
      },
      {
        name: 'referencedColumn',
        type: 'string',
        description: 'Name of the referenced column',
        required: true,
      },
      {
        name: 'onDelete',
        type: 'string',
        description: 'ON DELETE action (CASCADE, SET NULL, RESTRICT, etc.)',
        required: false,
      },
      {
        name: 'onUpdate',
        type: 'string',
        description: 'ON UPDATE action (CASCADE, SET NULL, RESTRICT, etc.)',
        required: false,
      },
    ],
  },
  {
    name: 'create_enum',
    description: 'Create a new enum type',
    upTemplate: `CREATE TYPE {{enumName}} AS ENUM ({{values}});`,
    downTemplate: `DROP TYPE {{enumName}};`,
    variables: [
      {
        name: 'enumName',
        type: 'string',
        description: 'Name of the enum type',
        required: true,
      },
      {
        name: 'values',
        type: 'string',
        description: 'Comma-separated list of enum values (quoted)',
        required: true,
      },
    ],
  },
  {
    name: 'create_extension',
    description: 'Create a PostgreSQL extension',
    upTemplate: `CREATE EXTENSION IF NOT EXISTS {{extensionName}}{{#if schema}} WITH SCHEMA {{schema}}{{/if}};`,
    downTemplate: `DROP EXTENSION IF EXISTS {{extensionName}};`,
    variables: [
      {
        name: 'extensionName',
        type: 'string',
        description: 'Name of the extension',
        required: true,
      },
      {
        name: 'schema',
        type: 'string',
        description: 'Schema to install extension in',
        required: false,
      },
    ],
  },
  {
    name: 'rename_table',
    description: 'Rename a table',
    upTemplate: `ALTER TABLE {{oldTableName}} RENAME TO {{newTableName}};`,
    downTemplate: `ALTER TABLE {{newTableName}} RENAME TO {{oldTableName}};`,
    variables: [
      {
        name: 'oldTableName',
        type: 'string',
        description: 'Current name of the table',
        required: true,
      },
      {
        name: 'newTableName',
        type: 'string',
        description: 'New name for the table',
        required: true,
      },
    ],
  },
  {
    name: 'modify_column',
    description: 'Modify a column type or constraints',
    upTemplate: `ALTER TABLE {{tableName}} ALTER COLUMN {{columnName}} TYPE {{newType}}{{#if using}} USING {{using}}{{/if}};{{#if setNotNull}}
ALTER TABLE {{tableName}} ALTER COLUMN {{columnName}} SET NOT NULL;{{/if}}{{#if dropNotNull}}
ALTER TABLE {{tableName}} ALTER COLUMN {{columnName}} DROP NOT NULL;{{/if}}{{#if setDefault}}
ALTER TABLE {{tableName}} ALTER COLUMN {{columnName}} SET DEFAULT {{defaultValue}};{{/if}}{{#if dropDefault}}
ALTER TABLE {{tableName}} ALTER COLUMN {{columnName}} DROP DEFAULT;{{/if}}`,
    downTemplate: `-- Reverse the column modification
ALTER TABLE {{tableName}} ALTER COLUMN {{columnName}} TYPE {{oldType}}{{#if oldUsing}} USING {{oldUsing}}{{/if}};{{#if wasNotNull}}
ALTER TABLE {{tableName}} ALTER COLUMN {{columnName}} SET NOT NULL;{{/if}}{{#if wasNullable}}
ALTER TABLE {{tableName}} ALTER COLUMN {{columnName}} DROP NOT NULL;{{/if}}{{#if oldDefault}}
ALTER TABLE {{tableName}} ALTER COLUMN {{columnName}} SET DEFAULT {{oldDefault}};{{/if}}{{#if hadNoDefault}}
ALTER TABLE {{tableName}} ALTER COLUMN {{columnName}} DROP DEFAULT;{{/if}}`,
    variables: [
      {
        name: 'tableName',
        type: 'string',
        description: 'Name of the table',
        required: true,
      },
      {
        name: 'columnName',
        type: 'string',
        description: 'Name of the column to modify',
        required: true,
      },
      {
        name: 'newType',
        type: 'string',
        description: 'New column type',
        required: true,
      },
      {
        name: 'oldType',
        type: 'string',
        description: 'Original column type (for rollback)',
        required: true,
      },
      {
        name: 'using',
        type: 'string',
        description: 'USING clause for type conversion',
        required: false,
      },
      {
        name: 'oldUsing',
        type: 'string',
        description: 'USING clause for rollback',
        required: false,
      },
    ],
  },
  {
    name: 'create_view',
    description: 'Create a database view',
    upTemplate: `CREATE VIEW {{viewName}} AS
{{viewDefinition}};`,
    downTemplate: `DROP VIEW {{viewName}};`,
    variables: [
      {
        name: 'viewName',
        type: 'string',
        description: 'Name of the view to create',
        required: true,
      },
      {
        name: 'viewDefinition',
        type: 'string',
        description: 'SELECT statement defining the view',
        required: true,
      },
    ],
  },
  {
    name: 'create_trigger',
    description: 'Create a database trigger',
    upTemplate: `CREATE TRIGGER {{triggerName}}
  {{timing}} {{events}} ON {{tableName}}
  FOR EACH {{orientation}}
  {{condition}}
  EXECUTE FUNCTION {{functionName}}();`,
    downTemplate: `DROP TRIGGER {{triggerName}} ON {{tableName}};`,
    variables: [
      {
        name: 'triggerName',
        type: 'string',
        description: 'Name of the trigger',
        required: true,
      },
      {
        name: 'timing',
        type: 'string',
        description: 'Trigger timing (BEFORE, AFTER, INSTEAD OF)',
        required: true,
      },
      {
        name: 'events',
        type: 'string',
        description: 'Trigger events (INSERT, UPDATE, DELETE, TRUNCATE)',
        required: true,
      },
      {
        name: 'tableName',
        type: 'string',
        description: 'Name of the table',
        required: true,
      },
      {
        name: 'orientation',
        type: 'string',
        description: 'Trigger orientation (ROW, STATEMENT)',
        required: true,
      },
      {
        name: 'functionName',
        type: 'string',
        description: 'Name of the trigger function',
        required: true,
      },
      {
        name: 'condition',
        type: 'string',
        description: 'Optional WHEN condition',
        required: false,
      },
    ],
  },
  {
    name: 'create_rls_policy',
    description: 'Create a Row Level Security policy',
    upTemplate: `CREATE POLICY {{policyName}} ON {{tableName}}
  {{permissive}} FOR {{command}}
  TO {{roles}}
  {{usingClause}}
  {{withCheckClause}};`,
    downTemplate: `DROP POLICY {{policyName}} ON {{tableName}};`,
    variables: [
      {
        name: 'policyName',
        type: 'string',
        description: 'Name of the RLS policy',
        required: true,
      },
      {
        name: 'tableName',
        type: 'string',
        description: 'Name of the table',
        required: true,
      },
      {
        name: 'permissive',
        type: 'string',
        description: 'AS PERMISSIVE or AS RESTRICTIVE',
        required: false,
        defaultValue: 'AS PERMISSIVE',
      },
      {
        name: 'command',
        type: 'string',
        description: 'Policy command (ALL, SELECT, INSERT, UPDATE, DELETE)',
        required: true,
      },
      {
        name: 'roles',
        type: 'string',
        description: 'Roles the policy applies to',
        required: true,
      },
      {
        name: 'usingClause',
        type: 'string',
        description: 'USING condition for the policy',
        required: false,
      },
      {
        name: 'withCheckClause',
        type: 'string',
        description: 'WITH CHECK condition for the policy',
        required: false,
      },
    ],
  },
  {
    name: 'enable_rls',
    description: 'Enable Row Level Security on a table',
    upTemplate: `ALTER TABLE {{tableName}} ENABLE ROW LEVEL SECURITY;`,
    downTemplate: `ALTER TABLE {{tableName}} DISABLE ROW LEVEL SECURITY;`,
    variables: [
      {
        name: 'tableName',
        type: 'string',
        description: 'Name of the table',
        required: true,
      },
    ],
  },
  {
    name: 'alter_view',
    description: 'Alter a view definition',
    upTemplate: `CREATE OR REPLACE VIEW {{viewName}} AS
{{newViewDefinition}};`,
    downTemplate: `CREATE OR REPLACE VIEW {{viewName}} AS
{{oldViewDefinition}};`,
    variables: [
      {
        name: 'viewName',
        type: 'string',
        description: 'Name of the view to alter',
        required: true,
      },
      {
        name: 'newViewDefinition',
        type: 'string',
        description: 'New SELECT statement for the view',
        required: true,
      },
      {
        name: 'oldViewDefinition',
        type: 'string',
        description: 'Original SELECT statement for rollback',
        required: true,
      },
    ],
  },
  {
    name: 'create_trigger_function',
    description: 'Create a trigger function',
    upTemplate: `CREATE OR REPLACE FUNCTION {{functionName}}()
RETURNS TRIGGER AS $$
BEGIN
  {{functionBody}}
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;`,
    downTemplate: `DROP FUNCTION {{functionName}}();`,
    variables: [
      {
        name: 'functionName',
        type: 'string',
        description: 'Name of the trigger function',
        required: true,
      },
      {
        name: 'functionBody',
        type: 'string',
        description: 'Body of the trigger function',
        required: true,
      },
    ],
  },
  {
    name: 'drop_view',
    description: 'Drop a view',
    upTemplate: `DROP VIEW {{viewName}}{{#if cascade}} CASCADE{{/if}};`,
    downTemplate: `CREATE VIEW {{viewName}} AS
{{viewDefinition}};`,
    variables: [
      {
        name: 'viewName',
        type: 'string',
        description: 'Name of the view to drop',
        required: true,
      },
      {
        name: 'viewDefinition',
        type: 'string',
        description: 'Original view definition for rollback',
        required: true,
      },
      {
        name: 'cascade',
        type: 'boolean',
        description: 'Whether to drop dependent objects',
        required: false,
        defaultValue: 'false',
      },
    ],
  },
];

export function getTemplate(name: string): MigrationTemplate | undefined {
  return migrationTemplates.find(t => t.name === name);
}

export function listTemplates(): MigrationTemplate[] {
  return migrationTemplates;
}

export function renderTemplate(template: MigrationTemplate, variables: Record<string, string>): { upSql: string; downSql: string } {
  let upSql = template.upTemplate;
  let downSql = template.downTemplate;
  
  // Simple template variable replacement
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    upSql = upSql.replace(regex, value);
    downSql = downSql.replace(regex, value);
  }
  
  // Handle simple conditionals {{#if variable}}...{{/if}}
  upSql = processConditionals(upSql, variables);
  downSql = processConditionals(downSql, variables);
  
  return { upSql, downSql };
}

function processConditionals(template: string, variables: Record<string, string>): string {
  let result = template;
  
  // Process {{#if variable}}...{{/if}} blocks
  const conditionalRegex = /{{#if\s+(\w+)}}(.*?){{\/if}}/gs;
  
  result = result.replace(conditionalRegex, (match, variable, content) => {
    const value = variables[variable];
    if (value && value !== 'false' && value !== '0') {
      return content;
    }
    return '';
  });
  
  return result;
}