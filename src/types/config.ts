import { z } from 'zod';

export const ConfigSchema = z.object({
  database: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(5432),
    database: z.string(),
    user: z.string(),
    password: z.string(),
    ssl: z.boolean().default(false),
  }),
  migrations: z.object({
    directory: z.string().default('./db/migrations'),
    table: z.string().default('schema_migrations'),
  }),
  postgrest: z.object({
    endpoint: z.string().optional(),
    keycloak: z.object({
      url: z.string().optional(),
      clientId: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      realm: z.string().default('master'),
    }).optional(),
  }).optional(),
  gemini: z.object({
    apiKey: z.string().optional(),
  }).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

export interface MigrationsConfig {
  directory: string;
  table: string;
}

export interface PostgRESTConfig {
  endpoint: string;
  keycloak: KeycloakConfig;
}

export interface KeycloakConfig {
  url: string;
  clientId: string;
  username: string;
  password: string;
  realm: string;
}

export interface GeminiConfig {
  apiKey: string;
}