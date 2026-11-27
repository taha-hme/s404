import type { ReactNode } from 'react';
import {
  BookOpen,
  Gamepad2,
  Home,
  LogOut,
  Moon,
  Shield,
  Sun,
  Trophy,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { UserRole } from '../types/league';

export type NavTab = 'home' | 'games' | 'leaderboard' | 'practice' | 'teacher';

interface AppShellProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  role: UserRole;
  displayName: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  isOnline: boolean;
  pendingOfflineCount: number;
  onLogout: () => void;
  children: ReactNode;
}

const BASE_NAV: Array<{ id: NavTab; label: string; shortLabel: string; icon: typeof Home }> = [
  { id: 'home', label: 'Home', shortLabel: 'Home', icon: Home },
  { id: 'games', label: 'Games', shortLabel: 'Games', icon: Gamepad2 },
  { id: 'leaderboard', label: 'Leaderboard', shortLabel: 'Ranks', icon: Trophy },
  { id: 'practice', label: 'Practice', shortLabel: 'Practice', icon: BookOpen },
];

export function AppShell({
  activeTab,
  onSelectTab,
  role,
  displayName,
  theme,
  onToggleTheme,
  isOnline,
  pendingOfflineCount,
  onLogout,
  children,
}: AppShellProps) {
  const navItems =
    role === 'teacher'
      ? [
          ...BASE_NAV,
          { id: 'teacher' as NavTab, label: 'Teacher Panel', shortLabel: 'Teacher', icon: Shield },
        ]
      : BASE_NAV;

  const currentNav = navItems.find((n) => n.id === activeTab) ?? navItems[0];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070B16] text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] sticky top-0 h-screen">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800">
          <div className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            S404 — English League
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Think. Speak. Compete.
          </div>
        </div>

        <nav aria-label="Primary navigation" className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="px-2 space-y-0.5">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {role === 'teacher' ? 'Teacher' : 'Player'}
            </div>
            <div className="text-sm font-semibold truncate">{displayName}</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              className="flex-1 min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button
              type="button"
              onClick={onLogout}
              aria-label="Logout"
              className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col pb-20 md:pb-0">
        <header className="sticky top-0 z-20 bg-white/95 dark:bg-[#0B1120]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="md:hidden font-display font-bold text-base whitespace-nowrap">S404</span>
            <h1 className="font-display text-base sm:text-lg font-semibold truncate">
              {currentNav.label}
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border ${
                isOnline
                  ? 'border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/40'
                  : 'border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40'
              }`}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>
                {isOnline
                  ? pendingOfflineCount > 0
                    ? `Syncing (${pendingOfflineCount})`
                    : 'Connected'
                  : `Offline${pendingOfflineCount > 0 ? ` (${pendingOfflineCount} queued)` : ''}`}
              </span>
            </div>

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              className="md:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onLogout}
              aria-label="Logout"
              className="md:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 h-16 bg-white/95 dark:bg-[#0B1120]/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 px-1 flex items-center justify-around"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`min-h-[44px] min-w-[48px] px-2 py-1 rounded-lg flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                active
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="whitespace-nowrap">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
