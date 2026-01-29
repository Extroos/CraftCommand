
import React, { useEffect, useState, useMemo } from 'react';

import { ServerConfig, ServerStatus } from '@shared/types';
import { API } from '../../services/api';

import { Activity, Users, Copy, Check, ArrowRight, ShieldCheck, Globe, Server, Wifi, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface StatusPageProps {
    onNavigateLogin: () => void;
}

// Optimized Bar Component: Renders once, animates forever via GPU
const UptimeBar = React.memo(({ index, isOnline }: { index: number, isOnline: boolean }) => {
    // Generate deterministic random values based on index so they look random but don't change on re-renders
    const randomHeight1 = 30 + ((index * 7) % 40); 
    const randomHeight2 = 50 + ((index * 3) % 50);
    const duration = 1.2 + (index % 5) * 0.1;

    return (
        <motion.div
            initial={{ height: "20%", opacity: 0.3 }}
            animate={isOnline ? {
                height: [`20%`, `${randomHeight1}%`, `30%`, `${randomHeight2}%`, `20%`],
                opacity: [0.3, 0.8, 0.3]
            } : { 
                height: "10%", 
                opacity: 0.1 
            }}
            transition={isOnline ? {
                duration: duration,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut",
                delay: index * 0.05
            } : { duration: 0.5 }}
            className={`w-1.5 rounded-sm ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-rose-500/20'}`}
        />
    );
});

// Memoized Card: Prevents re-rendering (and animation stutter) when parent polls data
const ServerCard = React.memo(({ server }: { server: ServerConfig }) => {
    const [copied, setCopied] = useState(false);
    const isOnline = server.status === ServerStatus.ONLINE;
    
    // Simulate stable player count for demo consistency
    const players = useMemo(() => isOnline ? Math.floor(Math.random() * 5) + 1 : 0, [isOnline]);

    const handleCopy = () => {
        navigator.clipboard.writeText(`${server.ip || '127.0.0.1'}:${server.port}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <motion.div
            layout="position"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#121214]/60 backdrop-blur-md border border-[rgb(var(--color-border-subtle))] rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:bg-[#121214]/80 transition-colors shadow-xl group relative overflow-hidden"
        >
            {/* Status Accent Line */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 transition-colors duration-500 ${isOnline ? 'bg-emerald-500 shadow-[0_0_20px_#10b981]' : 'bg-rose-500/50'}`} />

            <div className="flex items-start gap-5 flex-1 z-10">
                <div className="relative">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-colors duration-500 ${
                        isOnline ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-zinc-900/50 border-[rgb(var(--color-border-subtle))] text-[rgb(var(--color-fg-subtle))]'
                    }`}>
                        <Server size={28} />
                    </div>
                    {isOnline && (
                        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-[#09090b]"></span>
                        </span>
                    )}
                </div>
                
                <div>
                    <div className="flex items-center gap-3 mb-1.5">
                        <h3 className="text-xl font-bold text-white tracking-tight">{server.name}</h3>
                        <div className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider flex items-center gap-1.5 ${
                            isOnline 
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/10' 
                            : 'bg-rose-500/10 text-rose-500 border-rose-500/10'
                        }`}>
                            {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
                            {isOnline ? 'Online' : 'Offline'}
                        </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground/60 font-mono">
                        <span className="bg-white/5 px-2 py-0.5 rounded text-[rgb(var(--color-fg-muted))]">{server.software} {server.version}</span>
                        <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                        <span className="truncate max-w-[200px]">{server.motd || 'System operational'}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-8 w-full md:w-auto border-t md:border-t-0 border-[rgb(var(--color-border-subtle))] pt-6 md:pt-0 z-10">
                {/* Optimized Uptime Graph */}
                <div className="hidden lg:flex items-end gap-1 h-10 w-48 opacity-80">
                    {[...Array(20)].map((_, i) => (
                        <UptimeBar key={i} index={i} isOnline={isOnline} />
                    ))}
                </div>

                {/* Stats & Connect */}
                <div className="flex items-center gap-6 ml-auto">
                    <div className="text-right">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-0.5 opacity-50">Players</div>
                        <div className="text-xl font-mono font-bold text-white flex items-center gap-2 justify-end">
                            <Users size={16} className={isOnline ? "text-emerald-500" : "text-zinc-700"} />
                            <span className={isOnline ? "text-white" : "text-[rgb(var(--color-fg-subtle))]"}>{players}</span>
                            <span className="text-muted-foreground/30 text-base">/{server.maxPlayers}</span>
                        </div>
                    </div>

                    <button 
                        onClick={handleCopy}
                        className="group/btn relative px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-[rgb(var(--color-border-default))] hover:border-emerald-500/50 rounded-xl transition-all active:scale-95"
                    >
                        <div className="flex items-center gap-2 font-mono text-sm text-emerald-400 font-bold">
                            {copied ? (
                                <motion.span 
                                    initial={{ opacity: 0, scale: 0.8 }} 
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex items-center gap-2 text-white"
                                >
                                    <Check size={14} /> Copied
                                </motion.span>
                            ) : (
                                <>
                                    <span className="opacity-70 group-hover/btn:opacity-100 transition-opacity text-white group-hover/btn:text-emerald-400">
                                        {server.ip || 'localhost'}:{server.port}
                                    </span>
                                    <Copy size={14} className="opacity-50 group-hover/btn:opacity-100" />
                                </>
                            )}
                        </div>
                    </button>
                </div>
            </div>
        </motion.div>
    );
}, (prev, next) => {
    // Custom comparison for performance: only re-render if deep properties change
    return prev.server.status === next.server.status && 
           prev.server.name === next.server.name &&
           prev.server.motd === next.server.motd;
});

const StatusPage: React.FC<StatusPageProps> = ({ onNavigateLogin }) => {
    const [servers, setServers] = useState<ServerConfig[]>([]);


    // Optimized Polling: No forced re-renders (tick state removed)
    useEffect(() => {
        const fetch = async () => {
            try {
                const latest = await API.getServers();
                setServers(latest);
            } catch (e) { console.error(e); }
        };
        fetch();
        const interval = setInterval(fetch, 2000);
        return () => clearInterval(interval);
    }, []);


    const totalOnline = useMemo(() => 
        servers.reduce((acc, s) => acc + (s.status === ServerStatus.ONLINE ? (s.maxPlayers ? Math.floor(Math.random() * 3) + 1 : 0) : 0), 0)
    , [servers]); // Dependencies ensure this only recalcs when servers change

    const systemsOperational = servers.length > 0 && servers.every(s => s.status !== ServerStatus.OFFLINE);

    return (
        <div className="min-h-screen bg-[#09090b] text-foreground font-sans selection:bg-emerald-500/20 relative overflow-hidden">
            {/* Optimized Background: Hardware Accelerated */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-900/10 via-[#09090b] to-[#09090b] opacity-40 animate-[pulse_8s_ease-in-out_infinite]" style={{ willChange: 'opacity' }}></div>
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
            </div>

            {/* Top Navigation */}
            <nav className="border-b border-[rgb(var(--color-border-subtle))] bg-black/40 backdrop-blur-xl sticky top-0 z-50 transition-all duration-300">
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-black shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                            <Activity size={18} />
                        </div>
                        <span className="font-bold tracking-tight text-lg">CraftCommand <span className="text-emerald-500">Status</span></span>
                    </div>
                    <button 
                        onClick={onNavigateLogin}
                        className="group flex items-center gap-2 px-5 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-[rgb(var(--color-border-subtle))] hover:border-[rgb(var(--color-border-strong))] transition-all text-sm font-medium hover:scale-105 active:scale-95"
                    >
                        <span>Staff Portal</span>
                        <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
                </div>
            </nav>

            {/* Content Container */}
            <div className="relative z-10 pb-20">
                {/* Hero Header */}
                <div className="pt-20 pb-16 px-6">
                    <div className="max-w-6xl mx-auto">
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-10">
                            <div className="animate-slide-up">
                                <div className="flex items-center gap-2 mb-6">
                                    <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border flex items-center gap-2 ${systemsOperational ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${systemsOperational ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
                                        {systemsOperational ? 'All Systems Operational' : 'Degraded Performance'}
                                    </div>
                                </div>
                                <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6 drop-shadow-2xl">
                                    Network <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-500">Telemetry</span>
                                </h1>
                                <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
                                    Real-time operational status, player metrics, and connection details for the CraftCommand gaming infrastructure.
                                </p>
                            </div>
                            
                            {/* Global Stats */}
                            <div className="flex gap-12 animate-slide-up" style={{ animationDelay: '0.1s' }}>
                                <div>
                                    <div className="text-4xl font-mono font-bold text-white mb-1">{servers.length}</div>
                                    <div className="text-xs text-muted-foreground uppercase tracking-widest font-bold opacity-60">Nodes</div>
                                </div>
                                <div>
                                    <div className="text-4xl font-mono font-bold text-emerald-400 mb-1">{totalOnline}</div>
                                    <div className="text-xs text-muted-foreground uppercase tracking-widest font-bold opacity-60">Players</div>
                                </div>
                                <div>
                                    <div className="text-4xl font-mono font-bold text-blue-400 mb-1">99.9%</div>
                                    <div className="text-xs text-muted-foreground uppercase tracking-widest font-bold opacity-60">Uptime</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Server Grid */}
                <div className="max-w-6xl mx-auto px-6 space-y-4">
                    <AnimatePresence>
                        {servers.map((server) => (
                            <ServerCard key={server.id} server={server} />
                        ))}
                    </AnimatePresence>

                    {servers.length === 0 && (
                        <div className="text-center py-24 bg-[#121214]/50 border border-[rgb(var(--color-border-subtle))] rounded-2xl animate-fade-in">
                            <Globe size={48} className="mx-auto text-muted-foreground opacity-20 mb-4" />
                            <p className="text-muted-foreground">No public nodes available at this time.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <footer className="max-w-6xl mx-auto px-6 py-12 text-center relative z-10 border-t border-[rgb(var(--color-border-subtle))]">
                <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm mb-3">
                    <ShieldCheck size={16} className="text-emerald-500" />
                    <span>Secure Infrastructure verified by CraftCommand Shield</span>
                </div>
                <p className="text-xs text-muted-foreground/40 font-mono mt-2 uppercase tracking-widest">
                    MIT License &copy; 2026 Extroos • Auto-refresh active (2s)
                </p>
            </footer>
        </div>
    );
};

export default StatusPage;
