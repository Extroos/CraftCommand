
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download } from 'lucide-react';

interface ProgressOverlayProps {
    isVisible: boolean;
    percent: number;
    message?: string;
    phase?: string;
    title?: string;
    variant?: 'linear' | 'compact' | 'circular';
    logs?: string[];
}

export const ProgressOverlay: React.FC<ProgressOverlayProps> = ({ 
    isVisible, 
    percent, 
    message, 
    phase, 
    title = "System Operation in Progress",
    variant = 'linear',
    logs = []
}) => {
    const [showLogs, setShowLogs] = React.useState(false);

    if (variant === 'circular') {
        const radius = 18;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percent / 100) * circumference;

        return (
            <div className="relative flex items-center justify-center w-12 h-12">
                <svg className="w-full h-full transform -rotate-90">
                    <circle
                        cx="24"
                        cy="24"
                        r={radius}
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="transparent"
                        className="text-muted/10"
                    />
                    <motion.circle
                        cx="24"
                        cy="24"
                        r={radius}
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="transparent"
                        strokeDasharray={circumference}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset: offset }}
                        className="text-indigo-500"
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold font-mono text-indigo-500">
                    {Math.max(0, Math.round(percent))}%
                </div>
            </div>
        );
    }

    if (variant === 'compact') {
        return (
            <div className="flex flex-col gap-1 w-full">
                <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-indigo-400 animate-pulse truncate max-w-[120px]">{message || phase || 'Installing...'}</span>
                    <span className="text-indigo-400/60 font-mono">{Math.max(0, Math.round(percent))}%</span>
                </div>
                <div className="h-1 bg-muted/30 rounded-full overflow-hidden border border-border/50">
                    <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(0, percent)}%` }}
                        className="h-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.4)]"
                        transition={{ type: 'spring', stiffness: 50, damping: 20 }}
                    />
                </div>
            </div>
        );
    }

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div 
                    initial={{ opacity: 0, y: -10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -10, height: 0 }}
                    className="overflow-hidden mb-4"
                >
                    <div className="p-4 border border-primary/20 rounded-xl flex flex-col gap-3 glass-morphism quality-shadow">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                <Download size={20} className="animate-pulse" />
                            </div>
                            <div className="flex-1 space-y-1.5">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-foreground uppercase tracking-[0.15em]">
                                        {title}
                                    </span>
                                    <div className="flex items-center gap-3">
                                        {logs.length > 0 && (
                                            <button 
                                                onClick={() => setShowLogs(!showLogs)}
                                                className="text-[9px] font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest border border-border/40 px-2 py-0.5 rounded"
                                            >
                                                {showLogs ? 'Hide Logs' : 'View Details'}
                                            </button>
                                        )}
                                            {Math.max(0, Math.round(percent))}%
                                    </div>
                                </div>
                                <div className="h-1 bg-muted rounded-full overflow-hidden">
                                    <motion.div 
                                        className="h-full bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.4)]"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.max(0, percent)}%` }}
                                        transition={{ type: 'spring', stiffness: 50, damping: 20 }}
                                    />
                                </div>
                                <div className="flex justify-between items-center opacity-60">
                                    <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider truncate max-w-[300px]">
                                        {message || phase || 'Processing...'}
                                    </span>
                                    <span className="text-[9px] font-bold text-muted-foreground uppercase">
                                        Status: ACTIVE
                                    </span>
                                </div>
                            </div>
                        </div>

                        {showLogs && logs.length > 0 && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="bg-black/20 rounded-lg p-3 font-mono text-[10px] text-zinc-400 overflow-y-auto max-h-32 border border-border/20"
                            >
                                {logs.map((log, i) => (
                                    <div key={i} className="whitespace-pre-wrap break-all opacity-80 hover:opacity-100 transition-opacity">
                                        <span className="text-primary/50 mr-2">[{new Date().toLocaleTimeString()}]</span>
                                        {log}
                                    </div>
                                ))}
                            </motion.div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
