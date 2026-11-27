import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Gamepad2,
  HelpCircle,
  Play,
  RotateCcw,
  Trophy,
  XCircle,
} from 'lucide-react';
import { INITIAL_UNITS } from '../data/seedContent';
import {
  formatStudentAnswerDisplay,
  selectSoloQuizQuestions,
  type SeededQuestionEntry,
} from '../lib/homeQuizHelpers';
import { gradeSubmission } from '../lib/leagueRules';
import type { LocalQuizRecord, LocalStudentState, UnitId } from '../lib/localLeagueStore';
import type { QuestionDifficulty } from '../types/league';
import { ActivityEngine } from './ActivityEngine';

interface SoloQuizViewProps {
  state: LocalStudentState;
  initialUnitFilter?: UnitId | 'all';
  onCommitQuiz: (params: {
    unitId: UnitId | 'all';
    gameTemplate: string;
    items: Array<{ questionId: string; answerPayload: string }>;
  }) => { quizRecord: LocalQuizRecord; xpEarnedDelta: number };
  onNavigateHome: () => void;
  onOpenMistakeReview: () => void;
}

interface AnsweredStep {
  entry: SeededQuestionEntry;
  answerPayload: string;
  isCorrect: boolean;
  needsManualReview: boolean;
  pointsAwarded: number;
  expectedXpDelta: number;
  correctAnswerDisplay: string;
  explanation: string;
  timedOut?: boolean;
}

