import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import {
  clearSessionCookie,
  createCsrfMiddleware,
  parseCookies,
  SESSION_COOKIE_NAME,
  setSessionCookie,
  signSessionToken,
  verifySessionToken,
  type AuthenticatedUser,
} from './auth.ts';
import { parseServerConfig, type ServerRuntimeConfig } from './config.ts';
import { createLeagueDb, DomainError, type LeagueDb } from './db.ts';
import type {
  ActivityType,
  AnswerKey,
  BadgeKey,
  Question,
  ScoreEvent,
  SessionMode,
} from '../src/types/league.ts';

declare module 'express-serve-static-core' {
  interface Request {
    authUser?: AuthenticatedUser | null;
  }
}

export interface CreateAppOptions {
  db?: LeagueDb;
  config?: ServerRuntimeConfig;
  checkDbHealth?: () => Promise<boolean>;
}

export interface CreatedApp {
  app: Express;
  shutdown: () => void;
}

interface SseClient {
  id: number;
  userId: string;
  tokenVersion: number;
  res: Response;
}

export function createApp(options: CreateAppOptions = {}): CreatedApp {
  const config = options.config ?? parseServerConfig(process.env);
  const db = options.db ?? createLeagueDb();
  const checkDbHealth =
    options.checkDbHealth ??
    (async () => {
      const mod = await import('../src/db/index.ts');
      return mod.checkDatabaseHealth();
    });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(express.json({ limit: '512kb' }));

  const allowedOriginSet = new Set(config.allowedOrigins);

  // Baseline HTTP security headers & strict origin-allowlisted CORS
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (config.frameAncestorsSelf) {
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    }

    const requestOrigin = req.headers.origin;
    if (requestOrigin && allowedOriginSet.has(requestOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
    }

    next();
  });

  if (config.logRequests) {
    app.use('/api', (req, res, next) => {
      const startMs = Date.now();
      res.on('finish', () => {
        if (res.statusCode >= 400 || config.logRequests) {
          console.log(
            `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startMs}ms`
          );
        }
      });
      next();
    });
  }

  let nextClientId = 1;
  const sseClients = new Map<number, SseClient>();
  const activeRoundEndsAt = new Map<string, number>();
  let tickRunning = false;

  async function broadcastState(): Promise<void> {
    if (sseClients.size === 0) return;
    const userIds = Array.from(sseClients.values()).map((c) => c.userId);
    const { usersById, snapshotFor } = await db.getBroadcastSnapshots(userIds);

    for (const [clientId, client] of sseClients.entries()) {
      try {
        const freshUser = usersById.get(client.userId);
        if (!freshUser || freshUser.tokenVersion !== client.tokenVersion) {
          try {
            client.res.write('event: unauthorized\ndata: {}\n\n');
            client.res.end();
          } catch {
            // ignore closed socket
          }
          sseClients.delete(clientId);
          continue;
        }
        const snapshot = snapshotFor(freshUser);
        client.res.write(`event: state\ndata: ${JSON.stringify(snapshot)}\n\n`);
      } catch {
        sseClients.delete(clientId);
      }
    }
  }

  const tickTimer = setInterval(() => {
    if (tickRunning || sseClients.size === 0 || activeRoundEndsAt.size === 0) {
      return;
    }
    tickRunning = true;
    (async () => {
      const nowMs = Date.now();
      for (const [sessionId, endMs] of activeRoundEndsAt.entries()) {
        if (nowMs >= endMs) {
          activeRoundEndsAt.delete(sessionId);
          await db.finalizeExpiredSession(sessionId);
        }
      }
      await broadcastState();
    })()
      .catch(() => {
        // ignore background tick errors
      })
      .finally(() => {
        tickRunning = false;
      });
  }, 1000);
  tickTimer.unref();

  const keepaliveTimer = setInterval(() => {
    for (const [clientId, client] of sseClients.entries()) {
      try {
        client.res.write(': keepalive\n\n');
      } catch {
        sseClients.delete(clientId);
      }
    }
  }, 25000);
  keepaliveTimer.unref();

  async function attachAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await db.ensureInitialized();
      const cookies = parseCookies(req.headers.cookie);
      const payload = verifySessionToken(cookies[SESSION_COOKIE_NAME]);
      if (!payload) {
        req.authUser = null;
        next();
        return;
      }
      const user = await db.getUserById(payload.userId);
      if (!user || user.tokenVersion !== payload.tokenVersion) {
        req.authUser = null;
        next();
        return;
      }
      req.authUser = user;
      next();
    } catch (err) {
      console.error('Auth middleware failed:', err);
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
    }
  }

  function requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    next();
  }

  function requireTeacher(req: Request, res: Response, next: NextFunction): void {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (req.authUser.role !== 'teacher') {
      res.status(403).json({ error: 'Only the teacher account can perform this action.' });
      return;
    }
    next();
  }

  function handleRouteError(res: Response, err: unknown): void {
    if (err instanceof DomainError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('API route error:', err);
    res.status(500).json({ error: 'Database request failed. Please try again.' });
  }

  // Liveness health check (fast, does not query DB unnecessarily)
  app.get('/api/health', async (req, res) => {
    if (req.query.db === '1') {
      const dbOk = await checkDbHealth();
      if (!dbOk) {
        res.status(503).json({ ok: false, service: 's404-english-league', database: 'unavailable' });
        return;
      }
      res.json({
        ok: true,
        service: 's404-english-league',
        database: 'connected',
        uptimeSec: Math.round(process.uptime()),
      });
      return;
    }
    res.json({
      ok: true,
      service: 's404-english-league',
      uptimeSec: Math.round(process.uptime()),
    });
  });

  // Readiness health check (verifies PostgreSQL connectivity)
  app.get('/api/health/ready', async (_req, res) => {
    const dbOk = await checkDbHealth();
    if (!dbOk) {
      res.status(503).json({ ok: false, service: 's404-english-league', database: 'unavailable' });
      return;
    }
    res.json({
      ok: true,
      service: 's404-english-league',
      database: 'connected',
      uptimeSec: Math.round(process.uptime()),
    });
  });

  app.use('/api', createCsrfMiddleware(config.allowedOrigins), attachAuth);

  app.get('/api/auth/me', async (req, res) => {
    try {
      if (!req.authUser) {
        res.json({ user: null, student: null });
        return;
      }
      const student =
        req.authUser.role === 'student'
          ? await db.getStudentProfileById(req.authUser.id)
          : null;
      res.json({
        user: {
          id: req.authUser.id,
          username: req.authUser.username,
          displayName: req.authUser.displayName,
          role: req.authUser.role,
        },
        student,
      });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const username = typeof req.body?.username === 'string' ? req.body.username : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!username.trim() || !password) {
        res.status(400).json({ error: 'Enter your username and password.' });
        return;
      }

      const user = await db.authenticateUser(username, password);
      if (!user) {
        res.status(401).json({ error: 'Invalid username or password.' });
        return;
      }

      const token = signSessionToken({
        userId: user.id,
        username: user.username,
        role: user.role,
        tokenVersion: user.tokenVersion,
      });
      setSessionCookie(req, res, token, config.cookieSameSite);

      const student =
        user.role === 'student' ? await db.getStudentProfileById(user.id) : null;
      res.json({
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
        },
        student,
      });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(req, res, config.cookieSameSite);
    res.json({ ok: true });
  });

  async function syncActiveRoundsFromSnapshot(
    sessionsList: Array<{ id: string; status: string; remainingSeconds: number }>
  ): Promise<void> {
    const activeIds = new Set<string>();
    for (const s of sessionsList) {
      if (s.status === 'active' && s.remainingSeconds > 0) {
        activeIds.add(s.id);
        if (!activeRoundEndsAt.has(s.id)) {
          activeRoundEndsAt.set(s.id, Date.now() + s.remainingSeconds * 1000);
        }
      }
    }
    for (const existingId of activeRoundEndsAt.keys()) {
      if (!activeIds.has(existingId)) {
        activeRoundEndsAt.delete(existingId);
      }
    }
  }

  app.get('/api/state', requireAuth, async (req, res) => {
    try {
      const snapshot = await db.getStateForUser(req.authUser!);
      await syncActiveRoundsFromSnapshot(snapshot.sessions);
      res.json(snapshot);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.get('/api/stream', requireAuth, async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write('retry: 3000\n\n');

    const clientId = nextClientId++;
    const user = req.authUser!;
    sseClients.set(clientId, {
      id: clientId,
      userId: user.id,
      tokenVersion: user.tokenVersion,
      res,
    });

    req.on('close', () => {
      sseClients.delete(clientId);
    });

    try {
      const snapshot = await db.getStateForUser(user);
      await syncActiveRoundsFromSnapshot(snapshot.sessions);
      res.write(`event: state\ndata: ${JSON.stringify(snapshot)}\n\n`);
    } catch {
      sseClients.delete(clientId);
      try {
        res.end();
      } catch {
        // ignore closed stream
      }
    }
  });

  // Teacher: Student Account Management
  app.post('/api/students', requireTeacher, async (req, res) => {
    try {
      const student = await db.createStudent({
        username: String(req.body?.username ?? ''),
        password: String(req.body?.password ?? ''),
        teamDefault: req.body?.teamDefault === 'B' ? 'B' : 'A',
      });
      await broadcastState();
      res.status(201).json({ student });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.patch('/api/students/:id/username', requireTeacher, async (req, res) => {
    try {
      const student = await db.updateStudentUsername(
        String(req.params.id),
        String(req.body?.newUsername ?? '')
      );
      await broadcastState();
      res.json({ student });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.patch('/api/students/:id/password', requireTeacher, async (req, res) => {
    try {
      await db.resetStudentPassword(
        String(req.params.id),
        String(req.body?.newPassword ?? '')
      );
      await broadcastState();
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.patch('/api/students/:id/team', requireTeacher, async (req, res) => {
    try {
      await db.updateStudentTeam(
        String(req.params.id),
        req.body?.teamDefault === 'B' ? 'B' : 'A'
      );
      await broadcastState();
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.delete('/api/students/:id', requireTeacher, async (req, res) => {
    try {
      await db.deleteStudent(String(req.params.id));
      await broadcastState();
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Teacher: Questions & Answer Keys
  app.post('/api/questions', requireTeacher, async (req, res) => {
    try {
      const q = req.body?.question as Omit<Question, 'createdAt' | 'updatedAt'> | undefined;
      const k = req.body?.answerKey as Omit<AnswerKey, 'updatedAt'> | undefined;
      const isNew = Boolean(req.body?.isNew);
      if (!q || !k || !q.id || !q.prompt) {
        res.status(400).json({ error: 'Question prompt and answer key are required.' });
        return;
      }
      await db.saveQuestionWithKey(q, k, isNew);
      await broadcastState();
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.delete('/api/questions/:id', requireTeacher, async (req, res) => {
    try {
      await db.deleteQuestion(String(req.params.id));
      await broadcastState();
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Classroom Games / Live Sessions
  app.post('/api/sessions', requireTeacher, async (req, res) => {
    try {
      const session = await db.createBattleSession({
        title: String(req.body?.title ?? ''),
        gameTemplate: String(req.body?.gameTemplate ?? 'Grammar Royale'),
        unitId: String(req.body?.unitId ?? 'unit-7'),
        mode: req.body?.mode === 'team' ? 'team' : 'individual',
        questionIds: Array.isArray(req.body?.questionIds) ? req.body.questionIds.map(String) : [],
        timerSeconds: Number(req.body?.timerSeconds ?? 45),
        teacherUid: req.authUser!.id,
      });
      await broadcastState();
      res.status(201).json({ session });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/sessions/join', requireAuth, async (req, res) => {
    try {
      const session = await db.joinSessionByPin(String(req.body?.pin ?? ''), req.authUser!);
      await broadcastState();
      res.json({ session });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.patch('/api/sessions/:id', requireTeacher, async (req, res) => {
    try {
      const session = await db.updateSessionState(String(req.params.id), req.body ?? {});
      if (session.status === 'active' && session.remainingSeconds > 0) {
        activeRoundEndsAt.set(session.id, Date.now() + session.remainingSeconds * 1000);
      } else {
        activeRoundEndsAt.delete(session.id);
      }
      await broadcastState();
      res.json({ session });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.patch('/api/sessions/:id/mode', requireTeacher, async (req, res) => {
    try {
      const mode: SessionMode = req.body?.mode === 'team' ? 'team' : 'individual';
      await db.setSessionModeAndTeams(String(req.params.id), mode);
      await broadcastState();
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/sessions/:id/submit', requireAuth, async (req, res) => {
    try {
      const submission = await db.submitBattleAnswer({
        sessionId: String(req.params.id),
        questionId: String(req.body?.questionId ?? ''),
        user: req.authUser!,
        activityType: String(req.body?.activityType ?? 'multiple_choice') as ActivityType,
        answerPayload: String(req.body?.answerPayload ?? ''),
      });
      await broadcastState();
      res.status(201).json({ submission });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/sessions/:id/reveal', requireTeacher, async (req, res) => {
    try {
      const sessionId = String(req.params.id);
      activeRoundEndsAt.delete(sessionId);
      await db.revealAndGradeQuestion({
        sessionId,
        teacherUid: req.authUser!.id,
      });
      await broadcastState();
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/sessions/:id/submissions/:subId/grade', requireTeacher, async (req, res) => {
    try {
      await db.gradeOpenEndedSubmission({
        sessionId: String(req.params.id),
        submissionId: String(req.params.subId),
        isCorrect: Boolean(req.body?.isCorrect),
        pointsAwarded: Number(req.body?.pointsAwarded ?? 0),
        feedback: String(req.body?.feedback ?? ''),
        teacherUid: req.authUser!.id,
      });
      await broadcastState();
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Scores & Badges
  app.post('/api/scores/manual', requireTeacher, async (req, res) => {
    try {
      await db.awardManualXp({
        studentId: String(req.body?.studentId ?? ''),
        points: Number(req.body?.points ?? 0),
        reason: String(req.body?.reason ?? 'Teacher XP adjustment'),
        source: (req.body?.source ?? 'bonus') as ScoreEvent['source'],
        teacherUid: req.authUser!.id,
        unitId: req.body?.unitId ? String(req.body.unitId) : undefined,
      });
      await broadcastState();
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/achievements', requireTeacher, async (req, res) => {
    try {
      await db.grantAchievementBadge({
        studentId: String(req.body?.studentId ?? ''),
        badgeKey: String(req.body?.badgeKey ?? '') as BadgeKey,
        teacherUid: req.authUser!.id,
      });
      await broadcastState();
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Practice
  app.post('/api/practice/submit', requireAuth, async (req, res) => {
    try {
      const progress = await db.submitPracticeAttempt({
        user: req.authUser!,
        exerciseId: String(req.body?.exerciseId ?? ''),
        response: String(req.body?.response ?? ''),
      });
      await broadcastState();
      res.json({ progress });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/practice/:progressId/review', requireTeacher, async (req, res) => {
    try {
      await db.reviewPracticeAttempt({
        progressId: String(req.params.progressId),
        approvedXp: Number(req.body?.approvedXp ?? 0),
        feedback: String(req.body?.feedback ?? ''),
        teacherUid: req.authUser!.id,
      });
      await broadcastState();
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON request body.' });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  });

  const shutdown = () => {
    clearInterval(tickTimer);
    clearInterval(keepaliveTimer);
    for (const [, client] of sseClients.entries()) {
      try {
        client.res.end();
      } catch {
        // ignore closed socket
      }
    }
    sseClients.clear();
  };

  return { app, shutdown };
}
