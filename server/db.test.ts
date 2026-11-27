import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { inArray, eq } from 'drizzle-orm';
import {
  getActiveSessionSecret,
  hasEnvSessionSecret,
  hashPassword,
  setRuntimeSessionSecret,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from './auth.ts';
import { createLeagueDb } from './db.ts';
import { hasDatabaseConfig } from '../src/db/config.ts';
import { pgDb, closePool } from '../src/db/index.ts';
import {
  scoreEvents,
  sessionParticipants,
  sessions,
  sessionSubmissions,
} from '../src/db/schema.ts';

test('scrypt password hashing and signed session tokens verify integrity and reject tampering', () => {
  const pwHash = hashPassword('classroom-pass-1');
  assert.equal(verifyPassword('classroom-pass-1', pwHash), true);
  assert.equal(verifyPassword('wrong-pass', pwHash), false);

  if (!hasEnvSessionSecret()) {
    setRuntimeSessionSecret('0123456789abcdef0123456789abcdef');
    assert.equal(getActiveSessionSecret(), '0123456789abcdef0123456789abcdef');
  }

  const token = signSessionToken({
    userId: 'stu_1',
    username: 'sara',
    role: 'student',
    tokenVersion: 1,
  });
  const verified = verifySessionToken(token);
  assert.ok(verified);
  assert.equal(verified.username, 'sara');

  const tampered = `${token.slice(0, -2)}xx`;
  assert.equal(verifySessionToken(tampered), null);
});

const hasDbEnv = hasDatabaseConfig();

test(
  'PostgreSQL persistence: auth, student CRUD, game reveal grading, duplicate protection, and practice re-review',
  { skip: !hasDbEnv },
  async () => {
    const db = createLeagueDb(pgDb);
    const suffix = crypto.randomBytes(3).toString('hex');
    const uSara = `t_sara_${suffix}`;
    const uAli = `t_ali_${suffix}`;
    const uAliRenamed = `t_ali2_${suffix}`;
    const createdStudentIds: string[] = [];
    const createdSessionIds: string[] = [];

    try {
      const teacher = await db.authenticateUser('teacher', process.env.TEACHER_PASSWORD || 'smth1384');
      assert.ok(teacher);
      assert.equal(teacher.role, 'teacher');
      assert.equal(await db.authenticateUser('teacher', 'wrongpass'), null);

      const sara = await db.createStudent({
        username: uSara,
        password: 'pass1234',
        teamDefault: 'A',
      });
      createdStudentIds.push(sara.id);
      assert.equal(sara.username, uSara);

      const ali = await db.createStudent({
        username: uAli,
        password: 'init1234',
        teamDefault: 'B',
      });
      createdStudentIds.push(ali.id);

      const authedSara = await db.authenticateUser(uSara, 'pass1234');
      const authedAliBefore = await db.authenticateUser(uAli, 'init1234');
      assert.ok(authedSara);
      assert.ok(authedAliBefore);

      // Answer keys visible only to teacher, and full 408-question bank is seeded
      const teacherState = await db.getStateForUser(teacher);
      assert.ok(teacherState.questions.length >= 408);
      assert.ok(teacherState.questions.some((q) => q.id === 'q-u7-grammar-1'));
      assert.ok(Object.keys(teacherState.answerKeys).length >= 408);
      const studentState = await db.getStateForUser(authedSara);
      assert.ok(studentState.questions.length >= 408);
      assert.equal(Object.keys(studentState.answerKeys).length, 0);
      assert.equal(studentState.units.length, 3);

      // Rename + password reset invalidates tokenVersion
      const renamed = await db.updateStudentUsername(ali.id, uAliRenamed);
      assert.equal(renamed.username, uAliRenamed);
      await db.resetStudentPassword(ali.id, 'newpass99');
      assert.equal(await db.authenticateUser(uAliRenamed, 'init1234'), null);
      const authedAliAfter = await db.authenticateUser(uAliRenamed, 'newpass99');
      assert.ok(authedAliAfter);
      assert.equal(authedAliAfter.tokenVersion > authedAliBefore.tokenVersion, true);

      // Create Battle Session, join by PIN, block unjoined & duplicate submissions, reveal & grade
      const session = await db.createBattleSession({
        title: `Test Round ${suffix}`,
        gameTemplate: 'Grammar Royale',
        unitId: 'unit-7',
        mode: 'team',
        questionIds: ['q-u7-grammar-1'],
        timerSeconds: 30,
        teacherUid: teacher.id,
      });
      createdSessionIds.push(session.id);

      await db.joinSessionByPin(session.pin, authedSara);
      await db.updateSessionState(session.id, { status: 'active' });

      await assert.rejects(
        () =>
          db.submitBattleAnswer({
            sessionId: session.id,
            questionId: 'q-u7-grammar-1',
            user: authedAliAfter,
            activityType: 'multiple_choice',
            answerPayload: '0',
          }),
        /Join the game session/
      );

      await db.submitBattleAnswer({
        sessionId: session.id,
        questionId: 'q-u7-grammar-1',
        user: authedSara,
        activityType: 'multiple_choice',
        answerPayload: '0',
      });

      await assert.rejects(
        () =>
          db.submitBattleAnswer({
            sessionId: session.id,
            questionId: 'q-u7-grammar-1',
            user: authedSara,
            activityType: 'multiple_choice',
            answerPayload: '1',
          }),
        /already submitted/
      );

      await db.revealAndGradeQuestion({ sessionId: session.id, teacherUid: teacher.id });
      const afterReveal = await db.getStateForUser(authedSara);
      const saraScore = afterReveal.officialScores.find((s) => s.studentId === sara.id);
      assert.equal(saraScore?.xp, 100);

      // Practice writing resubmit + re-review uses XP delta without double-awarding
      const writingEx = afterReveal.practiceExercises.find((e) => e.requiresTeacherReview)!;
      const prog1 = await db.submitPracticeAttempt({
        user: authedSara,
        exerciseId: writingEx.id,
        response: 'Draft one',
      });
      await db.reviewPracticeAttempt({
        progressId: prog1.id,
        approvedXp: 40,
        feedback: 'Good start',
        teacherUid: teacher.id,
      });
      await db.submitPracticeAttempt({
        user: authedSara,
        exerciseId: writingEx.id,
        response: 'Draft two improved',
      });
      await db.reviewPracticeAttempt({
        progressId: prog1.id,
        approvedXp: 55,
        feedback: 'Much better',
        teacherUid: teacher.id,
      });
      const finalState = await db.getStateForUser(authedSara);
      const finalSara = finalState.officialScores.find((s) => s.studentId === sara.id);
      assert.equal(finalSara?.xp, 155);
    } finally {
      for (const sid of createdStudentIds) {
        try {
          await db.deleteStudent(sid);
        } catch {
          // ignore if already deleted
        }
      }
      if (createdSessionIds.length > 0) {
        await pgDb.delete(sessionSubmissions).where(inArray(sessionSubmissions.sessionId, createdSessionIds));
        await pgDb.delete(sessionParticipants).where(inArray(sessionParticipants.sessionId, createdSessionIds));
        await pgDb.delete(scoreEvents).where(inArray(scoreEvents.sessionId, createdSessionIds));
        await pgDb.delete(sessions).where(inArray(sessions.id, createdSessionIds));
      }
      await closePool();
    }
  }
);
