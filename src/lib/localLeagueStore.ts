import { ALL_SEEDED_QUESTIONS } from '../data/questionBank.ts';
import { INITIAL_UNITS, SAMPLE_PRACTICE_EXERCISES } from '../data/seedContent.ts';
import {
  BADGE_CATALOG,
  computeRankTitle,
  getNextRankProgress,
  gradePracticeSelfCheck,
  gradeSubmission,
} from './leagueRules.ts';
import type {
  AnswerKey,
  BadgeKey,
  PracticeExercise,
  Question,
} from '../types/league.ts';

export const HOME_STORAGE_KEY = 's404_home_state_v1';
export const HOME_STATE_SCHEMA_VERSION = 1;
export const HOMEWORK_EXPORT_APP_ID = 's404-english-league-home';
export const HOMEWORK_EXPORT_SCHEMA_VERSION = 1;
export const MAX_HOMEWORK_IMPORT_BYTES = 2 * 1024 * 1024; // 2 MB

export type UnitId = 'unit-7' | 'unit-8' | 'unit-9';
export type LastActivityKind = 'quiz' | 'practice' | 'writing' | 'review';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface LocalUnlockedBadge {
  badgeKey: BadgeKey;
  title: string;
  description: string;
  unlockedAt: string;
}

export interface LocalQuestionAttemptSummary {
  questionId: string;
  unitId: UnitId;
  lastAnswer: string;
  attemptCount: number;
  everCorrect: boolean;
  xpAwarded: number;
  lastAttemptAt: string;
}

export interface LocalIncorrectAnswer {
  questionId: string;
  unitId: UnitId;
  studentAnswer: string;
  isCorrect: boolean;
  attemptedAt: string;
  attemptCount: number;
  reviewed: boolean;
  reviewedAt?: string;
}

export interface LocalQuizItemResult {
  questionId: string;
  studentAnswer: string;
  isCorrect: boolean;
  pointsAwarded: number;
}

export interface LocalQuizRecord {
  quizId: string;
  unitId: UnitId | 'all';
  gameTemplate: string;
  score: number;
  totalQuestions: number;
  correctCount: number;
  completedAt: string;
  items: LocalQuizItemResult[];
}

export interface LocalPracticeRecord {
  exerciseId: string;
  unitId: UnitId;
  category: PracticeExercise['category'];
  title: string;
  response: string;
  selfCheckCorrect: boolean;
  needsTeacherReview: boolean;
  xpAwarded: number;
  attemptCount: number;
  submittedAt: string;
  updatedAt: string;
}

export interface LocalWritingResponse {
  itemId: string;
  source: 'practice' | 'question';
  unitId: UnitId;
  title: string;
  prompt: string;
  response: string;
  submittedAt: string;
  updatedAt: string;
}

export interface LocalLastActivity {
  kind: LastActivityKind;
  unitId?: UnitId | 'all';
  itemId?: string;
  title: string;
  timestamp: string;
}

export interface LocalStudentState {
  schemaVersion: typeof HOME_STATE_SCHEMA_VERSION;
  studentName: string;
  xp: number;
  currentStreak: number;
  bestStreak: number;
  lastPracticeDate: string | null;
  totalAnswered: number;
  correctCount: number;
  unitProgress: Record<UnitId, number>;
  unlockedBadges: LocalUnlockedBadge[];
  questionAttempts: Record<string, LocalQuestionAttemptSummary>;
  quizHistory: LocalQuizRecord[];
  practiceHistory: Record<string, LocalPracticeRecord>;
  writingDrafts: Record<string, string>;
  writingResponses: Record<string, LocalWritingResponse>;
  incorrectAnswers: Record<string, LocalIncorrectAnswer>;
  reviewedMistakeCount: number;
  lastActivity: LocalLastActivity | null;
  updatedAt: string;
}

export interface LocalStudentProgressSummary {
  studentName: string;
  xp: number;
  rankTitle: string;
  nextRank: string | null;
  rankProgressPercent: number;
  xpToNextRank: number;
  currentStreak: number;
  bestStreak: number;
  lastPracticeDate: string | null;
  totalAnswered: number;
  correctCount: number;
  accuracyPercent: number;
  unitProgress: Record<UnitId, number>;
  completedUnits: UnitId[];
  unlockedBadgeCount: number;
  pendingMistakeCount: number;
}

export type LocalLoadStatus =
  | 'ok'
  | 'empty'
  | 'corrupted'
  | 'invalid_version'
  | 'unavailable';

export interface LocalStateLoadResult {
  state: LocalStudentState;
  status: LocalLoadStatus;
  error?: string;
}

export interface LocalStateSaveResult {
  ok: boolean;
  error?: string;
}

export interface HomeworkExportPayload {
  app: typeof HOMEWORK_EXPORT_APP_ID;
  schemaVersion: typeof HOMEWORK_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  studentName: string;
  summary: {
    xp: number;
    rankTitle: string;
    currentStreak: number;
    bestStreak: number;
    lastPracticeDate: string | null;
    totalAnswered: number;
    correctCount: number;
    accuracyPercent: number;
    unitProgress: Record<UnitId, number>;
    unlockedBadges: LocalUnlockedBadge[];
  };
  practiceSubmissions: LocalPracticeRecord[];
  writingResponses: LocalWritingResponse[];
  quizHistory: LocalQuizRecord[];
  incorrectAnswers: LocalIncorrectAnswer[];
  questionAttempts: LocalQuestionAttemptSummary[];
}

export interface HomeworkValidationResult {
  ok: boolean;
  payload?: HomeworkExportPayload;
  error?: string;
}

export interface TeacherHomeworkInspection {
  studentName: string;
  exportedAt: string;
  summary: HomeworkExportPayload['summary'];
  writingResponses: LocalWritingResponse[];
  practiceSubmissions: LocalPracticeRecord[];
  quizHistory: LocalQuizRecord[];
  incorrectAnswers: LocalIncorrectAnswer[];
}

// Indexed lookups against static educational content
const KNOWN_UNIT_IDS = new Set<UnitId>(
  INITIAL_UNITS.map((u) => u.id as UnitId)
);

const QUESTION_SEED_BY_ID = new Map(
  ALL_SEEDED_QUESTIONS.map((seed) => [seed.question.id, seed])
);

const PRACTICE_BY_ID = new Map(
  SAMPLE_PRACTICE_EXERCISES.map((ex) => [ex.id, ex])
);

const BADGE_META_BY_KEY = new Map(
  BADGE_CATALOG.map((b) => [b.key, b])
);

// Unit progress assumes 20 unique mastered questions/exercises represents 100% unit mastery.
const UNIT_MASTERY_TARGET = 20;

const MAX_STUDENT_NAME_LEN = 64;
const MAX_ID_LEN = 128;
const MAX_SHORT_TEXT_LEN = 256;
const MAX_ANSWER_LEN = 5000;
const MAX_WRITING_LEN = 10000;
const MAX_NUMERIC_STAT = 1_000_000;
const MAX_STREAK = 10_000;
const MAX_HISTORY_ITEMS = 500;

function isPlainObject(val: unknown): val is Record<string, unknown> {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) {
    return false;
  }
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

function hasDangerousKeys(obj: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(obj, '__proto__') ||
    Object.prototype.hasOwnProperty.call(obj, 'constructor') ||
    Object.prototype.hasOwnProperty.call(obj, 'prototype')
  );
}

function isValidIsoTimestamp(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length < 10 || raw.length > 64) {
    return false;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed);
}

function isValidLocalDateKey(raw: unknown): raw is string {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return false;
  }
  const [y, m, d] = raw.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function getLocalDateKey(date: Date = new Date()): string | null {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getPreviousLocalDateKey(dateKey: string): string | null {
  if (!isValidLocalDateKey(dateKey)) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return getLocalDateKey(dt);
}

function safeIsoNow(now?: Date): string {
  if (now instanceof Date && !Number.isNaN(now.getTime())) {
    return now.toISOString();
  }
  return new Date().toISOString();
}

function clampNonNegativeInt(raw: unknown, max = MAX_NUMERIC_STAT): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(max, Math.floor(n));
}

