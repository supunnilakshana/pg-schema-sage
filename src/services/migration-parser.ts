import { promises as fs } from 'fs';
import { join, basename } from 'path';
import { 
  Migration, 
  MigrationFile, 
  ParsedMigration, 
  MigrationHistory, 
  MigrationAnalysis, 
  MigrationError, 
  AppliedMigration 
} from '../types/migration.js';

export class MigrationParser {
  constructor(private migrationsDir: string) {}

  async parseMigrationFiles(): Promise<MigrationFile[]> {
    try {
      const files = await fs.readdir(this.migrationsDir);
      const migrationFiles = files.filter(file => file.endsWith('.sql'));
      
      const parsedFiles: MigrationFile[] = [];
      
      for (const filename of migrationFiles) {
        const filePath = join(this.migrationsDir, filename);
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = this.parseMigrationContent(filename, content);
        
        parsedFiles.push({
          filename,
          content,
          parsed,
        });
      }
      
      return parsedFiles.sort((a, b) => a.parsed.version.localeCompare(b.parsed.version));
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  parseMigrationContent(filename: string, content: string): ParsedMigration {
    const errors: string[] = [];
    const version = this.extractVersion(filename);
    const name = this.extractName(filename);
    
    if (!version) {
      errors.push('Invalid filename format: unable to extract version');
    }
    
    const { upSql, downSql } = this.parseMigrationSections(content);
    
    if (!upSql.trim()) {
      errors.push('Missing or empty migrate:up section');
    }
    
    if (!downSql.trim()) {
      errors.push('Missing or empty migrate:down section');
    }
    
    return {
      version: version || '',
      name: name || '',
      upSql,
      downSql,
      hasValidStructure: errors.length === 0,
      errors,
    };
  }

  private extractVersion(filename: string): string | null {
    const match = filename.match(/^(\d+)/);
    return match ? match[1] : null;
  }

  private extractName(filename: string): string | null {
    const match = filename.match(/^\d+_(.+)\.sql$/);
    return match ? match[1].replace(/_/g, ' ') : null;
  }

  private parseMigrationSections(content: string): { upSql: string; downSql: string } {
    const lines = content.split('\n');
    let upSql = '';
    let downSql = '';
    let currentSection: 'up' | 'down' | 'none' = 'none';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('-- migrate:up')) {
        currentSection = 'up';
        continue;
      }
      
      if (trimmed.startsWith('-- migrate:down')) {
        currentSection = 'down';
        continue;
      }
      
      if (currentSection === 'up') {
        upSql += line + '\n';
      } else if (currentSection === 'down') {
        downSql += line + '\n';
      }
    }
    
    return {
      upSql: upSql.trim(),
      downSql: downSql.trim(),
    };
  }

  async analyzeMigrations(): Promise<MigrationAnalysis> {
    const files = await this.parseMigrationFiles();
    const analysis: MigrationAnalysis = {
      totalFiles: files.length,
      validMigrations: 0,
      invalidMigrations: 0,
      missingDownMigrations: 0,
      duplicateVersions: [],
      migrationChain: [],
      errors: [],
    };
    
    const versionCounts: { [version: string]: number } = {};
    
    for (const file of files) {
      const { parsed } = file;
      
      if (parsed.hasValidStructure) {
        analysis.validMigrations++;
      } else {
        analysis.invalidMigrations++;
        
        for (const error of parsed.errors) {
          analysis.errors.push({
            filename: file.filename,
            type: 'PARSE_ERROR',
            message: error,
          });
        }
      }
      
      if (!parsed.downSql.trim()) {
        analysis.missingDownMigrations++;
      }
      
      if (parsed.version) {
        versionCounts[parsed.version] = (versionCounts[parsed.version] || 0) + 1;
      }
      
      if (parsed.hasValidStructure) {
        analysis.migrationChain.push({
          version: parsed.version,
          name: parsed.name,
          filename: file.filename,
          upSql: parsed.upSql,
          downSql: parsed.downSql,
        });
      }
    }
    
    analysis.duplicateVersions = Object.keys(versionCounts)
      .filter(version => versionCounts[version] > 1);
    
    for (const version of analysis.duplicateVersions) {
      analysis.errors.push({
        filename: '',
        type: 'DUPLICATE_VERSION',
        message: `Version ${version} appears in multiple migration files`,
      });
    }
    
    return analysis;
  }

  async getMigrationHistory(appliedMigrations: AppliedMigration[]): Promise<MigrationHistory> {
    const files = await this.parseMigrationFiles();
    const appliedVersions = new Set(appliedMigrations.map(m => m.version));
    
    const pendingMigrations: Migration[] = [];
    let lastAppliedVersion: string | undefined;
    
    for (const file of files) {
      if (file.parsed.hasValidStructure) {
        const migration: Migration = {
          version: file.parsed.version,
          name: file.parsed.name,
          filename: file.filename,
          upSql: file.parsed.upSql,
          downSql: file.parsed.downSql,
        };
        
        if (!appliedVersions.has(file.parsed.version)) {
          pendingMigrations.push(migration);
        } else {
          const applied = appliedMigrations.find(m => m.version === file.parsed.version);
          if (applied) {
            migration.appliedAt = applied.appliedAt;
          }
        }
      }
    }
    
    if (appliedMigrations.length > 0) {
      const sortedApplied = appliedMigrations.sort((a, b) => 
        b.appliedAt.getTime() - a.appliedAt.getTime()
      );
      lastAppliedVersion = sortedApplied[0].version;
    }
    
    const migrationChain: Migration[] = [];
    
    for (const file of files) {
      if (file.parsed.hasValidStructure) {
        const migration: Migration = {
          version: file.parsed.version,
          name: file.parsed.name,
          filename: file.filename,
          upSql: file.parsed.upSql,
          downSql: file.parsed.downSql,
        };
        
        const applied = appliedMigrations.find(m => m.version === file.parsed.version);
        if (applied) {
          migration.appliedAt = applied.appliedAt;
        }
        
        migrationChain.push(migration);
      }
    }
    
    return {
      appliedMigrations,
      pendingMigrations,
      totalMigrations: files.length,
      lastAppliedVersion,
      migrationChain,
    };
  }

  async readMigrationFile(filename: string): Promise<string> {
    const filePath = join(this.migrationsDir, filename);
    return await fs.readFile(filePath, 'utf-8');
  }

  async writeMigrationFile(filename: string, content: string): Promise<void> {
    const filePath = join(this.migrationsDir, filename);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async ensureMigrationsDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.migrationsDir, { recursive: true });
    } catch (error) {
      if ((error as any).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  generateMigrationTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  generateMigrationFilename(name: string): string {
    const timestamp = this.generateMigrationTimestamp();
    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `${timestamp}_${safeName}.sql`;
  }

  formatMigrationContent(upSql: string, downSql: string): string {
    return `-- migrate:up
${upSql}

-- migrate:down
${downSql}
`;
  }
}