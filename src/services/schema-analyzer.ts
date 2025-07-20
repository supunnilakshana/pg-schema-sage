import {
  DatabaseSchema,
  Table,
  Column,
  Index,
  Constraint,
  View,
  Trigger,
  RLSPolicy,
} from "../types/schema.js";
import {
  SchemaDrift,
  TableDrift,
  ColumnDrift,
  ColumnChange,
  Migration,
  ViewDrift,
  TriggerDrift,
  RLSPolicyDrift,
} from "../types/migration.js";

export class SchemaAnalyzer {
  compareSchemasWithMigrations(
    currentSchema: DatabaseSchema,
    migrations: Migration[]
  ): SchemaDrift {
    const expectedSchema = this.buildExpectedSchemaFromMigrations(migrations);
    return this.compareSchemas(expectedSchema, currentSchema);
  }

  compareSchemas(
    expected: DatabaseSchema,
    actual: DatabaseSchema
  ): SchemaDrift {
    const expectedTableMap = new Map(
      expected.tables.map((t) => [`${t.schema}.${t.name}`, t])
    );
    const actualTableMap = new Map(
      actual.tables.map((t) => [`${t.schema}.${t.name}`, t])
    );

    const missingTables: string[] = [];
    const extraTables: string[] = [];
    const modifiedTables: TableDrift[] = [];

    for (const [tableName, expectedTable] of expectedTableMap) {
      if (!actualTableMap.has(tableName)) {
        missingTables.push(tableName);
      } else {
        const actualTable = actualTableMap.get(tableName)!;
        const tableDrift = this.compareTable(expectedTable, actualTable);
        if (this.hasTableChanges(tableDrift)) {
          modifiedTables.push(tableDrift);
        }
      }
    }

    for (const tableName of actualTableMap.keys()) {
      if (!expectedTableMap.has(tableName)) {
        extraTables.push(tableName);
      }
    }

    const expectedIndexMap = new Map(
      expected.indexes.map((i) => [
        `${i.schemaName}.${i.tableName}.${i.name}`,
        i,
      ])
    );
    const actualIndexMap = new Map(
      actual.indexes.map((i) => [`${i.schemaName}.${i.tableName}.${i.name}`, i])
    );

    const missingIndexes: string[] = [];
    const extraIndexes: string[] = [];

    for (const indexName of expectedIndexMap.keys()) {
      if (!actualIndexMap.has(indexName)) {
        missingIndexes.push(indexName);
      }
    }

    for (const indexName of actualIndexMap.keys()) {
      if (!expectedIndexMap.has(indexName)) {
        extraIndexes.push(indexName);
      }
    }

    // Compare views
    const expectedViewMap = new Map(
      expected.views.map((v) => [`${v.schema}.${v.name}`, v])
    );
    const actualViewMap = new Map(
      actual.views.map((v) => [`${v.schema}.${v.name}`, v])
    );

    const missingViews: string[] = [];
    const extraViews: string[] = [];
    const modifiedViews: ViewDrift[] = [];

    for (const [viewName, expectedView] of expectedViewMap) {
      if (!actualViewMap.has(viewName)) {
        missingViews.push(viewName);
      } else {
        const actualView = actualViewMap.get(viewName)!;
        const viewDrift = this.compareView(expectedView, actualView);
        if (viewDrift.definitionChanged) {
          modifiedViews.push(viewDrift);
        }
      }
    }

    for (const viewName of actualViewMap.keys()) {
      if (!expectedViewMap.has(viewName)) {
        extraViews.push(viewName);
      }
    }

    // Compare triggers
    const expectedTriggerMap = new Map(
      expected.triggers.map((t) => [`${t.schema}.${t.tableName}.${t.name}`, t])
    );
    const actualTriggerMap = new Map(
      actual.triggers.map((t) => [`${t.schema}.${t.tableName}.${t.name}`, t])
    );

    const missingTriggers: string[] = [];
    const extraTriggers: string[] = [];

    for (const triggerName of expectedTriggerMap.keys()) {
      if (!actualTriggerMap.has(triggerName)) {
        missingTriggers.push(triggerName);
      }
    }

    for (const triggerName of actualTriggerMap.keys()) {
      if (!expectedTriggerMap.has(triggerName)) {
        extraTriggers.push(triggerName);
      }
    }

    // Compare RLS policies
    const expectedRLSMap = new Map(
      expected.rlsPolicies.map((p) => [
        `${p.schema}.${p.tableName}.${p.policyName}`,
        p,
      ])
    );
    const actualRLSMap = new Map(
      actual.rlsPolicies.map((p) => [
        `${p.schema}.${p.tableName}.${p.policyName}`,
        p,
      ])
    );

    const missingRLSPolicies: string[] = [];
    const extraRLSPolicies: string[] = [];

    for (const policyName of expectedRLSMap.keys()) {
      if (!actualRLSMap.has(policyName)) {
        missingRLSPolicies.push(policyName);
      }
    }

    for (const policyName of actualRLSMap.keys()) {
      if (!expectedRLSMap.has(policyName)) {
        extraRLSPolicies.push(policyName);
      }
    }

    const hasChanges =
      missingTables.length > 0 ||
      extraTables.length > 0 ||
      modifiedTables.length > 0 ||
      missingIndexes.length > 0 ||
      extraIndexes.length > 0 ||
      missingViews.length > 0 ||
      extraViews.length > 0 ||
      modifiedViews.length > 0 ||
      missingTriggers.length > 0 ||
      extraTriggers.length > 0 ||
      missingRLSPolicies.length > 0 ||
      extraRLSPolicies.length > 0;

    return {
      hasChanges,
      missingTables,
      extraTables,
      modifiedTables,
      missingIndexes,
      extraIndexes,
      missingViews,
      extraViews,
      modifiedViews,
      missingTriggers,
      extraTriggers,
      missingRLSPolicies,
      extraRLSPolicies,
      summary: this.generateSummary(
        hasChanges,
        missingTables,
        extraTables,
        modifiedTables
      ),
    };
  }

