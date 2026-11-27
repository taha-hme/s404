import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, HelpCircle, Lock, WifiOff } from 'lucide-react';
import type { Question, SubmissionDeliveryState } from '../types/league';

interface ActivityEngineProps {
  question: Question;
  mode: 'student' | 'projector';
  disabled?: boolean;
  deliveryState?: SubmissionDeliveryState;
  savedAnswer?: string;
  revealedAnswerText?: string;
  revealedExplanation?: string;
  isRevealed?: boolean;
  onSubmit?: (answerPayload: string) => void;
}

export function ActivityEngine({
  question,
  mode,
  disabled = false,
  deliveryState = 'idle',
  savedAnswer,
  revealedAnswerText,
  revealedExplanation,
  isRevealed = false,
  onSubmit,
}: ActivityEngineProps) {
  const [selectedOption, setSelectedOption] = useState<string>(savedAnswer ?? '');
  const [textAnswer, setTextAnswer] = useState<string>(savedAnswer ?? '');
  const [matchingMap, setMatchingMap] = useState<Record<string, string>>(() => {
    if (savedAnswer && question.activityType === 'vocab_matching') {
      try {
        return JSON.parse(savedAnswer) as Record<string, string>;
      } catch {
        return {};
      }
    }
    return {};
  });
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    setShowHint(false);
    if (savedAnswer !== undefined) {
      setSelectedOption(savedAnswer);
      setTextAnswer(savedAnswer);
      if (question.activityType === 'vocab_matching') {
        try {
          setMatchingMap(JSON.parse(savedAnswer) as Record<string, string>);
        } catch {
          setMatchingMap({});
        }
      }
    } else {
      setSelectedOption('');
      setTextAnswer('');
      setMatchingMap({});
    }
  }, [question.id, question.activityType, savedAnswer]);

  const isLocked =
    disabled ||
    mode === 'projector' ||
    deliveryState === 'confirmed' ||
    deliveryState === 'submitting' ||
    isRevealed;

  const handleConfirmSubmit = () => {
    if (!onSubmit || isLocked) return;
    if (question.activityType === 'multiple_choice' || question.activityType === 'true_false') {
      if (selectedOption === '') return;
      onSubmit(selectedOption);
      return;
    }
    if (question.activityType === 'vocab_matching') {
      const left = question.matchingLeft ?? [];
      if (left.some((item) => !matchingMap[item])) return;
      onSubmit(JSON.stringify(matchingMap));
      return;
    }
    if (textAnswer.trim().length === 0) return;
    onSubmit(textAnswer.trim());
  };

  const canSubmit = (() => {
    if (isLocked) return false;
    if (question.activityType === 'multiple_choice' || question.activityType === 'true_false') {
      return selectedOption !== '';
    }
    if (question.activityType === 'vocab_matching') {
      const left = question.matchingLeft ?? [];
      return left.length > 0 && left.every((item) => Boolean(matchingMap[item]));
    }
    return textAnswer.trim().length > 0;
  })();

  const isProjector = mode === 'projector';

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-medium text-blue-600 dark:text-blue-400">{question.gameTemplate}</span>
          <span aria-hidden="true">·</span>
          <span>{question.activityType.replace('_', ' ')}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{question.points} XP</span>
        </div>

        {question.context && (
          <p className="text-xs text-slate-500 dark:text-slate-400">{question.context}</p>
        )}

        <h3
          className={`font-display font-semibold text-slate-900 dark:text-slate-100 leading-snug ${
            isProjector ? 'text-2xl lg:text-3xl' : 'text-lg sm:text-xl'
          }`}
        >
          {question.prompt}
        </h3>
      </div>

      {/* Multiple Choice */}
      {question.activityType === 'multiple_choice' && (
        <div className={`grid gap-3 ${isProjector ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
          {(question.options ?? []).map((opt, idx) => {
            const idxStr = String(idx);
            const active = selectedOption === idxStr;
            const letter = String.fromCharCode(65 + idx);
            return (
              <button
                key={idx}
                type="button"
                disabled={isLocked}
                onClick={() => setSelectedOption(idxStr)}
                className={`min-h-[52px] w-full text-left px-4 py-3 rounded-xl border transition-colors flex items-start gap-3 ${
                  active
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-slate-900 dark:text-white'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'
                } ${isLocked ? 'cursor-default opacity-90' : 'cursor-pointer'}`}
              >
                <span
                  className={`mt-0.5 w-7 h-7 shrink-0 rounded-lg flex items-center justify-center font-mono text-xs font-semibold ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {letter}
                </span>
                <span className={isProjector ? 'text-lg' : 'text-sm sm:text-base'}>{opt}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* True / False */}
      {question.activityType === 'true_false' && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'True', val: 'true' },
            { label: 'False', val: 'false' },
          ].map((item) => {
            const active = selectedOption === item.val;
            return (
              <button
                key={item.val}
                type="button"
                disabled={isLocked}
                onClick={() => setSelectedOption(item.val)}
                className={`min-h-[56px] px-4 py-3 rounded-xl border font-semibold transition-colors ${
                  active
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-200'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'
                } ${isProjector ? 'text-xl' : 'text-base'}`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Sentence Completion */}
      {question.activityType === 'sentence_completion' && (
        <div className="space-y-2">
          <label
            htmlFor={`completion-${question.id}`}
            className="block text-xs font-medium text-slate-600 dark:text-slate-400"
          >
            Type the missing phrase
          </label>
          <input
            id={`completion-${question.id}`}
            type="text"
            disabled={isLocked}
            value={textAnswer}
            onChange={(e) => setTextAnswer(e.target.value)}
            placeholder={isProjector ? 'Students enter missing words on their phones...' : 'Enter your answer'}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      )}

      {/* Vocabulary Matching */}
      {question.activityType === 'vocab_matching' && (
        <div className="space-y-3">
          {(question.matchingLeft ?? []).map((term, i) => (
            <div
              key={term}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A]"
            >
              <span className={`font-medium text-slate-900 dark:text-slate-100 ${isProjector ? 'text-lg' : 'text-sm'}`}>
                {i + 1}. {term}
              </span>
              {isProjector ? (
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {question.matchingRight?.[i] ?? ''}
                </span>
              ) : (
                <select
                  aria-label={`Match for ${term}`}
                  disabled={isLocked}
                  value={matchingMap[term] ?? ''}
                  onChange={(e) =>
                    setMatchingMap((prev) => ({
                      ...prev,
                      [term]: e.target.value,
                    }))
                  }
                  className="sm:w-64 min-h-[44px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">Select matching definition...</option>
                  {(question.matchingRight ?? []).map((def) => (
                    <option key={def} value={def}>
                      {def}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Open-ended or Speaking/Writing */}
      {(question.activityType === 'open_ended' || question.activityType === 'speaking_writing') && (
        <div className="space-y-2">
          <label
            htmlFor={`open-${question.id}`}
            className="block text-xs font-medium text-slate-600 dark:text-slate-400"
          >
            {question.activityType === 'speaking_writing'
              ? 'Write your spoken pitch outline or full response (teacher-reviewed)'
              : 'Write your response (teacher-reviewed)'}
          </label>
          <textarea
            id={`open-${question.id}`}
            rows={4}
            disabled={isLocked}
            value={textAnswer}
            onChange={(e) => setTextAnswer(e.target.value)}
            placeholder={
              isProjector
                ? 'Students submit responses from their devices for live teacher grading...'
                : 'Write a clear, well-structured response...'
            }
            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      )}

      {/* Student Hint & Submit Controls */}
      {mode === 'student' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          {question.hint ? (
            <button
              type="button"
              onClick={() => setShowHint((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 self-start"
            >
              <HelpCircle className="w-4 h-4" />
              {showHint ? 'Hide hint' : 'Show hint'}
            </button>
          ) : (
            <span />
          )}

          {deliveryState === 'confirmed' ? (
            <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Answer confirmed and locked
            </div>
          ) : deliveryState === 'pending_offline' ? (
            <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm font-medium">
              <WifiOff className="w-4 h-4 shrink-0" />
              Saved locally — waiting for connection to confirm
            </div>
          ) : (
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleConfirmSubmit}
              className="min-h-[48px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white font-semibold text-sm transition-colors inline-flex items-center justify-center gap-2"
            >
              {deliveryState === 'submitting' ? (
                <>
                  <Clock className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : isRevealed ? (
                <>
                  <Lock className="w-4 h-4" />
                  Round closed
                </>
              ) : (
                'Submit Answer'
              )}
            </button>
          )}
        </div>
      )}

      {showHint && question.hint && (
        <div className="p-3.5 rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/70 dark:bg-violet-950/30 text-sm text-slate-700 dark:text-slate-200">
          <span className="font-semibold text-violet-700 dark:text-violet-300">Hint: </span>
          {question.hint}
        </div>
      )}

      {isRevealed && (revealedAnswerText || revealedExplanation) && (
        <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 space-y-1.5">
          <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            Official Answer Revealed
          </div>
          {revealedAnswerText && (
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {revealedAnswerText}
            </div>
          )}
          {revealedExplanation && (
            <p className="text-sm text-slate-600 dark:text-slate-300">{revealedExplanation}</p>
          )}
        </div>
      )}
    </div>
  );
}
