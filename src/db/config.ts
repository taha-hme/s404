export interface ResolvedDbConfig {
  source: 'database_url' | 'sql_vars' | 'unconfigured';
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl: boolean | { rejectUnauthorized: boolean };
}

function isLocalOrSocketHost(host: string | undefined): boolean {
  if (!host) return true;
  const h = host.trim().toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === 'postgres' ||
    h === 'db' ||
    h.startsWith('/')
  );
}

function resolveSslOption(
  env: Record<string, string | undefined>,
  hostHint?: string,
  urlSslMode?: string | null
): boolean | { rejectUnauthorized: boolean } {
  const explicit = env.DATABASE_SSL?.trim().toLowerCase();
  const rejectUnauthorized = env.DATABASE_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() !== 'false';

  if (explicit === 'false' || explicit === 'disable' || explicit === 'off') {
    return false;
  }
  if (explicit === 'no-verify') {
    return { rejectUnauthorized: false };
  }
  if (explicit === 'true' || explicit === 'require' || explicit === 'on') {
    return { rejectUnauthorized };
  }

  const mode = urlSslMode?.trim().toLowerCase();
  if (mode === 'disable') return false;
  if (mode === 'no-verify' || mode === 'allow' || mode === 'prefer') {
    return { rejectUnauthorized: false };
  }
  if (mode === 'require' || mode === 'verify-ca' || mode === 'verify-full') {
    return { rejectUnauthorized };
  }

  return isLocalOrSocketHost(hostHint) ? false : { rejectUnauthorized };
}

export function resolveDatabaseConfig(
  env: Record<string, string | undefined> = process.env,
  options: { preferAdmin?: boolean } = {}
): ResolvedDbConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (databaseUrl) {
    let parsedHost: string | undefined;
    let parsedPort: number | undefined;
    let parsedUser: string | undefined;
    let parsedPassword: string | undefined;
    let parsedDb: string | undefined;
    let sslMode: string | null = null;

    try {
      const parsed = new URL(databaseUrl);
      parsedHost = parsed.hostname || undefined;
      parsedPort = parsed.port ? Number(parsed.port) : 5432;
      parsedUser = parsed.username ? decodeURIComponent(parsed.username) : undefined;
      parsedPassword = parsed.password ? decodeURIComponent(parsed.password) : undefined;
      parsedDb = parsed.pathname.replace(/^\/+/, '') || undefined;
      sslMode = parsed.searchParams.get('sslmode');
    } catch {
      // Leave parsed fields undefined if DATABASE_URL has non-standard socket syntax
    }

    return {
      source: 'database_url',
      connectionString: databaseUrl,
      host: parsedHost,
      port: parsedPort,
      user: parsedUser,
      password: parsedPassword,
      database: parsedDb,
      ssl: resolveSslOption(env, parsedHost, sslMode),
    };
  }

  const host = env.SQL_HOST?.trim();
  const database = env.SQL_DB_NAME?.trim();
  const user = options.preferAdmin
    ? env.SQL_ADMIN_USER?.trim() || env.SQL_USER?.trim()
    : env.SQL_USER?.trim() || env.SQL_ADMIN_USER?.trim();
  const password = options.preferAdmin
    ? env.SQL_ADMIN_PASSWORD ?? env.SQL_PASSWORD
    : env.SQL_PASSWORD ?? env.SQL_ADMIN_PASSWORD;
  const port = Number(env.SQL_PORT || 5432);

  if (host && database && user) {
    return {
      source: 'sql_vars',
      host,
      port: Number.isFinite(port) && port > 0 ? port : 5432,
      user,
      password,
      database,
      ssl: resolveSslOption(env, host, null),
    };
  }

  return {
    source: 'unconfigured',
    ssl: false,
  };
}

export function hasDatabaseConfig(
  env: Record<string, string | undefined> = process.env
): boolean {
  return resolveDatabaseConfig(env).source !== 'unconfigured';
}
