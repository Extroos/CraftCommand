import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <div className="max-w-md w-full bg-card border border-border rounded-xl p-8 text-center shadow-2xl">
                <div className="bg-rose-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                    <AlertTriangle className="text-rose-500" size={32} />
                </div>
                <h1 className="text-2xl font-bold text-foreground mb-2">Something went wrong</h1>
                <p className="text-muted-foreground text-sm mb-6">
                    The application encountered an unexpected error. 
                </p>
                <div className="bg-secondary/50 p-3 rounded-lg text-left mb-6 overflow-hidden">
                    <code className="text-xs font-mono text-rose-400 block truncate">
                        {this.state.error?.message}
                    </code>
                </div>
                <button 
                    onClick={this.handleReset}
                    className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-medium flex items-center justify-center gap-2 mx-auto hover:bg-primary/90 transition-colors"
                >
                    <RotateCcw size={16} /> Reload Application
                </button>
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;