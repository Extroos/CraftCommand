import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Terminal, X, ChevronRight } from 'lucide-react';

interface DevWarningModalProps {
    isOpen: boolean;
    onClose: () => void;
    visualQuality?: boolean;
    version?: string;
    metadata?: { title: string, notes: string[], codename?: string } | null;
}

export const DevWarningModal: React.FC<DevWarningModalProps> = ({ isOpen, onClose, visualQuality, version = '0.0.0', metadata }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className={`max-w-2xl w-full border border-border shadow-2xl relative overflow-hidden rounded-lg bg-card`}
                    >
                        {/* Title Bar - OS Style */}
                        <div className="flex items-center justify-between px-4 py-2 bg-secondary/30 border-b border-border">
                            <div className="flex items-center gap-2">
                                <Terminal size={14} className="text-muted-foreground" />
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                    System Warning // build_{version} {metadata?.codename ? `(${metadata.codename})` : ''}
                                </span>
                            </div>
                            <button onClick={onClose} className="p-1 hover:bg-rose-500/10 hover:text-rose-500 rounded transition-colors text-muted-foreground/50">
                                <X size={14} strokeWidth={3} />
                            </button>
                        </div>

                        <div className="p-8 space-y-8">
                            {/* Critical Notice */}
                            <div className="flex gap-6 items-start">
                                <div className="mt-1 flex-shrink-0 w-12 h-12 rounded border border-amber-500/20 bg-amber-500/5 flex items-center justify-center text-amber-500">
                                    <AlertTriangle size={24} strokeWidth={1.5} />
                                </div>
                                <div className="space-y-3">
                                    <h2 className="text-xl font-bold text-foreground tracking-tight">{metadata?.title || 'Development Environment Phase'}</h2>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        CraftCommand is presently in a <span className="text-foreground font-semibold">pre-production state</span>. While core orchestration is functional, the system has not reached full industrial stability. Regressions, data drift, and unexpected process interruptions may occur.
                                    </p>
                                    <p className="text-xs text-muted-foreground/60 italic border-l-2 border-border pl-4">
                                        Professional usage requires frequent backups and documentation of operational anomalies.
                                    </p>
                                </div>
                            </div>

                            {/* Technical Log (Classic List) */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 px-1">
                                    <div className="h-px flex-1 bg-border/40" />
                                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.3em]">Technical Milestones [v{version.slice(0, 4)}]</span>
                                    <div className="h-px flex-1 bg-border/40" />
                                </div>
                                
                                <div className="space-y-1.5 font-mono">
                                    {(metadata?.notes || [
                                        "Native Linux (POSIX) deployment support integrated.",
                                        "Atomic write-ahead-logging (AWL) for DB integrity.",
                                        "System V3 predictive drift detection methodology.",
                                        "Ed25519 mutual authentication for remote agents."
                                    ]).map((note, i) => (
                                        <div key={i} className="flex items-start gap-3 px-2 py-1 group transition-colors">
                                            <span className="text-primary/40 text-[10px] select-none mt-0.5"><ChevronRight size={12} /></span>
                                            <div className="flex gap-3 items-baseline">
                                                <span className="text-[11px] text-muted-foreground leading-snug">{note}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Pro Action Bar */}
                            <div className="pt-4 flex justify-end">
                                <button 
                                    onClick={onClose}
                                    className="px-8 py-3 bg-foreground text-background rounded font-bold text-xs uppercase tracking-widest hover:bg-foreground/90 transition-all active:scale-[0.97]"
                                >
                                    Confirm Acknowledgement
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
