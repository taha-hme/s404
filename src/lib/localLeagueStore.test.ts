import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_SEEDED_QUESTIONS } from '../data/questionBank.ts';
import { SAMPLE_PRACTICE_EXERCISES } from '../data/seedContent.ts';
import { BADGE_CATALOG, computeRankTitle } from './leagueRules.ts';
import {
  applyDailyStreak,
  awardLocalXp,
  clearReviewedMistake,
  createDefaultLocalState,
  evaluateBadgeMilestones,
  exportHomeworkPayload,
  getLocalDateKey,
  getStudentProgressSummary,
  HOME_STATE_SCHEMA_VERSION,
  HOME_STORAGE_KEY,
  HOMEWORK_EXPORT_APP_ID,
  HOMEWORK_EXPORT_SCHEMA_VERSION,
  inspectHomeworkSubmission,
  loadLocalState,
  MAX_HOMEWORK_IMPORT_BYTES,
  parseAndValidateHomeworkImport,
  recordCompletedQuiz,
  recordPracticeCompletion,
  recordQuestionAttempt,
  recordWritingResponse,
  restoreStudentBackup,
  saveLocalState,
  saveWritingDraft,
  type StorageLike,
  updateStudentDisplayName,
} from './localLeagueStore.ts';

function createMemoryStorage(initial?: Record<string, string>): StorageLike & {
  dump(): Record<string, string>;
} {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
    dump() {
      return Object.fromEntries(map.entries());
    },
  };
}

function getCorrectPayloadForSeed(seed: (typeof ALL_SEEDED_QUESTIONS)[number]): string {
  const { question, answerKey } = seed;
  if (question.activityType === 'multiple_choice') {
    return String(answerKey.correctOptionIndex ?? 0);
  }
  if (question.activityType === 'true_false') {
    return String(Boolean(answerKey.correctBoolean));
  }
  if (question.activityType === 'sentence_completion') {
    return answerKey.acceptedAnswers?.[0] ?? '';
  }
  if (question.activityType === 'vocab_matching') {
    return JSON.stringify(answerKey.matchingPairs ?? {});
  }
  return 'A thoughtful upper-intermediate response.';
}

function getWrongPayloadForSeed(seed: (typeof ALL_SEEDED_QUESTIONS)[number]): string {
  const { question, answerKey } = seed;
  if (question.activityType === 'multiple_choice') {
    const len = question.options?.length ?? 4;
    const correct = answerKey.correctOptionIndex ?? 0;
    return String((correct + 1) % len);
  }
  if (question.activityType === 'true_false') {
    return String(!Boolean(answerKey.correctBoolean));
  }
  if (question.activityType === 'sentence_completion') {
    return 'totally incorrect filler phrase';
  }
  if (question.activityType === 'vocab_matching') {
    return JSON.stringify({});
  }
  return '';
}

// 1. New student default state
test('1. createDefaultLocalState creates clean initial student progress', () => {
  const now = new Date('2026-11-27T09:00:00.000Z');
  const state = createDefaultLocalState(now);

  assert.equal(state.schemaVersion, HOME_STATE_SCHEMA_VERSION);
  assert.equal(state.studentName, 'Student');
  assert.equal(state.xp, 0);
  assert.equal(state.currentStreak, 0);
  assert.equal(state.bestStreak, 0);
  assert.equal(state.lastPracticeDate, null);
  assert.equal(state.totalAnswered, 0);
  assert.equal(state.correctCount, 0);
  assert.deepEqual(state.unitProgress, { 'unit-7': 0, 'unit-8': 0, 'unit-9': 0 });
  assert.deepEqual(state.unlockedBadges, []);
  assert.deepEqual(state.quizHistory, []);
  assert.equal(state.reviewedMistakeCount, 0);
  assert.equal(state.lastActivity, null);
  assert.equal(state.updatedAt, '2026-11-27T09:00:00.000Z');
});

