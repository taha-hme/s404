import type { SampleQuestionSeed } from './seedContent';
import type { GameTemplateName, QuestionDifficulty } from '../types/league';

export interface BaseSpec {
  id: string;
  unitId: 'unit-7' | 'unit-8' | 'unit-9';
  gameTemplate: GameTemplateName;
  difficulty: QuestionDifficulty;
  skillTag: string;
  topicTag: string;
  learningObjective: string;
  prompt: string;
  context?: string;
  hint: string;
  points?: number;
  timeLimitSec?: number;
}

export interface McSpec extends BaseSpec {
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
}

export interface ScSpec extends BaseSpec {
  acceptedAnswers: string[];
  explanation: string;
}

export interface TfSpec extends BaseSpec {
  correctBoolean: boolean;
  explanation: string;
}

export interface VmSpec extends BaseSpec {
  pairs: Array<[string, string]>;
  explanation: string;
}

export interface OpenSpec extends BaseSpec {
  activityType: 'open_ended' | 'speaking_writing';
  rubric: string;
  explanation: string;
}

function defaultPoints(diff: QuestionDifficulty, base = 100): number {
  if (diff === 'Easy') return base - 10;
  if (diff === 'Hard') return base + 30;
  return base;
}

function deterministicRotation(id: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % mod;
}

export function mc(s: McSpec): SampleQuestionSeed {
  const shift = deterministicRotation(s.id, 4);
  const rotatedOptions = s.options.map((_, i) => s.options[(i + shift) % 4]);
  const rotatedCorrectIndex = ((s.correctIndex - shift) % 4 + 4) % 4;

  return {
    question: {
      id: s.id,
      classId: 'S404',
      unitId: s.unitId,
      gameTemplate: s.gameTemplate,
      activityType: 'multiple_choice',
      difficulty: s.difficulty,
      skillTag: s.skillTag,
      topicTag: s.topicTag,
      learningObjective: s.learningObjective,
      prompt: s.prompt,
      context: s.context,
      options: rotatedOptions,
      hint: s.hint,
      points: s.points ?? defaultPoints(s.difficulty, 100),
      timeLimitSec: s.timeLimitSec ?? (s.difficulty === 'Hard' ? 50 : 45),
      teacherReviewed: false,
    },
    answerKey: {
      questionId: s.id,
      correctOptionIndex: rotatedCorrectIndex,
      explanation: s.explanation,
    },
  };
}

export function sc(s: ScSpec): SampleQuestionSeed {
  return {
    question: {
      id: s.id,
      classId: 'S404',
      unitId: s.unitId,
      gameTemplate: s.gameTemplate,
      activityType: 'sentence_completion',
      difficulty: s.difficulty,
      skillTag: s.skillTag,
      topicTag: s.topicTag,
      learningObjective: s.learningObjective,
      prompt: s.prompt,
      context: s.context,
      hint: s.hint,
      points: s.points ?? defaultPoints(s.difficulty, 120),
      timeLimitSec: s.timeLimitSec ?? 60,
      teacherReviewed: false,
    },
    answerKey: {
      questionId: s.id,
      acceptedAnswers: s.acceptedAnswers,
      explanation: s.explanation,
    },
  };
}

export function tf(s: TfSpec): SampleQuestionSeed {
  return {
    question: {
      id: s.id,
      classId: 'S404',
      unitId: s.unitId,
      gameTemplate: s.gameTemplate,
      activityType: 'true_false',
      difficulty: s.difficulty,
      skillTag: s.skillTag,
      topicTag: s.topicTag,
      learningObjective: s.learningObjective,
      prompt: s.prompt,
      context: s.context,
      options: ['True', 'False'],
      hint: s.hint,
      points: s.points ?? defaultPoints(s.difficulty, 85),
      timeLimitSec: s.timeLimitSec ?? 30,
      teacherReviewed: false,
    },
    answerKey: {
      questionId: s.id,
      correctBoolean: s.correctBoolean,
      explanation: s.explanation,
    },
  };
}

export function vm(s: VmSpec): SampleQuestionSeed {
  const left = s.pairs.map((p) => p[0]);
  const rightOrdered = s.pairs.map((p) => p[1]);
  // Deterministic derangement so matchingRight[i] never sits opposite matchingLeft[i]
  const n = rightOrdered.length;
  const matchingRight = rightOrdered.map((_, i) => rightOrdered[(i + (n === 4 ? 2 : 1)) % n]);
  const matchingPairs: Record<string, string> = {};
  for (const [term, def] of s.pairs) {
    matchingPairs[term] = def;
  }

  return {
    question: {
      id: s.id,
      classId: 'S404',
      unitId: s.unitId,
      gameTemplate: s.gameTemplate,
      activityType: 'vocab_matching',
      difficulty: s.difficulty,
      skillTag: s.skillTag,
      topicTag: s.topicTag,
      learningObjective: s.learningObjective,
      prompt: s.prompt,
      context: s.context,
      matchingLeft: left,
      matchingRight,
      hint: s.hint,
      points: s.points ?? defaultPoints(s.difficulty, 120),
      timeLimitSec: s.timeLimitSec ?? 60,
      teacherReviewed: false,
    },
    answerKey: {
      questionId: s.id,
      matchingPairs,
      explanation: s.explanation,
    },
  };
}

export function open(s: OpenSpec): SampleQuestionSeed {
  return {
    question: {
      id: s.id,
      classId: 'S404',
      unitId: s.unitId,
      gameTemplate: s.gameTemplate,
      activityType: s.activityType,
      difficulty: s.difficulty,
      skillTag: s.skillTag,
      topicTag: s.topicTag,
      learningObjective: s.learningObjective,
      prompt: s.prompt,
      context: s.context,
      hint: s.hint,
      points: s.points ?? defaultPoints(s.difficulty, 150),
      timeLimitSec: s.timeLimitSec ?? (s.activityType === 'speaking_writing' ? 120 : 90),
      teacherReviewed: true,
    },
    answerKey: {
      questionId: s.id,
      rubric: s.rubric,
      explanation: s.explanation,
    },
  };
}
