import type {
  ActivityType,
  AnswerKey,
  BadgeKey,
  GameTemplateName,
  PracticeExercise,
  Question,
  QuestionDifficulty,
  QueuedBattleAnswer,
  SessionParticipant,
} from '../types/league';

export const CLASS_CODE = 'S404';
export const CLASS_NAME = 'S404 — The English League';
export const TEACHER_USERNAME = 'teacher';

export interface GameTemplateMeta {
  name: GameTemplateName;
  tagline: string;
  description: string;
  defaultActivityType: ActivityType;
  recommendedUnitId: string;
  defaultTimerSec: number;
}

export const GAME_TEMPLATES: GameTemplateMeta[] = [
  {
    name: 'Grammar Royale',
    tagline: 'Precision under pressure',
    description: 'Timed grammar, clause transformations, and reported speech rounds.',
    defaultActivityType: 'multiple_choice',
    recommendedUnitId: 'unit-7',
    defaultTimerSec: 45,
  },
  {
    name: 'Word Duel',
    tagline: 'Vocabulary precision',
    description: 'Head-to-head collocations, idioms, and word matching.',
    defaultActivityType: 'vocab_matching',
    recommendedUnitId: 'unit-9',
    defaultTimerSec: 60,
  },
  {
    name: 'Fact or Fiction',
    tagline: 'Verify the claim',
    description: 'Separate credible claims from tall tales in timed true/false rounds.',
    defaultActivityType: 'true_false',
    recommendedUnitId: 'unit-7',
    defaultTimerSec: 30,
  },
  {
    name: 'Story Builder',
    tagline: 'Creative writing',
    description: 'Build twists and short narrative endings reviewed live by the teacher.',
    defaultActivityType: 'open_ended',
    recommendedUnitId: 'unit-7',
    defaultTimerSec: 90,
  },
  {
    name: 'Save the City',
    tagline: 'Real-world dilemmas',
    description: 'Complete conditional proposals to solve city challenges.',
    defaultActivityType: 'sentence_completion',
    recommendedUnitId: 'unit-8',
    defaultTimerSec: 60,
  },
  {
    name: 'The Ad Agency',
    tagline: 'Persuasive pitch',
    description: 'Critique ads and pitch ethical campaign ideas for speaking review.',
    defaultActivityType: 'speaking_writing',
    recommendedUnitId: 'unit-9',
    defaultTimerSec: 120,
  },
  {
    name: 'Market Masters',
    tagline: 'Smart spending',
    description: 'Analyze shopping habits, pricing traps, and consumer rights.',
    defaultActivityType: 'multiple_choice',
    recommendedUnitId: 'unit-9',
    defaultTimerSec: 45,
  },
  {
    name: 'Boss Challenge',
    tagline: 'Final showdown',
    description: 'Mixed-topic challenge combining grammar, vocabulary, and argument.',
    defaultActivityType: 'sentence_completion',
    recommendedUnitId: 'unit-8',
    defaultTimerSec: 75,
  },
];

export interface BadgeMeta {
  key: BadgeKey;
  title: string;
  description: string;
}

export const BADGE_CATALOG: BadgeMeta[] = [
  {
    key: 'sherlock',
    title: 'Sherlock',
    description: 'Spotted subtle clues in Fact or Fiction and reading rounds.',
  },
  {
    key: 'grammar_master',
    title: 'Grammar Master',
    description: 'Delivered sustained accuracy across grammar challenges.',
  },
  {
    key: 'smooth_talker',
    title: 'Smooth Talker',
    description: 'Earned teacher commendation for fluent, persuasive speaking.',
  },
  {
    key: 'word_collector',
    title: 'Word Collector',
    description: 'Mastered precision vocabulary and collocation matching.',
  },
  {
    key: 'creative_mind',
    title: 'Creative Mind',
    description: 'Crafted standout writing in Story Builder or The Ad Agency.',
  },
  {
    key: 'comeback',
    title: 'Comeback',
    description: 'Turned a round around with a late-game streak.',
  },
];

const PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomPin(randomFn: () => number = Math.random): string {
  let pin = '';
  for (let i = 0; i < 6; i += 1) {
    const idx = Math.floor(randomFn() * PIN_ALPHABET.length);
    pin += PIN_ALPHABET[idx];
  }
  return pin;
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(raw: string): { valid: boolean; normalized: string; error?: string } {
  const normalized = normalizeUsername(raw);
  if (normalized.length < 2 || normalized.length > 32) {
    return { valid: false, normalized, error: 'Username must be 2–32 characters.' };
  }
  if (!/^[a-z0-9_\-]+$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Username may only contain letters, numbers, underscores (_), or hyphens (-).',
    };
  }
  return { valid: true, normalized };
}

export function isValidPassword(raw: string): { valid: boolean; error?: string } {
  if (raw.length < 4) {
    return { valid: false, error: 'Password must be at least 4 characters.' };
  }
  if (raw.length > 128) {
    return { valid: false, error: 'Password is too long.' };
  }
  return { valid: true };
}

