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

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReset = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex items-center justify-center bg-background/50 backdrop-blur-sm p-6 rounded-2xl border border-border/50 transition-all duration-500">
            <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center shadow-2xl relative overflow-hidden group">
                {/* Subtle background glow */}
                <div className="absolute -top-24 -left-24 w-48 h-48 bg-rose-500/5 rounded-full blur-3xl group-hover:bg-rose-500/10 transition-colors duration-700" />
                
                <div className="bg-rose-500/10 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 transform rotate-3 group-hover:rotate-0 transition-transform duration-500">
                    <AlertTriangle className="text-rose-500" size={40} />
                </div>
                
                <h1 className="text-2xl font-black uppercase tracking-tight text-foreground mb-3">System Fault Detected</h1>
                <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
                    An unexpected exception has occurred in the current view module. You can attempt a soft recovery or reload the entire interface.
                </p>
                
                <div className="bg-secondary/30 p-4 rounded-xl text-left mb-8 border border-border/50">
                    <div className="text-[10px] font-black uppercase tracking-widest text-rose-500/60 mb-2">Error Signature</div>
                    <code className="text-xs font-mono text-rose-300 block break-all opacity-80">
                        {this.state.error?.message || "Unknown Runtime Error"}
                    </code>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-3">
                    <button 
                        onClick={this.handleRetry}
                        className="w-full bg-primary text-primary-foreground h-12 rounded-xl font-bold uppercase text-[11px] tracking-widest flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/20"
                    >
                        <RotateCcw size={14} /> Attempt Recovery
                    </button>
                    <button 
                        onClick={this.handleReset}
                        className="w-full bg-secondary text-foreground h-12 rounded-xl font-bold uppercase text-[11px] tracking-widest flex items-center justify-center gap-2 hover:bg-secondary/80 active:scale-[0.98] transition-all border border-border"
                    >
                        Reload Application
                    </button>
                </div>

                <div className="mt-8 pt-6 border-t border-border/50 flex items-center justify-center gap-2 opacity-40">
                    <div className="h-1 w-1 rounded-full bg-rose-500 animate-pulse" />
                    <span className="text-[9px] font-mono uppercase tracking-[0.2em]">Telemetry Service Offline</span>
                </div>
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;