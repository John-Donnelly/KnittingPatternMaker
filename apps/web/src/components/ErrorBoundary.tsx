import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time exceptions anywhere below it and shows a recoverable fallback instead of
 * unmounting the whole tree to a blank white page. React only routes errors to class
 * components, so this stays a class even though the rest of the app is function components.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the details for debugging; there is no server-side error sink to report to.
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="app">
        <div className="panel" role="alert">
          <h2>Something went wrong</h2>
          <p className="hint">
            The app hit an unexpected error and couldn&apos;t continue. Reloading starts a fresh
            session — your uploaded image and settings will need to be re-entered.
          </p>
          <p className="error">{error.message}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload the app
          </button>
        </div>
      </div>
    );
  }
}
