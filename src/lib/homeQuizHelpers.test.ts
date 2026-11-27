import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultLocalState, recordQuestionAttempt } from './localLeagueStore.ts';
import {
  buildHomeworkExportFilename,
  formatStudentAnswerDisplay,
  getAnswerDisplayForQuestion,
  getQuestionBackedPracticeItems,
  selectSoloQuizQuestions,
} from './homeQuizHelpers.ts';

test('selectSoloQuizQuestions filters by unit and difficulty and respects count 5/10/15', () => {
  const u7Five = selectSoloQuizQuestions({
    unitId: 'unit-7',
    difficulty: 'all',
    count: 5,
  });
  assert.equal(u7Five.length, 5);
  assert.ok(u7Five.every((e) => e.question.unitId === 'unit-7' && !e.question.teacherReviewed));

  const u8HardTen = selectSoloQuizQuestions({
    unitId: 'unit-8',
    difficulty: 'Hard',
    count: 10,
  });
  assert.equal(u8HardTen.length, 10);
  assert.ok(u8HardTen.every((e) => e.question.unitId === 'unit-8' && e.question.difficulty === 'Hard'));

  const allFifteen = selectSoloQuizQuestions({
    unitId: 'all',
    difficulty: 'all',
    count: 15,
  });
  assert.equal(allFifteen.length, 15);
});

test('selectSoloQuizQuestions prioritizes unattempted questions before already-mastered ones', () => {
  const firstRun = selectSoloQuizQuestions({
    unitId: 'unit-9',
    difficulty: 'all',
    count: 5,
  });
  assert.equal(firstRun.length, 5);

  let state = createDefaultLocalState();
  for (const entry of firstRun) {
    const payload =
      entry.question.activityType === 'multiple_choice'
        ? String(entry.answerKey.correctOptionIndex ?? 0)
        : entry.question.activityType === 'true_false'
        ? String(Boolean(entry.answerKey.correctBoolean))
        : entry.question.activityType === 'sentence_completion'
        ? entry.answerKey.acceptedAnswers?.[0] ?? ''
        : JSON.stringify(entry.answerKey.matchingPairs ?? {});

    state = recordQuestionAttempt(state, {
      questionId: entry.question.id,
      answerPayload: payload,
    }).state;
  }

  const secondRun = selectSoloQuizQuestions({
    unitId: 'unit-9',
    difficulty: 'all',
    count: 5,
    questionAttempts: state.questionAttempts,
  });
  assert.equal(secondRun.length, 5);
  const firstIds = new Set(firstRun.map((e) => e.question.id));
  const overlap = secondRun.filter((e) => firstIds.has(e.question.id));
  assert.equal(overlap.length, 0);
});

test('getQuestionBackedPracticeItems provides balanced extra auto-gradable items across Units 7-9', () => {
  const items = getQuestionBackedPracticeItems(1);
  assert.equal(items.length, 15);
  assert.ok(items.some((i) => i.unitId === 'unit-7'));
  assert.ok(items.some((i) => i.unitId === 'unit-8'));
  assert.ok(items.some((i) => i.unitId === 'unit-9'));
  assert.ok(items.every((i) => !i.question.teacherReviewed));
});

test('buildHomeworkExportFilename sanitizes student names cleanly', () => {
  const filename = buildHomeworkExportFilename('Sara Moradi!!', new Date(2026, 10, 27));
  assert.equal(filename, 's404-homework-sara-moradi-2026-11-27.json');
  assert.equal(
    buildHomeworkExportFilename('   ', new Date(2026, 10, 27)),
    's404-homework-student-2026-11-27.json'
  );
});

test('getAnswerDisplayForQuestion and formatStudentAnswerDisplay resolve readable answers', () => {
  assert.ok(getAnswerDisplayForQuestion('q-u7-grammar-1').length > 0);
  assert.equal(getAnswerDisplayForQuestion('q-u7-fact-1'), 'False');
  assert.match(formatStudentAnswerDisplay('q-u7-grammar-1', '1'), /^B\. /);
  assert.equal(formatStudentAnswerDisplay('q-u7-fact-1', 'false'), 'False');
  assert.equal(formatStudentAnswerDisplay('q-u7-fact-1', ''), '(no answer)');
});
