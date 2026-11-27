import { useEffect, useRef, useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Flame,
  History,
  Lock,
  RotateCcw,
  Target,
  Trash2,
  Trophy,
} from 'lucide-react';
import { INITIAL_UNITS } from '../data/seedContent';
import {
  formatShortDate,
  formatStudentAnswerDisplay,
  getAnswerDisplayForQuestion,
  getSeededQuestionEntry,
} from '../lib/homeQuizHelpers';
import { BADGE_CATALOG } from '../lib/leagueRules';
import {
  getStudentProgressSummary,
  type LocalStudentState,
  type UnitId,
} from '../lib/localLeagueStore';
import { ActivityEngine } from './ActivityEngine';

interface MyProgressViewProps {
  state: LocalStudentState;
  focusMistakesToken?: number;
  onRetryMistake: (
    questionId: string,
    answerPayload: string
  ) => {
    isCorrect: boolean;
    xpEarnedDelta: number;
    correctAnswerDisplay: string;
    explanation: string;
  };
  onClearMistake: (questionId: string) => void;
  onStartUnitPractice: (unitId: UnitId) => void;
  onStartUnitQuiz: (unitId: UnitId) => void;
}

export function MyProgressView({
  state,
  focusMistakesToken = 0,
  onRetryMistake,
  onClearMistake,
  onStartUnitPractice,
  onStartUnitQuiz,
}: MyProgressViewProps) {
  const mistakesRef = useRef<HTMLElement | null>(null);
  const [expandedQuizId, setExpandedQuizId] = useState<string | null>(null);
  const [retryingQuestionId, setRetryingQuestionId] = useState<string | null>(null);
  const [retryFeedback, setRetryFeedback] = useState<{
    questionId: string;
    isCorrect: boolean;
    xpDelta: number;
    correctAnswerDisplay: string;
    explanation: string;
  } | null>(null);

  const summary = getStudentProgressSummary(state);

  useEffect(() => {
    if (focusMistakesToken > 0 && mistakesRef.current) {
      mistakesRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focusMistakesToken]);

  const unlockedByKey = new Map(state.unlockedBadges.map((b) => [b.badgeKey, b]));
  const pendingMistakes = Object.values(state.incorrectAnswers).filter((m) => !m.reviewed);
  const practiceRecords = Object.values(state.practiceHistory).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
  const writingRecords = Object.values(state.writingResponses).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          My Progress
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          Personal learning history stored in this browser for {summary.studentName}.
        </p>
      </div>

      {/* Rank Progression & Core Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Current League Rank</div>
              <h3 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                {summary.rankTitle}
              </h3>
            </div>
            <div className="text-right">
              <div className="font-mono text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
                {summary.xp} XP
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {summary.nextRank ? `${summary.xpToNextRank} XP to ${summary.nextRank}` : 'Top tier achieved'}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-violet-600 transition-all duration-300"
                style={{ width: `${summary.rankProgressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
              <span>{summary.rankProgressPercent}% toward next tier</span>
              <span>{summary.nextRank ?? 'Max Rank'}</span>
            </div>
          </div>
        </section>

        <section className="lg:col-span-6 grid grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-violet-500" />
              Current Streak
            </div>
            <div className="font-mono text-2xl font-bold tabular-nums">{summary.currentStreak}d</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              Best: {summary.bestStreak}d
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-blue-500" />
              Overall Accuracy
            </div>
            <div className="font-mono text-2xl font-bold tabular-nums">{summary.accuracyPercent}%</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              {summary.correctCount} / {summary.totalAnswered} correct
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">Quizzes Finished</div>
            <div className="font-mono text-2xl font-bold tabular-nums">{state.quizHistory.length}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {practiceRecords.length} practice checks
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">Mistakes Resolved</div>
            <div className="font-mono text-2xl font-bold tabular-nums">{state.reviewedMistakeCount}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {summary.pendingMistakeCount} pending review
            </div>
          </div>
        </section>
      </div>

      {/* Unit Mastery */}
      <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4">
        <h3 className="font-display text-lg font-semibold flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          Unit Mastery (Units 7–9)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {INITIAL_UNITS.map((u) => {
            const unitId = u.id as UnitId;
            const pct = summary.unitProgress[unitId] ?? 0;
            return (
              <div
                key={u.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                      Unit {u.number}
                    </div>
                    <div className="font-semibold text-sm text-slate-900 dark:text-white">
                      {u.title}
                    </div>
                  </div>
                  <span className="font-mono text-sm font-bold tabular-nums">{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onStartUnitQuiz(unitId)}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500"
                  >
                    Quiz
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartUnitPractice(unitId)}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500"
                  >
                    Practice
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Badge Collection */}
      <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2">
            <Award className="w-4 h-4 text-violet-500" />
            Personal Badge Collection
          </h3>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
            {summary.unlockedBadgeCount} / {BADGE_CATALOG.length} unlocked
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {BADGE_CATALOG.map((badge) => {
            const unlocked = unlockedByKey.get(badge.key);
            return (
              <div
                key={badge.key}
                className={`p-4 rounded-xl border space-y-1.5 ${
                  unlocked
                    ? 'border-violet-300 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/25'
                    : 'border-slate-200 dark:border-slate-800 opacity-75'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                    {unlocked ? (
                      <Trophy className="w-4 h-4 text-violet-500" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    {badge.title}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {unlocked ? 'Earned' : 'Locked'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">{badge.description}</p>
                {unlocked && (
                  <div className="text-[11px] text-violet-700 dark:text-violet-300 font-mono">
                    Unlocked {formatShortDate(unlocked.unlockedAt)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Incorrect-Answer Review */}
      <section
        ref={mistakesRef}
        id="mistakes-section"
        className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-amber-500" />
            Incorrect-Answer Review
          </h3>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
            {pendingMistakes.length} pending
          </span>
        </div>

        {retryFeedback && (
          <div
            className={`p-4 rounded-xl border text-sm ${
              retryFeedback.isCorrect
                ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                : 'border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
            }`}
          >
            <div className="font-semibold">
              {retryFeedback.isCorrect
                ? `Resolved!${retryFeedback.xpDelta > 0 ? ` +${retryFeedback.xpDelta} XP` : ''}`
                : `Still incorrect — Correct answer: ${retryFeedback.correctAnswerDisplay}`}
            </div>
            {retryFeedback.explanation && <p className="text-xs mt-1">{retryFeedback.explanation}</p>}
          </div>
        )}

        {pendingMistakes.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No pending mistakes. Missed Solo Quiz or Practice questions appear here so you can
            retry them and check the explanations.
          </p>
        ) : (
          <div className="space-y-4">
            {pendingMistakes.map((mistake) => {
              const entry = getSeededQuestionEntry(mistake.questionId);
              const isRetrying = retryingQuestionId === mistake.questionId;
              const answerDisplay = getAnswerDisplayForQuestion(mistake.questionId);

              return (
                <article
                  key={mistake.questionId}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {mistake.unitId.toUpperCase()} · {mistake.attemptCount}{' '}
                        {mistake.attemptCount === 1 ? 'attempt' : 'attempts'} ·{' '}
                        {formatShortDate(mistake.attemptedAt)}
                      </div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        {entry?.question.prompt ?? mistake.questionId}
                      </div>
                      <div className="text-xs text-rose-600 dark:text-rose-400">
                        Your answer: {formatStudentAnswerDisplay(mistake.questionId, mistake.studentAnswer)}
                      </div>
                      {!isRetrying && answerDisplay && (
                        <div className="text-xs text-emerald-700 dark:text-emerald-300">
                          Answer key: {answerDisplay}
                        </div>
                      )}
                      {!isRetrying && entry?.answerKey.explanation && (
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          {entry.answerKey.explanation}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {entry && (
                        <button
                          type="button"
                          onClick={() =>
                            setRetryingQuestionId((curr) =>
                              curr === mistake.questionId ? null : mistake.questionId
                            )
                          }
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          {isRetrying ? 'Close Retry' : 'Retry Question'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (retryingQuestionId === mistake.questionId) {
                            setRetryingQuestionId(null);
                          }
                          onClearMistake(mistake.questionId);
                        }}
                        aria-label={`Mark mistake ${mistake.questionId} reviewed`}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Mark Reviewed
                      </button>
                    </div>
                  </div>

                  {isRetrying && entry && (
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                      <ActivityEngine
                        question={entry.question}
                        mode="student"
                        onSubmit={(payload) => {
                          const res = onRetryMistake(mistake.questionId, payload);
                          setRetryFeedback({
                            questionId: mistake.questionId,
                            isCorrect: res.isCorrect,
                            xpDelta: res.xpEarnedDelta,
                            correctAnswerDisplay: res.correctAnswerDisplay,
                            explanation: res.explanation,
                          });
                          if (res.isCorrect) {
                            setRetryingQuestionId(null);
                          }
                        }}
                      />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Quiz History + Practice & Writing History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2">
            <History className="w-4 h-4 text-blue-500" />
            Quiz History
          </h3>

          {state.quizHistory.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No completed quizzes yet. Start a Solo Quiz to record your first score.
            </p>
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-y-auto">
              {state.quizHistory.map((q) => {
                const open = expandedQuizId === q.quizId;
                return (
                  <div
                    key={q.quizId}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedQuizId(open ? null : q.quizId)}
                      className="w-full flex items-center justify-between gap-3 text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {q.gameTemplate}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {q.correctCount}/{q.totalQuestions} correct · {q.score} pts ·{' '}
                          {formatShortDate(q.completedAt)}
                        </div>
                      </div>
                      {open ? (
                        <ChevronUp className="w-4 h-4 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />
                      )}
                    </button>

                    {open && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                        {q.items.map((item, i) => {
                          const entry = getSeededQuestionEntry(item.questionId);
                          return (
                            <div
                              key={`${q.quizId}-${item.questionId}-${i}`}
                              className="flex items-start justify-between gap-2"
                            >
                              <span className="text-slate-700 dark:text-slate-300">
                                {i + 1}. {entry?.question.prompt ?? item.questionId}
                              </span>
                              <span
                                className={`font-mono shrink-0 ${
                                  item.isCorrect
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-amber-600 dark:text-amber-400'
                                }`}
                              >
                                {item.isCorrect ? `+${item.pointsAwarded}` : 'Miss'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="lg:col-span-6 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-violet-500" />
            Practice & Writing History
          </h3>

          {practiceRecords.length === 0 && writingRecords.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No practice submissions or writing responses saved yet.
            </p>
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-y-auto">
              {writingRecords.map((w) => (
                <div
                  key={`write-${w.itemId}`}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-violet-600 dark:text-violet-400">
                      Writing · {w.unitId.toUpperCase()}
                    </span>
                    <span className="font-mono text-slate-500 dark:text-slate-400">
                      {formatShortDate(w.updatedAt)}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {w.title}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3">
                    {w.response}
                  </p>
                </div>
              ))}

              {practiceRecords
                .filter((p) => !p.needsTeacherReview)
                .map((p) => (
                  <div
                    key={`prac-${p.exerciseId}`}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {p.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {p.unitId.toUpperCase()} · {p.attemptCount}x ·{' '}
                        {formatShortDate(p.updatedAt)}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-mono shrink-0 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />+{p.xpAwarded} XP
                    </span>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