  private compareTable(expected: Table, actual: Table): TableDrift {
    const expectedColumnMap = new Map(expected.columns.map((c) => [c.name, c]));
    const actualColumnMap = new Map(actual.columns.map((c) => [c.name, c]));

    const missingColumns: string[] = [];
    const extraColumns: string[] = [];
    const modifiedColumns: ColumnDrift[] = [];

    for (const [columnName, expectedColumn] of expectedColumnMap) {
      if (!actualColumnMap.has(columnName)) {
        missingColumns.push(columnName);
      } else {
        const actualColumn = actualColumnMap.get(columnName)!;
        const columnDrift = this.compareColumn(expectedColumn, actualColumn);
        if (columnDrift.changes.length > 0) {
          modifiedColumns.push(columnDrift);
        }
      }
    }

    for (const columnName of actualColumnMap.keys()) {
      if (!expectedColumnMap.has(columnName)) {
        extraColumns.push(columnName);
      }
    }

    const expectedConstraintMap = new Map(
      expected.constraints.map((c) => [c.name, c])
    );
    const actualConstraintMap = new Map(
      actual.constraints.map((c) => [c.name, c])
    );

    const missingConstraints: string[] = [];
    const extraConstraints: string[] = [];

    for (const constraintName of expectedConstraintMap.keys()) {
      if (!actualConstraintMap.has(constraintName)) {
        missingConstraints.push(constraintName);
      }
    }

    for (const constraintName of actualConstraintMap.keys()) {
      if (!expectedConstraintMap.has(constraintName)) {
        extraConstraints.push(constraintName);
      }
    }

    return {
      tableName: `${expected.schema}.${expected.name}`,
      missingColumns,
      extraColumns,
      modifiedColumns,
      missingConstraints,
      extraConstraints,
    };
  }

