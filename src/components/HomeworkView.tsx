import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileJson,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {
  buildHomeworkExportFilename,
  formatShortDate,
  formatStudentAnswerDisplay,
  getSeededQuestionEntry,
} from '../lib/homeQuizHelpers';
import {
  exportHomeworkPayload,
  inspectHomeworkSubmission,
  parseAndValidateHomeworkImport,
  type HomeworkExportPayload,
  type LocalStudentState,
  type TeacherHomeworkInspection,
} from '../lib/localLeagueStore';

interface HomeworkViewProps {
  state: LocalStudentState;
  onRestoreBackup: (rawJson: string) => { ok: boolean; error?: string };
}

export function HomeworkView({ state, onRestoreBackup }: HomeworkViewProps) {
  // Workflow A: Student Backup / Restore
  const [restoreRawJson, setRestoreRawJson] = useState<string>('');
  const [restorePreview, setRestorePreview] = useState<HomeworkExportPayload | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<boolean>(false);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Workflow B: Teacher Homework Inspector (strictly read-only in memory)
  const [inspection, setInspection] = useState<TeacherHomeworkInspection | null>(null);
  const [inspectorError, setInspectorError] = useState<string | null>(null);

  const handleDownloadHomework = () => {
    const payload = exportHomeworkPayload(state);
    const jsonText = JSON.stringify(payload, null, 2);
    const filename = buildHomeworkExportFilename(state.studentName);

    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportNotice(`Downloaded ${filename}`);
  };

  const validateCandidateRestore = (raw: string) => {
    setRestoreRawJson(raw);
    setRestoreSuccess(null);
    setConfirmReplace(false);

    if (!raw.trim()) {
      setRestorePreview(null);
      setRestoreError(null);
      return;
    }

    const res = parseAndValidateHomeworkImport(raw);
    if (!res.ok || !res.payload) {
      setRestorePreview(null);
      setRestoreError(res.error ?? 'Invalid backup JSON file.');
      return;
    }

    setRestoreError(null);
    setRestorePreview(res.payload);
  };

  const handleRestoreFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    validateCandidateRestore(text);
    e.target.value = '';
  };

  const handleApplyRestore = () => {
    if (!confirmReplace || !restorePreview) return;
    const res = onRestoreBackup(restoreRawJson);
    if (!res.ok) {
      setRestoreError(res.error ?? 'Unable to restore backup.');
      return;
    }
    setRestoreError(null);
    setRestoreSuccess(`Restored local progress for ${restorePreview.studentName}.`);
    setConfirmReplace(false);
    setRestoreRawJson('');
    setRestorePreview(null);
  };

  const handleInspectRawJson = (raw: string) => {
    if (!raw.trim()) {
      setInspection(null);
      setInspectorError(null);
      return;
    }
    const res = inspectHomeworkSubmission(raw);
    if (!res.ok || !res.inspection) {
      setInspection(null);
      setInspectorError(res.error ?? 'Unable to inspect homework JSON.');
      return;
    }
    setInspectorError(null);
    setInspection(res.inspection);
  };

  const handleInspectorFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    handleInspectRawJson(text);
    e.target.value = '';
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Homework & Backups
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          Export your progress to share with your teacher or move devices, or inspect a student’s
          exported homework file without affecting your own progress.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* WORKFLOW A: Student Backup Export & Restore */}
        <section
          aria-labelledby="student-backup-heading"
          className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-6"
        >
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
              <FileJson className="w-4 h-4" />
              Workflow A · Personal Device Data
            </div>
            <h3
              id="student-backup-heading"
              className="font-display text-xl font-bold text-slate-900 dark:text-white"
            >
              Student Backup & Restore
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              Downloads or replaces <span className="font-semibold">your own</span> browser progress
              for {state.studentName}.
            </p>
          </div>

          {/* Export */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span>
                {(() => {
                  const qCount = state.quizHistory.length;
                  const pCount = Object.keys(state.practiceHistory).length;
                  const wCount = Object.keys(state.writingResponses).length;
                  return `Includes ${state.xp} XP, ${qCount} ${qCount === 1 ? 'quiz' : 'quizzes'}, ${pCount} ${pCount === 1 ? 'practice check' : 'practice checks'}, and ${wCount} ${wCount === 1 ? 'writing response' : 'writing responses'}.`;
                })()}
              </span>
            </div>
            <button
              type="button"
              onClick={handleDownloadHomework}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export Homework & Backup JSON
            </button>
            {exportNotice && (
              <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                {exportNotice}
              </div>
            )}
          </div>

          {/* Restore */}
          <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                Restore My Progress Backup
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Choose a previously exported S404 Home Edition .json file to restore onto this
                browser.
              </p>
            </div>

            <div>
              <label
                htmlFor="student-restore-file"
                className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                Select Backup JSON File
              </label>
              <input
                id="student-restore-file"
                type="file"
                accept=".json,application/json"
                onChange={handleRestoreFileChange}
                className="sr-only"
              />
            </div>

            {restoreError && (
              <div
                role="alert"
                className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-xs sm:text-sm text-rose-800 dark:text-rose-200"
              >
                {restoreError}
              </div>
            )}

            {restoreSuccess && (
              <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-xs sm:text-sm text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {restoreSuccess}
              </div>
            )}

            {restorePreview && (
              <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 space-y-3">
                <div className="flex items-start gap-2 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <div>
                    <div className="font-semibold">
                      Ready to restore backup for {restorePreview.studentName}
                    </div>
                    <div className="text-xs opacity-90 mt-0.5">
                      {restorePreview.summary.xp} XP ({restorePreview.summary.rankTitle}) ·{' '}
                      {restorePreview.quizHistory.length} quizzes · Exported{' '}
                      {formatShortDate(restorePreview.exportedAt)}
                    </div>
                  </div>
                </div>

                <label className="flex items-start gap-2 text-xs text-slate-800 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmReplace}
                    onChange={(e) => setConfirmReplace(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-amber-600 rounded"
                  />
                  <span>
                    I understand restoring this backup will replace my current browser progress for{' '}
                    <strong>{state.studentName}</strong>.
                  </span>
                </label>

                <button
                  type="button"
                  disabled={!confirmReplace}
                  onClick={handleApplyRestore}
                  className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold transition-colors"
                >
                  Confirm & Replace Local Progress
                </button>
              </div>
            )}
          </div>
        </section>

        {/* WORKFLOW B: Teacher Homework Inspector (Strictly Read-Only) */}
        <section
          aria-labelledby="teacher-inspector-heading"
          className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-5"
        >
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400">
              <ShieldCheck className="w-4 h-4" />
              Workflow B · Read-Only Teacher Review
            </div>
            <h3
              id="teacher-inspector-heading"
              className="font-display text-xl font-bold text-slate-900 dark:text-white"
            >
              Teacher Homework Inspector
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              Open a student’s exported JSON homework file to review scores and writing.{' '}
              <span className="font-semibold">
                Never alters or overwrites your browser’s saved data.
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="teacher-inspect-file"
              className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold cursor-pointer transition-colors"
            >
              <Eye className="w-4 h-4" />
              Inspect Student Homework JSON
            </label>
            <input
              id="teacher-inspect-file"
              type="file"
              accept=".json,application/json"
              onChange={handleInspectorFileChange}
              className="sr-only"
            />

            {inspection && (
              <button
                type="button"
                onClick={() => {
                  setInspection(null);
                  setInspectorError(null);
                }}
                className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Clear Inspector
              </button>
            )}
          </div>

          {inspectorError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-xs sm:text-sm text-rose-800 dark:text-rose-200"
            >
              {inspectorError}
            </div>
          )}

          {!inspection ? (
            <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Select a student’s .json homework file above to view their XP summary, unit mastery,
              writing answers, quiz scores, and mistakes.
            </div>
          ) : (
            <div className="space-y-5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="p-4 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/20 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-base font-bold text-slate-900 dark:text-white">
                      {inspection.studentName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Exported {formatShortDate(inspection.exportedAt)} · Read-only snapshot
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-lg font-bold text-violet-700 dark:text-violet-300">
                      {inspection.summary.xp} XP
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {inspection.summary.rankTitle}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                  <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                    Streak: {inspection.summary.currentStreak}d (Best {inspection.summary.bestStreak}d)
                  </div>
                  <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                    Accuracy: {inspection.summary.accuracyPercent}%
                  </div>
                  <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                    U7/8/9: {inspection.summary.unitProgress['unit-7']}% /{' '}
                    {inspection.summary.unitProgress['unit-8']}% /{' '}
                    {inspection.summary.unitProgress['unit-9']}%
                  </div>
                </div>
              </div>

              {/* Writing Responses */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Writing & Open-Ended Responses ({inspection.writingResponses.length})
                </h4>
                {inspection.writingResponses.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No writing responses submitted.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-56 overflow-y-auto">
                    {inspection.writingResponses.map((w) => (
                      <div
                        key={`${w.source}-${w.itemId}`}
                        className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1"
                      >
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {w.title} ({w.unitId.toUpperCase()})
                        </div>
                        {w.prompt && (
                          <div className="text-slate-500 dark:text-slate-400">{w.prompt}</div>
                        )}
                        <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap pt-1">
                          {w.response}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Practice & Quizzes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Quiz History ({inspection.quizHistory.length})
                  </h4>
                  {inspection.quizHistory.length === 0 ? (
                    <p className="text-slate-500 dark:text-slate-400">No quizzes recorded.</p>
                  ) : (
                    <div className="space-y-2 max-h-44 overflow-y-auto">
                      {inspection.quizHistory.map((q) => (
                        <div
                          key={q.quizId}
                          className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800"
                        >
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {q.gameTemplate}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400">
                            {q.correctCount}/{q.totalQuestions} · {q.score} pts
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Practice Submissions ({inspection.practiceSubmissions.length})
                  </h4>
                  {inspection.practiceSubmissions.length === 0 ? (
                    <p className="text-slate-500 dark:text-slate-400">No practice checks.</p>
                  ) : (
                    <div className="space-y-2 max-h-44 overflow-y-auto">
                      {inspection.practiceSubmissions.map((p) => (
                        <div
                          key={p.exerciseId}
                          className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800"
                        >
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {p.title}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400">
                            {p.needsTeacherReview
                              ? 'Writing response'
                              : p.selfCheckCorrect
                              ? `Correct (+${p.xpAwarded} XP)`
                              : 'Needs retry'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Incorrect Answers */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Mistakes ({inspection.incorrectAnswers.length})
                </h4>
                {inspection.incorrectAnswers.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No mistakes logged in export.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {inspection.incorrectAnswers.map((m) => {
                      const entry = getSeededQuestionEntry(m.questionId);
                      return (
                        <div
                          key={m.questionId}
                          className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-0.5"
                        >
                          <div className="font-medium text-slate-800 dark:text-slate-200">
                            {entry?.question.prompt ?? m.questionId}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400">
                            Answer: {formatStudentAnswerDisplay(m.questionId, m.studentAnswer)} ·{' '}
                            {m.reviewed ? 'Reviewed' : 'Unreviewed'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
