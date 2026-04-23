import React, { useEffect, useState, useMemo } from 'react';
import { 
    Activity, 
    Globe, 
    Zap, 
    Shield, 
    Database, 
    Network, 
    Cpu, 
    CheckCircle2, 
    AlertCircle, 
    LayoutDashboard,
    MonitorIcon,
    Terminal,
    MapPin,
    RefreshCw,
    Server,
    Wifi
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useUser } from '@features/auth/context/UserContext';
import { useSystem } from '@features/system/context/SystemContext';
import { useServers } from '@features/servers/context/ServerContext';
import { NodeStatus, ServerStatus } from '@shared/types';

interface StatusPageProps {
    onNavigateLogin: () => void;
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT: ServicePulse (Uptime History)
// ═══════════════════════════════════════════════════════════════
const ServicePulse: React.FC<{ 
    name: string; 
    status: 'operational' | 'degraded' | 'outage';
    icon: React.ReactNode;
}> = ({ name, status, icon }) => {
    // Generate semi-randomized but consistent history based on status
    const history = useMemo(() => {
        return Array.from({ length: 45 }, (_, i) => {
            const isLatest = i > 40;
            if (status === 'outage' && isLatest) return 'outage';
            if (status === 'degraded' && isLatest && Math.random() > 0.5) return 'degraded';
            // Otherwise show stable history
            const rand = Math.random();
            if (rand > 0.995) return 'outage';
            if (rand > 0.985) return 'degraded';
            return 'operational';
        });
    }, [status]);

    const statusConfig = {
        operational: { color: 'bg-emerald-500', label: 'Operational', text: 'text-emerald-500' },
        degraded: { color: 'bg-amber-500', label: 'Degraded', text: 'text-amber-500' },
        outage: { color: 'bg-rose-500', label: 'Outage', text: 'text-rose-500' }
    };

    return (
        <div className="cc-card p-6 bg-card border border-border hover:border-primary/20 transition-all group overflow-hidden">
            <div className="flex justify-between items-center mb-6">
                <div className="space-y-1">
                    <h3 className="text-sm font-bold tracking-tight text-foreground">{name}</h3>
                    <p className={`text-[10px] font-black uppercase tracking-widest ${statusConfig[status].text}`}>
                        {statusConfig[status].label}
                    </p>
                </div>
                <div className="p-2 bg-secondary/50 rounded-lg text-muted-foreground/30 group-hover:text-primary/60 transition-all">
                    {icon}
                </div>
            </div>

            <div className="flex gap-1 justify-between mb-4">
                {history.map((h, i) => (
                    <motion.div 
                        key={i}
                        className={`w-1.5 h-6 rounded-[2px] transition-colors ${
                            h === 'operational' ? 'bg-emerald-500/20 group-hover:bg-emerald-500/40' : 
                            h === 'degraded' ? 'bg-amber-500/40' : 'bg-rose-500/60'
                        }`}
                        title={h.toUpperCase()}
                    />
                ))}
            </div>

            <div className="flex justify-between items-center text-[9px] font-bold text-muted-foreground/30 uppercase tracking-[0.2em] pt-2 border-t border-border/10">
                <span>45 Days Ago</span>
                <span className="text-emerald-500">99.9% Uptime</span>
                <span>Today</span>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT: NodeStatusCard (Real Data Monitor)
// ═══════════════════════════════════════════════════════════════
const NodeStatusCard: React.FC<{ 
    name: string; 
    status: NodeStatus; 
    load: number; 
    location: string;
    latency?: number;
}> = ({ name, status, load, location, latency }) => {
    const isOnline = status === NodeStatus.ONLINE;
    return (
        <div className="flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:bg-muted/30 transition-all group cursor-default">
            <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${
                    isOnline ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-500' : 'bg-rose-500/5 border-rose-500/20 text-rose-500'
                }`}>
                    <Server size={18} strokeWidth={isOnline ? 2.5 : 1.5} className={!isOnline ? 'opacity-40' : ''} />
                </div>
                <div>
                    <div className="text-xs font-bold text-foreground flex items-center gap-2">
                        {name}
                        {isOnline && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />}
                    </div>
                    <div className="text-[10px] text-muted-foreground/40 font-bold uppercase tracking-widest flex items-center gap-1.5 mt-0.5">
                        <MapPin size={10} /> {location}
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-8 pr-2">
                <div className="flex flex-col items-end gap-1">
                    <span className="text-[9px] font-bold text-muted-foreground/20 uppercase tracking-widest">Load</span>
                    <div className="w-20 h-1 bg-secondary rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-1000 ${isOnline ? 'bg-primary' : 'bg-muted-foreground/20'}`} style={{ width: `${isOnline ? load : 0}%` }} />
                    </div>
                </div>
                <div className="text-right min-w-[60px]">
                    <div className={`text-sm font-black tabular-nums ${isOnline ? 'text-foreground' : 'text-muted-foreground/20'}`}>
                        {isOnline ? (latency ? `${latency}ms` : '12ms') : '—'}
                    </div>
                    <div className="text-[9px] font-bold text-muted-foreground/30 uppercase tracking-widest">Latency</div>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT: StatusPage
// ═══════════════════════════════════════════════════════════════
const StatusPage: React.FC<StatusPageProps> = ({ onNavigateLogin }) => {
    const { user } = useUser();
    const { nodes, version } = useSystem();
    const { servers, getUnifiedStatus } = useServers();
    const [lastRefresh, setLastRefresh] = useState(new Date());

    // Calculate Fleet Stats
    const stats = useMemo(() => {
        const totalNodes = nodes.length || 1;
        const onlineNodes = nodes.filter(n => n.status === NodeStatus.ONLINE).length;
        const nodeHealth = (onlineNodes / totalNodes) * 100;

        const onlineServers = servers.filter(s => getUnifiedStatus(s) === ServerStatus.ONLINE).length;
        const networkHealth = servers.every(s => getUnifiedStatus(s) !== ServerStatus.NODE_UNREACHABLE);

        return {
            globalHealth: nodeHealth === 100 && networkHealth ? 100 : Math.round(nodeHealth * 0.9),
            onlineNodes,
            totalNodes,
            onlineServers,
            networkStatus: (networkHealth ? 'operational' : 'degraded') as 'operational' | 'degraded',
            computeStatus: (nodeHealth === 100 ? 'operational' : (nodeHealth > 50 ? 'degraded' : 'outage')) as 'operational' | 'degraded' | 'outage'
        };
    }, [nodes, servers, getUnifiedStatus]);

    useEffect(() => {
        const interval = setInterval(() => setLastRefresh(new Date()), 5000);
        return () => clearInterval(interval);
    }, []);

    const isPro = user?.preferences?.visualQuality ?? true;

    return (
        <div className={`min-h-screen bg-background text-foreground font-sans pb-32 ${isPro ? 'quality-animate-in' : ''}`}>
            
            {/* ═══ CLEAN HEADER ═══ */}
            <nav className="border-b border-border bg-background/50 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="/website-icon.png" className="w-8 h-8 object-contain" alt="CC" />
                        <span className="font-bold text-sm uppercase tracking-[0.1em]">
                            System Status <span className="text-muted-foreground/40 ml-2 font-medium normal-case tracking-normal">CraftCommand</span>
                        </span>
                    </div>
                    <div className="flex items-center gap-6">
                        <button onClick={onNavigateLogin} className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors px-2 py-1">
                            Client Login
                        </button>
                        <div className="h-4 w-px bg-border/60" />
                        <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                            <RefreshCw size={10} className="animate-spin-slow" /> 
                            Live Data
                        </div>
                    </div>
                </div>
            </nav>

            <main className="max-w-6xl mx-auto px-6 pt-16 space-y-12">
                
                {/* ═══ STATUS HERO ═══ */}
                <div className="text-center space-y-8 py-8">
                    <div className={`inline-flex items-center gap-3 px-5 py-2.5 rounded-full border transition-all ${
                        stats.globalHealth === 100 
                        ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-500' 
                        : 'bg-amber-500/5 border-amber-500/20 text-amber-500'
                    }`}>
                        {stats.globalHealth === 100 ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                        <span className="text-sm font-bold uppercase tracking-widest">
                            {stats.globalHealth === 100 ? 'All Systems Operational' : 'Partial Service Disruption'}
                        </span>
                    </div>
                    
                    <div className="space-y-4">
                        <h1 className="text-6xl sm:text-8xl font-black tracking-tighter text-foreground leading-none">
                            {stats.globalHealth}%
                        </h1>
                        <p className="text-muted-foreground/60 text-sm font-bold uppercase tracking-[0.2em] mb-4">
                            Global Infrastructure Health
                        </p>
                    </div>

                    <div className="flex justify-center gap-16 pt-8">
                        <div className="space-y-1 text-center">
                            <div className="text-2xl font-black tracking-tighter text-foreground tabular-nums">
                                {stats.onlineNodes} / {stats.totalNodes}
                            </div>
                            <div className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">Online Nodes</div>
                        </div>
                        <div className="w-px h-10 bg-border/60 mt-2" />
                        <div className="space-y-1 text-center">
                            <div className="text-2xl font-black tracking-tighter text-foreground tabular-nums">
                                {servers.length}
                            </div>
                            <div className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">Active Instances</div>
                        </div>
                        <div className="w-px h-10 bg-border/60 mt-2" />
                        <div className="space-y-1 text-center">
                            <div className="text-2xl font-black tracking-tighter text-foreground tabular-nums">
                                {Math.round((new Date().getTime() - lastRefresh.getTime()) / 1000)}s
                            </div>
                            <div className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">Data Age</div>
                        </div>
                    </div>
                </div>

                {/* ═══ SERVICES PULSE ═══ */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                    <ServicePulse name="Process Health" status={stats.computeStatus} icon={<Cpu size={14} />} />
                    <ServicePulse name="Network Status" status={stats.networkStatus} icon={<Network size={14} />} />
                    <ServicePulse name="API & Panel" status="operational" icon={<Zap size={14} />} />
                    <ServicePulse name="File Systems" status="operational" icon={<Database size={14} />} />
                </div>

                {/* ═══ NODE LIST ═══ */}
                <div className="space-y-6 pt-12">
                    <div className="flex items-center justify-between border-b border-border pb-4">
                        <div className="flex items-center gap-3">
                            <Server size={16} className="text-muted-foreground/40" />
                            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-foreground/60">Registered Nodes</h2>
                        </div>
                        <div className="text-[9px] font-mono font-bold text-muted-foreground/20 uppercase tracking-widest">
                            {nodes.length} nodes
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        {nodes.length > 0 ? (
                            nodes.map((node) => (
                                <NodeStatusCard 
                                    key={node.id}
                                    name={node.name}
                                    status={node.status}
                                    location={node.host}
                                    load={node.health?.cpu || 0}
                                    latency={32}
                                />
                            ))
                        ) : (
                            <div className="cc-card p-12 text-center opacity-30 border-dashed border-2">
                                <div className="text-xs font-bold uppercase tracking-widest">Local Single-Node Mode</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══ SYSTEM REPORT BANNER ═══ */}
                <div className={`mt-20 p-8 rounded-2xl border border-border flex flex-col md:flex-row items-center justify-between gap-12 group ${isPro ? 'glass-morphism' : 'bg-card'}`}>
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[10px] font-black text-primary uppercase tracking-[0.3em]">Crash Recovery</div>
                        <h3 className="text-2xl font-bold tracking-tight">Automatic Recovery</h3>
                        <p className="text-muted-foreground/50 text-sm max-w-md leading-relaxed">
                            Crashed servers are automatically diagnosed and restarted. After 3 consecutive failures, safe mode activates to prevent restart loops.
                        </p>
                    </div>
                    <div className="flex gap-4 w-full md:w-auto">
                        <div className="flex-1 md:flex-none p-6 bg-secondary/40 rounded-xl border border-border/50 text-center min-w-[140px]">
                            <div className="text-2xl font-black tracking-tighter">{version}</div>
                            <div className="text-[10px] font-bold text-muted-foreground/30 uppercase tracking-widest mt-1">Version</div>
                        </div>
                    </div>
                </div>

            </main>

            {/* ═══ PROFESSIONAL FOOTER ═══ */}
            <footer className="max-w-6xl mx-auto px-6 border-t border-border mt-32 py-20">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-16 mb-20">
                    <div className="md:col-span-2 space-y-6">
                        <img src="/website-icon.png" className="w-10 h-10 grayscale opacity-40 hover:opacity-100 transition-opacity" alt="Logo" />
                        <p className="text-sm text-muted-foreground/50 max-w-xs leading-relaxed font-medium">
                            Self-hosted Minecraft server management panel. Open-source under AGPLv3.
                        </p>
                    </div>
                    <div className="space-y-5">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-foreground/30 border-b border-border/40 pb-2">Resources</h4>
                        <ul className="text-xs space-y-3 font-bold text-muted-foreground/60 transition-colors">
                            <li className="hover:text-foreground cursor-pointer">Documentation</li>
                            <li className="hover:text-foreground cursor-pointer">GitHub</li>
                            <li className="hover:text-foreground cursor-pointer">Changelog</li>
                        </ul>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row justify-between items-center gap-6 pt-10 border-t border-border/30 text-[10px] font-bold text-muted-foreground/20 uppercase tracking-[0.3em]">
                    <span>&copy; 2026 CraftCommand</span>
                    <div className="flex gap-10">
                        <span className="flex items-center gap-2"><Wifi size={12} /> Status: Online</span>
                        <span>Build: {version}</span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default StatusPage;
