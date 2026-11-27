import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from './app.ts';
import type { AuthenticatedUser } from './auth.ts';
import { parseServerConfig } from './config.ts';
import type { LeagueDb, LeagueStateSnapshot } from './db.ts';

function createMockDb(teacherUser: AuthenticatedUser, studentUser: AuthenticatedUser): LeagueDb {
  const emptySnapshot: LeagueStateSnapshot = {
    students: [
      {
        id: studentUser.id,
        classId: 'S404',
        username: studentUser.username,
        displayName: studentUser.displayName,
        role: 'student',
        teamDefault: 'A',
        active: true,
        createdAt: '2026-11-01T00:00:00.000Z',
        lastSeenAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    ],
    units: [],
    questions: [],
    answerKeys: {},
    sessions: [],
    participantsBySession: {},
    submissionsBySession: {},
    officialScores: [],
    scoreEvents: [],
    achievements: [],
    practiceExercises: [],
    practiceProgress: [],
  };

  return {
    async ensureInitialized() {},
    async getUserById(userId: string) {
      if (userId === teacherUser.id) return teacherUser;
      if (userId === studentUser.id) return studentUser;
      return null;
    },
    async authenticateUser(username: string, password: string) {
      if (username === 'teacher' && password === 'smth1384') return teacherUser;
      if (username === 'sara' && password === 'student-pass') return studentUser;
      return null;
    },
    async getStudentProfileById(studentId: string) {
      return emptySnapshot.students.find((s) => s.id === studentId) ?? null;
    },
    async getStateForUser() {
      return emptySnapshot;
    },
    async getBroadcastSnapshots() {
      return {
        usersById: new Map([
          [teacherUser.id, teacherUser],
          [studentUser.id, studentUser],
        ]),
        snapshotFor: () => emptySnapshot,
      };
    },
  } as unknown as LeagueDb;
}

async function startTestServer(options: {
  allowedOrigins?: string;
  cookieSameSite?: 'lax' | 'none' | 'strict' | 'auto';
  dbHealthy?: boolean;
} = {}) {
  const teacherUser: AuthenticatedUser = {
    id: 'teacher',
    username: 'teacher',
    displayName: 'Teacher',
    role: 'teacher',
    teamDefault: 'A',
    tokenVersion: 1,
  };
  const studentUser: AuthenticatedUser = {
    id: 'stu_1',
    username: 'sara',
    displayName: 'sara',
    role: 'student',
    teamDefault: 'A',
    tokenVersion: 1,
  };

  const config = parseServerConfig({
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: options.allowedOrigins ?? 'https://app.s404.example',
    COOKIE_SAMESITE: options.cookieSameSite ?? 'lax',
    TRUST_PROXY: '1',
    FRAME_ANCESTORS_SELF: 'true',
  });

  const { app, shutdown } = createApp({
    db: createMockDb(teacherUser, studentUser),
    config,
    checkDbHealth: async () => options.dbHealthy ?? true,
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to bind test server');
  }
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    async close() {
      shutdown();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

test('health endpoints report liveness and database readiness without leaking details', async () => {
  const healthy = await startTestServer({ dbHealthy: true });
  try {
    const resLive = await fetch(`${healthy.baseUrl}/api/health`);
    assert.equal(resLive.status, 200);
    const liveJson = (await resLive.json()) as { ok: boolean; service: string };
    assert.equal(liveJson.ok, true);
    assert.equal(liveJson.service, 's404-english-league');

    const resReady = await fetch(`${healthy.baseUrl}/api/health/ready`);
    assert.equal(resReady.status, 200);
    const readyJson = (await resReady.json()) as { ok: boolean; database: string };
    assert.equal(readyJson.database, 'connected');
  } finally {
    await healthy.close();
  }

  const unhealthy = await startTestServer({ dbHealthy: false });
  try {
    const resDown = await fetch(`${unhealthy.baseUrl}/api/health/ready`);
    assert.equal(resDown.status, 503);
    const downJson = (await resDown.json()) as { ok: boolean; database: string };
    assert.equal(downJson.ok, false);
    assert.equal(downJson.database, 'unavailable');
  } finally {
    await unhealthy.close();
  }
});

test('CORS allowlist, CSRF origin validation, cookie security flags, role auth, and SSE stream work in production mode', async () => {
  const srv = await startTestServer({
    allowedOrigins: 'https://app.s404.example',
    cookieSameSite: 'lax',
  });

  try {
    // Untrusted origin receives no wildcard CORS header and is blocked by CSRF
    const badOriginRes = await fetch(`${srv.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example',
        'X-Requested-With': 'S404',
      },
      body: JSON.stringify({ username: 'teacher', password: 'smth1384' }),
    });
    assert.equal(badOriginRes.status, 403);
    assert.equal(badOriginRes.headers.get('access-control-allow-origin'), null);
    assert.equal(badOriginRes.headers.get('x-content-type-options'), 'nosniff');

    // Allowed origin over proxied HTTPS succeeds and emits Secure + HttpOnly + SameSite=Lax cookie
    const loginRes = await fetch(`${srv.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://app.s404.example',
        'X-Forwarded-Proto': 'https',
      },
      body: JSON.stringify({ username: 'sara', password: 'student-pass' }),
    });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.headers.get('access-control-allow-origin'), 'https://app.s404.example');
    assert.equal(loginRes.headers.get('access-control-allow-credentials'), 'true');

    const setCookie = loginRes.headers.get('set-cookie') ?? '';
    assert.match(setCookie, /s404_session=/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /SameSite=Lax/);
    const cookiePair = setCookie.split(';')[0];

    // Student session restores via /api/auth/me
    const meRes = await fetch(`${srv.baseUrl}/api/auth/me`, {
      headers: { Cookie: cookiePair },
    });
    assert.equal(meRes.status, 200);
    const meJson = (await meRes.json()) as { user: { username: string; role: string } };
    assert.equal(meJson.user.username, 'sara');
    assert.equal(meJson.user.role, 'student');

    // Student cannot invoke teacher-only endpoints
    const forbiddenRes = await fetch(`${srv.baseUrl}/api/students`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookiePair,
        'X-Requested-With': 'S404',
      },
      body: JSON.stringify({ username: 'new_stu', password: 'pass1234', teamDefault: 'A' }),
    });
    assert.equal(forbiddenRes.status, 403);

    // SSE stream returns proper headers, retry directive, and initial state event
    const controller = new AbortController();
    const sseRes = await fetch(`${srv.baseUrl}/api/stream`, {
      headers: { Cookie: cookiePair },
      signal: controller.signal,
    });
    assert.equal(sseRes.status, 200);
    assert.match(sseRes.headers.get('content-type') ?? '', /text\/event-stream/);
    assert.equal(sseRes.headers.get('x-accel-buffering'), 'no');
    assert.equal(sseRes.headers.get('cache-control'), 'no-cache, no-transform');

    const reader = sseRes.body!.getReader();
    let buffered = '';
    while (!buffered.includes('event: state')) {
      const { value, done } = await reader.read();
      if (done) break;
      buffered += new TextDecoder().decode(value);
    }
    assert.match(buffered, /retry: 3000/);
    assert.match(buffered, /event: state/);
    controller.abort();
  } finally {
    await srv.close();
  }
});
