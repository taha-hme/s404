import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Award, Check, KeyRound, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import {
  awardManualXp,
  createStudentAccount,
  deleteQuestionWithKey,
  deleteStudentAccount,
  editStudentUsername,
  grantAchievementBadge,
  resetStudentPassword,
  reviewPracticeAttempt,
  saveQuestionWithKey,
  updateStudentTeam,
} from '../lib/leagueApi';
import { BADGE_CATALOG, filterQuestions, GAME_TEMPLATES } from '../lib/leagueRules';
import type {
  ActivityType,
  AnswerKey,
  BadgeKey,
  BattleSession,
  OfficialScore,
  PracticeProgress,
  Question,
  QuestionDifficulty,
  ScoreEvent,
  SessionParticipant,
  StudentProfile,
  StudentSubmission,
  Unit,
} from '../types/league';
import { BattleArenaView } from './BattleArenaView';

interface TeacherConsoleViewProps {
  teacherUid: string;
  students: StudentProfile[];
  officialScores: OfficialScore[];
  scoreEvents: ScoreEvent[];
  units: Unit[];
  questions: Question[];
  answerKeys: Record<string, AnswerKey>;
  sessions: BattleSession[];
  participantsBySession: Record<string, SessionParticipant[]>;
  submissionsBySession: Record<string, StudentSubmission[]>;
  practiceProgress: PracticeProgress[];
  isOnline: boolean;
  onOfflineQueueChange: (count: number) => void;
  onRefreshState?: () => Promise<void>;
}

type PanelTab = 'students' | 'questions' | 'games' | 'results';