export function SoloQuizView({
  state,
  initialUnitFilter = 'all',
  onCommitQuiz,
  onNavigateHome,
  onOpenMistakeReview,
}: SoloQuizViewProps) {
  const [unitId, setUnitId] = useState<UnitId | 'all'>(initialUnitFilter);
  const [difficulty, setDifficulty] = useState<QuestionDifficulty | 'all'>('all');
  const [count, setCount] = useState<5 | 10 | 15>(5);
  const [timerEnabled, setTimerEnabled] = useState<boolean>(false);

  const [phase, setPhase] = useState<'setup' | 'active' | 'results'>('setup');
  const [quizEntries, setQuizEntries] = useState<SeededQuestionEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answeredSteps, setAnsweredSteps] = useState<AnsweredStep[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [committedResult, setCommittedResult] = useState<{
    quizRecord: LocalQuizRecord;
    xpEarnedDelta: number;
  } | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    setUnitId(initialUnitFilter);
  }, [initialUnitFilter]);

  const currentEntry = phase === 'active' ? quizEntries[currentIndex] : undefined;
  const currentAnswered = currentEntry
    ? answeredSteps.find((s) => s.entry.question.id === currentEntry.question.id)
    : undefined;

  // Optional countdown timer for current unanswered question
  useEffect(() => {
    if (phase !== 'active' || !timerEnabled || !currentEntry || currentAnswered) {
      return;
    }

    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [phase, timerEnabled, currentEntry, currentAnswered]);

  // Handle timeout expiry cleanly when secondsLeft hits 0
  useEffect(() => {
    if (
      phase === 'active' &&
      timerEnabled &&
      currentEntry &&
      !currentAnswered &&
      secondsLeft === 0
    ) {
      const graded = gradeSubmission(currentEntry.question, currentEntry.answerKey, '');
      setAnsweredSteps((prev) => {
        if (prev.some((s) => s.entry.question.id === currentEntry.question.id)) {
          return prev;
        }
        return [
          ...prev,
          {
            entry: currentEntry,
            answerPayload: '',
            isCorrect: false,
            needsManualReview: graded.needsManualReview,
            pointsAwarded: 0,
            expectedXpDelta: 0,
            correctAnswerDisplay: graded.correctAnswerDisplay,
            explanation: currentEntry.answerKey.explanation,
            timedOut: true,
          },
        ];
      });
    }
  }, [phase, timerEnabled, currentEntry, currentAnswered, secondsLeft]);

  const handleStartQuiz = () => {
    setSetupError(null);
    const selected = selectSoloQuizQuestions({
      unitId,
      difficulty,
      count,
      questionAttempts: state.questionAttempts,
    });

    if (selected.length === 0) {
      setSetupError('No questions matched that unit and difficulty filter.');
      return;
    }

    setQuizEntries(selected);
    setCurrentIndex(0);
    setAnsweredSteps([]);
    setCommittedResult(null);
    setSecondsLeft(selected[0].question.timeLimitSec || 45);
    setPhase('active');
  };

  const handleAnswerSubmit = (answerPayload: string) => {
    if (!currentEntry || currentAnswered) return;

    const graded = gradeSubmission(currentEntry.question, currentEntry.answerKey, answerPayload);
    const prevBestXp = state.questionAttempts[currentEntry.question.id]?.xpAwarded ?? 0;
    const expectedXpDelta =
      !graded.needsManualReview && graded.pointsAwarded > prevBestXp
        ? graded.pointsAwarded - prevBestXp
        : 0;

    setAnsweredSteps((prev) => [
      ...prev,
      {
        entry: currentEntry,
        answerPayload,
        isCorrect: graded.isCorrect,
        needsManualReview: graded.needsManualReview,
        pointsAwarded: graded.pointsAwarded,
        expectedXpDelta,
        correctAnswerDisplay: graded.correctAnswerDisplay,
        explanation: currentEntry.answerKey.explanation,
      },
    ]);
  };

  const handleAdvanceOrFinish = () => {
    if (currentIndex + 1 < quizEntries.length) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      setSecondsLeft(quizEntries[nextIdx]?.question.timeLimitSec || 45);
      return;
    }

    const label =
      unitId === 'all'
        ? 'Solo Quiz · Mixed Units'
        : `Solo Quiz · Unit ${unitId.replace('unit-', '')}`;

    const result = onCommitQuiz({
      unitId,
      gameTemplate: difficulty === 'all' ? label : `${label} (${difficulty})`,
      items: answeredSteps.map((step) => ({
        questionId: step.entry.question.id,
        answerPayload: step.answerPayload,
      })),
    });

    setCommittedResult(result);
    setPhase('results');
  };

  const handleFinishEarly = () => {
    if (answeredSteps.length === 0) {
      setPhase('setup');
      return;
    }

    const label =
      unitId === 'all'
        ? 'Solo Quiz · Mixed Units'
        : `Solo Quiz · Unit ${unitId.replace('unit-', '')}`;

    const result = onCommitQuiz({
      unitId,
      gameTemplate: label,
      items: answeredSteps.map((step) => ({
        questionId: step.entry.question.id,
        answerPayload: step.answerPayload,
      })),
    });
    setCommittedResult(result);
    setPhase('results');
  };

  if (phase === 'setup') {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Solo Quiz
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Formative practice rounds drawn from Units 7–9. Completed quizzes update your XP,
            streak, unit mastery, and mistake review queue locally.
          </p>
        </div>

        <section className="p-6 sm:p-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-6">
          <div className="space-y-2.5">
            <label htmlFor="solo-unit-select" className="block text-sm font-semibold">
              Unit
            </label>
            <select
              id="solo-unit-select"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value as UnitId | 'all')}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Units (Units 7, 8 & 9)</option>
              {INITIAL_UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  Unit {u.number}: {u.title} — {u.subtitle}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2.5">
              <span className="block text-sm font-semibold">Difficulty</span>
              <div className="grid grid-cols-2 gap-2">
                {(['all', 'Easy', 'Medium', 'Hard'] as const).map((diff) => {
                  const active = difficulty === diff;
                  return (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => setDifficulty(diff)}
                      className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                        active
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-200'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      {diff === 'all' ? 'Balanced Mix' : diff}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2.5">
              <span className="block text-sm font-semibold">Questions</span>
              <div className="grid grid-cols-3 gap-2">
                {([5, 10, 15] as const).map((num) => {
                  const active = count === num;
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setCount(num)}
                      className={`min-h-[42px] px-3 py-2 rounded-xl border font-mono text-sm font-semibold transition-colors ${
                        active
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-200'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Question Timer
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Optional per-question countdown (30–60s depending on activity type).
              </p>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium">
              <input
                type="checkbox"
                checked={timerEnabled}
                onChange={(e) => setTimerEnabled(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded"
              />
              <span>{timerEnabled ? 'On' : 'Off'}</span>
            </label>
          </div>

          {setupError && (
            <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-sm text-rose-700 dark:text-rose-200">
              {setupError}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Previously mastered questions earn 0 duplicate XP on repeat attempts.
            </span>
            <button
              type="button"
              onClick={handleStartQuiz}
              className="min-h-[46px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <Play className="w-4 h-4" />
              Start {count}-Question Quiz
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (phase === 'active' && currentEntry) {
    const progressPct = Math.round(((currentIndex + 1) / quizEntries.length) * 100);
    const alreadyMastered = Boolean(state.questionAttempts[currentEntry.question.id]?.everCorrect);

    return (
      <div className="space-y-6 max-w-3xl">
        {/* Progress & Timer Header */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm">
              <Gamepad2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="font-mono font-semibold tabular-nums">
                Question {currentIndex + 1} / {quizEntries.length}
              </span>
              {currentEntry.question.difficulty && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {currentEntry.question.difficulty}
                </span>
              )}
              {alreadyMastered && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                  Previously mastered
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {timerEnabled && (
                <span
                  className={`font-mono text-sm font-semibold tabular-nums inline-flex items-center gap-1.5 ${
                    secondsLeft <= 10
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  {secondsLeft}s
                </span>
              )}
              <button
                type="button"
                onClick={handleFinishEarly}
                className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              >
                {answeredSteps.length > 0 ? 'Save & Exit' : 'Cancel'}
              </button>
            </div>
          </div>

          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Question Card reusing ActivityEngine */}
        <section className="p-6 sm:p-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-5">
          <ActivityEngine
            question={currentEntry.question}
            mode="student"
            disabled={Boolean(currentAnswered)}
            deliveryState={currentAnswered ? 'confirmed' : 'idle'}
            savedAnswer={currentAnswered?.answerPayload}
            isRevealed={Boolean(currentAnswered)}
            revealedAnswerText={currentAnswered?.correctAnswerDisplay}
            revealedExplanation={currentAnswered?.explanation}
            onSubmit={handleAnswerSubmit}
          />

          {currentAnswered && (
            <div className="pt-2 space-y-4">
              <div
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  currentAnswered.isCorrect
                    ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                    : 'border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                }`}
              >
                <div className="flex items-center gap-2.5 text-sm font-semibold">
                  {currentAnswered.isCorrect ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>
                        Correct!{' '}
                        {currentAnswered.expectedXpDelta > 0
                          ? `+${currentAnswered.expectedXpDelta} new XP`
                          : 'Already rewarded (+0 duplicate XP)'}
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>
                        {currentAnswered.timedOut
                          ? 'Time expired — added to your Mistake Review queue.'
                          : currentAnswered.pointsAwarded > 0
                          ? `Partial match (${currentAnswered.pointsAwarded} pts · +${currentAnswered.expectedXpDelta} XP) — added to Mistake Review.`
                          : 'Not quite — added to your Mistake Review queue.'}
                      </span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleAdvanceOrFinish}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shrink-0"
                >
                  {currentIndex + 1 < quizEntries.length ? 'Next Question' : 'Finish & Save Quiz'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    );
  }

  // Results phase
  const totalQ = committedResult?.quizRecord.totalQuestions ?? answeredSteps.length;
  const correctQ = committedResult?.quizRecord.correctCount ?? 0;
  const missedSteps = answeredSteps.filter((s) => !s.isCorrect);

  return (
    <div className="space-y-6 max-w-4xl">
      <section className="p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
            <Trophy className="w-4 h-4" />
            Quiz Completed & Saved Locally
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            {correctQ} / {totalQ} Correct
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Quiz score: <span className="font-mono font-semibold">{committedResult?.quizRecord.score ?? 0}</span> pts ·
            Net XP added:{' '}
            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
              +{committedResult?.xpEarnedDelta ?? 0} XP
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {missedSteps.length > 0 && (
            <button
              type="button"
              onClick={onOpenMistakeReview}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-200 text-sm font-semibold inline-flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Review Mistakes ({missedSteps.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => setPhase('setup')}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2"
          >
            New Solo Quiz
          </button>
          <button
            type="button"
            onClick={onNavigateHome}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium"
          >
            Home
          </button>
        </div>
      </section>

      {/* Per-Question Breakdown */}
      <section className="space-y-4">
        <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
          Answer Review & Explanations
        </h3>
        <div className="space-y-3">
          {answeredSteps.map((step, idx) => (
            <article
              key={step.entry.question.id}
              className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  #{idx + 1} · {step.entry.question.gameTemplate} ·{' '}
                  {step.entry.question.unitId.toUpperCase()}
                </div>
                <span
                  className={`text-xs font-semibold inline-flex items-center gap-1 ${
                    step.isCorrect
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {step.isCorrect ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Correct
                    </>
                  ) : (
                    <>
                      <HelpCircle className="w-3.5 h-3.5" />
                      {step.timedOut ? 'Timed out' : 'Incorrect'}
                    </>
                  )}
                </span>
              </div>

              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {step.entry.question.prompt}
              </div>

              {!step.isCorrect && (
                <div className="text-xs text-rose-600 dark:text-rose-400">
                  Your answer:{' '}
                  {formatStudentAnswerDisplay(step.entry.question.id, step.answerPayload)}
                </div>
              )}

              {step.correctAnswerDisplay && (
                <div className="text-xs text-emerald-700 dark:text-emerald-300">
                  <span className="font-semibold">Answer: </span>
                  {step.correctAnswerDisplay}
                </div>
              )}

              {step.explanation && (
                <p className="text-xs text-slate-600 dark:text-slate-300">{step.explanation}</p>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