// 2. Loading and saving state
test('2. loadLocalState and saveLocalState round-trip state cleanly', () => {
  const storage = createMemoryStorage();
  const emptyLoad = loadLocalState(storage);
  assert.equal(emptyLoad.status, 'empty');
  assert.equal(emptyLoad.state.studentName, 'Student');

  let state = updateStudentDisplayName(emptyLoad.state, 'Nadia');
  state = awardLocalXp(state, 180);
  const saveRes = saveLocalState(state, storage);
  assert.equal(saveRes.ok, true);

  const loaded = loadLocalState(storage);
  assert.equal(loaded.status, 'ok');
  assert.equal(loaded.state.studentName, 'Nadia');
  assert.equal(loaded.state.xp, 180);
});

// 3. Malformed JSON recovery
test('3. loadLocalState recovers cleanly from malformed JSON without overwriting storage', () => {
  const rawCorrupted = '{not-valid-json: [1, 2';
  const storage = createMemoryStorage({ [HOME_STORAGE_KEY]: rawCorrupted });

  const loaded = loadLocalState(storage);
  assert.equal(loaded.status, 'corrupted');
  assert.ok(loaded.error);
  assert.equal(loaded.state.studentName, 'Student');
  assert.equal(loaded.state.xp, 0);
  assert.equal(storage.getItem(HOME_STORAGE_KEY), rawCorrupted);

  const nonObjectStorage = createMemoryStorage({ [HOME_STORAGE_KEY]: '["array"]' });
  const loadedArr = loadLocalState(nonObjectStorage);
  assert.equal(loadedArr.status, 'corrupted');
  assert.equal(nonObjectStorage.getItem(HOME_STORAGE_KEY), '["array"]');
});

// 4. Invalid schema versions
test('4. loadLocalState reports invalid_version and preserves existing raw storage', () => {
  const futurePayload = JSON.stringify({ schemaVersion: 99, studentName: 'Ali', xp: 500 });
  const storage = createMemoryStorage({ [HOME_STORAGE_KEY]: futurePayload });

  const loaded = loadLocalState(storage);
  assert.equal(loaded.status, 'invalid_version');
  assert.match(loaded.error ?? '', /99/);
  assert.equal(loaded.state.xp, 0);
  assert.equal(storage.getItem(HOME_STORAGE_KEY), futurePayload);
});

// 5. Storage unavailable fallback
test('5. loadLocalState and saveLocalState handle null or failing storage safely', () => {
  const loadedNull = loadLocalState(null);
  assert.equal(loadedNull.status, 'unavailable');
  assert.ok(loadedNull.error);
  assert.equal(loadedNull.state.studentName, 'Student');

  const saveNull = saveLocalState(loadedNull.state, null);
  assert.equal(saveNull.ok, false);
  assert.ok(saveNull.error);

  const quotaStorage: StorageLike = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  assert.equal(loadLocalState(quotaStorage).status, 'unavailable');
  const saveFail = saveLocalState(loadedNull.state, quotaStorage);
  assert.equal(saveFail.ok, false);
  assert.match(saveFail.error ?? '', /QuotaExceededError/);
});

// 6. Student name updates
test('6. updateStudentDisplayName trims, clamps to 64 chars, and falls back on blank', () => {
  let state = createDefaultLocalState();
  state = updateStudentDisplayName(state, '   Sara Moradi   ');
  assert.equal(state.studentName, 'Sara Moradi');

  state = updateStudentDisplayName(state, '   ');
  assert.equal(state.studentName, 'Student');

  const longName = 'A'.repeat(100);
  state = updateStudentDisplayName(state, longName);
  assert.equal(state.studentName.length, 64);
});

