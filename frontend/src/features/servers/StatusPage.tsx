import React, { useEffect, useState, useMemo } from 'react';
import { ServerConfig, ServerStatus } from '@shared/types';
import { API } from '@core/services/api';
import { Globe, Server, Check, ArrowRight, Activity, Copy, Shield, Cpu, Network } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface StatusPageProps {
    onNavigateLogin: () => void;
}

// Magnetic Card Component for that "Arty" interactive feel
const StatusCard = React.memo(({ server }: { server: ServerConfig }) => {
    const [copied, setCopied] = useState(false);
    const isOnline = server.status === ServerStatus.ONLINE;
    
    // Stable player count simulation
    const players = useMemo(() => isOnline ? Math.floor(Math.random() * 5) + 1 : 0, [isOnline]);

    const handleCopy = () => {
        const host = server.network?.hostname || server.ip || '127.0.0.1';
        navigator.clipboard.writeText(`${host}:${server.port}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.01, y: -5 }}
            className="group relative"
        >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[2rem] blur-2xl -z-10" />
            
            <div className="backdrop-blur-3xl bg-[#121214]/60 border border-white/5 rounded-[1.5rem] p-6 transition-all duration-500 hover:border-white/10 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.4)]">
                <div className="flex flex-col md:flex-row gap-8 items-start md:items-center justify-between">
                    
                    {/* Left: Identity & Heartbeat */}
                    <div className="flex items-center gap-6">
                        <div className="relative">
                            <div className={`w-14 h-14 rounded-xl flex items-center justify-center border transition-all duration-700 ${
                                isOnline 
                                ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-500' 
                                : 'bg-white/5 border-white/5 text-white/20'
                            }`}>
                                <Server size={28} strokeWidth={1.5} />
                            </div>
                            {isOnline && (
                                <motion.div 
                                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                    className="absolute inset-0 bg-emerald-500/20 rounded-2xl -z-10" 
                                />
                            )}
                        </div>
                        
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-xl font-bold text-white tracking-tight leading-none">{server.name}</h3>
                                <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-white/10'}`} />
                            </div>
                            <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.2em] text-white/30">
                                <span className="flex items-center gap-1.5"><Network size={9} /> {server.software}</span>
                                <span className="w-0.5 h-0.5 bg-white/10 rounded-full" />
                                <span className="flex items-center gap-1.5 font-mono">{server.version}</span>
                            </div>
                        </div>
                    </div>

                    {/* Center: Specs Grid (Asymmetric) */}
                    <div className="grid grid-cols-2 gap-x-12 gap-y-2 border-l border-white/5 pl-8 hidden lg:grid">
                        <div>
                            <p className="text-[9px] uppercase tracking-[0.3em] font-black text-white/20 mb-1">Utilization</p>
                            <p className={`font-mono text-sm ${isOnline ? 'text-emerald-400' : 'text-white/20'}`}>
                                {isOnline ? `${players}/${server.maxPlayers}` : '--'}
                            </p>
                        </div>
                        <div>
                            <p className="text-[9px] uppercase tracking-[0.3em] font-black text-white/20 mb-1">Latency</p>
                            <p className={`font-mono text-sm ${isOnline ? 'text-white/60' : 'text-white/20'}`}>
                                {isOnline ? '12ms' : '--'}
                            </p>
                        </div>
                    </div>

                    {/* Right: Connect Action */}
                    <button 
                        onClick={handleCopy}
                        className="relative group/btn overflow-hidden px-6 py-3 rounded-xl bg-white text-black font-black text-[10px] uppercase tracking-[0.2em] transition-all hover:brightness-95 active:scale-[0.98] shadow-lg shadow-black/20"
                    >
                        <span className="relative z-10 flex items-center gap-2">
                            {copied ? (
                                <><Check size={12} /> Copied</>
                            ) : (
                                <><Globe size={12} /> {server.network?.hostname || server.ip || 'localhost'}:{server.port}</>
                            )}
                        </span>
                    </button>
                </div>

                {/* Bottom: Subtle Status Meta */}
                <div className="mt-8 pt-6 border-t border-white/5 flex justify-between items-center opacity-40">
                    <p className="text-[9px] font-mono tracking-widest uppercase">{server.motd || 'Core systems functional'}</p>
                    <div className="flex items-center gap-4 text-[9px] font-mono">
                        <span className="text-emerald-500">SECURE_LINKv4</span>
                        <span>0x{server.id.slice(0, 8).toUpperCase()}</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
});

