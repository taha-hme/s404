import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignTwoVsThreeTeams,
  buildSubmissionId,
  computeRankTitle,
  enqueueOfflineAnswer,
  filterQuestions,
  generateRoomPin,
  getNextRankProgress,
  gradePracticeSelfCheck,
  gradeSubmission,
  isValidPassword,
  isValidRecordId,
  isValidUsername,
  pickBalancedQuestions,
  removeQueuedAnswer,
} from './leagueRules';

test('generateRoomPin returns 6 uppercase unambiguous alphanumeric characters', () => {
  const pin = generateRoomPin();
  assert.equal(pin.length, 6);
  assert.match(pin, /^[A-Z0-9]{6}$/);
  assert.equal(pin.includes('O'), false);
  assert.equal(pin.includes('0'), false);
});

test('isValidUsername and isValidPassword validate classroom credentials', () => {
  const ok = isValidUsername('  Sara_1 ');
  assert.equal(ok.valid, true);
  assert.equal(ok.normalized, 'sara_1');

  assert.equal(isValidUsername('a').valid, false);
  assert.equal(isValidUsername('bad user!').valid, false);
  assert.equal(isValidPassword('123').valid, false);
  assert.equal(isValidPassword('1234').valid, true);
  assert.equal(isValidPassword('pass1234').valid, true);
});

test('computeRankTitle and getNextRankProgress calculate accurate XP tiers', () => {
  assert.equal(computeRankTitle(0), 'Contender');
  assert.equal(computeRankTitle(150), 'Apprentice');
  assert.equal(computeRankTitle(900), 'Orator');
  assert.equal(computeRankTitle(2500), 'Grandmaster');

  const prog = getNextRankProgress(75);
  assert.equal(prog.currentRank, 'Contender');
  assert.equal(prog.nextRank, 'Apprentice');
  assert.equal(prog.percent, 50);
  assert.equal(prog.xpToNext, 75);
});

test('assignTwoVsThreeTeams splits 5 students into 2 vs 3 teams', () => {
  const students = [
    { uid: 'u1' },
    { uid: 'u2' },
    { uid: 'u3' },
    { uid: 'u4' },
    { uid: 'u5' },
  ];
  const assigned = assignTwoVsThreeTeams(students);
  const teamA = assigned.filter((s) => s.team === 'A');
  const teamB = assigned.filter((s) => s.team === 'B');
  assert.equal(teamA.length, 2);
  assert.equal(teamB.length, 3);
});

test('buildSubmissionId creates deterministic idempotent keys', () => {
  assert.equal(buildSubmissionId('q-1', 'uid-abc'), 'q-1_uid-abc');
});

test('gradeSubmission handles multiple_choice, true_false, sentence_completion, vocab_matching, and open_ended', () => {
  const mc = gradeSubmission(
    { activityType: 'multiple_choice', options: ['had left', 'has left', 'was leaving'], points: 100 },
    { questionId: 'q1', correctOptionIndex: 0, explanation: 'Past perfect', updatedAt: null },
    '0'
  );
  assert.equal(mc.isCorrect, true);
  assert.equal(mc.pointsAwarded, 100);
  assert.equal(mc.needsManualReview, false);

  const tf = gradeSubmission(
    { activityType: 'true_false', points: 50 },
    { questionId: 'q2', correctBoolean: false, explanation: 'Exaggerated claim', updatedAt: null },
    'false'
  );
  assert.equal(tf.isCorrect, true);
  assert.equal(tf.pointsAwarded, 50);

  const sc = gradeSubmission(
    { activityType: 'sentence_completion', points: 80 },
    { questionId: 'q3', acceptedAnswers: ['had already left', 'already left'], explanation: 'Tense check', updatedAt: null },
    '  HAD   already   LEFT '
  );
  assert.equal(sc.isCorrect, true);
  assert.equal(sc.pointsAwarded, 80);

  const vm = gradeSubmission(
    { activityType: 'vocab_matching', points: 100 },
    { questionId: 'q4', matchingPairs: { fabricate: 'invent', gullible: 'easily fooled' }, explanation: 'Collocations', updatedAt: null },
    JSON.stringify({ fabricate: 'invent', gullible: 'wrong' })
  );
  assert.equal(vm.isCorrect, false);
  assert.equal(vm.pointsAwarded, 50);

  const oe = gradeSubmission(
    { activityType: 'open_ended', points: 120 },
    { questionId: 'q5', rubric: 'Check coherence', explanation: 'Open review', updatedAt: null },
    'My original story ending'
  );
  assert.equal(oe.needsManualReview, true);
  assert.equal(oe.pointsAwarded, 0);
});

