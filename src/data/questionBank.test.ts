import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_SEEDED_QUESTIONS, UNIT_EXPANSION_QUESTIONS } from './questionBank.ts';
import { GAME_TEMPLATES, normalizeAnswerText } from '../lib/leagueRules.ts';

const UNITS = ['unit-7', 'unit-8', 'unit-9'] as const;

test('question bank has at least 400 original questions and 17 per (unit, gameTemplate) cell', () => {
  assert.equal(UNIT_EXPANSION_QUESTIONS.length, 400);
  assert.equal(ALL_SEEDED_QUESTIONS.length, 408);

  const cellCounts = new Map<string, number>();
  for (const unit of UNITS) {
    for (const tpl of GAME_TEMPLATES) {
      cellCounts.set(`${unit}::${tpl.name}`, 0);
    }
  }

  for (const { question } of ALL_SEEDED_QUESTIONS) {
    const key = `${question.unitId}::${question.gameTemplate}`;
    assert.ok(cellCounts.has(key), `Unexpected unit/template pair: ${key}`);
    cellCounts.set(key, (cellCounts.get(key) ?? 0) + 1);
  }

  for (const [key, count] of cellCounts.entries()) {
    assert.ok(count >= 15, `Cell ${key} has only ${count} questions (expected >= 15)`);
    assert.equal(count, 17, `Cell ${key} count mismatch: ${count}`);
  }
});

test('all questions have unique IDs, unique prompts, and rich metadata', () => {
  const seenIds = new Set<string>();
  const seenPrompts = new Set<string>();

  for (const { question, answerKey } of ALL_SEEDED_QUESTIONS) {
    assert.equal(seenIds.has(question.id), false, `Duplicate id: ${question.id}`);
    seenIds.add(question.id);
    assert.equal(question.id, answerKey.questionId);

    const normPrompt = normalizeAnswerText(question.prompt);
    assert.equal(seenPrompts.has(normPrompt), false, `Duplicate prompt in ${question.id}`);
    seenPrompts.add(normPrompt);

    assert.ok(
      question.difficulty === 'Easy' || question.difficulty === 'Medium' || question.difficulty === 'Hard',
      `Invalid difficulty on ${question.id}`
    );
    assert.ok(question.skillTag && question.skillTag.trim().length > 0, `Missing skillTag on ${question.id}`);
    assert.ok(question.topicTag && question.topicTag.trim().length > 0, `Missing topicTag on ${question.id}`);
    assert.ok(
      question.learningObjective && question.learningObjective.trim().length > 0,
      `Missing learningObjective on ${question.id}`
    );
    assert.ok(question.hint && question.hint.trim().length > 0, `Missing hint on ${question.id}`);
    assert.ok(answerKey.explanation.trim().length > 0, `Missing explanation on ${question.id}`);
  }
});

test('difficulty distribution matches ~25% Easy / ~50% Medium / ~25% Hard', () => {
  const counts = { Easy: 0, Medium: 0, Hard: 0 };
  for (const { question } of ALL_SEEDED_QUESTIONS) {
    counts[question.difficulty!] += 1;
  }
  assert.equal(counts.Easy, 102);
  assert.equal(counts.Medium, 204);
  assert.equal(counts.Hard, 102);

  for (const unit of UNITS) {
    const uCounts = { Easy: 0, Medium: 0, Hard: 0 };
    for (const { question } of ALL_SEEDED_QUESTIONS.filter((item) => item.question.unitId === unit)) {
      uCounts[question.difficulty!] += 1;
    }
    assert.deepEqual(uCounts, { Easy: 34, Medium: 68, Hard: 34 }, `Unit ${unit} difficulty imbalance`);
  }
});

test('all activity-specific answer keys and structures are valid and balanced', () => {
  const mcIndexCounts = [0, 0, 0, 0];
  let tfTrue = 0;
  let tfFalse = 0;

  for (const { question, answerKey } of ALL_SEEDED_QUESTIONS) {
    switch (question.activityType) {
      case 'multiple_choice': {
        assert.ok(question.options && question.options.length === 4, `MC must have 4 options: ${question.id}`);
        assert.equal(new Set(question.options).size, 4, `MC duplicate options in ${question.id}`);
        const idx = answerKey.correctOptionIndex;
        assert.ok(idx !== undefined && idx >= 0 && idx <= 3, `Invalid MC index in ${question.id}`);
        mcIndexCounts[idx] += 1;
        break;
      }
      case 'true_false': {
        assert.equal(typeof answerKey.correctBoolean, 'boolean', `Missing boolean key in ${question.id}`);
        if (answerKey.correctBoolean) tfTrue += 1;
        else tfFalse += 1;
        break;
      }
      case 'sentence_completion': {
        assert.ok(
          answerKey.acceptedAnswers && answerKey.acceptedAnswers.length > 0,
          `Missing acceptedAnswers in ${question.id}`
        );
        for (const ans of answerKey.acceptedAnswers) {
          assert.ok(ans.trim().length > 0, `Blank accepted answer in ${question.id}`);
        }
        break;
      }
      case 'vocab_matching': {
        const left = question.matchingLeft ?? [];
        const right = question.matchingRight ?? [];
        const pairs = answerKey.matchingPairs ?? {};
        assert.ok(left.length >= 3, `Too few matching pairs in ${question.id}`);
        assert.equal(left.length, right.length, `Left/Right length mismatch in ${question.id}`);
        assert.equal(new Set(left).size, left.length, `Duplicate left terms in ${question.id}`);
        assert.equal(new Set(right).size, right.length, `Duplicate right defs in ${question.id}`);
        for (const term of left) {
          assert.ok(right.includes(pairs[term]), `Missing matching pair definition for "${term}" in ${question.id}`);
        }
        if (question.id.startsWith('qb-')) {
          const anyAligned = left.some((term, i) => pairs[term] === right[i]);
          assert.equal(anyAligned, false, `Expected scrambled matchingRight on ${question.id}`);
        }
        break;
      }
      case 'open_ended':
      case 'speaking_writing': {
        assert.equal(question.teacherReviewed, true, `Expected teacherReviewed=true on ${question.id}`);
        assert.ok(answerKey.rubric && answerKey.rubric.trim().length > 10, `Missing rubric on ${question.id}`);
        break;
      }
    }
  }

  // Ensure MC answer positions aren't stuck on index 0
  for (let i = 0; i < 4; i += 1) {
    assert.ok(mcIndexCounts[i] >= 15, `MC index ${i} underrepresented: ${JSON.stringify(mcIndexCounts)}`);
  }

  // Ensure Fact or Fiction stays close to 50/50
  assert.ok(Math.abs(tfTrue - tfFalse) <= 3, `T/F skewed: true=${tfTrue}, false=${tfFalse}`);
});
