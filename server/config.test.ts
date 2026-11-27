import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDatabaseConfig, hasDatabaseConfig } from '../src/db/config.ts';
import { buildApiUrl } from '../src/lib/leagueApi.ts';
import {
  parseAllowedOrigins,
  parseCookieSameSite,
  parseServerConfig,
  parseTrustProxy,
} from './config.ts';

test('resolveDatabaseConfig prefers DATABASE_URL and respects SSL modes', () => {
  const remote = resolveDatabaseConfig({
    DATABASE_URL: 'postgres://s404:secret@db.example.com:5432/s404_prod?sslmode=require',
  });
  assert.equal(remote.source, 'database_url');
  assert.equal(remote.host, 'db.example.com');
  assert.equal(remote.port, 5432);
  assert.equal(remote.database, 's404_prod');
  assert.deepEqual(remote.ssl, { rejectUnauthorized: true });

  const noVerify = resolveDatabaseConfig({
    DATABASE_URL: 'postgres://s404:secret@db.example.com:5432/s404_prod',
    DATABASE_SSL: 'require',
    DATABASE_SSL_REJECT_UNAUTHORIZED: 'false',
  });
  assert.deepEqual(noVerify.ssl, { rejectUnauthorized: false });

  const localUrl = resolveDatabaseConfig({
    DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/s404',
  });
  assert.equal(localUrl.ssl, false);
});

test('resolveDatabaseConfig falls back cleanly to legacy SQL_* vars', () => {
  const legacy = resolveDatabaseConfig(
    {
      SQL_HOST: '/cloudsql/project:region:instance',
      SQL_USER: 'app_user',
      SQL_ADMIN_USER: 'postgres',
      SQL_PASSWORD: 'pw1',
      SQL_ADMIN_PASSWORD: 'pw2',
      SQL_DB_NAME: 's404',
    },
    { preferAdmin: true }
  );
  assert.equal(legacy.source, 'sql_vars');
  assert.equal(legacy.user, 'postgres');
  assert.equal(legacy.password, 'pw2');
  assert.equal(legacy.ssl, false);

  assert.equal(hasDatabaseConfig({}), false);
  assert.equal(hasDatabaseConfig({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' }), true);
});

test('parseServerConfig handles proxy hops, CORS allowlists, and cookie SameSite policies', () => {
  assert.equal(parseTrustProxy(undefined), 1);
  assert.equal(parseTrustProxy('false'), false);
  assert.equal(parseTrustProxy('2'), 2);

  assert.deepEqual(
    parseAllowedOrigins('https://s404.example.com/, invalid-url, http://localhost:5173'),
    ['https://s404.example.com', 'http://localhost:5173']
  );

  assert.equal(parseCookieSameSite('lax'), 'lax');
  assert.equal(parseCookieSameSite('STRICT'), 'strict');
  assert.equal(parseCookieSameSite('unknown'), 'auto');

  const cfg = parseServerConfig({
    PORT: '8080',
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: 'https://s404.example.com',
    COOKIE_SAMESITE: 'lax',
    TRUST_PROXY: '1',
    FRAME_ANCESTORS_SELF: 'true',
  });
  assert.equal(cfg.port, 8080);
  assert.equal(cfg.isProd, true);
  assert.equal(cfg.cookieSameSite, 'lax');
  assert.equal(cfg.frameAncestorsSelf, true);
});

test('buildApiUrl resolves relative same-origin paths and external API base URLs cleanly', () => {
  assert.equal(buildApiUrl('/api/auth/me', ''), '/api/auth/me');
  assert.equal(buildApiUrl('api/stream', ''), '/api/stream');
  assert.equal(
    buildApiUrl('/api/stream', 'https://api.s404class.org/'),
    'https://api.s404class.org/api/stream'
  );
});