test('gradePracticeSelfCheck supports instant feedback and routes writing to teacher review', () => {
  const vocab = gradePracticeSelfCheck(
    { category: 'vocabulary', correctAnswer: 'plausible|credible', requiresTeacherReview: false },
    'Plausible'
  );
  assert.deepEqual(vocab, { needsTeacherReview: false, isCorrect: true });

  const writing = gradePracticeSelfCheck(
    { category: 'writing', correctAnswer: '', requiresTeacherReview: true },
    'A paragraph arguing for urban green roofs.'
  );
  assert.deepEqual(writing, { needsTeacherReview: true, isCorrect: false });
});

test('offline answer queue prevents duplicates and removes confirmed items', () => {
  const item = {
    submissionId: 'q1_u1',
    sessionId: 's1',
    questionId: 'q1',
    uid: 'u1',
    studentId: 'u1',
    studentName: 'Test Student',
    activityType: 'multiple_choice' as const,
    answerPayload: '1',
    queuedAtIso: '2026-11-24T12:00:00Z',
  };
  let q = enqueueOfflineAnswer([], item);
  q = enqueueOfflineAnswer(q, item);
  assert.equal(q.length, 1);

  q = removeQueuedAnswer(q, 's1', 'q1_u1');
  assert.equal(q.length, 0);
});

test('isValidRecordId enforces path variable safety', () => {
  assert.equal(isValidRecordId('unit-7_q1'), true);
  assert.equal(isValidRecordId('../evil'), false);
  assert.equal(isValidRecordId(''), false);
});

test('filterQuestions filters by unit, gameTemplate, difficulty, skillTag, and search', () => {
  const sample = [
    {
      id: 'q1',
      classId: 'S404',
      unitId: 'unit-7',
      gameTemplate: 'Grammar Royale',
      activityType: 'multiple_choice' as const,
      difficulty: 'Easy' as const,
      skillTag: 'Grammar',
      topicTag: 'Reported Speech',
      prompt: 'She said she would arrive early.',
      points: 100,
      timeLimitSec: 45,
      teacherReviewed: false,
      createdAt: null,
      updatedAt: null,
    },
    {
      id: 'q2',
      classId: 'S404',
      unitId: 'unit-8',
      gameTemplate: 'Save the City',
      activityType: 'sentence_completion' as const,
      difficulty: 'Hard' as const,
      skillTag: 'Grammar',
      topicTag: 'Mixed Conditionals',
      prompt: 'If we had invested earlier, the grid would be green now.',
      points: 120,
      timeLimitSec: 60,
      teacherReviewed: false,
      createdAt: null,
      updatedAt: null,
    },
  ];
  assert.equal(filterQuestions(sample, { unitId: 'unit-7' }).length, 1);
  assert.equal(filterQuestions(sample, { difficulty: 'Hard' })[0].id, 'q2');
  assert.equal(filterQuestions(sample, { search: 'reported' })[0].id, 'q1');
  assert.equal(filterQuestions(sample, { gameTemplate: 'Word Duel' }).length, 0);
});

test('pickBalancedQuestions picks up to count items balanced across Easy, Medium, and Hard', () => {
  const pool = [
    { id: 'e1', difficulty: 'Easy' as const },
    { id: 'e2', difficulty: 'Easy' as const },
    { id: 'm1', difficulty: 'Medium' as const },
    { id: 'm2', difficulty: 'Medium' as const },
    { id: 'm3', difficulty: 'Medium' as const },
    { id: 'h1', difficulty: 'Hard' as const },
    { id: 'h2', difficulty: 'Hard' as const },
  ];
  const picked = pickBalancedQuestions(pool, 5);
  assert.equal(picked.length, 5);
  assert.ok(picked.includes('e1'));
  assert.ok(picked.includes('m1'));
  assert.ok(picked.includes('h1'));
});
