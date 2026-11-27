import type {
  Achievement,
  ActivityType,
  AnswerKey,
  BadgeKey,
  BattleSession,
  OfficialScore,
  PracticeExercise,
  PracticeProgress,
  Question,
  ScoreEvent,
  SessionMode,
  SessionParticipant,
  StudentProfile,
  StudentSubmission,
  Unit,
  UserRole,
} from '../types/league';

export interface AuthSessionUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
}

export interface AuthSessionResponse {
  user: AuthSessionUser | null;
  student: StudentProfile | null;
}

export interface LeagueStateSnapshot {
  students: StudentProfile[];
  units: Unit[];
  questions: Question[];
  answerKeys: Record<string, AnswerKey>;
  sessions: BattleSession[];
  participantsBySession: Record<string, SessionParticipant[]>;
  submissionsBySession: Record<string, StudentSubmission[]>;
  officialScores: OfficialScore[];
  scoreEvents: ScoreEvent[];
  achievements: Achievement[];
  practiceExercises: PracticeExercise[];
  practiceProgress: PracticeProgress[];
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function buildApiUrl(
  path: string,
  baseUrl = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL ?? ''
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const trimmedBase = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmedBase) {
    return normalizedPath;
  }
  return `${trimmedBase}${normalizedPath}`;
}

async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('X-Requested-With', 'S404');
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(buildApiUrl(url), {
    ...options,
    credentials: 'include',
    headers,
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }

  if (!res.ok) {
    const errMsg = typeof data.error === 'string' ? data.error : `Request failed (${res.status}).`;
    throw new ApiError(errMsg, res.status);
  }

  return data as T;
}

export async function getAuthSession(): Promise<AuthSessionResponse> {
  return apiRequest<AuthSessionResponse>('/api/auth/me');
}

export async function loginWithCredentials(
  username: string,
  password: string
): Promise<AuthSessionResponse> {
  return apiRequest<AuthSessionResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function logoutCurrentUser(): Promise<void> {
  await apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
}

export async function fetchLeagueState(): Promise<LeagueStateSnapshot> {
  return apiRequest<LeagueStateSnapshot>('/api/state');
}

export function connectRealtimeStream(params: {
  onState: (snapshot: LeagueStateSnapshot) => void;
  onConnectionChange?: (connected: boolean) => void;
  onUnauthorized?: () => void;
}): () => void {
  let disposed = false;
  let source: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const openStream = () => {
    if (disposed) return;
    source = new EventSource(buildApiUrl('/api/stream'), { withCredentials: true });

    source.onopen = () => {
      if (!disposed) params.onConnectionChange?.(true);
    };

    source.addEventListener('state', (event) => {
      if (disposed) return;
      try {
        const snapshot = JSON.parse((event as MessageEvent).data) as LeagueStateSnapshot;
        params.onConnectionChange?.(true);
        params.onState(snapshot);
      } catch {
        // ignore malformed event payload
      }
    });

    source.addEventListener('unauthorized', () => {
      disposed = true;
      source?.close();
      params.onUnauthorized?.();
    });

    source.onerror = () => {
      if (disposed) return;
      params.onConnectionChange?.(false);
      if (source?.readyState === EventSource.CLOSED) {
        source.close();
        getAuthSession()
          .then((res) => {
            if (disposed) return;
            if (!res.user) {
              disposed = true;
              params.onUnauthorized?.();
              return;
            }
            retryTimer = setTimeout(openStream, 2000);
          })
          .catch(() => {
            if (!disposed) {
              retryTimer = setTimeout(openStream, 3000);
            }
          });
      }
    };
  };

  openStream();

  return () => {
    disposed = true;
    if (retryTimer) clearTimeout(retryTimer);
    source?.close();
  };
}

export async function createStudentAccount(params: {
  username: string;
  password: string;
  teamDefault: 'A' | 'B';
}): Promise<StudentProfile> {
  const res = await apiRequest<{ student: StudentProfile }>('/api/students', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return res.student;
}

export async function editStudentUsername(params: {
  studentId: string;
  newUsername: string;
}): Promise<StudentProfile> {
  const res = await apiRequest<{ student: StudentProfile }>(
    `/api/students/${encodeURIComponent(params.studentId)}/username`,
    {
      method: 'PATCH',
      body: JSON.stringify({ newUsername: params.newUsername }),
    }
  );
  return res.student;
}

export async function resetStudentPassword(params: {
  studentId: string;
  newPassword: string;
}): Promise<void> {
  await apiRequest<{ ok: boolean }>(
    `/api/students/${encodeURIComponent(params.studentId)}/password`,
    {
      method: 'PATCH',
      body: JSON.stringify({ newPassword: params.newPassword }),
    }
  );
}

export async function updateStudentTeam(studentId: string, teamDefault: 'A' | 'B'): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/api/students/${encodeURIComponent(studentId)}/team`, {
    method: 'PATCH',
    body: JSON.stringify({ teamDefault }),
  });
}

export async function deleteStudentAccount(studentId: string): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/api/students/${encodeURIComponent(studentId)}`, {
    method: 'DELETE',
  });
}

