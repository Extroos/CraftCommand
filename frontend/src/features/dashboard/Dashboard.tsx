
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Power, RotateCcw, Ban, Activity, Cpu, Network, Users, Terminal, AlertTriangle, Zap, Check, Copy, Disc, Globe, Clock, Info, Shield, Layers, Settings, Cloud, Play, Lock, Hash, Signal, Database, RefreshCw, BarChart3, HardDrive, ChevronRight, MoreHorizontal, ChevronUp, ChevronDown } from 'lucide-react';
import { ServerStatus, ServerConfig, DiagnosisResult } from '@shared/types';
import { API } from '@core/services/api';
import { useToast } from '../ui/Toast';
import { useServers } from '@features/servers/context/ServerContext';
import { useUser } from '@features/auth/context/UserContext';
import { useCollaboration } from '@features/collaboration/context/CollaborationContext';
import { useSystem } from '@features/system/context/SystemContext';
import { usePermissions } from '@features/auth/hooks/usePermissions';

interface DashboardProps {
    serverId: string;
}

// High-Stability SVG Sparkline
const Sparkline: React.FC<{ data: number[], color: string, height?: number, max?: number, id: string, fill?: boolean }> = ({ data, color, height = 40, max = 100, fill = false }) => {
    if (data.length < 2) return <div style={{ height }} className="flex items-center justify-center opacity-10 text-[10px] font-bold">INITIALIZING...</div>;

    const width = 200;
    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - (Math.min(val, max) / max) * height;
        return `${x},${y}`;
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
    const { servers, stats: allStats, logs } = useServers();
    const { user } = useUser();
    const { can } = usePermissions();
    const server = servers.find(s => s.id === serverId);
    
    const { sendChat } = useCollaboration();
    const { hostMode } = useSystem();
    const stats = allStats[serverId] || { cpu: 0, memory: 0, uptime: 0, latency: 0, players: 0, tps: "0.00", pid: 0 };
    const status = server?.status || ServerStatus.OFFLINE;

    // Stability: Latch last valid uptime to prevent jitter while ONLINE
    const lastValidUptime = useRef<number>(0);
    if (status === ServerStatus.ONLINE && stats.uptime > 0) {
        lastValidUptime.current = stats.uptime;
    } else if (status !== ServerStatus.ONLINE) {
        lastValidUptime.current = 0;
    }
    const displayUptimeValue = status === ServerStatus.ONLINE ? (stats.uptime || lastValidUptime.current) : 0;

    const { addToast } = useToast();
    const [pendingAction, setPendingAction] = useState<'start' | 'stop' | 'restart' | null>(null);
    const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);
    
    // History tracking for sparklines
    const [cpuHistory, setCpuHistory] = useState<number[]>(Array(30).fill(0));
    const [memHistory, setMemHistory] = useState<number[]>(Array(30).fill(0));

    // Stability: Force metrics to zero if not ONLINE
    const displayCpu = status === ServerStatus.ONLINE ? stats.cpu : 0;
    const displayMemory = status === ServerStatus.ONLINE ? stats.memory : 0;

    useEffect(() => {
        setCpuHistory(prev => [...prev.slice(1), displayCpu]);
        setMemHistory(prev => [...prev.slice(1), displayMemory]);
    }, [displayCpu, displayMemory]);

    const handlePower = async (action: 'start' | 'stop' | 'restart') => {
        setPendingAction(action);
        try {
            if (action === 'start') await API.startServer(serverId);
            if (action === 'stop') await API.stopServer(serverId);
            if (action === 'restart') {
                await API.stopServer(serverId);
                setTimeout(async () => {
                    await API.startServer(serverId);
                }, 2000);
            }
        } catch (e: any) {
            addToast('error', 'Power Action Failed', e.message);
        } finally {
            setPendingAction(null);
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
            {/* Precision Tactical Hero Section */}
            <div className={`cc-card transition-all duration-700 ${user?.preferences.visualQuality ? 'glass-morphism glass-spotlight quality-entrance' : ''}`}>
                <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/[0.04]">
                    <div className="flex items-center gap-3">
                        <div className={`w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.4)] ${
                            status === ServerStatus.ONLINE ? 'bg-emerald-500 shadow-emerald-500/40' :
                            status === ServerStatus.OFFLINE ? 'bg-rose-500 shadow-rose-500/40' :
                            'bg-amber-500 shadow-amber-500/40 animate-pulse'
                        }`} />
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">
                            SERVER STATUS: <span className="text-white/60">
                                {status === ServerStatus.OFFLINE ? 'OFFLINE' : `LOCAL-${server.id.split('-')[0].toUpperCase()}`}
                            </span>
                        </span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-bold text-white/20 uppercase tracking-widest">
                        <div className="flex items-center gap-2">
                            <Disc size={12} className="opacity-40" />
                            <span>{server.software}</span>
                        </div>
                        <div className="w-px h-3 bg-white/10" />
                        <span>{server.version}</span>
                    </div>
                </div>

                <div className="flex justify-between items-center">
                    <div className="space-y-4">
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
                        
                        <h1 className={`text-6xl font-bold tracking-tighter leading-none lowercase ${user?.preferences.visualQuality ? 'bg-gradient-to-br from-white via-white to-white/40 bg-clip-text text-transparent tracking-[-0.08em]' : 'text-white'}`}>
                            {server.name.toLowerCase()}
                        </h1>

                        <div className="flex items-center gap-8 pt-2">
                            <button onClick={handleCopyIp} className="flex items-center gap-2.5 text-white/40 hover:text-white/70 transition-colors group">
                                <span className="text-[14px] font-mono tracking-tight flex items-center gap-2">
                                    <span className="opacity-40">&gt;</span>
                                    {(server.ip && server.ip !== '127.0.0.1' && server.ip !== 'localhost') ? server.ip : 'localhost'}:{server.port}
                                </span>
                                <Copy size={13} className="opacity-20 group-hover:opacity-40" />
                            </button>
                            <div className="flex items-center gap-2.5 text-white/40">
                                <Layers size={14} className="opacity-40" />
                                <span className="text-[13px] font-bold tracking-tight">
                                    {server.ram}GB RAM Allocation
                                </span>
                            </div>
                            <div className={`px-2 py-0.5 rounded border text-[9px] font-black tracking-widest uppercase ${user?.preferences.visualQuality ? 'bg-white/5 border-white/10 text-white/60' : 'bg-transparent border-white/5 text-white/20'}`}>
                                WINDOWS X64
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => handlePower('start')}
                            disabled={status !== ServerStatus.OFFLINE || !!pendingAction}
                            className="h-[52px] min-w-[140px] px-8 bg-white/[0.04] border border-white/5 hover:bg-white/[0.08] disabled:opacity-20 text-white font-bold text-[13px] rounded-md flex items-center justify-center gap-3 transition-all active:scale-[0.98] uppercase tracking-wider"
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
                            className="h-[52px] w-[52px] bg-white/[0.04] border border-white/5 hover:bg-white/[0.08] disabled:opacity-20 text-white rounded-md flex items-center justify-center transition-all active:scale-[0.98]"
                        >
                            <RefreshCw size={18} className={pendingAction === 'restart' || status === ServerStatus.RESTARTING ? 'animate-spin' : 'opacity-40'} />
                        </button>
                        <button 
                            onClick={() => handlePower('stop')}
                            disabled={status === ServerStatus.OFFLINE || !!pendingAction || status === ServerStatus.STARTING || status === ServerStatus.STOPPING || status === ServerStatus.RESTARTING}
                            className="h-[52px] px-8 bg-[#ff1744] hover:bg-[#d50032] disabled:opacity-20 text-white font-bold text-[13px] rounded-md flex items-center justify-center gap-3 transition-all active:scale-[0.98] uppercase tracking-wider box-content"
                        >
                            {(pendingAction === 'stop' || status === ServerStatus.STOPPING) ? <RefreshCw size={18} className="animate-spin" /> : <Ban size={18} />}
                            Stop
                        </button>
                    </div>
                </div>
            </div>

            {/* Tactical Grid Row 1 (4 Columns) */}
            <div className="grid grid-cols-4 gap-6">
                {[
                    { label: 'UPTIME', value: formatUptime(displayUptimeValue), sub: 'SESSION DURATION', detail: '', icon: <Clock size={16} className="text-white/40" />, status: status === ServerStatus.ONLINE ? 'ONLINE' : 'OFFLINE' },
                    { label: 'TICK RATE', value: (typeof stats.tps === 'number' ? stats.tps : parseFloat(stats.tps as string) || 0).toFixed(2), unit: 'TPS', sub: '', detail: '', icon: <Activity size={16} className="text-white/40" />, line: true },
                    { label: 'PLAYERS', value: stats.players, unit: ` / ${server.maxPlayers || '20'}`, sub: '', detail: '', icon: <Users size={16} className="text-white/40" />, heads: true },
                    { label: 'LATENCY', value: stats.latency, unit: 'ms', sub: '', detail: '', icon: <Zap size={16} className="text-white/40" />, signal: true }
                ].map((m, i) => (
                    <div key={i} className={`cc-card group relative transition-all duration-500 ${user?.preferences.visualQuality ? `glass-morphism quality-entrance ${m.label === 'UPTIME' ? 'glass-spotlight-subtle' : ''}` : ''}`} style={{ animationDelay: `${(i + 1) * 50}ms` }}>
                        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                {m.icon}
                                <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest">{m.label}</span>
                            </div>
                            {m.status && (
                                <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${
                                    m.status === 'ONLINE' ? 'text-emerald-400' : 'text-rose-400'
                                }`}>
                                    {m.status} <div className={`w-1.5 h-1.5 rounded-full ${
                                        m.status === 'ONLINE' ? 'bg-emerald-500' : 'bg-rose-500'
                                    }`} />
                                </div>
                            )}
                            {m.label === 'TICK RATE' && <div className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-400 uppercase tracking-widest">OPTIMAL</div>}
                        </div>
                        
                        <div className="space-y-0.5 relative">
                            <div className="flex justify-between items-baseline">
                                <div className="text-4xl font-bold text-white tracking-tighter flex items-baseline gap-1.5 leading-[0.9]">
                                    {m.value}<span className="text-[14px] opacity-20 uppercase font-bold">{m.unit}</span>
                                </div>
                                {m.signal && (
                                    <div className="flex gap-1.5 items-end h-10 pb-1">
                                        {[1, 2, 3, 4, 5].map((s) => (
                                            <div key={s} className="w-1.5 bg-white/20 rounded-sm" style={{ height: `${s * 20}%` }} />
                                        ))}
                                    </div>
                                )}
                            </div>
                            {m.sub && (
                                <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest mt-1.5">{m.sub}</div>
                            )}
                            {m.heads && stats.players > 0 && (
                                <div className="flex -space-x-2 pt-4">
                                    {['Steve', 'Alex', 'Notch', 'Herobrine', 'Dinnerbone', 'Grumm'].slice(0, Math.min(6, stats.players)).map((name, idx) => (
                                        <div key={name} className="relative transition-transform hover:-translate-y-1 hover:z-10" style={{ zIndex: 6 - idx }}>
                                            <img 
                                                src={`https://mc-heads.net/avatar/${name}/32`} 
                                                className={`w-6 h-6 rounded-[2px] border border-black/50 ring-1 ring-white/10 shadow-lg ${user?.preferences.visualQuality ? 'bg-black/40' : ''}`}
                                                alt={name}
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

            {/* Tactical Grid Row 2 (2 Columns Wide - Telemetry Precision) */}
            <div className="grid grid-cols-2 gap-6">
                <div className={`cc-card py-14 ${user?.preferences.visualQuality ? 'glass-morphism' : ''}`}>
                    <div className="flex justify-between items-start mb-10">
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <Cpu size={14} className="text-white/40" />
                                <span className="text-[11px] font-bold text-white tracking-widest">Process CPU</span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest">INSTANCE LOAD</div>
                                {user?.preferences.visualQuality && (
                                    <div className="flex items-center gap-2 text-[9px] font-mono font-bold">
                                        <span className="text-white/30 uppercase">Peak:</span>
                                        <span className="text-emerald-500/80">{Math.max(...cpuHistory).toFixed(1)}%</span>
                                        <span className="text-white/30 uppercase ml-1">Avg:</span>
                                        <span className="text-blue-500/80">{(cpuHistory.reduce((a,b) => a+b, 0) / cpuHistory.length).toFixed(1)}%</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-4xl font-bold text-white tracking-tighter leading-[0.9]">
                                {displayCpu.toFixed(1)}%
                            </div>
                            <div className="text-[9px] font-bold text-white/5 uppercase tracking-widest mt-2">REAL-TIME TELEMETRY</div>
                        </div>
                    </div>
                    <div className="h-48 mt-auto flex items-end">
                        <Sparkline id="cpu" data={cpuHistory} color={displayCpu > 80 ? "rgba(244,63,94,0.8)" : "rgba(255,255,255,0.8)"} height={180} fill={user?.preferences.visualQuality} />
                    </div>
                </div>

                <div className={`cc-card py-14 ${user?.preferences.visualQuality ? 'glass-morphism' : ''}`}>
                    <div className="flex justify-between items-start mb-10">
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <HardDrive size={14} className="text-white/40" />
                                <span className="text-[11px] font-bold text-white tracking-widest">Memory Usage</span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest">RAM ALLOCATION</div>
                                {user?.preferences.visualQuality && (
                                    <div className="flex items-center gap-2 text-[9px] font-mono font-bold">
                                        <span className="text-white/30 uppercase">Peak:</span>
                                        <span className="text-emerald-500/60">{(Math.max(...memHistory) / 1024).toFixed(2)}G</span>
                                        <span className="text-white/30 uppercase ml-1">Avg:</span>
                                        <span className="text-blue-500/60">{(memHistory.reduce((a,b) => a+b, 0) / memHistory.length / 1024).toFixed(2)}G</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-4xl font-bold text-white tracking-tighter leading-[0.9]">
                                {(displayMemory / 1024).toFixed(2)}G
                            </div>
                            <div className="text-[9px] font-bold text-white/5 uppercase tracking-widest mt-2">HEAP TREND</div>
                        </div>
                    </div>
                    <div className="h-48 mt-auto flex items-end">
                        <Sparkline id="mem" data={memHistory} color={(displayMemory / 1024) > (server.ram * 0.9) ? "rgba(244,63,94,0.8)" : "rgba(255,255,255,0.8)"} height={180} max={server?.ram ? server.ram * 1024 : 100} fill={user?.preferences.visualQuality} />
                    </div>
                </div>
            </div>

            {/* Terminal Bar & Footer */}
            <div className="col-span-full">
                <div className={`rounded-xl overflow-hidden border border-white/5 bg-black transition-all duration-700 ${user?.preferences.visualQuality ? 'quality-entrance' : ''}`} style={{ animationDelay: '250ms' }}>
                    <div className="flex items-center justify-between h-14 px-6">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <ChevronRight size={14} className="text-emerald-500" />
                                <span className="text-[11px] font-mono text-emerald-500/80">root@server:~$</span>
                            </div>
                            <span className="text-[11px] font-mono text-white/40">[00:10:35] [SimpleBackups/INFO] Backup verified. Status: 0 [BUFFER: 2.4MB]</span>
                        </div>
                        <MoreHorizontal size={14} className="text-white/20" />
                    </div>
                </div>
            </div>

        </div>
    );
};

export default Dashboard;