// 7 & 8 & 9. Question attempt recording, statistics, and XP calculations
test('7-9. recordQuestionAttempt grades MC/TF/SC/VM, updates accuracy stats and XP', () => {
  const mc = ALL_SEEDED_QUESTIONS.find((s) => s.question.activityType === 'multiple_choice')!;
  const tf = ALL_SEEDED_QUESTIONS.find((s) => s.question.activityType === 'true_false')!;
  const sc = ALL_SEEDED_QUESTIONS.find((s) => s.question.activityType === 'sentence_completion')!;
  const vm = ALL_SEEDED_QUESTIONS.find((s) => s.question.activityType === 'vocab_matching')!;

  let state = createDefaultLocalState(new Date('2026-11-27T10:00:00.000Z'));

  const resMc = recordQuestionAttempt(state, {
    questionId: mc.question.id,
    answerPayload: getCorrectPayloadForSeed(mc),
  });
  state = resMc.state;
  assert.equal(resMc.isCorrect, true);
  assert.equal(resMc.xpEarnedDelta, mc.question.points);

  const resTfWrong = recordQuestionAttempt(state, {
    questionId: tf.question.id,
    answerPayload: getWrongPayloadForSeed(tf),
  });
  state = resTfWrong.state;
  assert.equal(resTfWrong.isCorrect, false);
  assert.equal(resTfWrong.xpEarnedDelta, 0);

  const resSc = recordQuestionAttempt(state, {
    questionId: sc.question.id,
    answerPayload: getCorrectPayloadForSeed(sc),
  });
  state = resSc.state;
  assert.equal(resSc.isCorrect, true);

  const resVm = recordQuestionAttempt(state, {
    questionId: vm.question.id,
    answerPayload: getCorrectPayloadForSeed(vm),
  });
  state = resVm.state;
  assert.equal(resVm.isCorrect, true);

  const summary = getStudentProgressSummary(state);
  assert.equal(summary.totalAnswered, 4);
  assert.equal(summary.correctCount, 3);
  assert.equal(summary.accuracyPercent, 75);
  assert.equal(summary.xp, mc.question.points + sc.question.points + vm.question.points);

  // awardLocalXp clamps at 0 minimum
  const clamped = awardLocalXp(state, -999999);
  assert.equal(clamped.xp, 0);
});

// 10. Duplicate reward prevention
test('10. re-answering same question or improving partial match never double-awards full XP', () => {
  const vm = ALL_SEEDED_QUESTIONS.find(
    (s) =>
      s.question.activityType === 'vocab_matching' &&
      Object.keys(s.answerKey.matchingPairs ?? {}).length >= 2
  )!;
  const pairs = vm.answerKey.matchingPairs!;
  const entries = Object.entries(pairs);
  const partialPayload = JSON.stringify({
    [entries[0][0]]: entries[0][1],
    [entries[1][0]]: 'wrong_definition',
  });

  let state = createDefaultLocalState();
  const partialRes = recordQuestionAttempt(state, {
    questionId: vm.question.id,
    answerPayload: partialPayload,
  });
  state = partialRes.state;
  assert.ok(partialRes.pointsAwarded > 0);
  assert.ok(partialRes.pointsAwarded < vm.question.points);
  assert.equal(state.xp, partialRes.pointsAwarded);

  // Repeating identical partial answer yields 0 XP
  const repeatPartial = recordQuestionAttempt(state, {
    questionId: vm.question.id,
    answerPayload: partialPayload,
  });
  state = repeatPartial.state;
  assert.equal(repeatPartial.xpEarnedDelta, 0);
  assert.equal(state.xp, partialRes.pointsAwarded);

  // Improving to full score awards only the delta
  const fullRes = recordQuestionAttempt(state, {
    questionId: vm.question.id,
    answerPayload: JSON.stringify(pairs),
  });
  state = fullRes.state;
  assert.equal(fullRes.xpEarnedDelta, vm.question.points - partialRes.pointsAwarded);
  assert.equal(state.xp, vm.question.points);

  // Re-answering full score awards 0 extra XP
  const repeatFull = recordQuestionAttempt(state, {
    questionId: vm.question.id,
    answerPayload: JSON.stringify(pairs),
  });
  assert.equal(repeatFull.xpEarnedDelta, 0);
  assert.equal(repeatFull.state.xp, vm.question.points);
});

