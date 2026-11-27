import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, HelpCircle, Save, Send, XCircle } from 'lucide-react';
import { INITIAL_UNITS, SAMPLE_PRACTICE_EXERCISES } from '../data/seedContent';
import {
  getQuestionBackedPracticeItems,
  type QuestionBackedPracticeItem,
} from '../lib/homeQuizHelpers';
import { gradePracticeSelfCheck, gradeSubmission } from '../lib/leagueRules';
import type {
  LocalPracticeRecord,
  LocalQuestionAttemptSummary,
  LocalStudentState,
  UnitId,
} from '../lib/localLeagueStore';
import type { PracticeCategory, PracticeExercise } from '../types/league';

interface PracticeLabViewProps {
  state: LocalStudentState;
  initialUnitFilter?: UnitId | 'all';
  onCompletePracticeExercise: (
    exerciseId: string,
    response: string
  ) => { record: LocalPracticeRecord; xpEarnedDelta: number };
  onCompleteQuestionPractice: (
    questionId: string,
    answerPayload: string
  ) => {
    isCorrect: boolean;
    xpEarnedDelta: number;
    correctAnswerDisplay: string;
    explanation: string;
  };
  onSaveWritingDraft: (itemId: string, draftText: string) => void;
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

type UnifiedPracticeCard =
  | { kind: 'exercise'; id: string; unitId: UnitId; category: PracticeCategory; exercise: PracticeExercise }
  | { kind: 'question'; id: string; unitId: UnitId; category: Exclude<PracticeCategory, 'writing'>; item: QuestionBackedPracticeItem };

export function PracticeLabView({
  state,
  initialUnitFilter = 'all',
  onCompletePracticeExercise,
  onCompleteQuestionPractice,
  onSaveWritingDraft,
}: PracticeLabViewProps) {
  const [unitFilter, setUnitFilter] = useState<UnitId | 'all'>(initialUnitFilter);
  const [categoryFilter, setCategoryFilter] = useState<'all' | PracticeCategory>('all');

  // Pre-hydrate writing drafts and saved responses from local state
  const [answers, setAnswers] = useState<Record<string, string>>(() => ({
    ...state.writingDrafts,
  }));
  const [matchingState, setMatchingState] = useState<Record<string, Record<string, string>>>({});
  const [hintsOpen, setHintsOpen] = useState<Record<string, boolean>>({});
  const [feedbackMap, setFeedbackMap] = useState<
    Record<
      string,
      {
        checked: boolean;
        isCorrect: boolean;
        needsTeacherReview: boolean;
        explanation: string;
        correctDisplay?: string;
        xpDelta?: number;
      }
    >
  >({});
  const [draftSavedNotice, setDraftSavedNotice] = useState<Record<string, boolean>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setUnitFilter(initialUnitFilter);
  }, [initialUnitFilter]);

  // Keep unfinished writing drafts hydrated when returning after backup restore or tab switch
  useEffect(() => {
    setAnswers((prev) => {
      const merged = { ...prev };
      for (const [k, v] of Object.entries(state.writingDrafts)) {
        if (merged[k] === undefined) {
          merged[k] = v;
        }
      }
      return merged;
    });
  }, [state.writingDrafts]);

  const extraQuestionItems = useMemo(() => getQuestionBackedPracticeItems(1), []);

  const allCards: UnifiedPracticeCard[] = useMemo(() => {
    const baseCards: UnifiedPracticeCard[] = SAMPLE_PRACTICE_EXERCISES.map((ex) => ({
      kind: 'exercise',
      id: ex.id,
      unitId: ex.unitId as UnitId,
      category: ex.category,
      exercise: { ...ex, createdAt: null, updatedAt: null },
    }));

    const questionCards: UnifiedPracticeCard[] = extraQuestionItems.map((item) => ({
      kind: 'question',
      id: item.question.id,
      unitId: item.unitId,
      category: item.category,
      item,
    }));

    return [...baseCards, ...questionCards];
  }, [extraQuestionItems]);

  const filtered = allCards.filter((card) => {
    if (unitFilter !== 'all' && card.unitId !== unitFilter) return false;
    if (categoryFilter !== 'all' && card.category !== categoryFilter) return false;
    return true;
  });

  const handleCheckExercise = (ex: PracticeExercise) => {
    setErrorMsg(null);
    let response = answers[ex.id] ?? '';
    if (ex.category === 'matching') {
      const left = ex.matchingLeft ?? [];
      const map = matchingState[ex.id] ?? {};
      if (left.some((l) => !map[l])) {
        setErrorMsg('Match every term before checking your answer.');
        return;
      }
      response = JSON.stringify(map);
    }
    if (!response.trim()) {
      setErrorMsg('Enter an answer or response before submitting.');
      return;
    }

    try {
      const { record, xpEarnedDelta } = onCompletePracticeExercise(ex.id, response);
      const checked = gradePracticeSelfCheck(ex, response);
      setFeedbackMap((prev) => ({
        ...prev,
        [ex.id]: {
          checked: true,
          isCorrect: record.selfCheckCorrect,
          needsTeacherReview: checked.needsTeacherReview,
          explanation: ex.explanation,
          xpDelta: xpEarnedDelta,
        },
      }));
      setDraftSavedNotice((prev) => ({ ...prev, [ex.id]: false }));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save practice attempt.');
    }
  };

  const handleCheckQuestionDrill = (item: QuestionBackedPracticeItem) => {
    setErrorMsg(null);
    const q = item.question;
    let payload = answers[q.id] ?? '';
    if (q.activityType === 'vocab_matching') {
      const left = q.matchingLeft ?? [];
      const map = matchingState[q.id] ?? {};
      if (left.some((l) => !map[l])) {
        setErrorMsg('Match every term before checking your answer.');
        return;
      }
      payload = JSON.stringify(map);
    }
    if (payload === '' || !payload.trim()) {
      setErrorMsg('Choose or enter an answer before checking.');
      return;
    }

    try {
      const res = onCompleteQuestionPractice(q.id, payload);
      setFeedbackMap((prev) => ({
        ...prev,
        [q.id]: {
          checked: true,
          isCorrect: res.isCorrect,
          needsTeacherReview: false,
          explanation: res.explanation || item.answerKey.explanation,
          correctDisplay: res.correctAnswerDisplay,
          xpDelta: res.xpEarnedDelta,
        },
      }));
    } catch (err) {
      // Fallback pure check if error
      const graded = gradeSubmission(q, item.answerKey, payload);
      setFeedbackMap((prev) => ({
        ...prev,
        [q.id]: {
          checked: true,
          isCorrect: graded.isCorrect,
          needsTeacherReview: false,
          explanation: item.answerKey.explanation,
          correctDisplay: graded.correctAnswerDisplay,
        },
      }));
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save practice attempt.');
    }
  };

  const handleSaveDraft = (id: string) => {
    const text = answers[id] ?? '';
    onSaveWritingDraft(id, text);
    setDraftSavedNotice((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Practice Lab
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          Self-study exercises with hints and explanations across Units 7–9. Writing responses are
          saved locally in your browser and included in Homework JSON exports for teacher review.
        </p>
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
            Filter by Unit
          </label>
          <select
            id="practice-unit-filter"
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value as UnitId | 'all')}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] text-sm"
          >
            <option value="all">All Units (7–9)</option>
            {INITIAL_UNITS.map((u) => (
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
          {filtered.map((card) => {
            const unit = INITIAL_UNITS.find((u) => u.id === card.unitId);

            if (card.kind === 'exercise') {
              const ex = card.exercise;
              const savedProg: LocalPracticeRecord | undefined = state.practiceHistory[ex.id];
              const savedWriting = state.writingResponses[ex.id];
              const fb = feedbackMap[ex.id];

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
                          ? 'Teacher-inspected writing (0 auto XP)'
                          : `Self-check (+${ex.suggestedXp} XP)`}
                      </span>
                    </div>

                    {(savedProg || savedWriting) && (
                      <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                        {ex.requiresTeacherReview
                          ? 'Saved in Homework Export'
                          : savedProg?.selfCheckCorrect
                          ? `Completed (+${savedProg.xpAwarded} XP)`
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

                  {ex.category === 'writing' && (
                    <div className="space-y-2">
                      <textarea
                        rows={5}
                        aria-label={`Writing response for ${ex.title}`}
                        value={
                          answers[ex.id] ??
                          state.writingDrafts[ex.id] ??
                          savedWriting?.response ??
                          ''
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          setAnswers((prev) => ({ ...prev, [ex.id]: val }));
                          setDraftSavedNotice((prev) => ({ ...prev, [ex.id]: false }));
                        }}
                        placeholder="Write your response here. Save a draft anytime or save as your finished writing response..."
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      {draftSavedNotice[ex.id] && (
                        <div className="text-xs text-emerald-600 dark:text-emerald-400">
                          Draft saved in this browser.
                        </div>
                      )}
                    </div>
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

                    <div className="flex flex-wrap items-center gap-2">
                      {ex.requiresTeacherReview && (
                        <button
                          type="button"
                          onClick={() => handleSaveDraft(ex.id)}
                          className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <Save className="w-3.5 h-3.5" />
                          Save Draft
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCheckExercise(ex)}
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {ex.requiresTeacherReview ? 'Save Writing Response' : 'Check Answer'}
                      </button>
                    </div>
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
                            Saved to your writing portfolio & Homework JSON
                          </>
                        ) : fb.isCorrect ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            Correct self-study check
                            {fb.xpDelta && fb.xpDelta > 0
                              ? ` (+${fb.xpDelta} XP)`
                              : ' (Already rewarded)'}
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            Not quite — review the explanation below
                          </>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm opacity-90">{fb.explanation}</p>
                    </div>
                  )}
                </article>
              );
            }

            // Question-bank backed auto-gradable practice drill
            const item = card.item;
            const q = item.question;
            const attempt: LocalQuestionAttemptSummary | undefined = state.questionAttempts[q.id];
            const fb = feedbackMap[q.id];

            return (
              <article
                key={q.id}
                className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      {unit ? `Unit ${unit.number}` : q.unitId}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{item.category.replace('_', ' ')}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {q.difficulty ?? 'Medium'} · {q.points} XP
                    </span>
                  </div>

                  {attempt && (
                    <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                      {attempt.everCorrect
                        ? `Mastered (+${attempt.xpAwarded} XP)`
                        : `Attempted (${attempt.attemptCount}x)`}
                    </span>
                  )}
                </div>

                <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  {item.title}
                </h3>

                {q.context && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{q.context}</p>
                )}

                <p className="text-sm sm:text-base text-slate-800 dark:text-slate-200">
                  {q.prompt}
                </p>

                {q.activityType === 'multiple_choice' && (q.options?.length ?? 0) > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(q.options ?? []).map((opt, idx) => {
                      const idxStr = String(idx);
                      const active = answers[q.id] === idxStr;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: idxStr }))}
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

                {q.activityType === 'true_false' && (
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { label: 'True', val: 'true' },
                      { label: 'False', val: 'false' },
                    ].map((opt) => {
                      const active = answers[q.id] === opt.val;
                      return (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.val }))}
                          className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                            active
                              ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {q.activityType === 'sentence_completion' && (
                  <input
                    type="text"
                    aria-label={`Answer for ${item.title}`}
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Type the missing phrase..."
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                )}

                {q.activityType === 'vocab_matching' && (
                  <div className="space-y-2.5">
                    {(q.matchingLeft ?? []).map((left) => (
                      <div
                        key={left}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800"
                      >
                        <span className="text-sm font-medium">{left}</span>
                        <select
                          aria-label={`Match for ${left}`}
                          value={matchingState[q.id]?.[left] ?? ''}
                          onChange={(e) =>
                            setMatchingState((prev) => ({
                              ...prev,
                              [q.id]: {
                                ...(prev[q.id] ?? {}),
                                [left]: e.target.value,
                              },
                            }))
                          }
                          className="sm:w-64 min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                        >
                          <option value="">Choose match...</option>
                          {(q.matchingRight ?? []).map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  {q.hint ? (
                    <button
                      type="button"
                      onClick={() =>
                        setHintsOpen((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                      }
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      <HelpCircle className="w-4 h-4" />
                      {hintsOpen[q.id] ? 'Hide hint' : 'Show hint'}
                    </button>
                  ) : (
                    <span />
                  )}

                  <button
                    type="button"
                    onClick={() => handleCheckQuestionDrill(item)}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Check Answer
                  </button>
                </div>

                {hintsOpen[q.id] && q.hint && (
                  <div className="p-3.5 rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/70 dark:bg-violet-950/30 text-sm text-slate-700 dark:text-slate-200">
                    <span className="font-semibold text-violet-700 dark:text-violet-300">Hint: </span>
                    {q.hint}
                  </div>
                )}

                {fb?.checked && (
                  <div
                    className={`p-4 rounded-xl border space-y-1 text-sm ${
                      fb.isCorrect
                        ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                        : 'border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                    }`}
                  >
                    <div className="font-semibold flex items-center gap-2">
                      {fb.isCorrect ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          Correct!
                          {fb.xpDelta && fb.xpDelta > 0
                            ? ` +${fb.xpDelta} XP`
                            : ' (Already rewarded)'}
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          Not quite — answer: {fb.correctDisplay}
                        </>
                      )}
                    </div>
                    {fb.explanation && <p className="text-xs sm:text-sm opacity-90">{fb.explanation}</p>}
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