function clampText(raw: unknown, maxLen: number, fallback = ''): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function normalizeUnitId(raw: unknown): UnitId | null {
  if (typeof raw === 'string' && KNOWN_UNIT_IDS.has(raw as UnitId)) {
    return raw as UnitId;
  }
  return null;
}

export function getBrowserLocalStorage(): StorageLike | null {
  try {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
      return null;
    }
    const store = globalThis.localStorage;
    if (!store || typeof store.getItem !== 'function' || typeof store.setItem !== 'function') {
      return null;
    }
    const probeKey = '__s404_storage_probe__';
    store.setItem(probeKey, '1');
    store.removeItem?.(probeKey);
    return store;
  } catch {
    return null;
  }
}

export function createDefaultLocalState(now: Date = new Date()): LocalStudentState {
  return {
    schemaVersion: HOME_STATE_SCHEMA_VERSION,
    studentName: 'Student',
    xp: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastPracticeDate: null,
    totalAnswered: 0,
    correctCount: 0,
    unitProgress: {
      'unit-7': 0,
      'unit-8': 0,
      'unit-9': 0,
    },
    unlockedBadges: [],
    questionAttempts: {},
    quizHistory: [],
    practiceHistory: {},
    writingDrafts: {},
    writingResponses: {},
    incorrectAnswers: {},
    reviewedMistakeCount: 0,
    lastActivity: null,
    updatedAt: safeIsoNow(now),
  };
}

export function normalizeLocalState(raw: unknown, now: Date = new Date()): LocalStudentState {
  const defaults = createDefaultLocalState(now);
  if (!isPlainObject(raw)) return defaults;

  const studentName = clampText(raw.studentName, MAX_STUDENT_NAME_LEN, 'Student') || 'Student';
  const xp = clampNonNegativeInt(raw.xp);
  const currentStreak = clampNonNegativeInt(raw.currentStreak, MAX_STREAK);
  const bestStreak = Math.max(currentStreak, clampNonNegativeInt(raw.bestStreak, MAX_STREAK));
  const lastPracticeDate = isValidLocalDateKey(raw.lastPracticeDate) ? raw.lastPracticeDate : null;
  const totalAnswered = clampNonNegativeInt(raw.totalAnswered);
  const correctCount = Math.min(totalAnswered, clampNonNegativeInt(raw.correctCount));
  const reviewedMistakeCount = clampNonNegativeInt(raw.reviewedMistakeCount);
  const updatedAt = isValidIsoTimestamp(raw.updatedAt) ? raw.updatedAt : safeIsoNow(now);

  const unitProgress: Record<UnitId, number> = {
    'unit-7': 0,
    'unit-8': 0,
    'unit-9': 0,
  };
  if (isPlainObject(raw.unitProgress)) {
    for (const u of KNOWN_UNIT_IDS) {
      unitProgress[u] = clampNonNegativeInt(raw.unitProgress[u], 100);
    }
  }

  const unlockedBadges: LocalUnlockedBadge[] = [];
  const seenBadges = new Set<BadgeKey>();
  if (Array.isArray(raw.unlockedBadges)) {
    for (const entry of raw.unlockedBadges) {
      if (!isPlainObject(entry)) continue;
      const meta = BADGE_META_BY_KEY.get(entry.badgeKey as BadgeKey);
      if (!meta || seenBadges.has(meta.key)) continue;
      seenBadges.add(meta.key);
      unlockedBadges.push({
        badgeKey: meta.key,
        title: meta.title,
        description: meta.description,
        unlockedAt: isValidIsoTimestamp(entry.unlockedAt) ? entry.unlockedAt : updatedAt,
      });
    }
  }

  const questionAttempts: Record<string, LocalQuestionAttemptSummary> = {};
  if (isPlainObject(raw.questionAttempts)) {
    for (const [key, val] of Object.entries(raw.questionAttempts)) {
      if (!isPlainObject(val)) continue;
      const qId = clampText(val.questionId ?? key, MAX_ID_LEN);
      const uId = normalizeUnitId(val.unitId);
      if (!qId || !uId) continue;
      questionAttempts[qId] = {
        questionId: qId,
        unitId: uId,
        lastAnswer: clampText(val.lastAnswer, MAX_ANSWER_LEN),
        attemptCount: Math.max(1, clampNonNegativeInt(val.attemptCount)),
        everCorrect: Boolean(val.everCorrect),
        xpAwarded: clampNonNegativeInt(val.xpAwarded, 10000),
        lastAttemptAt: isValidIsoTimestamp(val.lastAttemptAt) ? val.lastAttemptAt : updatedAt,
      };
    }
  }

  const quizHistory: LocalQuizRecord[] = [];
  if (Array.isArray(raw.quizHistory)) {
    for (const item of raw.quizHistory.slice(0, MAX_HISTORY_ITEMS)) {
      if (!isPlainObject(item)) continue;
      const quizId = clampText(item.quizId, MAX_ID_LEN);
      const uId = item.unitId === 'all' ? 'all' : normalizeUnitId(item.unitId);
      if (!quizId || !uId) continue;
      const parsedItems: LocalQuizItemResult[] = [];
      if (Array.isArray(item.items)) {
        for (const sub of item.items.slice(0, 100)) {
          if (!isPlainObject(sub)) continue;
          const qId = clampText(sub.questionId, MAX_ID_LEN);
          if (!qId) continue;
          parsedItems.push({
            questionId: qId,
            studentAnswer: clampText(sub.studentAnswer, MAX_ANSWER_LEN),
            isCorrect: Boolean(sub.isCorrect),
            pointsAwarded: clampNonNegativeInt(sub.pointsAwarded, 10000),
          });
        }
      }
      quizHistory.push({
        quizId,
        unitId: uId,
        gameTemplate: clampText(item.gameTemplate, MAX_SHORT_TEXT_LEN, 'Solo Quiz') || 'Solo Quiz',
        score: clampNonNegativeInt(item.score),
        totalQuestions: clampNonNegativeInt(item.totalQuestions, 500),
        correctCount: clampNonNegativeInt(item.correctCount, 500),
        completedAt: isValidIsoTimestamp(item.completedAt) ? item.completedAt : updatedAt,
        items: parsedItems,
      });
    }
  }

  const practiceHistory: Record<string, LocalPracticeRecord> = {};
  if (isPlainObject(raw.practiceHistory)) {
    for (const [key, val] of Object.entries(raw.practiceHistory)) {
      if (!isPlainObject(val)) continue;
      const exId = clampText(val.exerciseId ?? key, MAX_ID_LEN);
      const uId = normalizeUnitId(val.unitId);
      if (!exId || !uId) continue;
      const validCats: PracticeExercise['category'][] = [
        'vocabulary',
        'grammar',
        'sentence_completion',
        'matching',
        'reading',
        'writing',
      ];
      const cat = validCats.includes(val.category as PracticeExercise['category'])
        ? (val.category as PracticeExercise['category'])
        : 'vocabulary';
      practiceHistory[exId] = {
        exerciseId: exId,
        unitId: uId,
        category: cat,
        title: clampText(val.title, MAX_SHORT_TEXT_LEN, exId),
        response: clampText(val.response, MAX_WRITING_LEN),
        selfCheckCorrect: Boolean(val.selfCheckCorrect),
        needsTeacherReview: Boolean(val.needsTeacherReview),
        xpAwarded: clampNonNegativeInt(val.xpAwarded, 1000),
        attemptCount: Math.max(1, clampNonNegativeInt(val.attemptCount)),
        submittedAt: isValidIsoTimestamp(val.submittedAt) ? val.submittedAt : updatedAt,
        updatedAt: isValidIsoTimestamp(val.updatedAt) ? val.updatedAt : updatedAt,
      };
    }
  }

  const writingDrafts: Record<string, string> = {};
  if (isPlainObject(raw.writingDrafts)) {
    for (const [k, v] of Object.entries(raw.writingDrafts)) {
      if (typeof v === 'string' && k.length > 0 && k.length <= MAX_ID_LEN) {
        writingDrafts[k] = v.slice(0, MAX_WRITING_LEN);
      }
    }
  }

  const writingResponses: Record<string, LocalWritingResponse> = {};
  if (isPlainObject(raw.writingResponses)) {
    for (const [key, val] of Object.entries(raw.writingResponses)) {
      if (!isPlainObject(val)) continue;
      const itemId = clampText(val.itemId ?? key, MAX_ID_LEN);
      const uId = normalizeUnitId(val.unitId);
      if (!itemId || !uId) continue;
      writingResponses[itemId] = {
        itemId,
        source: val.source === 'question' ? 'question' : 'practice',
        unitId: uId,
        title: clampText(val.title, MAX_SHORT_TEXT_LEN, itemId),
        prompt: clampText(val.prompt, 2000),
        response: clampText(val.response, MAX_WRITING_LEN),
        submittedAt: isValidIsoTimestamp(val.submittedAt) ? val.submittedAt : updatedAt,
        updatedAt: isValidIsoTimestamp(val.updatedAt) ? val.updatedAt : updatedAt,
      };
    }
  }

  const incorrectAnswers: Record<string, LocalIncorrectAnswer> = {};
  if (isPlainObject(raw.incorrectAnswers)) {
    for (const [key, val] of Object.entries(raw.incorrectAnswers)) {
      if (!isPlainObject(val)) continue;
      const qId = clampText(val.questionId ?? key, MAX_ID_LEN);
      const uId = normalizeUnitId(val.unitId);
      if (!qId || !uId) continue;
      incorrectAnswers[qId] = {
        questionId: qId,
        unitId: uId,
        studentAnswer: clampText(val.studentAnswer, MAX_ANSWER_LEN),
        isCorrect: Boolean(val.isCorrect),
        attemptedAt: isValidIsoTimestamp(val.attemptedAt) ? val.attemptedAt : updatedAt,
        attemptCount: Math.max(1, clampNonNegativeInt(val.attemptCount)),
        reviewed: Boolean(val.reviewed),
        reviewedAt: isValidIsoTimestamp(val.reviewedAt) ? val.reviewedAt : undefined,
      };
    }
  }

  let lastActivity: LocalLastActivity | null = null;
  if (isPlainObject(raw.lastActivity)) {
    const validKinds: LastActivityKind[] = ['quiz', 'practice', 'writing', 'review'];
    const kind = validKinds.includes(raw.lastActivity.kind as LastActivityKind)
      ? (raw.lastActivity.kind as LastActivityKind)
      : 'practice';
    const rawUnit = raw.lastActivity.unitId;
    const unitId = rawUnit === 'all' ? 'all' : normalizeUnitId(rawUnit) ?? undefined;
    lastActivity = {
      kind,
      unitId,
      itemId: clampText(raw.lastActivity.itemId, MAX_ID_LEN) || undefined,
      title: clampText(raw.lastActivity.title, MAX_SHORT_TEXT_LEN, 'English Study'),
      timestamp: isValidIsoTimestamp(raw.lastActivity.timestamp)
        ? raw.lastActivity.timestamp
        : updatedAt,
    };
  }

  const state: LocalStudentState = {
    schemaVersion: HOME_STATE_SCHEMA_VERSION,
    studentName,
    xp,
    currentStreak,
    bestStreak,
    lastPracticeDate,
    totalAnswered,
    correctCount,
    unitProgress,
    unlockedBadges,
    questionAttempts,
    quizHistory,
    practiceHistory,
    writingDrafts,
    writingResponses,
    incorrectAnswers,
    reviewedMistakeCount,
    lastActivity,
    updatedAt,
  };

  return {
    ...state,
    unitProgress: recomputeUnitProgress(state),
  };
}