// 11. Rank calculation
test('11. rankTitle and nextRank progress match leagueRules XP tiers', () => {
  let state = createDefaultLocalState();
  assert.equal(getStudentProgressSummary(state).rankTitle, 'Contender');
  assert.equal(getStudentProgressSummary(state).nextRank, 'Apprentice');

  state = awardLocalXp(state, 150);
  assert.equal(getStudentProgressSummary(state).rankTitle, 'Apprentice');

  state = awardLocalXp(state, 750); // 900 XP -> Orator
  assert.equal(getStudentProgressSummary(state).rankTitle, computeRankTitle(900));

  state = awardLocalXp(state, 1600); // 2500 XP -> Grandmaster
  const topSummary = getStudentProgressSummary(state);
  assert.equal(topSummary.rankTitle, 'Grandmaster');
  assert.equal(topSummary.nextRank, null);
  assert.equal(topSummary.xpToNextRank, 0);
});

// 12. Badge unlocking
test('12. evaluateBadgeMilestones unlocks all 6 league badges idempotently at thresholds', () => {
  const day1 = new Date(2026, 10, 25, 10, 0, 0);
  const day2 = new Date(2026, 10, 26, 10, 0, 0);
  const day3 = new Date(2026, 10, 27, 10, 0, 0);

  let state = createDefaultLocalState(day1);

  const readingOrTf = ALL_SEEDED_QUESTIONS.filter(
    (s) => !s.question.teacherReviewed && (s.question.activityType === 'true_false' || s.question.skillTag === 'Reading')
  ).slice(0, 3);
  const grammar = ALL_SEEDED_QUESTIONS.filter(
    (s) => !s.question.teacherReviewed && s.question.skillTag === 'Grammar'
  ).slice(0, 5);
  const vocab = ALL_SEEDED_QUESTIONS.filter(
    (s) => !s.question.teacherReviewed && (s.question.skillTag === 'Vocabulary' || s.question.activityType === 'vocab_matching')
  ).slice(0, 3);

  for (const seed of [...readingOrTf, ...grammar, ...vocab]) {
    state = recordQuestionAttempt(state, {
      questionId: seed.question.id,
      answerPayload: getCorrectPayloadForSeed(seed),
      now: day1,
    }).state;
  }

  // Creative Mind: 1 writing submission
  const writingEx = SAMPLE_PRACTICE_EXERCISES.find((e) => e.requiresTeacherReview)!;
  state = recordPracticeCompletion(state, {
    exerciseId: writingEx.id,
    response: 'My Upper-Intermediate essay on social change.',
    now: day1,
  }).state;

  // Smooth Talker: 3-day streak
  state = applyDailyStreak(state, day1);
  state = applyDailyStreak(state, day2);
  state = applyDailyStreak(state, day3);

  // Comeback Kid: resolve a mistake
  const mc = ALL_SEEDED_QUESTIONS.find((s) => s.question.activityType === 'multiple_choice')!;
  state = recordQuestionAttempt(state, {
    questionId: mc.question.id,
    answerPayload: getWrongPayloadForSeed(mc),
    now: day3,
  }).state;
  state = recordQuestionAttempt(state, {
    questionId: mc.question.id,
    answerPayload: getCorrectPayloadForSeed(mc),
    now: day3,
  }).state;

  // Re-evaluate multiple times to prove no duplicates
  state = evaluateBadgeMilestones(state, day3);
  state = evaluateBadgeMilestones(state, day3);

  const unlockedKeys = new Set(state.unlockedBadges.map((b) => b.badgeKey));
  assert.equal(state.unlockedBadges.length, BADGE_CATALOG.length);
  for (const badge of BADGE_CATALOG) {
    assert.ok(unlockedKeys.has(badge.key), `Expected badge ${badge.key} to unlock`);
  }
});

