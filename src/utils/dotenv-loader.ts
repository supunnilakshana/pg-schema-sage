import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

export class DotenvLoader {
  static load(envPath?: string): void {
    const defaultPath = resolve(process.cwd(), '.env');
    const targetPath = envPath || defaultPath;

    if (!existsSync(targetPath)) {
      console.warn(`Warning: .env file not found at ${targetPath}`);
      return;
    }

    const result = config({ path: targetPath });

    if (result.error) {
      console.error('Error loading .env file:', result.error);
      throw result.error;
    }

    console.log(`Environment variables loaded from: ${targetPath}`);
    
    // Validate required variables
    const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  static validate(): boolean {
    const required = [
      'DB_HOST',
      'DB_PORT', 
      'DB_NAME',
      'DB_USER',
      'DB_PASSWORD'
    ];

    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      console.error(`Missing required environment variables: ${missing.join(', ')}`);
      return false;
    }

    return true;
  }

  static getConfig() {
    return {
      database: {
        host: process.env.DB_HOST!,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME!,
        user: process.env.DB_USER!,
        password: process.env.DB_PASSWORD!,
        ssl: process.env.DB_SSL === 'true'
      },
      migrations: {
        directory: process.env.MIGRATIONS_DIR || './db/migrations',
        table: process.env.MIGRATIONS_TABLE || 'schema_migrations'
      },
      postgrest: process.env.POSTGREST_ENDPOINT ? {
        endpoint: process.env.POSTGREST_ENDPOINT,
        keycloak: {
          url: process.env.KEYCLOAK_URL!,
          clientId: process.env.KEYCLOAK_CLIENT_ID!,
          username: process.env.KEYCLOAK_USERNAME!,
          password: process.env.KEYCLOAK_PASSWORD!,
          realm: process.env.KEYCLOAK_REALM || 'master'
        }
      } : undefined
    };
  }
}