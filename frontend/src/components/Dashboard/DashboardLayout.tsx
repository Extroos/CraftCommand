
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

    const width = 100;
    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - (Math.min(val, max) / max) * height;
        return `${x},${y}`;
    });

    const pathData = `M ${points.join(' L ')}`;
    const fillData = `${pathData} L ${width},${height} L 0,${height} Z`;

    return (
        <div className="relative w-full h-full group">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible preserve-3d" preserveAspectRatio="none">
                <defs>
                    <linearGradient id={`gradient-${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>

                {/* Grid Lines */}
                <line x1="0" y1={height} x2={width} y2={height} stroke="currentColor" strokeOpacity="0.2" vectorEffect="non-scaling-stroke" />
                <line x1="0" y1={0} x2={width} y2={0} stroke="currentColor" strokeOpacity="0.05" vectorEffect="non-scaling-stroke" />
                
                {/* Area Fill */}
                <path d={fillData} fill={`url(#gradient-${id})`} vectorEffect="non-scaling-stroke" />
                
                {/* The Glow */}
                <path 
                    d={pathData} 
                    fill="none" 
                    stroke={color} 
                    strokeWidth="3" 
                    vectorEffect="non-scaling-stroke" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                    className="opacity-20 blur-[2px]"
                />

                {/* The Line */}
                <path 
                    d={pathData} 
                    fill="none" 
                    stroke={color} 
                    strokeWidth="2" 
                    vectorEffect="non-scaling-stroke" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                />
            </svg>
            {label && (
                <div className="absolute top-4 left-4 text-[10px] font-mono text-muted-foreground uppercase tracking-[.3em] bg-black/40 px-3 py-1 rounded-full backdrop-blur-xl border border-[rgb(var(--color-border-subtle))]">
                    {label}
                </div>
            )}
        </div>
    );
};

import { useServers } from '../../context/ServerContext';
import { useUser } from '../../context/UserContext';

const Dashboard: React.FC<DashboardProps> = ({ serverId }) => {
    const { servers, stats: allStats, logs } = useServers();
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
    const [dismissedVersion, setDismissedVersion] = useState(() => localStorage.getItem('craft_commands_dismissed_update'));

    // Diagnosis State
    const [diagnosisResult, setDiagnosisResult] = useState<any>(null);

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

    const handleDismissUpdate = () => {
        if (!updateInfo) return;
        localStorage.setItem('craft_commands_dismissed_update', updateInfo.latestVersion);
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

    const [safetyError, setSafetyError] = useState<{ message: string, code: string, details?: any } | null>(null);
    const [showConfirm, setShowConfirm] = useState<{ action: 'stop' | 'restart', isOpen: boolean }>({ action: 'stop', isOpen: false });

    const handlePower = async (action: 'start' | 'restart' | 'stop') => {
        if (action === 'start') {
            try {
                await API.startServer(serverId);
            } catch (e: any) {
                if (e.safetyError) {
                    setSafetyError({ message: e.message, code: e.code, details: e.details });
                } else {
                    addToast('error', 'Start Failed', e.message);
                }
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
            setSafetyError(null);
        } catch (e: any) {
            addToast('error', 'Force Start Failed', e.message);
        }
    };

    const handleAcceptEula = async () => {
        try {
             await API.saveFileContent(serverId, 'eula.txt', 'eula=true');
             addToast('success', 'EULA Accepted', 'You can now start the server.');
             setSafetyError(null); 
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
                                        {updateInfo.title || 'A new version of Craft Commands is available.'}
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
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 text-left z-[100]">
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-card border border-rose-500/30 rounded-xl p-0 max-w-2xl w-full shadow-2xl relative z-[101] overflow-hidden flex flex-col max-h-[80vh]"
                        >
                            <div className="p-6 border-b border-border bg-rose-500/5">
                                <div className="flex items-center gap-3 mb-1 text-rose-500">
                                    <AlertTriangle size={24} />
                                    <h3 className="text-xl font-bold">Crash Analysis</h3>
                                </div>
                                <p className="text-sm text-muted-foreground">The server stopped unexpectedly. Here is why.</p>
                            </div>
                            
                            <div className="p-6 overflow-y-auto flex-1">
                                <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-4 mb-6">
                                    <h4 className="text-sm font-bold text-rose-400 mb-2 uppercase tracking-wider">Likely Cause</h4>
                                    <p className="text-lg font-medium text-rose-200">"{crashReport.analysis}"</p>
                                </div>

                                <h4 className="text-xs font-bold text-muted-foreground mb-3 uppercase tracking-wider">Recent Logs</h4>
                                <div className="bg-black/50 rounded-lg p-4 font-mono text-xs text-[rgb(var(--color-fg-muted))] overflow-x-auto border border-[rgb(var(--color-border-subtle))] space-y-1">
                                    {crashReport.logs.map((line, i) => (
                                        <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                                    ))}
                                </div>
                            </div>

                            <div className="p-4 border-t border-border bg-card/50 flex justify-end">
                                <button 
                                    onClick={() => setShowCrashModal(false)}
                                    className="px-6 py-2 rounded text-sm font-medium bg-zinc-800 hover:bg-zinc-700 transition-colors text-white"
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
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-left z-[100]">
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-2xl relative z-[101]"
                        >
                            <div className="flex items-center gap-3 mb-4 text-amber-500">
                                <AlertTriangle size={28} />
                                <h3 className="text-xl font-bold text-foreground">Active Players Detected</h3>
                            </div>
                            <p className="text-muted-foreground mb-6 text-sm">
                                There are currently <strong className="text-white">{stats.players} players</strong> online. 
                                <br/>
                                {showConfirm.action === 'stop' ? 'Stopping' : 'Restarting'} the server will disconnect them immediately.
                            </p>
                            <div className="flex justify-end gap-3">
                                <button 
                                    onClick={() => setShowConfirm({ ...showConfirm, isOpen: false })}
                                    className="px-4 py-2 rounded text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors text-foreground"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={() => executePowerAction(showConfirm.action)}
                                    className="px-4 py-2 rounded text-xs font-medium bg-rose-500 hover:bg-rose-600 text-white transition-colors"
                                >
                                    Force {showConfirm.action === 'stop' ? 'Stop' : 'Restart'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Safety Error Modal */}
            <AnimatePresence>
                {safetyError && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 text-left z-[100]">
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-card border border-amber-500/30 rounded-xl p-6 max-w-md w-full shadow-2xl relative z-[101]"
                        >
                            <div className="flex items-center gap-3 mb-4 text-amber-500">
                                <AlertTriangle size={28} />
                                <h3 className="text-xl font-bold text-foreground">Startup Blocked</h3>
                            </div>
                            
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-4">
                                <p className="text-amber-200 font-medium">{safetyError.message}</p>
                                {safetyError.code === 'EULA_NOT_ACCEPTED' && (
                                    <p className="text-xs text-amber-500/80 mt-2">
                                        You must accept the Minecraft EULA to run this server.
                                    </p>
                                )}
                            </div>

                            <div className="flex justify-end gap-3">
                                <button 
                                    onClick={() => setSafetyError(null)}
                                    className="px-4 py-2 rounded text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors text-foreground"
                                >
                                    Cancel
                                </button>
                                
                                {safetyError.code === 'EULA_NOT_ACCEPTED' ? (
                                     <button 
                                        onClick={handleAcceptEula}
                                        className="px-4 py-2 rounded text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                                    >
                                        Accept EULA
                                    </button>
                                ) : (
                                    <button 
                                        onClick={handleForceStart}
                                        className="px-4 py-2 rounded text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white transition-colors"
                                    >
                                        Force Start
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* --- HERO: Control Unit --- */}
            <div className="relative bg-card rounded-lg border border-border overflow-hidden group">
                {/* Top Technical Bar */}
                <div className="h-8 bg-muted/30 border-b border-border flex items-center justify-between px-4">
                    <div className="flex items-center gap-2">
                        <div className="flex gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-border"></div>
                            <div className="w-2 h-2 rounded-full bg-border/50"></div>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">UNIT_ID: {server.id}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
                         {analysis?.environment?.loader ? (
                            <span className="text-blue-400">DETECTED: {analysis.environment.loader.toUpperCase()}</span>
                         ) : (
                             <span>{server.software.toUpperCase()}</span>
                         )}
                         <span className="text-border">|</span>
                         <span>V{server.version}</span>
                    </div>
                </div>

                <div className="p-6 md:p-8 grid md:grid-cols-[1fr_auto] gap-8 items-center">
                    {/* Status & Info */}
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="relative flex h-3 w-3">
                                {status === ServerStatus.ONLINE && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>}
                                <span className="relative inline-flex rounded-full h-3 w-3" style={{ backgroundColor: statusColor }}></span>
                            </div>
                            <span className="font-mono text-xs font-bold tracking-widest" style={{ color: statusColor }}>{statusText}</span>
                        </div>
                        
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-2">{server.name}</h1>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <button onClick={handleCopyIp} className="flex items-center gap-2 hover:text-foreground transition-colors group/ip">
                                <span className="font-mono bg-muted px-2 py-1 rounded border border-[rgb(var(--color-border-subtle))] group-hover/ip:border-[rgb(var(--color-border-strong))] transition-all">localhost:{server.port}</span>
                                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                            </button>
                            <span className="text-border">|</span>
                            <span className="font-mono">{server.ram}GB ALLOCATED</span>
                        </div>

                        {hasConflict && (
                             <div className="mt-4 flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-lg text-amber-500 text-xs font-mono animate-pulse">
                                <Zap size={14} />
                                <span>PORT_COLLISION_DETECTED :: Multiple instances competing for port {server.port}. Reliability degraded.</span>
                             </div>
                        )}
                    </div>

                    {/* Power Controls - Mechanical Style */}
                    <div className="flex gap-1 bg-card p-1.5 rounded-lg border border-border">
                        <button 
                            onClick={() => handlePower('start')}
                            disabled={status !== ServerStatus.OFFLINE && status !== ServerStatus.CRASHED}
                            className={`px-6 py-3 rounded md:w-32 font-medium text-sm transition-all border border-transparent ${
                                status === ServerStatus.OFFLINE || status === ServerStatus.CRASHED
                                ? 'bg-[#1c1c1f] text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
                                : 'text-muted-foreground opacity-30 cursor-not-allowed'
                            }`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <Power size={16} /> INIT
                            </span>
                        </button>
                        <button 
                            onClick={() => handlePower('restart')}
                            disabled={status === ServerStatus.OFFLINE || status === ServerStatus.STARTING}
                            className={`px-6 py-3 rounded md:w-32 font-medium text-sm transition-all border border-transparent ${
                                status === ServerStatus.ONLINE 
                                ? 'bg-[#1c1c1f] text-blue-400 border-blue-400/20 hover:bg-blue-400/10' 
                                : 'text-muted-foreground opacity-30 cursor-not-allowed'
                            }`}
                        >
                             <span className="flex items-center justify-center gap-2">
                                <RotateCcw size={16} /> CYCLE
                            </span>
                        </button>
                        <button 
                            onClick={() => handlePower('stop')}
                            disabled={status === ServerStatus.OFFLINE || status === ServerStatus.STARTING}
                            title={status === ServerStatus.STARTING ? "Startup Lock Active (Wait for Online)" : "Stop Server"}
                            className={`px-4 py-3 rounded transition-all border border-transparent ${
                                status === ServerStatus.ONLINE 
                                ? 'bg-[#1c1c1f] text-rose-500 border-rose-500/20 hover:bg-rose-500/10' 
                                : 'text-muted-foreground opacity-30 cursor-not-allowed'
                            }`}
                        >
                            <Ban size={16} />
                        </button>
                    </div>
                </div>

                {/* Aesthetic Decoration */}
                <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-gradient-to-br from-white/5 to-transparent blur-[100px] pointer-events-none" />
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

            {/* --- GRID LAYOUT --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-min">
                
                {/* Uptime Module */}
                <div className="bg-card border border-border rounded-lg p-5 flex flex-col justify-between h-[140px] relative overflow-hidden">
                    <div className="flex justify-between items-start z-10">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock size={16} />
                            <span className="text-xs font-medium uppercase tracking-wider">Session</span>
                        </div>
                        {isOnline && <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#10b981]"></div>}
                    </div>
                    <div className="z-10">
                        <div className="text-3xl font-mono font-bold text-foreground tracking-tight">{formatUptime(displayUptime)}</div>
                        <div className="text-[10px] text-muted-foreground font-mono mt-1">H : M : S</div>
                    </div>
                    {/* Background Grid */}
                    <div className="absolute inset-0 bg-grid-pattern bg-[length:20px_20px] opacity-[0.03]" />
                </div>

                {/* TPS Module */}
                <div className="bg-card border border-border rounded-lg p-5 flex flex-col justify-between h-[140px] relative overflow-hidden">
                    <div className="flex justify-between items-start z-10">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Zap size={16} />
                            <span className="text-xs font-medium uppercase tracking-wider">Tick Rate</span>
                        </div>
                    </div>
                    <div className="z-10 flex items-end justify-between">
                        <div>
                            <div className="text-3xl font-mono font-bold text-foreground tracking-tight">{tps}</div>
                            <div className="text-[10px] text-muted-foreground font-mono mt-1">TICKS / SEC</div>
                        </div>
                        <div className={`text-xs font-bold px-2 py-1 rounded border ${Number(tps) > 18 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                            {Number(tps) > 18 ? 'STABLE' : 'DEGRADED'}
                        </div>
                    </div>
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-secondary">
                        <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(Number(tps)/20)*100}%` }}></div>
                    </div>
                </div>

                {/* Player Module */}
                <div className="bg-card border border-border rounded-lg p-5 flex flex-col justify-between h-[140px] relative overflow-hidden">
                    <div className="flex justify-between items-start z-10">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Users size={16} />
                            <span className="text-xs font-medium uppercase tracking-wider">Activity</span>
                        </div>
                    </div>
                    <div className="z-10">
                        <div className="text-3xl font-mono font-bold text-foreground tracking-tight flex items-baseline gap-2">
                            {stats.players} <span className="text-sm text-muted-foreground font-normal">/ {stats.isRealOnline ? server.maxPlayers : server.maxPlayers}</span>
                        </div>
                        <div className="flex -space-x-1.5 mt-3 pl-1">
                            {stats.playerList.length > 0 ? (
                                <>
                                    {stats.playerList.slice(0, 4).map((name, i) => (
                                        <div key={name} className="relative group/head" style={{ zIndex: 10 - i }}>
                                            <img 
                                                src={`https://mc-heads.net/avatar/${name}/64`} 
                                                className="w-7 h-7 rounded-md border-2 border-background bg-[#191919] ring-1 ring-white/5 shadow-lg group-hover/head:-translate-y-0.5 transition-transform" 
                                                alt={name} 
                                                title={name}
                                            />
                                        </div>
                                    ))}
                                    {stats.players > 4 && (
                                        <div className="w-7 h-7 rounded-md border-2 border-background bg-zinc-800 flex items-center justify-center text-[9px] font-bold text-muted-foreground z-0 ring-1 ring-white/5">
                                            +{stats.players - 4}
                                        </div>
                                    )}
                                </>
                            ) : stats.players > 0 ? (
                                <div className="w-7 h-7 rounded-md border-2 border-background bg-zinc-800/50 flex items-center justify-center text-[9px] font-bold text-muted-foreground animate-pulse">
                                    {stats.players}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>

                {/* Network Module */}
                <div className="bg-card border border-border rounded-lg p-5 flex flex-col justify-between h-[140px] relative overflow-hidden">
                     <div className="flex justify-between items-start z-10">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Network size={16} />
                            <span className="text-xs font-medium uppercase tracking-wider">Latency</span>
                        </div>
                    </div>
                    <div className="z-10 flex items-end justify-between">
                         <div className="text-3xl font-mono font-bold text-foreground tracking-tight">
                            {stats.latency} <span className="text-sm font-sans text-muted-foreground font-normal">ms</span>
                         </div>
                         <Activity size={32} className="text-border" />
                    </div>
                    {/* Simulated Graph Lines */}
                    <div className="absolute bottom-0 right-0 w-1/2 h-1/2 flex items-end justify-end gap-1 opacity-20 p-2">
                        {[20, 40, 30, 70, 40, 60, 50].map((h, i) => (
                            <div key={i} style={{ height: `${h}%` }} className="w-1 bg-foreground rounded-t-sm"></div>
                        ))}
                    </div>
                </div>


                {/* --- COMPACT GRAPHS --- */}
                
                {/* CPU Graph */}
                <div className="md:col-span-2 bg-card border border-border rounded-lg p-6 relative overflow-hidden h-[280px] group/graph shadow-sm">
                    <div className="flex justify-between items-start mb-6 z-10 relative">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Cpu size={18} className="text-indigo-400" />
                                <h3 className="text-sm font-bold text-foreground">Process CPU</h3>
                            </div>
                            <p className="text-[10px] text-muted-foreground font-mono tracking-widest">PID_{stats.pid || 'SCANNING'}</p>
                        </div>
                        <div className="text-right">
                            <div className="text-3xl font-mono font-bold text-foreground tracking-tight">{stats.cpu.toFixed(1)}%</div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">CPU Load</div>
                        </div>
                    </div>
                    
                    <div className="absolute inset-x-0 bottom-0 h-[180px] w-full px-4">
                        {isOnline ? (
                            <Sparkline id="cpu" data={cpuHistory} color="#818cf8" height={180} label="60S TELEMETRY" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-black/10 backdrop-blur-[2px]">
                                <div className="text-[10px] text-[rgb(var(--color-fg-muted))] font-mono animate-pulse">NO_ACTIVE_PROCESS</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Memory Graph */}
                <div className="md:col-span-2 bg-card border border-border rounded-lg p-6 relative overflow-hidden h-[280px] group/graph shadow-sm">
                     <div className="flex justify-between items-start mb-6 z-10 relative">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Disc size={18} className="text-pink-400" />
                                <h3 className="text-sm font-bold text-foreground">Java RAM</h3>
                            </div>
                            <p className="text-[10px] text-muted-foreground font-mono tracking-widest">PID_{stats.pid || 'SCANNING'}</p>
                        </div>
                        <div className="text-right">
                            <div className="text-3xl font-mono font-bold text-foreground">{(stats.memory / 1024).toFixed(2)} GB</div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Limit: {server.ram}GB</div>
                        </div>
                    </div>
                    
                    <div className="absolute inset-x-0 bottom-0 h-[180px] w-full px-4">
                        {isOnline ? (
                             <Sparkline id="mem" data={memHistory} color="#f472b6" height={180} max={ramMax} label="HEAP TREND" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-black/10 backdrop-blur-[2px]">
                                <div className="text-[10px] text-[rgb(var(--color-fg-muted))] font-mono animate-pulse">NO_ALLOCATION</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Terminal Preview */}
                <div className="col-span-1 md:col-span-2 lg:col-span-4 bg-background border border-border rounded-lg p-4 font-mono text-xs flex items-center gap-3 text-muted-foreground shadow-inner">
                    <Terminal size={14} className="text-emerald-500" />
                    <span className="text-emerald-500">root@server:~$</span>
                    <span className="truncate opacity-70">
                        {isOnline ? (logs[serverId]?.[logs[serverId].length - 1] || '[INFO] Server process active.') : `Service inactive.`}
                    </span>
                    <div className="ml-auto flex gap-2">
                         <div className="w-2 h-2 rounded-full bg-zinc-800"></div>
                         <div className="w-2 h-2 rounded-full bg-zinc-800"></div>
                         <div className="w-2 h-2 rounded-full bg-zinc-800"></div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default Dashboard;
