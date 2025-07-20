import { Migration } from '../types/migration.js';

export function isValidDbmateTimestamp(timestamp: string): boolean {
  const regex = /^\d{14}$/;
  return regex.test(timestamp);
}

export function parseDbmateFilename(filename: string): { version: string; name: string } | null {
  const match = filename.match(/^(\d{14})_(.+)\.sql$/);
  if (!match) return null;
  
  return {
    version: match[1],
    name: match[2].replace(/_/g, ' '),
  };
}

export function generateDbmateTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

export function formatDbmateFilename(name: string, timestamp?: string): string {
  const ts = timestamp || generateDbmateTimestamp();
  const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `${ts}_${safeName}.sql`;
}

export function formatDbmateMigration(upSql: string, downSql: string): string {
  return `-- migrate:up
${upSql}

-- migrate:down
${downSql}
`;
}

export function validateMigrationOrder(migrations: Migration[]): string[] {
  const errors: string[] = [];
  const sortedMigrations = [...migrations].sort((a, b) => a.version.localeCompare(b.version));
  
  for (let i = 0; i < sortedMigrations.length; i++) {
    const migration = sortedMigrations[i];
    
    if (!isValidDbmateTimestamp(migration.version)) {
      errors.push(`Invalid timestamp format in migration: ${migration.filename}`);
    }
    
    if (i > 0) {
      const prevMigration = sortedMigrations[i - 1];
      if (migration.version <= prevMigration.version) {
        errors.push(`Migration ${migration.filename} has timestamp ${migration.version} which is not greater than previous migration ${prevMigration.filename} (${prevMigration.version})`);
      }
    }
  }
  
  return errors;
}

export function detectMigrationConflicts(migrations: Migration[]): string[] {
  const conflicts: string[] = [];
  const versionMap = new Map<string, string[]>();
  
  for (const migration of migrations) {
    if (!versionMap.has(migration.version)) {
      versionMap.set(migration.version, []);
    }
    versionMap.get(migration.version)!.push(migration.filename);
  }
  
  for (const [version, filenames] of versionMap) {
    if (filenames.length > 1) {
      conflicts.push(`Version ${version} appears in multiple files: ${filenames.join(', ')}`);
    }
  }
  
  return conflicts;
}

export function extractMigrationOperations(sql: string): string[] {
  const operations: string[] = [];
  const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
  
  for (const statement of statements) {
    const upperStatement = statement.toUpperCase();
    
    if (upperStatement.startsWith('CREATE TABLE')) {
      operations.push('CREATE TABLE');
    } else if (upperStatement.startsWith('DROP TABLE')) {
      operations.push('DROP TABLE');
    } else if (upperStatement.startsWith('ALTER TABLE')) {
      if (upperStatement.includes('ADD COLUMN')) {
        operations.push('ADD COLUMN');
      } else if (upperStatement.includes('DROP COLUMN')) {
        operations.push('DROP COLUMN');
      } else if (upperStatement.includes('ALTER COLUMN')) {
        operations.push('ALTER COLUMN');
      } else if (upperStatement.includes('ADD CONSTRAINT')) {
        operations.push('ADD CONSTRAINT');
      } else if (upperStatement.includes('DROP CONSTRAINT')) {
        operations.push('DROP CONSTRAINT');
      } else if (upperStatement.includes('RENAME TO')) {
        operations.push('RENAME TABLE');
      } else if (upperStatement.includes('ENABLE ROW LEVEL SECURITY')) {
        operations.push('ENABLE RLS');
      } else if (upperStatement.includes('DISABLE ROW LEVEL SECURITY')) {
        operations.push('DISABLE RLS');
      } else {
        operations.push('ALTER TABLE');
      }
    } else if (upperStatement.startsWith('CREATE INDEX') || upperStatement.startsWith('CREATE UNIQUE INDEX')) {
      operations.push('CREATE INDEX');
    } else if (upperStatement.startsWith('DROP INDEX')) {
      operations.push('DROP INDEX');
    } else if (upperStatement.startsWith('CREATE TYPE')) {
      operations.push('CREATE TYPE');
    } else if (upperStatement.startsWith('DROP TYPE')) {
      operations.push('DROP TYPE');
    } else if (upperStatement.startsWith('CREATE EXTENSION')) {
      operations.push('CREATE EXTENSION');
    } else if (upperStatement.startsWith('DROP EXTENSION')) {
      operations.push('DROP EXTENSION');
    } else if (upperStatement.startsWith('CREATE VIEW') || upperStatement.startsWith('CREATE OR REPLACE VIEW')) {
      operations.push('CREATE VIEW');
    } else if (upperStatement.startsWith('DROP VIEW')) {
      operations.push('DROP VIEW');
    } else if (upperStatement.startsWith('CREATE TRIGGER')) {
      operations.push('CREATE TRIGGER');
    } else if (upperStatement.startsWith('DROP TRIGGER')) {
      operations.push('DROP TRIGGER');
    } else if (upperStatement.startsWith('CREATE FUNCTION') || upperStatement.startsWith('CREATE OR REPLACE FUNCTION')) {
      operations.push('CREATE FUNCTION');
    } else if (upperStatement.startsWith('DROP FUNCTION')) {
      operations.push('DROP FUNCTION');
    } else if (upperStatement.startsWith('CREATE POLICY')) {
      operations.push('CREATE POLICY');
    } else if (upperStatement.startsWith('DROP POLICY')) {
      operations.push('DROP POLICY');
    } else if (upperStatement.startsWith('INSERT')) {
      operations.push('INSERT');
    } else if (upperStatement.startsWith('UPDATE')) {
      operations.push('UPDATE');
    } else if (upperStatement.startsWith('DELETE')) {
      operations.push('DELETE');
    } else {
      operations.push('OTHER');
    }
  }
  
  return operations;
}

export function generateMigrationSummary(upSql: string, downSql: string): string {
  const upOperations = extractMigrationOperations(upSql);
  const downOperations = extractMigrationOperations(downSql);
  
  const summary = [];
  
  if (upOperations.length > 0) {
    summary.push(`Up: ${upOperations.join(', ')}`);
  }
  
  if (downOperations.length > 0) {
    summary.push(`Down: ${downOperations.join(', ')}`);
  }
  
  return summary.join(' | ');
}

export function estimateMigrationRisk(upSql: string, downSql: string): 'LOW' | 'MEDIUM' | 'HIGH' {
  const upOperations = extractMigrationOperations(upSql);
  const downOperations = extractMigrationOperations(downSql);
  
  const highRiskOperations = [
    'DROP TABLE', 'DROP COLUMN', 'ALTER COLUMN', 'DROP TYPE', 'DROP EXTENSION',
    'DROP VIEW', 'DROP TRIGGER', 'DROP FUNCTION', 'DROP POLICY', 'DISABLE RLS'
  ];
  const mediumRiskOperations = [
    'CREATE INDEX', 'DROP INDEX', 'ADD CONSTRAINT', 'DROP CONSTRAINT',
    'CREATE VIEW', 'CREATE TRIGGER', 'CREATE POLICY', 'ENABLE RLS'
  ];
  
  const hasHighRisk = [...upOperations, ...downOperations].some(op => 
    highRiskOperations.includes(op)
  );
  
  if (hasHighRisk) {
    return 'HIGH';
  }
  
  const hasMediumRisk = [...upOperations, ...downOperations].some(op => 
    mediumRiskOperations.includes(op)
  );
  
  if (hasMediumRisk) {
    return 'MEDIUM';
  }
  
  return 'LOW';
}