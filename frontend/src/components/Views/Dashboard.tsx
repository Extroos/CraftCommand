
import React, { useState, useEffect, useRef } from 'react';
import { Power, RotateCcw, Ban, Activity, Cpu, Network, Users, Copy, Check, Disc, Zap, Clock, Terminal, AlertTriangle, Info, X } from 'lucide-react';
import { ServerStatus, ServerConfig, TabView } from '@shared/types';

import { API } from '../../services/api';
import { socketService } from '../../services/socket';

import { useToast } from '../UI/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { DiagnosisCard } from '../Dashboard/DiagnosisCard';


interface DashboardProps {
    serverId: string;
}

interface AnalysisResult {
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    issues: string[];
    environment: {
        java?: string;
        loader?: string;
    };
}

// Technical Sparkline
const Sparkline: React.FC<{ data: number[], color: string, height?: number, max?: number, label?: string, id: string }> = ({ data, color, height = 120, max = 100, label, id }) => {
    if (data.length < 2) return null;

    const width = 200;
    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - (Math.min(val, max) / max) * height;
        return `${x},${y}`;
    });

    const pathData = `M ${points.join(' L ')}`;

    return (
        <div className="relative w-full h-full">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                {/* Clean Grid Lines */}
                <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="currentColor" strokeOpacity="0.05" vectorEffect="non-scaling-stroke" />
                <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} stroke="currentColor" strokeOpacity="0.05" vectorEffect="non-scaling-stroke" />
                <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="currentColor" strokeOpacity="0.05" vectorEffect="non-scaling-stroke" />
                
                {/* Simple Trend Line */}
                <path 
                    d={pathData} 
                    fill="none" 
                    stroke={color} 
                    strokeWidth="1.5" 
                    vectorEffect="non-scaling-stroke" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                    className="opacity-90"
                />
            </svg>
            {label && (
                <div className="absolute top-0 right-0 text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                    {label}
                </div>
            )}
        </div>
    );
};

import { useServers } from '../../context/ServerContext';
import { useUser } from '../../context/UserContext';

