import { ALL_SEEDED_QUESTIONS } from '../data/questionBank.ts';
import { filterQuestions, pickBalancedQuestions } from './leagueRules.ts';
import type {
  LocalQuestionAttemptSummary,
  LocalStudentState,
  UnitId,
} from './localLeagueStore.ts';
import type {
  AnswerKey,
  PracticeCategory,
  PracticeExercise,
  Question,
  QuestionDifficulty,
} from '../types/league.ts';

export interface SeededQuestionEntry {
  question: Question;
  answerKey: AnswerKey;
}

export interface QuestionBackedPracticeItem {
  kind: 'question';
  question: Question;
  answerKey: AnswerKey;
  unitId: UnitId;
  category: Exclude<PracticeCategory, 'writing'>;
  title: string;
}

const QUESTION_BANK_HYDRATED: SeededQuestionEntry[] = ALL_SEEDED_QUESTIONS.map((seed) => ({
  question: {
    ...seed.question,
    createdAt: null,
    updatedAt: null,
  },
  answerKey: {
    ...seed.answerKey,
    updatedAt: null,
  },
}));

const QUESTION_ENTRY_BY_ID = new Map<string, SeededQuestionEntry>(
  QUESTION_BANK_HYDRATED.map((entry) => [entry.question.id, entry])
);

export function getSeededQuestionEntry(questionId: string): SeededQuestionEntry | undefined {
  return QUESTION_ENTRY_BY_ID.get(questionId);
}

export function getAllSeededQuestionEntries(): SeededQuestionEntry[] {
  return QUESTION_BANK_HYDRATED;
}

export function selectSoloQuizQuestions(params: {
  unitId: UnitId | 'all';
  difficulty: QuestionDifficulty | 'all';
  count: 5 | 10 | 15;
  questionAttempts?: Record<string, LocalQuestionAttemptSummary>;
  includeOpenEnded?: boolean;
}): SeededQuestionEntry[] {
  const pool = QUESTION_BANK_HYDRATED.map((entry) => entry.question).filter((q) =>
    params.includeOpenEnded ? true : !q.teacherReviewed
  );

  const filtered = filterQuestions(pool, {
    unitId: params.unitId === 'all' ? undefined : params.unitId,
    difficulty: params.difficulty === 'all' ? undefined : params.difficulty,
  });

  // Prioritize unattempted questions first, then previously missed questions, then solved questions
  const attempts = params.questionAttempts ?? {};
  const ordered = [...filtered].sort((a, b) => {
    const attA = attempts[a.id];
    const attB = attempts[b.id];
    const rankA = !attA ? 0 : !attA.everCorrect ? 1 : 2;
    const rankB = !attB ? 0 : !attB.everCorrect ? 1 : 2;
    if (rankA !== rankB) return rankA - rankB;
    return (attA?.attemptCount ?? 0) - (attB?.attemptCount ?? 0);
  });

  const pickedIds = pickBalancedQuestions(ordered, params.count);
  return pickedIds
    .map((id) => QUESTION_ENTRY_BY_ID.get(id))
    .filter((entry): entry is SeededQuestionEntry => Boolean(entry));
}

export function mapQuestionToPracticeCategory(
  q: Question
): Exclude<PracticeCategory, 'writing'> {
  if (q.activityType === 'sentence_completion') return 'sentence_completion';
  if (q.activityType === 'vocab_matching') return 'matching';
  if (q.skillTag === 'Reading' || q.activityType === 'true_false') return 'reading';
  if (q.skillTag === 'Vocabulary') return 'vocabulary';
  return 'grammar';
}

/**
 * Derives a compact, balanced set of auto-gradable extra practice drills from the
 * existing question bank without duplicating SAMPLE_PRACTICE_EXERCISES.
 */