  private compareColumn(expected: Column, actual: Column): ColumnDrift {
    const changes: ColumnChange[] = [];

    if (expected.dataType !== actual.dataType) {
      changes.push({
        property: "dataType",
        expected: expected.dataType,
        actual: actual.dataType,
      });
    }

    if (expected.isNullable !== actual.isNullable) {
      changes.push({
        property: "isNullable",
        expected: expected.isNullable.toString(),
        actual: actual.isNullable.toString(),
      });
    }

    if (expected.defaultValue !== actual.defaultValue) {
      changes.push({
        property: "defaultValue",
        expected: expected.defaultValue || "null",
        actual: actual.defaultValue || "null",
      });
    }

    if (expected.characterMaximumLength !== actual.characterMaximumLength) {
      changes.push({
        property: "characterMaximumLength",
        expected: expected.characterMaximumLength?.toString() || "null",
        actual: actual.characterMaximumLength?.toString() || "null",
      });
    }

    if (expected.numericPrecision !== actual.numericPrecision) {
      changes.push({
        property: "numericPrecision",
        expected: expected.numericPrecision?.toString() || "null",
        actual: actual.numericPrecision?.toString() || "null",
      });
    }

    if (expected.numericScale !== actual.numericScale) {
      changes.push({
        property: "numericScale",
        expected: expected.numericScale?.toString() || "null",
        actual: actual.numericScale?.toString() || "null",
      });
    }

    return {
      columnName: expected.name,
      changes,
    };
  }

  private compareView(expected: View, actual: View): ViewDrift {
    const definitionChanged =
      expected.definition.trim() !== actual.definition.trim();

    return {
      viewName: `${expected.schema}.${expected.name}`,
      definitionChanged,
      oldDefinition: definitionChanged ? actual.definition : undefined,
      newDefinition: definitionChanged ? expected.definition : undefined,
    };
  }

  private hasTableChanges(tableDrift: TableDrift): boolean {
    return (
      tableDrift.missingColumns.length > 0 ||
      tableDrift.extraColumns.length > 0 ||
      tableDrift.modifiedColumns.length > 0 ||
      tableDrift.missingConstraints.length > 0 ||
      tableDrift.extraConstraints.length > 0
    );
  }

  private generateSummary(
    hasChanges: boolean,
    missingTables: string[],
    extraTables: string[],
    modifiedTables: TableDrift[]
  ): string {
    if (!hasChanges) {
      return "No schema drift detected. Database schema matches migrations.";
    }

    const parts: string[] = [];

    if (missingTables.length > 0) {
      parts.push(`${missingTables.length} table(s) missing from database`);
    }

    if (extraTables.length > 0) {
      parts.push(`${extraTables.length} extra table(s) in database`);
    }

    if (modifiedTables.length > 0) {
      parts.push(`${modifiedTables.length} table(s) have structural changes`);
    }

    return `Schema drift detected: ${parts.join(", ")}.`;
  }

  private buildExpectedSchemaFromMigrations(
    migrations: Migration[]
  ): DatabaseSchema {
    const schema: DatabaseSchema = {
      tables: [],
      views: [],
      enums: [],
      functions: [],
      extensions: [],
      indexes: [],
      triggers: [],
      rlsPolicies: [],
    };

    for (const migration of migrations) {
      this.applyMigrationToSchema(schema, migration);
    }

    return schema;
  }

  private applyMigrationToSchema(
    schema: DatabaseSchema,
    migration: Migration
  ): void {
    const operations = this.parseMigrationOperations(migration.upSql);

    for (const operation of operations) {
      switch (operation.type) {
        case "CREATE_TABLE":
          this.applyCreateTable(schema, operation.sql);
          break;
        case "DROP_TABLE":
          this.applyDropTable(schema, operation.sql);
          break;
        case "ADD_COLUMN":
          this.applyAddColumn(schema, operation.sql);
          break;
        case "DROP_COLUMN":
          this.applyDropColumn(schema, operation.sql);
          break;
        case "CREATE_INDEX":
          this.applyCreateIndex(schema, operation.sql);
          break;
        case "DROP_INDEX":
          this.applyDropIndex(schema, operation.sql);
          break;
        case "CREATE_VIEW":
          this.applyCreateView(schema, operation.sql);
          break;
        case "DROP_VIEW":
          this.applyDropView(schema, operation.sql);
          break;
        case "CREATE_TRIGGER":
          this.applyCreateTrigger(schema, operation.sql);
          break;
        case "DROP_TRIGGER":
          this.applyDropTrigger(schema, operation.sql);
          break;
        case "CREATE_POLICY":
          this.applyCreatePolicy(schema, operation.sql);
          break;
        case "DROP_POLICY":
          this.applyDropPolicy(schema, operation.sql);
          break;
      }
    }
  }

