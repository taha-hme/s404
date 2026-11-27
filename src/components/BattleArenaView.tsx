import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  Pause,
  Play,
  SkipForward,
  Square,
  Swords,
  Users,
} from 'lucide-react';
import {
  ApiError,
  createBattleSession,
  gradeOpenEndedSubmission,
  joinSessionByPin,
  revealAndGradeQuestion,
  setSessionModeAndTeams,
  submitBattleAnswer,
  updateSessionState,
} from '../lib/leagueApi';
import {
  buildSubmissionId,
  enqueueOfflineAnswer,
  filterQuestions,
  GAME_TEMPLATES,
  pickBalancedQuestions,
  removeQueuedAnswer,
} from '../lib/leagueRules';
import type {
  AnswerKey,
  BattleSession,
  Question,
  QuestionDifficulty,
  QueuedBattleAnswer,
  SessionMode,
  SessionParticipant,
  StudentProfile,
  StudentSubmission,
  SubmissionDeliveryState,
  Unit,
  UserRole,
} from '../types/league';
import { ActivityEngine } from './ActivityEngine';
import { QrCodeSvg } from './QrCodeSvg';

const OFFLINE_QUEUE_KEY = 's404_offline_answers';

interface BattleArenaViewProps {
  role: UserRole;
  uid: string;
  student: StudentProfile | null;
  units: Unit[];
  questions: Question[];
  answerKeys: Record<string, AnswerKey>;
  sessions: BattleSession[];
  participantsBySession: Record<string, SessionParticipant[]>;
  submissionsBySession: Record<string, StudentSubmission[]>;
  isOnline: boolean;
  initialPin?: string;
  prefillLaunch?: { templateName: string; unitId: string } | null;
  onOfflineQueueChange: (count: number) => void;
  onRefreshState?: () => Promise<void>;
  onOpenTopicPractice?: (unitId: string) => void;
}