export function loadLocalState(
  storage: StorageLike | null = getBrowserLocalStorage(),
  now: Date = new Date()
): LocalStateLoadResult {
  if (!storage) {
    return {
      state: createDefaultLocalState(now),
      status: 'unavailable',
      error: 'Browser localStorage is unavailable. Progress will not persist after closing this tab.',
    };
  }

  let rawText: string | null = null;
  try {
    rawText = storage.getItem(HOME_STORAGE_KEY);
  } catch {
    return {
      state: createDefaultLocalState(now),
      status: 'unavailable',
      error: 'Unable to read from browser localStorage.',
    };
  }

  if (rawText === null || rawText.trim() === '') {
    return {
      state: createDefaultLocalState(now),
      status: 'empty',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      state: createDefaultLocalState(now),
      status: 'corrupted',
      error: 'Saved browser progress could not be parsed. Existing data was not overwritten.',
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      state: createDefaultLocalState(now),
      status: 'corrupted',
      error: 'Saved browser progress has an unexpected format. Existing data was not overwritten.',
    };
  }

  if (parsed.schemaVersion !== HOME_STATE_SCHEMA_VERSION) {
    return {
      state: createDefaultLocalState(now),
      status: 'invalid_version',
      error: `Unsupported local state schema version (${String(parsed.schemaVersion)}).`,
    };
  }

  return {
    state: normalizeLocalState(parsed, now),
    status: 'ok',
  };
}