const Dashboard: React.FC<DashboardProps> = ({ serverId }) => {
    const { servers, stats: allStats, logs, javaDownloadStatus } = useServers();
    const { user } = useUser();
    const server = servers.find(s => s.id === serverId);
    
    const [hasConflict, setHasConflict] = useState(false);
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

    const [cpuHistory, setCpuHistory] = useState<number[]>(Array(40).fill(0));
    const [memHistory, setMemHistory] = useState<number[]>(Array(40).fill(0));
    const [copied, setCopied] = useState(false);
    const { addToast } = useToast();

    const [crashReport, setCrashReport] = useState<{ analysis: string, logs: string[] } | null>(null);
    const [showCrashModal, setShowCrashModal] = useState(false);
    
    // Update Logic
    const [updateInfo, setUpdateInfo] = useState<any>(null);
    const [dismissedVersion, setDismissedVersion] = useState(() => localStorage.getItem('craftcommand_dismissed_update'));

    // Diagnosis State
    const [diagnosisResult, setDiagnosisResult] = useState<any>(null);

    // Java Download Status - only consider active download phases
    const isJavaDownloading = javaDownloadStatus && 
        (javaDownloadStatus.phase === 'downloading' || 
         javaDownloadStatus.phase === 'extracting' || 
         javaDownloadStatus.phase === 'installing');

    // Auto-Diagnosis Trigger
    useEffect(() => {
        if (server?.status === 'CRASHED' || (server?.status === 'OFFLINE' && !diagnosisResult)) {
            // Check if we should diagnose (e.g. if it just crashed)
            // For now, we'll run it once if we see CRASHED
            if (server.status === 'CRASHED') {
                runDiagnosis();
            }
        } else if (server?.status === 'ONLINE' || server?.status === 'STARTING') {
            setDiagnosisResult(null); // Clear on start
        }
    }, [server?.status]);

    const runDiagnosis = async () => {
        try {
            const results = await API.runDiagnosis(serverId);
            // API returns array, take first result or null
            const result = Array.isArray(results) && results.length > 0 ? results[0] : null;

            if (result) {
                const ignored = JSON.parse(localStorage.getItem(`ignored_diagnoses_${serverId}`) || '[]');
                if (!ignored.includes(result.ruleId)) {
                    setDiagnosisResult(result);
                }
            } else {
                setDiagnosisResult(null);
            }
        } catch (e) {
            console.error('Diagnosis failed:', e);
        }
    };

    useEffect(() => {
        const check = async () => {
            if (user?.role !== 'OWNER' && user?.role !== 'ADMIN') return;
            
            try {
                const info = await API.checkUpdates();
                if (info.available && info.latestVersion !== dismissedVersion) {
                    setUpdateInfo(info);
                }
            } catch (e) {
                // Silent fail
            }
        };
        check();
    }, [dismissedVersion, user?.role]);

    // Java download status is now managed by ServerContext

    const handleDismissUpdate = () => {
        if (!updateInfo) return;
        localStorage.setItem('craftcommand_dismissed_update', updateInfo.latestVersion);
        setDismissedVersion(updateInfo.latestVersion);
        setUpdateInfo(null);
    };

    // Get current stats from global context
    const stats = allStats[serverId] || { cpu: 0, memory: 0, uptime: 0, latency: 0, players: 0, playerList: [], isRealOnline: false, tps: "0.00", pid: 0 };

    const status = server.status;
    const isOnline = status === ServerStatus.ONLINE;

    // SMOOTH UPTIME INTERPOLATION
    const [displayUptime, setDisplayUptime] = useState(stats.uptime);

    // Sync from global stats when they arrive (every 3s)
    useEffect(() => {
        // Only sync if the gap is significant (to prevent backward jumps)
        // or if it's the first sync/reset
        if (Math.abs(displayUptime - stats.uptime) > 2 || stats.uptime === 0) {
             setDisplayUptime(stats.uptime);
        }
    }, [stats.uptime]);

    // Local High-Frequency Ticker (1hz)
    useEffect(() => {
        const isProcessActive = stats.isRealOnline || status === ServerStatus.ONLINE || status === ServerStatus.STARTING;
        const reducedMotion = user?.preferences?.reducedMotion ?? false;

        if (!isProcessActive || reducedMotion) {
            if (displayUptime !== stats.uptime) setDisplayUptime(stats.uptime);
            return;
        }

        const timer = setInterval(() => {
            setDisplayUptime(prev => prev + 1);
        }, 1000);

        return () => clearInterval(timer);
    }, [status, stats.isRealOnline, user?.preferences?.reducedMotion, stats.uptime]);

    useEffect(() => {
        if (server) {
            const conflict = servers.some(other => other.id !== server.id && other.port === server.port && (other.status === 'ONLINE' || other.status === 'STARTING'));
            setHasConflict(conflict);
        }
    }, [server, servers]);

    // Update History when global stats change
    useEffect(() => {
        if (stats.cpu !== undefined) {
             setCpuHistory(prev => [...prev.slice(1), stats.cpu]);
             setMemHistory(prev => [...prev.slice(1), stats.memory]);
        }
    }, [stats.cpu, stats.memory]);

    const handleExplainCrash = async () => {
        try {
            const data = await API.getCrashReport(serverId);
            setCrashReport(data);
            setShowCrashModal(true);
        } catch (e) {
            addToast('error', 'Failed to analyze crash', 'Could not fetch crash report.');
        }
    };
    
    const handleCopyIp = () => {
        navigator.clipboard.writeText(`localhost:${server?.port}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const [showConfirm, setShowConfirm] = useState<{ action: 'stop' | 'restart', isOpen: boolean }>({ action: 'stop', isOpen: false });

    const handlePower = async (action: 'start' | 'restart' | 'stop') => {
        if (action === 'start') {
            try {
                await API.startServer(serverId);
                setDiagnosisResult(null); // Clear any old errors on success
            } catch (e: any) {
                // UNIFIED ERROR REPORTING
                // Instead of a separate safety error modal, we run diagnosis
                // which now includes pre-flight safety rules.
                await runDiagnosis();
                addToast('error', 'Boot Failed', e.message);
            }
        } else {
            // Safety Check for Stop/Restart
            if (stats.players > 0) {
                setShowConfirm({ action, isOpen: true });
                return;
            }
            executePowerAction(action);
        }
    };

    const executePowerAction = async (action: 'stop' | 'restart') => {
        if (action === 'stop') {
            await API.stopServer(serverId);
        } else if (action === 'restart') {
             await API.stopServer(serverId);
            setTimeout(() => API.startServer(serverId), 2000);
        }
        setShowConfirm({ action: 'stop', isOpen: false });
    };

    const handleForceStart = async () => {
        try {
            await API.startServer(serverId, true); // Force = true
            setDiagnosisResult(null);
        } catch (e: any) {
            addToast('error', 'Force Start Failed', e.message);
        }
    };

    const handleAcceptEula = async () => {
        try {
             await API.saveFileContent(serverId, 'eula.txt', 'eula=true');
             addToast('success', 'EULA Accepted', 'You can now start the server.');
             setDiagnosisResult(null); 
        } catch (e: any) {
             addToast('error', 'Failed to accept EULA', e.message);
        }
    };

    const formatUptime = (seconds: number) => {
        const isProcessActive = status === ServerStatus.ONLINE || status === ServerStatus.STARTING;
        if (!isProcessActive) return "--:--:--";
        if (!seconds) return "00:00:00";
        
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    if (!server) return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
            Server not found or data is corrupted.
        </div>
    );

    // Calculations
    const ramMax = server.ram * 1024;
    const tps = stats.tps; 
    
    // Status Color Logic
    const statusColor = status === ServerStatus.ONLINE ? '#10b981' : status === ServerStatus.OFFLINE ? '#ef4444' : status === ServerStatus.CRASHED ? '#f43f5e' : '#f59e0b';
    const statusText = status === ServerStatus.ONLINE ? 'SYSTEM OPERATIONAL' : status === ServerStatus.OFFLINE ? 'SYSTEM OFFLINE' : status === ServerStatus.CRASHED ? 'CRASH DETECTED' : 'INITIALIZING...';

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-[1600px] mx-auto space-y-8 pb-12 relative"
        >
             {/* Update Banner */}
             <AnimatePresence>
                {updateInfo && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="bg-primary/10 border border-primary/20 rounded-lg overflow-hidden"
                    >
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/20 text-primary rounded-full animate-bounce">
                                    <Zap size={20} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-foreground">Update Available: v{updateInfo.latestVersion}</h3>
                                    <p className="text-xs text-muted-foreground">
                                        {updateInfo.title || 'A new version of CraftCommand is available.'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <a 
                                    href="https://github.com/extroos/craftcommand" 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 transition-colors"
                                >
                                    View Update
                                </a>
                                <button 
                                    onClick={handleDismissUpdate}
                                    className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-black/20"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
             </AnimatePresence>

             {/* Crash Report Modal */}
             <AnimatePresence>
                {showCrashModal && crashReport && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 text-left">
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-card border border-rose-500/20 rounded-lg p-0 max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
                        >
                            <div className="p-6 border-b border-border bg-rose-500/5">
                                <div className="flex items-center gap-3 mb-1 text-rose-600">
                                    <AlertTriangle size={24} />
                                    <h3 className="text-xl font-bold">Crash Analysis</h3>
                                </div>
                                <p className="text-sm text-muted-foreground">The server stopped unexpectedly. Analysis results below.</p>
                            </div>
                            
                            <div className="p-6 overflow-y-auto flex-1">
                                <div className="bg-rose-50 border border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/30 rounded-lg p-4 mb-6">
                                    <h4 className="text-xs font-bold text-rose-600 dark:text-rose-400 mb-2 uppercase tracking-wider">Likely Cause</h4>
                                    <p className="text-base font-medium text-foreground">"{crashReport.analysis}"</p>
                                </div>

                                <h4 className="text-xs font-bold text-muted-foreground mb-3 uppercase tracking-wider">Recent Logs</h4>
                                <div className="bg-zinc-950 rounded border border-border p-4 font-mono text-xs text-zinc-300 overflow-x-auto space-y-1">
                                    {crashReport.logs.map((line, i) => (
                                        <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                                    ))}
                                </div>
                            </div>

                            <div className="p-4 border-t border-border flex justify-end">
                                <button 
                                    onClick={() => setShowCrashModal(false)}
                                    className="px-6 py-2 rounded text-sm font-bold bg-zinc-800 hover:bg-zinc-900 transition-colors text-white"
                                >
                                    Close Report
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Safety Modal (Existing) */}
            <AnimatePresence>
                {showConfirm.isOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 text-left">
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-card border border-border rounded-lg p-6 max-w-md w-full shadow-2xl"
                        >
                            <div className="flex items-center gap-3 mb-4 text-amber-600">
                                <AlertTriangle size={28} />
                                <h3 className="text-xl font-bold text-foreground">Active Players Online</h3>
                            </div>
                            <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
                                There are currently <strong className="text-foreground">{stats.players} players</strong> online. 
                                {showConfirm.action === 'stop' ? ' Stopping' : ' Restarting'} the server will disconnect everyone immediately.
                            </p>
                            <div className="flex justify-end gap-3">
                                <button 
                                    onClick={() => setShowConfirm({ ...showConfirm, isOpen: false })}
                                    className="px-4 py-2 rounded text-xs font-bold bg-muted hover:bg-muted/80 transition-colors text-foreground"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={() => executePowerAction(showConfirm.action)}
                                    className="px-4 py-2 rounded text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors shadow-sm"
                                >
                                    Force {showConfirm.action === 'stop' ? 'Stop' : 'Restart'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Safety Error Modal (REMOVED: Unified into DiagnosisCard) */}

            {/* --- HERO: Control Unit --- */}
            <div className="relative bg-card border border-border rounded-xl overflow-hidden shadow-md">
                {/* Top Header Bar */}
                <div className="h-12 bg-muted/30 border-b border-border flex items-center justify-between px-6">
                    <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${status === ServerStatus.ONLINE ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}></div>
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Server Status: <span className="text-foreground">{server.id}</span></span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                         <div className="flex items-center gap-2">
                            <Disc size={12} className={status === ServerStatus.ONLINE ? "animate-spin-slow" : ""} />
                            <span>{server.software}</span>
                         </div>
                         <span className="opacity-30">|</span>
                         <span>v{server.version}</span>
                    </div>
                </div>

                <div className="p-8 grid lg:grid-cols-[1fr_auto] gap-8 items-center">
                    {/* Primary Info */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="px-2.5 py-0.5 bg-muted rounded flex items-center gap-2">
                                <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor }}></div>
                                <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: statusColor }}>{statusText}</span>
                            </div>
                        </div>
                        
                        <div>
                            <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2">
                                {server.name}
                            </h1>
                            
                            <div className="flex flex-wrap items-center gap-4">
                                <button 
                                    onClick={handleCopyIp} 
                                    className="flex items-center gap-2 px-3 py-1 bg-muted/50 hover:bg-muted border border-border rounded transition-colors group/ip"
                                >
                                    <Terminal size={14} className="text-muted-foreground" />
                                    <span className="font-mono text-xs text-foreground">localhost:{server.port}</span>
                                    {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={12} className="text-muted-foreground" />}
                                </button>
                                
                                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                                    <Cpu size={14} />
                                    <span>{server.ram}GB RAM Allocation</span>
                                </div>
                            </div>
                        </div>

                        {hasConflict && (
                             <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="inline-flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded text-rose-500 text-xs font-medium"
                             >
                                <AlertTriangle size={14} />
                                <span>Port Conflict: {server.port} is already in use.</span>
                             </motion.div>
                        )}
                    </div>

                    {/* Power Controls */}
                    <div className="flex flex-col sm:flex-row gap-2">
                        <button 
                            onClick={() => handlePower('start')}
                            disabled={(status !== ServerStatus.OFFLINE && status !== ServerStatus.CRASHED) || isJavaDownloading}
                            className={`px-8 py-3 rounded font-bold text-xs transition-all uppercase tracking-wider border flex items-center justify-center gap-2 ${
                                (status === ServerStatus.OFFLINE || status === ServerStatus.CRASHED) && !isJavaDownloading
                                ? 'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-700 shadow-sm' 
                                : 'bg-muted text-muted-foreground border-border cursor-not-allowed'
                            }`}
                        >
                            <Power size={18} /> Start
                        </button>

                        <button 
                            onClick={() => handlePower('restart')}
                            disabled={status === ServerStatus.OFFLINE || status === ServerStatus.STARTING}
                            className={`px-4 py-3 rounded border transition-colors flex items-center justify-center ${
                                status === ServerStatus.ONLINE 
                                ? 'bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-700' 
                                : 'bg-muted text-muted-foreground border-border cursor-not-allowed'
                            }`}
                            title="Restart Server"
                        >
                            <RotateCcw size={18} />
                        </button>

                        <button 
                            onClick={() => handlePower('stop')}
                            disabled={status === ServerStatus.OFFLINE || status === ServerStatus.STARTING}
                            className={`px-6 py-3 rounded font-bold text-xs transition-colors uppercase tracking-wider border flex items-center justify-center gap-2 ${
                                status === ServerStatus.ONLINE 
                                ? 'bg-rose-600 text-white border-rose-500 hover:bg-rose-700 shadow-sm' 
                                : 'bg-muted text-muted-foreground border-border cursor-not-allowed'
                            }`}
                        >
                            <Ban size={16} /> Stop
                        </button>
                    </div>
                </div>

                {/* Java Progress */}
                <AnimatePresence>
                    {isJavaDownloading && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="px-8 pb-8"
                        >
                            <div className="bg-muted/50 border border-border rounded p-4 flex items-center gap-4">
                                <Cpu size={20} className="text-primary animate-pulse" />
                                <div className="flex-1">
                                    <div className="flex justify-between items-end mb-1.5">
                                        <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">
                                            Downloading Java Environment ({javaDownloadStatus?.percent}%)
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                        <motion.div 
                                            className="h-full bg-primary"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${javaDownloadStatus?.percent}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* --- SMART ANALYSIS HINTS (Legacy) --- */}
            <DiagnosisCard 
                result={diagnosisResult} 
                serverId={serverId} 
                onFix={runDiagnosis} // Re-run after fix
                onDismiss={() => {
                    if (diagnosisResult?.ruleId) {
                        const ignored = JSON.parse(localStorage.getItem(`ignored_diagnoses_${serverId}`) || '[]');
                        if (!ignored.includes(diagnosisResult.ruleId)) {
                             ignored.push(diagnosisResult.ruleId);
                             localStorage.setItem(`ignored_diagnoses_${serverId}`, JSON.stringify(ignored));
                        }
                    }
                    setDiagnosisResult(null);
                }}
            />

            {/* --- SMART ANALYSIS HINTS --- */}
            <AnimatePresence>
                {analysis && analysis.issues.length > 0 && isOnline && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0, scale: 0.95 }}
                        animate={{ opacity: 1, height: 'auto', scale: 1 }}
                        exit={{ opacity: 0, height: 0, scale: 0.95 }}
                        className={`border rounded-lg p-4 shadow-sm overflow-hidden ${
                            analysis.status === 'CRITICAL' 
                            ? 'bg-rose-500/5 border-rose-500/20' 
                            : 'bg-amber-500/5 border-amber-500/20'
                        }`}
                    >
                        <div className="flex items-start gap-4">
                            <div className={`p-2 rounded-lg shrink-0 ${
                                analysis.status === 'CRITICAL' ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-500'
                            }`}>
                                <AlertTriangle size={24} />
                            </div>
                            <div className="flex-1">
                                <h3 className={`font-semibold text-sm mb-1 ${
                                    analysis.status === 'CRITICAL' ? 'text-rose-400' : 'text-amber-400'
                                }`}>
                                    Smart Analysis {analysis.status === 'CRITICAL' ? 'Critical' : 'Warning'}
                                </h3>
                                <div className="space-y-1.5">
                                    {analysis.issues.map((issue, idx) => (
                                        <div key={idx} className="flex items-center gap-2 text-xs font-medium text-muted-foreground/90">
                                            <span className={`w-1.5 h-1.5 rounded-full ${
                                                analysis.status === 'CRITICAL' ? 'bg-rose-500' : 'bg-amber-500'
                                            }`} /> 
                                            {issue}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground bg-background/50 px-2 py-1 rounded">
                                SYSTEM_HEURISTICS
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- CORE METRICS GRID --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 auto-rows-min">
                
                {/* Uptime Module */}
                <div className="bg-card border border-border rounded-lg p-6 flex flex-col justify-between h-[150px] shadow-sm">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock size={16} />
                            <span className="text-xs font-bold uppercase tracking-wider">Uptime</span>
                        </div>
                        {isOnline && (
                             <div className="flex items-center gap-2">
                                <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider">Online</span>
                                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                             </div>
                        )}
                    </div>
                    <div className="mt-4">
                        <div className="text-4xl font-bold text-foreground tracking-tight tabular-nums">{formatUptime(displayUptime)}</div>
                        <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest font-medium">Session Duration</p>
                    </div>
                </div>

                {/* TPS Module */}
                <div className="bg-card border border-border rounded-lg p-6 flex flex-col justify-between h-[150px] shadow-sm">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Zap size={16} />
                            <span className="text-xs font-bold uppercase tracking-wider">Tick Rate</span>
                        </div>
                        <div className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded ${Number(tps) > 18 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {Number(tps) > 18 ? 'OPTIMAL' : 'LOW'}
                        </div>
                    </div>
                    <div className="flex items-center justify-between mt-4">
                        <div className="text-4xl font-bold text-foreground tracking-tight flex items-baseline gap-1 tabular-nums">
                            {tps} <span className="text-sm text-muted-foreground font-medium">TPS</span>
                        </div>
                    </div>
                    <div className="w-full h-1 bg-muted rounded-full overflow-hidden mt-auto">
                        <motion.div 
                            className={`h-full ${Number(tps) > 18 ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                            animate={{ width: `${(Number(tps)/20)*100}%` }}
                            transition={user?.preferences?.reducedMotion ? { duration: 0 } : { duration: 0.7 }}
                        />
                    </div>
                </div>

                {/* Player Module */}
                <div className="bg-card border border-border rounded-lg p-6 flex flex-col justify-between h-[150px] shadow-sm">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Users size={16} />
                            <span className="text-xs font-bold uppercase tracking-wider">Players</span>
                        </div>
                    </div>
                    <div className="mt-auto">
                        <div className="text-4xl font-bold text-foreground tracking-tight flex items-center gap-2 tabular-nums">
                            {stats.players} <span className="text-lg text-muted-foreground font-medium">/ {server.maxPlayers}</span>
                        </div>
                        <div className="flex -space-x-1.5 mt-3">
                            {stats.playerList.length > 0 ? (
                                <>
                                    {stats.playerList.slice(0, 6).map((name, i) => (
                                        <div key={name} className="relative group/head" style={{ zIndex: 10 - i }}>
                                            <img 
                                                src={`https://mc-heads.net/avatar/${name}/64`} 
                                                className="w-7 h-7 rounded border border-card bg-muted shadow-sm"
                                                alt={name} 
                                            />
                                        </div>
                                    ))}
                                    {stats.players > 6 && (
                                        <div className="w-7 h-7 rounded border border-card bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                                            +{stats.players - 6}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">No players online</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Network Module */}
                <div className="bg-card border border-border rounded-lg p-6 flex flex-col justify-between h-[150px] shadow-sm">
                     <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Activity size={16} />
                            <span className="text-xs font-bold uppercase tracking-wider">Latency</span>
                        </div>
                    </div>
                    <div className="flex items-end justify-between mt-auto">
                         <div>
                            <div className="text-4xl font-bold text-foreground tracking-tight tabular-nums">
                                {stats.latency} <span className="text-sm text-muted-foreground font-medium">ms</span>
                            </div>
                         </div>
                         <div className="flex items-end gap-1 h-8">
                            {[0.4, 0.7, 0.5, 0.9, 0.6, 0.8].map((h, i) => (
                                <div 
                                    key={i} 
                                    className="w-1 bg-primary/30 rounded-full"
                                    style={{ height: `${h * 100}%` }}
                                />
                            ))}
                         </div>
                    </div>
                </div>


                {/* --- COMPACT GRAPHS --- */}
                
                {/* CPU Graph */}
                <div className="md:col-span-2 bg-card border border-border rounded-lg p-6 relative overflow-hidden h-[260px] shadow-sm">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Cpu size={18} className="text-primary/70" />
                                <h3 className="text-sm font-bold text-foreground">Process CPU</h3>
                            </div>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Instance Load</p>
                        </div>
                        <div className="text-right">
                            <div className="text-3xl font-bold text-foreground tracking-tight">{stats.cpu.toFixed(1)}%</div>
                        </div>
                    </div>
                    
                    <div className="absolute inset-x-0 bottom-0 h-[160px] w-full px-6">
                        {isOnline ? (
                            <Sparkline id="cpu" data={cpuHistory} color="hsl(var(--primary))" height={160} label="Real-time Telemetry" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted/30">
                                <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Process Inactive</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Memory Graph */}
                <div className="md:col-span-2 bg-card border border-border rounded-lg p-6 relative overflow-hidden h-[260px] shadow-sm">
                     <div className="flex justify-between items-start mb-6">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Disc size={18} className="text-primary/70" />
                                <h3 className="text-sm font-bold text-foreground">Memory Usage</h3>
                            </div>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">RAM Allocation</p>
                        </div>
                        <div className="text-right">
                            <div className="text-3xl font-bold text-foreground tracking-tight">{(stats.memory / 1024).toFixed(2)} GB</div>
                        </div>
                    </div>
                    
                    <div className="absolute inset-x-0 bottom-0 h-[160px] w-full px-6">
                        {isOnline ? (
                             <Sparkline id="mem" data={memHistory} color="hsl(var(--primary))" height={160} max={ramMax} label="Heap Trend" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted/30">
                                <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">No Memory Allocation</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Terminal Preview */}
                <div className="col-span-1 md:col-span-2 lg:col-span-4 bg-zinc-950 border border-border rounded-lg p-4 font-mono text-xs flex items-center gap-3 text-zinc-400 shadow-inner">
                    <Terminal size={14} className="text-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
                    <span className="text-emerald-500 font-bold">root@server:~$</span>
                    <span className="truncate text-zinc-300">
                        {isOnline ? (logs[serverId]?.[logs[serverId].length - 1] || 'Process initialized. Waiting for output...') : `Service instance is currently inactive.`}
                    </span>
                    <div className="ml-auto flex gap-1.5 opacity-50">
                         <div className="w-1.5 h-1.5 rounded-full bg-zinc-700"></div>
                         <div className="w-1.5 h-1.5 rounded-full bg-zinc-700"></div>
                         <div className="w-1.5 h-1.5 rounded-full bg-zinc-700"></div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default Dashboard;