export function BattleArenaView({
  role,
  uid,
  student,
  units,
  questions,
  answerKeys,
  sessions,
  participantsBySession,
  submissionsBySession,
  isOnline,
  initialPin = '',
  prefillLaunch,
  onOfflineQueueChange,
  onRefreshState,
  onOpenTopicPractice,
}: BattleArenaViewProps) {
  // Teacher launch builder state
  const [selectedTemplate, setSelectedTemplate] = useState(
    prefillLaunch?.templateName ?? GAME_TEMPLATES[0].name
  );
  const [selectedUnitId, setSelectedUnitId] = useState(
    prefillLaunch?.unitId ?? units[0]?.id ?? 'unit-7'
  );
  const [sessionTitle, setSessionTitle] = useState('');
  const [launchMode, setLaunchMode] = useState<SessionMode>('individual');
  const [timerSec, setTimerSec] = useState<number>(45);
  const [selectedQIds, setSelectedQIds] = useState<string[]>([]);
  const [pickerDifficulty, setPickerDifficulty] = useState<'all' | QuestionDifficulty>('all');
  const [onlySelectedTemplate, setOnlySelectedTemplate] = useState<boolean>(true);

  // Active session selection
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [pinInput, setPinInput] = useState<string>(initialPin);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [copiedPin, setCopiedPin] = useState<boolean>(false);
  const [deliveryState, setDeliveryState] = useState<SubmissionDeliveryState>('idle');

  // Offline answer queue
  const [offlineQueue, setOfflineQueue] = useState<QueuedBattleAnswer[]>(() => {
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      return raw ? (JSON.parse(raw) as QueuedBattleAnswer[]) : [];
    } catch {
      return [];
    }
  });

  // Manual grading state for open-ended / speaking-writing
  const [manualGrades, setManualGrades] = useState<
    Record<string, { points: number; feedback: string }>
  >({});

  useEffect(() => {
    if (initialPin) {
      setPinInput(initialPin);
    }
  }, [initialPin]);

  useEffect(() => {
    if (prefillLaunch) {
      setSelectedTemplate(prefillLaunch.templateName);
      setSelectedUnitId(prefillLaunch.unitId);
    }
  }, [prefillLaunch]);

  useEffect(() => {
    onOfflineQueueChange(offlineQueue.length);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(offlineQueue));
  }, [offlineQueue, onOfflineQueueChange]);

  // Default question selection for chosen unit/template
  const matchingQuestions = useMemo(() => {
    const byUnit = questions.filter((q) => q.unitId === selectedUnitId);
    return byUnit.length > 0 ? byUnit : questions;
  }, [questions, selectedUnitId]);

  const filteredPickerQuestions = useMemo(
    () =>
      filterQuestions(matchingQuestions, {
        gameTemplate: onlySelectedTemplate ? selectedTemplate : 'all',
        difficulty: pickerDifficulty,
      }),
    [matchingQuestions, onlySelectedTemplate, selectedTemplate, pickerDifficulty]
  );

  useEffect(() => {
    const byTpl = matchingQuestions.filter((q) => q.gameTemplate === selectedTemplate);
    const pool = byTpl.length > 0 ? byTpl : matchingQuestions;
    setSelectedQIds(pickBalancedQuestions(pool, 5));
  }, [matchingQuestions, selectedTemplate]);

  // Auto-select latest live non-ended session for teacher or joined student
  const currentSession = useMemo(() => {
    if (activeSessionId) {
      return sessions.find((s) => s.id === activeSessionId) ?? null;
    }
    if (role === 'teacher') {
      return sessions.find((s) => s.status !== 'ended') ?? null;
    }
    return (
      sessions.find(
        (s) =>
          s.status !== 'ended' &&
          (participantsBySession[s.id] ?? []).some((p) => p.uid === uid)
      ) ?? null
    );
  }, [activeSessionId, participantsBySession, role, sessions, uid]);

  const participants = useMemo(
    () => (currentSession ? participantsBySession[currentSession.id] ?? [] : []),
    [currentSession, participantsBySession]
  );

  const submissions = useMemo(
    () => (currentSession ? submissionsBySession[currentSession.id] ?? [] : []),
    [currentSession, submissionsBySession]
  );

  // Flush offline answers safely when connectivity returns
  useEffect(() => {
    if (!isOnline || offlineQueue.length === 0) return;
    let cancelled = false;

    const flush = async () => {
      for (const item of offlineQueue) {
        if (cancelled) break;
        try {
          await submitBattleAnswer({
            sessionId: item.sessionId,
            questionId: item.questionId,
            activityType: item.activityType,
            answerPayload: item.answerPayload,
          });
          setOfflineQueue((prev) =>
            removeQueuedAnswer(prev, item.sessionId, item.submissionId)
          );
          setDeliveryState('confirmed');
          await onRefreshState?.();
        } catch (err) {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
            setOfflineQueue((prev) =>
              removeQueuedAnswer(prev, item.sessionId, item.submissionId)
            );
            await onRefreshState?.();
          }
          // Keep in queue only for network / 5xx errors
        }
      }
    };
    flush();
    return () => {
      cancelled = true;
    };
  }, [isOnline, offlineQueue, onRefreshState]);

  const currentQuestion = useMemo(() => {
    if (!currentSession?.currentQuestionId) return null;
    return questions.find((q) => q.id === currentSession.currentQuestionId) ?? null;
  }, [currentSession?.currentQuestionId, questions]);

  const mySubmission = useMemo(() => {
    if (!currentQuestion) return null;
    return (
      submissions.find((s) => s.questionId === currentQuestion.id && s.uid === uid) ?? null
    );
  }, [submissions, currentQuestion, uid]);

  useEffect(() => {
    if (!currentQuestion) {
      setDeliveryState('idle');
      return;
    }
    if (mySubmission) {
      setDeliveryState('confirmed');
      return;
    }
    const subId = buildSubmissionId(currentQuestion.id, uid);
    const queued = offlineQueue.some(
      (q) => q.sessionId === currentSession?.id && q.submissionId === subId
    );
    setDeliveryState(queued ? 'pending_offline' : 'idle');
  }, [currentQuestion, mySubmission, offlineQueue, currentSession?.id, uid]);

  const handleCreateSession = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedQIds.length === 0) return;
    setBusy(true);
    try {
      const created = await createBattleSession({
        title: sessionTitle.trim() || `${selectedTemplate} Live Round`,
        gameTemplate: selectedTemplate,
        unitId: selectedUnitId,
        mode: launchMode,
        questionIds: selectedQIds,
        timerSeconds: timerSec,
      });
      await onRefreshState?.();
      setActiveSessionId(created.id);
    } finally {
      setBusy(false);
    }
  };

  const handleJoinByPin = async (e?: FormEvent, overridePin?: string) => {
    if (e) e.preventDefault();
    if (!student) return;
    setJoinError(null);
    setBusy(true);
    try {
      const session = await joinSessionByPin(overridePin ?? pinInput);
      await onRefreshState?.();
      setActiveSessionId(session.id);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Unable to join session.');
    } finally {
      setBusy(false);
    }
  };

  const handleStudentSubmit = async (answerPayload: string) => {
    if (!currentSession || !currentQuestion || !student) return;
    const submissionId = buildSubmissionId(currentQuestion.id, uid);

    if (!isOnline) {
      setOfflineQueue((prev) =>
        enqueueOfflineAnswer(prev, {
          submissionId,
          sessionId: currentSession.id,
          questionId: currentQuestion.id,
          uid,
          studentId: student.id,
          studentName: student.displayName,
          activityType: currentQuestion.activityType,
          answerPayload,
          queuedAtIso: new Date().toISOString(),
        })
      );
      setDeliveryState('pending_offline');
      return;
    }

    setDeliveryState('submitting');
    try {
      await submitBattleAnswer({
        sessionId: currentSession.id,
        questionId: currentQuestion.id,
        activityType: currentQuestion.activityType,
        answerPayload,
      });
      await onRefreshState?.();
      setDeliveryState('confirmed');
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        setJoinError(err.message);
        setDeliveryState('idle');
        await onRefreshState?.();
        return;
      }
      setOfflineQueue((prev) =>
        enqueueOfflineAnswer(prev, {
          submissionId,
          sessionId: currentSession.id,
          questionId: currentQuestion.id,
          uid,
          studentId: student.id,
          studentName: student.displayName,
          activityType: currentQuestion.activityType,
          answerPayload,
          queuedAtIso: new Date().toISOString(),
        })
      );
      setDeliveryState('pending_offline');
    }
  };

  const joinUrl = currentSession
    ? `${window.location.origin}/?pin=${currentSession.pin}`
    : window.location.origin;

  // ---------- Student Join Screen when not in a session ----------
  if (role === 'student' && (!currentSession || currentSession.status === 'ended')) {
    const liveSessions = sessions.filter((s) => s.status !== 'ended');
    return (
      <div className="space-y-8">
        <div className="max-w-xl mx-auto space-y-6">
          <form
            onSubmit={(e) => handleJoinByPin(e)}
            className="p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-5"
          >
            <div className="space-y-1">
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                Join Classroom Game
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Enter the 6-character Game PIN shown on the classroom screen.
              </p>
            </div>

            {joinError && (
              <div
                role="alert"
                className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-sm text-rose-800 dark:text-rose-200"
              >
                {joinError}
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="arena-room-pin"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Game PIN
              </label>
              <input
                id="arena-room-pin"
                type="text"
                required
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.toUpperCase())}
                placeholder="e.g. K7M4P2"
                className="w-full min-h-[52px] px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-xl tracking-widest uppercase text-center text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm transition-colors inline-flex items-center justify-center gap-2"
            >
              <Swords className="w-4 h-4" />
              {busy ? 'Joining...' : 'Join Game'}
            </button>
          </form>

          {liveSessions.length > 0 && (
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Open Games
              </h3>
              <div className="space-y-2">
                {liveSessions.map((sess) => (
                  <div
                    key={sess.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-sm font-semibold">{sess.title}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {sess.gameTemplate} · PIN {sess.pin} · {sess.status}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleJoinByPin(undefined, sess.pin)}
                      className="min-h-[40px] px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                    >
                      Join
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Topics & Game Modes Overview */}
        <section className="space-y-4">
          <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            Topics
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {units.map((u) => (
              <div
                key={u.id}
                className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-2 flex flex-col justify-between"
              >
                <div className="space-y-1">
                  <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
                    Unit {u.number}
                  </div>
                  <div className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                    {u.title}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {u.description}
                  </p>
                </div>
                {onOpenTopicPractice && (
                  <button
                    type="button"
                    onClick={() => onOpenTopicPractice(u.id)}
                    className="self-start pt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Practice this topic
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            Classroom Game Modes
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {GAME_TEMPLATES.map((tpl) => (
              <div
                key={tpl.name}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-1"
              >
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  {tpl.name}
                </div>
                <div className="text-xs text-blue-600 dark:text-blue-400">{tpl.tagline}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{tpl.description}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  // ---------- Teacher Session Launcher when no active session ----------
  if (role === 'teacher' && (!currentSession || currentSession.status === 'ended')) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleCreateSession}
          className="lg:col-span-7 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-5"
        >
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Start Classroom Game
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              Pick a game mode, topic, and questions to generate a PIN and QR code.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="launch-template" className="block text-xs font-medium">
                Game Mode
              </label>
              <select
                id="launch-template"
                value={selectedTemplate}
                onChange={(e) => {
                  const tpl = GAME_TEMPLATES.find((t) => t.name === e.target.value);
                  setSelectedTemplate(e.target.value);
                  if (tpl) setTimerSec(tpl.defaultTimerSec);
                }}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
              >
                {GAME_TEMPLATES.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="launch-unit" className="block text-xs font-medium">
                Topic
              </label>
              <select
                id="launch-unit"
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    Unit {u.number}: {u.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <label htmlFor="launch-title" className="block text-xs font-medium">
                Session Title
              </label>
              <input
                id="launch-title"
                type="text"
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                placeholder={`${selectedTemplate} Live Round`}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="launch-timer" className="block text-xs font-medium">
                Timer (seconds)
              </label>
              <input
                id="launch-timer"
                type="number"
                min={10}
                max={300}
                value={timerSec}
                onChange={(e) => setTimerSec(Number(e.target.value) || 45)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium">Competition Mode</div>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { id: 'individual', label: 'Individual (1 vs All)' },
                  { id: 'team', label: 'Team Battle (2 vs 3)' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setLaunchMode(m.id)}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-sm font-medium transition-colors ${
                    launchMode === m.id
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-medium">
                Questions Included ({selectedQIds.length} selected · {filteredPickerQuestions.length}{' '}
                shown)
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlySelectedTemplate}
                    onChange={(e) => setOnlySelectedTemplate(e.target.checked)}
                  />
                  Match mode only
                </label>
                <select
                  aria-label="Filter session questions by difficulty"
                  value={pickerDifficulty}
                  onChange={(e) =>
                    setPickerDifficulty(e.target.value as 'all' | QuestionDifficulty)
                  }
                  className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
                >
                  <option value="all">All levels</option>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedQIds(pickBalancedQuestions(filteredPickerQuestions, 5))
                  }
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Pick 5 balanced
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedQIds(filteredPickerQuestions.map((q) => q.id))}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Select shown
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedQIds([])}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
              {filteredPickerQuestions.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                  No questions match this mode and difficulty filter.
                </p>
              ) : (
                filteredPickerQuestions.map((q) => {
                  const checked = selectedQIds.includes(q.id);
                  return (
                    <label
                      key={q.id}
                      className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedQIds((prev) =>
                            checked ? prev.filter((id) => id !== q.id) : [...prev, q.id]
                          )
                        }
                        className="mt-1"
                      />
                      <div className="text-sm min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100 line-clamp-1">
                          {q.prompt}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {q.gameTemplate} · {q.difficulty ?? 'Medium'} ·{' '}
                          {q.topicTag ? `${q.topicTag} · ` : ''}
                          {q.activityType.replace('_', ' ')} · {q.points} XP
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || selectedQIds.length === 0}
            className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
          >
            {busy ? 'Creating Room...' : 'Create Classroom Session'}
          </button>
        </form>

        {/* Recent Sessions History */}
        <section className="lg:col-span-5 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4">
          <h3 className="font-display text-lg font-semibold">Recent Sessions</h3>
          {sessions.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No Battle Arena sessions created yet. Launch your first live game on the left.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {sessions.slice(0, 6).map((s) => (
                <div key={s.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{s.title}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      PIN {s.pin} · {s.status}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSessionId(s.id)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Inspect
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  // ---------- Active Session View (Teacher Projector OR Student Phone) ----------
  const questionSubs = currentQuestion
    ? submissions.filter((s) => s.questionId === currentQuestion.id)
    : [];
  const nextIndex = (currentSession?.currentQuestionIndex ?? 0) + 1;
  const hasNextQuestion = Boolean(
    currentSession && nextIndex < currentSession.questionIds.length
  );

  return (
    <div className="space-y-6">
      {/* Top Session Control Strip */}
      <section className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center gap-2">
            <span>{currentSession!.gameTemplate}</span>
            <span aria-hidden="true">·</span>
            <span className="uppercase font-mono">PIN {currentSession!.pin}</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{currentSession!.status}</span>
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            {currentSession!.title}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 font-mono text-sm font-semibold tabular-nums inline-flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" />
            {currentSession!.remainingSeconds}s
          </div>

          <div className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 font-mono text-sm tabular-nums inline-flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-500" />
            {participants.length} joined
          </div>

          {role === 'teacher' && (
            <div className="flex flex-wrap items-center gap-2">
              {currentSession!.status === 'waiting' && (
                <button
                  type="button"
                  onClick={() =>
                    updateSessionState(currentSession!.id, {
                      status: 'active',
                      remainingSeconds: currentSession!.timerSeconds,
                    }).then(() => onRefreshState?.())
                  }
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-1.5"
                >
                  <Play className="w-4 h-4" />
                  Start Session
                </button>
              )}

              {currentSession!.status === 'active' && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      updateSessionState(currentSession!.id, { status: 'paused' }).then(() =>
                        onRefreshState?.()
                      )
                    }
                    className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium inline-flex items-center gap-1.5"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>
                  {currentQuestion && (
                    <button
                      type="button"
                      onClick={() =>
                        revealAndGradeQuestion(currentSession!.id).then(() => onRefreshState?.())
                      }
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold inline-flex items-center gap-1.5"
                    >
                      <Eye className="w-4 h-4" />
                      Reveal Answer
                    </button>
                  )}
                </>
              )}

              {currentSession!.status === 'paused' && (
                <button
                  type="button"
                  onClick={() =>
                    updateSessionState(currentSession!.id, { status: 'active' }).then(() =>
                      onRefreshState?.()
                    )
                  }
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-1.5"
                >
                  <Play className="w-4 h-4" />
                  Resume
                </button>
              )}

              {currentSession!.status === 'revealed' && hasNextQuestion && (
                <button
                  type="button"
                  onClick={() => {
                    const nextQId = currentSession!.questionIds[nextIndex];
                    const nextQ = questions.find((q) => q.id === nextQId);
                    const nextTimer = nextQ?.timeLimitSec ?? currentSession!.timerSeconds;
                    updateSessionState(currentSession!.id, {
                      status: 'active',
                      currentQuestionIndex: nextIndex,
                      currentQuestionId: nextQId,
                      timerSeconds: nextTimer,
                      remainingSeconds: nextTimer,
                      revealedAnswerText: '',
                      revealedExplanation: '',
                    }).then(() => onRefreshState?.());
                  }}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-1.5"
                >
                  <SkipForward className="w-4 h-4" />
                  Next Question
                </button>
              )}

              {currentSession!.status !== 'ended' && (
                <button
                  type="button"
                  onClick={() =>
                    updateSessionState(currentSession!.id, { status: 'ended' }).then(async () => {
                      await onRefreshState?.();
                      setActiveSessionId('');
                    })
                  }
                  className="min-h-[42px] px-3.5 py-2 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-sm font-medium inline-flex items-center gap-1.5"
                >
                  <Square className="w-3.5 h-3.5" />
                  End
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Waiting Room */}
      {currentSession!.status === 'waiting' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {role === 'teacher' && (
            <section className="lg:col-span-5 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] flex flex-col items-center text-center space-y-4">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Scan on student smartphone
              </div>
              <QrCodeSvg value={joinUrl} size={196} label={`Join PIN ${currentSession!.pin}`} />
              <div className="space-y-1">
                <div className="font-mono text-3xl font-bold tracking-widest text-slate-900 dark:text-white">
                  {currentSession!.pin}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(joinUrl);
                    setCopiedPin(true);
                    setTimeout(() => setCopiedPin(false), 1800);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedPin ? 'Join link copied' : 'Copy join link'}
                </button>
              </div>
            </section>
          )}

          <section
            className={`${
              role === 'teacher' ? 'lg:col-span-7' : 'lg:col-span-12'
            } p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-5`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold">Waiting Room Lobby</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {role === 'teacher'
                    ? 'Assign Individual or Team (2 vs 3) mode before starting.'
                    : 'Waiting for your teacher to start the first round...'}
                </p>
              </div>

              {role === 'teacher' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSessionModeAndTeams(currentSession!.id, 'individual').then(() =>
                        onRefreshState?.()
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                      currentSession!.mode === 'individual'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Individual
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSessionModeAndTeams(currentSession!.id, 'team').then(() =>
                        onRefreshState?.()
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                      currentSession!.mode === 'team'
                        ? 'border-violet-600 bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Teams (2 vs 3)
                  </button>
                </div>
              )}
            </div>

            {participants.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No students have joined this room yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {participants.map((p) => (
                  <div
                    key={p.uid}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                  >
                    <span className="font-medium text-sm">{p.displayName}</span>
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {currentSession!.mode === 'team'
                        ? p.team === 'A'
                          ? 'Team A'
                          : 'Team B'
                        : 'Individual'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Active / Paused / Revealed Stage */}
      {currentSession!.status !== 'waiting' && currentQuestion && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Question Stage */}
          <section className="lg:col-span-8 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-6">
            <div className="flex items-center justify-between text-xs font-mono text-slate-500 dark:text-slate-400">
              <span>
                Question {currentSession!.currentQuestionIndex + 1} of{' '}
                {currentSession!.questionIds.length}
              </span>
              {role === 'teacher' && (
                <span>
                  {questionSubs.length} / {participants.length} submitted
                </span>
              )}
            </div>

            <ActivityEngine
              question={currentQuestion}
              mode={role === 'teacher' ? 'projector' : 'student'}
              disabled={currentSession!.status !== 'active'}
              deliveryState={deliveryState}
              savedAnswer={mySubmission?.answerPayload}
              isRevealed={currentSession!.status === 'revealed'}
              revealedAnswerText={currentSession!.revealedAnswerText}
              revealedExplanation={currentSession!.revealedExplanation}
              onSubmit={handleStudentSubmit}
            />

            {/* Student Result After Reveal */}
            {role === 'student' && currentSession!.status === 'revealed' && mySubmission && (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2
                    className={`w-4 h-4 ${
                      mySubmission.isCorrect ? 'text-emerald-500' : 'text-amber-500'
                    }`}
                  />
                  {mySubmission.isGraded
                    ? mySubmission.isCorrect
                      ? 'Marked correct'
                      : 'Reviewed'
                    : 'Awaiting teacher open-ended review'}
                </div>
                <span className="font-mono text-sm font-bold tabular-nums text-blue-600 dark:text-blue-400">
                  +{mySubmission.pointsAwarded} XP
                </span>
              </div>
            )}

            {/* Teacher Live Submissions & Open-Ended Grading */}
            {role === 'teacher' && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <h4 className="text-sm font-semibold">Student Submissions ({questionSubs.length})</h4>
                {questionSubs.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Waiting for students to submit from their devices...
                  </p>
                ) : (
                  <div className="space-y-3">
                    {questionSubs.map((sub) => {
                      const needsManual =
                        sub.activityType === 'open_ended' ||
                        sub.activityType === 'speaking_writing';
                      const draft = manualGrades[sub.id] ?? {
                        points: sub.pointsAwarded || currentQuestion.points,
                        feedback: sub.teacherFeedback ?? '',
                      };
                      return (
                        <div
                          key={sub.id}
                          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold">{sub.studentName}</span>
                            <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                              {sub.isGraded
                                ? `${sub.pointsAwarded} pts`
                                : 'Submitted'}
                            </span>
                          </div>
                          {(currentSession!.status === 'revealed' || needsManual) && (
                            <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/70 p-2.5 rounded-lg">
                              {sub.activityType === 'multiple_choice' && currentQuestion.options
                                ? (() => {
                                    const idx = Number(sub.answerPayload);
                                    const opt = currentQuestion.options[idx];
                                    return opt
                                      ? `${String.fromCharCode(65 + idx)}: ${opt}`
                                      : sub.answerPayload;
                                  })()
                                : sub.answerPayload}
                            </p>
                          )}
                          {needsManual && (
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <input
                                type="number"
                                min={0}
                                max={1000}
                                value={draft.points}
                                onChange={(e) =>
                                  setManualGrades((prev) => ({
                                    ...prev,
                                    [sub.id]: {
                                      ...draft,
                                      points: Number(e.target.value) || 0,
                                    },
                                  }))
                                }
                                className="w-24 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-xs"
                              />
                              <input
                                type="text"
                                placeholder="Short teacher note..."
                                value={draft.feedback}
                                onChange={(e) =>
                                  setManualGrades((prev) => ({
                                    ...prev,
                                    [sub.id]: { ...draft, feedback: e.target.value },
                                  }))
                                }
                                className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  gradeOpenEndedSubmission({
                                    sessionId: currentSession!.id,
                                    submissionId: sub.id,
                                    isCorrect: draft.points > 0,
                                    pointsAwarded: draft.points,
                                    feedback: draft.feedback,
                                  }).then(() => onRefreshState?.())
                                }
                                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                              >
                                {sub.isGraded ? 'Update Score' : 'Approve Score'}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Live Session Scoreboard */}
          <aside className="lg:col-span-4 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-5">
            <h3 className="font-display text-lg font-semibold">Live Scoreboard</h3>

            {currentSession!.mode === 'team' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30">
                  <div className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                    {currentSession!.teamNames.A}
                  </div>
                  <div className="font-mono text-2xl font-bold tabular-nums mt-1">
                    {currentSession!.teamScores?.A ?? 0}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/60 dark:bg-violet-950/30">
                  <div className="text-xs text-violet-700 dark:text-violet-300 font-medium">
                    {currentSession!.teamNames.B}
                  </div>
                  <div className="font-mono text-2xl font-bold tabular-nums mt-1">
                    {currentSession!.teamScores?.B ?? 0}
                  </div>
                </div>
              </div>
            )}

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {participants.map((p, idx) => (
                <div key={p.uid} className="py-2.5 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs text-slate-400 tabular-nums">
                      #{idx + 1}
                    </span>
                    <span className="font-medium truncate">{p.displayName}</span>
                    {currentSession!.mode === 'team' && (
                      <span className="text-xs text-slate-500">({p.team})</span>
                    )}
                  </div>
                  <span className="font-mono font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                    {p.sessionScore}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
