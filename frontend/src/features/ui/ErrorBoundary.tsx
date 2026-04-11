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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-950/80 backdrop-blur-xl p-6 transition-all duration-500">
                <div className="max-w-2xl w-full bg-card border border-border shadow-2xl relative overflow-hidden group flex flex-col items-stretch text-left animate-in zoom-in-95 duration-300">
                    {/* Header: Clinical Status */}
                    <div className="bg-rose-500/10 border-b border-rose-500/20 px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <AlertTriangle className="text-rose-500" size={18} />
                            <h1 className="text-sm font-black uppercase tracking-widest text-rose-500">System Fault Detected</h1>
                        </div>
                        <div className="flex items-center gap-2 pr-2">
                            {/* Alert indicator removed as requested */}
                        </div>
                    </div>
                    
                    <div className="p-8">
                        <p className="text-foreground font-medium mb-6 leading-relaxed">
                            A critical runtime exception has interrupted the execution process. The system has successfully isolated the fault for diagnostic review.
                        </p>
                        
                        <div className="bg-black/40 p-4 rounded border border-border/50 font-mono mb-8 relative group/code">
                            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/30 mb-3 flex items-center gap-2">
                                <div className="w-1 h-3 bg-rose-500/30" /> Fault Trace
                            </div>
                            <code className="text-xs text-rose-200/80 block break-all leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto custom-cc-scroll">
                                {this.state.error?.stack || this.state.error?.message || "UNDEFINED_RUNTIME_FAULT"}
                            </code>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                            <button 
                                onClick={this.handleRetry}
                                className={`h-11 rounded border border-border flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-widest hover:bg-secondary transition-all active:scale-[0.98]`}
                            >
                                <RotateCcw size={14} /> Re-Initialize
                            </button>
                            <button 
                                onClick={this.handleReset}
                                className="h-11 bg-primary text-primary-foreground rounded flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all"
                            >
                                Reload Platform
                            </button>
                        </div>

                        {/* Standardized Branding */}
                        <div className="pt-6 border-t border-border/40 flex items-center justify-between opacity-30 grayscale">
                            <span className="text-[9px] font-black uppercase tracking-[0.2em]">CraftCommand [CORE_ENGINE]</span>
                            <span className="text-[9px] font-mono">STATUS: HALTED_SECURE</span>
                        </div>
                    </div>
                </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;