import { useCallback, useEffect, useState } from 'react';
import { AppShell, type NavTab } from './components/AppShell';
import { AuthPortal } from './components/AuthPortal';
import { BattleArenaView } from './components/BattleArenaView';
import { DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LeagueView } from './components/LeagueView';
import { PracticeLabView } from './components/PracticeLabView';
import { TeacherConsoleView } from './components/TeacherConsoleView';
import {
  connectRealtimeStream,
  fetchLeagueState,
  getAuthSession,
  loginWithCredentials,
  logoutCurrentUser,
  type AuthSessionUser,
  type LeagueStateSnapshot,
} from './lib/leagueApi';
import type { StudentProfile } from './types/league';

const EMPTY_STATE: LeagueStateSnapshot = {
  students: [],
  units: [],
  questions: [],
  answerKeys: {},
  sessions: [],
  participantsBySession: {},
  submissionsBySession: {},
  officialScores: [],
  scoreEvents: [],
  achievements: [],
  practiceExercises: [],
  practiceProgress: [],
};

function getInitialPinFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const pin = params.get('pin') ?? '';
    return /^[A-Za-z0-9]{6}$/.test(pin) ? pin.toUpperCase() : '';
  } catch {
    return '';
  }
}

function AppContent() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('s404_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingOfflineCount, setPendingOfflineCount] = useState<number>(0);

  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authUser, setAuthUser] = useState<AuthSessionUser | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [practiceUnitFilter, setPracticeUnitFilter] = useState<string>('all');
  const [initialPin, setInitialPin] = useState<string>(() => getInitialPinFromUrl());
  const [leagueState, setLeagueState] = useState<LeagueStateSnapshot>(EMPTY_STATE);

  // Theme sync
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('s404_theme', theme);
  }, [theme]);

  // Browser online/offline status
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Restore cookie session on load
  useEffect(() => {
    let active = true;
    getAuthSession()
      .then((res) => {
        if (!active) return;
        setAuthUser(res.user);
        setStudentProfile(res.student);
      })
      .catch(() => {
        if (!active) return;
        setAuthUser(null);
        setStudentProfile(null);
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const refreshState = useCallback(async () => {
    try {
      const snapshot = await fetchLeagueState();
      setLeagueState(snapshot);
    } catch {
      // handled by SSE or auth check
    }
  }, []);

  // Live SSE sync + initial state load while signed in
  useEffect(() => {
    if (!authReady || !authUser) {
      setLeagueState(EMPTY_STATE);
      return;
    }

    let cancelled = false;
    fetchLeagueState()
      .then((snapshot) => {
        if (!cancelled) setLeagueState(snapshot);
      })
      .catch(() => undefined);

    const disconnect = connectRealtimeStream({
      onState: (snapshot) => {
        if (!cancelled) {
          setLeagueState(snapshot);
          if (authUser.role === 'student') {
            const freshMe = snapshot.students.find((s) => s.id === authUser.id) ?? null;
            if (freshMe) setStudentProfile(freshMe);
          }
        }
      },
      onConnectionChange: (connected) => {
        if (!cancelled && navigator.onLine) {
          setIsOnline(connected);
        }
      },
      onUnauthorized: () => {
        if (!cancelled) {
          setAuthUser(null);
          setStudentProfile(null);
          setLeagueState(EMPTY_STATE);
        }
      },
    });

    return () => {
      cancelled = true;
      disconnect();
    };
  }, [authReady, authUser]);

  const handleLogin = async (username: string, password: string) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await loginWithCredentials(username, password);
      setAuthUser(res.user);
      setStudentProfile(res.student);
      setActiveTab(initialPin ? 'games' : 'home');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutCurrentUser().catch(() => undefined);
    setAuthUser(null);
    setStudentProfile(null);
    setLeagueState(EMPTY_STATE);
    setActiveTab('home');
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#070B16] text-sm text-slate-500 dark:text-slate-400">
        Loading S404 — The English League...
      </div>
    );
  }

  if (!authUser || (authUser.role === 'student' && !studentProfile)) {
    return (
      <AuthPortal
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onLogin={handleLogin}
        loading={authLoading}
        errorMessage={authError}
      />
    );
  }

  const role = authUser.role;
  const displayName = role === 'teacher' ? 'Teacher' : studentProfile?.username ?? authUser.username;

  return (
    <AppShell
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      role={role}
      displayName={displayName}
      theme={theme}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      isOnline={isOnline}
      pendingOfflineCount={pendingOfflineCount}
      onLogout={handleLogout}
    >
      {activeTab === 'home' && (
        <DashboardView
          role={role}
          student={studentProfile}
          students={leagueState.students}
          officialScores={leagueState.officialScores}
          achievements={leagueState.achievements}
          units={leagueState.units}
          sessions={leagueState.sessions}
          practiceProgress={leagueState.practiceProgress}
          onNavigate={setActiveTab}
          onQuickJoinSession={(pin) => {
            setInitialPin(pin);
            setActiveTab('games');
          }}
          onStartTopicPractice={(unitId) => {
            setPracticeUnitFilter(unitId);
            setActiveTab('practice');
          }}
        />
      )}

      {activeTab === 'games' && (
        <BattleArenaView
          role={role}
          uid={authUser.id}
          student={studentProfile}
          units={leagueState.units}
          questions={leagueState.questions}
          answerKeys={leagueState.answerKeys}
          sessions={leagueState.sessions}
          participantsBySession={leagueState.participantsBySession}
          submissionsBySession={leagueState.submissionsBySession}
          isOnline={isOnline}
          initialPin={initialPin}
          onOfflineQueueChange={setPendingOfflineCount}
          onRefreshState={refreshState}
          onOpenTopicPractice={(unitId) => {
            setPracticeUnitFilter(unitId);
            setActiveTab('practice');
          }}
        />
      )}

      {activeTab === 'leaderboard' && (
        <LeagueView
          students={leagueState.students}
          officialScores={leagueState.officialScores}
          achievements={leagueState.achievements}
          scoreEvents={leagueState.scoreEvents}
          currentStudentId={studentProfile?.id}
        />
      )}

      {activeTab === 'practice' && (
        <PracticeLabView
          role={role}
          student={studentProfile}
          units={leagueState.units}
          exercises={leagueState.practiceExercises}
          progress={leagueState.practiceProgress}
          initialUnitFilter={practiceUnitFilter}
          onRefreshState={refreshState}
        />
      )}

      {activeTab === 'teacher' && role === 'teacher' && (
        <TeacherConsoleView
          teacherUid={authUser.id}
          students={leagueState.students}
          officialScores={leagueState.officialScores}
          scoreEvents={leagueState.scoreEvents}
          units={leagueState.units}
          questions={leagueState.questions}
          answerKeys={leagueState.answerKeys}
          sessions={leagueState.sessions}
          participantsBySession={leagueState.participantsBySession}
          submissionsBySession={leagueState.submissionsBySession}
          practiceProgress={leagueState.practiceProgress}
          isOnline={isOnline}
          onOfflineQueueChange={setPendingOfflineCount}
          onRefreshState={refreshState}
        />
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