// 13. Streak calculations across consecutive days
test('13. applyDailyStreak increments on consecutive local days, stays same day, resets on gaps', () => {
  const day1 = new Date(2026, 10, 20, 9, 0, 0);
  const day1Later = new Date(2026, 10, 20, 21, 30, 0);
  const day2 = new Date(2026, 10, 21, 8, 15, 0);
  const day4 = new Date(2026, 10, 23, 12, 0, 0);

  let state = createDefaultLocalState(day1);
  state = applyDailyStreak(state, day1);
  assert.equal(state.currentStreak, 1);
  assert.equal(state.bestStreak, 1);
  assert.equal(state.lastPracticeDate, getLocalDateKey(day1));

  // Same day does not double-increment
  state = applyDailyStreak(state, day1Later);
  assert.equal(state.currentStreak, 1);
  assert.equal(state.bestStreak, 1);

  // Consecutive next day increments
  state = applyDailyStreak(state, day2);
  assert.equal(state.currentStreak, 2);
  assert.equal(state.bestStreak, 2);

  // Older/skewed past timestamp is ignored
  state = applyDailyStreak(state, day1);
  assert.equal(state.currentStreak, 2);
  assert.equal(state.lastPracticeDate, getLocalDateKey(day2));

  // Gap of >1 day resets currentStreak to 1 while keeping bestStreak
  state = applyDailyStreak(state, day4);
  assert.equal(state.currentStreak, 1);
  assert.equal(state.bestStreak, 2);
});

// 14. Incorrect-answer tracking
test('14. incorrectAnswers tracks misses, marks reviewed on retry, and clears on manual review', () => {
  const mc1 = ALL_SEEDED_QUESTIONS.find((s) => s.question.activityType === 'multiple_choice')!;
  const tf1 = ALL_SEEDED_QUESTIONS.find((s) => s.question.activityType === 'true_false')!;

  let state = createDefaultLocalState();
  state = recordQuestionAttempt(state, {
    questionId: mc1.question.id,
    answerPayload: getWrongPayloadForSeed(mc1),
  }).state;
  state = recordQuestionAttempt(state, {
    questionId: mc1.question.id,
    answerPayload: getWrongPayloadForSeed(mc1),
  }).state;

  assert.equal(state.incorrectAnswers[mc1.question.id].attemptCount, 2);
  assert.equal(state.incorrectAnswers[mc1.question.id].reviewed, false);
  assert.equal(getStudentProgressSummary(state).pendingMistakeCount, 1);

  // Retry correctly marks reviewed and increments reviewedMistakeCount
  state = recordQuestionAttempt(state, {
    questionId: mc1.question.id,
    answerPayload: getCorrectPayloadForSeed(mc1),
  }).state;
  assert.equal(state.incorrectAnswers[mc1.question.id].reviewed, true);
  assert.equal(state.incorrectAnswers[mc1.question.id].isCorrect, true);
  assert.equal(state.reviewedMistakeCount, 1);
  assert.equal(getStudentProgressSummary(state).pendingMistakeCount, 0);

  // Miss a second question then clear it manually
  state = recordQuestionAttempt(state, {
    questionId: tf1.question.id,
    answerPayload: getWrongPayloadForSeed(tf1),
  }).state;
  state = clearReviewedMistake(state, tf1.question.id);
  assert.equal(state.incorrectAnswers[tf1.question.id], undefined);
  assert.equal(state.reviewedMistakeCount, 2);
});

