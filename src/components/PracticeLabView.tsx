import { useEffect, useState } from 'react';
import { CheckCircle2, HelpCircle, Send, XCircle } from 'lucide-react';
import { submitPracticeAttempt } from '../lib/leagueApi';
import { gradePracticeSelfCheck } from '../lib/leagueRules';
import type {
  PracticeCategory,
  PracticeExercise,
  PracticeProgress,
  StudentProfile,
  Unit,
  UserRole,
} from '../types/league';

interface PracticeLabViewProps {
  role: UserRole;
  student: StudentProfile | null;
  units: Unit[];
  exercises: PracticeExercise[];
  progress: PracticeProgress[];
  initialUnitFilter?: string;
  onRefreshState?: () => Promise<void>;
}

const CATEGORIES: Array<{ id: 'all' | PracticeCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'vocabulary', label: 'Vocabulary' },
  { id: 'grammar', label: 'Grammar' },
  { id: 'sentence_completion', label: 'Sentence Completion' },
  { id: 'matching', label: 'Matching' },
  { id: 'reading', label: 'Reading' },
  { id: 'writing', label: 'Writing' },
];

export function PracticeLabView({
  role,
  student,
  units,
  exercises,
  progress,
  initialUnitFilter = 'all',
  onRefreshState,
}: PracticeLabViewProps) {
  const [unitFilter, setUnitFilter] = useState<string>(initialUnitFilter);
  const [categoryFilter, setCategoryFilter] = useState<'all' | PracticeCategory>('all');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [matchingState, setMatchingState] = useState<Record<string, Record<string, string>>>({});
  const [hintsOpen, setHintsOpen] = useState<Record<string, boolean>>({});
  const [feedbackMap, setFeedbackMap] = useState<
    Record<string, { checked: boolean; isCorrect: boolean; needsTeacherReview: boolean }>
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setUnitFilter(initialUnitFilter);
  }, [initialUnitFilter]);

  const filtered = exercises.filter((ex) => {
    if (unitFilter !== 'all' && ex.unitId !== unitFilter) return false;
    if (categoryFilter !== 'all' && ex.category !== categoryFilter) return false;
    return true;
  });

  const handleCheckExercise = async (ex: PracticeExercise) => {
    setErrorMsg(null);
    let response = answers[ex.id] ?? '';
    if (ex.category === 'matching') {
      response = JSON.stringify(matchingState[ex.id] ?? {});
    }
    if (!response.trim()) return;

    const result = gradePracticeSelfCheck(ex, response);
    setFeedbackMap((prev) => ({
      ...prev,
      [ex.id]: {
        checked: true,
        isCorrect: result.isCorrect,
        needsTeacherReview: result.needsTeacherReview,
      },
    }));

    if (role === 'student' && student) {
      setSavingId(ex.id);
      try {
        await submitPracticeAttempt({
          exerciseId: ex.id,
          response,
        });
        await onRefreshState?.();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to record practice attempt.');
      } finally {
        setSavingId(null);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Practice
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Self-study exercises with hints and instant explanations. Writing responses go to the
            teacher for XP approval.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                categoryFilter === cat.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="shrink-0">
          <label htmlFor="practice-unit-filter" className="sr-only">
            Filter by Topic
          </label>
          <select
            id="practice-unit-filter"
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] text-sm"
          >
            <option value="all">All Topics</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                Unit {u.number}: {u.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-sm text-rose-800 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] text-center text-sm text-slate-500 dark:text-slate-400">
          No practice exercises match this filter yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {filtered.map((ex) => {
            const unit = units.find((u) => u.id === ex.unitId);
            const savedProg = progress.find((p) => p.exerciseId === ex.id);
            const fb = feedbackMap[ex.id];
            const isSaving = savingId === ex.id;

            return (
              <article
                key={ex.id}
                className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      {unit ? `Unit ${unit.number}` : ex.unitId}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{ex.category.replace('_', ' ')}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {ex.requiresTeacherReview
                        ? `Teacher-reviewed (up to ${ex.suggestedXp} XP)`
                        : 'Self-study check'}
                    </span>
                  </div>

                  {savedProg && (
                    <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                      {savedProg.teacherReviewed
                        ? `Reviewed · +${savedProg.approvedXp} Official XP`
                        : savedProg.needsTeacherReview
                        ? 'Submitted for teacher review'
                        : 'Practiced'}
                    </span>
                  )}
                </div>

                <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  {ex.title}
                </h3>

                {ex.passage && (
                  <blockquote className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {ex.passage}
                  </blockquote>
                )}

                <p className="text-sm sm:text-base text-slate-800 dark:text-slate-200">
                  {ex.prompt}
                </p>

                {/* Options */}
                {ex.options && ex.options.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {ex.options.map((opt) => {
                      const active = answers[ex.id] === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setAnswers((prev) => ({ ...prev, [ex.id]: opt }))}
                          className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-left text-sm transition-colors ${
                            active
                              ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200 font-medium'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Sentence Completion */}
                {ex.category === 'sentence_completion' && (
                  <input
                    type="text"
                    aria-label={`Answer for ${ex.title}`}
                    value={answers[ex.id] ?? ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [ex.id]: e.target.value }))}
                    placeholder="Type the missing words..."
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                )}

                {/* Matching */}
                {ex.category === 'matching' && (
                  <div className="space-y-2.5">
                    {(ex.matchingLeft ?? []).map((left) => (
                      <div
                        key={left}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800"
                      >
                        <span className="text-sm font-medium">{left}</span>
                        <select
                          aria-label={`Match for ${left}`}
                          value={matchingState[ex.id]?.[left] ?? ''}
                          onChange={(e) =>
                            setMatchingState((prev) => ({
                              ...prev,
                              [ex.id]: {
                                ...(prev[ex.id] ?? {}),
                                [left]: e.target.value,
                              },
                            }))
                          }
                          className="sm:w-64 min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                        >
                          <option value="">Choose match...</option>
                          {(ex.matchingRight ?? []).map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}

                {/* Writing */}
                {ex.category === 'writing' && (
                  <textarea
                    rows={4}
                    aria-label={`Writing response for ${ex.title}`}
                    value={answers[ex.id] ?? savedProg?.response ?? ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [ex.id]: e.target.value }))}
                    placeholder="Write your response for teacher review..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setHintsOpen((prev) => ({ ...prev, [ex.id]: !prev[ex.id] }))
                    }
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    <HelpCircle className="w-4 h-4" />
                    {hintsOpen[ex.id] ? 'Hide hint' : 'Show hint'}
                  </button>

                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleCheckExercise(ex)}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {isSaving
                      ? 'Saving...'
                      : ex.requiresTeacherReview
                      ? 'Submit for Teacher Review'
                      : 'Check Answer'}
                  </button>
                </div>

                {hintsOpen[ex.id] && (
                  <div className="p-3.5 rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/70 dark:bg-violet-950/30 text-sm text-slate-700 dark:text-slate-200">
                    <span className="font-semibold text-violet-700 dark:text-violet-300">Hint: </span>
                    {ex.hint}
                  </div>
                )}

                {fb?.checked && (
                  <div
                    className={`p-4 rounded-xl border space-y-1 text-sm ${
                      fb.needsTeacherReview
                        ? 'border-blue-200 dark:border-blue-900 bg-blue-50/70 dark:bg-blue-950/30 text-slate-800 dark:text-slate-200'
                        : fb.isCorrect
                        ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                        : 'border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                    }`}
                  >
                    <div className="font-semibold flex items-center gap-2">
                      {fb.needsTeacherReview ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          Submitted to teacher review queue
                        </>
                      ) : fb.isCorrect ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          Correct self-study check
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          Not quite — review the explanation below
                        </>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm opacity-90">{ex.explanation}</p>
                  </div>
                )}

                {savedProg?.teacherReviewed && savedProg.teacherFeedback && (
                  <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 text-sm">
                    <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                      Teacher Feedback (+{savedProg.approvedXp} XP)
                    </div>
                    <p className="text-slate-700 dark:text-slate-200 mt-1">
                      {savedProg.teacherFeedback}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
