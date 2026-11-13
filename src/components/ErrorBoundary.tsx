import React from 'react';
import { t } from '../i18n';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render/runtime errors anywhere in the tree so a single bug shows a
 * recoverable message instead of a blank white panel inside the Base sidebar.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Global Search crashed:', error, info);
  }

  private handleReload = (): void => {
    this.setState({ error: null });
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="error-boundary" role="alert">
          <h2 className="error-boundary-title">{t('boundary.title')}</h2>
          <p className="error-boundary-message">{this.state.error.message}</p>
          <button className="error-boundary-button" onClick={this.handleReload}>
            {t('boundary.reload')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