export function computeRankTitle(xp: number): string {
  if (xp >= 2500) return 'Grandmaster';
  if (xp >= 1500) return 'Champion';
  if (xp >= 900) return 'Orator';
  if (xp >= 450) return 'Strategist';
  if (xp >= 150) return 'Apprentice';
  return 'Contender';
}

export function getNextRankProgress(xp: number): { currentRank: string; nextRank: string | null; percent: number; xpToNext: number } {
  const tiers = [
    { min: 0, title: 'Contender' },
    { min: 150, title: 'Apprentice' },
    { min: 450, title: 'Strategist' },
    { min: 900, title: 'Orator' },
    { min: 1500, title: 'Champion' },
    { min: 2500, title: 'Grandmaster' },
  ];
  let idx = 0;
  for (let i = 0; i < tiers.length; i += 1) {
    if (xp >= tiers[i].min) idx = i;
  }
  const current = tiers[idx];
  const next = tiers[idx + 1] ?? null;
  if (!next) {
    return { currentRank: current.title, nextRank: null, percent: 100, xpToNext: 0 };
  }
  const span = next.min - current.min;
  const gained = xp - current.min;
  return {
    currentRank: current.title,
    nextRank: next.title,
    percent: Math.min(100, Math.max(0, Math.round((gained / span) * 100))),
    xpToNext: Math.max(0, next.min - xp),
  };
}

export function assignTwoVsThreeTeams<T extends Pick<SessionParticipant, 'uid'>>(
  participants: T[]
): Array<T & { team: 'A' | 'B' }> {
  const count = participants.length;
  const teamACount = count === 5 ? 2 : Math.floor(count / 2);
  return participants.map((p, index) => ({
    ...p,
    team: index < teamACount ? 'A' : 'B',
  }));
}

export function buildSubmissionId(questionId: string, uid: string): string {
  return `${questionId}_${uid}`;
}

export function normalizeAnswerText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface GradeResult {
  needsManualReview: boolean;
  isCorrect: boolean;
  pointsAwarded: number;
  correctAnswerDisplay: string;
}

export function gradeSubmission(
  question: Pick<Question, 'activityType' | 'options' | 'points'>,
  answerKey: AnswerKey | undefined,
  answerPayload: string
): GradeResult {
  if (!answerKey) {
    return {
      needsManualReview: true,
      isCorrect: false,
      pointsAwarded: 0,
      correctAnswerDisplay: 'Pending teacher key',
    };
  }

  switch (question.activityType) {
    case 'multiple_choice': {
      const selectedIdx = Number(answerPayload);
      const correctIdx = answerKey.correctOptionIndex ?? -1;
      const isCorrect = Number.isInteger(selectedIdx) && selectedIdx === correctIdx;
      const correctLabel =
        question.options && correctIdx >= 0 && correctIdx < question.options.length
          ? question.options[correctIdx]
          : `Option ${correctIdx + 1}`;
      return {
        needsManualReview: false,
        isCorrect,
        pointsAwarded: isCorrect ? question.points : 0,
        correctAnswerDisplay: correctLabel,
      };
    }

    case 'true_false': {
      const normalized = normalizeAnswerText(answerPayload);
      const parsed = normalized === 'true' ? true : normalized === 'false' ? false : null;
      const expected = Boolean(answerKey.correctBoolean);
      const isCorrect = parsed !== null && parsed === expected;
      return {
        needsManualReview: false,
        isCorrect,
        pointsAwarded: isCorrect ? question.points : 0,
        correctAnswerDisplay: expected ? 'True' : 'False',
      };
    }

    case 'sentence_completion': {
      const accepted = (answerKey.acceptedAnswers ?? []).map(normalizeAnswerText);
      const given = normalizeAnswerText(answerPayload);
      const isCorrect = given.length > 0 && accepted.includes(given);
      return {
        needsManualReview: false,
        isCorrect,
        pointsAwarded: isCorrect ? question.points : 0,
        correctAnswerDisplay: (answerKey.acceptedAnswers ?? []).join(' / '),
      };
    }

    case 'vocab_matching': {
      const expectedPairs = answerKey.matchingPairs ?? {};
      const keys = Object.keys(expectedPairs);
      if (keys.length === 0) {
        return {
          needsManualReview: true,
          isCorrect: false,
          pointsAwarded: 0,
          correctAnswerDisplay: 'Teacher review',
        };
      }
      let parsed: Record<string, string> = {};
      try {
        parsed = JSON.parse(answerPayload) as Record<string, string>;
      } catch {
        parsed = {};
      }
      let matched = 0;
      for (const k of keys) {
        if (normalizeAnswerText(parsed[k] ?? '') === normalizeAnswerText(expectedPairs[k])) {
          matched += 1;
        }
      }
      const ratio = matched / keys.length;
      const isCorrect = matched === keys.length;
      const pointsAwarded = Math.round(question.points * ratio);
      const display = keys.map((k) => `${k} -> ${expectedPairs[k]}`).join('; ');
      return {
        needsManualReview: false,
        isCorrect,
        pointsAwarded,
        correctAnswerDisplay: display,
      };
    }

    case 'open_ended':
    case 'speaking_writing':
    default:
      return {
        needsManualReview: true,
        isCorrect: false,
        pointsAwarded: 0,
        correctAnswerDisplay: answerKey.rubric ?? 'Teacher-reviewed response',
      };
  }
}

