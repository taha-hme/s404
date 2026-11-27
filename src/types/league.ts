export type UserRole = 'teacher' | 'student';

export type ActivityType =
  | 'multiple_choice'
  | 'true_false'
  | 'sentence_completion'
  | 'vocab_matching'
  | 'open_ended'
  | 'speaking_writing';

export type QuestionDifficulty = 'Easy' | 'Medium' | 'Hard';

export type GameTemplateName =
  | 'Grammar Royale'
  | 'Word Duel'
  | 'Fact or Fiction'
  | 'Story Builder'
  | 'Save the City'
  | 'The Ad Agency'
  | 'Market Masters'
  | 'Boss Challenge';

export type PracticeCategory =
  | 'vocabulary'
  | 'grammar'
  | 'sentence_completion'
  | 'matching'
  | 'reading'
  | 'writing';

export type BadgeKey =
  | 'sherlock'
  | 'grammar_master'
  | 'smooth_talker'
  | 'word_collector'
  | 'creative_mind'
  | 'comeback';

export type SessionStatus = 'waiting' | 'active' | 'paused' | 'revealed' | 'ended';
export type SessionMode = 'individual' | 'team';
export type TeamId = 'A' | 'B' | 'none';

export type SubmissionDeliveryState = 'idle' | 'pending_offline' | 'submitting' | 'confirmed' | 'error';

export interface ClassRoom {
  id: string;
  code: string;
  name: string;
  teacherUid: string;
  teacherName: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface StudentProfile {
  id: string;
  classId: string;
  username: string;
  displayName: string;
  role: 'student';
  teamDefault: 'A' | 'B';
  active: boolean;
  createdAt: unknown;
  lastSeenAt: unknown;
  updatedAt: unknown;
}

export interface Unit {
  id: string;
  classId: string;
  number: number;
  title: string;
  subtitle: string;
  description: string;
  topics: string[];
  order: number;
  active: boolean;
  imageUrl?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface Question {
  id: string;
  classId: string;
  unitId: string;
  gameTemplate: GameTemplateName | string;
  activityType: ActivityType;
  difficulty?: QuestionDifficulty;
  skillTag?: string;
  topicTag?: string;
  learningObjective?: string;
  prompt: string;
  context?: string;
  options?: string[];
  matchingLeft?: string[];
  matchingRight?: string[];
  hint?: string;
  points: number;
  timeLimitSec: number;
  teacherReviewed: boolean;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface AnswerKey {
  questionId: string;
  correctOptionIndex?: number;
  correctBoolean?: boolean;
  acceptedAnswers?: string[];
  matchingPairs?: Record<string, string>;
  rubric?: string;
  explanation: string;
  updatedAt: unknown;
}

export interface BattleSession {
  id: string;
  classId: string;
  pin: string;
  title: string;
  gameTemplate: GameTemplateName | string;
  unitId: string;
  mode: SessionMode;
  status: SessionStatus;
  questionIds: string[];
  currentQuestionIndex: number;
  currentQuestionId: string;
  timerSeconds: number;
  remainingSeconds: number;
  revealedAnswerText?: string;
  revealedExplanation?: string;
  teamNames: { A: string; B: string };
  teamScores: { A: number; B: number };
  teacherUid: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface SessionParticipant {
  uid: string;
  studentId: string;
  displayName: string;
  team: TeamId;
  connected: boolean;
  sessionScore: number;
  joinedAt: unknown;
  lastPingAt: unknown;
}

export interface StudentSubmission {
  id: string;
  sessionId: string;
  questionId: string;
  uid: string;
  studentId: string;
  studentName: string;
  activityType: ActivityType;
  answerPayload: string;
  isGraded: boolean;
  isCorrect: boolean;
  pointsAwarded: number;
  teacherFeedback?: string;
  submittedAt: unknown;
}

export interface OfficialScore {
  studentId: string;
  classId: string;
  displayName: string;
  xp: number;
  rankTitle: string;
  unit7Progress: number;
  unit8Progress: number;
  unit9Progress: number;
  gamesPlayed: number;
  correctCount: number;
  streak: number;
  updatedAt: unknown;
}

export interface ScoreEvent {
  id: string;
  classId: string;
  studentId: string;
  studentName: string;
  sessionId?: string;
  unitId?: string;
  source: 'battle' | 'bonus' | 'speaking_writing' | 'mission';
  points: number;
  reason: string;
  awardedByUid: string;
  createdAt: unknown;
}

export interface Achievement {
  id: string;
  classId: string;
  studentId: string;
  badgeKey: BadgeKey;
  title: string;
  description: string;
  awardedByUid: string;
  createdAt: unknown;
}

export interface PracticeExercise {
  id: string;
  classId: string;
  unitId: string;
  category: PracticeCategory;
  title: string;
  prompt: string;
  passage?: string;
  options?: string[];
  matchingLeft?: string[];
  matchingRight?: string[];
  correctAnswer?: string;
  hint: string;
  explanation: string;
  requiresTeacherReview: boolean;
  suggestedXp: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface PracticeProgress {
  id: string;
  uid: string;
  studentId: string;
  studentName: string;
  classId: string;
  unitId: string;
  exerciseId: string;
  category: PracticeCategory;
  response: string;
  selfCheckCorrect: boolean;
  needsTeacherReview: boolean;
  teacherReviewed: boolean;
  approvedXp: number;
  teacherFeedback?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface QueuedBattleAnswer {
  submissionId: string;
  sessionId: string;
  questionId: string;
  uid: string;
  studentId: string;
  studentName: string;
  activityType: ActivityType;
  answerPayload: string;
  queuedAtIso: string;
}
