CREATE TABLE "achievements" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"student_id" text NOT NULL,
	"badge_key" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"awarded_by_uid" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "answer_keys" (
	"question_id" text PRIMARY KEY NOT NULL,
	"correct_option_index" integer,
	"correct_boolean" boolean,
	"accepted_answers_json" text,
	"matching_pairs_json" text,
	"rubric" text,
	"explanation" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "official_scores" (
	"student_id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"display_name" text NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"rank_title" text NOT NULL,
	"unit7_progress" integer DEFAULT 0 NOT NULL,
	"unit8_progress" integer DEFAULT 0 NOT NULL,
	"unit9_progress" integer DEFAULT 0 NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"passage" text,
	"options_json" text,
	"matching_left_json" text,
	"matching_right_json" text,
	"correct_answer" text,
	"hint" text NOT NULL,
	"explanation" text NOT NULL,
	"requires_teacher_review" boolean DEFAULT false NOT NULL,
	"suggested_xp" integer NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"uid" text NOT NULL,
	"student_id" text NOT NULL,
	"student_name" text NOT NULL,
	"class_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"category" text NOT NULL,
	"response" text NOT NULL,
	"self_check_correct" boolean DEFAULT false NOT NULL,
	"needs_teacher_review" boolean DEFAULT false NOT NULL,
	"teacher_reviewed" boolean DEFAULT false NOT NULL,
	"approved_xp" integer DEFAULT 0 NOT NULL,
	"teacher_feedback" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"game_template" text NOT NULL,
	"activity_type" text NOT NULL,
	"difficulty" text DEFAULT 'Medium' NOT NULL,
	"skill_tag" text DEFAULT 'General' NOT NULL,
	"topic_tag" text DEFAULT 'General' NOT NULL,
	"learning_objective" text,
	"prompt" text NOT NULL,
	"context" text,
	"options_json" text,
	"matching_left_json" text,
	"matching_right_json" text,
	"hint" text,
	"points" integer NOT NULL,
	"time_limit_sec" integer NOT NULL,
	"teacher_reviewed" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_events" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"student_id" text NOT NULL,
	"student_name" text NOT NULL,
	"session_id" text,
	"unit_id" text,
	"source" text NOT NULL,
	"points" integer NOT NULL,
	"reason" text NOT NULL,
	"awarded_by_uid" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_participants" (
	"session_id" text NOT NULL,
	"uid" text NOT NULL,
	"student_id" text NOT NULL,
	"display_name" text NOT NULL,
	"team" text NOT NULL,
	"connected" boolean DEFAULT true NOT NULL,
	"session_score" integer DEFAULT 0 NOT NULL,
	"joined_at" text NOT NULL,
	"last_ping_at" text NOT NULL,
	CONSTRAINT "session_participants_session_id_uid_pk" PRIMARY KEY("session_id","uid")
);
--> statement-breakpoint
CREATE TABLE "session_submissions" (
	"id" text NOT NULL,
	"session_id" text NOT NULL,
	"question_id" text NOT NULL,
	"uid" text NOT NULL,
	"student_id" text NOT NULL,
	"student_name" text NOT NULL,
	"activity_type" text NOT NULL,
	"answer_payload" text NOT NULL,
	"is_graded" boolean DEFAULT false NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"teacher_feedback" text,
	"submitted_at" text NOT NULL,
	CONSTRAINT "session_submissions_session_id_id_pk" PRIMARY KEY("session_id","id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"pin" text NOT NULL,
	"title" text NOT NULL,
	"game_template" text NOT NULL,
	"unit_id" text NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"question_ids_json" text NOT NULL,
	"current_question_index" integer NOT NULL,
	"current_question_id" text NOT NULL,
	"timer_seconds" integer NOT NULL,
	"remaining_seconds" integer NOT NULL,
	"round_ends_at" bigint,
	"revealed_answer_text" text,
	"revealed_explanation" text,
	"team_names_json" text NOT NULL,
	"team_scores_json" text NOT NULL,
	"teacher_uid" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "sessions_pin_unique" UNIQUE("pin")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"subtitle" text NOT NULL,
	"description" text NOT NULL,
	"topics_json" text NOT NULL,
	"sort_order" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"image_url" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text NOT NULL,
	"password_hash" text NOT NULL,
	"team_default" text DEFAULT 'A' NOT NULL,
	"token_version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" text NOT NULL,
	"last_seen_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
