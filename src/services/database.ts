import {Client} from "pg";
import {DatabaseConfig} from "../types/config.js";
import {log} from "../utils/logger.js";
import {
  DatabaseSchema,
  Table,
  Column,
  Constraint,
  ConstraintType,
  Index,
  IndexColumn,
  Enum,
  Function,
  FunctionParameter,
  Extension,
  View,
  ViewColumn,
  ViewDependency,
  Trigger,
  TriggerTiming,
  TriggerEvent,
  TriggerOrientation,
  RLSPolicy,
  RLSCommand,
} from "../types/schema.js";
import {AppliedMigration} from "../types/migration.js";

export class DatabaseService {
  private client: Client;
  private connected = false;

  constructor(private config: DatabaseConfig) {
    this.client = new Client({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl,
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      try {
        const dbLogger = log.db("connect");
        dbLogger.info("Attempting to connect to database");
        await this.client.connect();
        this.connected = true;
        dbLogger.info("Database connected successfully");
      } catch (error) {
        const dbLogger = log.db("connect");
        dbLogger.error(
          "Database connection failed",
          error instanceof Error ? error : new Error(String(error))
        );
        throw error;
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.end();
      this.connected = false;
    }
  }

  async getSchema(): Promise<any> {
    await this.connect();

    const schemaLogger = log.schema("getSchema");
    schemaLogger.info("Fetching complete database schema in single query");

    const query = `
      WITH tables_info AS (
        SELECT 
          t.table_schema,
          t.table_name,
          obj_description(c.oid) as table_comment
        FROM information_schema.tables t
        LEFT JOIN pg_class c ON c.relname = t.table_name
        LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
        WHERE t.table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
          AND t.table_type = 'BASE TABLE'
      ),
      columns_info AS (
        SELECT 
          c.table_schema,
          c.table_name,
          json_agg(
            json_build_object(
              'name', c.column_name,
              'dataType', c.data_type,
              'isNullable', c.is_nullable = 'YES',
              'defaultValue', c.column_default,
              'isGenerated', c.is_generated = 'ALWAYS',
              'generationExpression', c.generation_expression,
              'ordinalPosition', c.ordinal_position,
              'characterMaximumLength', c.character_maximum_length,
              'numericPrecision', c.numeric_precision,
              'numericScale', c.numeric_scale,
              'comment', col_description(pgc.oid, c.ordinal_position)
            ) ORDER BY c.ordinal_position
          ) as columns
        FROM information_schema.columns c
        LEFT JOIN pg_class pgc ON pgc.relname = c.table_name
        LEFT JOIN pg_namespace pgn ON pgn.oid = pgc.relnamespace AND pgn.nspname = c.table_schema
        WHERE c.table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        GROUP BY c.table_schema, c.table_name
      ),
      constraint_columns AS (
        SELECT 
          tc.table_schema,
          tc.table_name,
          tc.constraint_name,
          tc.constraint_type,
          array_agg(kcu.column_name ORDER BY kcu.ordinal_position) as columns,
          rc.update_rule,
          rc.delete_rule,
          ccu.table_schema as referenced_schema,
          ccu.table_name as referenced_table,
          array_agg(DISTINCT ccu.column_name) as referenced_columns,
          cc.check_clause,
          tc.is_deferrable,
          tc.initially_deferred
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name 
          AND tc.table_schema = kcu.table_schema
        LEFT JOIN information_schema.referential_constraints rc 
          ON tc.constraint_name = rc.constraint_name 
          AND tc.table_schema = rc.constraint_schema
        LEFT JOIN information_schema.constraint_column_usage ccu 
          ON rc.unique_constraint_name = ccu.constraint_name 
          AND rc.unique_constraint_schema = ccu.constraint_schema
        LEFT JOIN information_schema.check_constraints cc 
          ON tc.constraint_name = cc.constraint_name 
          AND tc.table_schema = cc.constraint_schema
        WHERE tc.table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        GROUP BY tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type, 
                 rc.update_rule, rc.delete_rule, ccu.table_schema, ccu.table_name, 
                 cc.check_clause, tc.is_deferrable, tc.initially_deferred
      ),
      constraints_info AS (
        SELECT 
          table_schema,
          table_name,
          json_agg(
            json_build_object(
              'name', constraint_name,
              'type', constraint_type,
              'columns', columns,
              'referencedSchema', referenced_schema,
              'referencedTable', referenced_table,
              'referencedColumns', referenced_columns,
              'onUpdate', update_rule,
              'onDelete', delete_rule,
              'checkClause', check_clause,
              'isDeferrable', is_deferrable = 'YES',
              'isDeferred', initially_deferred = 'YES'
            )
          ) as constraints
        FROM constraint_columns
        GROUP BY table_schema, table_name
      ),
      index_columns AS (
        SELECT 
          n.nspname as table_schema,
          t.relname as table_name,
          i.relname as index_name,
          ix.indisunique as is_unique,
          ix.indisprimary as is_primary,
          am.amname as method,
          pg_get_expr(ix.indpred, ix.indrelid) as condition,
          array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) as columns
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_am am ON i.relam = am.oid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        GROUP BY n.nspname, t.relname, i.relname, ix.indisunique, ix.indisprimary, 
                 am.amname, ix.indpred, ix.indrelid
      ),
      indexes_info AS (
        SELECT 
          table_schema,
          table_name,
          json_agg(
            json_build_object(
              'name', index_name,
              'isUnique', is_unique,
              'isPrimary', is_primary,
              'method', method,
              'condition', condition,
              'columns', columns
            )
          ) as indexes
        FROM index_columns
        GROUP BY table_schema, table_name
      ),
      enum_values AS (
        SELECT 
          n.nspname as schema_name,
          t.typname as enum_name,
          array_agg(e.enumlabel ORDER BY e.enumsortorder) as values
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        GROUP BY n.nspname, t.typname
      ),
      enums_info AS (
        SELECT json_agg(
          json_build_object(
            'schema', schema_name,
            'name', enum_name,
            'values', values
          )
        ) as enums
        FROM enum_values
      ),
      views_info AS (
        SELECT json_agg(
          json_build_object(
            'schema', v.schemaname,
            'name', v.viewname,
            'definition', v.definition,
            'owner', v.viewowner,
            'comment', obj_description(c.oid),
            'isUpdatable', COALESCE(iv.is_updatable = 'YES', false),
            'checkOption', iv.check_option,
            'isInsertableInto', COALESCE(iv.is_insertable_into = 'YES', false)
          )
        ) as views
        FROM pg_views v
        LEFT JOIN pg_class c ON c.relname = v.viewname AND c.relkind = 'v'
        LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = v.schemaname
        LEFT JOIN information_schema.views iv ON iv.table_schema = v.schemaname AND iv.table_name = v.viewname
        WHERE v.schemaname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      ),
      materialized_views_info AS (
        SELECT json_agg(
          json_build_object(
            'schema', schemaname,
            'name', matviewname,
            'definition', definition,
            'owner', matviewowner,
            'hasData', ispopulated,
            'comment', obj_description(c.oid)
          )
        ) as materialized_views
        FROM pg_matviews mv
        LEFT JOIN pg_class c ON c.relname = mv.matviewname
        LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = mv.schemaname
        WHERE mv.schemaname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      ),
      functions_info AS (
        SELECT json_agg(
          json_build_object(
            'schema', n.nspname,
            'name', p.proname,
            'returnType', pg_get_function_result(p.oid),
            'arguments', pg_get_function_arguments(p.oid),
            'language', l.lanname,
            'definition', CASE 
              WHEN l.lanname = 'sql' THEN p.prosrc
              WHEN l.lanname = 'plpgsql' THEN p.prosrc
              ELSE p.prosrc
            END,
            'fullDefinition', pg_get_functiondef(p.oid),
            'volatility', CASE p.provolatile
              WHEN 'i' THEN 'IMMUTABLE'
              WHEN 's' THEN 'STABLE'
              WHEN 'v' THEN 'VOLATILE'
            END,
            'isSecurityDefiner', p.prosecdef,
            'isStrict', p.proisstrict,
            'cost', p.procost,
            'rows', p.prorows,
            'comment', obj_description(p.oid),
            'kind', CASE p.prokind
              WHEN 'f' THEN 'function'
              WHEN 'p' THEN 'procedure'
              WHEN 'a' THEN 'aggregate'
              WHEN 'w' THEN 'window'
            END
          )
        ) as functions
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_language l ON l.oid = p.prolang
        WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
          AND p.prokind IN ('f', 'p', 'a', 'w')
      ),
      extensions_info AS (
        SELECT json_agg(
          json_build_object(
            'name', e.extname,
            'version', e.extversion,
            'schema', n.nspname,
            'comment', obj_description(e.oid)
          )
        ) as extensions
        FROM pg_extension e
        JOIN pg_namespace n ON n.oid = e.extnamespace
      ),
      trigger_events AS (
        SELECT 
          t.trigger_schema,
          t.trigger_name,
          t.event_object_table,
          t.action_timing,
          array_agg(t.event_manipulation) as events,
          t.action_orientation,
          t.action_statement,
          t.action_condition,
          pg_proc.proname as function_name,
          pg_namespace.nspname as function_schema
        FROM information_schema.triggers t
        LEFT JOIN pg_trigger ON pg_trigger.tgname = t.trigger_name
        LEFT JOIN pg_class ON pg_class.relname = t.event_object_table
        LEFT JOIN pg_namespace table_ns ON table_ns.oid = pg_class.relnamespace AND table_ns.nspname = t.trigger_schema
        LEFT JOIN pg_proc ON pg_proc.oid = pg_trigger.tgfoid
        LEFT JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
        WHERE t.trigger_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        GROUP BY t.trigger_schema, t.trigger_name, t.event_object_table, t.action_timing,
                 t.action_orientation, t.action_statement, t.action_condition,
                 pg_proc.proname, pg_namespace.nspname
      ),
      triggers_info AS (
        SELECT json_agg(
          json_build_object(
            'schema', trigger_schema,
            'name', trigger_name,
            'tableName', event_object_table,
            'timing', action_timing,
            'events', events,
            'orientation', action_orientation,
            'definition', action_statement,
            'condition', action_condition,
            'functionName', function_name,
            'functionSchema', function_schema
          )
        ) as triggers
        FROM trigger_events
      ),
      rls_policies_info AS (
        SELECT json_agg(
          json_build_object(
            'schema', schemaname,
            'tableName', tablename,
            'policyName', policyname,
            'permissive', permissive = 'PERMISSIVE',
            'roles', roles,
            'command', cmd,
            'qualExpression', qual,
            'withCheckExpression', with_check
          )
        ) as rls_policies
        FROM pg_policies
        WHERE schemaname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      ),
      sequences_info AS (
        SELECT json_agg(
          json_build_object(
            'schema', schemaname,
            'name', sequencename,
            'dataType', data_type,
            'startValue', start_value,
            'minValue', min_value,
            'maxValue', max_value,
            'increment', increment_by,
            'cycled', cycle,
            'cacheSize', cache_size,
            'owner', sequenceowner
          )
        ) as sequences
        FROM pg_sequences
        WHERE schemaname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      ),
      temp_tables_info AS (
        SELECT json_agg(
          json_build_object(
            'schema', n.nspname,
            'name', c.relname,
            'persistence', c.relpersistence,
            'isTemporary', c.relpersistence = 't',
            'isUnlogged', c.relpersistence = 'u',
            'comment', obj_description(c.oid)
          )
        ) as temp_tables
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' 
          AND (c.relpersistence = 't' OR c.relpersistence = 'u')
          AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      )
      SELECT json_build_object(
        'tables', (
          SELECT json_agg(
            json_build_object(
              'schema', t.table_schema,
              'name', t.table_name,
              'comment', t.table_comment,
              'columns', COALESCE(c.columns, '[]'::json),
              'constraints', COALESCE(ct.constraints, '[]'::json),
              'indexes', COALESCE(i.indexes, '[]'::json)
            )
          )
          FROM tables_info t
          LEFT JOIN columns_info c ON t.table_schema = c.table_schema AND t.table_name = c.table_name
          LEFT JOIN constraints_info ct ON t.table_schema = ct.table_schema AND t.table_name = ct.table_name
          LEFT JOIN indexes_info i ON t.table_schema = i.table_schema AND t.table_name = i.table_name
        ),
        'enums', (SELECT COALESCE(enums, '[]'::json) FROM enums_info),
        'views', (SELECT COALESCE(views, '[]'::json) FROM views_info),
        'materializedViews', (SELECT COALESCE(materialized_views, '[]'::json) FROM materialized_views_info),
        'functions', (SELECT COALESCE(functions, '[]'::json) FROM functions_info),
        'extensions', (SELECT COALESCE(extensions, '[]'::json) FROM extensions_info),
        'triggers', (SELECT COALESCE(triggers, '[]'::json) FROM triggers_info),
        'rlsPolicies', (SELECT COALESCE(rls_policies, '[]'::json) FROM rls_policies_info),
        'sequences', (SELECT COALESCE(sequences, '[]'::json) FROM sequences_info),
        'temporaryTables', (SELECT COALESCE(temp_tables, '[]'::json) FROM temp_tables_info)
      ) as complete_schema;
    `;

    const result = await this.client.query(query);
    const schema = result.rows[0].complete_schema;

    schemaLogger.info("Complete schema fetched successfully", {
      totalTables: schema.tables?.length || 0,
      totalViews: schema.views?.length || 0,
      totalMaterializedViews: schema.materializedViews?.length || 0,
      totalFunctions: schema.functions?.length || 0,
      totalEnums: schema.enums?.length || 0,
      totalExtensions: schema.extensions?.length || 0,
      totalTriggers: schema.triggers?.length || 0,
      totalRLSPolicies: schema.rlsPolicies?.length || 0,
      totalSequences: schema.sequences?.length || 0,
      totalTempTables: schema.temporaryTables?.length || 0
    });

    return schema;
  }

  async getTables(): Promise<any> {
    const query = `
      SELECT 
        t.table_schema,
        t.table_name,
        obj_description(c.oid) as table_comment
      FROM information_schema.tables t
      LEFT JOIN pg_class c ON c.relname = t.table_name
      LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
      WHERE t.table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_schema, t.table_name;
    `;

    const result = await this.client.query(query);

    // const tableLogger = log.schema("getTables", result.rows.length);
    // tableLogger.info("Tables fetched successfully");
    // const tables: Table[] = [];

    // for (const row of result.rows) {
    //   const columns = await this.getColumns(row.table_schema, row.table_name);
    //   const constraints = await this.getConstraints(
    //     row.table_schema,
    //     row.table_name
    //   );
    //   const indexes = await this.getTableIndexes(
    //     row.table_schema,
    //     row.table_name
    //   );

    //   tables.push({
    //     schema: row.table_schema,
    //     name: row.table_name,
    //     columns,
    //     constraints,
    //     indexes,
    //     comment: row.table_comment,
    //   });
    // }

    // return tables;
    return result.rows;
  }

  async getColumns(schema: string, tableName: string): Promise<Column[]> {
    const query = `
      SELECT 
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.is_generated,
        c.generation_expression,
        c.ordinal_position,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        col_description(pgc.oid, c.ordinal_position) as column_comment
      FROM information_schema.columns c
      LEFT JOIN pg_class pgc ON pgc.relname = c.table_name
      LEFT JOIN pg_namespace pgn ON pgn.oid = pgc.relnamespace AND pgn.nspname = c.table_schema
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position;
    `;

    const result = await this.client.query(query, [schema, tableName]);

    return result.rows.map((row) => ({
      name: row.column_name,
      dataType: row.data_type,
      isNullable: row.is_nullable === "YES",
      defaultValue: row.column_default,
      isGenerated: row.is_generated === "ALWAYS",
      generationExpression: row.generation_expression,
      ordinalPosition: row.ordinal_position,
      characterMaximumLength: row.character_maximum_length,
      numericPrecision: row.numeric_precision,
      numericScale: row.numeric_scale,
      comment: row.column_comment,
    }));
  }

  async getConstraints(
    schema: string,
    tableName: string
  ): Promise<Constraint[]> {
    const query = `
      SELECT 
        tc.constraint_name,
        tc.constraint_type,
        array_agg(kcu.column_name ORDER BY kcu.ordinal_position) as columns,
        rc.update_rule,
        rc.delete_rule,
        ccu.table_schema as referenced_schema,
        ccu.table_name as referenced_table,
        array_agg(ccu.column_name) as referenced_columns,
        cc.check_clause,
        tc.is_deferrable,
        tc.initially_deferred
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name 
        AND tc.table_schema = kcu.table_schema
      LEFT JOIN information_schema.referential_constraints rc 
        ON tc.constraint_name = rc.constraint_name 
        AND tc.table_schema = rc.constraint_schema
      LEFT JOIN information_schema.constraint_column_usage ccu 
        ON rc.unique_constraint_name = ccu.constraint_name 
        AND rc.unique_constraint_schema = ccu.constraint_schema
      LEFT JOIN information_schema.check_constraints cc 
        ON tc.constraint_name = cc.constraint_name 
        AND tc.table_schema = cc.constraint_schema
      WHERE tc.table_schema = $1 AND tc.table_name = $2
      GROUP BY tc.constraint_name, tc.constraint_type, rc.update_rule, rc.delete_rule, 
               ccu.table_schema, ccu.table_name, cc.check_clause, tc.is_deferrable, tc.initially_deferred
      ORDER BY tc.constraint_name;
    `;

    const result = await this.client.query(query, [schema, tableName]);

    return result.rows.map((row) => ({
      name: row.constraint_name,
      type: row.constraint_type as ConstraintType,
      columns: row.columns,
      referencedSchema: row.referenced_schema,
      referencedTable: row.referenced_table,
      referencedColumns: row.referenced_columns,
      onUpdate: row.update_rule,
      onDelete: row.delete_rule,
      checkClause: row.check_clause,
      isDeferrable: row.is_deferrable === "YES",
      isDeferred: row.initially_deferred === "YES",
    }));
  }

  async getTableIndexes(schema: string, tableName: string): Promise<Index[]> {
    const query = `
      SELECT 
        i.relname as index_name,
        ix.indisunique as is_unique,
        ix.indisprimary as is_primary,
        am.amname as method,
        pg_get_expr(ix.indpred, ix.indrelid) as condition,
        array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) as columns
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_am am ON i.relam = am.oid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = $1 AND t.relname = $2
      GROUP BY i.relname, ix.indisunique, ix.indisprimary, am.amname, ix.indpred, ix.indrelid
      ORDER BY i.relname;
    `;

    const result = await this.client.query(query, [schema, tableName]);

    return result.rows.map((row) => ({
      name: row.index_name,
      tableName,
      schemaName: schema,
      columns: Array.isArray(row.columns)
        ? row.columns.map((col: string) => ({
            name: col,
            direction: "ASC" as const,
          }))
        : [],
      isUnique: row.is_unique,
      isPrimary: row.is_primary,
      method: row.method,
      condition: row.condition,
      isConcurrent: false,
    }));
  }

  async getIndexes(): Promise<Index[]> {
    const query = `
      SELECT 
        i.relname as index_name,
        t.relname as table_name,
        n.nspname as schema_name,
        ix.indisunique as is_unique,
        ix.indisprimary as is_primary,
        am.amname as method,
        pg_get_expr(ix.indpred, ix.indrelid) as condition,
        array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) as columns
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_am am ON i.relam = am.oid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      GROUP BY i.relname, t.relname, n.nspname, ix.indisunique, ix.indisprimary, am.amname, ix.indpred, ix.indrelid
      ORDER BY n.nspname, t.relname, i.relname;
    `;

    const result = await this.client.query(query);

    return result.rows.map((row) => ({
      name: row.index_name,
      tableName: row.table_name,
      schemaName: row.schema_name,
      columns: Array.isArray(row.columns)
        ? row.columns.map((col: string) => ({
            name: col,
            direction: "ASC" as const,
          }))
        : [],
      isUnique: row.is_unique,
      isPrimary: row.is_primary,
      method: row.method,
      condition: row.condition,
      isConcurrent: false,
    }));
  }

  async getEnums(): Promise<Enum[]> {
    const query = `
      SELECT 
        n.nspname as schema_name,
        t.typname as enum_name,
        array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      GROUP BY n.nspname, t.typname
      ORDER BY n.nspname, t.typname;
    `;

    const result = await this.client.query(query);

    return result.rows.map((row) => ({
      schema: row.schema_name,
      name: row.enum_name,
      values: row.enum_values,
    }));
  }

  async getFunctions(): Promise<Function[]> {
    const query = `
      SELECT 
        n.nspname as schema_name,
        p.proname as function_name,
        pg_get_function_result(p.oid) as return_type,
        pg_get_function_arguments(p.oid) as arguments,
        l.lanname as language,
        p.prosrc as definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        AND p.prokind = 'f'
      ORDER BY n.nspname, p.proname;
    `;

    const result = await this.client.query(query);

    return result.rows.map((row) => ({
      schema: row.schema_name,
      name: row.function_name,
      returnType: row.return_type,
      parameters: this.parseFunctionParameters(row.arguments),
      language: row.language,
      definition: row.definition,
    }));
  }

  async getExtensions(): Promise<Extension[]> {
    const query = `
      SELECT 
        e.extname as extension_name,
        e.extversion as version,
        n.nspname as schema_name
      FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace
      ORDER BY e.extname;
    `;

    const result = await this.client.query(query);

    return result.rows.map((row) => ({
      name: row.extension_name,
      version: row.version,
      schema: row.schema_name,
    }));
  }

  async getAppliedMigrations(tableName: string): Promise<AppliedMigration[]> {
    try {
      const query = `SELECT version, applied_at FROM ${tableName} ORDER BY applied_at`;
      const result = await this.client.query(query);

      return result.rows.map((row) => ({
        version: row.version,
        appliedAt: row.applied_at,
      }));
    } catch (error) {
      return [];
    }
  }

  private parseFunctionParameters(argumentsStr: string): FunctionParameter[] {
    if (!argumentsStr) return [];

    const params: FunctionParameter[] = [];
    const argMatches = argumentsStr.match(/(\w+\s+)?(\w+)\s+(\w+)/g);

    if (argMatches) {
      for (const match of argMatches) {
        const parts = match.trim().split(/\s+/);
        if (parts.length >= 2) {
          params.push({
            name: parts[parts.length - 1],
            type: parts[parts.length - 2],
            mode:
              parts.length > 2
                ? (parts[0].toUpperCase() as "IN" | "OUT" | "INOUT")
                : "IN",
          });
        }
      }
    }

    return params;
  }

  async getViews(): Promise<View[]> {
    const query = `
      SELECT 
        v.schemaname,
        v.viewname,
        v.definition,
        v.viewowner,
        obj_description(c.oid) as view_comment,
        v.definition LIKE '%INSTEAD OF%' as has_instead_of_triggers
      FROM pg_views v
      LEFT JOIN pg_class c ON c.relname = v.viewname
      LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = v.schemaname
      WHERE v.schemaname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      ORDER BY v.schemaname, v.viewname;
    `;

    const result = await this.client.query(query);
    const views: View[] = [];

    for (const row of result.rows) {
      const columns = await this.getViewColumns(row.schemaname, row.viewname);
      const dependencies = await this.getViewDependencies(
        row.schemaname,
        row.viewname
      );
      const isUpdatable = await this.isViewUpdatable(
        row.schemaname,
        row.viewname
      );

      views.push({
        schema: row.schemaname,
        name: row.viewname,
        definition: row.definition,
        columns,
        owner: row.viewowner,
        comment: row.view_comment,
        dependencies,
        isUpdatable,
        hasInsteadOfTriggers: row.has_instead_of_triggers,
      });
    }

    return views;
  }

  async getViewColumns(
    schema: string,
    viewName: string
  ): Promise<ViewColumn[]> {
    const query = `
      SELECT 
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.ordinal_position,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale
      FROM information_schema.columns c
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position;
    `;

    const result = await this.client.query(query, [schema, viewName]);

    return result.rows.map((row) => ({
      name: row.column_name,
      dataType: row.data_type,
      isNullable: row.is_nullable === "YES",
      ordinalPosition: row.ordinal_position,
      characterMaximumLength: row.character_maximum_length,
      numericPrecision: row.numeric_precision,
      numericScale: row.numeric_scale,
    }));
  }

  async getViewDependencies(
    schema: string,
    viewName: string
  ): Promise<ViewDependency[]> {
    const query = `
      SELECT DISTINCT
        n.nspname as dep_schema,
        c.relname as dep_name,
        CASE c.relkind
          WHEN 'r' THEN 'table'
          WHEN 'v' THEN 'view'
          WHEN 'f' THEN 'function'
          ELSE 'other'
        END as dep_type
      FROM pg_depend d
      JOIN pg_class c ON c.oid = d.refobjid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_class vc ON vc.oid = d.objid
      JOIN pg_namespace vn ON vn.oid = vc.relnamespace
      WHERE vn.nspname = $1 AND vc.relname = $2
        AND c.relkind IN ('r', 'v', 'f')
        AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      ORDER BY n.nspname, c.relname;
    `;

    const result = await this.client.query(query, [schema, viewName]);

    return result.rows.map((row) => ({
      type: row.dep_type as "table" | "view" | "function",
      schema: row.dep_schema,
      name: row.dep_name,
    }));
  }

  async isViewUpdatable(schema: string, viewName: string): Promise<boolean> {
    const query = `
      SELECT is_updatable
      FROM information_schema.views
      WHERE table_schema = $1 AND table_name = $2;
    `;

    const result = await this.client.query(query, [schema, viewName]);
    return result.rows.length > 0 && result.rows[0].is_updatable === "YES";
  }

  async getTriggers(): Promise<Trigger[]> {
    const query = `
      SELECT 
        t.trigger_schema,
        t.trigger_name,
        t.event_object_table,
        t.action_timing,
        t.event_manipulation,
        t.action_orientation,
        t.action_statement,
        t.action_condition,
        pg_trigger.tgname,
        pg_trigger.tgenabled,
        pg_trigger.tgisinternal,
        pg_proc.proname as function_name,
        pg_namespace.nspname as function_schema
      FROM information_schema.triggers t
      LEFT JOIN pg_trigger ON pg_trigger.tgname = t.trigger_name
      LEFT JOIN pg_class ON pg_class.relname = t.event_object_table
      LEFT JOIN pg_namespace table_ns ON table_ns.oid = pg_class.relnamespace AND table_ns.nspname = t.trigger_schema
      LEFT JOIN pg_proc ON pg_proc.oid = pg_trigger.tgfoid
      LEFT JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
      WHERE t.trigger_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      ORDER BY t.trigger_schema, t.event_object_table, t.trigger_name;
    `;

    const result = await this.client.query(query);

    return result.rows.map((row) => ({
      schema: row.trigger_schema,
      name: row.trigger_name,
      tableName: row.event_object_table,
      timing: row.action_timing as TriggerTiming,
      events: [row.event_manipulation as TriggerEvent],
      orientation: row.action_orientation as TriggerOrientation,
      functionName: row.function_name || "",
      functionSchema: row.function_schema || "",
      definition: row.action_statement,
      condition: row.action_condition,
      isConstraint: row.tgisinternal || false,
      isEnabled: row.tgenabled !== "D",
    }));
  }

  async getRLSPolicies(): Promise<RLSPolicy[]> {
    const query = `
      SELECT 
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual,
        with_check
      FROM pg_policies
      WHERE schemaname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      ORDER BY schemaname, tablename, policyname;
    `;

    const result = await this.client.query(query);

    return result.rows.map((row) => ({
      schema: row.schemaname,
      tableName: row.tablename,
      policyName: row.policyname,
      permissive: row.permissive === "PERMISSIVE",
      roles: row.roles || [],
      command: row.cmd as RLSCommand,
      qualExpression: row.qual,
      withCheckExpression: row.with_check,
    }));
  }

  async getTablePermissions(
    schemaName: string,
    tableName: string
  ): Promise<any[]> {
    const query = `
      SELECT 
        grantee,
        privilege_type,
        column_name,
        is_grantable
      FROM information_schema.table_privileges 
      WHERE table_schema = $1 AND table_name = $2
      UNION ALL
      SELECT 
        grantee,
        privilege_type,
        column_name,
        is_grantable
      FROM information_schema.column_privileges 
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY grantee, privilege_type;
    `;

    const result = await this.client.query(query, [schemaName, tableName]);
    return result.rows;
  }

  async getViewDefinition(viewName: string, schemaName: string = 'public'): Promise<any> {
    await this.connect();
    
    const query = `
      SELECT 
        v.schemaname,
        v.viewname,
        v.definition,
        v.viewowner,
        obj_description(c.oid) as view_comment
      FROM pg_views v
      LEFT JOIN pg_class c ON c.relname = v.viewname AND c.relkind = 'v'
      LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = v.schemaname
      WHERE v.viewname = $1 AND v.schemaname = $2;
    `;

    const result = await this.client.query(query, [viewName, schemaName]);
    
    if (result.rows.length === 0) {
      throw new Error(`View '${schemaName}.${viewName}' not found`);
    }

    return result.rows[0];
  }

  async getDatabaseObjectDefinition(objectName: string, objectType: string, schemaName: string = 'public'): Promise<any> {
    await this.connect();
    
    let query: string;
    let params: any[];
    
    switch (objectType.toLowerCase()) {
      case 'view':
        query = `
          SELECT 
            'view' as object_type,
            v.schemaname as schema,
            v.viewname as name,
            v.definition,
            v.viewowner as owner,
            obj_description(c.oid) as comment
          FROM pg_views v
          LEFT JOIN pg_class c ON c.relname = v.viewname AND c.relkind = 'v'
          LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = v.schemaname
          WHERE v.viewname = $1 AND v.schemaname = $2;
        `;
        params = [objectName, schemaName];
        break;
        
      case 'materialized_view':
      case 'matview':
        query = `
          SELECT 
            'materialized_view' as object_type,
            mv.schemaname as schema,
            mv.matviewname as name,
            mv.definition,
            mv.matviewowner as owner,
            mv.ispopulated as is_populated,
            obj_description(c.oid) as comment
          FROM pg_matviews mv
          LEFT JOIN pg_class c ON c.relname = mv.matviewname AND c.relkind = 'm'
          LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = mv.schemaname
          WHERE mv.matviewname = $1 AND mv.schemaname = $2;
        `;
        params = [objectName, schemaName];
        break;
        
      case 'function':
      case 'procedure':
        query = `
          SELECT 
            'function' as object_type,
            n.nspname as schema,
            p.proname as name,
            pg_get_functiondef(p.oid) as definition,
            pg_get_function_result(p.oid) as return_type,
            pg_get_function_arguments(p.oid) as arguments,
            l.lanname as language,
            CASE p.provolatile
              WHEN 'i' THEN 'IMMUTABLE'
              WHEN 's' THEN 'STABLE'
              WHEN 'v' THEN 'VOLATILE'
            END as volatility,
            p.prosecdef as is_security_definer,
            obj_description(p.oid) as comment
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          JOIN pg_language l ON l.oid = p.prolang
          WHERE p.proname = $1 AND n.nspname = $2;
        `;
        params = [objectName, schemaName];
        break;
        
      case 'table':
        query = `
          SELECT 
            'table' as object_type,
            t.table_schema as schema,
            t.table_name as name,
            obj_description(c.oid) as comment,
            (SELECT json_agg(
              json_build_object(
                'column_name', col.column_name,
                'data_type', col.data_type,
                'is_nullable', col.is_nullable,
                'column_default', col.column_default,
                'character_maximum_length', col.character_maximum_length
              ) ORDER BY col.ordinal_position
            ) FROM information_schema.columns col 
             WHERE col.table_schema = t.table_schema AND col.table_name = t.table_name) as columns,
            (SELECT json_agg(
              json_build_object(
                'constraint_name', tc.constraint_name,
                'constraint_type', tc.constraint_type
              )
            ) FROM information_schema.table_constraints tc 
             WHERE tc.table_schema = t.table_schema AND tc.table_name = t.table_name) as constraints
          FROM information_schema.tables t
          LEFT JOIN pg_class c ON c.relname = t.table_name
          LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
          WHERE t.table_name = $1 AND t.table_schema = $2 AND t.table_type = 'BASE TABLE';
        `;
        params = [objectName, schemaName];
        break;
        
      case 'trigger':
        query = `
          SELECT 
            'trigger' as object_type,
            t.trigger_schema as schema,
            t.trigger_name as name,
            t.event_object_table as table_name,
            t.action_timing,
            t.event_manipulation,
            t.action_orientation,
            t.action_statement as definition,
            t.action_condition,
            pg_proc.proname as function_name,
            pg_namespace.nspname as function_schema
          FROM information_schema.triggers t
          LEFT JOIN pg_trigger ON pg_trigger.tgname = t.trigger_name
          LEFT JOIN pg_class ON pg_class.relname = t.event_object_table
          LEFT JOIN pg_namespace table_ns ON table_ns.oid = pg_class.relnamespace AND table_ns.nspname = t.trigger_schema
          LEFT JOIN pg_proc ON pg_proc.oid = pg_trigger.tgfoid
          LEFT JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
          WHERE t.trigger_name = $1 AND t.trigger_schema = $2;
        `;
        params = [objectName, schemaName];
        break;
        
      case 'policy':
      case 'rls':
        query = `
          SELECT 
            'rls_policy' as object_type,
            schemaname as schema,
            policyname as name,
            tablename,
            permissive,
            roles,
            cmd as command,
            qual as qual_expression,
            with_check as with_check_expression
          FROM pg_policies
          WHERE policyname = $1 AND schemaname = $2;
        `;
        params = [objectName, schemaName];
        break;
        
      case 'table_policies':
      case 'table_rls':
        query = `
          SELECT 
            'table_rls_policies' as object_type,
            schemaname as schema,
            tablename as table_name,
            json_agg(
              json_build_object(
                'policyname', policyname,
                'permissive', permissive,
                'roles', roles,
                'command', cmd,
                'qual_expression', qual,
                'with_check_expression', with_check
              )
            ) as policies
          FROM pg_policies
          WHERE tablename = $1 AND schemaname = $2
          GROUP BY schemaname, tablename;
        `;
        params = [objectName, schemaName];
        break;
        
      case 'enum':
        query = `
          SELECT 
            'enum' as object_type,
            n.nspname as schema,
            t.typname as name,
            array_agg(e.enumlabel ORDER BY e.enumsortorder) as values
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = $1 AND n.nspname = $2
          GROUP BY n.nspname, t.typname;
        `;
        params = [objectName, schemaName];
        break;
        
      case 'index':
        query = `
          SELECT 
            'index' as object_type,
            n.nspname as schema,
            i.relname as name,
            t.relname as table_name,
            ix.indisunique as is_unique,
            ix.indisprimary as is_primary,
            am.amname as method,
            pg_get_expr(ix.indpred, ix.indrelid) as condition,
            pg_get_indexdef(ix.indexrelid) as definition
          FROM pg_class t
          JOIN pg_index ix ON t.oid = ix.indrelid
          JOIN pg_class i ON i.oid = ix.indexrelid
          JOIN pg_am am ON i.relam = am.oid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE i.relname = $1 AND n.nspname = $2;
        `;
        params = [objectName, schemaName];
        break;
        
      default:
        throw new Error(`Unsupported object type: ${objectType}. Supported types: view, materialized_view, function, procedure, table, trigger, policy/rls, table_policies/table_rls, enum, index`);
    }

    const result = await this.client.query(query, params);
    
    if (result.rows.length === 0) {
      throw new Error(`${objectType} '${schemaName}.${objectName}' not found`);
    }

    return result.rows[0];
  }

  async executeQuery(query: string, params?: any[]): Promise<any> {
    await this.connect();
    const result = await this.client.query(query, params);
    return result;
  }
}
