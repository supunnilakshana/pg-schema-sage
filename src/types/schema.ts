export interface DatabaseSchema {
  tables: Table[];
  views: View[];
  enums: Enum[];
  functions: Function[];
  extensions: Extension[];
  indexes: Index[];
  triggers: Trigger[];
  rlsPolicies: RLSPolicy[];
}

export interface Table {
  schema: string;
  name: string;
  columns: Column[];
  constraints: Constraint[];
  indexes: Index[];
  comment?: string;
}

export interface Column {
  name: string;
  dataType: string;
  isNullable: boolean;
  defaultValue?: string;
  isGenerated: boolean;
  generationExpression?: string;
  comment?: string;
  ordinalPosition: number;
  characterMaximumLength?: number;
  numericPrecision?: number;
  numericScale?: number;
  isIdentity?: boolean;
}

export interface Constraint {
  name: string;
  type: ConstraintType;
  columns: string[];
  referencedTable?: string;
  referencedColumns?: string[];
  referencedSchema?: string;
  onDelete?: string;
  onUpdate?: string;
  checkClause?: string;
  isDeferrable: boolean;
  isDeferred: boolean;
  foreignKeyTable?: string;
  foreignKeyColumns?: string[];
}

export enum ConstraintType {
  PRIMARY_KEY = 'PRIMARY KEY',
  FOREIGN_KEY = 'FOREIGN KEY',
  UNIQUE = 'UNIQUE',
  CHECK = 'CHECK',
  NOT_NULL = 'NOT NULL',
}

export interface Index {
  name: string;
  tableName: string;
  schemaName: string;
  columns: IndexColumn[];
  isUnique: boolean;
  isPrimary: boolean;
  method: string;
  condition?: string;
  isConcurrent: boolean;
}

export interface IndexColumn {
  name: string;
  direction: 'ASC' | 'DESC';
  nullsOrder?: 'FIRST' | 'LAST';
}

export interface Enum {
  schema: string;
  name: string;
  values: string[];
}

export interface Function {
  schema: string;
  name: string;
  returnType: string;
  parameters: FunctionParameter[];
  language: string;
  definition: string;
}

export interface FunctionParameter {
  name: string;
  type: string;
  mode: 'IN' | 'OUT' | 'INOUT';
}

export interface Extension {
  name: string;
  version: string;
  schema: string;
}

export interface View {
  schema: string;
  name: string;
  definition: string;
  columns: ViewColumn[];
  owner: string;
  comment?: string;
  dependencies: ViewDependency[];
  isUpdatable: boolean;
  hasInsteadOfTriggers: boolean;
}

export interface ViewColumn {
  name: string;
  dataType: string;
  isNullable: boolean;
  ordinalPosition: number;
  characterMaximumLength?: number;
  numericPrecision?: number;
  numericScale?: number;
}

export interface ViewDependency {
  type: 'table' | 'view' | 'function';
  schema: string;
  name: string;
}

export interface Trigger {
  schema: string;
  name: string;
  tableName: string;
  timing: TriggerTiming;
  events: TriggerEvent[];
  orientation: TriggerOrientation;
  functionName: string;
  functionSchema: string;
  definition: string;
  condition?: string;
  isConstraint: boolean;
  isEnabled: boolean;
}

export enum TriggerTiming {
  BEFORE = 'BEFORE',
  AFTER = 'AFTER',
  INSTEAD_OF = 'INSTEAD OF',
}

export enum TriggerEvent {
  INSERT = 'INSERT',
  UPDATE = 'UPDATE', 
  DELETE = 'DELETE',
  TRUNCATE = 'TRUNCATE',
}

export enum TriggerOrientation {
  ROW = 'ROW',
  STATEMENT = 'STATEMENT',
}

export interface RLSPolicy {
  schema: string;
  tableName: string;
  policyName: string;
  permissive: boolean;
  roles: string[];
  command: RLSCommand;
  qualExpression?: string;
  withCheckExpression?: string;
}

export enum RLSCommand {
  ALL = 'ALL',
  SELECT = 'SELECT',
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}