export function saveLocalState(
  state: LocalStudentState,
  storage: StorageLike | null = getBrowserLocalStorage()
): LocalStateSaveResult {
  if (!storage) {
    return {
      ok: false,
      error: 'Browser localStorage is unavailable. Unable to save progress.',
    };
  }

  try {
    const serialized = JSON.stringify(state);
    storage.setItem(HOME_STORAGE_KEY, serialized);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Unable to save progress locally: ${err.message}`
          : 'Unable to save progress locally (storage may be full or disabled).',
    };
  }
}

export function recomputeUnitProgress(state: LocalStudentState): Record<UnitId, number> {
  const counts: Record<UnitId, number> = {
    'unit-7': 0,
    'unit-8': 0,
    'unit-9': 0,
  };

  const seenMasteredIds = new Set<string>();
  for (const att of Object.values(state.questionAttempts)) {
    if (att.everCorrect && KNOWN_UNIT_IDS.has(att.unitId) && !seenMasteredIds.has(att.questionId)) {
      seenMasteredIds.add(att.questionId);
      counts[att.unitId] += 1;
    }
  }
  for (const prac of Object.values(state.practiceHistory)) {
    if (
      (prac.selfCheckCorrect || prac.needsTeacherReview) &&
      KNOWN_UNIT_IDS.has(prac.unitId) &&
      !seenMasteredIds.has(prac.exerciseId)
    ) {
      seenMasteredIds.add(prac.exerciseId);
      counts[prac.unitId] += 1;
    }
  }

  return {
    'unit-7': Math.min(100, Math.round((counts['unit-7'] / UNIT_MASTERY_TARGET) * 100)),
    'unit-8': Math.min(100, Math.round((counts['unit-8'] / UNIT_MASTERY_TARGET) * 100)),
    'unit-9': Math.min(100, Math.round((counts['unit-9'] / UNIT_MASTERY_TARGET) * 100)),
  };
}

export function applyDailyStreak(state: LocalStudentState, now: Date = new Date()): LocalStudentState {
  const todayKey = getLocalDateKey(now);
  if (!todayKey) {
    return state;
  }

  const prevDate = state.lastPracticeDate;
  if (prevDate && prevDate > todayKey) {
    // Ignore out-of-order past timestamps so clock skew does not reset a valid streak
    return state;
  }

  let nextStreak = state.currentStreak;
  if (prevDate === todayKey) {
    nextStreak = Math.max(1, state.currentStreak);
  } else {
    const yesterdayKey = getPreviousLocalDateKey(todayKey);
    if (prevDate && yesterdayKey && prevDate === yesterdayKey) {
      nextStreak = state.currentStreak + 1;
    } else {
      nextStreak = 1;
    }
  }

  return {
    ...state,
    currentStreak: nextStreak,
    bestStreak: Math.max(state.bestStreak, nextStreak),
    lastPracticeDate: todayKey,
  };
}

export function evaluateBadgeMilestones(
  state: LocalStudentState,
  now: Date = new Date()
): LocalStudentState {
  const unlockedKeys = new Set(state.unlockedBadges.map((b) => b.badgeKey));
  const ts = safeIsoNow(now);
  const newlyUnlocked: LocalUnlockedBadge[] = [];

  let sherlockCorrect = 0;
  let grammarCorrect = 0;
  let wordCorrect = 0;
  let speakingCompleted = 0;

  for (const att of Object.values(state.questionAttempts)) {
    if (!att.everCorrect) continue;
    const seed = QUESTION_SEED_BY_ID.get(att.questionId);
    const q = seed?.question;
    if (!q) continue;

    if (q.activityType === 'true_false' || q.skillTag === 'Reading') {
      sherlockCorrect += 1;
    }
    if (q.skillTag === 'Grammar') {
      grammarCorrect += 1;
    }
    if (q.skillTag === 'Vocabulary' || q.activityType === 'vocab_matching') {
      wordCorrect += 1;
    }
    if (q.skillTag === 'Speaking' || q.gameTemplate === 'The Ad Agency') {
      speakingCompleted += 1;
    }
  }

  for (const prac of Object.values(state.practiceHistory)) {
    if (!prac.selfCheckCorrect) continue;
    if (prac.category === 'reading') sherlockCorrect += 1;
    if (prac.category === 'grammar' || prac.category === 'sentence_completion') grammarCorrect += 1;
    if (prac.category === 'vocabulary' || prac.category === 'matching') wordCorrect += 1;
  }

  const writingCount = Object.keys(state.writingResponses).length;

  const qualifies: Record<BadgeKey, boolean> = {
    sherlock: sherlockCorrect >= 3,
    grammar_master: grammarCorrect >= 5,
    word_collector: wordCorrect >= 3,
    creative_mind: writingCount >= 1,
    smooth_talker: state.bestStreak >= 3 || speakingCompleted >= 3,
    comeback: state.reviewedMistakeCount >= 1,
  };

  for (const badge of BADGE_CATALOG) {
    if (!unlockedKeys.has(badge.key) && qualifies[badge.key]) {
      newlyUnlocked.push({
        badgeKey: badge.key,
        title: badge.title,
        description: badge.description,
        unlockedAt: ts,
      });
    }
  }

  if (newlyUnlocked.length === 0) return state;

  return {
    ...state,
    unlockedBadges: [...state.unlockedBadges, ...newlyUnlocked],
  };
}

export function updateStudentDisplayName(
  state: LocalStudentState,
  name: string,
  now: Date = new Date()
): LocalStudentState {
  const cleaned = clampText(name, MAX_STUDENT_NAME_LEN, 'Student') || 'Student';
  return {
    ...state,
    studentName: cleaned,
    updatedAt: safeIsoNow(now),
  };
}

export function awardLocalXp(
  state: LocalStudentState,
  pointsDelta: number,
  now: Date = new Date()
): LocalStudentState {
  const safeDelta = Number.isFinite(pointsDelta) ? Math.round(pointsDelta) : 0;
  const nextXp = Math.max(0, Math.min(MAX_NUMERIC_STAT, state.xp + safeDelta));
  return {
    ...state,
    xp: nextXp,
    updatedAt: safeIsoNow(now),
  };
}

export function recordQuestionAttempt(
  state: LocalStudentState,
  params: {
    questionId: string;
    answerPayload: string;
    questionOverride?: Question;
    answerKeyOverride?: AnswerKey;
    now?: Date;
  }
): {
  state: LocalStudentState;
  isCorrect: boolean;
  needsManualReview: boolean;
  pointsAwarded: number;
  xpEarnedDelta: number;
  correctAnswerDisplay: string;
  explanation: string;
} {
  const now = params.now ?? new Date();
  const ts = safeIsoNow(now);
  const seed = QUESTION_SEED_BY_ID.get(params.questionId);
  const question = params.questionOverride ?? seed?.question;
  const answerKey: AnswerKey | undefined =
    params.answerKeyOverride ??
    (seed?.answerKey ? { ...seed.answerKey, updatedAt: null } : undefined);

  if (!question) {
    throw new Error(`Unknown question ID: ${params.questionId}`);
  }

  const unitId = normalizeUnitId(question.unitId) ?? 'unit-7';
  const payload = clampText(params.answerPayload, MAX_ANSWER_LEN);
  const graded = gradeSubmission(question, answerKey, payload);
  const prevAttempt = state.questionAttempts[question.id];

  // Prevent duplicate XP rewards when re-answering an already-rewarded question
  let xpEarnedDelta = 0;
  if (!graded.needsManualReview && graded.pointsAwarded > 0) {
    const prevBestXp = prevAttempt?.xpAwarded ?? 0;
    if (graded.pointsAwarded > prevBestXp) {
      xpEarnedDelta = graded.pointsAwarded - prevBestXp;
    }
  }

  const nextAttempt: LocalQuestionAttemptSummary = {
    questionId: question.id,
    unitId,
    lastAnswer: payload,
    attemptCount: (prevAttempt?.attemptCount ?? 0) + 1,
    everCorrect: Boolean(prevAttempt?.everCorrect) || graded.isCorrect,
    xpAwarded: Math.max(prevAttempt?.xpAwarded ?? 0, graded.pointsAwarded),
    lastAttemptAt: ts,
  };

  const nextIncorrect = { ...state.incorrectAnswers };
  let reviewedMistakeDelta = 0;
  if (!graded.needsManualReview) {
    if (!graded.isCorrect) {
      const prevMiss = nextIncorrect[question.id];
      nextIncorrect[question.id] = {
        questionId: question.id,
        unitId,
        studentAnswer: payload,
        isCorrect: false,
        attemptedAt: ts,
        attemptCount: (prevMiss?.attemptCount ?? 0) + 1,
        reviewed: false,
      };
    } else if (nextIncorrect[question.id] && !nextIncorrect[question.id].reviewed) {
      nextIncorrect[question.id] = {
        ...nextIncorrect[question.id],
        isCorrect: true,
        reviewed: true,
        reviewedAt: ts,
      };
      reviewedMistakeDelta = 1;
    }
  }

  const nextWritingResponses = { ...state.writingResponses };
  if (graded.needsManualReview && payload.length > 0) {
    const prevWriting = nextWritingResponses[question.id];
    nextWritingResponses[question.id] = {
      itemId: question.id,
      source: 'question',
      unitId,
      title: `${question.gameTemplate} — ${question.topicTag ?? 'Writing'}`,
      prompt: question.prompt,
      response: payload,
      submittedAt: prevWriting?.submittedAt ?? ts,
      updatedAt: ts,
    };
  }

  let nextState: LocalStudentState = {
    ...state,
    xp: Math.min(MAX_NUMERIC_STAT, state.xp + xpEarnedDelta),
    totalAnswered: state.totalAnswered + (graded.needsManualReview ? 0 : 1),
    correctCount: state.correctCount + (!graded.needsManualReview && graded.isCorrect ? 1 : 0),
    questionAttempts: {
      ...state.questionAttempts,
      [question.id]: nextAttempt,
    },
    incorrectAnswers: nextIncorrect,
    writingResponses: nextWritingResponses,
    reviewedMistakeCount: state.reviewedMistakeCount + reviewedMistakeDelta,
    lastActivity: {
      kind: graded.needsManualReview ? 'writing' : 'quiz',
      unitId,
      itemId: question.id,
      title: question.gameTemplate,
      timestamp: ts,
    },
    updatedAt: ts,
  };

  nextState = applyDailyStreak(nextState, now);
  nextState = {
    ...nextState,
    unitProgress: recomputeUnitProgress(nextState),
  };
  nextState = evaluateBadgeMilestones(nextState, now);

  return {
    state: nextState,
    isCorrect: graded.isCorrect,
    needsManualReview: graded.needsManualReview,
    pointsAwarded: graded.pointsAwarded,
    xpEarnedDelta,
    correctAnswerDisplay: graded.correctAnswerDisplay,
    explanation: answerKey?.explanation ?? '',
  };
}

export function recordCompletedQuiz(
  state: LocalStudentState,
  params: {
    quizId?: string;
    unitId: UnitId | 'all';
    gameTemplate: string;
    items: Array<{ questionId: string; answerPayload: string }>;
    now?: Date;
  }
): {
  state: LocalStudentState;
  quizRecord: LocalQuizRecord;
  xpEarnedDelta: number;
} {
  const now = params.now ?? new Date();
  const ts = safeIsoNow(now);
  const quizId = clampText(params.quizId ?? `quiz_${now.getTime()}`, MAX_ID_LEN);

  let nextState = state;
  let totalScore = 0;
  let correctCount = 0;
  let totalXpDelta = 0;
  const itemResults: LocalQuizItemResult[] = [];

  for (const item of params.items) {
    const res = recordQuestionAttempt(nextState, {
      questionId: item.questionId,
      answerPayload: item.answerPayload,
      now,
    });
    nextState = res.state;
    totalScore += res.pointsAwarded;
    totalXpDelta += res.xpEarnedDelta;
    if (res.isCorrect) correctCount += 1;
    itemResults.push({
      questionId: item.questionId,
      studentAnswer: clampText(item.answerPayload, MAX_ANSWER_LEN),
      isCorrect: res.isCorrect,
      pointsAwarded: res.pointsAwarded,
    });
  }

  const quizRecord: LocalQuizRecord = {
    quizId,
    unitId: params.unitId,
    gameTemplate: clampText(params.gameTemplate, MAX_SHORT_TEXT_LEN, 'Solo Quiz') || 'Solo Quiz',
    score: totalScore,
    totalQuestions: itemResults.length,
    correctCount,
    completedAt: ts,
    items: itemResults,
  };

  nextState = {
    ...nextState,
    quizHistory: [quizRecord, ...nextState.quizHistory].slice(0, MAX_HISTORY_ITEMS),
    lastActivity: {
      kind: 'quiz',
      unitId: params.unitId,
      itemId: quizId,
      title: quizRecord.gameTemplate,
      timestamp: ts,
    },
    updatedAt: ts,
  };

  return {
    state: nextState,
    quizRecord,
    xpEarnedDelta: totalXpDelta,
  };
}

export function recordPracticeCompletion(
  state: LocalStudentState,
  params: {
    exerciseId: string;
    response: string;
    exerciseOverride?: PracticeExercise;
    now?: Date;
  }
): {
  state: LocalStudentState;
  record: LocalPracticeRecord;
  xpEarnedDelta: number;
} {
  const now = params.now ?? new Date();
  const ts = safeIsoNow(now);
  const exercise = params.exerciseOverride ?? PRACTICE_BY_ID.get(params.exerciseId);
  if (!exercise) {
    throw new Error(`Unknown practice exercise ID: ${params.exerciseId}`);
  }

  const unitId = normalizeUnitId(exercise.unitId) ?? 'unit-7';
  const cleanedResponse = clampText(params.response, MAX_WRITING_LEN);
  if (!cleanedResponse) {
    throw new Error('Enter a response before submitting.');
  }

  const checked = gradePracticeSelfCheck(exercise, cleanedResponse);
  const prev = state.practiceHistory[exercise.id];

  // Award practice XP only once upon first correct self-check; writing waits for teacher review
  let xpEarnedDelta = 0;
  if (!checked.needsTeacherReview && checked.isCorrect && !(prev && prev.xpAwarded > 0)) {
    xpEarnedDelta = clampNonNegativeInt(exercise.suggestedXp, 1000);
  }

  const record: LocalPracticeRecord = {
    exerciseId: exercise.id,
    unitId,
    category: exercise.category,
    title: exercise.title,
    response: cleanedResponse,
    selfCheckCorrect: checked.isCorrect,
    needsTeacherReview: checked.needsTeacherReview,
    xpAwarded: Math.max(prev?.xpAwarded ?? 0, xpEarnedDelta),
    attemptCount: (prev?.attemptCount ?? 0) + 1,
    submittedAt: prev?.submittedAt ?? ts,
    updatedAt: ts,
  };

  const nextWritingResponses = { ...state.writingResponses };
  if (checked.needsTeacherReview) {
    const prevWriting = nextWritingResponses[exercise.id];
    nextWritingResponses[exercise.id] = {
      itemId: exercise.id,
      source: 'practice',
      unitId,
      title: exercise.title,
      prompt: exercise.prompt,
      response: cleanedResponse,
      submittedAt: prevWriting?.submittedAt ?? ts,
      updatedAt: ts,
    };
  }

  const nextDrafts = { ...state.writingDrafts };
  if (checked.needsTeacherReview) {
    nextDrafts[exercise.id] = cleanedResponse;
  }

  let nextState: LocalStudentState = {
    ...state,
    xp: Math.min(MAX_NUMERIC_STAT, state.xp + xpEarnedDelta),
    totalAnswered: state.totalAnswered + (checked.needsTeacherReview ? 0 : 1),
    correctCount: state.correctCount + (!checked.needsTeacherReview && checked.isCorrect ? 1 : 0),
    practiceHistory: {
      ...state.practiceHistory,
      [exercise.id]: record,
    },
    writingDrafts: nextDrafts,
    writingResponses: nextWritingResponses,
    lastActivity: {
      kind: checked.needsTeacherReview ? 'writing' : 'practice',
      unitId,
      itemId: exercise.id,
      title: exercise.title,
      timestamp: ts,
    },
    updatedAt: ts,
  };

  nextState = applyDailyStreak(nextState, now);
  nextState = {
    ...nextState,
    unitProgress: recomputeUnitProgress(nextState),
  };
  nextState = evaluateBadgeMilestones(nextState, now);

  return {
    state: nextState,
    record,
    xpEarnedDelta,
  };
}

export function saveWritingDraft(
  state: LocalStudentState,
  itemId: string,
  draftText: string,
  now: Date = new Date()
): LocalStudentState {
  const id = clampText(itemId, MAX_ID_LEN);
  if (!id) return state;
  return {
    ...state,
    writingDrafts: {
      ...state.writingDrafts,
      [id]: draftText.slice(0, MAX_WRITING_LEN),
    },
    updatedAt: safeIsoNow(now),
  };
}

export function recordWritingResponse(
  state: LocalStudentState,
  params: {
    itemId: string;
    response: string;
    source?: 'practice' | 'question';
    unitId?: UnitId;
    title?: string;
    prompt?: string;
    now?: Date;
  }
): LocalStudentState {
  const now = params.now ?? new Date();
  const ts = safeIsoNow(now);
  const cleaned = clampText(params.response, MAX_WRITING_LEN);
  if (!cleaned) {
    throw new Error('Enter a writing response before saving.');
  }

  const practiceMatch = PRACTICE_BY_ID.get(params.itemId);
  if (practiceMatch) {
    return recordPracticeCompletion(state, {
      exerciseId: practiceMatch.id,
      response: cleaned,
      now,
    }).state;
  }

  const questionMatch = QUESTION_SEED_BY_ID.get(params.itemId)?.question;
  if (questionMatch) {
    return recordQuestionAttempt(state, {
      questionId: questionMatch.id,
      answerPayload: cleaned,
      now,
    }).state;
  }

  const unitId = params.unitId && KNOWN_UNIT_IDS.has(params.unitId) ? params.unitId : 'unit-7';
  const prev = state.writingResponses[params.itemId];
  let nextState: LocalStudentState = {
    ...state,
    writingDrafts: {
      ...state.writingDrafts,
      [params.itemId]: cleaned,
    },
    writingResponses: {
      ...state.writingResponses,
      [params.itemId]: {
        itemId: clampText(params.itemId, MAX_ID_LEN),
        source: params.source ?? 'practice',
        unitId,
        title: clampText(params.title, MAX_SHORT_TEXT_LEN, 'Writing Task'),
        prompt: clampText(params.prompt, 2000),
        response: cleaned,
        submittedAt: prev?.submittedAt ?? ts,
        updatedAt: ts,
      },
    },
    lastActivity: {
      kind: 'writing',
      unitId,
      itemId: clampText(params.itemId, MAX_ID_LEN),
      title: clampText(params.title, MAX_SHORT_TEXT_LEN, 'Writing Task'),
      timestamp: ts,
    },
    updatedAt: ts,
  };

  nextState = applyDailyStreak(nextState, now);
  nextState = evaluateBadgeMilestones(nextState, now);
  return nextState;
}

export function clearReviewedMistake(
  state: LocalStudentState,
  questionId: string,
  now: Date = new Date()
): LocalStudentState {
  const existing = state.incorrectAnswers[questionId];
  if (!existing) return state;

  const ts = safeIsoNow(now);
  const nextIncorrect = { ...state.incorrectAnswers };
  delete nextIncorrect[questionId];

  let nextState: LocalStudentState = {
    ...state,
    incorrectAnswers: nextIncorrect,
    reviewedMistakeCount: existing.reviewed
      ? state.reviewedMistakeCount
      : state.reviewedMistakeCount + 1,
    lastActivity: {
      kind: 'review',
      unitId: existing.unitId,
      itemId: questionId,
      title: 'Mistake Review',
      timestamp: ts,
    },
    updatedAt: ts,
  };

  nextState = evaluateBadgeMilestones(nextState, now);
  return nextState;
}

export function getStudentProgressSummary(state: LocalStudentState): LocalStudentProgressSummary {
  const rankInfo = getNextRankProgress(state.xp);
  const accuracyPercent =
    state.totalAnswered > 0
      ? Math.min(100, Math.round((state.correctCount / state.totalAnswered) * 100))
      : 0;
  const completedUnits = (Object.keys(state.unitProgress) as UnitId[]).filter(
    (u) => state.unitProgress[u] >= 100
  );
  const pendingMistakeCount = Object.values(state.incorrectAnswers).filter(
    (m) => !m.reviewed
  ).length;

  return {
    studentName: state.studentName,
    xp: state.xp,
    rankTitle: rankInfo.currentRank,
    nextRank: rankInfo.nextRank,
    rankProgressPercent: rankInfo.percent,
    xpToNextRank: rankInfo.xpToNext,
    currentStreak: state.currentStreak,
    bestStreak: state.bestStreak,
    lastPracticeDate: state.lastPracticeDate,
    totalAnswered: state.totalAnswered,
    correctCount: state.correctCount,
    accuracyPercent,
    unitProgress: state.unitProgress,
    completedUnits,
    unlockedBadgeCount: state.unlockedBadges.length,
    pendingMistakeCount,
  };
}

export function exportHomeworkPayload(
  state: LocalStudentState,
  now: Date = new Date()
): HomeworkExportPayload {
  const summary = getStudentProgressSummary(state);
  return {
    app: HOMEWORK_EXPORT_APP_ID,
    schemaVersion: HOMEWORK_EXPORT_SCHEMA_VERSION,
    exportedAt: safeIsoNow(now),
    studentName: summary.studentName,
    summary: {
      xp: summary.xp,
      rankTitle: computeRankTitle(summary.xp),
      currentStreak: summary.currentStreak,
      bestStreak: summary.bestStreak,
      lastPracticeDate: summary.lastPracticeDate,
      totalAnswered: summary.totalAnswered,
      correctCount: summary.correctCount,
      accuracyPercent: summary.accuracyPercent,
      unitProgress: { ...summary.unitProgress },
      unlockedBadges: state.unlockedBadges.map((b) => ({ ...b })),
    },
    practiceSubmissions: Object.values(state.practiceHistory).map((p) => ({ ...p })),
    writingResponses: Object.values(state.writingResponses).map((w) => ({ ...w })),
    quizHistory: state.quizHistory.map((q) => ({
      ...q,
      items: q.items.map((item) => ({ ...item })),
    })),
    incorrectAnswers: Object.values(state.incorrectAnswers).map((m) => ({ ...m })),
    questionAttempts: Object.values(state.questionAttempts).map((a) => ({ ...a })),
  };
}

function failValidation(error: string): HomeworkValidationResult {
  return { ok: false, error };
}

function validateKnownQuestionOrExercise(id: string, kind: 'question' | 'exercise'): boolean {
  if (kind === 'question') return QUESTION_SEED_BY_ID.has(id);
  return PRACTICE_BY_ID.has(id);
}

export function parseAndValidateHomeworkImport(rawJson: string): HomeworkValidationResult {
  if (typeof rawJson !== 'string' || rawJson.trim().length === 0) {
    return failValidation('Import file is empty.');
  }

  const byteLength = new TextEncoder().encode(rawJson).length;
  if (byteLength > MAX_HOMEWORK_IMPORT_BYTES) {
    return failValidation('Import file exceeds the 2 MB maximum size limit.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return failValidation('Import file is not valid JSON.');
  }

  if (!isPlainObject(parsed) || hasDangerousKeys(parsed)) {
    return failValidation('Import file must be a plain JSON object.');
  }

  if (parsed.app !== HOMEWORK_EXPORT_APP_ID) {
    return failValidation('Unrecognized file format (invalid S404 Home Edition identifier).');
  }

  if (parsed.schemaVersion !== HOMEWORK_EXPORT_SCHEMA_VERSION) {
    return failValidation(`Unsupported homework schema version (${String(parsed.schemaVersion)}).`);
  }

  if (!isValidIsoTimestamp(parsed.exportedAt)) {
    return failValidation('Invalid export timestamp.');
  }

  if (typeof parsed.studentName !== 'string' || parsed.studentName.trim().length === 0) {
    return failValidation('Missing student name.');
  }
  if (parsed.studentName.trim().length > MAX_STUDENT_NAME_LEN) {
    return failValidation('Student name exceeds maximum length.');
  }
  const studentName = parsed.studentName.trim();

  if (!isPlainObject(parsed.summary) || hasDangerousKeys(parsed.summary)) {
    return failValidation('Missing or invalid progress summary.');
  }
  const s = parsed.summary;

  const numericChecks: Array<[string, unknown, number]> = [
    ['xp', s.xp, MAX_NUMERIC_STAT],
    ['currentStreak', s.currentStreak, MAX_STREAK],
    ['bestStreak', s.bestStreak, MAX_STREAK],
    ['totalAnswered', s.totalAnswered, MAX_NUMERIC_STAT],
    ['correctCount', s.correctCount, MAX_NUMERIC_STAT],
    ['accuracyPercent', s.accuracyPercent, 100],
  ];
  for (const [label, val, max] of numericChecks) {
    if (typeof val !== 'number' || !Number.isFinite(val) || val < 0 || val > max) {
      return failValidation(`Invalid numeric summary value for ${label}.`);
    }
  }

  if (s.lastPracticeDate !== null && !isValidLocalDateKey(s.lastPracticeDate)) {
    return failValidation('Invalid lastPracticeDate in summary.');
  }

  if (!isPlainObject(s.unitProgress) || hasDangerousKeys(s.unitProgress)) {
    return failValidation('Invalid unitProgress object in summary.');
  }
  const unitProgress: Record<UnitId, number> = { 'unit-7': 0, 'unit-8': 0, 'unit-9': 0 };
  for (const key of Object.keys(s.unitProgress)) {
    const unitId = normalizeUnitId(key);
    if (!unitId) {
      return failValidation(`Unknown unit ID in unitProgress: ${key}`);
    }
    const pct = s.unitProgress[key];
    if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      return failValidation(`Invalid percentage for ${unitId}.`);
    }
    unitProgress[unitId] = Math.round(pct);
  }

  if (!Array.isArray(s.unlockedBadges)) {
    return failValidation('Invalid unlockedBadges array.');
  }
  const unlockedBadges: LocalUnlockedBadge[] = [];
  for (const b of s.unlockedBadges) {
    if (!isPlainObject(b) || hasDangerousKeys(b)) {
      return failValidation('Malformed badge entry.');
    }
    const meta = BADGE_META_BY_KEY.get(b.badgeKey as BadgeKey);
    if (!meta) {
      return failValidation(`Unknown badge key: ${String(b.badgeKey)}`);
    }
    if (!isValidIsoTimestamp(b.unlockedAt)) {
      return failValidation(`Invalid timestamp on badge ${meta.key}.`);
    }
    unlockedBadges.push({
      badgeKey: meta.key,
      title: meta.title,
      description: meta.description,
      unlockedAt: b.unlockedAt,
    });
  }

  if (!Array.isArray(parsed.practiceSubmissions)) {
    return failValidation('Invalid practiceSubmissions array.');
  }
  const practiceSubmissions: LocalPracticeRecord[] = [];
  for (const item of parsed.practiceSubmissions.slice(0, MAX_HISTORY_ITEMS)) {
    if (!isPlainObject(item) || hasDangerousKeys(item)) {
      return failValidation('Malformed practice submission entry.');
    }
    if (typeof item.exerciseId !== 'string' || !validateKnownQuestionOrExercise(item.exerciseId, 'exercise')) {
      return failValidation(`Unknown practice exercise ID: ${String(item.exerciseId)}`);
    }
    const unitId = normalizeUnitId(item.unitId);
    if (!unitId) {
      return failValidation(`Unknown unit ID in practice submission: ${String(item.unitId)}`);
    }
    if (typeof item.response !== 'string' || item.response.length > MAX_WRITING_LEN) {
      return failValidation('Invalid or oversized practice response.');
    }
    if (!isValidIsoTimestamp(item.submittedAt) || !isValidIsoTimestamp(item.updatedAt)) {
      return failValidation('Invalid timestamp in practice submission.');
    }
    const staticEx = PRACTICE_BY_ID.get(item.exerciseId)!;
    practiceSubmissions.push({
      exerciseId: staticEx.id,
      unitId,
      category: staticEx.category,
      title: staticEx.title,
      response: item.response,
      selfCheckCorrect: Boolean(item.selfCheckCorrect),
      needsTeacherReview: Boolean(item.needsTeacherReview),
      xpAwarded: clampNonNegativeInt(item.xpAwarded, 1000),
      attemptCount: Math.max(1, clampNonNegativeInt(item.attemptCount, 1000)),
      submittedAt: item.submittedAt,
      updatedAt: item.updatedAt,
    });
  }

  if (!Array.isArray(parsed.writingResponses)) {
    return failValidation('Invalid writingResponses array.');
  }
  const writingResponses: LocalWritingResponse[] = [];
  for (const item of parsed.writingResponses.slice(0, MAX_HISTORY_ITEMS)) {
    if (!isPlainObject(item) || hasDangerousKeys(item)) {
      return failValidation('Malformed writing response entry.');
    }
    if (typeof item.itemId !== 'string' || item.itemId.length === 0 || item.itemId.length > MAX_ID_LEN) {
      return failValidation('Invalid writing itemId.');
    }
    const source = item.source === 'question' ? 'question' : item.source === 'practice' ? 'practice' : null;
    if (!source) {
      return failValidation('Invalid writing source.');
    }
    if (!validateKnownQuestionOrExercise(item.itemId, source === 'question' ? 'question' : 'exercise')) {
      return failValidation(`Unknown ${source} ID in writingResponses: ${item.itemId}`);
    }
    const unitId = normalizeUnitId(item.unitId);
    if (!unitId) {
      return failValidation(`Unknown unit ID in writing response: ${String(item.unitId)}`);
    }
    if (typeof item.response !== 'string' || item.response.length > MAX_WRITING_LEN) {
      return failValidation('Invalid or oversized writing response text.');
    }
    if (!isValidIsoTimestamp(item.submittedAt) || !isValidIsoTimestamp(item.updatedAt)) {
      return failValidation('Invalid timestamp in writing response.');
    }
    writingResponses.push({
      itemId: item.itemId,
      source,
      unitId,
      title: clampText(item.title, MAX_SHORT_TEXT_LEN, item.itemId),
      prompt: clampText(item.prompt, 2000),
      response: item.response,
      submittedAt: item.submittedAt,
      updatedAt: item.updatedAt,
    });
  }

  if (!Array.isArray(parsed.quizHistory)) {
    return failValidation('Invalid quizHistory array.');
  }
  const quizHistory: LocalQuizRecord[] = [];
  for (const qItem of parsed.quizHistory.slice(0, MAX_HISTORY_ITEMS)) {
    if (!isPlainObject(qItem) || hasDangerousKeys(qItem)) {
      return failValidation('Malformed quizHistory entry.');
    }
    if (typeof qItem.quizId !== 'string' || qItem.quizId.length === 0 || qItem.quizId.length > MAX_ID_LEN) {
      return failValidation('Invalid quizId.');
    }
    const unitId = qItem.unitId === 'all' ? 'all' : normalizeUnitId(qItem.unitId);
    if (!unitId) {
      return failValidation(`Unknown unit ID in quizHistory: ${String(qItem.unitId)}`);
    }
    if (!isValidIsoTimestamp(qItem.completedAt)) {
      return failValidation('Invalid completedAt timestamp in quizHistory.');
    }
    if (!Array.isArray(qItem.items)) {
      return failValidation('Invalid quiz items array.');
    }
    const validatedSubItems: LocalQuizItemResult[] = [];
    for (const sub of qItem.items.slice(0, 100)) {
      if (!isPlainObject(sub) || hasDangerousKeys(sub)) {
        return failValidation('Malformed quiz item.');
      }
      if (typeof sub.questionId !== 'string' || !validateKnownQuestionOrExercise(sub.questionId, 'question')) {
        return failValidation(`Unknown question ID in quizHistory: ${String(sub.questionId)}`);
      }
      if (typeof sub.studentAnswer !== 'string' || sub.studentAnswer.length > MAX_ANSWER_LEN) {
        return failValidation('Invalid quiz studentAnswer.');
      }
      validatedSubItems.push({
        questionId: sub.questionId,
        studentAnswer: sub.studentAnswer,
        isCorrect: Boolean(sub.isCorrect),
        pointsAwarded: clampNonNegativeInt(sub.pointsAwarded, 10000),
      });
    }

    quizHistory.push({
      quizId: qItem.quizId,
      unitId,
      gameTemplate: clampText(qItem.gameTemplate, MAX_SHORT_TEXT_LEN, 'Solo Quiz'),
      score: clampNonNegativeInt(qItem.score),
      totalQuestions: clampNonNegativeInt(qItem.totalQuestions, 500),
      correctCount: clampNonNegativeInt(qItem.correctCount, 500),
      completedAt: qItem.completedAt,
      items: validatedSubItems,
    });
  }

  if (!Array.isArray(parsed.incorrectAnswers)) {
    return failValidation('Invalid incorrectAnswers array.');
  }
  const incorrectAnswers: LocalIncorrectAnswer[] = [];
  for (const m of parsed.incorrectAnswers.slice(0, MAX_HISTORY_ITEMS)) {
    if (!isPlainObject(m) || hasDangerousKeys(m)) {
      return failValidation('Malformed incorrectAnswers entry.');
    }
    if (typeof m.questionId !== 'string' || !validateKnownQuestionOrExercise(m.questionId, 'question')) {
      return failValidation(`Unknown question ID in incorrectAnswers: ${String(m.questionId)}`);
    }
    const unitId = normalizeUnitId(m.unitId);
    if (!unitId) {
      return failValidation(`Unknown unit ID in incorrectAnswers: ${String(m.unitId)}`);
    }
    if (typeof m.studentAnswer !== 'string' || m.studentAnswer.length > MAX_ANSWER_LEN) {
      return failValidation('Invalid studentAnswer in incorrectAnswers.');
    }
    if (!isValidIsoTimestamp(m.attemptedAt)) {
      return failValidation('Invalid attemptedAt in incorrectAnswers.');
    }
    if (m.reviewedAt !== undefined && !isValidIsoTimestamp(m.reviewedAt)) {
      return failValidation('Invalid reviewedAt in incorrectAnswers.');
    }
    incorrectAnswers.push({
      questionId: m.questionId,
      unitId,
      studentAnswer: m.studentAnswer,
      isCorrect: Boolean(m.isCorrect),
      attemptedAt: m.attemptedAt,
      attemptCount: Math.max(1, clampNonNegativeInt(m.attemptCount, 1000)),
      reviewed: Boolean(m.reviewed),
      reviewedAt: m.reviewedAt,
    });
  }

  const questionAttempts: LocalQuestionAttemptSummary[] = [];
  if (parsed.questionAttempts !== undefined) {
    if (!Array.isArray(parsed.questionAttempts)) {
      return failValidation('Invalid questionAttempts array.');
    }
    for (const att of parsed.questionAttempts.slice(0, 1000)) {
      if (!isPlainObject(att) || hasDangerousKeys(att)) {
        return failValidation('Malformed questionAttempts entry.');
      }
      if (typeof att.questionId !== 'string' || !validateKnownQuestionOrExercise(att.questionId, 'question')) {
        return failValidation(`Unknown question ID in questionAttempts: ${String(att.questionId)}`);
      }
      const unitId = normalizeUnitId(att.unitId);
      if (!unitId) {
        return failValidation(`Unknown unit ID in questionAttempts: ${String(att.unitId)}`);
      }
      if (typeof att.lastAnswer !== 'string' || att.lastAnswer.length > MAX_ANSWER_LEN) {
        return failValidation('Invalid lastAnswer in questionAttempts.');
      }
      if (!isValidIsoTimestamp(att.lastAttemptAt)) {
        return failValidation('Invalid lastAttemptAt in questionAttempts.');
      }
      questionAttempts.push({
        questionId: att.questionId,
        unitId,
        lastAnswer: att.lastAnswer,
        attemptCount: Math.max(1, clampNonNegativeInt(att.attemptCount, 1000)),
        everCorrect: Boolean(att.everCorrect),
        xpAwarded: clampNonNegativeInt(att.xpAwarded, 10000),
        lastAttemptAt: att.lastAttemptAt,
      });
    }
  }

  const payload: HomeworkExportPayload = {
    app: HOMEWORK_EXPORT_APP_ID,
    schemaVersion: HOMEWORK_EXPORT_SCHEMA_VERSION,
    exportedAt: parsed.exportedAt,
    studentName,
    summary: {
      xp: Math.round(s.xp as number),
      rankTitle: computeRankTitle(Math.round(s.xp as number)),
      currentStreak: Math.round(s.currentStreak as number),
      bestStreak: Math.round(s.bestStreak as number),
      lastPracticeDate: s.lastPracticeDate as string | null,
      totalAnswered: Math.round(s.totalAnswered as number),
      correctCount: Math.min(
        Math.round(s.totalAnswered as number),
        Math.round(s.correctCount as number)
      ),
      accuracyPercent: Math.round(s.accuracyPercent as number),
      unitProgress,
      unlockedBadges,
    },
    practiceSubmissions,
    writingResponses,
    quizHistory,
    incorrectAnswers,
    questionAttempts,
  };

  return { ok: true, payload };
}

/**
 * Workflow B: Teacher Homework Inspection.
 * Strictly read-only in temporary memory; never writes to localStorage.
 */
export function inspectHomeworkSubmission(rawJson: string): {
  ok: boolean;
  inspection?: TeacherHomeworkInspection;
  error?: string;
} {
  const validated = parseAndValidateHomeworkImport(rawJson);
  if (!validated.ok || !validated.payload) {
    return { ok: false, error: validated.error };
  }

  const { payload } = validated;
  return {
    ok: true,
    inspection: {
      studentName: payload.studentName,
      exportedAt: payload.exportedAt,
      summary: payload.summary,
      writingResponses: payload.writingResponses,
      practiceSubmissions: payload.practiceSubmissions,
      quizHistory: payload.quizHistory,
      incorrectAnswers: payload.incorrectAnswers,
    },
  };
}

/**
 * Workflow A: Student Progress Backup Restoration.
 * Requires explicit confirmation before modifying local state or storage.
 */
export function restoreStudentBackup(
  rawJson: string,
  options: {
    confirmReplace: boolean;
    storage?: StorageLike | null;
    now?: Date;
  }
): {
  ok: boolean;
  state?: LocalStudentState;
  saveResult?: LocalStateSaveResult;
  error?: string;
} {
  if (!options.confirmReplace) {
    return {
      ok: false,
      error: 'Explicit confirmation is required before replacing local student progress.',
    };
  }

  const validated = parseAndValidateHomeworkImport(rawJson);
  if (!validated.ok || !validated.payload) {
    return { ok: false, error: validated.error };
  }

  const p = validated.payload;
  const now = options.now ?? new Date();
  const ts = safeIsoNow(now);

  const practiceHistory: Record<string, LocalPracticeRecord> = {};
  for (const item of p.practiceSubmissions) {
    practiceHistory[item.exerciseId] = item;
  }

  const writingResponses: Record<string, LocalWritingResponse> = {};
  const writingDrafts: Record<string, string> = {};
  for (const w of p.writingResponses) {
    writingResponses[w.itemId] = w;
    writingDrafts[w.itemId] = w.response;
  }

  const incorrectAnswers: Record<string, LocalIncorrectAnswer> = {};
  let reviewedMistakeCount = 0;
  for (const m of p.incorrectAnswers) {
    incorrectAnswers[m.questionId] = m;
    if (m.reviewed) reviewedMistakeCount += 1;
  }

  const questionAttempts: Record<string, LocalQuestionAttemptSummary> = {};
  for (const att of p.questionAttempts) {
    questionAttempts[att.questionId] = att;
  }

  let restored = normalizeLocalState(
    {
      schemaVersion: HOME_STATE_SCHEMA_VERSION,
      studentName: p.studentName,
      xp: p.summary.xp,
      currentStreak: p.summary.currentStreak,
      bestStreak: p.summary.bestStreak,
      lastPracticeDate: p.summary.lastPracticeDate,
      totalAnswered: p.summary.totalAnswered,
      correctCount: p.summary.correctCount,
      unitProgress: p.summary.unitProgress,
      unlockedBadges: p.summary.unlockedBadges,
      questionAttempts,
      quizHistory: p.quizHistory,
      practiceHistory,
      writingDrafts,
      writingResponses,
      incorrectAnswers,
      reviewedMistakeCount,
      lastActivity: null,
      updatedAt: ts,
    },
    now
  );

  // Preserve summary unitProgress when backup came from summarized export without full questionAttempts
  if (p.questionAttempts.length === 0) {
    restored = {
      ...restored,
      unitProgress: { ...p.summary.unitProgress },
    };
  }

  const saveResult =
    options.storage !== undefined ? saveLocalState(restored, options.storage) : undefined;

  return {
    ok: saveResult ? saveResult.ok : true,
    state: restored,
    saveResult,
    error: saveResult && !saveResult.ok ? saveResult.error : undefined,
  };
}
