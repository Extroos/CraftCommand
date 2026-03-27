import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Power, RotateCcw, Ban, Activity, Cpu, Network, Users, Terminal, AlertTriangle, Zap, Check, Copy, Disc, Globe, Clock, Info, Shield, Layers, Settings, Cloud, Play, Lock, Hash, Signal, Database, RefreshCw, BarChart3, HardDrive, ChevronRight, MoreHorizontal, ChevronUp, ChevronDown, X, Package, MonitorDot, Wifi } from 'lucide-react';
import { ServerStatus, ServerConfig, DiagnosisResult } from '@shared/types';
import { API } from '@core/services/api';
import { DiagnosisCard } from './DiagnosisCard';
import { useToast } from '../ui/Toast';
import { useServers } from '@features/servers/context/ServerContext';
import { useUser } from '@features/auth/context/UserContext';
import { useCollaboration } from '@features/collaboration/context/CollaborationContext';
import { useSystem } from '@features/system/context/SystemContext';
import { usePermissions } from '@features/auth/hooks/usePermissions';
import DashboardPro from './DashboardPro';

interface DashboardProps {
    serverId: string;
}

// High-Stability SVG Sparkline
const Sparkline: React.FC<{ data: number[], color: string, height?: number, max?: number, id: string, fill?: boolean }> = ({ data, color, height = 40, max = 100, fill = false }) => {
    if (data.length < 2) return <div style={{ height }} className="flex items-center justify-center opacity-10 text-[10px] font-bold">INITIALIZING...</div>;

    const width = 200;
    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const safeMax = max > 0 ? max : 1;
        const safeVal = isNaN(val) ? 0 : val;
        const y = height - (Math.min(safeVal, safeMax) / safeMax) * height;
        return `${x},${isNaN(y) ? height : y}`;
    });

    const pathData = `M ${points.join(' L ')}`;
    const areaData = `${pathData} L ${width},${height} L 0,${height} Z`;

    return (
        <div className="relative w-full" style={{ height }}>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                {fill && (
                    <path 
                        d={areaData} 
                        fill={color} 
                        className="opacity-[0.03] transition-opacity duration-1000" 
                    />
                )}
                <path 
                    d={pathData} 
                    fill="none" 
                    stroke={color} 
                    strokeWidth="1.5" 
                    vectorEffect="non-scaling-stroke" 
                    strokeLinecap="square" 
                    className="opacity-40 transition-all duration-500"
                />
            </svg>
        </div>
    );
};

