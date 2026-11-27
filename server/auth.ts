import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '../src/types/league.ts';
import type { CookieSameSitePolicy } from './config.ts';

export const SESSION_COOKIE_NAME = 's404_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ENV_SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : null;

let runtimeSessionSecret = ENV_SESSION_SECRET ?? crypto.randomBytes(32).toString('hex');

export function hasEnvSessionSecret(): boolean {
  return ENV_SESSION_SECRET !== null;
}

export function setRuntimeSessionSecret(secret: string): void {
  if (ENV_SESSION_SECRET) return;
  if (secret && secret.trim().length >= 16) {
    runtimeSessionSecret = secret.trim();
  }
}

export function getActiveSessionSecret(): string {
  return ENV_SESSION_SECRET ?? runtimeSessionSecret;
}

export interface AuthSessionPayload {
  userId: string;
  username: string;
  role: UserRole;
  tokenVersion: number;
  exp: number;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  teamDefault: 'A' | 'B';
  tokenVersion: number;
}

export function hashPassword(password: string, saltHex?: string): string {
  const salt = saltHex ?? crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function signSessionToken(payload: Omit<AuthSessionPayload, 'exp'>): string {
  const fullPayload: AuthSessionPayload = {
    ...payload,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getActiveSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | undefined): AuthSessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;
  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getActiveSessionSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AuthSessionPayload;
    if (
      !parsed ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.username !== 'string' ||
      (parsed.role !== 'teacher' && parsed.role !== 'student') ||
      typeof parsed.tokenVersion !== 'number' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const rawVal = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(rawVal);
    } catch {
      result[key] = rawVal;
    }
  }
  return result;
}

export function isHttpsRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string') {
    return proto.split(',')[0].trim().toLowerCase() === 'https';
  }
  return false;
}

function buildCookieAttributes(
  req: Request,
  policy: CookieSameSitePolicy | 'auto' = 'auto'
): string[] {
  const https = isHttpsRequest(req);
  if (!https) {
    return ['SameSite=Lax'];
  }
  if (policy === 'strict') {
    return ['Secure', 'SameSite=Strict'];
  }
  if (policy === 'lax') {
    return ['Secure', 'SameSite=Lax'];
  }
  return ['Secure', 'SameSite=None', 'Partitioned'];
}

export function setSessionCookie(
  req: Request,
  res: Response,
  token: string,
  policy: CookieSameSitePolicy | 'auto' = 'auto'
): void {
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSec}`,
    ...buildCookieAttributes(req, policy),
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(
  req: Request,
  res: Response,
  policy: CookieSameSitePolicy | 'auto' = 'auto'
): void {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    ...buildCookieAttributes(req, policy),
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function createCsrfMiddleware(allowedOrigins: string[] = []) {
  const allowedOriginSet = new Set(allowedOrigins);

  return function requireCsrfProtection(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }

    const originHeader = req.headers.origin;
    const hostHeader = (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host;

    if (originHeader) {
      try {
        const parsed = new URL(originHeader);
        if (allowedOriginSet.has(parsed.origin)) {
          next();
          return;
        }
        if (hostHeader && parsed.host === hostHeader.split(',')[0].trim()) {
          next();
          return;
        }
      } catch {
        // Fall through to 403
      }
      res.status(403).json({ error: 'Cross-site request blocked.' });
      return;
    }

    if (req.headers['x-requested-with'] === 'S404') {
      next();
      return;
    }

    res.status(403).json({ error: 'Cross-site request blocked.' });
  };
}

export const requireCsrfProtection = createCsrfMiddleware();
