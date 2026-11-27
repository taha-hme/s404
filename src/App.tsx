import { useEffect, useState } from 'react';
import { AppShell, type NavTab } from './components/AppShell';
import { DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomeworkView } from './components/HomeworkView';
import { MyProgressView } from './components/MyProgressView';
import { PracticeLabView } from './components/PracticeLabView';
import { SoloQuizView } from './components/SoloQuizView';
import { buildHomeworkExportFilename } from './lib/homeQuizHelpers';
import {
  clearReviewedMistake,
  createDefaultLocalState,
  exportHomeworkPayload,
  getBrowserLocalStorage,
  HOME_STORAGE_KEY,
  loadLocalState,
  recordCompletedQuiz,
  recordPracticeCompletion,
  recordQuestionAttempt,
  restoreStudentBackup,
  saveLocalState,
  saveWritingDraft,
  updateStudentDisplayName,
  type LocalLoadStatus,
  type LocalStudentState,
  type UnitId,
} from './lib/localLeagueStore';

function getInitialTheme(): 'light' | 'dark' {
  try {
    const saved = getBrowserLocalStorage()?.getItem('s404_theme');
    return saved === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function AppContent() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => getInitialTheme());

  const [initialLoad] = useState(() => loadLocalState(getBrowserLocalStorage()));
  const [localState, setLocalState] = useState<LocalStudentState>(() => initialLoad.state);
  const [loadStatus, setLoadStatus] = useState<LocalLoadStatus>(() => initialLoad.status);
  const [storageNotice, setStorageNotice] = useState<string | null>(
    () => initialLoad.error ?? null
  );
  const [storageAvailable, setStorageAvailable] = useState<boolean>(
    () => getBrowserLocalStorage() !== null
  );

  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [quizUnitFilter, setQuizUnitFilter] = useState<UnitId | 'all'>('all');
  const [practiceUnitFilter, setPracticeUnitFilter] = useState<UnitId | 'all'>('all');
  const [focusMistakesToken, setFocusMistakesToken] = useState<number>(0);

  // Theme sync
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      getBrowserLocalStorage()?.setItem('s404_theme', theme);
    } catch {
      // Ignore theme storage failures when browser storage is disabled
    }
  }, [theme]);

  const commitState = (nextState: LocalStudentState) => {
    setLocalState(nextState);
    const storage = getBrowserLocalStorage();
    setStorageAvailable(storage !== null);
    const saved = saveLocalState(nextState, storage);
    if (!saved.ok) {
      setStorageNotice(saved.error ?? 'Unable to persist progress in browser storage.');
    } else {
      setLoadStatus('ok');
      setStorageNotice(null);
    }
  };

  const handleUpdateName = (name: string) => {
    commitState(updateStudentDisplayName(localState, name));
  };

  const handleCommitQuiz = (params: {
    unitId: UnitId | 'all';
    gameTemplate: string;
    items: Array<{ questionId: string; answerPayload: string }>;
  }) => {
    const res = recordCompletedQuiz(localState, params);
    commitState(res.state);
    return { quizRecord: res.quizRecord, xpEarnedDelta: res.xpEarnedDelta };
  };

  const handleCompletePracticeExercise = (exerciseId: string, response: string) => {
    const res = recordPracticeCompletion(localState, { exerciseId, response });
    commitState(res.state);
    return { record: res.record, xpEarnedDelta: res.xpEarnedDelta };
  };

  const handleCompleteQuestionPractice = (questionId: string, answerPayload: string) => {
    const res = recordQuestionAttempt(localState, { questionId, answerPayload });
    commitState(res.state);
    return {
      isCorrect: res.isCorrect,
      xpEarnedDelta: res.xpEarnedDelta,
      correctAnswerDisplay: res.correctAnswerDisplay,
      explanation: res.explanation,
    };
  };

  const handleSaveWritingDraft = (itemId: string, draftText: string) => {
    const next = saveWritingDraft(localState, itemId, draftText);
    commitState(next);
  };

  const handleRetryMistake = (questionId: string, answerPayload: string) => {
    const res = recordQuestionAttempt(localState, { questionId, answerPayload });
    commitState(res.state);
    return {
      isCorrect: res.isCorrect,
      xpEarnedDelta: res.xpEarnedDelta,
      correctAnswerDisplay: res.correctAnswerDisplay,
      explanation: res.explanation,
    };
  };

  const handleClearMistake = (questionId: string) => {
    commitState(clearReviewedMistake(localState, questionId));
  };

  const handleRestoreBackup = (rawJson: string) => {
    const storage = getBrowserLocalStorage();
    const res = restoreStudentBackup(rawJson, {
      confirmReplace: true,
      storage,
    });
    if (!res.ok || !res.state) {
      return { ok: false, error: res.error ?? 'Unable to restore backup.' };
    }
    setLocalState(res.state);
    setStorageAvailable(storage !== null);
    setLoadStatus('ok');
    setStorageNotice(null);
    return { ok: true };
  };

  const handleExportBackup = () => {
    const payload = exportHomeworkPayload(localState);
    const jsonText = JSON.stringify(payload, null, 2);
    const filename = buildHomeworkExportFilename(localState.studentName);
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleClearCorruptedStorage = () => {
    const storage = getBrowserLocalStorage();
    storage?.removeItem?.(HOME_STORAGE_KEY);
    const fresh = createDefaultLocalState();
    commitState(fresh);
  };

  return (
    <AppShell
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      studentName={localState.studentName}
      theme={theme}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      storageAvailable={storageAvailable}
    >
      {activeTab === 'home' && (
        <DashboardView
          state={localState}
          loadStatus={loadStatus}
          storageNotice={storageNotice}
          onUpdateName={handleUpdateName}
          onNavigate={setActiveTab}
          onStartUnitQuiz={(uId) => {
            setQuizUnitFilter(uId);
            setActiveTab('quiz');
          }}
          onStartUnitPractice={(uId) => {
            setPracticeUnitFilter(uId);
            setActiveTab('practice');
          }}
          onOpenMistakeReview={() => {
            setActiveTab('progress');
            setFocusMistakesToken((t) => t + 1);
          }}
          onExportBackup={handleExportBackup}
          onClearCorruptedStorage={handleClearCorruptedStorage}
        />
      )}

      {activeTab === 'quiz' && (
        <SoloQuizView
          state={localState}
          initialUnitFilter={quizUnitFilter}
          onCommitQuiz={handleCommitQuiz}
          onNavigateHome={() => setActiveTab('home')}
          onOpenMistakeReview={() => {
            setActiveTab('progress');
            setFocusMistakesToken((t) => t + 1);
          }}
        />
      )}

      {activeTab === 'practice' && (
        <PracticeLabView
          state={localState}
          initialUnitFilter={practiceUnitFilter}
          onCompletePracticeExercise={handleCompletePracticeExercise}
          onCompleteQuestionPractice={handleCompleteQuestionPractice}
          onSaveWritingDraft={handleSaveWritingDraft}
        />
      )}

      {activeTab === 'progress' && (
        <MyProgressView
          state={localState}
          focusMistakesToken={focusMistakesToken}
          onRetryMistake={handleRetryMistake}
          onClearMistake={handleClearMistake}
          onStartUnitPractice={(uId) => {
            setPracticeUnitFilter(uId);
            setActiveTab('practice');
          }}
          onStartUnitQuiz={(uId) => {
            setQuizUnitFilter(uId);
            setActiveTab('quiz');
          }}
        />
      )}

      {activeTab === 'homework' && (
        <HomeworkView state={localState} onRestoreBackup={handleRestoreBackup} />
      )}
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
