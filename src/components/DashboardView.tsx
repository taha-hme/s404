import { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Award,
  BookOpen,
  Check,
  Clock,
  Download,
  Flame,
  Gamepad2,
  Pencil,
  RotateCcw,
  Target,
  Trophy,
  X,
} from 'lucide-react';
import { INITIAL_UNITS } from '../data/seedContent';
import { formatShortDate } from '../lib/homeQuizHelpers';
import {
  getStudentProgressSummary,
  type LocalLoadStatus,
  type LocalStudentState,
  type UnitId,
} from '../lib/localLeagueStore';
import type { NavTab } from './AppShell';

interface DashboardViewProps {
  state: LocalStudentState;
  loadStatus: LocalLoadStatus;
  storageNotice: string | null;
  onUpdateName: (name: string) => void;
  onNavigate: (tab: NavTab) => void;
  onStartUnitQuiz: (unitId: UnitId) => void;
  onStartUnitPractice: (unitId: UnitId) => void;
  onOpenMistakeReview: () => void;
  onExportBackup: () => void;
  onClearCorruptedStorage?: () => void;
}

export function DashboardView({
  state,
  loadStatus,
  storageNotice,
  onUpdateName,
  onNavigate,
  onStartUnitQuiz,
  onStartUnitPractice,
  onOpenMistakeReview,
  onExportBackup,
  onClearCorruptedStorage,
}: DashboardViewProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(state.studentName);

  const summary = getStudentProgressSummary(state);

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateName(nameDraft);
    setEditingName(false);
  };

  return (
    <div className="space-y-8">
      {/* Storage warning if localStorage had an issue */}
      {storageNotice && (
        <div
          role="alert"
          className="p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <span>{storageNotice}</span>
          </div>
          {(loadStatus === 'corrupted' || loadStatus === 'invalid_version') && onClearCorruptedStorage && (
            <button
              type="button"
              onClick={onClearCorruptedStorage}
              className="shrink-0 min-h-[36px] px-3 py-1.5 rounded-lg border border-amber-400 dark:border-amber-700 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
            >
              Reset saved data slot
            </button>
          )}
        </div>
      )}

      {/* Primary Focal Banner with Inline Editable Name */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-3 max-w-2xl">
          <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
            S404 — The English League · Home Edition
          </div>

          {editingName ? (
            <form onSubmit={handleSaveName} className="flex flex-wrap items-center gap-2">
              <label htmlFor="student-display-name" className="sr-only">
                Student display name
              </label>
              <input
                id="student-display-name"
                type="text"
                maxLength={64}
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Enter your name"
                className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-base font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Save name
              </button>
              <button
                type="button"
                onClick={() => {
                  setNameDraft(state.studentName);
                  setEditingName(false);
                }}
                className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Welcome back, {summary.studentName}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setNameDraft(state.studentName);
                  setEditingName(true);
                }}
                aria-label="Edit student name"
                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
              >
                <Pencil className="w-3 h-3" />
                Edit name
              </button>
            </div>
          )}

          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Practice Upper-Intermediate Units 7–9 at your own pace. Progress stays in this browser
            and can be exported anytime for your teacher or another device.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('quiz')}
            className="min-h-[46px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <Gamepad2 className="w-4 h-4" />
            Start Solo Quiz
          </button>

          <button
            type="button"
            onClick={() => onNavigate('practice')}
            className="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            Practice Lab
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onExportBackup}
            className="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Export Backup
          </button>
        </div>
      </section>

      {/* Personal KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total XP</div>
          <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {summary.xp}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {summary.nextRank ? `${summary.xpToNextRank} XP to ${summary.nextRank}` : 'Top rank reached'}
          </div>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Current Rank</div>
          <div className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {summary.rankTitle}
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-2">
            <div
              className="h-full rounded-full bg-violet-600 transition-all duration-300"
              style={{ width: `${summary.rankProgressPercent}%` }}
            />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Daily Streak</div>
          <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white inline-flex items-center gap-2">
            {summary.currentStreak}
            <Flame className="w-5 h-5 text-violet-500" />
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Best streak: {summary.bestStreak} {summary.bestStreak === 1 ? 'day' : 'days'}
          </div>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Accuracy</div>
          <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white inline-flex items-center gap-2">
            {summary.accuracyPercent}%
            <Target className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {summary.correctCount} / {summary.totalAnswered} answered
          </div>
        </div>
      </section>

      {/* Main Content Grid: Units 7-9 + Recent Activity + Badges + Mistake Review */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Units Mastery + Recent Activity */}
        <div className="lg:col-span-7 space-y-6">
          <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Units 7–9 Progress
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('progress')}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Full progress
              </button>
            </div>

            <div className="space-y-4">
              {INITIAL_UNITS.map((u) => {
                const unitId = u.id as UnitId;
                const prog = summary.unitProgress[unitId] ?? 0;
                return (
                  <div
                    key={u.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-900/40 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Unit {u.number}: {u.title}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {u.subtitle}
                        </div>
                      </div>
                      <span className="font-mono text-xs font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                        {prog}% mastered
                      </span>
                    </div>

                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all duration-300"
                        style={{ width: `${prog}%` }}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => onStartUnitQuiz(unitId)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 transition-colors"
                      >
                        Quiz Unit {u.number}
                      </button>
                      <button
                        type="button"
                        onClick={() => onStartUnitPractice(unitId)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 transition-colors"
                      >
                        Practice Unit {u.number}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Recent Activity
              </h3>
              {state.quizHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => onNavigate('progress')}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View history
                </button>
              )}
            </div>

            {!state.lastActivity && state.quizHistory.length === 0 ? (
              <div className="py-4 text-sm text-slate-500 dark:text-slate-400">
                No study sessions yet. Start a 5-question Solo Quiz or try a Practice exercise to
                begin building your XP and streak.
              </div>
            ) : (
              <div className="space-y-3">
                {state.lastActivity && (
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-wide text-blue-600 dark:text-blue-400 font-semibold">
                        Latest {state.lastActivity.kind}
                      </div>
                      <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {state.lastActivity.title}
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 font-mono">
                      {formatShortDate(state.lastActivity.timestamp)}
                    </span>
                  </div>
                )}

                {state.quizHistory.slice(0, 3).map((q) => (
                  <div
                    key={q.quizId}
                    className="py-2 px-1 flex items-center justify-between gap-3 border-t first:border-t-0 border-slate-100 dark:border-slate-800 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {q.gameTemplate} · {q.unitId === 'all' ? 'All Units' : q.unitId.toUpperCase()}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {q.correctCount} / {q.totalQuestions} correct · {formatShortDate(q.completedAt)}
                      </div>
                    </div>
                    <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                      {q.score} pts
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Mistake Review + Badges */}
        <div className="lg:col-span-5 space-y-6">
          <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-500" />
                Mistakes to Review
              </h3>
              <span className="font-mono text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                {summary.pendingMistakeCount} pending
              </span>
            </div>

            {summary.pendingMistakeCount === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No unreviewed mistakes right now. Any missed quiz questions will appear here for
                targeted retry.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  You have{' '}
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {summary.pendingMistakeCount}
                  </span>{' '}
                  {summary.pendingMistakeCount === 1 ? 'question' : 'questions'} to review and retry
                  to earn the Comeback badge.
                </p>
                <button
                  type="button"
                  onClick={onOpenMistakeReview}
                  className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Review Incorrect Answers
                </button>
              </div>
            )}
          </section>

          <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <Award className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                Unlocked Badges
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('progress')}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                {summary.unlockedBadgeCount} / 6 earned
              </button>
            </div>

            {state.unlockedBadges.length === 0 ? (
              <div className="py-4 text-sm text-slate-500 dark:text-slate-400">
                No badges unlocked yet. Complete reading, grammar, vocabulary, writing, or mistake
                review rounds to unlock your first badge.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {state.unlockedBadges.map((b) => (
                  <div key={b.badgeKey} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3">
                    <Trophy className="w-4 h-4 text-violet-500 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {b.title}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{b.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
