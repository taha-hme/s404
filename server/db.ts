import crypto from 'node:crypto';
import { asc, desc, eq, ne, and, inArray, sql } from 'drizzle-orm';
import { pgDb, type PostgresDb } from '../src/db/index.ts';
import {
  achievements,
  answerKeys,
  appSettings,
  officialScores,
  practiceExercises,
  practiceProgress,
  questions,
  scoreEvents,
  sessionParticipants,
  sessions,
  sessionSubmissions,
  units,
  users,
} from '../src/db/schema.ts';
import { INITIAL_UNITS, SAMPLE_PRACTICE_EXERCISES, SAMPLE_QUESTIONS } from '../src/data/seedContent.ts';
import { UNIT_EXPANSION_QUESTIONS } from '../src/data/questionBank.ts';
import {
  assignTwoVsThreeTeams,
  BADGE_CATALOG,
  buildSubmissionId,
  CLASS_CODE,
  computeRankTitle,
  generateRoomPin,
  gradePracticeSelfCheck,
  gradeSubmission,
  isValidPassword,
  isValidUsername,
  normalizeUsername,
  TEACHER_USERNAME,
} from '../src/lib/leagueRules.ts';
import type {
  Achievement,
  ActivityType,
  AnswerKey,
  BadgeKey,
  BattleSession,
  OfficialScore,
  PracticeExercise,
  PracticeProgress,
  Question,
  QuestionDifficulty,
  ScoreEvent,
  SessionMode,
  SessionParticipant,
  SessionStatus,
  StudentProfile,
  StudentSubmission,
  TeamId,
  Unit,
} from '../src/types/league.ts';
import {
  hashPassword,
  hasEnvSessionSecret,
  setRuntimeSessionSecret,
  verifyPassword,
  type AuthenticatedUser,
} from './auth.ts';

// Precomputed salted scrypt hash for initial teacher account ("teacher") so no plaintext password literal is stored.
const DEFAULT_TEACHER_HASH =
  'c30223b6c6cf6e64d28e0518323467f9:97d0d3df507862567b4785b4ae9f30749318631a81cc2c0e7c9a503f3523e0894be83aef18e0aeb2c34ff8149e57d89fc19127649d37f095b409e67697c3a602';

const VALID_ACTIVITY_TYPES: ActivityType[] = [
  'multiple_choice',
  'true_false',
  'sentence_completion',
  'vocab_matching',
  'open_ended',
  'speaking_writing',
];

const VALID_UNIT_IDS = new Set(['unit-7', 'unit-8', 'unit-9']);
const VALID_DIFFICULTIES: QuestionDifficulty[] = ['Easy', 'Medium', 'Hard'];

function normalizeDifficulty(raw?: string | null): QuestionDifficulty {
  if (raw === 'Easy' || raw === 'Medium' || raw === 'Hard') return raw;
  return 'Medium';
}

export class DomainError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
  }
}

export interface LeagueStateSnapshot {
  students: StudentProfile[];
  units: Unit[];
  questions: Question[];
  answerKeys: Record<string, AnswerKey>;
  sessions: BattleSession[];
  participantsBySession: Record<string, SessionParticipant[]>;
  submissionsBySession: Record<string, StudentSubmission[]>;
  officialScores: OfficialScore[];
  scoreEvents: ScoreEvent[];
  achievements: Achievement[];
  practiceExercises: PracticeExercise[];
  practiceProgress: PracticeProgress[];
}

type DbExecutor = PostgresDb | Parameters<Parameters<PostgresDb['transaction']>[0]>[0];
type UserRow = typeof users.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;
type PracticeProgressRow = typeof practiceProgress.$inferSelect;

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapUserToAuth(row: UserRow): AuthenticatedUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role === 'teacher' ? 'teacher' : 'student',
    teamDefault: row.teamDefault === 'B' ? 'B' : 'A',
    tokenVersion: row.tokenVersion,
  };
}

function mapRowToStudent(row: UserRow): StudentProfile {
  return {
    id: row.id,
    classId: CLASS_CODE,
    username: row.username,
    displayName: row.displayName,
    role: 'student',
    teamDefault: row.teamDefault === 'B' ? 'B' : 'A',
    active: row.active,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    updatedAt: row.updatedAt,
  };
}

function computeRemainingSeconds(row: SessionRow, nowMs = Date.now()): number {
  if (row.status === 'active' && row.roundEndsAt !== null && row.roundEndsAt !== undefined) {
    return Math.max(0, Math.ceil((row.roundEndsAt - nowMs) / 1000));
  }
  return Math.max(0, Number(row.remainingSeconds) || 0);
}