// 15. Practice history
test('15. recordPracticeCompletion records self-check practice and prevents duplicate XP', () => {
  const vocabEx = SAMPLE_PRACTICE_EXERCISES.find((e) => e.id === 'prac-u7-vocab-1')!;
  let state = createDefaultLocalState();

  const first = recordPracticeCompletion(state, {
    exerciseId: vocabEx.id,
    response: 'PLAUSIBLE',
  });
  state = first.state;
  assert.equal(first.record.selfCheckCorrect, true);
  assert.equal(first.xpEarnedDelta, vocabEx.suggestedXp);
  assert.equal(state.xp, vocabEx.suggestedXp);
  assert.equal(state.practiceHistory[vocabEx.id].attemptCount, 1);

  const second = recordPracticeCompletion(state, {
    exerciseId: vocabEx.id,
    response: 'plausible',
  });
  state = second.state;
  assert.equal(second.xpEarnedDelta, 0);
  assert.equal(state.xp, vocabEx.suggestedXp);
  assert.equal(state.practiceHistory[vocabEx.id].attemptCount, 2);
});

// 16. Writing response persistence
test('16. writing drafts and open-ended writing/speaking responses persist without self-awarded XP', () => {
  const writingEx = SAMPLE_PRACTICE_EXERCISES.find((e) => e.id === 'prac-u9-write-1')!;
  const openQ = ALL_SEEDED_QUESTIONS.find((s) => s.question.activityType === 'open_ended')!;

  let state = createDefaultLocalState();
  state = saveWritingDraft(state, writingEx.id, 'Draft notes about consumerism...');
  assert.equal(state.writingDrafts[writingEx.id], 'Draft notes about consumerism...');

  const resPrac = recordPracticeCompletion(state, {
    exerciseId: writingEx.id,
    response: 'Advertising often creates artificial needs among young buyers.',
  });
  state = resPrac.state;
  assert.equal(resPrac.xpEarnedDelta, 0);
  assert.equal(resPrac.record.needsTeacherReview, true);
  assert.equal(
    state.writingResponses[writingEx.id].response,
    'Advertising often creates artificial needs among young buyers.'
  );

  // Open-ended question via recordWritingResponse
  state = recordWritingResponse(state, {
    itemId: openQ.question.id,
    response: 'The hiker had already spotted the tracks before dusk.',
  });
  assert.equal(state.xp, 0);
  assert.equal(state.writingResponses[openQ.question.id].source, 'question');
});

// 17. Valid homework export
test('17. exportHomeworkPayload outputs schema-compliant JSON with quiz, practice, writing, mistakes', () => {
  const mc = ALL_SEEDED_QUESTIONS.find((s) => s.question.activityType === 'multiple_choice')!;
  const tf = ALL_SEEDED_QUESTIONS.find((s) => s.question.activityType === 'true_false')!;
  const writingEx = SAMPLE_PRACTICE_EXERCISES.find((e) => e.id === 'prac-u9-write-1')!;

  let state = updateStudentDisplayName(createDefaultLocalState(), 'Mina');
  state = recordCompletedQuiz(state, {
    quizId: 'quiz-u7-1',
    unitId: 'unit-7',
    gameTemplate: 'Grammar Royale',
    items: [
      { questionId: mc.question.id, answerPayload: getCorrectPayloadForSeed(mc) },
      { questionId: tf.question.id, answerPayload: getWrongPayloadForSeed(tf) },
    ],
  }).state;
  state = recordPracticeCompletion(state, {
    exerciseId: writingEx.id,
    response: 'Consumer habits change rapidly online.',
  }).state;

  const payload = exportHomeworkPayload(state, new Date('2026-11-27T11:00:00.000Z'));
  assert.equal(payload.app, HOMEWORK_EXPORT_APP_ID);
  assert.equal(payload.schemaVersion, HOMEWORK_EXPORT_SCHEMA_VERSION);
  assert.equal(payload.studentName, 'Mina');
  assert.equal(payload.quizHistory.length, 1);
  assert.equal(payload.practiceSubmissions.length, 1);
  assert.equal(payload.writingResponses.length, 1);
  assert.equal(payload.incorrectAnswers.length, 1);
  assert.equal(payload.questionAttempts.length, 2);

  const rawJson = JSON.stringify(payload);
  const validated = parseAndValidateHomeworkImport(rawJson);
  assert.equal(validated.ok, true);
  assert.equal(validated.payload?.studentName, 'Mina');

  // Verify no sensitive server fields appear in export
  assert.equal('passwordHash' in payload, false);
  assert.equal('sessionSecret' in payload, false);
});

