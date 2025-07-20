import {
  ConfigSchema,
  Config,
  DatabaseConfig,
  MigrationsConfig,
  PostgRESTConfig,
  GeminiConfig,
} from "../types/config.js";

export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: Config | null = null;

  private constructor() {}

  static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  loadConfig(): Config {
    if (this.config) {
      return this.config;
    }

    const config = {
      database: {
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT || "5432"),
        database: process.env.DB_NAME || "",
        user: process.env.DB_USER || "",
        password: process.env.DB_PASSWORD || "",
        ssl: process.env.DB_SSL === "true",
      },
      migrations: {
        directory: process.env.MIGRATIONS_DIR || "./db/migrations",
        table: process.env.MIGRATIONS_TABLE || "schema_migrations",
      },
      postgrest: process.env.POSTGREST_ENDPOINT
        ? {
            endpoint: process.env.POSTGREST_ENDPOINT,
            keycloak: {
              url: process.env.KEYCLOAK_URL || "",
              clientId: process.env.KEYCLOAK_CLIENT_ID || "",
              username: process.env.KEYCLOAK_USERNAME || "",
              password: process.env.KEYCLOAK_PASSWORD || "",
              realm: process.env.KEYCLOAK_REALM || "master",
            },
          }
        : undefined,
      gemini: process.env.GENAI_TOKEN
        ? {
            apiKey: process.env.GENAI_TOKEN,
          }
        : undefined,
    };

    this.config = ConfigSchema.parse(config);
    return this.config;
  }

  getDatabaseConfig(): DatabaseConfig {
    const config = this.loadConfig();
    return config.database;
  }

  getMigrationsConfig(): MigrationsConfig {
    const config = this.loadConfig();
    return config.migrations;
  }

  getPostgRESTConfig(): PostgRESTConfig | null {
    const config = this.loadConfig();

    if (!config.postgrest?.endpoint || !config.postgrest?.keycloak) {
      return null;
    }

    return {
      endpoint: config.postgrest.endpoint,
      keycloak: {
        url: config.postgrest.keycloak.url!,
        clientId: config.postgrest.keycloak.clientId!,
        username: config.postgrest.keycloak.username!,
        password: config.postgrest.keycloak.password!,
        realm: config.postgrest.keycloak.realm,
      },
    };
  }

  isPostgRESTEnabled(): boolean {
    const config = this.loadConfig();
    return !!(
      config.postgrest?.endpoint &&
      config.postgrest?.keycloak?.url &&
      config.postgrest?.keycloak?.clientId &&
      config.postgrest?.keycloak?.username &&
      config.postgrest?.keycloak?.password
    );
  }

  getGeminiConfig(): GeminiConfig | null {
    const config = this.loadConfig();
    
    if (!config.gemini?.apiKey) {
      return null;
    }

    return {
      apiKey: config.gemini.apiKey,
    };
  }

  isGeminiEnabled(): boolean {
    const config = this.loadConfig();
    return !!(config.gemini?.apiKey);
  }

  validateConfig(): {valid: boolean; errors: string[]} {
    const errors: string[] = [];

    // Check required database configuration
    if (!process.env.DB_NAME) {
      errors.push("DB_NAME is required");
    }
    if (!process.env.DB_USER) {
      errors.push("DB_USER is required");
    }
    if (!process.env.DB_PASSWORD) {
      errors.push("DB_PASSWORD is required");
    }

    // Check PostgREST configuration if endpoint is provided
    if (process.env.POSTGREST_ENDPOINT) {
      if (!process.env.KEYCLOAK_URL) {
        errors.push("KEYCLOAK_URL is required when POSTGREST_ENDPOINT is set");
      }
      if (!process.env.KEYCLOAK_CLIENT_ID) {
        errors.push(
          "KEYCLOAK_CLIENT_ID is required when POSTGREST_ENDPOINT is set"
        );
      }
      if (!process.env.KEYCLOAK_USERNAME) {
        errors.push(
          "KEYCLOAK_USERNAME is required when POSTGREST_ENDPOINT is set"
        );
      }
      if (!process.env.KEYCLOAK_PASSWORD) {
        errors.push(
          "KEYCLOAK_PASSWORD is required when POSTGREST_ENDPOINT is set"
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  getRequiredEnvironmentVariables(): string[] {
    const required = [
      "DB_NAME - Database name",
      "DB_USER - Database username",
      "DB_PASSWORD - Database password",
    ];

    const optional = [
      "DB_HOST - Database host (default: localhost)",
      "DB_PORT - Database port (default: 5432)",
      "DB_SSL - Enable SSL (default: false)",
      "MIGRATIONS_DIR - Migrations directory (default: ./db/migrations)",
      "MIGRATIONS_TABLE - Migrations table name (default: schema_migrations)",
    ];

    const postgrestOptional = [
      "POSTGREST_ENDPOINT - PostgREST API endpoint",
      "KEYCLOAK_URL - Keycloak server URL",
      "KEYCLOAK_CLIENT_ID - Keycloak client ID",
      "KEYCLOAK_USERNAME - Keycloak username",
      "KEYCLOAK_PASSWORD - Keycloak password",
      "KEYCLOAK_REALM - Keycloak realm (default: master)",
    ];

    const geminiOptional = [
      "GENAI_TOKEN - Google Gemini API key for schema summarization",
    ];

    return [
      "Required:",
      ...required,
      "",
      "Optional:",
      ...optional,
      "",
      "PostgREST Features (optional):",
      ...postgrestOptional,
      "",
      "Gemini AI Features (optional):",
      ...geminiOptional,
    ];
  }

  getConfigurationExample(): string {
    return `# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database
DB_USER=your_username
DB_PASSWORD=your_password
DB_SSL=false

# Migration Configuration
MIGRATIONS_DIR=./db/migrations
MIGRATIONS_TABLE=schema_migrations

# PostgREST Configuration (optional)
POSTGREST_ENDPOINT=http://localhost:3000
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_CLIENT_ID=your_client_id
KEYCLOAK_USERNAME=your_username
KEYCLOAK_PASSWORD=your_password
KEYCLOAK_REALM=master

# Gemini AI Configuration (optional)
GENAI_TOKEN=your_gemini_api_key_here`;
  }
}