function mapSessionRow(row: SessionRow, nowMs = Date.now()): BattleSession {
  return {
    id: row.id,
    classId: row.classId,
    pin: row.pin,
    title: row.title,
    gameTemplate: row.gameTemplate,
    unitId: row.unitId,
    mode: (row.mode === 'team' ? 'team' : 'individual') as SessionMode,
    status: row.status as SessionStatus,
    questionIds: parseJson<string[]>(row.questionIdsJson, []),
    currentQuestionIndex: row.currentQuestionIndex,
    currentQuestionId: row.currentQuestionId,
    timerSeconds: row.timerSeconds,
    remainingSeconds: computeRemainingSeconds(row, nowMs),
    revealedAnswerText: row.revealedAnswerText ?? undefined,
    revealedExplanation: row.revealedExplanation ?? undefined,
    teamNames: parseJson<{ A: string; B: string }>(row.teamNamesJson, {
      A: 'Blue Vanguard',
      B: 'Violet Syndicate',
    }),
    teamScores: parseJson<{ A: number; B: number }>(row.teamScoresJson, {
      A: 0,
      B: 0,
    }),
    teacherUid: row.teacherUid,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapPracticeProgressRow(row: PracticeProgressRow): PracticeProgress {
  return {
    id: row.id,
    uid: row.uid,
    studentId: row.studentId,
    studentName: row.studentName,
    classId: row.classId,
    unitId: row.unitId,
    exerciseId: row.exerciseId,
    category: row.category as PracticeProgress['category'],
    response: row.response,
    selfCheckCorrect: row.selfCheckCorrect,
    needsTeacherReview: row.needsTeacherReview,
    teacherReviewed: row.teacherReviewed,
    approvedXp: row.approvedXp,
    teacherFeedback: row.teacherFeedback ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function runDb<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DomainError) {
      throw err;
    }
    console.error(`Database operation failed (${operation}):`, err);
    throw new Error('Database request failed. Please try again.', { cause: err });
  }
}

export function createLeagueDb(drizzleDb: PostgresDb = pgDb) {
  let initialized = false;
  let initPromise: Promise<void> | null = null;

  async function seedAndConfigureSecret(): Promise<void> {
    const ts = nowIso();
    const envTeacherPassword = process.env.TEACHER_PASSWORD?.trim();

    if (!hasEnvSessionSecret()) {
      const candidateSecret = crypto.randomBytes(32).toString('hex');
      await drizzleDb
        .insert(appSettings)
        .values({
          key: 'session_secret',
          value: candidateSecret,
          updatedAt: ts,
        })
        .onConflictDoNothing({ target: appSettings.key });

      const secretRows = await drizzleDb
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, 'session_secret'));
      if (secretRows[0]?.value) {
        setRuntimeSessionSecret(secretRows[0].value);
      }
    }

    const existingTeacherRows = await drizzleDb
      .select()
      .from(users)
      .where(eq(users.username, TEACHER_USERNAME));
    const existingTeacher = existingTeacherRows[0];

    if (!existingTeacher) {
      const initialHash = envTeacherPassword
        ? hashPassword(envTeacherPassword)
        : DEFAULT_TEACHER_HASH;
      await drizzleDb
        .insert(users)
        .values({
          id: 'teacher',
          username: TEACHER_USERNAME,
          displayName: 'Teacher',
          role: 'teacher',
          passwordHash: initialHash,
          teamDefault: 'A',
          tokenVersion: 1,
          active: true,
          createdAt: ts,
          lastSeenAt: ts,
          updatedAt: ts,
        })
        .onConflictDoNothing({ target: users.username });
    } else if (
      envTeacherPassword &&
      !verifyPassword(envTeacherPassword, existingTeacher.passwordHash)
    ) {
      await drizzleDb
        .update(users)
        .set({
          passwordHash: hashPassword(envTeacherPassword),
          tokenVersion: sql`${users.tokenVersion} + 1`,
          updatedAt: ts,
        })
        .where(eq(users.id, existingTeacher.id));
    }

    for (const unit of INITIAL_UNITS) {
      await drizzleDb
        .insert(units)
        .values({
          id: unit.id,
          classId: unit.classId,
          number: unit.number,
          title: unit.title,
          subtitle: unit.subtitle,
          description: unit.description,
          topicsJson: JSON.stringify(unit.topics),
          sortOrder: unit.order,
          active: unit.active,
          imageUrl: unit.imageUrl ?? null,
          createdAt: ts,
          updatedAt: ts,
        })
        .onConflictDoNothing({ target: units.id });
    }

    for (const item of SAMPLE_QUESTIONS) {
      const q = item.question;
      const k = item.answerKey;
      await drizzleDb
        .insert(questions)
        .values({
          id: q.id,
          classId: q.classId,
          unitId: q.unitId,
          gameTemplate: q.gameTemplate,
          activityType: q.activityType,
          difficulty: normalizeDifficulty(q.difficulty),
          skillTag: q.skillTag?.trim() || 'General',
          topicTag: q.topicTag?.trim() || 'General',
          learningObjective: q.learningObjective?.trim() || null,
          prompt: q.prompt,
          context: q.context ?? null,
          optionsJson: q.options ? JSON.stringify(q.options) : null,
          matchingLeftJson: q.matchingLeft ? JSON.stringify(q.matchingLeft) : null,
          matchingRightJson: q.matchingRight ? JSON.stringify(q.matchingRight) : null,
          hint: q.hint ?? null,
          points: q.points,
          timeLimitSec: q.timeLimitSec,
          teacherReviewed: Boolean(q.teacherReviewed),
          createdAt: ts,
          updatedAt: ts,
        })
        .onConflictDoNothing({ target: questions.id });

      // Backfill metadata on pre-existing sample rows without altering prompt, options, or answer keys
      if (q.skillTag && q.topicTag) {
        await drizzleDb
          .update(questions)
          .set({
            difficulty: normalizeDifficulty(q.difficulty),
            skillTag: q.skillTag,
            topicTag: q.topicTag,
            learningObjective: q.learningObjective ?? null,
          })
          .where(and(eq(questions.id, q.id), eq(questions.skillTag, 'General')));
      }

      await drizzleDb
        .insert(answerKeys)
        .values({
          questionId: k.questionId,
          correctOptionIndex: k.correctOptionIndex ?? null,
          correctBoolean: k.correctBoolean ?? null,
          acceptedAnswersJson: k.acceptedAnswers ? JSON.stringify(k.acceptedAnswers) : null,
          matchingPairsJson: k.matchingPairs ? JSON.stringify(k.matchingPairs) : null,
          rubric: k.rubric ?? null,
          explanation: k.explanation,
          updatedAt: ts,
        })
        .onConflictDoNothing({ target: answerKeys.questionId });
    }

    const qbMarkerRows = await drizzleDb
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 'question_bank_v2_seeded'));
    if (qbMarkerRows[0]?.value !== '1') {
      const BATCH_SIZE = 50;
      for (let i = 0; i < UNIT_EXPANSION_QUESTIONS.length; i += BATCH_SIZE) {
        const batch = UNIT_EXPANSION_QUESTIONS.slice(i, i + BATCH_SIZE);
        await drizzleDb.transaction(async (tx) => {
          await tx
            .insert(questions)
            .values(
              batch.map(({ question: q }) => ({
                id: q.id,
                classId: q.classId,
                unitId: q.unitId,
                gameTemplate: q.gameTemplate,
                activityType: q.activityType,
                difficulty: normalizeDifficulty(q.difficulty),
                skillTag: q.skillTag?.trim() || 'General',
                topicTag: q.topicTag?.trim() || 'General',
                learningObjective: q.learningObjective?.trim() || null,
                prompt: q.prompt,
                context: q.context ?? null,
                optionsJson: q.options ? JSON.stringify(q.options) : null,
                matchingLeftJson: q.matchingLeft ? JSON.stringify(q.matchingLeft) : null,
                matchingRightJson: q.matchingRight ? JSON.stringify(q.matchingRight) : null,
                hint: q.hint ?? null,
                points: q.points,
                timeLimitSec: q.timeLimitSec,
                teacherReviewed: Boolean(q.teacherReviewed),
                createdAt: ts,
                updatedAt: ts,
              }))
            )
            .onConflictDoNothing({ target: questions.id });

          await tx
            .insert(answerKeys)
            .values(
              batch.map(({ answerKey: k }) => ({
                questionId: k.questionId,
                correctOptionIndex: k.correctOptionIndex ?? null,
                correctBoolean: k.correctBoolean ?? null,
                acceptedAnswersJson: k.acceptedAnswers ? JSON.stringify(k.acceptedAnswers) : null,
                matchingPairsJson: k.matchingPairs ? JSON.stringify(k.matchingPairs) : null,
                rubric: k.rubric ?? null,
                explanation: k.explanation,
                updatedAt: ts,
              }))
            )
            .onConflictDoNothing({ target: answerKeys.questionId });
        });
      }

      await drizzleDb
        .insert(appSettings)
        .values({
          key: 'question_bank_v2_seeded',
          value: '1',
          updatedAt: nowIso(),
        })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: '1', updatedAt: nowIso() },
        });
    }

    for (const ex of SAMPLE_PRACTICE_EXERCISES) {
      await drizzleDb
        .insert(practiceExercises)
        .values({
          id: ex.id,
          classId: ex.classId,
          unitId: ex.unitId,
          category: ex.category,
          title: ex.title,
          prompt: ex.prompt,
          passage: ex.passage ?? null,
          optionsJson: ex.options ? JSON.stringify(ex.options) : null,
          matchingLeftJson: ex.matchingLeft ? JSON.stringify(ex.matchingLeft) : null,
          matchingRightJson: ex.matchingRight ? JSON.stringify(ex.matchingRight) : null,
          correctAnswer: ex.correctAnswer ?? null,
          hint: ex.hint,
          explanation: ex.explanation,
          requiresTeacherReview: ex.requiresTeacherReview,
          suggestedXp: ex.suggestedXp,
          createdAt: ts,
          updatedAt: ts,
        })
        .onConflictDoNothing({ target: practiceExercises.id });
    }
  }

  async function ensureInitialized(): Promise<void> {
    if (initialized) return;
    if (!initPromise) {
      initPromise = seedAndConfigureSecret()
        .then(() => {
          initialized = true;
        })
        .catch((err) => {
          initPromise = null;
          throw err;
        });
    }
    await initPromise;
  }

  async function getUserById(userId: string): Promise<AuthenticatedUser | null> {
    return runDb('getUserById', async () => {
      await ensureInitialized();
      const rows = await drizzleDb
        .select()
        .from(users)
        .where(and(eq(users.id, userId), eq(users.active, true)));
      return rows[0] ? mapUserToAuth(rows[0]) : null;
    });
  }

  async function authenticateUser(
    username: string,
    password: string
  ): Promise<AuthenticatedUser | null> {
    return runDb('authenticateUser', async () => {
      await ensureInitialized();
      const normalized = normalizeUsername(username);
      if (!normalized || !password) return null;

      const rows = await drizzleDb
        .select()
        .from(users)
        .where(and(eq(users.username, normalized), eq(users.active, true)));
      const row = rows[0];
      if (!row) return null;
      if (!verifyPassword(password, row.passwordHash)) return null;

      await drizzleDb
        .update(users)
        .set({ lastSeenAt: nowIso() })
        .where(eq(users.id, row.id));
      return mapUserToAuth(row);
    });
  }

  async function getStudentProfileById(studentId: string): Promise<StudentProfile | null> {
    return runDb('getStudentProfileById', async () => {
      await ensureInitialized();
      const rows = await drizzleDb
        .select()
        .from(users)
        .where(and(eq(users.id, studentId), eq(users.role, 'student')));
      return rows[0] ? mapRowToStudent(rows[0]) : null;
    });
  }

  async function applyScoreDelta(
    tx: DbExecutor,
    params: {
      studentId: string;
      studentName: string;
      pointsDelta: number;
      unitId?: string;
      incrementGamesPlayed?: boolean;
      correctDelta?: number;
      reason: string;
      source: ScoreEvent['source'];
      awardedByUid: string;
      sessionId?: string;
    }
  ): Promise<void> {
    const ts = nowIso();
    const currentRows = await tx
      .select()
      .from(officialScores)
      .where(eq(officialScores.studentId, params.studentId));
    const current = currentRows[0];

    const prevXp = current?.xp ?? 0;
    const nextXp = Math.max(0, prevXp + params.pointsDelta);
    const nextRank = computeRankTitle(nextXp);
    let u7 = current?.unit7Progress ?? 0;
    let u8 = current?.unit8Progress ?? 0;
    let u9 = current?.unit9Progress ?? 0;

    if (params.pointsDelta > 0) {
      if (params.unitId === 'unit-7') u7 = Math.min(100, u7 + 15);
      if (params.unitId === 'unit-8') u8 = Math.min(100, u8 + 15);
      if (params.unitId === 'unit-9') u9 = Math.min(100, u9 + 15);
    }

    const gamesPlayed = (current?.gamesPlayed ?? 0) + (params.incrementGamesPlayed ? 1 : 0);
    const correctCount = Math.max(0, (current?.correctCount ?? 0) + (params.correctDelta ?? 0));
    const streak =
      params.correctDelta && params.correctDelta > 0
        ? (current?.streak ?? 0) + 1
        : params.correctDelta !== undefined &&
          params.correctDelta === 0 &&
          params.incrementGamesPlayed
        ? 0
        : current?.streak ?? 0;

    await tx
      .insert(officialScores)
      .values({
        studentId: params.studentId,
        classId: CLASS_CODE,
        displayName: params.studentName,
        xp: nextXp,
        rankTitle: nextRank,
        unit7Progress: u7,
        unit8Progress: u8,
        unit9Progress: u9,
        gamesPlayed,
        correctCount,
        streak,
        updatedAt: ts,
      })
      .onConflictDoUpdate({
        target: officialScores.studentId,
        set: {
          displayName: params.studentName,
          xp: nextXp,
          rankTitle: nextRank,
          unit7Progress: u7,
          unit8Progress: u8,
          unit9Progress: u9,
          gamesPlayed,
          correctCount,
          streak,
          updatedAt: ts,
        },
      });

    const eventId = `evt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    await tx.insert(scoreEvents).values({
      id: eventId,
      classId: CLASS_CODE,
      studentId: params.studentId,
      studentName: params.studentName,
      sessionId: params.sessionId ?? null,
      unitId: params.unitId ?? null,
      source: params.source,
      points: params.pointsDelta,
      reason: params.reason,
      awardedByUid: params.awardedByUid,
      createdAt: ts,
    });
  }

  async function createStudent(params: {
    username: string;
    password: string;
    teamDefault: 'A' | 'B';
  }): Promise<StudentProfile> {
    return runDb('createStudent', async () => {
      await ensureInitialized();
      const checkUser = isValidUsername(params.username);
      if (!checkUser.valid) throw new DomainError(checkUser.error ?? 'Invalid username.');
      if (checkUser.normalized === TEACHER_USERNAME) {
        throw new DomainError('The username "teacher" is reserved for the teacher.');
      }
      const checkPw = isValidPassword(params.password);
      if (!checkPw.valid) throw new DomainError(checkPw.error ?? 'Invalid password.');

      const team: 'A' | 'B' = params.teamDefault === 'B' ? 'B' : 'A';
      const studentId = `stu_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const ts = nowIso();
      const pwHash = hashPassword(params.password);

      await drizzleDb.transaction(async (tx) => {
        const existing = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.username, checkUser.normalized));
        if (existing[0]) {
          throw new DomainError(`Username "${checkUser.normalized}" already exists.`);
        }

        await tx.insert(users).values({
          id: studentId,
          username: checkUser.normalized,
          displayName: checkUser.normalized,
          role: 'student',
          passwordHash: pwHash,
          teamDefault: team,
          tokenVersion: 1,
          active: true,
          createdAt: ts,
          lastSeenAt: ts,
          updatedAt: ts,
        });

        await tx.insert(officialScores).values({
          studentId,
          classId: CLASS_CODE,
          displayName: checkUser.normalized,
          xp: 0,
          rankTitle: 'Contender',
          unit7Progress: 0,
          unit8Progress: 0,
          unit9Progress: 0,
          gamesPlayed: 0,
          correctCount: 0,
          streak: 0,
          updatedAt: ts,
        });
      });

      const created = await getStudentProfileById(studentId);
      if (!created) throw new Error('Failed to create student.');
      return created;
    });
  }

  async function updateStudentUsername(
    studentId: string,
    newUsername: string
  ): Promise<StudentProfile> {
    return runDb('updateStudentUsername', async () => {
      await ensureInitialized();
      const checkUser = isValidUsername(newUsername);
      if (!checkUser.valid) throw new DomainError(checkUser.error ?? 'Invalid username.');
      if (checkUser.normalized === TEACHER_USERNAME) {
        throw new DomainError('The username "teacher" is reserved for the teacher.');
      }
      const ts = nowIso();

      await drizzleDb.transaction(async (tx) => {
        const existingRows = await tx
          .select()
          .from(users)
          .where(and(eq(users.id, studentId), eq(users.role, 'student')));
        if (!existingRows[0]) {
          throw new DomainError('Student not found.', 404);
        }

        const collision = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.username, checkUser.normalized), ne(users.id, studentId)));
        if (collision[0]) {
          throw new DomainError(`Username "${checkUser.normalized}" is already in use.`);
        }

        await tx
          .update(users)
          .set({
            username: checkUser.normalized,
            displayName: checkUser.normalized,
            updatedAt: ts,
          })
          .where(eq(users.id, studentId));

        await tx
          .update(officialScores)
          .set({ displayName: checkUser.normalized, updatedAt: ts })
          .where(eq(officialScores.studentId, studentId));

        await tx
          .update(scoreEvents)
          .set({ studentName: checkUser.normalized })
          .where(eq(scoreEvents.studentId, studentId));

        await tx
          .update(practiceProgress)
          .set({ studentName: checkUser.normalized })
          .where(eq(practiceProgress.studentId, studentId));

        await tx
          .update(sessionParticipants)
          .set({ displayName: checkUser.normalized })
          .where(eq(sessionParticipants.studentId, studentId));

        await tx
          .update(sessionSubmissions)
          .set({ studentName: checkUser.normalized })
          .where(eq(sessionSubmissions.studentId, studentId));
      });

      const updated = await getStudentProfileById(studentId);
      if (!updated) throw new DomainError('Student not found.', 404);
      return updated;
    });
  }

  async function resetStudentPassword(studentId: string, newPassword: string): Promise<void> {
    return runDb('resetStudentPassword', async () => {
      await ensureInitialized();
      const checkPw = isValidPassword(newPassword);
      if (!checkPw.valid) throw new DomainError(checkPw.error ?? 'Invalid password.');
      const ts = nowIso();
      const pwHash = hashPassword(newPassword);

      const updated = await drizzleDb
        .update(users)
        .set({
          passwordHash: pwHash,
          tokenVersion: sql`${users.tokenVersion} + 1`,
          updatedAt: ts,
        })
        .where(and(eq(users.id, studentId), eq(users.role, 'student')))
        .returning({ id: users.id });

      if (updated.length === 0) {
        throw new DomainError('Student not found.', 404);
      }
    });
  }

  async function updateStudentTeam(studentId: string, teamDefault: 'A' | 'B'): Promise<void> {
    return runDb('updateStudentTeam', async () => {
      await ensureInitialized();
      const team: 'A' | 'B' = teamDefault === 'B' ? 'B' : 'A';
      const updated = await drizzleDb
        .update(users)
        .set({ teamDefault: team, updatedAt: nowIso() })
        .where(and(eq(users.id, studentId), eq(users.role, 'student')))
        .returning({ id: users.id });

      if (updated.length === 0) {
        throw new DomainError('Student not found.', 404);
      }
    });
  }

  async function deleteStudent(studentId: string): Promise<void> {
    return runDb('deleteStudent', async () => {
      await ensureInitialized();
      await drizzleDb.transaction(async (tx) => {
        const existing = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, studentId), eq(users.role, 'student')));
        if (!existing[0]) {
          throw new DomainError('Student not found.', 404);
        }

        await tx.delete(officialScores).where(eq(officialScores.studentId, studentId));
        await tx.delete(achievements).where(eq(achievements.studentId, studentId));
        await tx.delete(scoreEvents).where(eq(scoreEvents.studentId, studentId));
        await tx.delete(practiceProgress).where(eq(practiceProgress.studentId, studentId));
        await tx.delete(sessionParticipants).where(eq(sessionParticipants.studentId, studentId));
        await tx.delete(sessionSubmissions).where(eq(sessionSubmissions.studentId, studentId));
        await tx.delete(users).where(eq(users.id, studentId));
      });
    });
  }

  async function saveQuestionWithKey(
    questionInput: Omit<Question, 'createdAt' | 'updatedAt'>,
    answerKeyInput: Omit<AnswerKey, 'updatedAt'>,
    isNew: boolean
  ): Promise<void> {
    return runDb('saveQuestionWithKey', async () => {
      await ensureInitialized();
      if (!VALID_UNIT_IDS.has(questionInput.unitId)) {
        throw new DomainError('Invalid unit ID.');
      }
      if (!VALID_ACTIVITY_TYPES.includes(questionInput.activityType)) {
        throw new DomainError('Invalid activity type.');
      }
      if (!questionInput.prompt?.trim()) {
        throw new DomainError('Question prompt is required.');
      }

      const ts = nowIso();
      const points = Math.max(10, Math.min(1000, Math.round(Number(questionInput.points) || 100)));
      const timeLimitSec = Math.max(
        10,
        Math.min(300, Math.round(Number(questionInput.timeLimitSec) || 45))
      );

      await drizzleDb.transaction(async (tx) => {
        if (isNew) {
          await tx.insert(questions).values({
            id: questionInput.id,
            classId: CLASS_CODE,
            unitId: questionInput.unitId,
            gameTemplate: questionInput.gameTemplate,
            activityType: questionInput.activityType,
            difficulty: normalizeDifficulty(questionInput.difficulty),
            skillTag: questionInput.skillTag?.trim() || 'General',
            topicTag: questionInput.topicTag?.trim() || 'General',
            learningObjective: questionInput.learningObjective?.trim() || null,
            prompt: questionInput.prompt,
            context: questionInput.context ?? null,
            optionsJson: questionInput.options ? JSON.stringify(questionInput.options) : null,
            matchingLeftJson: questionInput.matchingLeft
              ? JSON.stringify(questionInput.matchingLeft)
              : null,
            matchingRightJson: questionInput.matchingRight
              ? JSON.stringify(questionInput.matchingRight)
              : null,
            hint: questionInput.hint ?? null,
            points,
            timeLimitSec,
            teacherReviewed: Boolean(questionInput.teacherReviewed),
            createdAt: ts,
            updatedAt: ts,
          });
        } else {
          await tx
            .update(questions)
            .set({
              unitId: questionInput.unitId,
              gameTemplate: questionInput.gameTemplate,
              activityType: questionInput.activityType,
              difficulty: normalizeDifficulty(questionInput.difficulty),
              skillTag: questionInput.skillTag?.trim() || 'General',
              topicTag: questionInput.topicTag?.trim() || 'General',
              learningObjective: questionInput.learningObjective?.trim() || null,
              prompt: questionInput.prompt,
              context: questionInput.context ?? null,
              optionsJson: questionInput.options ? JSON.stringify(questionInput.options) : null,
              matchingLeftJson: questionInput.matchingLeft
                ? JSON.stringify(questionInput.matchingLeft)
                : null,
              matchingRightJson: questionInput.matchingRight
                ? JSON.stringify(questionInput.matchingRight)
                : null,
              hint: questionInput.hint ?? null,
              points,
              timeLimitSec,
              teacherReviewed: Boolean(questionInput.teacherReviewed),
              updatedAt: ts,
            })
            .where(eq(questions.id, questionInput.id));
        }

        await tx
          .insert(answerKeys)
          .values({
            questionId: answerKeyInput.questionId,
            correctOptionIndex: answerKeyInput.correctOptionIndex ?? null,
            correctBoolean: answerKeyInput.correctBoolean ?? null,
            acceptedAnswersJson: answerKeyInput.acceptedAnswers
              ? JSON.stringify(answerKeyInput.acceptedAnswers)
              : null,
            matchingPairsJson: answerKeyInput.matchingPairs
              ? JSON.stringify(answerKeyInput.matchingPairs)
              : null,
            rubric: answerKeyInput.rubric ?? null,
            explanation: answerKeyInput.explanation ?? '',
            updatedAt: ts,
          })
          .onConflictDoUpdate({
            target: answerKeys.questionId,
            set: {
              correctOptionIndex: answerKeyInput.correctOptionIndex ?? null,
              correctBoolean: answerKeyInput.correctBoolean ?? null,
              acceptedAnswersJson: answerKeyInput.acceptedAnswers
                ? JSON.stringify(answerKeyInput.acceptedAnswers)
                : null,
              matchingPairsJson: answerKeyInput.matchingPairs
                ? JSON.stringify(answerKeyInput.matchingPairs)
                : null,
              rubric: answerKeyInput.rubric ?? null,
              explanation: answerKeyInput.explanation ?? '',
              updatedAt: ts,
            },
          });
      });
    });
  }

  async function deleteQuestion(questionId: string): Promise<void> {
    return runDb('deleteQuestion', async () => {
      await ensureInitialized();
      await drizzleDb.transaction(async (tx) => {
        await tx.delete(answerKeys).where(eq(answerKeys.questionId, questionId));
        await tx.delete(questions).where(eq(questions.id, questionId));
      });
    });
  }

  async function createBattleSession(params: {
    title: string;
    gameTemplate: string;
    unitId: string;
    mode: SessionMode;
    questionIds: string[];
    timerSeconds: number;
    teacherUid: string;
  }): Promise<BattleSession> {
    return runDb('createBattleSession', async () => {
      await ensureInitialized();
      if (!params.questionIds || params.questionIds.length === 0) {
        throw new DomainError('Select at least one question to start a session.');
      }

      let pin = generateRoomPin();
      for (let i = 0; i < 8; i += 1) {
        const collision = await drizzleDb
          .select({ id: sessions.id })
          .from(sessions)
          .where(eq(sessions.pin, pin));
        if (!collision[0]) break;
        pin = generateRoomPin();
      }

      const id = `sess_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
      const ts = nowIso();
      const clampedTimer = Math.max(10, Math.min(300, params.timerSeconds || 45));
      const teamNames = { A: 'Blue Vanguard', B: 'Violet Syndicate' };
      const teamScores = { A: 0, B: 0 };

      const inserted = await drizzleDb
        .insert(sessions)
        .values({
          id,
          classId: CLASS_CODE,
          pin,
          title: params.title.trim() || `${params.gameTemplate} Live Round`,
          gameTemplate: params.gameTemplate,
          unitId: params.unitId,
          mode: params.mode === 'team' ? 'team' : 'individual',
          status: 'waiting',
          questionIdsJson: JSON.stringify(params.questionIds),
          currentQuestionIndex: 0,
          currentQuestionId: params.questionIds[0] ?? '',
          timerSeconds: clampedTimer,
          remainingSeconds: clampedTimer,
          roundEndsAt: null,
          revealedAnswerText: null,
          revealedExplanation: null,
          teamNamesJson: JSON.stringify(teamNames),
          teamScoresJson: JSON.stringify(teamScores),
          teacherUid: params.teacherUid,
          createdAt: ts,
          updatedAt: ts,
        })
        .returning();

      return mapSessionRow(inserted[0]);
    });
  }

  async function joinSessionByPin(rawPin: string, user: AuthenticatedUser): Promise<BattleSession> {
    return runDb('joinSessionByPin', async () => {
      await ensureInitialized();
      const pin = rawPin.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(pin)) {
        throw new DomainError('Enter a valid 6-character Game PIN.');
      }
      const rows = await drizzleDb.select().from(sessions).where(eq(sessions.pin, pin));
      if (!rows[0]) {
        throw new DomainError('No classroom game found for that PIN.', 404);
      }
      const session = mapSessionRow(rows[0]);
      if (session.status === 'ended') {
        throw new DomainError('This classroom game has already ended.');
      }

      const ts = nowIso();
      const existing = await drizzleDb
        .select()
        .from(sessionParticipants)
        .where(
          and(
            eq(sessionParticipants.sessionId, session.id),
            eq(sessionParticipants.uid, user.id)
          )
        );

      if (!existing[0]) {
        const assignedTeam: TeamId = session.mode === 'team' ? user.teamDefault : 'none';
        await drizzleDb.insert(sessionParticipants).values({
          sessionId: session.id,
          uid: user.id,
          studentId: user.id,
          displayName: user.displayName,
          team: assignedTeam,
          connected: true,
          sessionScore: 0,
          joinedAt: ts,
          lastPingAt: ts,
        });
      } else {
        await drizzleDb
          .update(sessionParticipants)
          .set({
            connected: true,
            displayName: user.displayName,
            lastPingAt: ts,
          })
          .where(
            and(
              eq(sessionParticipants.sessionId, session.id),
              eq(sessionParticipants.uid, user.id)
            )
          );
      }

      return session;
    });
  }

  async function updateSessionState(
    sessionId: string,
    patch: Partial<
      Pick<
        BattleSession,
        | 'status'
        | 'mode'
        | 'currentQuestionIndex'
        | 'currentQuestionId'
        | 'timerSeconds'
        | 'remainingSeconds'
        | 'revealedAnswerText'
        | 'revealedExplanation'
      >
    >
  ): Promise<BattleSession> {
    return runDb('updateSessionState', async () => {
      await ensureInitialized();
      const currentRows = await drizzleDb
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId));
      const current = currentRows[0];
      if (!current) throw new DomainError('Session not found.', 404);

      const VALID_STATUSES: SessionStatus[] = ['waiting', 'active', 'paused', 'revealed', 'ended'];
      const nextStatus =
        patch.status !== undefined
          ? VALID_STATUSES.includes(patch.status)
            ? patch.status
            : (() => {
                throw new DomainError('Invalid session status.');
              })()
          : (current.status as SessionStatus);

      const nextMode: SessionMode =
        patch.mode !== undefined
          ? patch.mode === 'team'
            ? 'team'
            : patch.mode === 'individual'
            ? 'individual'
            : (() => {
                throw new DomainError('Invalid session mode.');
              })()
          : (current.mode as SessionMode);

      const nextQIdx =
        patch.currentQuestionIndex !== undefined
          ? Math.max(0, Math.floor(Number(patch.currentQuestionIndex) || 0))
          : current.currentQuestionIndex;
      const nextQId =
        patch.currentQuestionId !== undefined
          ? String(patch.currentQuestionId)
          : current.currentQuestionId;
      const nextTimer =
        patch.timerSeconds !== undefined
          ? Math.max(10, Math.min(300, Math.floor(Number(patch.timerSeconds) || 45)))
          : current.timerSeconds;

      const nowMs = Date.now();
      const liveCurrentRemaining = computeRemainingSeconds(current, nowMs);
      const nextRemaining =
        patch.remainingSeconds !== undefined
          ? Math.max(0, Math.min(300, Math.floor(Number(patch.remainingSeconds) || 0)))
          : liveCurrentRemaining;

      let nextRoundEndsAt: number | null = current.roundEndsAt ?? null;
      if (nextStatus === 'active') {
        if (
          current.status !== 'active' ||
          patch.remainingSeconds !== undefined ||
          patch.currentQuestionId !== undefined ||
          current.roundEndsAt == null
        ) {
          nextRoundEndsAt = nowMs + nextRemaining * 1000;
        }
      } else {
        nextRoundEndsAt = null;
      }

      const nextRevealedAnswer =
        patch.revealedAnswerText !== undefined
          ? String(patch.revealedAnswerText)
          : current.revealedAnswerText;
      const nextRevealedExpl =
        patch.revealedExplanation !== undefined
          ? String(patch.revealedExplanation)
          : current.revealedExplanation;

      const updatedRows = await drizzleDb
        .update(sessions)
        .set({
          status: nextStatus,
          mode: nextMode,
          currentQuestionIndex: nextQIdx,
          currentQuestionId: nextQId,
          timerSeconds: nextTimer,
          remainingSeconds: nextRemaining,
          roundEndsAt: nextRoundEndsAt,
          revealedAnswerText: nextRevealedAnswer || null,
          revealedExplanation: nextRevealedExpl || null,
          updatedAt: nowIso(),
        })
        .where(eq(sessions.id, sessionId))
        .returning();

      return mapSessionRow(updatedRows[0], nowMs);
    });
  }

  async function setSessionModeAndTeams(sessionId: string, mode: SessionMode): Promise<void> {
    return runDb('setSessionModeAndTeams', async () => {
      await ensureInitialized();
      await drizzleDb.transaction(async (tx) => {
        const existing = await tx
          .select({ id: sessions.id })
          .from(sessions)
          .where(eq(sessions.id, sessionId));
        if (!existing[0]) throw new DomainError('Session not found.', 404);

        await tx
          .update(sessions)
          .set({ mode, updatedAt: nowIso() })
          .where(eq(sessions.id, sessionId));

        const partRows = await tx
          .select({ uid: sessionParticipants.uid })
          .from(sessionParticipants)
          .where(eq(sessionParticipants.sessionId, sessionId))
          .orderBy(asc(sessionParticipants.joinedAt));

        if (mode === 'team') {
          const assigned = assignTwoVsThreeTeams(partRows);
          for (const p of assigned) {
            await tx
              .update(sessionParticipants)
              .set({ team: p.team })
              .where(
                and(
                  eq(sessionParticipants.sessionId, sessionId),
                  eq(sessionParticipants.uid, p.uid)
                )
              );
          }
        } else {
          await tx
            .update(sessionParticipants)
            .set({ team: 'none' })
            .where(eq(sessionParticipants.sessionId, sessionId));
        }
      });
    });
  }

  async function submitBattleAnswer(params: {
    sessionId: string;
    questionId: string;
    user: AuthenticatedUser;
    activityType: ActivityType;
    answerPayload: string;
  }): Promise<StudentSubmission> {
    return runDb('submitBattleAnswer', async () => {
      await ensureInitialized();
      const trimmedPayload = params.answerPayload.trim();
      if (!trimmedPayload) {
        throw new DomainError('Enter an answer before submitting.');
      }
      if (trimmedPayload.length > 5000) {
        throw new DomainError('Answer is too long.');
      }

      return drizzleDb.transaction(async (tx) => {
        const sessRows = await tx
          .select()
          .from(sessions)
          .where(eq(sessions.id, params.sessionId));
        if (!sessRows[0]) throw new DomainError('Game session not found.', 404);
        const session = mapSessionRow(sessRows[0]);
        if (session.status !== 'active') {
          throw new DomainError('This round is not currently accepting submissions.');
        }
        if (session.currentQuestionId !== params.questionId) {
          throw new DomainError('This question is no longer active.');
        }

        const participant = await tx
          .select({ uid: sessionParticipants.uid })
          .from(sessionParticipants)
          .where(
            and(
              eq(sessionParticipants.sessionId, params.sessionId),
              eq(sessionParticipants.uid, params.user.id)
            )
          );
        if (!participant[0]) {
          throw new DomainError('Join the game session with the Room PIN before submitting.');
        }

        const subId = buildSubmissionId(params.questionId, params.user.id);
        const existing = await tx
          .select({ id: sessionSubmissions.id })
          .from(sessionSubmissions)
          .where(
            and(
              eq(sessionSubmissions.sessionId, params.sessionId),
              eq(sessionSubmissions.id, subId)
            )
          );
        if (existing[0]) {
          throw new DomainError('You have already submitted an answer for this question.');
        }

        const ts = nowIso();
        await tx.insert(sessionSubmissions).values({
          id: subId,
          sessionId: params.sessionId,
          questionId: params.questionId,
          uid: params.user.id,
          studentId: params.user.id,
          studentName: params.user.displayName,
          activityType: params.activityType,
          answerPayload: params.answerPayload,
          isGraded: false,
          isCorrect: false,
          pointsAwarded: 0,
          teacherFeedback: null,
          submittedAt: ts,
        });

        return {
          id: subId,
          sessionId: params.sessionId,
          questionId: params.questionId,
          uid: params.user.id,
          studentId: params.user.id,
          studentName: params.user.displayName,
          activityType: params.activityType,
          answerPayload: params.answerPayload,
          isGraded: false,
          isCorrect: false,
          pointsAwarded: 0,
          submittedAt: ts,
        };
      });
    });
  }

  async function recomputeSessionTeamScores(tx: DbExecutor, sessionId: string): Promise<void> {
    const rows = await tx
      .select({
        team: sessionParticipants.team,
        sessionScore: sessionParticipants.sessionScore,
      })
      .from(sessionParticipants)
      .where(eq(sessionParticipants.sessionId, sessionId));

    let teamA = 0;
    let teamB = 0;
    for (const r of rows) {
      if (r.team === 'A') teamA += r.sessionScore;
      if (r.team === 'B') teamB += r.sessionScore;
    }

    await tx
      .update(sessions)
      .set({
        teamScoresJson: JSON.stringify({ A: teamA, B: teamB }),
        updatedAt: nowIso(),
      })
      .where(eq(sessions.id, sessionId));
  }

  async function revealAndGradeQuestion(params: {
    sessionId: string;
    teacherUid: string;
  }): Promise<void> {
    return runDb('revealAndGradeQuestion', async () => {
      await ensureInitialized();
      await drizzleDb.transaction(async (tx) => {
        const sessRows = await tx
          .select()
          .from(sessions)
          .where(eq(sessions.id, params.sessionId));
        if (!sessRows[0]) throw new DomainError('Session not found.', 404);
        const rawSession = sessRows[0];
        const session = mapSessionRow(rawSession);

        const qRows = await tx
          .select()
          .from(questions)
          .where(eq(questions.id, session.currentQuestionId));
        const qRow = qRows[0];
        if (!qRow) throw new DomainError('Question not found.', 404);

        const question: Question = {
          id: qRow.id,
          classId: qRow.classId,
          unitId: qRow.unitId,
          gameTemplate: qRow.gameTemplate,
          activityType: qRow.activityType as ActivityType,
          prompt: qRow.prompt,
          options: parseJson<string[] | undefined>(qRow.optionsJson, undefined),
          points: qRow.points,
          timeLimitSec: qRow.timeLimitSec,
          teacherReviewed: qRow.teacherReviewed,
          createdAt: qRow.createdAt,
          updatedAt: qRow.updatedAt,
        };

        const keyRows = await tx
          .select()
          .from(answerKeys)
          .where(eq(answerKeys.questionId, question.id));
        const keyRow = keyRows[0];
        const answerKey: AnswerKey | undefined = keyRow
          ? {
              questionId: keyRow.questionId,
              correctOptionIndex: keyRow.correctOptionIndex ?? undefined,
              correctBoolean: keyRow.correctBoolean ?? undefined,
              acceptedAnswers: parseJson<string[] | undefined>(
                keyRow.acceptedAnswersJson,
                undefined
              ),
              matchingPairs: parseJson<Record<string, string> | undefined>(
                keyRow.matchingPairsJson,
                undefined
              ),
              rubric: keyRow.rubric ?? undefined,
              explanation: keyRow.explanation,
              updatedAt: keyRow.updatedAt,
            }
          : undefined;

        const subRows = await tx
          .select()
          .from(sessionSubmissions)
          .where(
            and(
              eq(sessionSubmissions.sessionId, session.id),
              eq(sessionSubmissions.questionId, question.id)
            )
          );

        let revealedAnswerText = answerKey?.rubric ?? 'Teacher review';

        for (const sRow of subRows) {
          const result = gradeSubmission(question, answerKey, sRow.answerPayload);
          revealedAnswerText = result.correctAnswerDisplay;

          if (result.needsManualReview) continue;

          const alreadyGraded = sRow.isGraded;
          const prevPoints = sRow.pointsAwarded;
          const pointsDelta = alreadyGraded ? result.pointsAwarded - prevPoints : result.pointsAwarded;

          await tx
            .update(sessionSubmissions)
            .set({
              isGraded: true,
              isCorrect: result.isCorrect,
              pointsAwarded: result.pointsAwarded,
            })
            .where(
              and(
                eq(sessionSubmissions.sessionId, session.id),
                eq(sessionSubmissions.id, sRow.id)
              )
            );

          if (!alreadyGraded) {
            await tx
              .update(sessionParticipants)
              .set({
                sessionScore: sql`${sessionParticipants.sessionScore} + ${pointsDelta}`,
              })
              .where(
                and(
                  eq(sessionParticipants.sessionId, session.id),
                  eq(sessionParticipants.uid, sRow.uid)
                )
              );

            await applyScoreDelta(tx, {
              studentId: sRow.studentId,
              studentName: sRow.studentName,
              pointsDelta,
              unitId: question.unitId,
              incrementGamesPlayed: true,
              correctDelta: result.isCorrect ? 1 : 0,
              reason: `${session.gameTemplate}: ${question.prompt.slice(0, 48)}`,
              source: 'battle',
              awardedByUid: params.teacherUid,
              sessionId: session.id,
            });
          }
        }

        if (subRows.length === 0) {
          revealedAnswerText = gradeSubmission(question, answerKey, '').correctAnswerDisplay;
        }

        await recomputeSessionTeamScores(tx, session.id);

        await tx
          .update(sessions)
          .set({
            status: 'revealed',
            remainingSeconds: session.remainingSeconds,
            roundEndsAt: null,
            revealedAnswerText,
            revealedExplanation: answerKey?.explanation ?? '',
            updatedAt: nowIso(),
          })
          .where(eq(sessions.id, session.id));
      });
    });
  }

  async function gradeOpenEndedSubmission(params: {
    sessionId: string;
    submissionId: string;
    isCorrect: boolean;
    pointsAwarded: number;
    feedback: string;
    teacherUid: string;
  }): Promise<void> {
    return runDb('gradeOpenEndedSubmission', async () => {
      await ensureInitialized();
      await drizzleDb.transaction(async (tx) => {
        const sessRows = await tx
          .select()
          .from(sessions)
          .where(eq(sessions.id, params.sessionId));
        if (!sessRows[0]) throw new DomainError('Session not found.', 404);
        const session = mapSessionRow(sessRows[0]);

        const subRows = await tx
          .select()
          .from(sessionSubmissions)
          .where(
            and(
              eq(sessionSubmissions.sessionId, params.sessionId),
              eq(sessionSubmissions.id, params.submissionId)
            )
          );
        const subRow = subRows[0];
        if (!subRow) throw new DomainError('Submission not found.', 404);

        const prevPoints = subRow.isGraded ? subRow.pointsAwarded : 0;
        const newPoints = Math.max(0, Math.min(1000, Math.round(params.pointsAwarded)));
        const delta = newPoints - prevPoints;

        await tx
          .update(sessionSubmissions)
          .set({
            isGraded: true,
            isCorrect: params.isCorrect,
            pointsAwarded: newPoints,
            teacherFeedback: params.feedback.trim() || null,
          })
          .where(
            and(
              eq(sessionSubmissions.sessionId, params.sessionId),
              eq(sessionSubmissions.id, params.submissionId)
            )
          );

        await tx
          .update(sessionParticipants)
          .set({
            sessionScore: sql`${sessionParticipants.sessionScore} + ${delta}`,
          })
          .where(
            and(
              eq(sessionParticipants.sessionId, params.sessionId),
              eq(sessionParticipants.uid, subRow.uid)
            )
          );

        await recomputeSessionTeamScores(tx, params.sessionId);

        const qRows = await tx
          .select({ unitId: questions.unitId })
          .from(questions)
          .where(eq(questions.id, subRow.questionId));

        if (delta !== 0 || !subRow.isGraded) {
          await applyScoreDelta(tx, {
            studentId: subRow.studentId,
            studentName: subRow.studentName,
            pointsDelta: delta,
            unitId: qRows[0]?.unitId ?? session.unitId,
            incrementGamesPlayed: !subRow.isGraded,
            correctDelta: !subRow.isGraded ? (params.isCorrect ? 1 : 0) : 0,
            reason: `${session.gameTemplate}: Teacher review`,
            source: 'speaking_writing',
            awardedByUid: params.teacherUid,
            sessionId: session.id,
          });
        }
      });
    });
  }

  async function awardManualXp(params: {
    studentId: string;
    points: number;
    reason: string;
    source: ScoreEvent['source'];
    teacherUid: string;
    unitId?: string;
  }): Promise<void> {
    return runDb('awardManualXp', async () => {
      await ensureInitialized();
      const VALID_SOURCES: ScoreEvent['source'][] = ['battle', 'bonus', 'speaking_writing', 'mission'];
      if (!VALID_SOURCES.includes(params.source)) {
        throw new DomainError('Invalid score event source.');
      }
      const stu = await getStudentProfileById(params.studentId);
      if (!stu) throw new DomainError('Student not found.', 404);
      const points = Math.max(-500, Math.min(500, Math.round(params.points)));

      await drizzleDb.transaction(async (tx) => {
        await applyScoreDelta(tx, {
          studentId: stu.id,
          studentName: stu.displayName,
          pointsDelta: points,
          unitId: params.unitId,
          reason: params.reason.trim() || 'Teacher XP adjustment',
          source: params.source,
          awardedByUid: params.teacherUid,
        });
      });
    });
  }

  async function grantAchievementBadge(params: {
    studentId: string;
    badgeKey: BadgeKey;
    teacherUid: string;
  }): Promise<void> {
    return runDb('grantAchievementBadge', async () => {
      await ensureInitialized();
      const stu = await getStudentProfileById(params.studentId);
      if (!stu) throw new DomainError('Student not found.', 404);
      const meta = BADGE_CATALOG.find((b) => b.key === params.badgeKey);
      if (!meta) throw new DomainError('Invalid badge key.');

      const id = `${params.studentId}_${params.badgeKey}`;
      const ts = nowIso();
      await drizzleDb
        .insert(achievements)
        .values({
          id,
          classId: CLASS_CODE,
          studentId: stu.id,
          badgeKey: meta.key,
          title: meta.title,
          description: meta.description,
          awardedByUid: params.teacherUid,
          createdAt: ts,
        })
        .onConflictDoUpdate({
          target: achievements.id,
          set: {
            title: meta.title,
            description: meta.description,
            awardedByUid: params.teacherUid,
            createdAt: ts,
          },
        });
    });
  }

  async function submitPracticeAttempt(params: {
    user: AuthenticatedUser;
    exerciseId: string;
    response: string;
  }): Promise<PracticeProgress> {
    return runDb('submitPracticeAttempt', async () => {
      await ensureInitialized();
      if (!params.response.trim()) {
        throw new DomainError('Enter a response before submitting.');
      }
      if (params.response.length > 10000) {
        throw new DomainError('Response is too long.');
      }

      const exRows = await drizzleDb
        .select()
        .from(practiceExercises)
        .where(eq(practiceExercises.id, params.exerciseId));
      const exRow = exRows[0];
      if (!exRow) throw new DomainError('Practice exercise not found.', 404);

      const ex: PracticeExercise = {
        id: exRow.id,
        classId: exRow.classId,
        unitId: exRow.unitId,
        category: exRow.category as PracticeExercise['category'],
        title: exRow.title,
        prompt: exRow.prompt,
        matchingLeft: parseJson<string[] | undefined>(exRow.matchingLeftJson, undefined),
        matchingRight: parseJson<string[] | undefined>(exRow.matchingRightJson, undefined),
        correctAnswer: exRow.correctAnswer ?? undefined,
        hint: exRow.hint,
        explanation: exRow.explanation,
        requiresTeacherReview: exRow.requiresTeacherReview,
        suggestedXp: exRow.suggestedXp,
        createdAt: exRow.createdAt,
        updatedAt: exRow.updatedAt,
      };

      const checked = gradePracticeSelfCheck(ex, params.response);
      const docId = `${params.user.id}_${ex.id}`;
      const ts = nowIso();

      const saved = await drizzleDb
        .insert(practiceProgress)
        .values({
          id: docId,
          uid: params.user.id,
          studentId: params.user.id,
          studentName: params.user.displayName,
          classId: CLASS_CODE,
          unitId: ex.unitId,
          exerciseId: ex.id,
          category: ex.category,
          response: params.response,
          selfCheckCorrect: checked.isCorrect,
          needsTeacherReview: ex.requiresTeacherReview,
          teacherReviewed: false,
          approvedXp: 0,
          teacherFeedback: null,
          createdAt: ts,
          updatedAt: ts,
        })
        .onConflictDoUpdate({
          target: practiceProgress.id,
          set: {
            response: params.response,
            selfCheckCorrect: checked.isCorrect,
            needsTeacherReview: ex.requiresTeacherReview,
            teacherReviewed: false,
            updatedAt: ts,
          },
        })
        .returning();

      return mapPracticeProgressRow(saved[0]);
    });
  }

  async function reviewPracticeAttempt(params: {
    progressId: string;
    approvedXp: number;
    feedback: string;
    teacherUid: string;
  }): Promise<void> {
    return runDb('reviewPracticeAttempt', async () => {
      await ensureInitialized();
      await drizzleDb.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(practiceProgress)
          .where(eq(practiceProgress.id, params.progressId));
        const row = rows[0];
        if (!row) throw new DomainError('Practice attempt not found.', 404);

        const prevXp = row.approvedXp || 0;
        const newXp = Math.max(0, Math.min(300, Math.round(params.approvedXp)));
        const delta = newXp - prevXp;

        await tx
          .update(practiceProgress)
          .set({
            teacherReviewed: true,
            approvedXp: newXp,
            teacherFeedback: params.feedback.trim() || null,
            updatedAt: nowIso(),
          })
          .where(eq(practiceProgress.id, params.progressId));

        if (delta !== 0 || !row.teacherReviewed) {
          await applyScoreDelta(tx, {
            studentId: row.studentId,
            studentName: row.studentName,
            pointsDelta: delta,
            unitId: row.unitId,
            reason: `Practice writing review (${row.unitId})`,
            source: 'speaking_writing',
            awardedByUid: params.teacherUid,
          });
        }
      });
    });
  }

  async function finalizeExpiredSession(sessionId: string): Promise<void> {
    return runDb('finalizeExpiredSession', async () => {
      await ensureInitialized();
      await drizzleDb
        .update(sessions)
        .set({
          remainingSeconds: 0,
          roundEndsAt: null,
          updatedAt: nowIso(),
        })
        .where(and(eq(sessions.id, sessionId), eq(sessions.status, 'active')));
    });
  }

  async function getActiveRoundEndTimes(): Promise<Array<{ id: string; roundEndsAt: number }>> {
    return runDb('getActiveRoundEndTimes', async () => {
      await ensureInitialized();
      const rows = await drizzleDb
        .select({
          id: sessions.id,
          roundEndsAt: sessions.roundEndsAt,
          remainingSeconds: sessions.remainingSeconds,
        })
        .from(sessions)
        .where(eq(sessions.status, 'active'));

      const nowMs = Date.now();
      return rows
        .map((r) => ({
          id: r.id,
          roundEndsAt: r.roundEndsAt ?? nowMs + Math.max(0, r.remainingSeconds) * 1000,
        }))
        .filter((r) => r.roundEndsAt > nowMs);
    });
  }

  async function fetchRawStateRows(includeAnswerKeys: boolean) {
    const [
      studentRows,
      unitRows,
      questionRows,
      keyRows,
      sessionRows,
      partRows,
      subRows,
      scoreRows,
      eventRows,
      badgeRows,
      exerciseRows,
      progRows,
    ] = await Promise.all([
      drizzleDb
        .select()
        .from(users)
        .where(eq(users.role, 'student'))
        .orderBy(asc(users.createdAt)),
      drizzleDb.select().from(units).orderBy(asc(units.sortOrder)),
      drizzleDb.select().from(questions).orderBy(desc(questions.createdAt), asc(questions.id)),
      includeAnswerKeys ? drizzleDb.select().from(answerKeys) : Promise.resolve([]),
      drizzleDb
        .select()
        .from(sessions)
        .orderBy(desc(sessions.createdAt))
        .limit(30),
      drizzleDb
        .select()
        .from(sessionParticipants)
        .orderBy(desc(sessionParticipants.sessionScore), asc(sessionParticipants.joinedAt)),
      drizzleDb
        .select()
        .from(sessionSubmissions)
        .orderBy(asc(sessionSubmissions.submittedAt)),
      drizzleDb.select().from(officialScores).orderBy(desc(officialScores.xp)),
      drizzleDb
        .select()
        .from(scoreEvents)
        .orderBy(desc(scoreEvents.createdAt))
        .limit(60),
      drizzleDb.select().from(achievements).orderBy(desc(achievements.createdAt)),
      drizzleDb
        .select()
        .from(practiceExercises)
        .orderBy(asc(practiceExercises.unitId), asc(practiceExercises.id)),
      drizzleDb
        .select()
        .from(practiceProgress)
        .orderBy(desc(practiceProgress.updatedAt)),
    ]);

    return {
      studentRows,
      unitRows,
      questionRows,
      keyRows,
      sessionRows,
      partRows,
      subRows,
      scoreRows,
      eventRows,
      badgeRows,
      exerciseRows,
      progRows,
    };
  }

  function shapeSnapshotForUser(
    raw: Awaited<ReturnType<typeof fetchRawStateRows>>,
    user: AuthenticatedUser,
    nowMs: number
  ): LeagueStateSnapshot {
    const students = raw.studentRows.map(mapRowToStudent);
    const unitList: Unit[] = raw.unitRows.map((u) => ({
      id: u.id,
      classId: u.classId,
      number: u.number,
      title: u.title,
      subtitle: u.subtitle,
      description: u.description,
      topics: parseJson<string[]>(u.topicsJson, []),
      order: u.sortOrder,
      active: u.active,
      imageUrl: u.imageUrl ?? undefined,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));

    const questionList: Question[] = raw.questionRows.map((q) => ({
      id: q.id,
      classId: q.classId,
      unitId: q.unitId,
      gameTemplate: q.gameTemplate,
      activityType: q.activityType as ActivityType,
      difficulty: normalizeDifficulty(q.difficulty),
      skillTag: q.skillTag || 'General',
      topicTag: q.topicTag || 'General',
      learningObjective: q.learningObjective ?? undefined,
      prompt: q.prompt,
      context: q.context ?? undefined,
      options: parseJson<string[] | undefined>(q.optionsJson, undefined),
      matchingLeft: parseJson<string[] | undefined>(q.matchingLeftJson, undefined),
      matchingRight: parseJson<string[] | undefined>(q.matchingRightJson, undefined),
      hint: q.hint ?? undefined,
      points: q.points,
      timeLimitSec: q.timeLimitSec,
      teacherReviewed: q.teacherReviewed,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    }));

    const answerKeyMap: Record<string, AnswerKey> = {};
    if (user.role === 'teacher') {
      for (const k of raw.keyRows) {
        answerKeyMap[k.questionId] = {
          questionId: k.questionId,
          correctOptionIndex: k.correctOptionIndex ?? undefined,
          correctBoolean: k.correctBoolean ?? undefined,
          acceptedAnswers: parseJson<string[] | undefined>(k.acceptedAnswersJson, undefined),
          matchingPairs: parseJson<Record<string, string> | undefined>(
            k.matchingPairsJson,
            undefined
          ),
          rubric: k.rubric ?? undefined,
          explanation: k.explanation,
          updatedAt: k.updatedAt,
        };
      }
    }

    const sessionList = raw.sessionRows.map((row) => mapSessionRow(row, nowMs));

    const participantsBySession: Record<string, SessionParticipant[]> = {};
    for (const p of raw.partRows) {
      if (!participantsBySession[p.sessionId]) participantsBySession[p.sessionId] = [];
      participantsBySession[p.sessionId].push({
        uid: p.uid,
        studentId: p.studentId,
        displayName: p.displayName,
        team: p.team as TeamId,
        connected: p.connected,
        sessionScore: p.sessionScore,
        joinedAt: p.joinedAt,
        lastPingAt: p.lastPingAt,
      });
    }

    const submissionsBySession: Record<string, StudentSubmission[]> = {};
    const sessionStatusMap = new Map(sessionList.map((s) => [s.id, s.status]));
    for (const s of raw.subRows) {
      const isOwner = s.uid === user.id;
      const isRevealed = sessionStatusMap.get(s.sessionId) === 'revealed';
      if (user.role !== 'teacher' && !isOwner && !isRevealed) {
        continue;
      }
      if (!submissionsBySession[s.sessionId]) submissionsBySession[s.sessionId] = [];
      submissionsBySession[s.sessionId].push({
        id: s.id,
        sessionId: s.sessionId,
        questionId: s.questionId,
        uid: s.uid,
        studentId: s.studentId,
        studentName: s.studentName,
        activityType: s.activityType as ActivityType,
        answerPayload: s.answerPayload,
        isGraded: s.isGraded,
        isCorrect: s.isCorrect,
        pointsAwarded: s.pointsAwarded,
        teacherFeedback: s.teacherFeedback ?? undefined,
        submittedAt: s.submittedAt,
      });
    }

    const scoreList: OfficialScore[] = raw.scoreRows.map((s) => ({
      studentId: s.studentId,
      classId: s.classId,
      displayName: s.displayName,
      xp: s.xp,
      rankTitle: s.rankTitle,
      unit7Progress: s.unit7Progress,
      unit8Progress: s.unit8Progress,
      unit9Progress: s.unit9Progress,
      gamesPlayed: s.gamesPlayed,
      correctCount: s.correctCount,
      streak: s.streak,
      updatedAt: s.updatedAt,
    }));

    const eventList: ScoreEvent[] = raw.eventRows.map((e) => ({
      id: e.id,
      classId: e.classId,
      studentId: e.studentId,
      studentName: e.studentName,
      sessionId: e.sessionId ?? undefined,
      unitId: e.unitId ?? undefined,
      source: e.source as ScoreEvent['source'],
      points: e.points,
      reason: e.reason,
      awardedByUid: e.awardedByUid,
      createdAt: e.createdAt,
    }));

    const badgeList: Achievement[] = raw.badgeRows.map((a) => ({
      id: a.id,
      classId: a.classId,
      studentId: a.studentId,
      badgeKey: a.badgeKey as BadgeKey,
      title: a.title,
      description: a.description,
      awardedByUid: a.awardedByUid,
      createdAt: a.createdAt,
    }));

    const exerciseList: PracticeExercise[] = raw.exerciseRows.map((ex) => ({
      id: ex.id,
      classId: ex.classId,
      unitId: ex.unitId,
      category: ex.category as PracticeExercise['category'],
      title: ex.title,
      prompt: ex.prompt,
      passage: ex.passage ?? undefined,
      options: parseJson<string[] | undefined>(ex.optionsJson, undefined),
      matchingLeft: parseJson<string[] | undefined>(ex.matchingLeftJson, undefined),
      matchingRight: parseJson<string[] | undefined>(ex.matchingRightJson, undefined),
      correctAnswer: ex.correctAnswer ?? undefined,
      hint: ex.hint,
      explanation: ex.explanation,
      requiresTeacherReview: ex.requiresTeacherReview,
      suggestedXp: ex.suggestedXp,
      createdAt: ex.createdAt,
      updatedAt: ex.updatedAt,
    }));

    const progressList: PracticeProgress[] = raw.progRows
      .filter((p) => user.role === 'teacher' || p.uid === user.id)
      .map(mapPracticeProgressRow);

    return {
      students,
      units: unitList,
      questions: questionList,
      answerKeys: answerKeyMap,
      sessions: sessionList,
      participantsBySession,
      submissionsBySession,
      officialScores: scoreList,
      scoreEvents: eventList,
      achievements: badgeList,
      practiceExercises: exerciseList,
      practiceProgress: progressList,
    };
  }

  async function getStateForUser(user: AuthenticatedUser): Promise<LeagueStateSnapshot> {
    return runDb('getStateForUser', async () => {
      await ensureInitialized();
      const nowMs = Date.now();
      const raw = await fetchRawStateRows(user.role === 'teacher');
      return shapeSnapshotForUser(raw, user, nowMs);
    });
  }

  async function getBroadcastSnapshots(userIds: string[]): Promise<{
    usersById: Map<string, AuthenticatedUser>;
    snapshotFor: (user: AuthenticatedUser) => LeagueStateSnapshot;
  }> {
    return runDb('getBroadcastSnapshots', async () => {
      await ensureInitialized();
      const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
      const nowMs = Date.now();
      const [userRows, raw] = await Promise.all([
        uniqueIds.length > 0
          ? drizzleDb
              .select()
              .from(users)
              .where(and(inArray(users.id, uniqueIds), eq(users.active, true)))
          : Promise.resolve([]),
        fetchRawStateRows(true),
      ]);

      const usersById = new Map<string, AuthenticatedUser>();
      for (const row of userRows) {
        usersById.set(row.id, mapUserToAuth(row));
      }

      return {
        usersById,
        snapshotFor: (user: AuthenticatedUser) => shapeSnapshotForUser(raw, user, nowMs),
      };
    });
  }

  return {
    ensureInitialized,
    getUserById,
    authenticateUser,
    getStudentProfileById,
    getStateForUser,
    getBroadcastSnapshots,
    createStudent,
    updateStudentUsername,
    resetStudentPassword,
    updateStudentTeam,
    deleteStudent,
    saveQuestionWithKey,
    deleteQuestion,
    createBattleSession,
    joinSessionByPin,
    updateSessionState,
    setSessionModeAndTeams,
    submitBattleAnswer,
    revealAndGradeQuestion,
    gradeOpenEndedSubmission,
    awardManualXp,
    grantAchievementBadge,
    submitPracticeAttempt,
    reviewPracticeAttempt,
    finalizeExpiredSession,
    getActiveRoundEndTimes,
  };
}

export type LeagueDb = ReturnType<typeof createLeagueDb>;