// 18. Invalid homework import
test('18. parseAndValidateHomeworkImport rejects wrong app ID, schemaVersion, tampered types, and __proto__', () => {
  const basePayload = exportHomeworkPayload(createDefaultLocalState());

  assert.equal(parseAndValidateHomeworkImport('').ok, false);
  assert.equal(parseAndValidateHomeworkImport('{bad json').ok, false);

  const wrongApp = { ...basePayload, app: 'other-app' };
  assert.equal(parseAndValidateHomeworkImport(JSON.stringify(wrongApp)).ok, false);

  const wrongSchema = { ...basePayload, schemaVersion: 2 };
  assert.equal(parseAndValidateHomeworkImport(JSON.stringify(wrongSchema)).ok, false);

  const badTimestamp = { ...basePayload, exportedAt: 'not-a-date' };
  assert.equal(parseAndValidateHomeworkImport(JSON.stringify(badTimestamp)).ok, false);

  const negativeXp = {
    ...basePayload,
    summary: { ...basePayload.summary, xp: -50 },
  };
  assert.equal(parseAndValidateHomeworkImport(JSON.stringify(negativeXp)).ok, false);

  const protoPayload = '{"app":"s404-english-league-home","schemaVersion":1,"__proto__":{"polluted":true}}';
  assert.equal(parseAndValidateHomeworkImport(protoPayload).ok, false);

  // Tampered rankTitle in JSON gets recomputed from XP during validation
  const tamperedRank = {
    ...basePayload,
    summary: { ...basePayload.summary, xp: 0, rankTitle: 'Grandmaster' },
  };
  const validWithNormalizedRank = parseAndValidateHomeworkImport(JSON.stringify(tamperedRank));
  assert.equal(validWithNormalizedRank.ok, true);
  assert.equal(validWithNormalizedRank.payload?.summary.rankTitle, 'Contender');
});

// 19. Oversized JSON rejection
test('19. parseAndValidateHomeworkImport rejects payloads exceeding 2 MB limit', () => {
  const basePayload = exportHomeworkPayload(createDefaultLocalState());
  const hugeString = 'x'.repeat(MAX_HOMEWORK_IMPORT_BYTES + 1024);
  const oversized = JSON.stringify({ ...basePayload, extra: hugeString });

  const res = parseAndValidateHomeworkImport(oversized);
  assert.equal(res.ok, false);
  assert.match(res.error ?? '', /2 MB/);
});

