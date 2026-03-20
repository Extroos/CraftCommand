import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { ServerConfig, ServerStatus } from '@shared/types';
import { API } from '@core/services/api';
import { Globe, Server, Check, Activity, Shield, Cpu, Network, LayoutDashboard, Database, RefreshCw, Info, Search, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Standard Motion Variants (matching project style)
const STAGGER_CONTAINER = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.05 }
    }
};

const STAGGER_ITEM = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 }
};

interface StatusPageProps {
    onNavigateLogin: () => void;
}

const StatusPage: React.FC<StatusPageProps> = ({ onNavigateLogin }) => {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [msUntilRefresh, setMsUntilRefresh] = useState(3000);
    const [servers, setServers] = useState<ServerConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState<'NAME' | 'STATUS' | 'PLAYERS'>('STATUS');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const fetchServers = useCallback(async () => {
        setLoading(true);
        try {
            const latest = await API.getServers();
            setServers(latest);
            setMsUntilRefresh(3000);
        } catch (e) { 
            console.error("[Status] Pulse failed", e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchServers();
        const interval = setInterval(fetchServers, 3000);
        const clock = setInterval(() => setCurrentTime(new Date()), 1000);
        const countdown = setInterval(() => {
            setMsUntilRefresh(prev => Math.max(0, prev - 100));
        }, 100);

        return () => {
            clearInterval(interval);
            clearInterval(clock);
            clearInterval(countdown);
        };
    }, [fetchServers]);

    const handleCopy = (server: ServerConfig) => {
        const host = server.network?.hostname || server.ip || '127.0.0.1';
        navigator.clipboard.writeText(`${host}:${server.port}`);
        setCopiedId(server.id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const metrics = useMemo(() => {
        const total = servers.length;
        const online = servers.filter(s => s.status === ServerStatus.ONLINE).length;
        const players = servers.reduce((acc, s) => acc + (s.players || 0), 0);
        const uptime = total > 0 ? (online / total) * 100 : 0;
        
        return { total, online, players, uptime };
    }, [servers]);

    const filteredServers = useMemo(() => {
        return servers
            .filter(s => (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (s.software || '').toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => {
                if (sortBy === 'NAME') return a.name.localeCompare(b.name);
                if (sortBy === 'PLAYERS') return (b.players || 0) - (a.players || 0);
                if (sortBy === 'STATUS') {
                    if (a.status === b.status) return a.name.localeCompare(b.name);
                    return a.status === ServerStatus.ONLINE ? -1 : 1;
                }
                return 0;
            });
    }, [servers, searchTerm, sortBy]);

    const activeBg = localStorage.getItem('cc_bg_status');
    const bgClass = activeBg ? 'bg-transparent-if-bg' : 'bg-background';

    return (
        <div className={`min-h-screen ${bgClass} text-foreground font-sans selection:bg-primary/30 overflow-y-auto pb-20`}>
            
            {/* --- TOP HEADER BAR (Matching SettingsManager) --- */}
            <div className="max-w-[1600px] mx-auto px-6 pt-6">
                <div className="bg-card border border-border/80 rounded-2xl overflow-hidden shadow-sm transition-all">
                    <div className="h-10 bg-muted/20 border-b border-border/60 flex items-center justify-between px-4">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/40"></div>
                            <span className="text-[11px] font-semibold text-muted-foreground tracking-tight uppercase">Public Operational Status</span>
                        </div>
                        <div className="flex items-center gap-4">
                             <div className="flex items-center gap-2">
                                <div className="w-16 h-1 bg-muted/30 rounded-full overflow-hidden">
                                    <motion.div 
                                        className="h-full bg-primary/60" 
                                        animate={{ width: `${(msUntilRefresh / 3000) * 100}%` }}
                                        transition={{ duration: 0.1, ease: 'linear' }}
                                    />
                                </div>
                                <span className="text-[8px] font-black text-muted-foreground/30 uppercase tracking-widest">Grid Pulse</span>
                            </div>
                            <span className="opacity-10 text-muted-foreground">|</span>
                            <div className="text-[10px] font-mono text-muted-foreground/40 tabular-nums">
                                {currentTime.toLocaleTimeString('en-US', { hour12: false })}
                            </div>
                        </div>
                    </div>

                    <div className="px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-3">
                            <div className="flex flex-col">
                                <h1 className="text-sm font-black text-foreground uppercase tracking-tight flex items-center gap-2">
                                    <Activity size={16} className="text-primary" />
                                    Infrastructure Overview
                                </h1>
                                <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-[0.2em] mt-0.5 opacity-60">Verified Node Telemetry</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button 
                                onClick={fetchServers}
                                disabled={loading}
                                className="flex items-center gap-2 px-3 py-1.5 bg-secondary hover:bg-muted text-muted-foreground rounded text-[9px] font-bold uppercase tracking-widest transition-all border border-border/40 disabled:opacity-50"
                            >
                                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                                {loading ? 'Syncing' : 'Scan'}
                            </button>
                            <button 
                                onClick={onNavigateLogin}
                                className="flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground rounded text-[9px] font-black uppercase tracking-widest hover:bg-primary/90 transition-all shadow-sm"
                            >
                                <LayoutDashboard size={12} />
                                Admin Gateway
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <main className="max-w-[1600px] mx-auto px-6 py-8">
                
                {/* --- METRICS GRID (Standardized) --- */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {[
                        { label: 'Cluster Nodes', val: metrics.total, icon: Database, color: 'text-primary' },
                        { label: 'Network Uptime', val: `${metrics.uptime.toFixed(1)}%`, icon: Shield, color: metrics.uptime === 100 ? 'text-emerald-500' : 'text-amber-500' },
                        { label: 'System Load', val: metrics.players, icon: Cpu, color: 'text-blue-500' },
                        { label: 'Refresh Rate', val: '0.8s', icon: RefreshCw, color: 'text-muted-foreground' }
                    ].map((m, i) => (
                        <div key={i} className="bg-card border border-border/60 p-4 rounded-xl shadow-sm hover:border-border transition-colors">
                            <div className="flex items-center justify-between mb-2 text-muted-foreground/30 uppercase tracking-widest text-[8px] font-black">
                                {m.label}
                                <m.icon size={12} className={m.color} />
                            </div>
                            <div className="flex items-baseline gap-2">
                                <h2 className="text-2xl font-black tracking-tighter text-foreground tabular-nums">{m.val}</h2>
                                <span className="text-[8px] font-bold text-muted-foreground/20 uppercase tracking-[0.3em]">Operational</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* --- MAIN OPERATIONAL TABLE (Matching DatabaseManager) --- */}
                <div className="bg-card border border-border/80 rounded-2xl overflow-hidden shadow-sm">
                    {/* Table Filters Bar */}
                    <div className="bg-muted/30 px-6 py-3 border-b border-border/60 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-emerald-500/50 animate-pulse"></div>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">Active Subsystem Trace</span>
                        </div>
                        
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/30" />
                                <input 
                                    type="text" 
                                    placeholder="SEARCH_NODE..." 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="bg-background/80 border border-border/40 rounded px-8 py-1 text-[9px] font-bold text-foreground placeholder:text-muted-foreground/20 uppercase tracking-widest focus:ring-1 focus:ring-primary/20 outline-none w-48 transition-all"
                                />
                            </div>
                            <div className="flex items-center gap-1 bg-background/40 p-1 rounded border border-border/40">
                                {(['NAME', 'STATUS', 'PLAYERS'] as const).map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setSortBy(s)}
                                        className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest transition-all ${
                                            sortBy === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground/30 hover:text-muted-foreground'
                                        }`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto min-h-[500px]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-border/20 text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.2em]">
                                    <th className="px-6 py-3 font-black">Status</th>
                                    <th className="px-6 py-3 font-black">Cluster Node</th>
                                    <th className="px-6 py-3 font-black">Architecture</th>
                                    <th className="px-6 py-3 font-black">Load</th>
                                    <th className="px-6 py-3 font-black">Latency</th>
                                    <th className="px-3 py-3 font-black text-right">Connectivity</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/10">
                                <AnimatePresence mode="popLayout">
                                    {filteredServers.map((server) => {
                                        const isOnline = server.status === ServerStatus.ONLINE;
                                        return (
                                            <motion.tr 
                                                key={server.id}
                                                layout
                                                variants={STAGGER_ITEM}
                                                initial="hidden"
                                                animate="show"
                                                exit="hidden"
                                                className="hover:bg-muted/5 transition-colors group"
                                            >
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border inline-flex items-center gap-1.5 ${
                                                        isOnline 
                                                        ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-500' 
                                                        : 'bg-rose-500/5 border-rose-500/20 text-rose-500/40'
                                                    }`}>
                                                        <div className={`w-1 h-1 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500/40'}`} />
                                                        {isOnline ? 'Online' : 'Offline'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] font-bold text-foreground/80 lowercase">{server.name}</span>
                                                        <span className="text-[8px] font-black text-muted-foreground/30 uppercase tracking-widest mt-0.5">ID_{server.id.split('-')[0]}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <Cpu size={10} className="text-muted-foreground/30" />
                                                        <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">{server.software} v{server.version}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {isOnline ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-12 h-1 bg-muted/20 rounded-full overflow-hidden">
                                                                <div className="h-full bg-primary/40" style={{ width: `${Math.min(100, (server.players / server.maxPlayers) * 100)}%` }} />
                                                            </div>
                                                            <span className="text-[10px] font-mono font-bold text-foreground/50">{server.players}<span className="opacity-20 mx-1">/</span>{server.maxPlayers}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] font-mono font-bold text-muted-foreground/20">--</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`text-[10px] font-mono font-bold ${isOnline ? 'text-primary/60' : 'text-muted-foreground/20'}`}>
                                                        {isOnline ? `${server.latency}ms` : '--'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-4 text-right">
                                                    <button 
                                                        onClick={() => handleCopy(server)}
                                                        className="px-3 py-1 bg-muted/10 hover:bg-muted/30 border border-border/20 rounded text-[9px] font-bold font-mono text-muted-foreground transition-all hover:text-foreground inline-flex items-center gap-2"
                                                    >
                                                        {copiedId === server.id ? (
                                                            <><Check size={10} className="text-emerald-500" /> COPIED</>
                                                        ) : (
                                                            <>{server.ip}:{server.port} <ExternalLink size={8} className="opacity-30" /></>
                                                        )}
                                                    </button>
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </AnimatePresence>
                            </tbody>
                        </table>

                        {loading && filteredServers.length === 0 && (
                            <div className="py-32 text-center">
                                <RefreshCw className="mx-auto text-primary/10 animate-spin mb-4" size={40} />
                                <p className="text-[10px] font-black text-muted-foreground/20 uppercase tracking-[0.4em]">Calibrating Sensors...</p>
                            </div>
                        )}

                        {!loading && filteredServers.length === 0 && (
                            <div className="py-32 text-center">
                                <Database className="mx-auto text-muted-foreground/5 mb-4" size={40} />
                                <p className="text-[10px] font-black text-muted-foreground/20 uppercase tracking-[0.3em]">No Infrastructure Found</p>
                                <button 
                                    onClick={() => { setSearchTerm(''); setSortBy('STATUS'); }}
                                    className="mt-4 text-[9px] font-black text-primary/40 uppercase tracking-widest hover:text-primary transition-colors"
                                >
                                    Reset Discovery Pattern
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="px-6 py-3 bg-muted/10 border-t border-border/40 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Info size={12} className="text-primary/60" />
                            <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-widest opacity-40 italic">
                                Sourced from CraftCommand Grid. Administrative keys required for direct shell access.
                            </p>
                        </div>
                        <div className="text-[8px] font-black text-muted-foreground/20 uppercase tracking-[0.2em]">
                            {filteredServers.length} Units Online
                        </div>
                    </div>
                </div>
            </main>

            {/* --- CLINICAL FOOTER --- */}
            <footer className="max-w-[1600px] mx-auto px-10 py-16 border-t border-border/40 mt-12 opacity-30">
                <div className="flex flex-col md:flex-row justify-between items-center gap-10">
                    <div className="flex flex-col gap-1">
                        <p className="text-[9px] font-black uppercase tracking-[0.4em] text-foreground mb-1">Grid Management Layer</p>
                        <p className="text-[8px] font-medium leading-relaxed max-w-sm text-muted-foreground uppercase tracking-widest">
                            Secure redundant operational monitoring for high-availability node clusters.
                        </p>
                    </div>
                    <div className="flex gap-16 text-right">
                        <div>
                            <p className="text-[7px] uppercase tracking-widest font-black text-muted-foreground/60 mb-1">Architecture</p>
                            <p className="text-[9px] font-black text-foreground/40 uppercase tracking-tighter">NODE_DIST_V4</p>
                        </div>
                        <div>
                            <p className="text-[7px] uppercase tracking-widest font-black text-muted-foreground/60 mb-1">Registry</p>
                            <p className="text-[9px] font-black text-primary/40 uppercase tracking-tighter">SECURE_H6</p>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default StatusPage;
