import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Wrench, CheckCircle, Zap, Copy, Check, X, ShieldAlert, Terminal, Info, Activity, RotateCcw, ChevronDown, ChevronUp, Terminal as TermIcon, FileCode, CheckCircle2 } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { useTranslation } from 'react-i18next';
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
    const [showEvidence, setShowEvidence] = React.useState(false);
    const [fixStep, setFixStep] = React.useState<'idle' | 'stopping' | 'applying' | 'verifying'>('idle');
    const { addToast } = useToast();
    const { t } = useTranslation();

    if (!result) return null;

    const handleAutoFix = async () => {
        if (!result.action) return;
        setFixing(true);
        setFixStep('stopping');
        try {
            // Simulated multi-step for user feedback
            await new Promise(r => setTimeout(r, 600));
            setFixStep('applying');
            await API.healServer(serverId, result.action.type, result.action.payload);
            
            await new Promise(r => setTimeout(r, 800));
            setFixStep('verifying');
            
            await new Promise(r => setTimeout(r, 600));
            setFixed(true);
            setTimeout(() => {
                onFix();
            }, 1500);
        } catch (e) {
            console.error('Fix failed', e);
            setFixing(false);
            setFixStep('idle');
            addToast('error', t('dashboard.power_action_failed'), e instanceof Error ? e.message : t('common.error_occurred'));
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
        addToast('success', t('common.success'), t('common.copied_clipboard'));
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
                             <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t('diagnosis.issue_detected', { severity: result.severity })}</span>
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
                            <span className="text-[10px] font-mono font-bold text-muted-foreground/40 hidden sm:inline">{t('diagnosis.rule')}: {result.ruleId.toUpperCase()}</span>
                        )}
                    </div>
                </div>

                {/* Content Section */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    <div className="space-y-6">
                        {/* Summary & Tags */}
                        <div className="flex flex-wrap items-center gap-2">
                            {result.isRootCause && (
                                <div className="px-2 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/5 text-emerald-500 text-[10px] font-bold uppercase tracking-tight">
                                    {t('diagnosis.root_cause')}
                                </div>
                            )}
                            <div className={`px-2 py-0.5 rounded border ${accentBorder} ${accentBg} ${accentColor} text-[10px] font-bold uppercase tracking-tight`}>
                                {t('diagnosis.priority', { severity: result.severity })}
                            </div>
                            <div className="px-2 py-0.5 rounded border border-border bg-muted/30 text-muted-foreground text-[10px] font-bold uppercase tracking-tight">
                                {t('diagnosis.detection_id')}{result.id.split('-')[0].toUpperCase()}
                            </div>
                        </div>

                        {/* Analysis */}
                        <div className="space-y-3">
                            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-tighter flex items-center gap-2 h-4">
                                <Activity size={12} className="opacity-70" />
                                {t('diagnosis.analysis')}
                            </label>
                            <div className="text-sm text-foreground/80 leading-relaxed font-semibold">
                                {result.explanation}
                            </div>
                        </div>

                        {/* Recommendation */}
                        <div className={`p-5 rounded-lg border ${accentBorder} ${accentBg} space-y-3`}>
                            <label className={`text-[11px] font-bold ${accentColor} uppercase tracking-tighter flex items-center gap-2 h-4`}>
                                <Wrench size={12} />
                                {t('diagnosis.remediation')}
                            </label>
                            <div className="text-sm text-foreground font-bold tracking-tight">
                                {result.recommendation}
                            </div>
                        </div>

                        {/* Confidence Meter */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex justify-between h-4">
                                    {t('diagnosis.confidence')}
                                    <span>{result.confidence}%</span>
                                </label>
                                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden border border-border/20">
                                    <motion.div 
                                        initial={{ width: 0 }}
                                        animate={{ width: `${result.confidence}%` }}
                                        transition={{ duration: 0.6, ease: "easeOut" }}
                                        className={`h-full ${isCritical ? 'bg-rose-500' : 'bg-amber-500'}`}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest h-4">{t('diagnosis.detected_at')}</label>
                                <div className="text-[11px] font-mono font-bold text-muted-foreground whitespace-nowrap">
                                    {new Date(result.timestamp).toLocaleString()}
                                </div>
                            </div>
                        </div>

                        {/* NEW: Technical Evidence Section */}
                        {result.evidence && (
                            <div className="space-y-2 pt-2">
                                <button 
                                    onClick={() => setShowEvidence(!showEvidence)}
                                    className="flex items-center justify-between w-full text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest hover:text-foreground transition-colors"
                                >
                                    <span className="flex items-center gap-2">
                                        <TermIcon size={12} />
                                        {t('diagnosis.evidence')}
                                    </span>
                                    {showEvidence ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                                {showEvidence && (
                                    <motion.div 
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        className="p-3 bg-black/40 border border-border/40 rounded font-mono text-[11px] text-rose-400 overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner"
                                    >
                                        {result.evidence}
                                    </motion.div>
                                )}
                            </div>
                        )}

                        {/* NEW: Fix Breakdown (What will change) */}
                        {result.action && !fixing && !fixed && (
                            <div className="p-4 bg-muted/20 border border-border/40 rounded-lg space-y-3">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter flex items-center gap-2">
                                    <FileCode size={12} />
                                    {t('diagnosis.impact')}
                                </label>
                                <ul className="space-y-1.5">
                                    <li className="text-[11px] text-foreground/70 flex items-center gap-2">
                                        <div className="w-1 h-1 bg-primary rounded-full" />
                                        <span>{t('diagnosis.patch_apply_msg')} <strong>{result.action.type.toLowerCase().replace(/_/g, ' ')}</strong></span>
                                    </li>
                                    {result.action.automaticRepair && (
                                        <li className="text-[10px] text-emerald-500/80 font-semibold italic">
                                            {t('diagnosis.repair_safe_msg')}
                                        </li>
                                    )}
                                </ul>
                            </div>
                        )}

                        {/* NEW: Fix Progress Stepper */}
                        {fixing && !fixed && (
                            <div className="p-4 bg-muted/20 border border-border/40 rounded-lg space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary animate-pulse">
                                        {t('diagnosis.fix_progress')}: {fixStep.charAt(0).toUpperCase() + fixStep.slice(1)}...
                                    </span>
                                    <span className="text-[10px] font-mono text-muted-foreground">{fixStep === 'stopping' ? '33%' : fixStep === 'applying' ? '66%' : '90%'}</span>
                                </div>
                                <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                    <motion.div 
                                        className="h-full bg-primary"
                                        animate={{ 
                                            width: fixStep === 'stopping' ? '33%' : fixStep === 'applying' ? '66%' : '95%' 
                                        }}
                                        transition={{ duration: 0.5 }}
                                    />
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                     <div className={`text-[9px] font-bold text-center uppercase ${fixStep === 'stopping' ? 'text-primary' : 'text-muted-foreground/40'}`}>{t('diagnosis.step_isolation')}</div>
                                     <div className={`text-[9px] font-bold text-center uppercase ${fixStep === 'applying' ? 'text-primary' : 'text-muted-foreground/40'}`}>{t('diagnosis.step_patching')}</div>
                                     <div className={`text-[9px] font-bold text-center uppercase ${fixStep === 'verifying' ? 'text-primary' : 'text-muted-foreground/40'}`}>{t('diagnosis.step_validation')}</div>
                                </div>
                            </div>
                        )}

                        {/* Suppressed Issues */}
                        {result.suppressedBy && result.suppressedBy.length > 0 && (
                            <div className="space-y-2 pt-2">
                                <label className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-[0.2em] h-3">{t('diagnosis.suppressed_signals')}</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {result.suppressedBy.map(sid => (
                                        <span key={sid} className="text-[9px] font-mono px-1.5 py-0.5 bg-muted/30 text-muted-foreground border border-border/40 rounded uppercase font-bold">
                                            {sid}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Section */}
                <div className="p-4 bg-muted/10 border-t border-border flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        {result.action && !fixed && (
                            <button 
                                onClick={handleAutoFix}
                                disabled={fixing}
                                className={`px-5 py-2 ${isCritical ? 'bg-rose-500 hover:bg-rose-600 text-rose-50' : 'bg-primary hover:bg-primary/90 text-primary-foreground'} rounded-md text-[10px] font-bold tracking-tight disabled:opacity-50 transition-all flex items-center gap-2 shadow-sm`}
                            >
                                {fixing ? <RotateCcw size={12} className="animate-spin" /> : <Zap size={12} className="fill-current" />}
                                {fixing ? t('diagnosis.applying_fix') : t('diagnosis.apply_fix')}
                            </button>
                        )}

                        {fixed && (
                            <div className="px-5 py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-md text-[10px] font-bold tracking-tight flex items-center gap-2">
                                <CheckCircle size={12} />
                                {t('diagnosis.fix_success')}
                            </div>
                        )}

                        {!fixing && !fixed && (
                            <button
                                onClick={handleShareReport}
                                className="px-4 py-2 hover:bg-muted text-[10px] font-bold text-muted-foreground hover:text-foreground transition-all rounded-md flex items-center gap-2"
                            >
                                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                                {copied ? t('common.copied') : t('diagnosis.share_report')}
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {result.connectedCrashReport && (
                            <button
                                onClick={() => onViewCrash && onViewCrash(result.connectedCrashReport?.id || '')}
                                className="px-3 py-2 text-rose-500/70 hover:text-rose-500 text-[10px] font-bold transition-colors"
                            >
                                {t('diagnosis.view_crash')}
                            </button>
                        )}
                        {!fixing && !fixed && (
                            <button 
                                onClick={onDismiss}
                                className="px-4 py-2 hover:bg-muted text-[10px] font-bold text-muted-foreground/60 hover:text-foreground transition-all rounded-md"
                            >
                                {t('common.close')}
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
