export type CookieSameSitePolicy = 'lax' | 'none' | 'strict';

export interface ServerRuntimeConfig {
  port: number;
  isProd: boolean;
  trustProxy: boolean | number;
  allowedOrigins: string[];
  cookieSameSite: CookieSameSitePolicy | 'auto';
  logRequests: boolean;
  frameAncestorsSelf: boolean;
}

export function parseTrustProxy(raw: string | undefined): boolean | number {
  if (!raw || !raw.trim()) return 1;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'off') {
    return false;
  }
  if (normalized === 'true' || normalized === 'on') {
    return 1;
  }
  const num = Number(normalized);
  if (Number.isInteger(num) && num >= 1 && num <= 10) {
    return num;
  }
  return 1;
}

export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        continue;
      }
      if (!seen.has(parsed.origin)) {
        seen.add(parsed.origin);
        result.push(parsed.origin);
      }
    } catch {
      // Ignore invalid origin entries
    }
  }
  return result;
}

export function parseCookieSameSite(raw: string | undefined): CookieSameSitePolicy | 'auto' {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === 'lax' || normalized === 'none' || normalized === 'strict') {
    return normalized;
  }
  return 'auto';
}

export function parseServerConfig(
  env: Record<string, string | undefined> = process.env
): ServerRuntimeConfig {
  const rawPort = Number(env.PORT || 3000);
  const port = Number.isInteger(rawPort) && rawPort > 0 && rawPort <= 65535 ? rawPort : 3000;

  return {
    port,
    isProd: env.NODE_ENV === 'production',
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS),
    cookieSameSite: parseCookieSameSite(env.COOKIE_SAMESITE),
    logRequests: env.LOG_REQUESTS === 'true',
    frameAncestorsSelf: env.FRAME_ANCESTORS_SELF === 'true',
  };
}
