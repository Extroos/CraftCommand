
import React, { useState, useEffect } from 'react';
import { 
    Activity, Cpu, Network, Users, Copy, Check, Info, 
    Zap, Globe, Terminal, Link2, ShieldCheck, Download,
    Power, RotateCcw, Ban, Settings2, Sparkles, Clock,
    Plus, X, RotateCw, Loader2, Server
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ServerStatus, ServerConfig } from '@shared/types';
import { useServers } from '@features/servers/context/ServerContext';
import { useUser } from '@features/auth/context/UserContext';
import { useToast } from '@features/ui/Toast';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '@features/auth/hooks/usePermissions';
import { API } from '@core/services/api';
import ProxyNetworkManager from '../network/ProxyNetworkManager';

interface VelocityDashboardProps {
    serverId: string;
}

const TopologyCard = React.memo(({ server, servers, setViewMode }: { server: any, servers: any[], setViewMode: (mode: any) => void }) => {
    const { t } = useTranslation();
    return (
        <div className={`p-8 border border-border rounded-2xl transition-all duration-300 bg-card shadow-sm`}>
            <div className="flex items-center gap-5 mb-8">
                <div className="text-muted-foreground/30">
                    <Network size={18} strokeWidth={1.5} />
                </div>
                <div>
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">{t('velocity.topology')}</h3>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{t('velocity.infra_connectivity')}</p>
                </div>
            </div>

            <div className="space-y-4">
                  {server.network?.proxyConfig?.links.length === 0 ? (
                     <div className="py-12 border border-dashed border-border rounded-xl text-center flex flex-col items-center">
                         <div className="p-3 bg-muted rounded-full mb-4 text-muted-foreground/20">
                             <Link2 size={24} strokeWidth={1} />
                         </div>
                         <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">{t('velocity.no_infra')}</p>
                     </div>
                 ) : (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                         {server.network?.proxyConfig?.links.slice(0, 4).map((link: any) => {
                              const backend = servers.find(s => s.id === link.serverId);
                              return (
                                 <div key={link.serverId} className="p-4 border border-border rounded-xl bg-muted/30 flex items-center justify-between group hover:bg-muted/50 transition-colors">
                                     <div className="flex items-center gap-4">
                                         <div className={`w-1.5 h-1.5 rounded-full ${backend?.status === 'ONLINE' ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                                         <div>
                                             <div className="text-xs font-bold text-foreground">{link.alias}</div>
                                             <div className="text-[9px] text-muted-foreground font-mono tracking-tighter mt-0.5">{backend?.ip === '127.0.0.1' ? t('common.internal') : backend?.ip}</div>
                                         </div>
                                     </div>
                                     <div className="flex items-center gap-3">
                                         <div className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">{backend?.software || 'Minecraft'}</div>
                                         <div className="p-1.5 rounded-lg text-muted-foreground/20 group-hover:text-muted-foreground/40 transition-colors">
                                             {(backend?.status === ServerStatus.STARTING || backend?.status === ServerStatus.STOPPING || backend?.status === ServerStatus.RESTARTING) ? 
                                             <RotateCw size={12} className="animate-spin text-amber-500" /> : 
                                             <Settings2 size={12} />}
                                         </div>
                                     </div>
                                 </div>
                              );
                         })}
                     </div>
                 )}
                 {server.network?.proxyConfig?.links.length > 4 && (
                     <div className="text-center pt-6">
                         <button 
                            onClick={() => setViewMode('NETWORK')}
                            className="text-[10px] font-bold text-foreground/40 hover:text-foreground transition-colors tracking-[0.2em] uppercase"
                         >
                             {t('velocity.additional_assets', { count: server.network.proxyConfig.links.length - 4 })}
                         </button>
                     </div>
                 )}
            </div>
        </div>
    );
});

const VelocityDashboard: React.FC<VelocityDashboardProps> = ({ serverId }) => {
    const { servers, stats: allStats, refreshServers, updateServerStatus } = useServers();
    const { t } = useTranslation();
    const { user } = useUser();
    const { can } = usePermissions();
    const { addToast } = useToast();
    const server = servers.find(s => s.id === serverId);
    const stats = allStats[serverId] || { cpu: 0, memory: 0, uptime: 0, players: 0, playerList: [], isRealOnline: false };
    
    const [copied, setCopied] = useState(false);
    const [viewMode, setViewMode] = useState<'OVERVIEW' | 'NETWORK'>('OVERVIEW');
    
    // Modal & Action State
    const [isLinking, setIsLinking] = useState(false);
    const [selectedBackendId, setSelectedBackendId] = useState('');
    const [alias, setAlias] = useState('');
    const [loading, setLoading] = useState(false);
    const [installingSuite, setInstallingSuite] = useState(false);
    const [pendingAction, setPendingAction] = useState<'start' | 'stop' | 'restart' | null>(null);
    const [powerConfirm, setPowerConfirm] = useState<{ action: 'stop' | 'restart', isOpen: boolean }>({ action: 'stop', isOpen: false });
    const [showGraceful, setShowGraceful] = useState(false);
    const [gracefulCountdown, setGracefulCountdown] = useState(30);

    // List of servers NOT already linked
    const availableBackends = React.useMemo(() => {
        if (!server) return [];
        const linkedIds = server.network?.proxyConfig?.links.map(l => l.serverId) || [];
        return servers.filter(s => s.id !== serverId && !linkedIds.includes(s.id) && s.software !== 'Velocity');
    }, [servers, server, serverId]);

    const handleCopyIp = () => {
        const ip = (server.ip && server.ip !== '127.0.0.1') ? server.ip : window.location.hostname;
        navigator.clipboard.writeText(`${ip}:${server.port}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handlePower = async (action: 'start' | 'restart' | 'stop') => {
        if (action === 'start' && !can('server.start', serverId)) return;
        if (action === 'stop' && !can('server.stop', serverId)) return;
        if (action === 'restart' && !can('server.restart', serverId)) return;

        if (action === 'stop' && stats.players > 0) {
            setShowGraceful(true);
            return;
        }

        if (action === 'restart' && stats.players > 0) {
            setPowerConfirm({ action, isOpen: true });
            return;
        }

        await executePowerAction(action);
    };

    const executePowerAction = async (action: 'start' | 'stop' | 'restart') => {
        setPendingAction(action);
        const originalStatus = (server?.status || ServerStatus.ONLINE) as ServerStatus;
        
        try {
            if (action === 'start') {
                updateServerStatus(serverId, ServerStatus.STARTING);
                await API.startServer(serverId);
            } else if (action === 'stop') {
                updateServerStatus(serverId, ServerStatus.STOPPING);
                await API.stopServer(serverId);
            } else {
                updateServerStatus(serverId, ServerStatus.STOPPING);
                await API.stopServer(serverId);
                
                let attempts = 0;
                while (attempts < 10) {
                     const currentServer = servers.find(s => s.id === serverId);
                     if (currentServer?.status === 'OFFLINE') break;
                     await new Promise(r => setTimeout(r, 500));
                     attempts++;
                }

                updateServerStatus(serverId, ServerStatus.STARTING);
                await API.startServer(serverId);
            }
            addToast('success', t('dashboard.power_command_sent'), t('velocity.proxy_power_initiated', { action }));
        } catch (e: any) {
            updateServerStatus(serverId, originalStatus);
            addToast('error', t('dashboard.power_action_failed'), e.message);
        } finally {
            setPendingAction(null);
            setPowerConfirm({ action: 'stop', isOpen: false });
        }
    };

    const handleGracefulStop = async () => {
        setPendingAction('stop');
        setShowGraceful(false);
        try {
            updateServerStatus(serverId, ServerStatus.STOPPING);
            await API.gracefulStopServer(serverId, gracefulCountdown);
            addToast('info', t('console.graceful'), t('velocity.drain_desc', { count: gracefulCountdown }));
        } catch (e: any) {
            updateServerStatus(serverId, (server?.status || 'ONLINE') as ServerStatus);
            addToast('error', t('dashboard.power_action_failed'), e.message);
        } finally {
            setPendingAction(null);
        }
    };

    const handleLink = async () => {
        if (!selectedBackendId || !alias) return;
        if (!can('server.proxy.manage', serverId)) return;
        setLoading(true);
        try {
            await API.linkServerToProxy(serverId, selectedBackendId, alias);
            addToast('success', t('velocity.link_success'), t('velocity.link_success_desc', { alias }));
            await refreshServers();
            setIsLinking(false);
            setSelectedBackendId('');
            setAlias('');
        } catch (e: any) {
            addToast('error', t('velocity.link_failed'), e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleInstallViaSuite = async () => {
        if (!can('server.plugins.manage', serverId)) return;
        setInstallingSuite(true);
        try {
            await API.installViaSuite(serverId);
            addToast('success', t('velocity.via_suite_success'), t('velocity.via_suite_desc'));
        } catch (e: any) {
            addToast('error', t('dashboard.power_action_failed'), e.message);
        } finally {
            setInstallingSuite(false);
        }
    };

    const formatUptime = (seconds: number) => {
        const isProcessActive = server?.status === ServerStatus.ONLINE || server?.status === ServerStatus.STARTING;
        if (!isProcessActive) return "--:--:--";
        if (!seconds) return "00:00:00";
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto pb-20">
            {/* Premium Proxy Hero Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className={`lg:col-span-2 p-8 rounded-2xl border border-border relative overflow-hidden flex flex-col justify-center min-h-[180px] transition-all duration-500 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card shadow-sm'}`}>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${server.status === 'ONLINE' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-foreground/20'}`} />
                                    <span className={`text-[10px] font-bold tracking-[0.2em] ${server.status === 'ONLINE' ? 'text-emerald-500' : 'text-foreground/40'} uppercase`}>
                                        {t(`dashboard.${server.status.toLowerCase()}`)}
                                    </span>
                                </div>
                                <div className="h-4 w-px bg-border" />
                                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
                                    {server.executionEngine === 'docker' ? t('common.docker').toUpperCase() : t('common.native').toUpperCase()} • {server.software} <span className="text-muted-foreground/30 mx-1">/</span> {server.version}
                                </div>
                            </div>

                            <div>
                                <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">{server.name}</h1>
                                <button 
                                    onClick={handleCopyIp}
                                    className="flex items-center gap-2 transition-opacity hover:opacity-70 group/ip"
                                >
                                    <span className="font-mono text-xs text-muted-foreground group-hover/ip:text-foreground transition-colors">
                                        {(server.ip && server.ip !== '127.0.0.1') ? server.ip : t('common.internal').toLowerCase()}:{server.port}
                                    </span>
                                    {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={10} className="text-muted-foreground/40 group-hover/ip:text-foreground/60" />}
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 w-full md:w-auto">
                            <div className="flex gap-2 w-full md:w-auto">
                                <button 
                                    onClick={() => handlePower('start')}
                                    disabled={server.status === 'ONLINE' || (server.network?.proxyConfig?.links.length === 0) || !!pendingAction || !can('server.start', serverId)}
                                    className={`h-11 px-6 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all ${
                                        (server.status === 'ONLINE' || server.network?.proxyConfig?.links.length === 0 || !!pendingAction || !can('server.start', serverId)) 
                                        ? 'bg-muted text-muted-foreground cursor-not-allowed border border-border' 
                                        : 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 shadow-sm border border-emerald-500'}`}
                                >
                                    {pendingAction === 'start' ? <RotateCw size={14} className="animate-spin" /> : t('common.start').toUpperCase()}
                                </button>
                                <button 
                                    onClick={() => handlePower('restart')}
                                    disabled={server.status === 'OFFLINE' || (server.network?.proxyConfig?.links.length === 0) || !!pendingAction || !can('server.restart', serverId)}
                                    className="w-11 h-11 flex items-center justify-center bg-foreground/[0.04] border border-foreground/5 text-foreground hover:bg-foreground/[0.08] rounded-xl transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                                >
                                    <RotateCcw size={16} className={pendingAction === 'restart' ? "animate-spin" : "opacity-40"} />
                                </button>
                                <button 
                                    onClick={() => handlePower('stop')}
                                    disabled={server.status === 'OFFLINE' || !!pendingAction || !can('server.stop', serverId)}
                                    className={`h-11 px-6 rounded-xl font-bold text-[10px] uppercase tracking-widest border transition-all ${server.status === 'OFFLINE' || !!pendingAction || !can('server.stop', serverId) ? 'bg-muted text-muted-foreground cursor-not-allowed border-border' : 'bg-rose-600 text-white border-rose-500 hover:bg-rose-700 shadow-sm'}`}
                                >
                                    {pendingAction === 'stop' ? <RotateCw size={14} className="animate-spin" /> : t('common.stop').toUpperCase()}
                                </button>
                            </div>
                            
                            {server.network?.proxyConfig?.links.length === 0 && (
                                <div className="flex items-center gap-2 text-[9px] font-bold text-amber-500/60 uppercase tracking-widest">
                                    <Info size={10} />
                                    <span>{t('velocity.add_backends_warning')}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className={`p-8 rounded-2xl border border-border flex flex-col justify-center min-h-[180px] transition-all duration-500 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card shadow-sm'}`}>
                    <div className="text-muted-foreground flex items-center gap-2 mb-4">
                        <Clock size={16} />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">{t('dashboard.uptime')}</span>
                    </div>
                    <div>
                        <div className="text-4xl font-bold text-foreground tracking-tighter tabular-nums mb-1">
                            {formatUptime(stats.uptime)}
                        </div>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-[0.15em]">{t('velocity.stable_engine_runtime')}</p>
                    </div>
                </div>
            </div>

            {/* Sub-navigation for specialized views */}
            <div className="flex p-1 bg-foreground/[0.02] border border-foreground/5 rounded-2xl w-fit">
                <button 
                    onClick={() => setViewMode('OVERVIEW')}
                    className={`px-8 py-2.5 rounded-xl text-[10px] font-bold tracking-[0.2em] transition-all ${viewMode === 'OVERVIEW' ? 'bg-foreground text-background shadow-lg shadow-foreground/5' : 'text-foreground/40 hover:text-foreground/60'}`}
                >
                    {t('common.overview').toUpperCase()}
                </button>
                <button 
                    onClick={() => setViewMode('NETWORK')}
                    className={`px-8 py-2.5 rounded-xl text-[10px] font-bold tracking-[0.2em] transition-all ${viewMode === 'NETWORK' ? 'bg-foreground text-background shadow-lg shadow-foreground/5' : 'text-foreground/40 hover:text-foreground/60'}`}
                >
                    {t('velocity.infra_layer').toUpperCase()}
                </button>
            </div>

            <AnimatePresence mode="wait">
                {viewMode === 'OVERVIEW' ? (
                    <motion.div 
                        key="overview"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
                    >
                        {/* Minimalist Stats Grid */}
                        <div className={`p-6 rounded-xl border border-border flex items-center gap-5 transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card shadow-sm'}`}>
                            <div className="text-muted-foreground/40">
                                <Cpu size={22} strokeWidth={1.5} />
                            </div>
                            <div>
                                <div className="text-xl font-bold text-foreground tracking-tight">{Math.round(stats.cpu)}%</div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">{t('advanced_dashboard.cpu_vitals')}</div>
                            </div>
                        </div>

                        <div className={`p-6 rounded-xl border border-border flex items-center gap-5 transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card shadow-sm'}`}>
                            <div className="text-muted-foreground/40">
                                <Activity size={22} strokeWidth={1.5} />
                            </div>
                            <div>
                                <div className="text-xl font-bold text-foreground tracking-tight">{Math.round(stats.memory)}<span className="text-[9px] ml-1 opacity-40 font-bold uppercase tracking-widest">mb</span></div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">{t('dashboard.memory')}</div>
                            </div>
                        </div>

                        <div className={`p-6 rounded-xl border border-border flex items-center gap-5 transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card shadow-sm'}`}>
                            <div className="text-muted-foreground/40">
                                <Users size={22} strokeWidth={1.5} />
                            </div>
                            <div>
                                <div className="text-xl font-bold text-foreground tracking-tight">{stats.players || 0}</div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">{t('dashboard.players')}</div>
                            </div>
                        </div>

                        <div className={`p-6 rounded-xl border border-border flex items-center gap-5 transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card shadow-sm'}`}>
                            <div className="text-muted-foreground/40">
                                <Network size={22} strokeWidth={1.5} />
                            </div>
                            <div>
                                <div className="text-xl font-bold text-foreground tracking-tight">
                                    {server.network?.proxyConfig?.links.length || 0}
                                </div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">{t('velocity.connected_assets')}</div>
                            </div>
                        </div>

                        <div className="lg:col-span-3 space-y-4">
                                <TopologyCard server={server} servers={servers} setViewMode={setViewMode} />
                        </div>

                        <div className="space-y-4">
                            <div className={`p-8 border border-border rounded-2xl transition-all duration-300 flex flex-col ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card shadow-sm'}`}>
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="text-muted-foreground/30">
                                        <Sparkles size={16} strokeWidth={1.5} />
                                    </div>
                                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">{t('common.actions')}</h3>
                                </div>

                                <div className="space-y-2 flex-1">
                                    <button 
                                        onClick={() => setIsLinking(true)}
                                        disabled={!can('server.proxy.manage', serverId)}
                                        className="w-full flex items-center justify-between p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-all group disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <div className="flex items-center gap-4">
                                            <Plus size={14} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                                            <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground uppercase tracking-widest">{t('velocity.link_asset')}</span>
                                        </div>
                                        <div className="w-1.5 h-1.5 rounded-full bg-border" />
                                    </button>

                                    <button 
                                        onClick={handleInstallViaSuite}
                                        disabled={installingSuite || !can('server.plugins.manage', serverId)}
                                        className="w-full flex items-center justify-between p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-all group disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <div className="flex items-center gap-4">
                                            <Zap size={14} className={`text-muted-foreground group-hover:text-foreground transition-colors ${installingSuite ? 'animate-spin' : ''}`} />
                                            <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground uppercase tracking-widest">{t('velocity.via_suite')}</span>
                                        </div>
                                        <div className="w-1.5 h-1.5 rounded-full bg-border" />
                                    </button>

                                    <div className="mt-8">
                                        <div className="p-4 border border-border bg-muted/10 rounded-xl">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
                                                <span className="text-[8px] font-bold text-emerald-500/80 uppercase tracking-[0.2em]">{t('velocity.security_protocol')}</span>
                                            </div>
                                            <p className="text-[9px] leading-relaxed text-muted-foreground/60 uppercase tracking-wider font-medium">
                                                {t('velocity.security_desc')}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div 
                        key="network"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                    >
                        <ProxyNetworkManager serverId={serverId} />
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isLinking && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 text-left">
                        <motion.div 
                            initial={{ opacity: 0, y: 40 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 40 }}
                            className="bg-card border border-border rounded-[32px] shadow-2xl w-full max-w-xl overflow-hidden"
                        >
                            <div className="p-10 pb-6 flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-3 text-muted-foreground/30 mb-4">
                                        <Link2 size={16} strokeWidth={1.5} />
                                        <span className="text-[10px] font-bold uppercase tracking-[0.3em]">{t('velocity.infra_layer')}</span>
                                    </div>
                                    <h3 className="text-3xl font-bold text-foreground tracking-tight">{t('velocity.add_link')}</h3>
                                </div>
                                <button onClick={() => setIsLinking(false)} className="p-2 bg-muted hover:bg-muted/80 rounded-xl transition-all text-muted-foreground/40 hover:text-foreground">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-10 pt-0 space-y-8">
                                <div>
                                    <label className="text-[10px] font-bold text-muted-foreground/30 uppercase tracking-[0.2em] mb-4 block">
                                        {t('velocity.available_instances')}
                                    </label>
                                    {availableBackends.length === 0 ? (
                                        <div className="p-5 border border-border bg-muted/20 rounded-2xl text-muted-foreground text-xs flex items-center gap-4">
                                            <Info size={16} />
                                            <span>{t('velocity.no_instances')}</span>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                            {availableBackends.map(s => (
                                                <button
                                                    key={s.id}
                                                    onClick={() => setSelectedBackendId(s.id)}
                                                    className={`p-4 rounded-xl border text-left transition-all ${
                                                        selectedBackendId === s.id 
                                                        ? 'bg-primary text-primary-foreground border-primary' 
                                                        : 'bg-muted/20 hover:bg-muted/40 border-border text-muted-foreground hover:text-foreground'
                                                    }`}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-1.5 h-1.5 rounded-full ${s.status === 'ONLINE' ? (selectedBackendId === s.id ? 'bg-primary-foreground' : 'bg-emerald-500') : 'bg-zinc-800'}`} />
                                                            <span className="text-sm font-bold">{s.name}</span>
                                                        </div>
                                                        <span className={`text-[9px] font-bold uppercase tracking-widest ${selectedBackendId === s.id ? 'opacity-60' : 'opacity-30'}`}>{s.software}</span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-muted-foreground/30 uppercase tracking-[0.2em] mb-4 block">
                                        {t('velocity.asset_alias')}
                                    </label>
                                    <input 
                                        type="text" 
                                        placeholder={t('velocity.alias_placeholder')}
                                        value={alias}
                                        onChange={(e) => setAlias(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                                        className="w-full bg-muted/20 border border-border rounded-xl px-5 py-4 text-sm text-foreground focus:border-primary/50 outline-none transition-all font-bold placeholder:text-muted-foreground/20"
                                    />
                                </div>

                                <div className="p-5 border border-border bg-muted/10 rounded-xl flex gap-4 items-start">
                                    <ShieldCheck size={18} className="text-muted-foreground/30 shrink-0 mt-0.5" />
                                    <p className="text-[10px] text-muted-foreground leading-relaxed uppercase tracking-widest font-medium">
                                        {t('velocity.config_sync_notice')}
                                    </p>
                                </div>

                                <div className="flex flex-col md:flex-row gap-3 pt-2">
                                    <button 
                                        onClick={handleLink}
                                        disabled={!selectedBackendId || !alias || loading}
                                        className={`
                                            flex-1 h-12 rounded-xl font-bold text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3
                                            ${(!selectedBackendId || !alias || loading) 
                                                ? 'bg-muted text-muted-foreground cursor-not-allowed border border-border' 
                                                : 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm'}
                                        `}
                                    >
                                        {loading ? (
                                            <div className="w-4 h-4 border-2 border-current border-t-transparent animate-spin rounded-full" />
                                        ) : (
                                            <Check size={14} strokeWidth={3} />
                                        )}
                                        {loading ? t('common.processing') : t('velocity.authorize_link')}
                                    </button>
                                    <button 
                                        onClick={() => setIsLinking(false)}
                                        className="h-12 px-6 rounded-xl text-[10px] font-bold text-muted-foreground hover:text-foreground uppercase tracking-[0.2em] transition-all border border-border bg-muted/10"
                                    >
                                        {t('common.cancel')}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
                {/* Traditional Confirmation Modal */}
                {powerConfirm.isOpen && (
                    <div className="fixed inset-0 bg-background/80 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-card border border-border rounded-xl shadow-2xl p-8 max-w-md w-full text-center space-y-6">
                            <div className="flex justify-center"><Server size={48} className="text-amber-500" /></div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold">{t('velocity.active_assets_title')}</h3>
                                <p className="text-sm text-muted-foreground">{t('velocity.active_assets_desc', { action: powerConfirm.action })}</p>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={() => setPowerConfirm({ ...powerConfirm, isOpen: false })} className="flex-1 py-3 px-4 bg-secondary/50 rounded-lg text-sm font-bold hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">{t('common.cancel')}</button>
                                <button onClick={() => { executePowerAction(powerConfirm.action); }} className="flex-1 py-3 px-4 bg-rose-500 text-white rounded-lg text-sm font-bold hover:bg-rose-600 transition-all active:scale-95 shadow-lg shadow-rose-500/20">{t('dashboard.force_start')} {powerConfirm.action === 'stop' ? t('common.stop') : t('common.restart')}</button>
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
                                    <h3 className="text-sm font-bold">{t('console.graceful')}</h3>
                                </div>
                                <button onClick={() => setShowGraceful(false)} className="p-2 hover:bg-rose-500/10 hover:text-rose-500 text-muted-foreground rounded-lg transition-colors"><X size={16} /></button>
                            </div>
                            <div className="p-8 space-y-8">
                                <p className="text-xs font-medium text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: t('velocity.graceful_desc', { count: stats.players }) }} />
                                
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">{t('velocity.drain_period')}</label>
                                        <span className="text-sm font-mono font-bold text-primary">{gracefulCountdown}s</span>
                                    </div>
                                    <input type="range" min="10" max="300" step="10" value={gracefulCountdown} onChange={e => setGracefulCountdown(parseInt(e.target.value))} className="w-full accent-primary h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer" />
                                </div>
                            </div>
                            <div className="p-6 bg-muted/5 border-t border-border/40 flex gap-3">
                                <button onClick={() => { executePowerAction('stop'); setShowGraceful(false); }} className="flex-1 py-3 text-[11px] font-bold text-muted-foreground hover:text-rose-500 hover:bg-rose-500/5 rounded-xl transition-all uppercase tracking-wider">{t('velocity.force_stop')}</button>
                                <button onClick={handleGracefulStop} className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[11px] font-bold uppercase tracking-widest shadow-lg shadow-amber-500/20 active:scale-95 transition-all">{t('velocity.begin_drain')}</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default VelocityDashboard;
