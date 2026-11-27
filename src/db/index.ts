import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import { resolveDatabaseConfig } from './config.ts';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = (): Pool => {
  if (!global._postgresPool) {
    const resolved = resolveDatabaseConfig(process.env);
    const maxPool = Number(process.env.PG_POOL_MAX || 10);

    const poolConfig: PoolConfig = {
      max: Number.isFinite(maxPool) && maxPool > 0 ? maxPool : 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
      ssl: resolved.ssl,
    };

    if (resolved.source === 'database_url' && resolved.connectionString) {
      poolConfig.connectionString = resolved.connectionString;
    } else if (resolved.source === 'sql_vars') {
      poolConfig.host = resolved.host;
      poolConfig.port = resolved.port;
      poolConfig.user = resolved.user;
      poolConfig.password = resolved.password;
      poolConfig.database = resolved.database;
    }

    global._postgresPool = new Pool(poolConfig);

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const pgDb = drizzle(pool, { schema });
export type PostgresDb = NodePgDatabase<typeof schema>;

export async function checkDatabaseHealth(timeoutMs = 3000): Promise<boolean> {
  const resolved = resolveDatabaseConfig(process.env);
  if (resolved.source === 'unconfigured') {
    return false;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const queryPromise = createPool().query('SELECT 1');
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Database health check timeout')), timeoutMs);
    });
    await Promise.race([queryPromise, timeoutPromise]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function closePool(): Promise<void> {
  if (global._postgresPool) {
    const activePool = global._postgresPool;
    global._postgresPool = undefined;
    await activePool.end();
  }
}
