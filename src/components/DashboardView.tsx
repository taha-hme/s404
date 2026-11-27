import { ArrowRight, Award, BookOpen, Flame, Gamepad2, Trophy } from 'lucide-react';
import { getNextRankProgress } from '../lib/leagueRules';
import type {
  Achievement,
  BattleSession,
  OfficialScore,
  PracticeProgress,
  StudentProfile,
  Unit,
  UserRole,
} from '../types/league';
import type { NavTab } from './AppShell';

interface DashboardViewProps {
  role: UserRole;
  student: StudentProfile | null;
  students: StudentProfile[];
  officialScores: OfficialScore[];
  achievements: Achievement[];
  units: Unit[];
  sessions: BattleSession[];
  practiceProgress: PracticeProgress[];
  onNavigate: (tab: NavTab) => void;
  onQuickJoinSession: (pin: string) => void;
  onStartTopicPractice: (unitId: string) => void;
}

export function DashboardView({
  role,
  student,
  students,
  officialScores,
  achievements,
  units,
  sessions,
  practiceProgress,
  onNavigate,
  onQuickJoinSession,
  onStartTopicPractice,
}: DashboardViewProps) {
  const activeSession = sessions.find((s) => s.status !== 'ended') ?? null;

  const myScore = student
    ? officialScores.find((s) => s.studentId === student.id)
    : undefined;
  const myXp = myScore?.xp ?? 0;
  const rankInfo = getNextRankProgress(myXp);
  const sortedBoard = [...officialScores].sort((a, b) => b.xp - a.xp);
  const myStanding = student
    ? sortedBoard.findIndex((s) => s.studentId === student.id) + 1
    : 0;
  const myBadges = student
    ? achievements.filter((a) => a.studentId === student.id)
    : achievements.slice(0, 4);

  const pendingReviewCount = practiceProgress.filter(
    (p) => p.needsTeacherReview && !p.teacherReviewed
  ).length;

  return (
    <div className="space-y-8">
      {/* Primary Focal Banner */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
            S404 — The English League
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            {role === 'teacher'
              ? 'Ready for today’s English session'
              : `Welcome back, ${student?.displayName ?? 'Player'}`}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {activeSession
              ? `Live game "${activeSession.title}" (${activeSession.gameTemplate}) is open now.`
              : role === 'teacher'
              ? 'Start a classroom game for your students, manage student accounts, or review writing answers.'
              : 'Join a live classroom game, practice English skills, or check your place on the leaderboard.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {activeSession ? (
            <button
              type="button"
              onClick={() =>
                role === 'teacher'
                  ? onNavigate('games')
                  : onQuickJoinSession(activeSession.pin)
              }
              className="min-h-[46px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Gamepad2 className="w-4 h-4" />
              {role === 'teacher'
                ? `Open Game (${activeSession.pin})`
                : `Join Game (${activeSession.pin})`}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('games')}
              className="min-h-[46px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Gamepad2 className="w-4 h-4" />
              {role === 'teacher' ? 'Start Classroom Game' : 'Play Games'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate(role === 'teacher' ? 'teacher' : 'practice')}
            className="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            {role === 'teacher' ? 'Teacher Panel' : 'Practice English'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* KPI Strip */}
      {role === 'student' ? (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">Official XP</div>
            <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {myXp}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {rankInfo.nextRank ? `${rankInfo.xpToNext} XP to ${rankInfo.nextRank}` : 'Top rank'}
            </div>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">Rank</div>
            <div className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              {rankInfo.currentRank}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {myStanding > 0 ? `#${myStanding} of ${sortedBoard.length}` : 'Unranked'}
            </div>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">Streak</div>
            <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white inline-flex items-center gap-2">
              {myScore?.streak ?? 0}
              <Flame className="w-5 h-5 text-violet-500" />
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {myScore?.correctCount ?? 0} correct answers
            </div>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">Badges</div>
            <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {myBadges.length} / 6
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Unlocked in class</div>
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">Students</div>
            <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {students.length}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {(() => {
                const activeCount = students.filter((s) => s.active).length;
                return `${activeCount} active ${activeCount === 1 ? 'account' : 'accounts'}`;
              })()}
            </div>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">Topics</div>
            <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {units.length}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Units 7, 8 & 9</div>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">Pending Reviews</div>
            <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {pendingReviewCount}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Practice writing queue</div>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">Live Game</div>
            <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {activeSession ? activeSession.pin : 'None'}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {activeSession ? activeSession.status : 'Ready to start'}
            </div>
          </div>
        </section>
      )}

      {/* Topics Progress + Recent Badges */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Topics
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('practice')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Open Practice
            </button>
          </div>

          <div className="space-y-4">
            {units.map((u) => {
              const prog =
                u.number === 7
                  ? myScore?.unit7Progress ?? 0
                  : u.number === 8
                  ? myScore?.unit8Progress ?? 0
                  : myScore?.unit9Progress ?? 0;
              return (
                <div key={u.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm gap-3">
                    <button
                      type="button"
                      onClick={() => onStartTopicPractice(u.id)}
                      className="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 text-left"
                    >
                      Unit {u.number}: {u.title}
                    </button>
                    <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {role === 'student' ? `${prog}%` : u.subtitle}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${role === 'student' ? prog : 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="lg:col-span-5 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <Award className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              Recent Badges
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('leaderboard')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              View Leaderboard
            </button>
          </div>

          {myBadges.length === 0 ? (
            <div className="py-6 text-sm text-slate-500 dark:text-slate-400">
              No badges unlocked yet. Play classroom games and practice rounds to earn badges.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {myBadges.slice(0, 4).map((b) => (
                <div key={b.id} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3">
                  <Trophy className="w-4 h-4 text-violet-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {b.title}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{b.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