export function TeacherConsoleView({
  teacherUid,
  students,
  officialScores,
  scoreEvents,
  units,
  questions,
  answerKeys,
  sessions,
  participantsBySession,
  submissionsBySession,
  practiceProgress,
  isOnline,
  onOfflineQueueChange,
  onRefreshState,
}: TeacherConsoleViewProps) {
  const [tab, setTab] = useState<PanelTab>('students');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Create student form
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newTeam, setNewTeam] = useState<'A' | 'B'>('A');
  const [studentBusy, setStudentBusy] = useState(false);

  // Inline student actions
  const [editingUsernameId, setEditingUsernameId] = useState<string | null>(null);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Question builder form
  const [qUnitId, setQUnitId] = useState(units[0]?.id ?? 'unit-7');
  const [qTemplate, setQTemplate] = useState<string>(GAME_TEMPLATES[0].name);
  const [qType, setQType] = useState<ActivityType>('multiple_choice');
  const [qDifficulty, setQDifficulty] = useState<QuestionDifficulty>('Medium');
  const [qSkillTag, setQSkillTag] = useState('Grammar');
  const [qTopicTag, setQTopicTag] = useState('');
  const [qLearningObj, setQLearningObj] = useState('');
  const [qPrompt, setQPrompt] = useState('');
  const [qOptionsRaw, setQOptionsRaw] = useState('Option A\nOption B\nOption C\nOption D');
  const [qCorrectIdx, setQCorrectIdx] = useState(0);
  const [qCorrectBool, setQCorrectBool] = useState(true);
  const [qAcceptedRaw, setQAcceptedRaw] = useState('');
  const [qExplanation, setQExplanation] = useState('');
  const [qHint, setQHint] = useState('');
  const [qPoints, setQPoints] = useState(100);

  // Question Bank filters
  const [filterUnit, setFilterUnit] = useState<string>('all');
  const [filterTemplate, setFilterTemplate] = useState<string>('all');
  const [filterDifficulty, setFilterDifficulty] = useState<'all' | QuestionDifficulty>('all');
  const [filterSkill, setFilterSkill] = useState<string>('all');
  const [filterSearch, setFilterSearch] = useState<string>('');

  // Scores & Results forms
  const [bonusStudentId, setBonusStudentId] = useState('');
  const [bonusPoints, setBonusPoints] = useState(25);
  const [bonusReason, setBonusReason] = useState('Class speaking contribution');
  const [badgeStudentId, setBadgeStudentId] = useState('');
  const [badgeKey, setBadgeKey] = useState<BadgeKey>('smooth_talker');
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { xp: number; fb: string }>>({});

  const flashTimerRef = useRef<number | null>(null);

  const flash = (msg: string) => {
    if (flashTimerRef.current !== null) {
      window.clearTimeout(flashTimerRef.current);
    }
    setErrorMsg(null);
    setStatusMsg(msg);
    flashTimerRef.current = window.setTimeout(() => {
      setStatusMsg(null);
      flashTimerRef.current = null;
    }, 4000);
  };

  const showError = (err: unknown, fallback: string) => {
    if (flashTimerRef.current !== null) {
      window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    setStatusMsg(null);
    setErrorMsg(err instanceof Error ? err.message : fallback);
  };

  const handleCreateStudent = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStudentBusy(true);
    try {
      await createStudentAccount({
        username: newUsername,
        password: newPassword,
        teamDefault: newTeam,
      });
      await onRefreshState?.();
      flash(`Student account "${newUsername.trim().toLowerCase()}" created.`);
      setNewUsername('');
      setNewPassword('');
    } catch (err) {
      showError(err, 'Unable to create student account.');
    } finally {
      setStudentBusy(false);
    }
  };

  const handleSaveUsername = async (student: StudentProfile) => {
    setErrorMsg(null);
    setStudentBusy(true);
    try {
      await editStudentUsername({ studentId: student.id, newUsername: usernameDraft });
      await onRefreshState?.();
      setEditingUsernameId(null);
      flash(`Username updated to "${usernameDraft.trim().toLowerCase()}".`);
    } catch (err) {
      showError(err, 'Unable to update username.');
    } finally {
      setStudentBusy(false);
    }
  };

  const handleSavePassword = async (student: StudentProfile) => {
    setErrorMsg(null);
    setStudentBusy(true);
    try {
      await resetStudentPassword({ studentId: student.id, newPassword: passwordDraft });
      await onRefreshState?.();
      setResetPasswordId(null);
      setPasswordDraft('');
      flash(`Password updated for "${student.username}".`);
    } catch (err) {
      showError(err, 'Unable to reset password.');
    } finally {
      setStudentBusy(false);
    }
  };

  const handleDeleteStudent = async (student: StudentProfile) => {
    setErrorMsg(null);
    setStudentBusy(true);
    try {
      await deleteStudentAccount(student.id);
      await onRefreshState?.();
      setConfirmDeleteId(null);
      flash(`Removed student account "${student.username}".`);
    } catch (err) {
      showError(err, 'Unable to delete student account.');
    } finally {
      setStudentBusy(false);
    }
  };

  const handleCreateQuestion = async (e: FormEvent) => {
    e.preventDefault();
    if (!qPrompt.trim()) return;
    setErrorMsg(null);
    const id = `q_${Date.now()}`;
    const options =
      qType === 'multiple_choice'
        ? qOptionsRaw
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 6)
        : qType === 'true_false'
        ? ['True', 'False']
        : undefined;

    try {
      await saveQuestionWithKey(
        {
          id,
          classId: 'S404',
          unitId: qUnitId,
          gameTemplate: qTemplate,
          activityType: qType,
          difficulty: qDifficulty,
          skillTag: qSkillTag.trim() || 'General',
          topicTag: qTopicTag.trim() || 'Classroom Practice',
          learningObjective: qLearningObj.trim() || undefined,
          prompt: qPrompt.trim(),
          options,
          hint: qHint.trim() || undefined,
          points: qPoints,
          timeLimitSec: 45,
          teacherReviewed: qType === 'open_ended' || qType === 'speaking_writing',
        },
        {
          questionId: id,
          correctOptionIndex: qType === 'multiple_choice' ? qCorrectIdx : undefined,
          correctBoolean: qType === 'true_false' ? qCorrectBool : undefined,
          acceptedAnswers:
            qType === 'sentence_completion'
              ? qAcceptedRaw
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : undefined,
          rubric:
            qType === 'open_ended' || qType === 'speaking_writing'
              ? qExplanation.trim() || 'Teacher rubric'
              : undefined,
          explanation: qExplanation.trim() || 'Reviewed by teacher.',
        },
        true
      );
      await onRefreshState?.();
      setQPrompt('');
      setQExplanation('');
      setQHint('');
      setQTopicTag('');
      setQLearningObj('');
      flash('Question and teacher answer key saved.');
    } catch (err) {
      showError(err, 'Unable to save question.');
    }
  };

  const handleAwardBonus = async (e: FormEvent) => {
    e.preventDefault();
    const stu = students.find((s) => s.id === (bonusStudentId || students[0]?.id));
    if (!stu) return;
    try {
      await awardManualXp({
        studentId: stu.id,
        points: bonusPoints,
        reason: bonusReason,
        source: 'bonus',
      });
      await onRefreshState?.();
      flash(`Awarded ${bonusPoints} XP to ${stu.displayName}.`);
    } catch (err) {
      showError(err, 'Unable to award XP.');
    }
  };

  const handleGrantBadge = async (e: FormEvent) => {
    e.preventDefault();
    const stuId = badgeStudentId || students[0]?.id;
    if (!stuId) return;
    try {
      await grantAchievementBadge({ studentId: stuId, badgeKey });
      await onRefreshState?.();
      flash('Badge granted.');
    } catch (err) {
      showError(err, 'Unable to grant badge.');
    }
  };

  const availableSkills = useMemo(() => {
    const set = new Set<string>();
    for (const q of questions) {
      if (q.skillTag) set.add(q.skillTag);
    }
    return Array.from(set).sort();
  }, [questions]);

  const filteredQuestions = useMemo(
    () =>
      filterQuestions(questions, {
        unitId: filterUnit,
        gameTemplate: filterTemplate,
        difficulty: filterDifficulty,
        skillTag: filterSkill,
        search: filterSearch,
      }),
    [questions, filterUnit, filterTemplate, filterDifficulty, filterSkill, filterSearch]
  );

  const hasActiveQuestionFilters =
    filterUnit !== 'all' ||
    filterTemplate !== 'all' ||
    filterDifficulty !== 'all' ||
    filterSkill !== 'all' ||
    filterSearch.trim().length > 0;

  const pendingReviews = practiceProgress.filter((p) => p.needsTeacherReview);
  const unreviewedCount = pendingReviews.filter((r) => !r.teacherReviewed).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Teacher Panel
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Manage student accounts, questions, classroom games, and scores.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          {(
            [
              { id: 'students', label: 'Students' },
              { id: 'questions', label: 'Questions' },
              { id: 'games', label: 'Classroom Games' },
              {
                id: 'results',
                label: unreviewedCount > 0 ? `Scores and Results (${unreviewedCount})` : 'Scores and Results',
              },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-sm text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          {statusMsg}
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-sm text-rose-800 dark:text-rose-200"
        >
          {errorMsg}
        </div>
      )}

      {/* 1. STUDENTS TAB */}
      {tab === 'students' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateStudent}
            className="lg:col-span-4 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4 self-start"
          >
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h3 className="font-display text-lg font-semibold">Create Student Account</h3>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="new-student-username" className="block text-xs font-medium">
                Username
              </label>
              <input
                id="new-student-username"
                type="text"
                required
                minLength={2}
                maxLength={32}
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="e.g. sara"
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="new-student-password" className="block text-xs font-medium">
                Password
              </label>
              <input
                id="new-student-password"
                type="password"
                required
                minLength={4}
                maxLength={128}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 4 characters"
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="new-student-team" className="block text-xs font-medium">
                Default Team (2 vs 3)
              </label>
              <select
                id="new-student-team"
                value={newTeam}
                onChange={(e) => setNewTeam(e.target.value as 'A' | 'B')}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
              >
                <option value="A">Team A — Blue Vanguard</option>
                <option value="B">Team B — Violet Syndicate</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={studentBusy}
              className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {studentBusy ? 'Saving...' : 'Create Student'}
            </button>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pt-1">
              Passwords are salted and hashed on the server. Resetting a password immediately signs
              out the old credential while preserving all XP and scores.
            </p>
          </form>

          <section className="lg:col-span-8 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4">
            <h3 className="font-display text-lg font-semibold">
              Students ({students.length})
            </h3>

            {students.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No student accounts created yet. Use the form on the left to add your 5 students.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {students.map((stu) => {
                  const score = officialScores.find((s) => s.studentId === stu.id);
                  const isEditingUser = editingUsernameId === stu.id;
                  const isResettingPw = resetPasswordId === stu.id;
                  const isConfirmDelete = confirmDeleteId === stu.id;

                  return (
                    <div key={stu.id} className="py-4 first:pt-0 last:pb-0 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-sm text-slate-900 dark:text-white">
                            {stu.username}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                            Team {stu.teamDefault} · {score?.xp ?? 0} XP
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setResetPasswordId(null);
                              setConfirmDeleteId(null);
                              setEditingUsernameId(isEditingUser ? null : stu.id);
                              setUsernameDraft(stu.username);
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit Username
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingUsernameId(null);
                              setConfirmDeleteId(null);
                              setResetPasswordId(isResettingPw ? null : stu.id);
                              setPasswordDraft('');
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <KeyRound className="w-3 h-3" />
                            Reset Password
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              updateStudentTeam(stu.id, stu.teamDefault === 'A' ? 'B' : 'A').then(
                                () => onRefreshState?.()
                              )
                            }
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Team {stu.teamDefault === 'A' ? 'B' : 'A'}
                          </button>

                          <button
                            type="button"
                            aria-label={`Delete ${stu.username}`}
                            onClick={() => {
                              setEditingUsernameId(null);
                              setResetPasswordId(null);
                              setConfirmDeleteId(isConfirmDelete ? null : stu.id);
                            }}
                            className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {isEditingUser && (
                        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                          <label htmlFor={`edit-user-${stu.id}`} className="sr-only">
                            New username for {stu.username}
                          </label>
                          <input
                            id={`edit-user-${stu.id}`}
                            type="text"
                            value={usernameDraft}
                            onChange={(e) => setUsernameDraft(e.target.value)}
                            placeholder="New username"
                            className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                          />
                          <button
                            type="button"
                            disabled={studentBusy}
                            onClick={() => handleSaveUsername(stu)}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingUsernameId(null)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      {isResettingPw && (
                        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                          <label htmlFor={`reset-pw-${stu.id}`} className="sr-only">
                            New password for {stu.username}
                          </label>
                          <input
                            id={`reset-pw-${stu.id}`}
                            type="password"
                            minLength={4}
                            value={passwordDraft}
                            onChange={(e) => setPasswordDraft(e.target.value)}
                            placeholder="New password (min 4 chars)"
                            className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                          />
                          <button
                            type="button"
                            disabled={studentBusy}
                            onClick={() => handleSavePassword(stu)}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                          >
                            Update Password
                          </button>
                          <button
                            type="button"
                            onClick={() => setResetPasswordId(null)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      {isConfirmDelete && (
                        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs">
                          <span className="text-rose-800 dark:text-rose-200 font-medium">
                            Remove "{stu.username}" and delete their scores from the leaderboard?
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={studentBusy}
                              onClick={() => handleDeleteStudent(stu)}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* 2. QUESTIONS TAB */}
      {tab === 'questions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateQuestion}
            className="lg:col-span-5 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4 self-start"
          >
            <h3 className="font-display text-lg font-semibold">Add Question</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="q-unit" className="block text-xs font-medium mb-1">
                  Topic
                </label>
                <select
                  id="q-unit"
                  value={qUnitId}
                  onChange={(e) => setQUnitId(e.target.value)}
                  className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      Unit {u.number}: {u.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="q-tpl" className="block text-xs font-medium mb-1">
                  Game Mode
                </label>
                <select
                  id="q-tpl"
                  value={qTemplate}
                  onChange={(e) => setQTemplate(e.target.value)}
                  className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                >
                  {GAME_TEMPLATES.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="q-type" className="block text-xs font-medium mb-1">
                  Question Type
                </label>
                <select
                  id="q-type"
                  value={qType}
                  onChange={(e) => setQType(e.target.value as ActivityType)}
                  className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                >
                  <option value="multiple_choice">Multiple Choice</option>
                  <option value="true_false">True / False</option>
                  <option value="sentence_completion">Sentence Completion</option>
                  <option value="open_ended">Open-Ended</option>
                  <option value="speaking_writing">Speaking / Writing</option>
                </select>
              </div>
              <div>
                <label htmlFor="q-pts" className="block text-xs font-medium mb-1">
                  Points (XP)
                </label>
                <input
                  id="q-pts"
                  type="number"
                  min={10}
                  max={500}
                  value={qPoints}
                  onChange={(e) => setQPoints(Number(e.target.value) || 100)}
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="q-diff" className="block text-xs font-medium mb-1">
                  Difficulty
                </label>
                <select
                  id="q-diff"
                  value={qDifficulty}
                  onChange={(e) => setQDifficulty(e.target.value as QuestionDifficulty)}
                  className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
              <div>
                <label htmlFor="q-skill" className="block text-xs font-medium mb-1">
                  Skill Focus
                </label>
                <select
                  id="q-skill"
                  value={qSkillTag}
                  onChange={(e) => setQSkillTag(e.target.value)}
                  className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                >
                  <option value="Grammar">Grammar</option>
                  <option value="Vocabulary">Vocabulary</option>
                  <option value="Reading">Reading</option>
                  <option value="Writing">Writing</option>
                  <option value="Speaking">Speaking</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label htmlFor="q-topic-tag" className="block text-xs font-medium mb-1">
                  Topic Tag
                </label>
                <input
                  id="q-topic-tag"
                  type="text"
                  value={qTopicTag}
                  onChange={(e) => setQTopicTag(e.target.value)}
                  placeholder="e.g. Reported Speech"
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                />
              </div>
              <div>
                <label htmlFor="q-obj" className="block text-xs font-medium mb-1">
                  Learning Objective (optional)
                </label>
                <input
                  id="q-obj"
                  type="text"
                  value={qLearningObj}
                  onChange={(e) => setQLearningObj(e.target.value)}
                  placeholder="Can transform..."
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="q-prompt" className="block text-xs font-medium mb-1">
                Question Prompt
              </label>
              <textarea
                id="q-prompt"
                required
                rows={3}
                value={qPrompt}
                onChange={(e) => setQPrompt(e.target.value)}
                placeholder="Enter the question prompt..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
              />
            </div>

            {qType === 'multiple_choice' && (
              <div className="space-y-2">
                <label htmlFor="q-opts" className="block text-xs font-medium">
                  Options (one per line)
                </label>
                <textarea
                  id="q-opts"
                  rows={4}
                  value={qOptionsRaw}
                  onChange={(e) => setQOptionsRaw(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                />
                <label htmlFor="q-correct-idx" className="block text-xs font-medium">
                  Correct Option Index (0-based)
                </label>
                <input
                  id="q-correct-idx"
                  type="number"
                  min={0}
                  max={5}
                  value={qCorrectIdx}
                  onChange={(e) => setQCorrectIdx(Number(e.target.value) || 0)}
                  className="w-24 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-sm"
                />
              </div>
            )}

            {qType === 'true_false' && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium">Correct Answer:</span>
                <button
                  type="button"
                  onClick={() => setQCorrectBool(true)}
                  className={`px-3 py-1 rounded-lg border text-xs ${
                    qCorrectBool ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60' : 'border-slate-700'
                  }`}
                >
                  True
                </button>
                <button
                  type="button"
                  onClick={() => setQCorrectBool(false)}
                  className={`px-3 py-1 rounded-lg border text-xs ${
                    !qCorrectBool ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60' : 'border-slate-700'
                  }`}
                >
                  False
                </button>
              </div>
            )}

            {qType === 'sentence_completion' && (
              <div>
                <label htmlFor="q-accepted" className="block text-xs font-medium mb-1">
                  Accepted Answers (comma-separated)
                </label>
                <input
                  id="q-accepted"
                  type="text"
                  value={qAcceptedRaw}
                  onChange={(e) => setQAcceptedRaw(e.target.value)}
                  placeholder="would be, 'd be"
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                />
              </div>
            )}

            <div>
              <label htmlFor="q-expl" className="block text-xs font-medium mb-1">
                Answer Explanation / Rubric
              </label>
              <input
                id="q-expl"
                type="text"
                value={qExplanation}
                onChange={(e) => setQExplanation(e.target.value)}
                placeholder="Shown after answer reveal"
                className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
            >
              Save Question
            </button>
          </form>

          <section className="lg:col-span-7 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold">
                Question Bank ({filteredQuestions.length} of {questions.length})
              </h3>
              {hasActiveQuestionFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterUnit('all');
                    setFilterTemplate('all');
                    setFilterDifficulty('all');
                    setFilterSkill('all');
                    setFilterSearch('');
                  }}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Reset filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <select
                aria-label="Filter by Unit"
                value={filterUnit}
                onChange={(e) => setFilterUnit(e.target.value)}
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
              >
                <option value="all">All Units</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    Unit {u.number}: {u.title}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by Game Mode"
                value={filterTemplate}
                onChange={(e) => setFilterTemplate(e.target.value)}
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
              >
                <option value="all">All Game Modes</option>
                {GAME_TEMPLATES.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by Difficulty"
                value={filterDifficulty}
                onChange={(e) => setFilterDifficulty(e.target.value as 'all' | QuestionDifficulty)}
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
              >
                <option value="all">All Difficulties</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>

              <select
                aria-label="Filter by Skill"
                value={filterSkill}
                onChange={(e) => setFilterSkill(e.target.value)}
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
              >
                <option value="all">All Skills</option>
                {availableSkills.map((skill) => (
                  <option key={skill} value={skill}>
                    {skill}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="qb-search" className="sr-only">
                Search question bank
              </label>
              <input
                id="qb-search"
                type="search"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Search prompts, topic tags, or objectives..."
                className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
              />
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto pr-1">
              {filteredQuestions.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No questions match these filters.
                </p>
              ) : (
                filteredQuestions.map((q) => {
                  const key = answerKeys[q.id];
                  const diffLabel = q.difficulty ?? 'Medium';
                  return (
                    <div key={q.id} className="py-3.5 flex items-start justify-between gap-4">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium">
                          <span className="text-blue-600 dark:text-blue-400">
                            {q.unitId} · {q.gameTemplate} · {q.activityType.replace('_', ' ')} ·{' '}
                            {q.points} XP
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                              diffLabel === 'Easy'
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                : diffLabel === 'Hard'
                                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {diffLabel}
                          </span>
                          {(q.skillTag || q.topicTag) && (
                            <span className="text-slate-500 dark:text-slate-400">
                              {[q.skillTag, q.topicTag].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-medium">{q.prompt}</div>
                        {q.learningObjective && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Objective: {q.learningObjective}
                          </div>
                        )}
                        {key && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {key.rubric ? `Rubric: ${key.rubric} · ` : ''}
                            Answer note: {key.explanation}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label={`Delete question ${q.id}`}
                        onClick={() => deleteQuestionWithKey(q.id).then(() => onRefreshState?.())}
                        className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}

      {/* 3. CLASSROOM GAMES TAB */}
      {tab === 'games' && (
        <BattleArenaView
          role="teacher"
          uid={teacherUid}
          student={null}
          units={units}
          questions={questions}
          answerKeys={answerKeys}
          sessions={sessions}
          participantsBySession={participantsBySession}
          submissionsBySession={submissionsBySession}
          isOnline={isOnline}
          onOfflineQueueChange={onOfflineQueueChange}
          onRefreshState={onRefreshState}
        />
      )}

      {/* 4. SCORES AND RESULTS TAB */}
      {tab === 'results' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-6">
            <form
              onSubmit={handleAwardBonus}
              className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4"
            >
              <h3 className="font-display text-lg font-semibold">Award or Adjust XP</h3>
              <select
                aria-label="Select student for XP"
                value={bonusStudentId || students[0]?.id || ''}
                onChange={(e) => setBonusStudentId(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="number"
                  aria-label="XP amount"
                  min={-500}
                  max={500}
                  value={bonusPoints}
                  onChange={(e) => setBonusPoints(Number(e.target.value) || 0)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-sm"
                />
                <input
                  type="text"
                  aria-label="Reason for XP"
                  value={bonusReason}
                  onChange={(e) => setBonusReason(e.target.value)}
                  className="col-span-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={students.length === 0}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold"
              >
                Record Official XP
              </button>
            </form>

            <form
              onSubmit={handleGrantBadge}
              className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4"
            >
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <Award className="w-4 h-4 text-violet-500" />
                Grant Badge
              </h3>
              <select
                aria-label="Select student for badge"
                value={badgeStudentId || students[0]?.id || ''}
                onChange={(e) => setBadgeStudentId(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
              <select
                aria-label="Select badge"
                value={badgeKey}
                onChange={(e) => setBadgeKey(e.target.value as BadgeKey)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
              >
                {BADGE_CATALOG.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.title} — {b.description}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={students.length === 0}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold"
              >
                Grant Badge
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 space-y-6">
            <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4">
              <h3 className="font-display text-lg font-semibold">
                Practice Writing Submissions ({pendingReviews.length})
              </h3>
              {pendingReviews.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No writing submissions waiting for review yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {pendingReviews.map((item) => {
                    const draft = reviewDrafts[item.id] ?? {
                      xp: item.approvedXp || 50,
                      fb: item.teacherFeedback ?? '',
                    };
                    return (
                      <div
                        key={item.id}
                        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3"
                      >
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-slate-900 dark:text-white text-sm">
                            {item.studentName}
                          </span>
                          <span>
                            {item.unitId} ·{' '}
                            {item.teacherReviewed
                              ? `Approved (+${item.approvedXp} XP)`
                              : 'Pending review'}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900/70 p-3 rounded-lg">
                          {item.response}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={300}
                            value={draft.xp}
                            onChange={(e) =>
                              setReviewDrafts((prev) => ({
                                ...prev,
                                [item.id]: { ...draft, xp: Number(e.target.value) || 0 },
                              }))
                            }
                            className="w-24 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-xs"
                          />
                          <input
                            type="text"
                            placeholder="Teacher feedback..."
                            value={draft.fb}
                            onChange={(e) =>
                              setReviewDrafts((prev) => ({
                                ...prev,
                                [item.id]: { ...draft, fb: e.target.value },
                              }))
                            }
                            className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              reviewPracticeAttempt({
                                progressId: item.id,
                                approvedXp: draft.xp,
                                feedback: draft.fb,
                              }).then(async () => {
                                await onRefreshState?.();
                                flash(`Approved ${draft.xp} XP for ${item.studentName}.`);
                              })
                            }
                            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                          >
                            {item.teacherReviewed ? 'Update Review' : 'Approve & Award XP'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4">
              <h3 className="font-display text-lg font-semibold">Recent Results Log</h3>
              {scoreEvents.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No score events recorded yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                  {scoreEvents.slice(0, 12).map((ev) => (
                    <div key={ev.id} className="py-2.5 flex items-center justify-between text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{ev.studentName}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {ev.reason}
                        </div>
                      </div>
                      <span className="font-mono font-semibold tabular-nums text-blue-600 dark:text-blue-400 shrink-0">
                        {ev.points >= 0 ? `+${ev.points}` : ev.points} XP
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