  private parseMigrationOperations(
    sql: string
  ): Array<{type: string; sql: string}> {
    const operations: Array<{type: string; sql: string}> = [];
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      const upperStatement = statement.toUpperCase();

      if (upperStatement.startsWith("CREATE TABLE")) {
        operations.push({type: "CREATE_TABLE", sql: statement});
      } else if (upperStatement.startsWith("DROP TABLE")) {
        operations.push({type: "DROP_TABLE", sql: statement});
      } else if (
        upperStatement.startsWith("ALTER TABLE") &&
        upperStatement.includes("ADD COLUMN")
      ) {
        operations.push({type: "ADD_COLUMN", sql: statement});
      } else if (
        upperStatement.startsWith("ALTER TABLE") &&
        upperStatement.includes("DROP COLUMN")
      ) {
        operations.push({type: "DROP_COLUMN", sql: statement});
      } else if (
        upperStatement.startsWith("CREATE INDEX") ||
        upperStatement.startsWith("CREATE UNIQUE INDEX")
      ) {
        operations.push({type: "CREATE_INDEX", sql: statement});
      } else if (upperStatement.startsWith("DROP INDEX")) {
        operations.push({type: "DROP_INDEX", sql: statement});
      }
    }

    return operations;
  }

  private applyCreateTable(schema: DatabaseSchema, sql: string): void {
    const match = sql.match(
      /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:(\w+)\.)?(\w+)/i
    );
    if (match) {
      const schemaName = match[1] || "public";
      const tableName = match[2];

      const table: Table = {
        schema: schemaName,
        name: tableName,
        columns: [],
        constraints: [],
        indexes: [],
      };

      schema.tables.push(table);
    }
  }

  private applyDropTable(schema: DatabaseSchema, sql: string): void {
    const match = sql.match(/DROP TABLE\s+(?:IF EXISTS\s+)?(?:(\w+)\.)?(\w+)/i);
    if (match) {
      const schemaName = match[1] || "public";
      const tableName = match[2];

      schema.tables = schema.tables.filter(
        (t) => !(t.schema === schemaName && t.name === tableName)
      );
    }
  }

  private applyAddColumn(schema: DatabaseSchema, sql: string): void {
    const match = sql.match(
      /ALTER TABLE\s+(?:(\w+)\.)?(\w+)\s+ADD COLUMN\s+(\w+)/i
    );
    if (match) {
      const schemaName = match[1] || "public";
      const tableName = match[2];
      const columnName = match[3];

      const table = schema.tables.find(
        (t) => t.schema === schemaName && t.name === tableName
      );
      if (table) {
        const column: Column = {
          name: columnName,
          dataType: "text",
          isNullable: true,
          isGenerated: false,
          ordinalPosition: table.columns.length + 1,
        };
        table.columns.push(column);
      }
    }
  }

  private applyDropColumn(schema: DatabaseSchema, sql: string): void {
    const match = sql.match(
      /ALTER TABLE\s+(?:(\w+)\.)?(\w+)\s+DROP COLUMN\s+(\w+)/i
    );
    if (match) {
      const schemaName = match[1] || "public";
      const tableName = match[2];
      const columnName = match[3];

      const table = schema.tables.find(
        (t) => t.schema === schemaName && t.name === tableName
      );
      if (table) {
        table.columns = table.columns.filter((c) => c.name !== columnName);
      }
    }
  }

  private applyCreateIndex(schema: DatabaseSchema, sql: string): void {
    const match = sql.match(
      /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(\w+)\s+ON\s+(?:(\w+)\.)?(\w+)/i
    );
    if (match) {
      const indexName = match[1];
      const schemaName = match[2] || "public";
      const tableName = match[3];

      const index: Index = {
        name: indexName,
        tableName,
        schemaName,
        columns: [],
        isUnique: sql.toUpperCase().includes("UNIQUE"),
        isPrimary: false,
        method: "btree",
        isConcurrent: sql.toUpperCase().includes("CONCURRENTLY"),
      };

      schema.indexes.push(index);
    }
  }

  private applyDropIndex(schema: DatabaseSchema, sql: string): void {
    const match = sql.match(
      /DROP INDEX\s+(?:CONCURRENTLY\s+)?(?:IF EXISTS\s+)?(\w+)/i
    );
    if (match) {
      const indexName = match[1];
      schema.indexes = schema.indexes.filter((i) => i.name !== indexName);
    }
  }

  private applyCreateView(schema: DatabaseSchema, sql: string): void {
    const match = sql.match(
      /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:(\w+)\.)?(\w+)\s+AS/i
    );
    if (match) {
      const schemaName = match[1] || "public";
      const viewName = match[2];

      // Remove existing view if it exists (for CREATE OR REPLACE)
      schema.views = schema.views.filter(
        (v) => !(v.schema === schemaName && v.name === viewName)
      );

      const view: View = {
        schema: schemaName,
        name: viewName,
        definition: sql,
        columns: [],
        owner: "",
        dependencies: [],
        isUpdatable: false,
        hasInsteadOfTriggers: false,
      };

      schema.views.push(view);
    }
  }

  private applyDropView(schema: DatabaseSchema, sql: string): void {
    const match = sql.match(/DROP VIEW\s+(?:IF EXISTS\s+)?(?:(\w+)\.)?(\w+)/i);
    if (match) {
      const schemaName = match[1] || "public";
      const viewName = match[2];

      schema.views = schema.views.filter(
        (v) => !(v.schema === schemaName && v.name === viewName)
      );
    }
  }

  private applyCreateTrigger(schema: DatabaseSchema, sql: string): void {
    const match = sql.match(/CREATE TRIGGER\s+(\w+)/i);
    if (match) {
      const triggerName = match[1];

      const trigger: Trigger = {
        schema: "public",
        name: triggerName,
        tableName: "",
        timing: "BEFORE" as any,
        events: [],
        orientation: "ROW" as any,
        functionName: "",
        functionSchema: "",
        definition: sql,
        isConstraint: false,
        isEnabled: true,
      };

      schema.triggers.push(trigger);
    }
  }

  private applyDropTrigger(schema: DatabaseSchema, sql: string): void {
    const match = sql.match(/DROP TRIGGER\s+(\w+)/i);
    if (match) {
      const triggerName = match[1];
      schema.triggers = schema.triggers.filter((t) => t.name !== triggerName);
    }
  }

  private applyCreatePolicy(schema: DatabaseSchema, sql: string): void {
    const match = sql.match(/CREATE POLICY\s+(\w+)\s+ON\s+(?:(\w+)\.)?(\w+)/i);
    if (match) {
      const policyName = match[1];
      const schemaName = match[2] || "public";
      const tableName = match[3];

      const policy: RLSPolicy = {
        schema: schemaName,
        tableName: tableName,
        policyName: policyName,
        permissive: true,
        roles: [],
        command: "ALL" as any,
      };

      schema.rlsPolicies.push(policy);
    }
  }

  private applyDropPolicy(schema: DatabaseSchema, sql: string): void {
    const match = sql.match(/DROP POLICY\s+(\w+)\s+ON\s+(?:(\w+)\.)?(\w+)/i);
    if (match) {
      const policyName = match[1];
      const schemaName = match[2] || "public";
      const tableName = match[3];

      schema.rlsPolicies = schema.rlsPolicies.filter(
        (p) =>
          !(
            p.schema === schemaName &&
            p.tableName === tableName &&
            p.policyName === policyName
          )
      );
    }
  }
}
