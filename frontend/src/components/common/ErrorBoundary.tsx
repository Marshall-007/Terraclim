import { Component, type ReactNode } from 'react';

interface Props {
  /** When this changes (e.g. the route), a caught error is cleared so the
   * user can navigate away without a full reload. */
  resetKey?: unknown;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence for the stage demo: any render crash below this
 * boundary shows a compact recover card instead of unmounting the app to a
 * white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Keep a trace for the console without crashing the shell.
    console.error('Screen crashed:', error);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card mx-auto my-10 max-w-md px-6 py-8 text-center">
        <h2 className="font-display text-2xl text-ink">Something went wrong</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          This screen hit an unexpected error. Your data is untouched. Reload to
          carry on where you left off.
        </p>
        <button
          className="btn-primary mt-5"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  }
}
