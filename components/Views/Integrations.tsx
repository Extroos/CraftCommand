
import React, { useState, useEffect } from 'react';
import { 
    Webhook, 
    MessageSquare, 
    Save, 
    Zap, 
    Power, 
    AlertTriangle, 
    UserPlus, 
    UserMinus, 
    Send, 
    Eye, 
    Bot, 
    RefreshCw, 
    Shield, 
    Bell,
    Lock,
    Unlock,
    Activity,
    Hash,
    Radio,
    Terminal,
    Users,
    Cpu,
    Info
} from 'lucide-react';

import { DiscordConfig, GlobalSettings, DiscordBotConfig } from '../../types';
import { API } from '../../services/api';
import { useToast } from '../UI/Toast';
import { useServers } from '../../context/ServerContext';

interface IntegrationsProps {
    serverId: string;
}

const Integrations: React.FC<IntegrationsProps> = ({ serverId }) => {
    const [activeTab, setActiveTab] = useState<'webhooks' | 'bot'>('webhooks');
    
    // Per-Server Webhook Config
    const [webhookConfig, setWebhookConfig] = useState<DiscordConfig>({
        enabled: false,
        webhookUrl: '',
        botName: 'CraftCommand Bot',
        avatarUrl: '',
        events: {
            onStart: true,
            onStop: true,
            onJoin: true,
            onLeave: true,
            onCrash: true
        }
    });

    // Global Bot Config
    const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
    const [botConfig, setBotConfig] = useState<DiscordBotConfig>({
        enabled: false,
        token: '',
        clientId: '',
        guildId: '',
        commandRoles: [],
        notificationChannel: ''
    });

    const [isDirty, setIsDirty] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [discordStatus, setDiscordStatus] = useState<{ status: string, user: any, lastError?: string | null }>({ status: 'offline', user: null, lastError: null });
    const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
    
    const { addToast } = useToast();
    const { currentServer, updateServerConfig } = useServers();

    useEffect(() => {
        if (activeTab === 'bot') {
            fetchDiscordStatus();
            const interval = setInterval(fetchDiscordStatus, 5000);
            return () => clearInterval(interval);
        }
    }, [activeTab]);

    const fetchDiscordStatus = async () => {
        try {
            const status = await API.getDiscordStatus();
            setDiscordStatus(status);
        } catch (e) {
            console.error('Failed to fetch Discord status:', e);
        }
    };

    useEffect(() => {
        if (currentServer && currentServer.id === serverId && currentServer.discordConfig) {
            setWebhookConfig(currentServer.discordConfig);
        }
    }, [currentServer?.id, serverId]);

    useEffect(() => {
        fetchGlobalSettings();
    }, []);

    const fetchGlobalSettings = async () => {
        try {
            const settings = await API.getGlobalSettings();
            setGlobalSettings(settings);
            setBotConfig(settings.discordBot);
        } catch (e) {
            console.error('Failed to fetch global settings:', e);
        }
    };

    const handleSaveWebhooks = async () => {
        const updates = { discordConfig: webhookConfig };
        await API.updateServer(serverId, updates);
        updateServerConfig(serverId, updates);
        setIsDirty(false);
        addToast('success', 'Webhook Saved', 'Server webhook settings updated.');
    };

    const handleSaveBot = async () => {
        try {
            await API.updateGlobalSettings({ discordBot: botConfig });
            setIsDirty(false);
            addToast('success', 'Bot Config Saved', 'Global Discord Bot settings updated.');
        } catch (e) {
            addToast('error', 'Save Failed', 'Could not update global settings.');
        }
    };

    const handleSyncCommands = async () => {
        setIsSyncing(true);
        try {
            await API.syncDiscordCommands();
            const message = !botConfig.guildId 
                ? 'Global commands registered. Note: It may take up to an hour for Discord to propagate global commands.'
                : 'Slash commands deployed to your Discord server.';
            addToast('success', 'Commands Synced', message);
        } catch (e: any) {
            addToast('error', 'Sync Failed', e.message);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleReconnect = async () => {
        setIsRefreshingStatus(true);
        try {
            await API.reconnectDiscord();
            addToast('info', 'Reconnect Requested', 'Discord bot is attempting to reconnect...');
            setTimeout(fetchDiscordStatus, 2000);
        } catch (e: any) {
            addToast('error', 'Reconnect Failed', e.message);
        } finally {
            setIsRefreshingStatus(false);
        }
    };

    const updateWebhookConfig = (key: keyof DiscordConfig, value: any) => {
        setWebhookConfig(prev => ({ ...prev, [key]: value }));
        setIsDirty(true);
    };

    const updateBotConfig = (key: keyof DiscordBotConfig, value: any) => {
        setBotConfig(prev => ({ ...prev, [key]: value }));
        setIsDirty(true);
    };

    const renderWebhookTab = () => (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-full font-sans">
            <div className="space-y-6">
                <div className="bg-[#09090b]/40 backdrop-blur-sm border border-white/5 rounded-xl p-6 relative overflow-hidden group">
                     <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-[#5865F2]/10 text-[#5865F2] rounded-md border border-[#5865F2]/20 shadow-inner">
                                <Webhook size={16} />
                            </div>
                            <div>
                                <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-200">Status Webhooks</h2>
                                <p className="text-[9px] text-zinc-600 font-medium tracking-wide">Legacy event logging</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                             <div className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${webhookConfig.enabled ? 'bg-emerald-500/5 text-emerald-500 border-emerald-500/20' : 'bg-zinc-800/50 text-zinc-600 border-white/5'}`}>
                                {webhookConfig.enabled ? 'Active' : 'Disabled'}
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer group/toggle">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer" 
                                    checked={webhookConfig.enabled}
                                    onChange={(e) => updateWebhookConfig('enabled', e.target.checked)}
                                />
                                <div className="w-9 h-4 bg-[#18181b] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-500 after:border-zinc-600 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#5865F2]/20 peer-checked:after:bg-[#5865F2] peer-checked:after:border-[#4752C4] group-hover/toggle:after:scale-95 transition-all"></div>
                            </label>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] group-hover:text-zinc-400 transition-colors">Webhook URL</label>
                            <div className="relative mt-1.5">
                                <input 
                                    type="password" 
                                    className="w-full bg-[#18181b]/50 border border-white/5 rounded-md px-3 py-2 text-xs font-mono text-zinc-300 focus:outline-none focus:ring-1 focus:ring-[#5865F2]/50 focus:border-[#5865F2]/50 transition-colors placeholder:text-zinc-800 hover:border-white/10"
                                    placeholder="https://discord.com/api/webhooks/..."
                                    value={webhookConfig.webhookUrl}
                                    onChange={(e) => updateWebhookConfig('webhookUrl', e.target.value)}
                                />
                                <Lock size={12} className="absolute right-3 top-2.5 text-zinc-700 pointer-events-none" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Bot Name</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-[#18181b]/50 border border-white/5 rounded-md px-3 py-2 text-xs font-medium text-zinc-200 mt-1.5 focus:outline-none focus:ring-1 focus:ring-[#5865F2]/50 focus:border-[#5865F2]/50 transition-colors hover:border-white/10"
                                    value={webhookConfig.botName}
                                    onChange={(e) => updateWebhookConfig('botName', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Avatar URL</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-[#18181b]/50 border border-white/5 rounded-md px-3 py-2 text-xs font-medium text-zinc-200 mt-1.5 focus:outline-none focus:ring-1 focus:ring-[#5865F2]/50 focus:border-[#5865F2]/50 transition-colors hover:border-white/10"
                                    value={webhookConfig.avatarUrl}
                                    onChange={(e) => updateWebhookConfig('avatarUrl', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-[#09090b]/40 backdrop-blur-sm border border-white/5 rounded-xl p-6 relative overflow-hidden group">
                     <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div className="flex items-center gap-2 mb-5 pb-3 border-b border-white/5">
                        <Zap size={14} className="text-amber-500" />
                        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-200">Event Triggers</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { id: 'onStart', label: 'Startup', icon: <Power size={12} className="text-emerald-500" /> },
                            { id: 'onStop', label: 'Shutdown', icon: <Power size={12} className="text-rose-500" /> },
                            { id: 'onJoin', label: 'Connect', icon: <UserPlus size={12} className="text-blue-500" /> },
                            { id: 'onCrash', label: 'Crashes', icon: <AlertTriangle size={12} className="text-red-500" /> },
                        ].map((event) => (
                            <label key={event.id} className="flex items-center justify-between p-2.5 rounded-md bg-[#18181b]/30 border border-white/5 hover:bg-[#18181b]/50 hover:border-white/10 cursor-pointer transition-all">
                                <div className="flex items-center gap-2.5">
                                    {event.icon}
                                    <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 group-hover:text-zinc-300 transition-colors">{event.label}</span>
                                </div>
                                 <div className={`w-8 h-4 rounded-full border flex items-center p-0.5 transition-all ${
                                        (webhookConfig.events as any)[event.id] 
                                        ? 'bg-zinc-200 border-zinc-200 justify-end' 
                                        : 'bg-black/40 border-zinc-800 group-hover:border-zinc-700 justify-start'
                                    }`}>
                                    <input 
                                        type="checkbox" 
                                        className="sr-only"
                                        checked={(webhookConfig.events as any)[event.id]}
                                        onChange={() => updateWebhookConfig('events', { ...webhookConfig.events, [event.id]: !(webhookConfig.events as any)[event.id] })}
                                    />
                                    <div className={`w-2.5 h-2.5 rounded-full transition-all ${(webhookConfig.events as any)[event.id] ? 'bg-black' : 'bg-zinc-600'}`} />
                                </div>
                            </label>
                        ))}
                    </div>
                </div>

                 <button 
                    onClick={handleSaveWebhooks}
                    disabled={!isDirty}
                    className={`w-full py-2.5 rounded-md font-bold text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all shadow-lg ${
                        isDirty 
                        ? 'bg-zinc-100 text-black hover:bg-zinc-300 hover:scale-[1.01] shadow-white/5' 
                        : 'bg-[#18181b] text-zinc-600 border border-white/5 opacity-50 cursor-not-allowed'
                    }`}
                >
                    <Save size={12} className={isDirty ? "animate-pulse" : ""} /> Save Configuration
                </button>
            </div>

            <div className="bg-[#1e1f22] border border-black/40 rounded-xl overflow-hidden shadow-2xl flex flex-col h-fit font-sans">
                <div className="px-4 py-3 bg-[#2b2d31] border-b border-black/20 flex items-center gap-2 shadow-sm">
                    <Hash size={14} className="text-zinc-400" />
                    <span className="text-[11px] font-bold text-white">server-status</span>
                </div>
                <div className="p-5 space-y-5 bg-[#313338]">
                    <div className="flex gap-4 group hover:bg-[#2e3035] -mx-5 px-5 py-2 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-[#5865F2] flex shrink-0 items-center justify-center text-sm text-white shadow-md relative overflow-hidden">
                             {webhookConfig.avatarUrl ? <img src={webhookConfig.avatarUrl} className="w-full h-full object-cover" /> : <Bot size={20} />}
                        </div>
                        <div className="space-y-1 w-full">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-white hover:underline cursor-pointer">{webhookConfig.botName}</span>
                                <span className="bg-[#5865F2] text-white text-[9px] px-1.5 py-[1px] rounded-[3px] uppercase font-bold flex items-center gap-1"><CheckmarkIcon /> BOT</span>
                                <span className="text-[10px] text-zinc-400 ml-1">Today at 4:20 PM</span>
                            </div>
                            <div className="bg-[#2b2d31] border-l-[3px] border-emerald-500 rounded-[3px] p-3 max-w-sm">
                                <div className="flex items-center gap-2 mb-1.5">
                                   <Power size={12} className="text-emerald-500" />
                                   <span className="text-xs font-bold text-white">Server Started</span>
                                </div>
                                <p className="text-[11px] text-zinc-300 leading-relaxed">The server is now online and reachable at <span className="text-emerald-400 font-mono bg-emerald-500/10 px-1 rounded">25565</span>.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const CheckmarkIcon = () => (
        <svg  width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
    )

    const renderBotTab = () => {
        return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-full font-sans animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="space-y-6">
                {/* Connection Status Card */}
                <div className="bg-[#09090b]/40 backdrop-blur-sm border border-white/5 rounded-xl p-6 relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div className="p-1 absolute top-0 left-0 w-full bg-gradient-to-r from-[#5865F2] to-[#5865F2]/0 opacity-20" />
                    
                    <div className="flex items-center justify-between mb-6 relative">
                        <div className="flex items-center gap-4">
                            <div className={`p-2.5 rounded-lg border shadow-inner ${discordStatus.status === 'online' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
                                <Radio size={20} className={discordStatus.status === 'online' ? 'animate-pulse' : ''} />
                            </div>
                            <div>
                                <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-200">Discord Gateway</h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <div className={`w-1.5 h-1.5 rounded-full ${discordStatus.status === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : (discordStatus.status === 'connecting' ? 'bg-amber-500' : 'bg-rose-500')}`} />
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                                        {discordStatus.status}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={handleReconnect}
                                disabled={isRefreshingStatus || !botConfig.enabled}
                                title="Reconnect Bot"
                                className="p-2 rounded-md bg-[#18181b] hover:bg-[#27272a] text-zinc-400 hover:text-white transition-all border border-white/5 hover:border-white/10 shadow-lg"
                            >
                                <RefreshCw size={14} className={isRefreshingStatus ? 'animate-spin' : ''} />
                            </button>
                            <label className="relative inline-flex items-center cursor-pointer group/toggle">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer" 
                                    checked={botConfig.enabled}
                                    onChange={(e) => updateBotConfig('enabled', e.target.checked)}
                                />
                                <div className="w-9 h-4 bg-[#18181b] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-500 after:border-zinc-600 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#5865F2]/20 peer-checked:after:bg-[#5865F2] peer-checked:after:border-[#4752C4] group-hover/toggle:after:scale-95 transition-all"></div>
                            </label>
                        </div>
                    </div>

                    <div className="relative">
                        {discordStatus.status === 'online' && discordStatus.user ? (
                            <div className="flex items-center gap-4 p-4 rounded-lg bg-[#18181b]/50 border border-white/5 group/profile hover:bg-[#18181b] transition-colors">
                                <img 
                                    src={discordStatus.user.avatar} 
                                    alt="Bot Avatar" 
                                    className="w-10 h-10 rounded-full border border-white/10 ring-2 ring-[#5865F2]/20 group-hover/profile:ring-[#5865F2]/40 transition-all"
                                />
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-xs text-zinc-200">{discordStatus.user.username}</span>
                                        <span className="bg-[#5865F2] text-white text-[8px] px-1 py-0.5 rounded-[3px] font-black uppercase tracking-tight flex items-center gap-0.5"><CheckmarkIcon /> BOT</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5 text-zinc-500 text-[9px] font-mono">
                                        <Hash size={10} className="opacity-50" />
                                        <span>{discordStatus.user.id}</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest block mb-0.5">Online</span>
                                    <span className="text-[8px] text-zinc-600 font-mono bg-[#09090b] px-1.5 py-0.5 rounded border border-white/5">v10 Gateway</span>
                                </div>
                            </div>
                        ) : (
                            <div className="p-6 rounded-lg bg-[#18181b]/20 border border-dashed border-white/5 flex flex-col items-center justify-center text-center">
                                <Bot size={20} className="text-zinc-700 mb-2" />
                                <p className="text-[10px] text-zinc-600 font-medium">
                                    {botConfig.enabled ? 'Waiting for handshake...' : 'Bot process inactive'}
                                </p>
                            </div>
                        )}

                        {discordStatus.lastError && (
                            <div className="mt-4 p-3 rounded-lg bg-rose-500/5 border border-rose-500/10 flex items-start gap-3">
                                <AlertTriangle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="text-[9px] font-bold text-rose-500 uppercase tracking-widest">Initialization Error</p>
                                    <p className="text-[10px] text-rose-200/60 leading-tight">{discordStatus.lastError}</p>
                                    {discordStatus.lastError.includes('Intents') && (
                                        <a 
                                            href="https://discord.com/developers/applications" 
                                            target="_blank" 
                                            rel="noreferrer"
                                            className="text-[9px] text-rose-400 hover:text-rose-300 hover:underline font-bold inline-block mt-1"
                                        >
                                            Go to Developer Portal →
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-[#09090b]/40 backdrop-blur-sm border border-white/5 rounded-xl p-6 relative overflow-hidden group">
                     <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div className="flex items-center gap-2 border-b border-white/5 pb-4 mb-6">
                        <Lock size={14} className="text-[#5865F2]" />
                        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-200">Authentication</h3>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] flex justify-between mb-1.5">
                                Bot Token
                                <span className="text-amber-500 lowercase font-medium opacity-70">Requires Reconnect</span>
                            </label>
                            <div className="relative group/input">
                                <input 
                                    type="password" 
                                    className="w-full bg-[#18181b]/50 border border-white/5 rounded-md px-3 py-2 text-xs font-mono text-zinc-300 focus:outline-none focus:ring-1 focus:ring-[#5865F2]/50 focus:border-[#5865F2]/50 transition-colors placeholder:text-zinc-800 hover:border-white/10"
                                    value={botConfig.token}
                                    onChange={(e) => updateBotConfig('token', e.target.value)}
                                />
                                <div className="absolute right-3 top-2 opacity-0 group-hover/input:opacity-100 transition-opacity text-zinc-600">
                                    <Lock size={12} />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-1.5 block">Client ID</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-[#18181b]/50 border border-white/5 rounded-md px-3 py-2 text-xs font-mono text-zinc-300 focus:outline-none focus:ring-1 focus:ring-[#5865F2]/50 focus:border-[#5865F2]/50 transition-colors placeholder:text-zinc-800 hover:border-white/10"
                                    value={botConfig.clientId}
                                    placeholder="Application ID"
                                    onChange={(e) => updateBotConfig('clientId', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-1.5 block">Guild ID (Optional)</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-[#18181b]/50 border border-white/5 rounded-md px-3 py-2 text-xs font-mono text-zinc-300 focus:outline-none focus:ring-1 focus:ring-[#5865F2]/50 focus:border-[#5865F2]/50 transition-colors placeholder:text-zinc-800 hover:border-white/10"
                                    value={botConfig.guildId}
                                    placeholder="Instant Sync ID"
                                    onChange={(e) => updateBotConfig('guildId', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                        <button 
                            onClick={handleSaveBot}
                            disabled={!isDirty}
                             className={`flex-1 py-2.5 rounded-md font-bold text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all shadow-lg ${
                                isDirty 
                                ? 'bg-zinc-100 text-black hover:bg-zinc-300 hover:scale-[1.01] shadow-white/5' 
                                : 'bg-[#18181b] text-zinc-600 border border-white/5 opacity-50 cursor-not-allowed'
                            }`}
                        >
                            <Save size={12} /> Update Config
                        </button>
                        <button 
                            onClick={handleSyncCommands}
                            disabled={isSyncing || discordStatus.status !== 'online'}
                            title="Register slash commands with Discord"
                             className={`px-6 py-2.5 rounded-md font-bold text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all shadow-lg ${
                                discordStatus.status === 'online'
                                ? 'bg-[#5865F2] text-white hover:bg-[#4752C4] hover:scale-[1.01] shadow-[#5865F2]/20' 
                                : 'bg-[#18181b] text-zinc-600 border border-white/5 opacity-50 cursor-not-allowed'
                            }`}
                        >
                            {isSyncing ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                            Sync Cmds
                        </button>
                    </div>
                    
                    <div className="p-3 rounded-md bg-[#5865F2]/5 border border-[#5865F2]/10 flex items-start gap-2.5">
                        <div className="p-1 rounded bg-[#5865F2]/10 text-[#5865F2] mt-0.5">
                            <Info size={10} />
                        </div>
                        <p className="text-[10px] leading-relaxed text-zinc-500">
                            <strong className="text-zinc-200">Sync Commands?</strong> Registers <code>/start</code>, <code>/stop</code> etc. with Discord. Run this after setup or when changing Client/Guild IDs.
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <div className="bg-[#09090b]/40 backdrop-blur-sm border border-white/5 rounded-xl p-6 relative overflow-hidden group">
                     <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div className="flex items-center gap-2 border-b border-white/5 pb-4 mb-6">
                        <Shield size={14} className="text-emerald-500" />
                        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-200">Permissions & Security</h3>
                    </div>
                    <div className="space-y-6">
                             <div>
                            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] block mb-1.5">Authorized Role IDs (CSV)</label>
                            <input 
                                type="text" 
                                className="w-full bg-[#18181b]/50 border border-white/5 rounded-md px-3 py-2 text-xs font-mono text-zinc-300 focus:outline-none focus:ring-1 focus:ring-[#5865F2]/50 focus:border-[#5865F2]/50 transition-colors placeholder:text-zinc-800 hover:border-white/10"
                                placeholder="123456789, 987654321..."
                                value={botConfig.commandRoles.join(', ')}
                                onChange={(e) => updateBotConfig('commandRoles', e.target.value.split(',').map(s => s.trim()).filter(s => s))}
                            />
                        </div>

                         <div>
                            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] block mb-1.5">Event Sync Channel</label>
                            <div className="relative flex items-center">
                                <div className="absolute left-3 text-zinc-700 pointer-events-none">
                                    <Hash size={12} />
                                </div>
                                <input 
                                    type="text" 
                                    className="w-full bg-[#18181b]/50 border border-white/5 rounded-md px-8 py-2 text-xs font-mono text-zinc-300 focus:outline-none focus:ring-1 focus:ring-[#5865F2]/50 focus:border-[#5865F2]/50 transition-colors placeholder:text-zinc-800 hover:border-white/10"
                                    placeholder="98765432101234"
                                    value={botConfig.notificationChannel}
                                    onChange={(e) => updateBotConfig('notificationChannel', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Command Quick Reference */}
                <div className="bg-[#09090b]/40 backdrop-blur-sm border border-white/5 rounded-xl p-6 relative overflow-hidden group">
                     <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none">
                        <Terminal size={120} />
                    </div>
                    <div className="flex items-center gap-2 border-b border-white/5 pb-4 mb-4">
                        <Activity size={14} className="text-[#5865F2]" />
                        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-200">Slash Command Guide</h3>
                    </div>
                    <div className="space-y-3">
                        {[
                            { cmd: '/list', desc: 'Queries all local instances.' },
                            { cmd: '/start <id>', desc: 'Triggers the boot sequence.' },
                            { cmd: '/stop <id>', desc: 'Initiates a graceful termination.' },
                            { cmd: '/status <id>', desc: 'Fetches real-time telemetry.' },
                        ].map(it => (
                            <div key={it.cmd} className="group transition-all">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-mono text-[#5865F2] font-semibold bg-[#5865F2]/10 px-2 py-0.5 rounded border border-[#5865F2]/20">{it.cmd}</span>
                                    <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">Global</span>
                                </div>
                                <p className="text-[9px] text-zinc-500 font-medium pl-2 border-l border-white/5 group-hover:border-[#5865F2]/40 transition-colors leading-tight">{it.desc}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                         <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest">Bot Capability Level</p>
                         <div className="flex gap-1">
                            <div className="w-1 h-1 rounded-full bg-[#5865F2]" />
                            <div className="w-1 h-1 rounded-full bg-[#5865F2]/50" />
                            <div className="w-1 h-1 rounded-full bg-[#5865F2]/20" />
                         </div>
                    </div>
                </div>

                <div className="bg-[#1e1f22] border border-black/40 rounded-xl overflow-hidden shadow-2xl flex flex-col font-sans">
                    <div className="px-4 py-3 bg-[#2b2d31] border-b border-black/20 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Terminal size={12} className="text-[#5865F2]" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-[#949cf7]">Bot Console Output</span>
                        </div>
                        <div className="flex gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-[#ed4245]" />
                            <div className="w-2 h-2 rounded-full bg-[#f0d042]" />
                            <div className="w-2 h-2 rounded-full bg-[#23a559]" />
                        </div>
                    </div>
                    <div className="p-4 font-mono text-[10px] space-y-2.5 min-h-[140px] bg-black/20">
                        <div className="flex gap-2 text-zinc-500">
                            <span className="opacity-50">[14:20:01]</span>
                            <span className="text-emerald-500 font-bold">[SYSTEM]</span>
                            <span className="text-zinc-400">Attempting hand-shake...</span>
                        </div>
                        <div className="flex gap-2 text-zinc-500">
                            <span className="opacity-50">[14:20:03]</span>
                            <span className="text-emerald-500 font-bold">[SYSTEM]</span>
                            <span className="text-emerald-400">IDENTIFIED as {discordStatus.user?.username || 'Bot'}#0000</span>
                        </div>
                        <div className="flex gap-2 text-zinc-500">
                            <span className="opacity-50">[14:20:05]</span>
                            <span className="text-[#5865F2] font-bold">[COMMAND]</span>
                            <span className="text-zinc-400">Registered application commands.</span>
                        </div>
                        {discordStatus.status === 'online' && (
                            <div className="flex gap-2 text-zinc-500 animate-pulse">
                                <span className="opacity-50">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                                <span className="text-zinc-200 font-bold">[HEARTBEAT]</span>
                                <span className="text-zinc-500">WS Connection Healthy</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
    };

    return (
        <div className="h-[calc(100vh-140px)] flex flex-col gap-6 animate-fade-in font-sans">
             <div className="flex items-center gap-1.5 p-1 bg-[#09090b] rounded-lg border border-white/5 w-fit">
                <button 
                    onClick={() => setActiveTab('webhooks')}
                    className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[0.15em] transition-all flex items-center gap-2 ${activeTab === 'webhooks' ? 'bg-[#27272a] text-white shadow-lg shadow-black/50 border border-white/10' : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/5 border border-transparent'}`}
                >
                    <Webhook size={12} /> Webhooks
                </button>
                <button 
                    onClick={() => setActiveTab('bot')}
                     className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[0.15em] transition-all flex items-center gap-2 ${activeTab === 'bot' ? 'bg-[#27272a] text-white shadow-lg shadow-black/50 border border-white/10' : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/5 border border-transparent'}`}
                >
                    <Bot size={12} /> Control Bot
                </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin">
                {activeTab === 'webhooks' ? renderWebhookTab() : renderBotTab()}
            </div>
        </div>
    );
};

export default Integrations;
