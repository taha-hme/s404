import { useState, type FormEvent } from 'react';
import { LogIn, Moon, Sun } from 'lucide-react';

interface AuthPortalProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onLogin: (username: string, password: string) => Promise<void>;
  loading: boolean;
  errorMessage: string | null;
}

export function AuthPortal({
  theme,
  onToggleTheme,
  onLogin,
  loading,
  errorMessage,
}: AuthPortalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const trimmedUser = username.trim();
    if (!trimmedUser) {
      setLocalError('Enter your username.');
      return;
    }
    if (!password) {
      setLocalError('Enter your password.');
      return;
    }

    try {
      await onLogin(trimmedUser, password);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to log in.');
    }
  };

  const displayError = localError || errorMessage;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070B16] text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="w-full max-w-5xl mx-auto px-6 py-5 flex items-center justify-between gap-8 border-b border-slate-200/80 dark:border-slate-800/80">
        <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap shrink-0">
          S404 — The English League
        </span>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
              S404 — The English League
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Think. Speak. Compete.
            </p>
          </div>

          {displayError && (
            <div
              role="alert"
              className="p-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-sm text-rose-800 dark:text-rose-200"
            >
              {displayError}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-5"
          >
            <div className="space-y-1.5">
              <label
                htmlFor="login-username"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Username
              </label>
              <input
                id="login-username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="login-password"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Password
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm transition-colors inline-flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
