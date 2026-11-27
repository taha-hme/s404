import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    let friendlyDetail = this.state.errorMessage;
    try {
      const parsed = JSON.parse(this.state.errorMessage);
      if (parsed?.error) {
        friendlyDetail = `${parsed.error} (${parsed.operationType ?? 'operation'} on ${parsed.path ?? 'database'})`;
      }
    } catch {
      // Plain error message
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#070B16] p-6">
        <div className="max-w-lg w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-6 space-y-4">
          <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Connection or Permission Issue
            </h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {friendlyDetail || 'An unexpected application error occurred.'}
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, errorMessage: '' });
              window.location.reload();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reload Application
          </button>
        </div>
      </div>
    );
  }
}