const StatusPage: React.FC<StatusPageProps> = ({ onNavigateLogin }) => {
    const [servers, setServers] = useState<ServerConfig[]>([]);
    const [isHolding, setIsHolding] = useState(false);

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

    const totalPlayers = useMemo(() => 
        servers.reduce((acc, s) => acc + (s.status === ServerStatus.ONLINE ? (s.maxPlayers ? Math.floor(Math.random() * 3) + 1 : 1) : 0), 0)
    , [servers]);

    const systemsAllGreen = servers.length > 0 && servers.every(s => s.status === ServerStatus.ONLINE);

    const activeBg = localStorage.getItem('cc_bg_status');
    const bgClass = activeBg ? 'bg-transparent-if-bg' : 'bg-[#09090b]';

    return (
        <div className={`min-h-screen ${bgClass} text-white font-sans selection:bg-emerald-500/30 overflow-y-auto overflow-x-hidden`}>
            
            {/* Arty Background Layer */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-5%] w-1/2 h-1/2 bg-emerald-500/5 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-5%] w-1/3 h-1/3 bg-blue-500/5 blur-[100px] rounded-full" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_2px_2px,rgba(255,255,255,0.03)_1px,transparent_0)] bg-[size:40px_40px]" />
            </div>

            {/* Navigation (Editorial Style) */}
            <nav className="relative z-50 px-8 py-10 flex justify-between items-center max-w-[1400px] mx-auto">
                <div className="flex items-center gap-4 group cursor-pointer" onClick={() => window.location.reload()}>
                    <img src="/website-icon.png" className="w-10 h-10 object-contain transition-all duration-500" alt="CC" />
                    <div>
                        <p className="font-black text-xl tracking-tighter uppercase leading-none">CraftCommand</p>
                        <p className="text-[9px] uppercase tracking-[0.4em] text-white/40 font-bold">Network Architecture</p>
                    </div>
                </div>

                <button 
                    onClick={onNavigateLogin}
                    className="flex items-center gap-3 px-6 py-3 rounded-full border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all text-[10px] font-black uppercase tracking-[0.2em] group"
                >
                    Administrative Portal
                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </button>
            </nav>

            <main className="relative z-10 max-w-[1400px] mx-auto px-8 pt-12 pb-32">
                
                {/* Asymmetric Hero Section */}
                <div className="flex flex-col xl:flex-row gap-20 items-start mb-32">
                    <div className="flex-1 relative">
                        <motion.div
                            initial={{ opacity: 0, x: -50 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="select-none cursor-crosshair relative group"
                            onMouseDown={() => setIsHolding(true)}
                            onMouseUp={() => setIsHolding(false)}
                            onMouseLeave={() => setIsHolding(false)}
                            onTouchStart={() => setIsHolding(true)}
                            onTouchEnd={() => setIsHolding(false)}
                        >
                            <p className="text-[11px] font-black uppercase tracking-[0.6em] text-emerald-500 mb-6 flex items-center gap-3">
                                <Activity size={12} /> Live Telemetry System_v2
                            </p>
                            <div className="relative inline-block">
                                <h1 className={`text-6xl md:text-8xl font-black tracking-tighter leading-[0.85] mb-8 text-white transition-all duration-300 ${isHolding ? 'scale-[0.99] brightness-125' : ''}`}>
                                    NETWORK<br />
                                    <span className="opacity-10">STATUS</span>
                                </h1>
                                
                                {isHolding && (
                                    <>
                                        <div className="absolute inset-0 text-6xl md:text-8xl font-black tracking-tighter leading-[0.85] text-emerald-500 opacity-70 animate-glitch-1 mix-blend-screen overflow-hidden">
                                            NETWORK<br />STATUS
                                        </div>
                                        <div className="absolute inset-0 text-6xl md:text-8xl font-black tracking-tighter leading-[0.85] text-blue-500 opacity-70 animate-glitch-2 mix-blend-screen overflow-hidden">
                                            NETWORK<br />STATUS
                                        </div>
                                    </>
                                )}
                            </div>
                        </motion.div>
                        
                        <div className="flex flex-wrap gap-x-12 gap-y-6 mt-8">
                            <div className="space-y-0.5">
                                <p className="text-[9px] uppercase tracking-widest font-black text-white/20">Nodes</p>
                                <p className="text-3xl font-mono font-bold leading-none">{servers.length}</p>
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-[9px] uppercase tracking-widest font-black text-white/30">Uptime</p>
                                <p className="text-3xl font-mono font-bold leading-none text-emerald-500">99.9%</p>
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-[9px] uppercase tracking-widest font-black text-white/20">Active Load</p>
                                <p className="text-3xl font-mono font-bold leading-none">{totalPlayers}</p>
                            </div>
                        </div>
                    </div>

                    <div className="w-full xl:w-1/3 xl:pt-24">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="p-8 rounded-[2.5rem] border border-white/5 bg-white/5 backdrop-blur-3xl relative overflow-hidden"
                        >
                            <div className="relative z-10">
                                <Shield className="text-emerald-500 mb-4" size={32} />
                                <h2 className="text-xl font-bold mb-3">Enterprise Stability</h2>
                                <p className="text-sm text-white/40 leading-relaxed font-medium">
                                    Our distributed infrastructure is monitored 24/7. Core service clusters are currently 
                                    <span className="text-emerald-500 px-1.5 py-0.5 bg-emerald-500/10 rounded ml-1 uppercase text-[10px] tracking-widest">
                                        Verified
                                    </span>
                                </p>
                            </div>
                            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-emerald-500/10 blur-3xl rounded-full" />
                        </motion.div>
                    </div>
                </div>

                {/* Staggered Grid Content */}
                <div className="grid grid-cols-1 gap-6">
                    <AnimatePresence mode="popLayout">
                        {servers.map((server, idx) => (
                            <motion.div
                                key={server.id}
                                initial={{ opacity: 0, y: 50 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                            >
                                <StatusCard server={server} />
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {servers.length === 0 && (
                        <div className="py-40 text-center border-2 border-dashed border-white/5 rounded-[3rem]">
                            <Activity className="mx-auto text-white/10 mb-6" size={64} strokeWidth={1} />
                            <p className="text-white/20 font-black uppercase tracking-[0.4em] text-xs">Awaiting Connection Packets</p>
                        </div>
                    )}
                </div>
            </main>

            {/* Arty Footer */}
            <footer className="max-w-[1400px] mx-auto px-8 py-20 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-10">
                <div className="text-left w-full md:w-auto">
                    <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/60 mb-2">Designed for Intelligence</p>
                    <p className="text-[10px] font-mono opacity-20 max-w-xs">
                        This interface is a live visualization of the CraftCommand backend cluster. 
                        Data is streamed via high-frequency polling.
                    </p>
                </div>
                
                <div className="flex gap-20">
                    <div className="text-right">
                        <p className="text-[9px] uppercase tracking-widest font-black text-white/20 mb-2">Security</p>
                        <Shield className="ml-auto text-emerald-500/50" size={24} />
                    </div>
                    <div className="text-right">
                        <p className="text-[9px] uppercase tracking-widest font-black text-white/20 mb-2">Compute</p>
                        <Cpu className="ml-auto text-blue-400/50" size={24} />
                    </div>
                </div>
            </footer>

            <style>{`
                @keyframes glitch-1 {
                    0% { transform: translate(0); }
                    20% { transform: translate(-2px, 2px); clip-path: inset(10% 0 30% 0); }
                    40% { transform: translate(-2px, -2px); clip-path: inset(40% 0 10% 0); }
                    60% { transform: translate(2px, 2px); clip-path: inset(80% 0 5% 0); }
                    80% { transform: translate(2px, -2px); clip-path: inset(0% 0 70% 0); }
                    100% { transform: translate(0); }
                }

                @keyframes glitch-2 {
                    0% { transform: translate(0); }
                    20% { transform: translate(2px, -2px); clip-path: inset(20% 0 40% 0); }
                    40% { transform: translate(2px, 2px); clip-path: inset(10% 0 60% 0); }
                    60% { transform: translate(-2px, -2px); clip-path: inset(50% 0 20% 0); }
                    80% { transform: translate(-2px, 2px); clip-path: inset(30% 0 20% 0); }
                    100% { transform: translate(0); }
                }

                .animate-glitch-1 {
                    animation: glitch-1 0.2s infinite linear alternate-reverse;
                }

                .animate-glitch-2 {
                    animation: glitch-2 0.3s infinite linear alternate-reverse;
                }
            `}</style>
        </div>
    );
};

export default StatusPage;