export function gradePracticeSelfCheck(
  exercise: Pick<PracticeExercise, 'category' | 'correctAnswer' | 'matchingLeft' | 'matchingRight' | 'requiresTeacherReview'>,
  response: string
): { needsTeacherReview: boolean; isCorrect: boolean } {
  if (exercise.requiresTeacherReview || exercise.category === 'writing') {
    return { needsTeacherReview: true, isCorrect: false };
  }
  if (exercise.category === 'matching') {
    try {
      const expected = JSON.parse(exercise.correctAnswer ?? '{}') as Record<string, string>;
      const given = JSON.parse(response) as Record<string, string>;
      const keys = Object.keys(expected);
      if (keys.length === 0) return { needsTeacherReview: false, isCorrect: false };
      const allMatch = keys.every(
        (k) => normalizeAnswerText(given[k] ?? '') === normalizeAnswerText(expected[k])
      );
      return { needsTeacherReview: false, isCorrect: allMatch };
    } catch {
      return { needsTeacherReview: false, isCorrect: false };
    }
  }
  const accepted = (exercise.correctAnswer ?? '')
    .split('|')
    .map(normalizeAnswerText)
    .filter(Boolean);
  const normalizedResponse = normalizeAnswerText(response);
  return {
    needsTeacherReview: false,
    isCorrect: normalizedResponse.length > 0 && accepted.includes(normalizedResponse),
  };
}

export function enqueueOfflineAnswer(
  queue: QueuedBattleAnswer[],
  item: QueuedBattleAnswer
): QueuedBattleAnswer[] {
  const exists = queue.some((q) => q.submissionId === item.submissionId && q.sessionId === item.sessionId);
  if (exists) {
    return queue;
  }
  return [...queue, item];
}

export function removeQueuedAnswer(
  queue: QueuedBattleAnswer[],
  sessionId: string,
  submissionId: string
): QueuedBattleAnswer[] {
  return queue.filter((q) => !(q.sessionId === sessionId && q.submissionId === submissionId));
}

export function isValidRecordId(id: string): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(id);
}

export interface QuestionFilterCriteria {
  unitId?: string;
  gameTemplate?: string;
  difficulty?: 'all' | QuestionDifficulty;
  skillTag?: string;
  search?: string;
}

export function filterQuestions<T extends Question>(
  questions: T[],
  criteria: QuestionFilterCriteria
): T[] {
  const searchNorm = (criteria.search ?? '').trim().toLowerCase();
  return questions.filter((q) => {
    if (criteria.unitId && criteria.unitId !== 'all' && q.unitId !== criteria.unitId) {
      return false;
    }
    if (
      criteria.gameTemplate &&
      criteria.gameTemplate !== 'all' &&
      q.gameTemplate !== criteria.gameTemplate
    ) {
      return false;
    }
    if (
      criteria.difficulty &&
      criteria.difficulty !== 'all' &&
      (q.difficulty ?? 'Medium') !== criteria.difficulty
    ) {
      return false;
    }
    if (
      criteria.skillTag &&
      criteria.skillTag !== 'all' &&
      (q.skillTag ?? 'General') !== criteria.skillTag
    ) {
      return false;
    }
    if (searchNorm) {
      const haystack = [
        q.id,
        q.prompt,
        q.context ?? '',
        q.topicTag ?? '',
        q.learningObjective ?? '',
        q.skillTag ?? '',
        q.gameTemplate,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(searchNorm)) return false;
    }
    return true;
  });
}

export function pickBalancedQuestions<T extends Pick<Question, 'id' | 'difficulty'>>(
  pool: T[],
  count = 5
): string[] {
  if (pool.length <= count) return pool.map((q) => q.id);

  const buckets: Record<QuestionDifficulty, T[]> = {
    Easy: [],
    Medium: [],
    Hard: [],
  };
  for (const q of pool) {
    const diff = q.difficulty ?? 'Medium';
    buckets[diff].push(q);
  }

  const order: QuestionDifficulty[] = ['Easy', 'Medium', 'Medium', 'Hard', 'Medium'];
  const picked: string[] = [];
  const seen = new Set<string>();

  for (const diff of order) {
    if (picked.length >= count) break;
    const next = buckets[diff].find((item) => !seen.has(item.id));
    if (next) {
      seen.add(next.id);
      picked.push(next.id);
    }
  }

  for (const q of pool) {
    if (picked.length >= count) break;
    if (!seen.has(q.id)) {
      seen.add(q.id);
      picked.push(q.id);
    }
  }

  return picked;
}