export async function saveQuestionWithKey(
  question: Omit<Question, 'createdAt' | 'updatedAt'>,
  answerKey: Omit<AnswerKey, 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  await apiRequest<{ ok: boolean }>('/api/questions', {
    method: 'POST',
    body: JSON.stringify({ question, answerKey, isNew }),
  });
}

export async function deleteQuestionWithKey(questionId: string): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/api/questions/${encodeURIComponent(questionId)}`, {
    method: 'DELETE',
  });
}

export async function createBattleSession(params: {
  title: string;
  gameTemplate: string;
  unitId: string;
  mode: SessionMode;
  questionIds: string[];
  timerSeconds: number;
}): Promise<BattleSession> {
  const res = await apiRequest<{ session: BattleSession }>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return res.session;
}

export async function joinSessionByPin(pin: string): Promise<BattleSession> {
  const res = await apiRequest<{ session: BattleSession }>('/api/sessions/join', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
  return res.session;
}

export async function updateSessionState(
  sessionId: string,
  patch: Partial<
    Pick<
      BattleSession,
      | 'status'
      | 'mode'
      | 'currentQuestionIndex'
      | 'currentQuestionId'
      | 'timerSeconds'
      | 'remainingSeconds'
      | 'revealedAnswerText'
      | 'revealedExplanation'
    >
  >
): Promise<BattleSession> {
  const res = await apiRequest<{ session: BattleSession }>(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }
  );
  return res.session;
}

export async function setSessionModeAndTeams(sessionId: string, mode: SessionMode): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(sessionId)}/mode`, {
    method: 'PATCH',
    body: JSON.stringify({ mode }),
  });
}

export async function submitBattleAnswer(params: {
  sessionId: string;
  questionId: string;
  activityType: ActivityType;
  answerPayload: string;
}): Promise<StudentSubmission> {
  const res = await apiRequest<{ submission: StudentSubmission }>(
    `/api/sessions/${encodeURIComponent(params.sessionId)}/submit`,
    {
      method: 'POST',
      body: JSON.stringify({
        questionId: params.questionId,
        activityType: params.activityType,
        answerPayload: params.answerPayload,
      }),
    }
  );
  return res.submission;
}

export async function revealAndGradeQuestion(sessionId: string): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(sessionId)}/reveal`, {
    method: 'POST',
  });
}

export async function gradeOpenEndedSubmission(params: {
  sessionId: string;
  submissionId: string;
  isCorrect: boolean;
  pointsAwarded: number;
  feedback: string;
}): Promise<void> {
  await apiRequest<{ ok: boolean }>(
    `/api/sessions/${encodeURIComponent(params.sessionId)}/submissions/${encodeURIComponent(
      params.submissionId
    )}/grade`,
    {
      method: 'POST',
      body: JSON.stringify({
        isCorrect: params.isCorrect,
        pointsAwarded: params.pointsAwarded,
        feedback: params.feedback,
      }),
    }
  );
}

export async function awardManualXp(params: {
  studentId: string;
  points: number;
  reason: string;
  source: ScoreEvent['source'];
  unitId?: string;
}): Promise<void> {
  await apiRequest<{ ok: boolean }>('/api/scores/manual', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function grantAchievementBadge(params: {
  studentId: string;
  badgeKey: BadgeKey;
}): Promise<void> {
  await apiRequest<{ ok: boolean }>('/api/achievements', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function submitPracticeAttempt(params: {
  exerciseId: string;
  response: string;
}): Promise<PracticeProgress> {
  const res = await apiRequest<{ progress: PracticeProgress }>('/api/practice/submit', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return res.progress;
}

export async function reviewPracticeAttempt(params: {
  progressId: string;
  approvedXp: number;
  feedback: string;
}): Promise<void> {
  await apiRequest<{ ok: boolean }>(
    `/api/practice/${encodeURIComponent(params.progressId)}/review`,
    {
      method: 'POST',
      body: JSON.stringify({
        approvedXp: params.approvedXp,
        feedback: params.feedback,
      }),
    }
  );
}
