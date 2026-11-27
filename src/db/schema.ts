import {
  bigint,
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
} from 'drizzle-orm/pg-core';

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull(),
  passwordHash: text('password_hash').notNull(),
  teamDefault: text('team_default').notNull().default('A'),
  tokenVersion: integer('token_version').notNull().default(1),
  active: boolean('active').notNull().default(true),
  createdAt: text('created_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const units = pgTable('units', {
  id: text('id').primaryKey(),
  classId: text('class_id').notNull(),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  subtitle: text('subtitle').notNull(),
  description: text('description').notNull(),
  topicsJson: text('topics_json').notNull(),
  sortOrder: integer('sort_order').notNull(),
  active: boolean('active').notNull().default(true),
  imageUrl: text('image_url'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const questions = pgTable('questions', {
  id: text('id').primaryKey(),
  classId: text('class_id').notNull(),
  unitId: text('unit_id').notNull(),
  gameTemplate: text('game_template').notNull(),
  activityType: text('activity_type').notNull(),
  difficulty: text('difficulty').notNull().default('Medium'),
  skillTag: text('skill_tag').notNull().default('General'),
  topicTag: text('topic_tag').notNull().default('General'),
  learningObjective: text('learning_objective'),
  prompt: text('prompt').notNull(),
  context: text('context'),
  optionsJson: text('options_json'),
  matchingLeftJson: text('matching_left_json'),
  matchingRightJson: text('matching_right_json'),
  hint: text('hint'),
  points: integer('points').notNull(),
  timeLimitSec: integer('time_limit_sec').notNull(),
  teacherReviewed: boolean('teacher_reviewed').notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const answerKeys = pgTable('answer_keys', {
  questionId: text('question_id').primaryKey(),
  correctOptionIndex: integer('correct_option_index'),
  correctBoolean: boolean('correct_boolean'),
  acceptedAnswersJson: text('accepted_answers_json'),
  matchingPairsJson: text('matching_pairs_json'),
  rubric: text('rubric'),
  explanation: text('explanation').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  classId: text('class_id').notNull(),
  pin: text('pin').notNull().unique(),
  title: text('title').notNull(),
  gameTemplate: text('game_template').notNull(),
  unitId: text('unit_id').notNull(),
  mode: text('mode').notNull(),
  status: text('status').notNull(),
  questionIdsJson: text('question_ids_json').notNull(),
  currentQuestionIndex: integer('current_question_index').notNull(),
  currentQuestionId: text('current_question_id').notNull(),
  timerSeconds: integer('timer_seconds').notNull(),
  remainingSeconds: integer('remaining_seconds').notNull(),
  roundEndsAt: bigint('round_ends_at', { mode: 'number' }),
  revealedAnswerText: text('revealed_answer_text'),
  revealedExplanation: text('revealed_explanation'),
  teamNamesJson: text('team_names_json').notNull(),
  teamScoresJson: text('team_scores_json').notNull(),
  teacherUid: text('teacher_uid').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const sessionParticipants = pgTable(
  'session_participants',
  {
    sessionId: text('session_id').notNull(),
    uid: text('uid').notNull(),
    studentId: text('student_id').notNull(),
    displayName: text('display_name').notNull(),
    team: text('team').notNull(),
    connected: boolean('connected').notNull().default(true),
    sessionScore: integer('session_score').notNull().default(0),
    joinedAt: text('joined_at').notNull(),
    lastPingAt: text('last_ping_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.uid] })]
);

export const sessionSubmissions = pgTable(
  'session_submissions',
  {
    id: text('id').notNull(),
    sessionId: text('session_id').notNull(),
    questionId: text('question_id').notNull(),
    uid: text('uid').notNull(),
    studentId: text('student_id').notNull(),
    studentName: text('student_name').notNull(),
    activityType: text('activity_type').notNull(),
    answerPayload: text('answer_payload').notNull(),
    isGraded: boolean('is_graded').notNull().default(false),
    isCorrect: boolean('is_correct').notNull().default(false),
    pointsAwarded: integer('points_awarded').notNull().default(0),
    teacherFeedback: text('teacher_feedback'),
    submittedAt: text('submitted_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.id] })]
);

export const officialScores = pgTable('official_scores', {
  studentId: text('student_id').primaryKey(),
  classId: text('class_id').notNull(),
  displayName: text('display_name').notNull(),
  xp: integer('xp').notNull().default(0),
  rankTitle: text('rank_title').notNull(),
  unit7Progress: integer('unit7_progress').notNull().default(0),
  unit8Progress: integer('unit8_progress').notNull().default(0),
  unit9Progress: integer('unit9_progress').notNull().default(0),
  gamesPlayed: integer('games_played').notNull().default(0),
  correctCount: integer('correct_count').notNull().default(0),
  streak: integer('streak').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});

export const scoreEvents = pgTable('score_events', {
  id: text('id').primaryKey(),
  classId: text('class_id').notNull(),
  studentId: text('student_id').notNull(),
  studentName: text('student_name').notNull(),
  sessionId: text('session_id'),
  unitId: text('unit_id'),
  source: text('source').notNull(),
  points: integer('points').notNull(),
  reason: text('reason').notNull(),
  awardedByUid: text('awarded_by_uid').notNull(),
  createdAt: text('created_at').notNull(),
});

export const achievements = pgTable('achievements', {
  id: text('id').primaryKey(),
  classId: text('class_id').notNull(),
  studentId: text('student_id').notNull(),
  badgeKey: text('badge_key').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  awardedByUid: text('awarded_by_uid').notNull(),
  createdAt: text('created_at').notNull(),
});

export const practiceExercises = pgTable('practice_exercises', {
  id: text('id').primaryKey(),
  classId: text('class_id').notNull(),
  unitId: text('unit_id').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  prompt: text('prompt').notNull(),
  passage: text('passage'),
  optionsJson: text('options_json'),
  matchingLeftJson: text('matching_left_json'),
  matchingRightJson: text('matching_right_json'),
  correctAnswer: text('correct_answer'),
  hint: text('hint').notNull(),
  explanation: text('explanation').notNull(),
  requiresTeacherReview: boolean('requires_teacher_review').notNull().default(false),
  suggestedXp: integer('suggested_xp').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const practiceProgress = pgTable('practice_progress', {
  id: text('id').primaryKey(),
  uid: text('uid').notNull(),
  studentId: text('student_id').notNull(),
  studentName: text('student_name').notNull(),
  classId: text('class_id').notNull(),
  unitId: text('unit_id').notNull(),
  exerciseId: text('exercise_id').notNull(),
  category: text('category').notNull(),
  response: text('response').notNull(),
  selfCheckCorrect: boolean('self_check_correct').notNull().default(false),
  needsTeacherReview: boolean('needs_teacher_review').notNull().default(false),
  teacherReviewed: boolean('teacher_reviewed').notNull().default(false),
  approvedXp: integer('approved_xp').notNull().default(0),
  teacherFeedback: text('teacher_feedback'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