export function getQuestionBackedPracticeItems(
  perUnitPerCategory = 1
): QuestionBackedPracticeItem[] {
  const units: UnitId[] = ['unit-7', 'unit-8', 'unit-9'];
  const categories: Array<Exclude<PracticeCategory, 'writing'>> = [
    'vocabulary',
    'grammar',
    'sentence_completion',
    'matching',
    'reading',
  ];

  const picked: QuestionBackedPracticeItem[] = [];
  const usedIds = new Set<string>();

  for (const unitId of units) {
    for (const cat of categories) {
      let taken = 0;
      for (const entry of QUESTION_BANK_HYDRATED) {
        const q = entry.question;
        if (q.teacherReviewed || q.unitId !== unitId || usedIds.has(q.id)) continue;
        if (mapQuestionToPracticeCategory(q) !== cat) continue;

        usedIds.add(q.id);
        picked.push({
          kind: 'question',
          question: q,
          answerKey: entry.answerKey,
          unitId,
          category: cat,
          title: q.topicTag ? `${q.gameTemplate}: ${q.topicTag}` : q.gameTemplate,
        });
        taken += 1;
        if (taken >= perUnitPerCategory) break;
      }
    }
  }

  return picked;
}

export function buildHomeworkExportFilename(studentName: string, date: Date = new Date()): string {
  const safeName =
    studentName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'student';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `s404-homework-${safeName}-${year}-${month}-${day}.json`;
}

export function formatShortDate(isoTimestamp: string): string {
  const parsed = Date.parse(isoTimestamp);
  if (!Number.isFinite(parsed)) return isoTimestamp;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(parsed));
}

export function getAnswerDisplayForQuestion(questionId: string): string {
  const entry = QUESTION_ENTRY_BY_ID.get(questionId);
  if (!entry) return '';
  const { question, answerKey } = entry;
  if (question.activityType === 'multiple_choice' && question.options) {
    const idx = answerKey.correctOptionIndex ?? 0;
    return question.options[idx] ?? '';
  }
  if (question.activityType === 'true_false') {
    return answerKey.correctBoolean ? 'True' : 'False';
  }
  if (question.activityType === 'sentence_completion') {
    return answerKey.acceptedAnswers?.[0] ?? '';
  }
  if (question.activityType === 'vocab_matching' && answerKey.matchingPairs) {
    return Object.entries(answerKey.matchingPairs)
      .map(([k, v]) => `${k} → ${v}`)
      .join(' · ');
  }
  return answerKey.rubric ?? '';
}

export function formatStudentAnswerDisplay(questionId: string, rawAnswer: string): string {
  const trimmed = rawAnswer.trim();
  if (!trimmed) return '(no answer)';

  const entry = QUESTION_ENTRY_BY_ID.get(questionId);
  if (!entry) return trimmed;
  const { question } = entry;

  if (question.activityType === 'multiple_choice' && question.options) {
    const idx = Number(trimmed);
    if (Number.isInteger(idx) && idx >= 0 && idx < question.options.length) {
      const letter = String.fromCharCode(65 + idx);
      return `${letter}. ${question.options[idx]}`;
    }
  }

  if (question.activityType === 'true_false') {
    if (trimmed.toLowerCase() === 'true') return 'True';
    if (trimmed.toLowerCase() === 'false') return 'False';
  }

  if (question.activityType === 'vocab_matching') {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, string>;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const pairs = Object.entries(parsed).map(([k, v]) => `${k} → ${v}`);
        if (pairs.length > 0) return pairs.join(' · ');
      }
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

export function countUnfinishedWritingDrafts(
  state: LocalStudentState,
  practiceExercises: Array<Pick<PracticeExercise, 'id' | 'requiresTeacherReview'>>
): number {
  let count = 0;
  for (const ex of practiceExercises) {
    if (!ex.requiresTeacherReview) continue;
    const draft = state.writingDrafts[ex.id]?.trim() ?? '';
    const submitted = state.writingResponses[ex.id]?.response.trim() ?? '';
    if (draft.length > 0 && draft !== submitted) {
      count += 1;
    }
  }
  return count;
}