// 20. Unknown question and unit IDs rejected
test('20. parseAndValidateHomeworkImport rejects unknown question IDs, exercise IDs, and unit IDs', () => {
  const mc = ALL_SEEDED_QUESTIONS[0];
  const basePayload = exportHomeworkPayload(createDefaultLocalState());

  const badUnitSummary = {
    ...basePayload,
    summary: {
      ...basePayload.summary,
      unitProgress: { 'unit-7': 10, 'unit-8': 0, 'unit-9': 0, 'unit-99': 50 },
    },
  };
  assert.equal(parseAndValidateHomeworkImport(JSON.stringify(badUnitSummary)).ok, false);

  const unknownQuestionAttempt = {
    ...basePayload,
    questionAttempts: [
      {
        questionId: 'q-does-not-exist-999',
        unitId: 'unit-7',
        lastAnswer: '0',
        attemptCount: 1,
        everCorrect: true,
        xpAwarded: 100,
        lastAttemptAt: '2026-11-27T10:00:00.000Z',
      },
    ],
  };
  assert.equal(parseAndValidateHomeworkImport(JSON.stringify(unknownQuestionAttempt)).ok, false);

  const unknownPractice = {
    ...basePayload,
    practiceSubmissions: [
      {
        exerciseId: 'prac-fake-id',
        unitId: 'unit-7',
        category: 'vocabulary',
        title: 'Fake',
        response: 'hello',
        selfCheckCorrect: true,
        needsTeacherReview: false,
        xpAwarded: 25,
        attemptCount: 1,
        submittedAt: '2026-11-27T10:00:00.000Z',
        updatedAt: '2026-11-27T10:00:00.000Z',
      },
    ],
  };
  assert.equal(parseAndValidateHomeworkImport(JSON.stringify(unknownPractice)).ok, false);

  const badQuizUnit = {
    ...basePayload,
    quizHistory: [
      {
        quizId: 'quiz-1',
        unitId: 'unit-42',
        gameTemplate: 'Grammar Royale',
        score: 100,
        totalQuestions: 1,
        correctCount: 1,
        completedAt: '2026-11-27T10:00:00.000Z',
        items: [
          {
            questionId: mc.question.id,
            studentAnswer: '0',
            isCorrect: true,
            pointsAwarded: 100,
          },
        ],
      },
    ],
  };
  assert.equal(parseAndValidateHomeworkImport(JSON.stringify(badQuizUnit)).ok, false);
});

// 21 & 22. Progress backup restoration, teacher inspection isolation, and preserving existing valid data
test('21-22. inspectHomeworkSubmission never mutates localStorage; restoreStudentBackup requires confirmation and invalid imports preserve existing state', () => {
  const mc = ALL_SEEDED_QUESTIONS.find((s) => s.question.activityType === 'multiple_choice')!;
  let teacherLocalState = updateStudentDisplayName(createDefaultLocalState(), 'TeacherDevice');
  teacherLocalState = awardLocalXp(teacherLocalState, 320);

  const storage = createMemoryStorage();
  saveLocalState(teacherLocalState, storage);
  const rawBefore = storage.getItem(HOME_STORAGE_KEY);

  // Student builds state and exports JSON
  let studentState = updateStudentDisplayName(createDefaultLocalState(), 'Kian');
  studentState = recordQuestionAttempt(studentState, {
    questionId: mc.question.id,
    answerPayload: getCorrectPayloadForSeed(mc),
  }).state;
  const studentJson = JSON.stringify(exportHomeworkPayload(studentState));

  // Workflow B: Teacher inspection reads JSON in memory and leaves localStorage untouched
  const inspected = inspectHomeworkSubmission(studentJson);
  assert.equal(inspected.ok, true);
  assert.equal(inspected.inspection?.studentName, 'Kian');
  assert.equal(storage.getItem(HOME_STORAGE_KEY), rawBefore);
  assert.equal(loadLocalState(storage).state.studentName, 'TeacherDevice');

  // Workflow A without confirmReplace=true refuses and preserves existing storage
  const unconfirmed = restoreStudentBackup(studentJson, {
    confirmReplace: false,
    storage,
  });
  assert.equal(unconfirmed.ok, false);
  assert.equal(storage.getItem(HOME_STORAGE_KEY), rawBefore);

  // Workflow A with invalid JSON fails and preserves existing valid storage
  const invalidRestore = restoreStudentBackup('{"app":"invalid"}', {
    confirmReplace: true,
    storage,
  });
  assert.equal(invalidRestore.ok, false);
  assert.equal(storage.getItem(HOME_STORAGE_KEY), rawBefore);

  // Workflow A with confirmReplace=true replaces state and saves cleanly
  const confirmed = restoreStudentBackup(studentJson, {
    confirmReplace: true,
    storage,
  });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.state?.studentName, 'Kian');
  assert.equal(loadLocalState(storage).state.studentName, 'Kian');
  assert.equal(loadLocalState(storage).state.xp, mc.question.points);
});
