import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import { resolveDatabaseConfig } from './config.ts';

dotenv.config();

const resolved = resolveDatabaseConfig(process.env, { preferAdmin: true });

if (resolved.source === 'unconfigured') {
  throw new Error(
    'Set DATABASE_URL (recommended) or SQL_HOST + SQL_DB_NAME + SQL_ADMIN_USER/SQL_USER in environment variables.'
  );
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials:
    resolved.source === 'database_url' && resolved.connectionString
      ? {
          url: resolved.connectionString,
          ssl: resolved.ssl,
        }
      : {
          host: resolved.host!,
          port: resolved.port ?? 5432,
          user: resolved.user!,
          password: resolved.password ?? '',
          database: resolved.database!,
          ssl: resolved.ssl,
        },
  verbose: true,
});