const Dashboard: React.FC<DashboardProps> = ({ serverId }) => {
    const { servers, stats: allStats, logs, players, updateServerStatus, javaDownloadStatus } = useServers();
    const { user } = useUser();
    const { can } = usePermissions();
    const { settings, nodes } = useSystem();
    const isPro = settings?.app?.professionalMode ?? false;
    const server = servers.find(s => s.id === serverId);

    if (isPro) {
        return <DashboardPro serverId={serverId} />;
    }

    // Check if software is Java-based
    const isJavaPlatform = server?.software && !['Bedrock', 'Velocity'].includes(server.software);
    
    const { sendChat } = useCollaboration();
    const stats = allStats[serverId] || { cpu: 0, memory: 0, uptime: 0, latency: 0, players: 0, tps: "0.00", pid: 0 };
    const status = server?.status || ServerStatus.OFFLINE;


    const { addToast } = useToast();
    const [pendingAction, setPendingAction] = useState<'start' | 'stop' | 'restart' | null>(null);
    const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);
    const [safetyError, setSafetyError] = useState<{ message: string, code: string, details?: string } | null>(null);
    const [powerConfirm, setPowerConfirm] = useState<{ action: 'stop' | 'restart', isOpen: boolean }>({ action: 'stop', isOpen: false });
    const [showGraceful, setShowGraceful] = useState(false);
    const [gracefulCountdown, setGracefulCountdown] = useState(30);
    
    // Diagnosis Engine State
    const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);
    const [ignoredInSession, setIgnoredInSession] = useState<string[]>([]);

    // History tracking for sparklines (Pre-fill with current data instead of 0s)
    const [cpuHistory, setCpuHistory] = useState<number[]>([]);
    const [memHistory, setMemHistory] = useState<number[]>([]);
    const [tpsHistory, setTpsHistory] = useState<number[]>([]);

    // Phase 58: Smooth Uptime Interpolation (v1.12.13)
    // Prevents jumping (e.g. 1s -> 6s) by ticking locally while synced to backend
    const [localUptime, setLocalUptime] = useState<number>(0);
    
    useEffect(() => {
        // v1.12.16: Only sync from backend if the server is actually ONLINE
        // Otherwise, the local reset (0) will be overwritten by stale metrics
        if (status === ServerStatus.ONLINE && stats.uptime > 0) {
            setLocalUptime(stats.uptime);
        }
    }, [stats.uptime, status]);

    // Phase 64: Metric Lifecycle Engine (v1.12.16)
    // Permissive metrics: Show data if the server is in a "Live" state
    const isLive = [
        ServerStatus.ONLINE, 
        ServerStatus.STARTING,
        ServerStatus.RESTARTING,
        ServerStatus.STOPPING,
        ServerStatus.UNMANAGED
    ].includes(status as ServerStatus);

    const displayCpu = isLive ? (stats.cpu || 0) : 0;
    const displayMemory = isLive ? (stats.memory || 0) : 0;
    const displayTps = isLive ? (typeof stats.tps === 'number' ? stats.tps : parseFloat(stats.tps as string) || 0) : 0;
    const displayLatency = isLive ? (stats.latency || 0) : 0;

    // Phase 61: UI-Side TPS Latch (v1.12.15)
    // Prevents flickering to 0.00 during transient query timeouts if server is live
    const lastValidTps = useRef<number>(20);
    useEffect(() => {
        if (displayTps > 0) lastValidTps.current = displayTps;
    }, [displayTps]);

    const finalTps = (isLive && displayTps === 0) ? lastValidTps.current : displayTps;

    // Zero-Point History Wipe (v1.12.16)
    // Force history to clear when server stops to provide visual feedback
    useEffect(() => {
        if (!isLive) {
            setCpuHistory(Array(30).fill(0));
            setMemHistory(Array(30).fill(0));
            setTpsHistory(Array(30).fill(0));
        }
    }, [isLive]);

    useEffect(() => {
        // v1.12.16: Use isLive instead of just ONLINE to catch STOPPING/OFFLINE transitions faster
        if (!isLive || status !== ServerStatus.ONLINE) {
            setLocalUptime(0);
            return;
        }
        const ticker = setInterval(() => setLocalUptime(prev => prev + 1), 1000);
        return () => clearInterval(ticker);
    }, [status, isLive]);

    // Use a ref for the latest values to avoid stale closures in the interval
    const latestMetrics = useRef({ cpu: displayCpu, mem: displayMemory, tps: finalTps });
    useEffect(() => {
        latestMetrics.current = { cpu: displayCpu, mem: displayMemory, tps: finalTps };
    }, [displayCpu, displayMemory, finalTps]);

    // Initialize once on mount with the first valid data
    useEffect(() => {
        setCpuHistory(Array(30).fill(displayCpu));
        setMemHistory(Array(30).fill(displayMemory));
        setTpsHistory(Array(30).fill(displayTps));
    }, []);

    // Advance the chart every 2 seconds regardless of if the value changed
    useEffect(() => {
        const interval = setInterval(() => {
            // ONLY advance history if the server is in a live/transitioning state (v1.12.12)
            if (!isLive) return;

            setCpuHistory(prev => {
                const val = latestMetrics.current.cpu || 0;
                if (prev.length === 0) return Array(30).fill(val);
                return [...prev.slice(1), val];
            });
            setMemHistory(prev => {
                const val = latestMetrics.current.mem || 0;
                if (prev.length === 0) return Array(30).fill(val);
                return [...prev.slice(1), val];
            });
            // tpsHistory should still only update when 'isLive' as TPS is only meaningful then
            setTpsHistory(prev => {
                const val = latestMetrics.current.tps || 0;
                if (prev.length === 0) return Array(30).fill(val);
                return [...prev.slice(1), val];
            });
        }, 2000);
        return () => clearInterval(interval);
    }, [isLive]); // Re-subscribe if liveness changes

    const runDiagnosis = async () => {
        try {
            const results = await API.runDiagnosis(serverId);
            const result = Array.isArray(results) && results.length > 0 ? results[0] : null;

            if (result) {
                if (!ignoredInSession.includes(result.ruleId)) {
                    setDiagnosisResult(result);
                }
            } else {
                setDiagnosisResult(null);
            }
        } catch {
            // Silent fail for diagnosis
        }
    };

    // Auto-Diagnosis Trigger (Unified)
    // Now reacts to diagnosis data flowing in from the regular stats poll
    useEffect(() => {
        const polledDiagnosis = (stats as any).diagnosis as DiagnosisResult[] | undefined;
        if (polledDiagnosis && polledDiagnosis.length > 0) {
            // Find the root cause or the first critical issue
            const mainIssue = polledDiagnosis.find(d => d.isRootCause || d.severity === 'CRITICAL');
            
            if (mainIssue && !ignoredInSession.includes(mainIssue.ruleId)) {
                setDiagnosisResult(mainIssue);
                return;
            }
        }

        // Fallback: Clear ONLY if status is online and no issues reported in last poll
        if (status === ServerStatus.ONLINE) {
            setDiagnosisResult(null);
        }
    }, [status, (stats as any).diagnosis, ignoredInSession]);

    const handlePower = async (action: 'start' | 'restart' | 'stop') => {
        setPendingAction(action);
        try {
            if (action === 'start') {
                try {
                    updateServerStatus(serverId, ServerStatus.STARTING);
                    await API.startServer(serverId);
                } catch (e: any) {
                    // If it's already running, don't revert to OFFLINE - the backend is ahead of us!
                    if (e.message?.includes('already running')) {
                        // Server is already running — don't revert, backend is ahead
                        return;
                    }
                    updateServerStatus(serverId, ServerStatus.OFFLINE);
                    // Proactive Search: Always run diagnosis scan if a power action fails
                    // This ensures the DiagnosisCard pops up immediately for EULA/File errors.
                    runDiagnosis();
                    if (e.safetyError) {
                        setSafetyError({ message: e.message, code: e.code, details: e.details });
                    } else {
                        addToast('error', 'Start Failed', e.message);
                    }
                }
            } else if (action === 'stop' && stats.players > 0) {
                setShowGraceful(true);
                return;
            } else {
                if (stats.players > 0) {
                    setPowerConfirm({ action, isOpen: true });
                    return;
                }
                await executePowerAction(action);
            }
        } finally {
            if (!showGraceful && !powerConfirm.isOpen) {
                setPendingAction(null);
            }
        }
    };

    const handleGracefulStop = async () => {
        setPendingAction('stop');
        setShowGraceful(false);
        try {
            updateServerStatus(serverId, ServerStatus.STOPPING);
            await API.gracefulStopServer(serverId, gracefulCountdown);
            addToast('info', 'Graceful Shutdown', `Broadcast sent. Stopping in ${gracefulCountdown}s.`);
        } catch (e: any) {
            updateServerStatus(serverId, status);
            addToast('error', 'Shutdown Failed', e.message);
        } finally {
            setPendingAction(null);
        }
    };

    const executePowerAction = async (action: 'stop' | 'restart') => {
        const previousStatus = status;
        try {
            if (action === 'stop') {
                 updateServerStatus(serverId, ServerStatus.STOPPING);
                 await API.stopServer(serverId);
                 updateServerStatus(serverId, ServerStatus.OFFLINE);
            } else if (action === 'restart') {
                 updateServerStatus(serverId, ServerStatus.STOPPING);
                 await API.stopServer(serverId);
                 
                 // Phase 57: Robust Restart Sequence
                 // Instead of a blind timeout, we wait for OFFLINE or a short timeout before re-start
                 let attempts = 0;
                 const checkAndStart = async () => {
                     // Check status via servers list in context (already pulsing via WebSocket/Polling)
                     const current = servers.find(s => s.id === serverId);
                     if (current?.status === ServerStatus.OFFLINE || attempts > 10) {
                         updateServerStatus(serverId, ServerStatus.STARTING);
                         await API.startServer(serverId);
                     } else {
                         attempts++;
                         setTimeout(checkAndStart, 500);
                     }
                 };
                 checkAndStart();
            }
        } catch (e: any) {
            updateServerStatus(serverId, previousStatus as ServerStatus);
            addToast('error', 'Power Action Failed', e.message);
        } finally {
            setPowerConfirm({ action: 'stop', isOpen: false });
            setPendingAction(null);
        }
    };

    const handleAcceptEula = async () => {
        try {
            await API.saveFileContent(serverId, 'eula.txt', 'eula=true');
            setSafetyError(null);
            addToast('success', 'EULA Accepted', 'You can now start the server.');
        } catch (e: any) {
            addToast('error', 'Failed to accept EULA', e.message);
        }
    };

    const handleCopyIp = () => {
        const ip = (server?.ip && server.ip !== '127.0.0.1' && server.ip !== 'localhost') ? server.ip : window.location.hostname;
        navigator.clipboard.writeText(`${ip}:${server?.port}`);
    };

    const formatUptime = (seconds: number) => {
        // Trust the backend value if it's strictly > 0. 
        // Backend handles the "don't count during STARTING" guard now.
        if (seconds <= 0) return "00:00:00";
        
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    if (!server) return <div className="p-10 text-center opacity-50 font-black tracking-tighter text-4xl">SERVER_NOT_FOUND</div>;

    return (
        <div className="flex-1 p-8 max-w-[1400px] mx-auto space-y-6">
            {/* Java Installation Global Progress */}
            {javaDownloadStatus && isJavaPlatform && (!javaDownloadStatus.serverId || javaDownloadStatus.serverId === serverId) && (
                <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 mb-2 flex flex-col gap-3 shadow-lg shadow-indigo-500/5 animate-in fade-in slide-in-from-top-4"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-500/20 rounded-lg">
                                <RefreshCw size={16} className="text-indigo-400 animate-spin" />
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Environment Setup Required</h3>
                                <p className="text-[11px] text-indigo-300 opacity-70">{javaDownloadStatus.message}</p>
                            </div>
                        </div>
                        <div className="text-xs font-mono font-bold text-indigo-400">
                            {javaDownloadStatus.percent !== undefined ? `${Math.round(javaDownloadStatus.percent)}%` : 'PENDING'}
                        </div>
                    </div>
                    {javaDownloadStatus.percent !== undefined && (
                        <div className="h-1.5 w-full bg-indigo-500/10 rounded-full overflow-hidden">
                            <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${javaDownloadStatus.percent}%` }}
                                className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                            />
                        </div>
                    )}
                </motion.div>
            )}

            {/* Precision Tactical Hero Section */}
            <div className={`cc-card transition-all duration-700 ${user?.preferences.visualQuality ? 'glass-morphism glass-spotlight quality-entrance' : ''}`}>
                <div className="flex justify-between items-center mb-4 pb-3 border-b border-foreground/[0.04]">
                    <div className="flex items-center gap-3">
                        <div className={`w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.1)] ${
                            status === ServerStatus.ONLINE ? 'bg-emerald-500 shadow-emerald-500/40' :
                            status === ServerStatus.OFFLINE ? 'bg-rose-500 shadow-rose-500/40' :
                            'bg-amber-500 shadow-amber-500/40 animate-pulse'
                        }`} />
                        <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-[0.2em]">
                            SERVER STATUS: <span className="text-foreground/60">
                                {status === ServerStatus.OFFLINE ? 'OFFLINE' : `LOCAL-${server.id.split('-')[0].toUpperCase()}`}
                            </span>
                        </span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-bold text-foreground/20 uppercase tracking-widest">
                        <div className="flex items-center gap-2">
                            <Disc size={12} className="opacity-40" />
                            <span>{server.software}</span>
                        </div>
                        <div className="w-px h-3 bg-foreground/10" />
                        <span>{server.version}</span>
                    </div>
                </div>

                <div className="flex justify-between items-center">
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border transition-all duration-500 ${
                                status === ServerStatus.ONLINE ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                status === ServerStatus.OFFLINE ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                                'bg-amber-500/10 border-amber-500/20 text-amber-400'
                            } ${user?.preferences.visualQuality ? 'glass-morphism' : ''}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${
                                    status === ServerStatus.ONLINE ? 'bg-emerald-500' :
                                    status === ServerStatus.OFFLINE ? 'bg-rose-500' :
                                    'bg-amber-500'
                                }`} />
                                <span className="text-[9px] font-bold uppercase tracking-wider">
                                    {status === ServerStatus.ONLINE ? 'System Operational' : 
                                     status === ServerStatus.OFFLINE ? 'System Offline' :
                                     status.replace('_', ' ')}
                                </span>
                            </div>

                            {server.modpackTitle && (
                                <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border transition-all duration-500 bg-primary/5 border-primary/20 text-primary ${user?.preferences.visualQuality ? 'glass-morphism' : ''}`}>
                                    <Package size={11} />
                                    <span className="text-[9px] font-bold uppercase tracking-wider pt-0.5">
                                        {server.modpackType === 'mod' ? 'Integrated Mod' : 'Active Modpack'}
                                    </span>
                                </div>
                            )}
                        </div>
                        
                        <h1 className={`text-4xl sm:text-6xl font-bold tracking-tighter leading-[1.15] pb-2 lowercase ${user?.preferences.visualQuality ? 'bg-gradient-to-br from-foreground via-foreground to-foreground/40 bg-clip-text text-transparent tracking-[-0.08em]' : 'text-foreground'}`}>
                            {server.name.toLowerCase()}
                        </h1>

                        <div className="flex items-center gap-6 pt-2 flex-wrap">
                            {server.modpackTitle && (
                                <div className="flex items-center gap-3 pr-4 border-r border-foreground/10">
                                    {server.modpackIcon && (
                                        <img src={server.modpackIcon} className="w-6 h-6 rounded-md shadow-sm border border-foreground/10 object-cover" alt={server.modpackTitle} />
                                    )}
                                    <div className="space-y-0.5 mt-0.5">
                                        <div className="text-[12px] font-bold text-foreground/90 leading-none">{server.modpackTitle}</div>
                                        <div className="text-[9px] font-bold text-foreground/40 uppercase tracking-widest leading-none">
                                            By {server.modpackAuthor}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <button onClick={handleCopyIp} className="flex items-center gap-2.5 text-foreground/40 hover:text-foreground/70 transition-colors group">
                                <span className="text-[14px] font-mono tracking-tight flex items-center gap-2">
                                    <span className="opacity-40">&gt;</span>
                                    {(server.ip && server.ip !== '127.0.0.1' && server.ip !== 'localhost') ? server.ip : 'localhost'}:{server.port}
                                </span>
                                <Copy size={13} className="opacity-20 group-hover:opacity-40" />
                            </button>
                            <div className="flex items-center gap-2.5 text-foreground/40">
                                <Layers size={14} className="opacity-40" />
                                <span className="text-[13px] font-bold tracking-tight">
                                    {server.ram}GB RAM Allocation
                                </span>
                            </div>
                             <div className={`px-2 py-0.5 rounded border text-[9px] font-black tracking-widest uppercase ${user?.preferences.visualQuality ? 'bg-foreground/5 border-foreground/10 text-foreground/60' : 'bg-transparent border-foreground/5 text-foreground/20'}`}>
                                {server.executionEngine === 'docker' ? 'DOCKER' : 'NATIVE'} • {server.software?.toUpperCase() || 'JAVA'}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                        <button 
                            onClick={() => handlePower('start')}
                            disabled={status !== ServerStatus.OFFLINE || !!pendingAction}
                            className="flex-1 sm:flex-none h-[52px] min-w-[140px] px-8 bg-foreground/[0.04] border border-foreground/5 hover:bg-foreground/[0.08] disabled:opacity-20 text-foreground font-bold text-[13px] rounded-md flex items-center justify-center gap-3 transition-all active:scale-[0.98] uppercase tracking-wider"
                        >
                            {(pendingAction === 'start' || status === ServerStatus.STARTING) ? (
                                <>
                                    <RefreshCw size={18} className="animate-spin opacity-40" />
                                    {status === ServerStatus.STARTING ? 'Starting...' : 'Loading...'}
                                </>
                            ) : (
                                <>
                                    <Power size={18} className="opacity-40" />
                                    Start
                                </>
                            )}
                        </button>
                        <button 
                            onClick={() => handlePower('restart')}
                            disabled={status === ServerStatus.OFFLINE || !!pendingAction || status === ServerStatus.STARTING || status === ServerStatus.STOPPING || status === ServerStatus.RESTARTING}
                            className="h-[52px] w-[52px] bg-foreground/[0.04] border border-foreground/5 hover:bg-foreground/[0.08] disabled:opacity-20 text-foreground rounded-md flex items-center justify-center transition-all active:scale-[0.98]"
                        >
                            <RefreshCw size={18} className={pendingAction === 'restart' || status === ServerStatus.RESTARTING ? 'animate-spin' : 'opacity-40'} />
                        </button>
                        <button 
                            onClick={() => handlePower('stop')}
                            disabled={status === ServerStatus.OFFLINE || !!pendingAction || status === ServerStatus.STOPPING || status === ServerStatus.RESTARTING || status === ServerStatus.STARTING}
                            className="flex-1 sm:flex-none h-[52px] px-8 bg-[#ff1744] hover:bg-[#d50032] disabled:opacity-20 text-white font-bold text-[13px] rounded-md flex items-center justify-center gap-3 transition-all active:scale-[0.98] uppercase tracking-wider box-content shadow-lg shadow-rose-500/10"
                        >
                            {(pendingAction === 'stop' || status === ServerStatus.STOPPING) ? <RefreshCw size={18} className="animate-spin" /> : <Ban size={18} />}
                            Stop
                        </button>
                    </div>
                </div>
            </div>

            {/* Tactical Grid Row 1 (Responsive Columns) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'UPTIME', value: formatUptime(localUptime), sub: 'SESSION DURATION', detail: '', icon: <Clock size={16} className="text-foreground/40" />, status: status === ServerStatus.ONLINE ? 'ONLINE' : 'OFFLINE' },
                    { label: 'TICK RATE', value: finalTps.toFixed(2), unit: 'TPS', sub: '', detail: '', icon: <Activity size={16} className="text-foreground/40" />, line: true },
                    { label: 'PLAYERS', value: stats.players, unit: ` / ${server.maxPlayers || '20'}`, sub: '', detail: '', icon: <Users size={16} className="text-foreground/40" />, heads: true },
                    { label: 'LATENCY', value: stats.latency, unit: 'ms', sub: '', detail: '', icon: <Zap size={16} className="text-foreground/40" />, signal: true }
                ].map((m, i) => (
                    <div key={i} className={`cc-card group relative transition-all duration-500 ${user?.preferences.visualQuality ? `glass-morphism quality-entrance ${m.label === 'UPTIME' ? 'glass-spotlight-subtle' : ''}` : ''}`} style={{ animationDelay: `${(i + 1) * 50}ms` }}>
                        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                {m.icon}
                                <span className="text-[11px] font-bold text-foreground/40 uppercase tracking-widest">{m.label}</span>
                            </div>
                            {m.status && (
                                <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${
                                    m.status === 'ONLINE' ? 'text-emerald-400' : 'text-rose-400'
                                }`}>
                                    <span className="hidden sm:inline">{m.status}</span> <div className={`w-1.5 h-1.5 rounded-full ${
                                        m.status === 'ONLINE' ? 'bg-emerald-500' : 'bg-rose-500'
                                    }`} />
                                </div>
                            )}
                            {m.label === 'TICK RATE' && (() => {
                                const tps = finalTps; // v1.12.16: Use latched finalTps to prevent badge flickering
                                const isOffline = status !== ServerStatus.ONLINE && status !== ServerStatus.UNMANAGED;
                                return (
                                    <div className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-widest ${
                                        isOffline
                                            ? 'bg-secondary/20 border-border text-foreground/30'
                                            : tps >= 19 
                                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                                                : tps >= 15 
                                                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' 
                                                    : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                    }`}>
                                        {isOffline ? 'OFFLINE' : tps >= 19 ? 'OPTIMAL' : tps >= 15 ? 'DEGRADED' : <span className="text-[7px] sm:text-[9px]">CRITICAL</span>}
                                    </div>
                                );
                            })()}
                        </div>
                        
                        <div className="space-y-0.5 relative">
                            <div className="flex justify-between items-baseline">
                                <div className="text-4xl font-bold text-foreground tracking-tighter flex items-baseline gap-1.5 leading-[0.9]">
                                    {m.value}<span className="text-[14px] opacity-20 uppercase font-bold">{m.unit}</span>
                                </div>
                                {m.signal && (
                                    <div className="flex gap-1.5 items-end h-10 pb-1">
                                        {[1, 2, 3, 4, 5].map((s) => (
                                            <div key={s} className="w-1.5 bg-foreground/20 rounded-sm" style={{ height: `${s * 20}%` }} />
                                        ))}
                                    </div>
                                )}
                            </div>
                            {m.sub && (
                                <div className="text-[10px] font-bold text-foreground/20 uppercase tracking-widest mt-1.5">{m.sub}</div>
                            )}
                            {m.heads && (players[serverId] || []).length > 0 && (
                                <div className="flex -space-x-2 pt-4">
                                    {(players[serverId] || []).slice(0, 6).map((p, idx) => (
                                        <div key={p.uuid} className="relative transition-transform hover:-translate-y-1 hover:z-10" style={{ zIndex: 6 - idx }}>
                                            <img 
                                                src={p.skinUrl || `https://mc-heads.net/avatar/${p.name}/32`} 
                                                className={`w-6 h-6 rounded-[2px] border border-black/50 ring-1 ring-foreground/10 shadow-lg ${user?.preferences.visualQuality ? 'bg-black/40' : ''}`}
                                                alt={p.name}
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src = `https://mc-heads.net/avatar/Steve/32`;
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                            {m.line && (
                                <div className="h-[3px] w-full bg-emerald-500/60 rounded-full mt-6" />
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Tactical Grid Row 2 (Responsive Columns) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className={`cc-card py-14 ${user?.preferences.visualQuality ? 'glass-morphism' : ''}`}>
                    <div className="flex flex-col sm:flex-row justify-between items-start mb-10 gap-6">
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <Cpu size={14} className="text-foreground/40" />
                                <span className="text-[11px] font-bold text-foreground tracking-widest">Process CPU</span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <div className="text-[10px] font-bold text-foreground/20 uppercase tracking-widest">INSTANCE LOAD</div>
                                {user?.preferences.visualQuality && (
                                    <div className="flex items-center gap-2 text-[9px] font-mono font-bold">
                                        <span className="text-foreground/30 uppercase">Peak:</span>
                                        <span className="text-emerald-500/80">{Math.max(...cpuHistory).toFixed(1)}%</span>
                                        <span className="text-foreground/30 uppercase ml-1">Avg:</span>
                                        <span className="text-blue-500/80">{(cpuHistory.reduce((a,b) => a+b, 0) / cpuHistory.length).toFixed(1)}%</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="text-left sm:text-right">
                            <div className="text-4xl font-bold text-foreground tracking-tighter leading-[0.9]">
                                {displayCpu.toFixed(1)}%
                            </div>
                            <div className="text-[9px] font-bold text-foreground/5 uppercase tracking-widest mt-2">REAL-TIME TELEMETRY</div>
                        </div>
                    </div>
                    <div className="h-48 mt-auto flex items-end">
                        <Sparkline id="cpu" data={cpuHistory} color={displayCpu > 80 ? "#f43f5e" : "currentColor"} height={180} fill={user?.preferences.visualQuality} />
                    </div>
                </div>

                <div className={`cc-card py-14 ${user?.preferences.visualQuality ? 'glass-morphism' : ''}`}>
                    <div className="flex flex-col sm:flex-row justify-between items-start mb-10 gap-6">
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <HardDrive size={14} className="text-foreground/40" />
                                <span className="text-[11px] font-bold text-foreground tracking-widest">Memory Usage</span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <div className="text-[10px] font-bold text-foreground/20 uppercase tracking-widest">RAM ALLOCATION</div>
                                {user?.preferences.visualQuality && (
                                    <div className="flex items-center gap-2 text-[9px] font-mono font-bold">
                                        <span className="text-foreground/30 uppercase">Peak:</span>
                                        <span className="text-emerald-500/60">{(Math.max(...memHistory) / 1024).toFixed(2)}G</span>
                                        <span className="text-foreground/30 uppercase ml-1">Avg:</span>
                                        <span className="text-blue-500/60">{(memHistory.reduce((a,b) => a+b, 0) / memHistory.length / 1024).toFixed(2)}G</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="text-left sm:text-right">
                            <div className="text-4xl font-bold text-foreground tracking-tighter leading-[0.9]">
                                {(displayMemory / 1024).toFixed(2)}G
                            </div>
                            <div className="text-[9px] font-bold text-foreground/5 uppercase tracking-widest mt-2">HEAP TREND</div>
                        </div>
                    </div>
                    <div className="h-48 mt-auto flex items-end">
                        <Sparkline id="mem" data={memHistory} color={(displayMemory / 1024) > (server.ram * 0.9) ? "#f43f5e" : "currentColor"} height={180} max={server?.ram ? server.ram * 1024 : 100} fill={user?.preferences.visualQuality} />
                    </div>
                </div>
            </div>

            {/* Stabilized Console Footer (Pure Black - Responsive) */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 px-6 h-auto sm:h-12 overflow-hidden bg-black border border-white/5 rounded-lg shadow-2xl relative group py-3 sm:py-0">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent pointer-events-none opacity-50" />
                <div className="flex items-center gap-3 shrink-0 relative">
                    <Terminal size={12} className="text-emerald-500/80" />
                    <span className="text-[9px] font-mono text-emerald-500/50 uppercase tracking-[0.2em] font-black">SYSTEM_STDOUT</span>
                </div>
                <div className="flex-1 truncate font-mono text-[11px] text-zinc-500 pt-0.5 relative">
                    {status === ServerStatus.ONLINE ? (
                        logs[serverId]?.length > 0 ? (
                            <span className="opacity-80 block truncate">{logs[serverId].slice(-1)[0]}</span>
                        ) : (
                            <span className="opacity-30 animate-pulse italic">Waiting for process stream...</span>
                        )
                    ) : (
                        <span className="opacity-10 uppercase tracking-widest text-[9px]">Process Inactive // Connection Severed</span>
                    )}
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0 relative border-t sm:border-t-0 border-white/5 pt-2 sm:pt-0">
                    <div className="text-[9px] font-mono text-white/20 uppercase tracking-widest hidden xs:block">Live_v1.12.5</div>
                    <div className="flex gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/20" />
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/10" />
                    </div>
                </div>
            </div>


            {/* Status Modals */}
            <AnimatePresence>
                {/* Traditional Confirmation Modal */}
                {powerConfirm.isOpen && (
                    <div className="fixed inset-0 bg-background/80 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-card border border-border rounded-xl shadow-2xl p-8 max-w-md w-full text-center space-y-6">
                            <div className="flex justify-center"><AlertTriangle size={48} className="text-amber-500" /></div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold">Active Protocol Detected</h3>
                                <p className="text-sm text-muted-foreground">Players are currently connected to this instance. Forcing a {powerConfirm.action} may cause data loss or corruption.</p>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={() => setPowerConfirm({ ...powerConfirm, isOpen: false })} className="flex-1 py-3 px-4 bg-secondary/50 rounded-lg text-sm font-bold hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">Cancel</button>
                                <button onClick={() => { executePowerAction(powerConfirm.action); }} className="flex-1 py-3 px-4 bg-rose-500 text-white rounded-lg text-sm font-bold hover:bg-rose-600 transition-all active:scale-95 shadow-lg shadow-rose-500/20">Force {powerConfirm.action === 'stop' ? 'Stop' : 'Restart'}</button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Graceful Shutdown Modal */}
                {showGraceful && (
                    <div className="fixed inset-0 bg-background/80 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col relative z-50">
                            <div className="p-6 border-b border-border/40 flex items-center justify-between bg-muted/20">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg"><Clock size={16} /></div>
                                    <h3 className="text-sm font-bold">Graceful Stop</h3>
                                </div>
                                <button onClick={() => setShowGraceful(false)} className="p-2 hover:bg-rose-500/10 hover:text-rose-500 text-muted-foreground rounded-lg transition-colors"><X size={16} /></button>
                            </div>
                            <div className="p-8 space-y-8">
                                <p className="text-xs font-medium text-muted-foreground leading-relaxed">Broadcast a warning to <span className="text-foreground font-bold">{stats.players} players</span> and wait for safe termination.</p>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">Countdown</label>
                                        <span className="text-sm font-mono font-bold text-primary">{gracefulCountdown}s</span>
                                    </div>
                                    <input type="range" min="10" max="300" step="10" value={gracefulCountdown} onChange={e => setGracefulCountdown(parseInt(e.target.value))} className="w-full accent-primary h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer" />
                                </div>
                            </div>
                            <div className="p-6 bg-muted/5 border-t border-border/40 flex gap-3">
                                <button onClick={() => { executePowerAction('stop'); setShowGraceful(false); }} className="flex-1 py-3 text-[11px] font-bold text-muted-foreground hover:text-rose-500 hover:bg-rose-500/5 rounded-xl transition-all uppercase tracking-wider">Force Stop</button>
                                <button onClick={handleGracefulStop} className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[11px] font-bold uppercase tracking-widest shadow-lg shadow-amber-500/20 active:scale-95 transition-all">Begin Countdown</button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Safety Error Modal */}
                {safetyError && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-card border border-amber-500/30 rounded-xl p-6 max-w-md w-full shadow-2xl">
                            <div className="flex items-center gap-3 mb-4 text-amber-500">
                                <AlertTriangle size={28} />
                                <h3 className="text-xl font-bold text-foreground">Startup Blocked</h3>
                            </div>
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-4">
                                <p className="text-amber-200 font-medium">{safetyError.message}</p>
                            </div>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setSafetyError(null)} className="px-4 py-2 rounded text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors text-foreground">Cancel</button>
                                {safetyError.code === 'EULA_NOT_ACCEPTED' ? (
                                    <button onClick={handleAcceptEula} className="px-4 py-2 rounded text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors">Accept EULA</button>
                                ) : (
                                    <button onClick={() => handlePower('start')} className="px-4 py-2 rounded text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white transition-colors">Force Start</button>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}

                {diagnosisResult && (
                    <DiagnosisCard 
                        result={diagnosisResult} 
                        serverId={serverId} 
                        onFix={() => {
                            setDiagnosisResult(null);
                            setTimeout(runDiagnosis, 3000);
                        }}
                        onDismiss={() => {
                            if (diagnosisResult?.ruleId) {
                                setIgnoredInSession(prev => [...prev, diagnosisResult.ruleId]);
                            }
                            setDiagnosisResult(null);
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default Dashboard;
