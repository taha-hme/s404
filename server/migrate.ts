import 'dotenv/config';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { Pool } from 'pg';
import { resolveDatabaseConfig } from '../src/db/config.ts';

async function runMigrations() {
  const resolved = resolveDatabaseConfig(process.env, { preferAdmin: true });
  if (resolved.source === 'unconfigured') {
    throw new Error(
      'Database connection is not configured. Set DATABASE_URL or SQL_HOST/SQL_DB_NAME/SQL_USER.'
    );
  }

  const pool = new Pool(
    resolved.source === 'database_url' && resolved.connectionString
      ? { connectionString: resolved.connectionString, ssl: resolved.ssl }
      : {
          host: resolved.host,
          port: resolved.port,
          user: resolved.user,
          password: resolved.password,
          database: resolved.database,
          ssl: resolved.ssl,
        }
  );

  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

  try {
    // Safe baseline: if tables already exist (e.g. restored pg_dump or pre-Drizzle DB)
    // and __drizzle_migrations has not been initialized yet, record the initial 0000
    // schema migration without dropping or recreating existing tables.
    const check = await pool.query<{
      existing_users: string | null;
      existing_migrations: string | null;
    }>(`
      SELECT
        to_regclass('public.users')::text AS existing_users,
        to_regclass('drizzle.__drizzle_migrations')::text AS existing_migrations
    `);

    const row = check.rows[0];
    if (row?.existing_users && !row?.existing_migrations) {
      const files = readMigrationFiles({ migrationsFolder });
      if (files.length > 0) {
        const initial = files[0];
        await pool.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
        await pool.query(`
          CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
            id SERIAL PRIMARY KEY,
            hash text NOT NULL,
            created_at bigint
          )
        `);
        await pool.query(
          `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)`,
          [initial.hash, initial.folderMillis]
        );
        console.log('Baselined existing PostgreSQL schema cleanly without modifying existing data.');
      }
    }

    const db = drizzle(pool);
    await migrate(db, { migrationsFolder });
    console.log('Drizzle PostgreSQL migrations are up to date.');
  } finally {
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
