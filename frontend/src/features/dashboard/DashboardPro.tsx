import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Power, Ban, Activity, Cpu, Users, AlertTriangle, Disc, Clock, Shield, Layers, RefreshCw, HardDrive, ChevronRight, X, Package, MonitorDot, Database, Globe, Lock, Wifi, Terminal, Zap } from 'lucide-react';
import { ServerStatus, ServerConfig, DiagnosisResult } from '@shared/types';
import { API } from '@core/services/api';
import { DiagnosisCard } from './DiagnosisCard';
import { useToast } from '../ui/Toast';
import { useServers } from '@features/servers/context/ServerContext';
import { useUser } from '@features/auth/context/UserContext';
import { useCollaboration } from '@features/collaboration/context/CollaborationContext';
import { useSystem } from '@features/system/context/SystemContext';
import { usePermissions } from '@features/auth/hooks/usePermissions';

interface DashboardProProps { serverId: string; }




// ═══════════════════════════════════════════════════════════════
// SVG COMPONENT 1: RadialGauge — 180° arc with needle & glow
// ═══════════════════════════════════════════════════════════════
const RadialGauge: React.FC<{
    value: number; max: number; label: string; unit: string;
    color: string; id: string; size?: number; icon?: React.ReactNode;
}> = ({ value, max, label, unit, color, id, size = 180, icon }) => {
    const pct = Math.min(100, Math.max(0, max > 0 ? (value / max) * 100 : 0));
    const pad = 16;
    const sw = 14;
    const totalW = size + pad * 2;
    const r = (size - sw * 2) / 2;
    const circumference = Math.PI * r;
    const offset = circumference - (pct / 100) * circumference;
    const cx = totalW / 2;
    const cy = totalW / 2;
    const viewH = cy + 14;

    const ticks = useMemo(() => {
        const t = [];
        for (let i = 0; i <= 10; i++) {
            const angle = Math.PI + (Math.PI * i / 10);
            const isMajor = i % 5 === 0;
            const innerR = r + sw / 2 + 3;
            const outerR = r + sw / 2 + (isMajor ? 10 : 6);
            t.push(
                <line key={i}
                    x1={cx + innerR * Math.cos(angle)} y1={cy + innerR * Math.sin(angle)}
                    x2={cx + outerR * Math.cos(angle)} y2={cy + outerR * Math.sin(angle)}
                    stroke="currentColor" className="text-foreground/[0.08]"
                    strokeWidth={isMajor ? 2 : 1} strokeLinecap="round"
                />
            );
        }
        return t;
    }, [r, sw, cx, cy]);

    // Needle rotation: 0° = left (0%), 180° = right (100%)
    const needleDeg = (pct / 100) * 180;
    const needleLen = r - 8;

    const lighter = color + '80';

    return (
        <div className="flex flex-col items-center gap-1">
            <svg width={size} height={viewH * (size / totalW)} viewBox={`0 0 ${totalW} ${viewH}`} overflow="visible">
                <defs>
                    <linearGradient id={`rg-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor={lighter} />
                        <stop offset="100%" stopColor={color} />
                    </linearGradient>
                    <filter id={`rg-glow-${id}`} x="-30%" y="-30%" width="160%" height="160%">
                        <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={color} floodOpacity="0.5" />
                    </filter>
                </defs>
                {ticks}
                {/* Background arc */}
                <path d={`M ${pad + sw} ${cy} A ${r} ${r} 0 0 1 ${totalW - pad - sw} ${cy}`}
                    fill="none" stroke="currentColor" className="text-foreground/[0.06]"
                    strokeWidth={sw} strokeLinecap="round" />
                {/* Value arc */}
                <path d={`M ${pad + sw} ${cy} A ${r} ${r} 0 0 1 ${totalW - pad - sw} ${cy}`}
                    fill="none" stroke={`url(#rg-${id})`}
                    strokeWidth={sw} strokeLinecap="round"
                    strokeDasharray={circumference} strokeDashoffset={offset}
                    filter={pct > 0 ? `url(#rg-glow-${id})` : undefined}
                    style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                {/* Needle — uses transform rotate for stable animation */}
                <g style={{ transition: 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)', transformOrigin: `${cx}px ${cy}px`, transform: `rotate(${needleDeg}deg)` }}>
                    <line x1={cx} y1={cy} x2={cx - needleLen} y2={cy}
                        stroke={color} strokeWidth={2.5} strokeLinecap="round" opacity={0.85} />
                </g>
                <circle cx={cx} cy={cy} r={4.5} fill={color} opacity={0.7} />
                <circle cx={cx} cy={cy} r={2} fill="white" opacity={0.5} />
                {/* Value text */}
                <text x={cx} y={cy - 20} textAnchor="middle" className="fill-foreground"
                    style={{ fontWeight: 800, fontSize: size * 0.21, fontFamily: 'ui-monospace, monospace' }}>
                    {typeof value === 'number' ? (value % 1 === 0 ? value : value.toFixed(1)) : value}
                </text>
                <text x={cx} y={cy - 2} textAnchor="middle" className="fill-muted-foreground/40"
                    style={{ fontWeight: 600, fontSize: size * 0.075, letterSpacing: '0.05em' }}>
                    {unit}
                </text>
            </svg>
            <div className="flex items-center gap-1.5 mt-1">
                {icon}
                <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-[0.18em]">{label}</span>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════
// SVG COMPONENT 2: AreaSparkline — gradient fill + peak marker
// ═══════════════════════════════════════════════════════════════
const AreaSparkline: React.FC<{
    data: number[]; color: string; height?: number; max?: number; id: string;
    showGrid?: boolean; showPeak?: boolean;
}> = ({ data, color, height = 160, max: maxProp = 100, id, showGrid = true, showPeak = true }) => {
    if (data.length < 2) return <div style={{ height }} />;

    const width = 400;
    const padY = 8;
    const usableH = height - padY * 2;
    const actualMax = Math.max(maxProp, ...data, 1);
    const peakVal = Math.max(...data);
    const peakIdx = data.lastIndexOf(peakVal);

    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const safeMax = actualMax > 0 ? actualMax : 1;
        const safeVal = isNaN(val) ? 0 : val;
        const y = padY + usableH - (Math.min(safeVal, safeMax) / safeMax) * usableH;
        return { x, y: isNaN(y) ? height : y };
    });

    // Smooth curve using monotone cubic interpolation
    const lineD = useMemo(() => {
        if (points.length < 2) return '';
        let d = `M ${points[0].x},${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            const cp = (points[i].x - points[i - 1].x) * 0.35;
            d += ` C ${points[i - 1].x + cp},${points[i - 1].y} ${points[i].x - cp},${points[i].y} ${points[i].x},${points[i].y}`;
        }
        return d;
    }, [data]);

    const areaD = `${lineD} L ${width},${height} L 0,${height} Z`;

    // Peak position as percentage for HTML overlay
    const peakXPct = peakIdx / (data.length - 1) * 100;
    const peakYPct = (points[peakIdx].y / height) * 100;

    return (
        <div className="relative w-full" style={{ height }}>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
                <defs>
                    <linearGradient id={`asg-${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>
                {/* Grid lines */}
                {showGrid && [0.25, 0.5, 0.75].map((pct, i) => (
                    <line key={i} x1={0} y1={padY + usableH * (1 - pct)} x2={width} y2={padY + usableH * (1 - pct)}
                        stroke="currentColor" className="text-foreground/[0.04]"
                        strokeWidth="1" strokeDasharray="6 4" />
                ))}
                {/* Area fill */}
                <path d={areaD} fill={`url(#asg-${id})`} />
                {/* Main line */}
                <path d={lineD} fill="none" stroke={color} strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
            </svg>
            {/* Peak marker as HTML overlay (immune to SVG distortion) */}
            {showPeak && peakVal > 0 && (
                <div className="absolute pointer-events-none" style={{ left: `${peakXPct}%`, top: `${peakYPct}%`, transform: 'translate(-50%, -50%)' }}>
                    <div className="w-3 h-3 rounded-full flex items-center justify-center" style={{ backgroundColor: color, opacity: 0.25, boxShadow: `0 0 8px ${color}60` }}>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/80" />
                    </div>
                </div>
            )}
        </div>
    );
};



// ═══════════════════════════════════════════════════════════════
// SVG COMPONENT 4: HeatBar — segmented utilization bar
// ═══════════════════════════════════════════════════════════════
const HeatBar: React.FC<{ value: number; max: number; height?: number }> = ({ value, max, height = 10 }) => {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    const segments = 24;
    const filled = Math.round((pct / 100) * segments);
    return (
        <div className="w-full flex gap-[2px]" style={{ height }}>
            {Array.from({ length: segments }).map((_, i) => {
                const isActive = i < filled;
                const segColor = i < segments * 0.5 ? '#22c55e' : i < segments * 0.75 ? '#f59e0b' : '#ef4444';
                return (
                    <div key={i}
                        className="flex-1 rounded-[2px] transition-all duration-300"
                        style={{
                            backgroundColor: isActive ? segColor : 'var(--foreground)',
                            opacity: isActive ? 0.5 + (i / segments) * 0.5 : 0.04,
                            boxShadow: isActive && i >= segments * 0.75 ? `0 0 6px ${segColor}40` : 'none',
                        }}
                    />
                );
            })}
        </div>
    );
};



// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT: DashboardPro
// ═══════════════════════════════════════════════════════════════
const DashboardPro: React.FC<DashboardProProps> = ({ serverId }) => {
    const { servers, stats: allStats, logs, players, updateServerStatus, javaDownloadStatus } = useServers();
    const { user } = useUser();
    usePermissions();
    useCollaboration();
    const { settings, nodes } = useSystem();
    const server = servers.find(s => s.id === serverId);
    const isJavaPlatform = server?.software && !['Bedrock', 'Velocity'].includes(server.software);
    const stats = allStats[serverId] || { cpu: 0, memory: 0, uptime: 0, latency: 0, players: 0, tps: "0.00", pid: 0 };
    const status = server?.status || ServerStatus.OFFLINE;

    // Uptime latch (v1.12.7)
    const lastValidUptime = useRef<number>(0);
    const isUptimeLive = [ServerStatus.ONLINE, ServerStatus.STARTING, ServerStatus.RESTARTING, ServerStatus.STOPPING].includes(status as ServerStatus);
    
    if (isUptimeLive && stats.uptime > 0) lastValidUptime.current = stats.uptime;
    else if (!isUptimeLive) lastValidUptime.current = 0;
    
    const displayUptime = isUptimeLive ? (stats.uptime || lastValidUptime.current) : 0;

    const { addToast } = useToast();
    const [pendingAction, setPendingAction] = useState<'start' | 'stop' | 'restart' | null>(null);
    const [safetyError, setSafetyError] = useState<{ message: string, code: string, details?: string } | null>(null);
    const [powerConfirm, setPowerConfirm] = useState<{ action: 'stop' | 'restart', isOpen: boolean }>({ action: 'stop', isOpen: false });
    const [showGraceful, setShowGraceful] = useState(false);
    const [gracefulCountdown, setGracefulCountdown] = useState(30);
    const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);
    const [ignoredInSession, setIgnoredInSession] = useState<string[]>([]);

    // History
    const [cpuHistory, setCpuHistory] = useState<number[]>([]);
    const [memHistory, setMemHistory] = useState<number[]>([]);
    const [tpsHistory, setTpsHistory] = useState<number[]>([]);


    // Permissive metrics (v1.12.7): Show data if the server is in a "Live" state
    const isLive = [
        ServerStatus.ONLINE, 
        ServerStatus.STARTING, 
        ServerStatus.RESTARTING, 
        ServerStatus.STOPPING,
        ServerStatus.UNMANAGED
    ].includes(status as ServerStatus);

    const displayCpu = isLive ? (stats.cpu || 0) : 0;
    const displayMemory = isLive ? (stats.memory || 0) : 0;
    const displayTps = isLive ? parseFloat(stats.tps as string) || 0 : 0;
    const displayLatency = isLive ? (stats.latency || 0) : 0;

    const latestMetrics = useRef({ cpu: displayCpu, mem: displayMemory, tps: displayTps, lat: displayLatency });
    useEffect(() => { latestMetrics.current = { cpu: displayCpu, mem: displayMemory, tps: displayTps, lat: displayLatency }; }, [displayCpu, displayMemory, displayTps, displayLatency]);

    useEffect(() => {
        setCpuHistory(Array(30).fill(displayCpu));
        setMemHistory(Array(30).fill(displayMemory));
        setTpsHistory(Array(30).fill(displayTps));

    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setCpuHistory(p => [...p.slice(1), latestMetrics.current.cpu]);
            setMemHistory(p => [...p.slice(1), latestMetrics.current.mem]);
            setTpsHistory(p => [...p.slice(1), latestMetrics.current.tps]);

        }, 2000);
        return () => clearInterval(interval);
    }, []);

    // Peak tracking
    const peakCpu = useRef(0);
    const peakMem = useRef(0);
    if (displayCpu > peakCpu.current) peakCpu.current = displayCpu;
    if (displayMemory > peakMem.current) peakMem.current = displayMemory;
    if (!isLive) { peakCpu.current = 0; peakMem.current = 0; }

    const runDiagnosis = async () => {
        try {
            const results = await API.runDiagnosis(serverId);
            const result = Array.isArray(results) && results.length > 0 ? results[0] : null;
            if (result && !ignoredInSession.includes(result.ruleId)) setDiagnosisResult(result);
            else setDiagnosisResult(null);
        } catch (e) { /* silent fail for background diagnosis */ }
    };

    // Auto-Diagnosis Trigger (Unified)
    // Now reacts to diagnosis data flowing in from the regular stats poll
    useEffect(() => {
        const polledDiagnosis = (stats as any).diagnosis as DiagnosisResult[] | undefined;
        if (polledDiagnosis && polledDiagnosis.length > 0) {
            const mainIssue = polledDiagnosis.find(d => d.isRootCause || d.severity === 'CRITICAL');
            if (mainIssue && !ignoredInSession.includes(mainIssue.ruleId)) {
                setDiagnosisResult(mainIssue);
                return;
            }
        }
        if (status === ServerStatus.ONLINE) {
            setDiagnosisResult(null);
        }
    }, [status, (stats as any).diagnosis, ignoredInSession]);

    // Power controls (identical to Dashboard.tsx)
    const handlePower = async (action: 'start' | 'restart' | 'stop') => {
        setPendingAction(action);
        try {
            if (action === 'start') {
                try {
                    updateServerStatus(serverId, ServerStatus.STARTING);
                    await API.startServer(serverId);
                } catch (e: any) {
                    if (e.message?.includes('already running')) return;
                    updateServerStatus(serverId, ServerStatus.OFFLINE);
                    // Proactive Search: Always run diagnosis scan if a power action fails
                    // This ensures the DiagnosisCard pops up immediately for EULA/File errors.
                    runDiagnosis();
                    if (e.safetyError) setSafetyError({ message: e.message, code: e.code, details: e.details });
                    else addToast('error', 'Start Failed', e.message);
                }
            } else if (action === 'stop' && stats.players > 0) {
                setShowGraceful(true);
                return;
            } else {
                if (stats.players > 0) { setPowerConfirm({ action, isOpen: true }); return; }
                await executePowerAction(action);
            }
        } finally {
            if (!showGraceful && !powerConfirm.isOpen) setPendingAction(null);
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
        } finally { setPendingAction(null); }
    };

    const executePowerAction = async (action: 'stop' | 'restart') => {
        const prev = status;
        try {
            if (action === 'stop') {
                updateServerStatus(serverId, ServerStatus.STOPPING);
                await API.stopServer(serverId);
                updateServerStatus(serverId, ServerStatus.OFFLINE);
            } else if (action === 'restart') {
                 updateServerStatus(serverId, ServerStatus.STOPPING);
                 await API.stopServer(serverId);
                 
                 // Phase 57: Robust Restart Sequence
                 let attempts = 0;
                 const checkAndStart = async () => {
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
            updateServerStatus(serverId, prev as ServerStatus);
            addToast('error', 'Power Action Failed', e.message);
        } finally {
            setPowerConfirm({ action: 'stop', isOpen: false });
            setPendingAction(null);
        }
    };

    const handleForceStart = async () => {
        try {
            updateServerStatus(serverId, ServerStatus.STARTING);
            await API.startServer(serverId, true);
            setSafetyError(null);
        } catch (e: any) {
            updateServerStatus(serverId, ServerStatus.OFFLINE);
            addToast('error', 'Force Start Failed', e.message);
        } finally { setPendingAction(null); }
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
        addToast('info', 'Copied', 'Server address copied to clipboard.');
    };

    const formatUptime = (s: number) => {
        if (s <= 0) return "00:00:00";
        return `${Math.floor(s / 3600).toString().padStart(2, '0')}:${Math.floor((s % 3600) / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
    };

    if (!server) return <div className="p-10 text-center opacity-50 font-black tracking-tighter text-4xl">SERVER_NOT_FOUND</div>;

    const cpuColor = displayCpu > 80 ? '#ef4444' : displayCpu > 50 ? '#f59e0b' : '#3b82f6';
    const memPct = server.ram ? (displayMemory / (server.ram * 1024)) * 100 : 0;
    const memColor = memPct > 80 ? '#ef4444' : memPct > 50 ? '#f59e0b' : '#ffffff';
    const tpsColor = displayTps >= 18 ? '#22c55e' : displayTps >= 15 ? '#f59e0b' : displayTps > 0 ? '#ef4444' : '#555';

    const serverLogs = logs[serverId] || [];

    return (
        <div className="flex-1 p-6 max-w-[1500px] mx-auto space-y-5">
            {/* ── Java Installation Banner ── */}
            {javaDownloadStatus && isJavaPlatform && (!javaDownloadStatus.serverId || javaDownloadStatus.serverId === serverId) && (
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 flex flex-col gap-3 shadow-lg shadow-indigo-500/5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-500/20 rounded-lg"><RefreshCw size={16} className="text-indigo-400 animate-spin" /></div>
                            <div>
                                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Environment Setup</h3>
                                <p className="text-[11px] text-indigo-300 opacity-70">{javaDownloadStatus.message}</p>
                            </div>
                        </div>
                        <div className="text-xs font-mono font-bold text-indigo-400">
                            {javaDownloadStatus.percent !== undefined ? `${Math.round(javaDownloadStatus.percent)}%` : 'PENDING'}
                        </div>
                    </div>
                    {javaDownloadStatus.percent !== undefined && (
                        <div className="h-1.5 w-full bg-indigo-500/10 rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${javaDownloadStatus.percent}%` }}
                                className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                        </div>
                    )}
                </motion.div>
            )}

            {/* ═══ SECTION 1: Command Strip ═══ */}
            <div className={`cc-card ${user?.preferences.visualQuality ? 'glass-morphism glass-spotlight quality-entrance' : ''}`}>
                <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-6">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
                        <div className="flex items-center gap-3">
                            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                status === ServerStatus.ONLINE ? 'bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' :
                                status === ServerStatus.OFFLINE ? 'bg-zinc-600' :
                                'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse'
                            }`} />
                            <h1 className={`text-2xl sm:text-3xl font-bold tracking-tight leading-none truncate ${user?.preferences.visualQuality ? 'bg-gradient-to-r from-foreground to-foreground/50 bg-clip-text text-transparent' : 'text-foreground'}`}>
                                {server.name}
                            </h1>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold text-foreground/20 uppercase tracking-widest flex-shrink-0">
                            <span className="flex items-center gap-1.5"><Disc size={10} className="opacity-40" />{server.software} {server.version}</span>
                            <div className="hidden sm:block w-px h-3 bg-foreground/10" />
                            <button onClick={handleCopyIp} className="font-mono text-foreground/25 hover:text-foreground/50 transition-colors">
                                {(server.ip && server.ip !== '127.0.0.1' && server.ip !== 'localhost') ? server.ip : 'localhost'}:{server.port}
                            </button>
                            <div className="hidden sm:block w-px h-3 bg-foreground/10" />
                            <span className="text-foreground/15">{server.ram}G</span>
                            {stats.pid ? <><div className="hidden sm:block w-px h-3 bg-foreground/10" /><span className="font-mono text-foreground/10">PID {stats.pid}</span></> : null}
                        </div>
                        {server.modpackTitle && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/5 border border-primary/20 text-primary text-[8px] font-bold uppercase tracking-wider flex-shrink-0 self-start sm:self-center">
                                <Package size={9} />{server.modpackTitle}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 flex-shrink-0 w-full xl:w-auto">
                        <button onClick={() => handlePower('start')} disabled={status !== ServerStatus.OFFLINE || !!pendingAction}
                            className="flex-1 xl:flex-none h-[40px] min-w-[110px] px-5 bg-foreground/[0.04] border border-foreground/5 hover:bg-foreground/[0.08] disabled:opacity-20 text-foreground font-bold text-[11px] rounded-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] uppercase tracking-wider">
                            {(pendingAction === 'start' || status === ServerStatus.STARTING) ? <><RefreshCw size={14} className="animate-spin opacity-40" />{status === ServerStatus.STARTING ? 'Starting...' : '...'}</> : <><Power size={14} className="opacity-40" />Start</>}
                        </button>
                        <button onClick={() => handlePower('restart')} disabled={status === ServerStatus.OFFLINE || !!pendingAction || status === ServerStatus.STARTING || status === ServerStatus.STOPPING}
                            className="h-[40px] w-[40px] bg-foreground/[0.04] border border-foreground/5 hover:bg-foreground/[0.08] disabled:opacity-20 text-foreground rounded-lg flex items-center justify-center transition-all active:scale-[0.98]">
                            <RefreshCw size={14} className={pendingAction === 'restart' || status === ServerStatus.RESTARTING ? 'animate-spin' : 'opacity-40'} />
                        </button>
                        <button onClick={() => handlePower('stop')} disabled={status === ServerStatus.OFFLINE || !!pendingAction || status === ServerStatus.STOPPING || status === ServerStatus.STARTING}
                            className="flex-1 xl:flex-none h-[40px] px-5 bg-[#ff1744] hover:bg-[#d50032] disabled:opacity-20 text-white font-bold text-[11px] rounded-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] uppercase tracking-wider shadow-lg shadow-rose-500/10">
                            {(pendingAction === 'stop' || status === ServerStatus.STOPPING) ? <RefreshCw size={14} className="animate-spin" /> : <Ban size={14} />} Stop
                        </button>
                    </div>
                </div>
                {/* Infrastructure badges */}
                {(() => {
                    const badges: React.ReactNode[] = [];
                    if (server.executionEngine === 'docker') badges.push(<span key="docker" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[8px] font-bold uppercase tracking-wider"><Database size={9} /> Docker</span>);
                    if (server.executionEngine === 'remote' && server.nodeId) badges.push(<span key="node" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[8px] font-bold uppercase tracking-wider"><Globe size={9} /> {nodes.find(n => n.id === server.nodeId)?.name || server.nodeId}</span>);
                    if (settings?.app?.dockerEnabled && server.executionEngine !== 'docker') badges.push(<span key="docker-ready" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/5 border border-blue-500/10 text-blue-400/50 text-[8px] font-bold uppercase tracking-wider"><Database size={9} /> Docker Ready</span>);
                    if (settings?.app?.https?.enabled) badges.push(<span key="https" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[8px] font-bold uppercase tracking-wider"><Lock size={9} /> HTTPS</span>);
                    if (settings?.app?.remoteAccess?.enabled) badges.push(<span key="remote" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[8px] font-bold uppercase tracking-wider"><Wifi size={9} /> {settings.app.remoteAccess.method?.toUpperCase() || 'REMOTE'}</span>);
                    if (settings?.app?.hostMode) badges.push(<span key="host" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[8px] font-bold uppercase tracking-wider"><Shield size={9} /> Host Mode</span>);
                    if (settings?.app?.autoHealing) badges.push(<span key="heal" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/20 text-green-400 text-[8px] font-bold uppercase tracking-wider"><Activity size={9} /> Auto-Heal</span>);
                    if (settings?.app?.storageProvider === 'sqlite') badges.push(<span key="sqlite" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[8px] font-bold uppercase tracking-wider"><HardDrive size={9} /> SQLite</span>);
                    if (settings?.app?.distributedNodes?.enabled) badges.push(<span key="cluster" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[8px] font-bold uppercase tracking-wider"><Layers size={9} /> Cluster</span>);
                    if (badges.length === 0) return null;
                    const visible = badges.slice(0, 4);
                    const overflow = badges.length - 4;
                    return (
                        <div className="flex items-center gap-1.5 flex-wrap mt-3 pt-3 border-t border-foreground/[0.04]">
                            {visible}
                            {overflow > 0 && <span className="px-2 py-0.5 rounded-md bg-foreground/5 border border-foreground/10 text-foreground/30 text-[8px] font-bold">+{overflow}</span>}
                        </div>
                    );
                })()}
            </div>

            {/* ═══ SECTION 2: Core Metrics — Responsive Grid ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1.5fr] gap-5">
                <div className={`cc-card flex flex-col items-center py-8 transition-all duration-500 ${user?.preferences.visualQuality ? 'glass-morphism quality-entrance' : ''}`}>
                    <RadialGauge value={displayCpu} max={100} label="CPU Load" unit="%" color={cpuColor} id="pro-cpu" size={240} icon={<Cpu size={11} className="text-muted-foreground/30" />} />
                </div>
                <div className={`cc-card flex flex-col items-center py-8 transition-all duration-500 ${user?.preferences.visualQuality ? 'glass-morphism quality-entrance' : ''}`} style={{ animationDelay: '60ms' }}>
                    <RadialGauge value={displayMemory / 1024} max={server.ram || 1} label="Memory" unit={`${(displayMemory / 1024).toFixed(1)}G / ${server.ram}G`} color={memColor} id="pro-mem" size={240} icon={<HardDrive size={11} className="text-muted-foreground/30" />} />
                </div>
                {/* Process Vitals Panel */}
                <div className={`cc-card ${user?.preferences.visualQuality ? 'glass-morphism quality-entrance' : ''}`} style={{ animationDelay: '120ms' }}>
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-foreground/[0.04]">
                        <MonitorDot size={13} className="text-foreground/30" />
                        <span className="text-[10px] font-bold text-foreground/30 uppercase tracking-[0.2em]">Process Vitals</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-xs">
                        {[
                            { label: 'Uptime', value: formatUptime(displayUptime) },
                            { label: 'Engine', value: server.executionEngine === 'docker' ? 'Docker' : server.executionEngine === 'remote' ? 'Remote Node' : 'Native' },
                            { label: 'Players', value: `${stats.players} / ${server.maxPlayers || 20}` },
                            { label: 'Latency', value: `${displayLatency}ms` },
                            { label: 'Peak CPU', value: `${peakCpu.current.toFixed(1)}%` },
                            { label: 'Peak RAM', value: `${(peakMem.current / 1024).toFixed(1)}G` },
                        ].map((v, i) => (
                            <div key={i} className="flex justify-between items-center py-1.5 border-b border-foreground/[0.03]">
                                <span className="text-muted-foreground/40 font-medium">{v.label}</span>
                                <span className="font-mono font-bold text-foreground/80 text-right">{v.value}</span>
                            </div>
                        ))}
                    </div>
                    {/* TPS Health Indicator */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-4 pt-3 border-t border-foreground/[0.04]">
                        <div className="flex items-center gap-2">
                            <Activity size={12} className="text-foreground/30" />
                            <span className="text-[10px] font-bold text-foreground/30 uppercase tracking-wider">Tick Rate</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-mono font-black tabular-nums" style={{ color: tpsColor }}>{displayTps.toFixed(1)}</span>
                            <span className="text-[9px] font-bold text-foreground/20">TPS</span>
                            <div className={`w-1.5 h-1.5 rounded-full ${status === ServerStatus.ONLINE ? (displayTps >= 18 ? 'bg-emerald-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]' : displayTps >= 15 ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]' : 'bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]') : 'bg-zinc-600'}`} />
                            <span className={`text-[8px] font-bold uppercase tracking-wider ${status === ServerStatus.ONLINE ? (displayTps >= 18 ? 'text-emerald-500' : displayTps >= 15 ? 'text-amber-500' : 'text-rose-500') : 'text-foreground/20'}`}>
                                {status === ServerStatus.ONLINE ? (displayTps >= 18 ? 'Healthy' : displayTps >= 15 ? 'Degraded' : 'Critical') : 'Offline'}
                            </span>
                        </div>
                    </div>

                </div>
            </div>

            {/* ═══ SECTION 3: Telemetry — Responsive Sparklines ═══ */}
            <div className={`grid gap-5 ${status === ServerStatus.ONLINE ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
                <div className={`cc-card py-8 flex flex-col ${user?.preferences.visualQuality ? 'glass-morphism' : ''}`}>
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-2"><Cpu size={13} className="text-foreground/40" /><span className="text-[11px] font-bold text-foreground tracking-widest">CPU</span></div>
                        <div className="text-right">
                            <div className="text-3xl font-bold text-foreground tracking-tighter">{displayCpu.toFixed(1)}%</div>
                            <div className="text-[9px] font-mono font-bold text-foreground/20 mt-0.5">avg {cpuHistory.length > 0 ? (cpuHistory.reduce((a, b) => a + b, 0) / cpuHistory.length).toFixed(1) : '0'}%</div>
                        </div>
                    </div>
                    <HeatBar value={displayCpu} max={100} />
                    <div className="flex-1 min-h-[120px] mt-4">
                        <AreaSparkline id="pro-cpu-spark" data={cpuHistory} color={displayCpu > 80 ? "#f43f5e" : "#3b82f6"} height={160} />
                    </div>
                </div>
                <div className={`cc-card py-8 flex flex-col ${user?.preferences.visualQuality ? 'glass-morphism' : ''}`}>
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-2"><HardDrive size={13} className="text-foreground/40" /><span className="text-[11px] font-bold text-foreground tracking-widest">Memory</span></div>
                        <div className="text-right">
                            <div className="text-3xl font-bold text-foreground tracking-tighter">{(displayMemory / 1024).toFixed(2)}G</div>
                            <div className="text-[9px] font-mono font-bold text-foreground/20 mt-0.5">of {server.ram}G allocated</div>
                        </div>
                    </div>
                    <HeatBar value={displayMemory / 1024} max={server.ram || 1} />
                    <div className="flex-1 min-h-[120px] mt-4">
                        <AreaSparkline id="pro-mem-spark" data={memHistory} color={memPct > 80 ? "#f43f5e" : "#ffffff"} height={160} max={server.ram ? server.ram * 1024 : 100} />
                    </div>
                </div>
                {/* TPS History — only shown when online */}
                {status === ServerStatus.ONLINE && (
                    <div className={`cc-card py-8 flex flex-col ${user?.preferences.visualQuality ? 'glass-morphism' : ''}`}>
                        <div className="flex justify-between items-start mb-6">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2"><Activity size={13} className="text-foreground/40" /><span className="text-[11px] font-bold text-foreground tracking-widest">Tick Rate</span></div>
                                <div className="flex items-center gap-3 text-[9px] font-mono font-bold">
                                    <span className="text-foreground/30">Min:</span><span style={{ color: tpsColor }}>{tpsHistory.length > 0 ? Math.min(...tpsHistory).toFixed(1) : '—'}</span>
                                    <span className="text-foreground/30">Avg:</span><span className="text-emerald-500/80">{tpsHistory.length > 0 ? (tpsHistory.reduce((a, b) => a + b, 0) / tpsHistory.length).toFixed(1) : '—'}</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-3xl font-bold tracking-tighter" style={{ color: tpsColor }}>{displayTps.toFixed(1)}</div>
                            </div>
                        </div>
                        <HeatBar value={displayTps} max={20} />
                        <div className="flex-1 min-h-[120px] mt-4">
                            <AreaSparkline id="pro-tps-spark" data={tpsHistory} color={displayTps >= 18 ? "#22c55e" : displayTps >= 15 ? "#f59e0b" : "#ef4444"} height={160} max={20} />
                        </div>
                    </div>
                )}

            </div>

            {/* Stabilized Console Footer (Pure Black) */}
            <div className="flex items-center gap-4 px-6 h-12 overflow-hidden bg-black border border-white/5 rounded-lg shadow-2xl relative group mt-5">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent pointer-events-none opacity-50" />
                <div className="flex items-center gap-3 shrink-0 relative">
                    <Terminal size={12} className="text-emerald-500/80" />
                    <span className="text-[9px] font-mono text-emerald-500/50 uppercase tracking-[0.2em] font-black">SYSTEM_STDOUT</span>
                </div>
                <div className="flex-1 truncate font-mono text-[11px] text-zinc-500 pt-0.5 relative">
                    {status === ServerStatus.ONLINE ? (
                        logs[serverId]?.length > 0 ? (
                            <span className="opacity-80">{logs[serverId].slice(-1)[0]}</span>
                        ) : (
                            <span className="opacity-30 animate-pulse italic">Waiting for process stream...</span>
                        )
                    ) : (
                        <span className="opacity-10 uppercase tracking-widest text-[9px]">Process Inactive // Connection Severed</span>
                    )}
                </div>
                <div className="flex items-center gap-4 shrink-0 relative">
                    <div className="text-[9px] font-mono text-white/20 uppercase tracking-widest">Live_v1.12.5</div>
                    <div className="flex gap-1">
                        <div className="w-1 h-1 rounded-full bg-emerald-500/20" />
                        <div className="w-1 h-1 rounded-full bg-emerald-500/10" />
                    </div>
                </div>
            </div>

            {/* ═══ Modals & Diagnosis (identical to Dashboard.tsx) ═══ */}
            <AnimatePresence>
                {powerConfirm.isOpen && (
                    <div className="fixed inset-0 bg-background/80 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-card border border-border rounded-xl shadow-2xl p-8 max-w-md w-full text-center space-y-6">
                            <div className="flex justify-center"><AlertTriangle size={48} className="text-amber-500" /></div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold">Active Protocol Detected</h3>
                                <p className="text-sm text-muted-foreground">Players are currently connected. Forcing a {powerConfirm.action} may cause data loss.</p>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={() => setPowerConfirm({ ...powerConfirm, isOpen: false })} className="flex-1 py-3 px-4 bg-secondary/50 rounded-lg text-sm font-bold hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">Cancel</button>
                                <button onClick={() => executePowerAction(powerConfirm.action)} className="flex-1 py-3 px-4 bg-rose-500 text-white rounded-lg text-sm font-bold hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20">Force {powerConfirm.action === 'stop' ? 'Stop' : 'Restart'}</button>
                            </div>
                        </motion.div>
                    </div>
                )}
                {showGraceful && (
                    <div className="fixed inset-0 bg-background/80 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
                            <div className="p-6 border-b border-border/40 flex items-center justify-between bg-muted/20">
                                <div className="flex items-center gap-3"><div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg"><Clock size={16} /></div><h3 className="text-sm font-bold">Graceful Stop</h3></div>
                                <button onClick={() => setShowGraceful(false)} className="p-2 hover:bg-rose-500/10 hover:text-rose-500 text-muted-foreground rounded-lg transition-colors"><X size={16} /></button>
                            </div>
                            <div className="p-8 space-y-8">
                                <p className="text-xs font-medium text-muted-foreground leading-relaxed">Broadcast a warning to <span className="text-foreground font-bold">{stats.players} players</span> and wait for safe termination.</p>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center px-1"><label className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">Countdown</label><span className="text-sm font-mono font-bold text-primary">{gracefulCountdown}s</span></div>
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
                                {safetyError.code === 'EULA_NOT_ACCEPTED' && (
                                    <p className="text-xs text-amber-500/80 mt-2">You must accept the Minecraft EULA to run this server.</p>
                                )}
                            </div>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setSafetyError(null)} className="px-4 py-2 rounded text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors text-foreground">Cancel</button>
                                {safetyError.code === 'EULA_NOT_ACCEPTED' ? (
                                    <button onClick={handleAcceptEula} className="px-4 py-2 rounded text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors">Accept EULA</button>
                                ) : (
                                    <button onClick={handleForceStart} className="px-4 py-2 rounded text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white transition-colors">Force Start</button>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
                {diagnosisResult && (
                    <DiagnosisCard result={diagnosisResult} serverId={serverId}
                        onFix={() => { setDiagnosisResult(null); setTimeout(runDiagnosis, 3000); }}
                        onDismiss={() => { if (diagnosisResult?.ruleId) setIgnoredInSession(p => [...p, diagnosisResult.ruleId]); setDiagnosisResult(null); }} />
                )}
            </AnimatePresence>
        </div>
    );
};

export default DashboardPro;
