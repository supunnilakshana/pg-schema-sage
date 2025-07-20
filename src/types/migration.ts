export interface Migration {
  version: string;
  name: string;
  filename: string;
  upSql: string;
  downSql: string;
  appliedAt?: Date;
  checksum?: string;
}

export interface MigrationFile {
  filename: string;
  content: string;
  parsed: ParsedMigration;
}

export interface ParsedMigration {
  version: string;
  name: string;
  upSql: string;
  downSql: string;
  hasValidStructure: boolean;
  errors: string[];
}

export interface MigrationHistory {
  appliedMigrations: AppliedMigration[];
  pendingMigrations: Migration[];
  totalMigrations: number;
  lastAppliedVersion?: string;
  migrationChain: Migration[];
}

export interface AppliedMigration {
  version: string;
  appliedAt: Date;
}

export interface MigrationAnalysis {
  totalFiles: number;
  validMigrations: number;
  invalidMigrations: number;
  missingDownMigrations: number;
  duplicateVersions: string[];
  migrationChain: Migration[];
  errors: MigrationError[];
}

export interface MigrationError {
  filename: string;
  type: 'PARSE_ERROR' | 'DUPLICATE_VERSION' | 'MISSING_DOWN' | 'INVALID_VERSION';
  message: string;
  line?: number;
}

export interface SchemaDrift {
  hasChanges: boolean;
  missingTables: string[];
  extraTables: string[];
  modifiedTables: TableDrift[];
  missingIndexes: string[];
  extraIndexes: string[];
  missingViews: string[];
  extraViews: string[];
  modifiedViews: ViewDrift[];
  missingTriggers: string[];
  extraTriggers: string[];
  missingRLSPolicies: string[];
  extraRLSPolicies: string[];
  summary: string;
}

export interface ViewDrift {
  viewName: string;
  definitionChanged: boolean;
  oldDefinition?: string;
  newDefinition?: string;
}

export interface TriggerDrift {
  triggerName: string;
  tableName: string;
  changes: TriggerChange[];
}

export interface TriggerChange {
  property: string;
  expected: string;
  actual: string;
}

export interface RLSPolicyDrift {
  policyName: string;
  tableName: string;
  changes: RLSPolicyChange[];
}

export interface RLSPolicyChange {
  property: string;
  expected: string;
  actual: string;
}

export interface TableDrift {
  tableName: string;
  missingColumns: string[];
  extraColumns: string[];
  modifiedColumns: ColumnDrift[];
  missingConstraints: string[];
  extraConstraints: string[];
}

export interface ColumnDrift {
  columnName: string;
  changes: ColumnChange[];
}

export interface ColumnChange {
  property: string;
  expected: string;
  actual: string;
}

export interface GeneratedMigration {
  version: string;
  name: string;
  filename: string;
  upSql: string;
  downSql: string;
  timestamp: Date;
  operations: MigrationOperation[];
}

export interface MigrationOperation {
  type: 'CREATE_TABLE' | 'DROP_TABLE' | 'ADD_COLUMN' | 'DROP_COLUMN' | 'MODIFY_COLUMN' | 
        'CREATE_INDEX' | 'DROP_INDEX' | 'ADD_CONSTRAINT' | 'DROP_CONSTRAINT' | 'CREATE_ENUM' | 
        'DROP_ENUM' | 'CREATE_EXTENSION' | 'DROP_EXTENSION';
  table?: string;
  column?: string;
  index?: string;
  constraint?: string;
  enum?: string;
  extension?: string;
  sql: string;
  reverseSql?: string;
}

export interface MigrationTemplate {
  name: string;
  description: string;
  upTemplate: string;
  downTemplate: string;
  variables: TemplateVariable[];
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  required: boolean;
  defaultValue?: string;
}