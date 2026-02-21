import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Wrench, CheckCircle, Zap, Copy, Check, X, ShieldAlert, Terminal, Info, Activity, RotateCcw } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { API } from '@core/services/api';
import { DiagnosisResult } from '@shared/types';
import { STAGGER_CONTAINER, STAGGER_ITEM } from '../../styles/motion';

interface DiagnosisCardProps {
    result: DiagnosisResult | null;
    serverId: string;
    onFix: () => void;
    onDismiss: () => void;
    onViewCrash?: (reportId: string) => void;
}

export const DiagnosisCard: React.FC<DiagnosisCardProps> = ({ result, serverId, onFix, onDismiss, onViewCrash }) => {
    const [fixing, setFixing] = React.useState(false);
    const [fixed, setFixed] = React.useState(false);
    const [copied, setCopied] = React.useState(false);
    const { addToast } = useToast();

    if (!result) return null;

    const handleAutoFix = async () => {
        if (!result.action) return;
        setFixing(true);
        try {
            await API.healServer(serverId, result.action.type, result.action.payload);
            setFixed(true);
            setTimeout(() => {
                onFix();
            }, 1500);
        } catch (e) {
            console.error('Fix failed', e);
            setFixing(false);
            addToast('error', 'Fix Failed', e instanceof Error ? e.message : 'An unexpected error occurred.');
        }
    };

    const handleShareReport = () => {
        const report = {
            diagnosis_id: result.id,
            rule: result.ruleId,
            severity: result.severity,
            incident: result.title,
            details: result.explanation,
            recommendation: result.recommendation,
            timestamp: new Date(result.timestamp).toISOString(),
            automated_fix_available: !!result.action
        };
        
        navigator.clipboard.writeText(JSON.stringify(report, null, 2));
        setCopied(true);
        addToast('success', 'Report Copied', 'Diagnostic data copied to clipboard.');
        setTimeout(() => setCopied(false), 2000);
    };

    const isCritical = result.severity === 'CRITICAL';
    const accentColor = isCritical ? 'text-rose-500' : 'text-amber-500';
    const accentBg = isCritical ? 'bg-rose-500/5' : 'bg-amber-500/5';
    const accentBorder = isCritical ? 'border-rose-500/20' : 'border-amber-500/20';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                onClick={!fixing ? onDismiss : undefined}
            />

            {/* Modal Content - Classic/Professional Design */}
            <motion.div 
                initial={{ opacity: 0, y: 15, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -15, scale: 0.98 }}
                className="relative w-full max-w-2xl bg-card border border-border shadow-xl rounded-xl overflow-hidden flex flex-col max-h-[90vh]"
            >
                {/* Header Section */}
                <div className="bg-muted/20 border-b border-border p-4 shrink-0">
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                             <div className={`w-1.5 h-1.5 rounded-full ${isCritical ? 'bg-rose-500' : 'bg-amber-500'}`}></div>
                             <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{result.severity} DIAGNOSIS ENGINE</span>
                        </div>
                        {!fixing && (
                            <button onClick={onDismiss} className="text-muted-foreground/60 hover:text-foreground transition-colors p-1">
                                <X size={16} />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <h2 className="text-lg font-bold text-foreground tracking-tight">{result.title}</h2>
                        {result.ruleId && (
                            <span className="text-[10px] font-mono font-bold text-muted-foreground/40 hidden sm:inline">RULE: {result.ruleId.toUpperCase()}</span>
                        )}
                    </div>
                </div>

                {/* Content Section */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    <motion.div variants={STAGGER_CONTAINER} initial="hidden" animate="show" className="space-y-6">
                        {/* Summary & Tags */}
                        <motion.div variants={STAGGER_ITEM} className="flex flex-wrap items-center gap-2">
                            {result.isRootCause && (
                                <div className="px-2 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/5 text-emerald-500 text-[10px] font-bold uppercase tracking-tight">
                                    Root Cause
                                </div>
                            )}
                            <div className={`px-2 py-0.5 rounded border ${accentBorder} ${accentBg} ${accentColor} text-[10px] font-bold uppercase tracking-tight`}>
                                {result.severity} Priority
                            </div>
                            <div className="px-2 py-0.5 rounded border border-border bg-muted/30 text-muted-foreground text-[10px] font-bold uppercase tracking-tight">
                                Detection #{result.id.split('-')[0].toUpperCase()}
                            </div>
                        </motion.div>

                        {/* Analysis */}
                        <motion.div variants={STAGGER_ITEM} className="space-y-3">
                            <label className="text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tighter flex items-center gap-2 h-4">
                                <Activity size={12} className="opacity-40" />
                                Incident Analysis
                            </label>
                            <div className="text-sm text-foreground/80 leading-relaxed font-semibold">
                                {result.explanation}
                            </div>
                        </motion.div>

                        {/* Recommendation */}
                        <motion.div variants={STAGGER_ITEM} className={`p-5 rounded-lg border ${accentBorder} ${accentBg} space-y-3`}>
                            <label className={`text-[11px] font-bold ${accentColor} opacity-70 uppercase tracking-tighter flex items-center gap-2 h-4`}>
                                <Wrench size={12} />
                                Resolution Strategy
                            </label>
                            <div className="text-sm text-foreground font-bold tracking-tight">
                                {result.recommendation}
                            </div>
                        </motion.div>

                        {/* Confidence Meter */}
                        <motion.div variants={STAGGER_ITEM} className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest flex justify-between h-4">
                                    Confidence
                                    <span>{result.confidence}%</span>
                                </label>
                                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden border border-border/20">
                                    <motion.div 
                                        initial={{ width: 0 }}
                                        animate={{ width: `${result.confidence}%` }}
                                        transition={{ duration: 0.8, ease: "easeOut" }}
                                        className={`h-full ${isCritical ? 'bg-rose-500' : 'bg-amber-500'}`}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest h-4">Detected at</label>
                                <div className="text-[11px] font-mono font-bold text-muted-foreground/80 whitespace-nowrap">
                                    {new Date(result.timestamp).toLocaleString()}
                                </div>
                            </div>
                        </motion.div>

                        {/* Suppressed Issues */}
                        {result.suppressedBy && result.suppressedBy.length > 0 && (
                            <motion.div variants={STAGGER_ITEM} className="space-y-2 pt-2">
                                <label className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-[0.2em] h-3">Suppressed Signals</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {result.suppressedBy.map(sid => (
                                        <span key={sid} className="text-[9px] font-mono px-1.5 py-0.5 bg-muted/30 text-muted-foreground border border-border/40 rounded uppercase font-bold">
                                            {sid}
                                        </span>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </motion.div>
                </div>

                {/* Footer Section */}
                <div className="p-4 bg-muted/10 border-t border-border flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        {result.action && !fixed && (
                            <button 
                                onClick={handleAutoFix}
                                disabled={fixing}
                                className={`px-5 py-2 ${isCritical ? 'bg-rose-500 hover:bg-rose-600' : 'bg-primary hover:bg-primary/90'} text-white rounded-md text-[10px] font-bold tracking-tight disabled:opacity-50 transition-all flex items-center gap-2 shadow-sm`}
                            >
                                {fixing ? <RotateCcw size={12} className="animate-spin" /> : <Zap size={12} className="fill-current" />}
                                {fixing ? 'Applying Fix...' : 'Apply Automatic Fix'}
                            </button>
                        )}

                        {fixed && (
                            <div className="px-5 py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-md text-[10px] font-bold tracking-tight flex items-center gap-2">
                                <CheckCircle size={12} />
                                Fix Applied Successfully
                            </div>
                        )}

                        {!fixing && !fixed && (
                            <button
                                onClick={handleShareReport}
                                className="px-4 py-2 hover:bg-muted text-[10px] font-bold text-muted-foreground hover:text-foreground transition-all rounded-md flex items-center gap-2"
                            >
                                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                                {copied ? 'Copied' : 'Share Report'}
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {result.connectedCrashReport && (
                            <button
                                onClick={() => onViewCrash && onViewCrash(result.connectedCrashReport?.id || '')}
                                className="px-3 py-2 text-rose-500/70 hover:text-rose-500 text-[10px] font-bold transition-colors"
                            >
                                View Crash Log
                            </button>
                        )}
                        {!fixing && !fixed && (
                            <button 
                                onClick={onDismiss}
                                className="px-4 py-2 hover:bg-muted text-[10px] font-bold text-muted-foreground/60 hover:text-foreground transition-all rounded-md"
                            >
                                Ignore
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
