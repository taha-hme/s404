import { Award, History, Trophy } from 'lucide-react';
import { BADGE_CATALOG } from '../lib/leagueRules';
import type {
  Achievement,
  OfficialScore,
  ScoreEvent,
  StudentProfile,
} from '../types/league';

interface LeagueViewProps {
  students: StudentProfile[];
  officialScores: OfficialScore[];
  achievements: Achievement[];
  scoreEvents: ScoreEvent[];
  currentStudentId?: string;
}

export function LeagueView({
  students,
  officialScores,
  achievements,
  scoreEvents,
  currentStudentId,
}: LeagueViewProps) {
  const rows = students.map((stu) => {
    const score = officialScores.find((s) => s.studentId === stu.id);
    const badges = achievements.filter((a) => a.studentId === stu.id);
    return {
      student: stu,
      xp: score?.xp ?? 0,
      rankTitle: score?.rankTitle ?? 'Contender',
      unit7: score?.unit7Progress ?? 0,
      unit8: score?.unit8Progress ?? 0,
      unit9: score?.unit9Progress ?? 0,
      correctCount: score?.correctCount ?? 0,
      streak: score?.streak ?? 0,
      badges,
    };
  });

  rows.sort((a, b) => b.xp - a.xp || a.student.displayName.localeCompare(b.student.displayName));

  const teamAXp = rows
    .filter((r) => r.student.teamDefault === 'A')
    .reduce((acc, r) => acc + r.xp, 0);
  const teamBXp = rows
    .filter((r) => r.student.teamDefault === 'B')
    .reduce((acc, r) => acc + r.xp, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Leaderboard
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Official scores, topic progress, and badges for S404.
          </p>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-slate-500 dark:text-slate-400">Blue Vanguard: </span>
            <span className="font-mono font-semibold tabular-nums text-blue-600 dark:text-blue-400">
              {teamAXp} XP
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">Violet Syndicate: </span>
            <span className="font-mono font-semibold tabular-nums text-violet-600 dark:text-violet-400">
              {teamBXp} XP
            </span>
          </div>
        </div>
      </div>

      {/* Leaderboard Table */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No student accounts added yet. The teacher can create student accounts from the Teacher
            Panel.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-3.5 px-4 font-medium">Pos</th>
                  <th className="py-3.5 px-4 font-medium">Player</th>
                  <th className="py-3.5 px-4 font-medium">Rank</th>
                  <th className="py-3.5 px-4 font-medium">Units 7 / 8 / 9</th>
                  <th className="py-3.5 px-4 font-medium">Badges</th>
                  <th className="py-3.5 px-4 font-medium text-right">Official XP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {rows.map((row, idx) => {
                  const isMe = row.student.id === currentStudentId;
                  return (
                    <tr
                      key={row.student.id}
                      className={
                        isMe
                          ? 'bg-blue-50/60 dark:bg-blue-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }
                    >
                      <td className="py-3.5 px-4 font-mono font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                        #{idx + 1}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {row.student.displayName}
                          {isMe ? ' (You)' : ''}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Team {row.student.teamDefault} · {row.correctCount} correct
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700 dark:text-slate-200">
                        {row.rankTitle}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                        {row.unit7}% · {row.unit8}% · {row.unit9}%
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                        {row.badges.length > 0
                          ? row.badges.map((b) => b.title).join(', ')
                          : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-blue-600 dark:text-blue-400">
                        {row.xp}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Badges & Recent Score Events */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2">
            <Award className="w-4 h-4 text-violet-500" />
            Badges
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BADGE_CATALOG.map((badge) => {
              const unlockedCount = achievements.filter((a) => a.badgeKey === badge.key).length;
              return (
                <div
                  key={badge.key}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5 text-violet-500" />
                      {badge.title}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {unlockedCount} earned
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{badge.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="lg:col-span-6 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-4">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2">
            <History className="w-4 h-4 text-blue-500" />
            Recent Score Events
          </h3>
          {scoreEvents.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No score events recorded yet. Points from classroom games and teacher reviews will
              appear here.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[340px] overflow-y-auto">
              {scoreEvents.slice(0, 15).map((ev) => (
                <div key={ev.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {ev.studentName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {ev.reason} · {ev.source.replace('_', ' ')}
                    </div>
                  </div>
                  <span
                    className={`font-mono text-sm font-semibold tabular-nums shrink-0 ${
                      ev.points >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {ev.points >= 0 ? `+${ev.points}` : ev.points} XP
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
