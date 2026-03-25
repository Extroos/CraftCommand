
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

import { DiscordConfig, GlobalSettings, DiscordBotConfig, WebhookConfig, WebhookTrigger } from '@shared/types';
import { API } from '@core/services/api';
import { useToast } from '../ui/Toast';
import { useServers } from '@features/servers/context/ServerContext';
import { usePermissions } from '@features/auth/hooks/usePermissions';
import { useUser } from '@features/auth/context/UserContext';
import AccessDenied from '@features/auth/components/AccessDenied';

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
    const [discordStatus, setDiscordStatus] = useState<{ status: string, user: any, lastError?: string | null, latency?: number, guilds?: number }>({ status: 'offline', user: null, lastError: null, latency: 0, guilds: 0 });
    const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    const { addToast } = useToast();
    const { can } = usePermissions();
    const { user } = useUser();
    const { currentServer, updateServerConfig } = useServers();
    
    // Webhook Entity Persistence
    const [webhookId, setWebhookId] = useState<string | null>(null);
    const [isTesting, setIsTesting] = useState(false);

    useEffect(() => {
        if (serverId) {
            fetchWebhook();
        }
    }, [serverId]);

    const fetchWebhook = async () => {
        try {
            const webhooks = await API.getWebhooks(serverId);
            // CraftCommand currently supports one primary discord webhook per server in this UI
            const primary = webhooks.find(w => w.name.includes('Discord') || w.triggers.length > 0);
            if (primary) {
                setWebhookId(primary.id);
                setWebhookConfig({
                    enabled: primary.enabled,
                    webhookUrl: primary.url,
                    botName: primary.name,
                    avatarUrl: primary.avatarUrl || '',
                    events: {
                        onStart: primary.triggers.includes('SERVER_START'),
                        onStop: primary.triggers.includes('SERVER_STOP'),
                        onJoin: primary.triggers.includes('PLAYER_JOIN'),
                        onLeave: primary.triggers.includes('PLAYER_LEAVE'),
                        onCrash: primary.triggers.includes('SERVER_CRASH')
                    }
                });
            }
        } catch (e) {
            console.error('Failed to fetch server webhooks:', e);
        }
    };

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
        if (!can('server.integrations.manage', serverId)) {
            addToast('error', 'Permissions', 'Insufficient permissions to manage server integrations');
            return;
        }
        setIsSaving(true);
        
        const triggers: WebhookTrigger[] = [];
        if (webhookConfig.events.onStart) triggers.push('SERVER_START');
        if (webhookConfig.events.onStop) triggers.push('SERVER_STOP');
        if (webhookConfig.events.onJoin) triggers.push('PLAYER_JOIN');
        if (webhookConfig.events.onLeave) triggers.push('PLAYER_LEAVE');
        if (webhookConfig.events.onCrash) triggers.push('SERVER_CRASH');
        if ((webhookConfig.events as any).onBackup) triggers.push('BACKUP_COMPLETE' as any);

        const payload = {
            name: webhookConfig.botName || 'Discord Webhook',
            url: webhookConfig.webhookUrl,
            enabled: webhookConfig.enabled,
            triggers,
            avatarUrl: webhookConfig.avatarUrl,
            serverId
        };

        try {
            if (webhookId) {
                await API.updateWebhook({ ...payload, id: webhookId });
            } else {
                const created = await API.createWebhook(serverId, payload);
                setWebhookId(created.id);
            }
            
            setIsDirty(false);
            addToast('success', 'Webhook Saved', 'Server webhook settings synchronized with high-priority gateway.');
        } catch (e) {
            addToast('error', 'Save Failed', 'Could not update server integrations.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleTestWebhook = async () => {
        if (!webhookId) return;
        setIsTesting(true);
        try {
            await API.testWebhook(webhookId);
            addToast('success', 'Test Dispatched', 'Check your Discord channel for the payload.');
        } catch (e: any) {
            addToast('error', 'Test Failed', e.message);
        } finally {
            setIsTesting(false);
        }
    };

    const handleSaveBot = async () => {
        if (!globalSettings) return;
        if (!can('system.integrations.manage')) {
            addToast('error', 'Permissions', 'Insufficient permissions to modify global bot settings');
            return;
        }
        setIsSaving(true);
        try {
            await API.updateGlobalSettings({ ...globalSettings, discordBot: botConfig });
            setIsDirty(false);
            addToast('success', 'Bot Config Saved', 'Global Discord Bot settings updated.');
        } catch (e) {
            addToast('error', 'Save Failed', 'Could not update global settings.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSyncCommands = async () => {
        if (!can('system.integrations.manage')) {
            addToast('error', 'Permissions', 'Insufficient permissions to sync global commands');
            return;
        }
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
        if (!can('system.integrations.manage')) {
            addToast('error', 'Permissions', 'Insufficient permissions to reconnect bot');
            return;
        }
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

    const CheckmarkIcon = () => (
        <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
    );

    const renderWebhookTab = () => (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-full font-sans">
            <div className="space-y-6">
                <div className={`border border-border/80 transition-all duration-300 overflow-hidden ${user?.preferences.visualQuality ? 'glass-morphism rounded-2xl' : 'bg-card rounded-md shadow-sm'}`}>
                    <div className="h-10 bg-[#5865F2]/10 border-b border-[#5865F2]/20 flex items-center justify-between px-4">
                        <div className="flex items-center gap-2">
                            <Webhook size={14} className="text-[#5865F2]" />
                            <span className="text-[11px] font-semibold tracking-tight uppercase text-muted-foreground">Status Webhooks Configuration</span>
                        </div>
                        <div className="flex items-center gap-3">
                             <div className={`px-2 py-0.5 rounded text-[9px] font-black border uppercase tracking-widest ${webhookConfig.enabled ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-zinc-800/50 text-muted-foreground border-border'}`}>
                                {webhookConfig.enabled ? 'Active' : 'Disabled'}
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer group/toggle">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer" 
                                    checked={webhookConfig.enabled}
                                    onChange={(e) => updateWebhookConfig('enabled', e.target.checked)}
                                />
                                <div className="w-8 h-4 bg-black/40 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-500 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#5865F2]/40 peer-checked:after:bg-[#5865F2] transition-colors"></div>
                            </label>
                        </div>
                    </div>

                    <div className="p-5 space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest block">Webhook Endpoint URL</label>
                            <div className="relative">
                                <input 
                                    type="password" 
                                    className="w-full bg-black/20 border border-border/50 rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-[#5865F2]/50 focus:border-[#5865F2]/50 transition-all placeholder:text-zinc-800 hover:border-primary/30"
                                    placeholder="https://discord.com/api/webhooks/..."
                                    value={webhookConfig.webhookUrl}
                                    onChange={(e) => updateWebhookConfig('webhookUrl', e.target.value)}
                                />
                                <Lock size={12} className="absolute right-3 top-2.5 text-zinc-700 pointer-events-none" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest block">Bot Identity Name</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-black/20 border border-border/50 rounded-lg px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-[#5865F2]/50 focus:border-[#5865F2]/50 transition-all hover:border-primary/30"
                                    value={webhookConfig.botName}
                                    onChange={(e) => updateWebhookConfig('botName', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest block">Profile Avatar URL</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-black/20 border border-border/50 rounded-lg px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-[#5865F2]/50 focus:border-[#5865F2]/50 transition-all hover:border-primary/30"
                                    value={webhookConfig.avatarUrl}
                                    onChange={(e) => updateWebhookConfig('avatarUrl', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className={`border border-border/80 transition-all duration-300 overflow-hidden ${user?.preferences.visualQuality ? 'glass-morphism rounded-2xl' : 'bg-card rounded-md shadow-sm'}`}>
                    <div className="h-10 bg-muted/20 border-b border-border/60 flex items-center justify-between px-4">
                        <div className="flex items-center gap-2">
                            <Zap size={14} className="text-amber-500" />
                            <span className="text-[11px] font-semibold tracking-tight uppercase text-muted-foreground">Broadcast Event Triggers</span>
                        </div>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-3">
                        {[
                            { id: 'onStart', label: 'Startup Sequence', icon: <Power size={12} className="text-emerald-500" /> },
                            { id: 'onStop', label: 'Shutdown Hook', icon: <Power size={12} className="text-rose-500" /> },
                            { id: 'onJoin', label: 'Player Association', icon: <UserPlus size={12} className="text-blue-500" /> },
                            { id: 'onLeave', label: 'Player Departure', icon: <UserMinus size={12} className="text-indigo-500" /> },
                            { id: 'onCrash', label: 'Failure Recovery', icon: <AlertTriangle size={12} className="text-red-500" /> },
                            { id: 'onBackup', label: 'Backup Complete', icon: <Save size={12} className="text-cyan-500" /> },
                        ].map((event) => (
                            <label key={event.id} className="flex items-center justify-between p-3 rounded-xl bg-black/10 border border-border/20 hover:bg-black/20 hover:border-primary/20 cursor-pointer transition-all group">
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 rounded-lg bg-black/20 border border-border/40 group-hover:border-primary/20 group-hover:text-primary transition-all">
                                        {event.icon}
                                    </div>
                                    <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">{event.label}</span>
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

                <div className="flex gap-3">
                    <button 
                        onClick={handleSaveWebhooks}
                        disabled={!isDirty || isSaving || !can('server.integrations.manage', serverId)}
                        className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.25em] flex items-center justify-center gap-2 transition-all shadow-lg ${
                            isDirty && !isSaving && can('server.integrations.manage', serverId)
                            ? 'bg-primary text-primary-foreground hover:scale-[1.01] shadow-primary/20' 
                            : 'bg-muted text-muted-foreground border border-border/50 opacity-50 cursor-not-allowed'
                        }`}
                    >
                        {isSaving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />} 
                        {isSaving ? 'Synchronizing...' : 'Save Configuration'}
                    </button>
                    {webhookId && (
                        <button 
                            onClick={handleTestWebhook}
                            disabled={isTesting || !can('server.integrations.manage', serverId)}
                            className="px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.25em] flex items-center justify-center gap-2 transition-all shadow-lg bg-zinc-800 text-foreground border border-border/60 hover:bg-zinc-700 disabled:opacity-50"
                        >
                            {isTesting ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                            Test
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-[#1e1f22] border border-black/40 rounded-xl overflow-hidden shadow-2xl flex flex-col h-fit font-sans">
                <div className="px-4 py-3 bg-[#2b2d31] border-b border-black/20 flex items-center gap-2 shadow-sm">
                    <Hash size={14} className="text-[rgb(var(--color-fg-muted))]" />
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
                                <span className="text-[10px] text-[rgb(var(--color-fg-muted))] ml-1">Today at 4:20 PM</span>
                            </div>
                            <div className="bg-[#2b2d31] border-l-[3px] border-emerald-500 rounded-[3px] p-3 max-w-sm">
                                <div className="flex items-center gap-2 mb-1.5">
                                   <Power size={12} className="text-emerald-500" />
                                   <span className="text-xs font-bold text-white">Server Started</span>
                                </div>
                                <p className="text-[11px] text-[rgb(var(--color-fg-secondary))] leading-relaxed">The server is now online and reachable at <span className="text-emerald-400 font-mono bg-emerald-500/10 px-1 rounded">25565</span>.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderBotTab = () => (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-full font-sans animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="space-y-6">
                {/* Connection Status Card */}
                <div className={`border border-border/80 transition-all duration-300 overflow-hidden ${user?.preferences.visualQuality ? 'glass-morphism rounded-2xl' : 'bg-card rounded-md shadow-sm'}`}>
                    <div className="h-10 bg-muted/20 border-b border-border/60 flex items-center justify-between px-4">
                        <div className="flex items-center gap-2">
                            <Radio size={14} className={discordStatus.status === 'online' ? 'text-emerald-500' : 'text-rose-500'} />
                            <span className="text-[11px] font-semibold tracking-tight uppercase text-muted-foreground">Discord Gateway Status</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={handleReconnect}
                                disabled={isRefreshingStatus || !botConfig.enabled || !can('system.integrations.manage')}
                                className="p-1.5 rounded-lg bg-black/20 hover:bg-black/40 text-muted-foreground hover:text-foreground transition-all border border-border/20 disabled:opacity-30"
                            >
                                <RefreshCw size={12} className={isRefreshingStatus ? 'animate-spin' : ''} />
                            </button>
                            <label className="relative inline-flex items-center cursor-pointer group/toggle">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer" 
                                    checked={botConfig.enabled}
                                    disabled={!can('system.integrations.manage')}
                                    onChange={(e) => updateBotConfig('enabled', e.target.checked)}
                                />
                                <div className="w-8 h-4 bg-black/40 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-500 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#5865F2]/40 peer-checked:after:bg-[#5865F2] transition-colors"></div>
                            </label>
                        </div>
                    </div>

                    <div className="p-5">
                        {discordStatus.status === 'online' && discordStatus.user ? (
                            <div className="flex items-center gap-4 p-4 rounded-xl bg-black/10 border border-border/20 group hover:bg-black/20 transition-all">
                                <div className="relative">
                                    <img 
                                        src={discordStatus.user.avatar} 
                                        alt="Bot Avatar" 
                                        className="w-12 h-12 rounded-full border-2 border-primary/20 group-hover:border-primary/40 transition-all"
                                    />
                                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-[rgb(var(--color-bg-base))] animate-pulse" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-xs">{discordStatus.user.username}</span>
                                        <span className="bg-[#5865F2] text-white text-[8px] px-1.5 py-0.5 rounded-[4px] font-black uppercase tracking-tighter flex items-center gap-0.5">BOT</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-1 text-muted-foreground/60 text-[9px] font-mono">
                                        <Hash size={10} className="opacity-50" />
                                        <span>{discordStatus.user.id}</span>
                                    </div>
                                </div>
                                <div className="text-right space-y-1.5">
                                    <div className="flex flex-col gap-1 items-end">
                                        <span className="text-[9px] font-mono font-bold tabular-nums bg-black/20 px-2 py-0.5 rounded-lg border border-border/20 flex items-center gap-1.5 text-amber-500">
                                            <Zap size={10} className="animate-pulse" /> {discordStatus.latency || 0}ms
                                        </span>
                                        <span className="text-[9px] font-mono font-bold tabular-nums bg-black/20 px-2 py-0.5 rounded-lg border border-border/20 flex items-center gap-1.5 text-blue-500">
                                            <Users size={10} /> {discordStatus.guilds || 0} Guilds
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="p-8 rounded-xl bg-black/5 border border-dashed border-border/40 flex flex-col items-center justify-center text-center">
                                <Bot size={24} className="text-muted-foreground/20 mb-3" />
                                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                                    {botConfig.enabled ? 'Awaiting Handshake...' : 'System Instance Disabled'}
                                </p>
                            </div>
                        )}

                        {discordStatus.lastError && (
                            <div className="mt-4 p-3 rounded-lg bg-rose-500/5 border border-rose-500/10 flex items-start gap-3">
                                <AlertTriangle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="text-[9px] font-bold text-rose-500 uppercase tracking-widest">Gateway Error</p>
                                    <p className="text-[10px] text-rose-200/60 leading-tight">{discordStatus.lastError}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className={`border border-border/80 transition-all duration-300 overflow-hidden ${user?.preferences.visualQuality ? 'glass-morphism rounded-2xl' : 'bg-card rounded-md shadow-sm'}`}>
                    <div className="h-10 bg-muted/20 border-b border-border/60 flex items-center justify-between px-4">
                        <div className="flex items-center gap-2">
                            <Lock size={14} className="text-[#5865F2]" />
                            <span className="text-[11px] font-semibold tracking-tight uppercase text-muted-foreground">Bot Authentication Credentials</span>
                        </div>
                    </div>
                    
                    <div className="p-5 space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest flex justify-between">
                                Security Token
                                <span className="text-amber-500 lowercase font-bold opacity-70">Handshake Required</span>
                            </label>
                            <div className="relative group/input">
                                <input 
                                    type="password" 
                                    className="w-full bg-black/20 border border-border/50 rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-[#5865F2]/50 focus:border-[#5865F2]/50 transition-all placeholder:text-zinc-800 hover:border-primary/30"
                                    value={botConfig.token}
                                    onChange={(e) => updateBotConfig('token', e.target.value)}
                                />
                                <Lock size={12} className="absolute right-3 top-2.5 text-zinc-700 pointer-events-none opacity-40 group-hover/input:opacity-100 transition-opacity" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest block">Client Application ID</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-black/20 border border-border/50 rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-[#5865F2]/50 focus:border-[#5865F2]/50 transition-all hover:border-primary/30"
                                    value={botConfig.clientId}
                                    placeholder="Application ID"
                                    onChange={(e) => updateBotConfig('clientId', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest block">Primary Guild ID</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-black/20 border border-border/50 rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-[#5865F2]/50 focus:border-[#5865F2]/50 transition-all hover:border-primary/30"
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
                            disabled={!isDirty || isSaving || !can('system.integrations.manage')}
                            title={!can('system.integrations.manage') ? 'Insufficient Permissions' : ''}
                             className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.25em] flex items-center justify-center gap-2 transition-all shadow-lg ${
                                isDirty && !isSaving && can('system.integrations.manage')
                                ? 'bg-primary text-primary-foreground hover:scale-[1.01] shadow-primary/20' 
                                : 'bg-muted text-muted-foreground border border-border/50 opacity-50 cursor-not-allowed'
                            }`}
                        >
                            {isSaving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                            {isSaving ? 'Committing...' : 'Commit Configuration'}
                        </button>
                        <button 
                            onClick={handleSyncCommands}
                            disabled={isSyncing || discordStatus.status !== 'online' || !can('system.integrations.manage')}
                            className={`px-8 py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.25em] flex items-center justify-center gap-2 transition-all shadow-lg ${
                                discordStatus.status === 'online' && can('system.integrations.manage')
                                ? 'bg-[#5865F2] text-white hover:bg-[#4752C4] hover:scale-[1.01] shadow-[#5865F2]/20' 
                                : 'bg-muted text-muted-foreground border border-border/50 opacity-50 cursor-not-allowed'
                            }`}
                        >
                            {isSyncing ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                            Sync Matrix
                        </button>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <div className={`border border-border/80 transition-all duration-300 overflow-hidden ${user?.preferences.visualQuality ? 'glass-morphism rounded-2xl' : 'bg-card rounded-md shadow-sm'}`}>
                    <div className="h-10 bg-muted/20 border-b border-border/60 flex items-center justify-between px-4">
                        <div className="flex items-center gap-2">
                             <Shield size={14} className="text-emerald-500" />
                            <span className="text-[11px] font-semibold tracking-tight uppercase text-muted-foreground">Access Control & Notifications</span>
                        </div>
                    </div>
                    <div className="p-5 space-y-6">
                             <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest block">Authorized Role Governance (CSV)</label>
                            <input 
                                type="text" 
                                className="w-full bg-black/20 border border-border/50 rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-[#5865F2]/50 focus:border-[#5865F2]/50 transition-all placeholder:text-zinc-800 hover:border-primary/30"
                                placeholder="123456789, 987654321..."
                                value={botConfig.commandRoles?.join(', ') || ''}
                                onChange={(e) => updateBotConfig('commandRoles', e.target.value.split(',').map(s => s.trim()).filter(s => s))}
                            />
                        </div>

                         <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest block">Global Telemetry Channel</label>
                            <div className="relative flex items-center">
                                <div className="absolute left-3 text-zinc-700 pointer-events-none">
                                    <Hash size={12} />
                                </div>
                                <input 
                                    type="text" 
                                    className="w-full bg-black/20 border border-border/50 rounded-lg px-8 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-[#5865F2]/50 focus:border-[#5865F2]/50 transition-all placeholder:text-zinc-800 hover:border-primary/30"
                                    placeholder="98765432101234"
                                    value={botConfig.notificationChannel}
                                    onChange={(e) => updateBotConfig('notificationChannel', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Command Quick Reference */}
                <div className={`border border-border/80 transition-all duration-300 overflow-hidden ${user?.preferences.visualQuality ? 'glass-morphism rounded-2xl' : 'bg-card rounded-md shadow-sm'}`}>
                    <div className="h-10 bg-muted/20 border-b border-border/60 flex items-center justify-between px-4">
                        <div className="flex items-center gap-2">
                             <Terminal size={14} className="text-[#5865F2]" />
                            <span className="text-[11px] font-semibold tracking-tight uppercase text-muted-foreground">Slash Command Blueprint</span>
                        </div>
                    </div>
                    <div className="p-5 space-y-3">
                        {[
                            { cmd: '/list', desc: 'Queries all federated service instances.' },
                            { cmd: '/start <id>', desc: 'Initiates remote boot sequence.' },
                            { cmd: '/stop <id>', desc: 'Triggers controlled termination signal.' },
                            { cmd: '/status <id>', desc: 'Streams real-time health telemetry.' },
                        ].map(it => (
                            <div key={it.cmd} className="group transition-all p-2 rounded-lg hover:bg-black/10 border border-transparent hover:border-border/20">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-mono text-[#5865F2] font-black bg-[#5865F2]/10 px-2 py-0.5 rounded-lg border border-[#5865F2]/20">{it.cmd}</span>
                                    <span className="text-[8px] text-muted-foreground/40 font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Federated</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground font-medium pl-2 border-l-2 border-border/20 group-hover:border-[#5865F2]/40 transition-all leading-tight">{it.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
                    <div className="mt-6 pt-4 border-t border-border/20 flex items-center justify-between">
                         <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Bot Capability Matrix</p>
                         <div className="flex gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/20" />
                         </div>
                    </div>

                    <div className="bg-black/40 border border-border/40 rounded-xl overflow-hidden shadow-2xl flex flex-col font-sans">
                    <div className="px-4 py-2 bg-muted/20 border-b border-border/20 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Bot Console Stream</span>
                        </div>
                        <div className="flex gap-1.5 opacity-30">
                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                        </div>
                    </div>
                    <div className="p-4 font-mono text-[10px] space-y-2 min-h-[140px] max-h-[220px] overflow-y-auto scrollbar-thin">
                        <div className="flex gap-2 text-muted-foreground/60">
                            <span className="opacity-40 tabular-nums">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                            <span className="text-emerald-500 font-bold">[SYSTEM]</span>
                            <span>Awaiting gateway connection...</span>
                        </div>
                        {discordStatus.status === 'online' && discordStatus.user && (
                            <div className="flex gap-2 text-muted-foreground/60">
                                <span className="opacity-40 tabular-nums">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                                <span className="text-emerald-500 font-bold">[SYSTEM]</span>
                                <span className="text-emerald-400 font-semibold">IDENTIFIED AS {discordStatus.user.username}</span>
                            </div>
                        )}
                        {discordStatus.status === 'online' && (
                            <div className="flex gap-2 text-muted-foreground/40 animate-pulse">
                                <span className="opacity-30 tabular-nums">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                                <span className="text-primary font-bold">[HB]</span>
                                <span>Session heartbeat acknowledged.</span>
                            </div>
                        )}
                         <div className="flex gap-2 text-muted-foreground/60">
                            <span className="opacity-40 tabular-nums">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                            <span className="text-amber-500 font-bold">[WARN]</span>
                            <span>Instance state: STANDBY</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const canManageServerInt = can('server.integrations.manage', serverId);
    const canManageSystemInt = can('system.integrations.manage');

    if (!canManageServerInt && !canManageSystemInt && !can('server.integrations.read', serverId)) {
        return (
            <AccessDenied 
                title="Integrations Access Restricted"
                description="You do not have permission to view or manage integrations for this server. Please contact an administrator for access."
            />
        );
    }

    return (
        <div className="h-[calc(100vh-140px)] flex flex-col gap-6 font-sans">
             <div className="flex items-center gap-1.5 p-1 bg-[#09090b] rounded-lg border border-[rgb(var(--color-border-subtle))] w-fit">
                <button 
                    onClick={() => setActiveTab('webhooks')}
                    className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[0.15em] transition-all flex items-center gap-2 ${activeTab === 'webhooks' ? 'bg-[#27272a] text-white shadow-lg shadow-black/50 border border-[rgb(var(--color-border-default))]' : 'text-[rgb(var(--color-fg-subtle))] hover:text-[rgb(var(--color-fg-muted))] hover:bg-white/5 border border-transparent'}`}
                >
                    <Webhook size={12} /> Webhooks
                </button>
                <button 
                    onClick={() => setActiveTab('bot')}
                     className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[0.15em] transition-all flex items-center gap-2 ${activeTab === 'bot' ? 'bg-[#27272a] text-white shadow-lg shadow-black/50 border border-[rgb(var(--color-border-default))]' : 'text-[rgb(var(--color-fg-subtle))] hover:text-[rgb(var(--color-fg-muted))] hover:bg-white/5 border border-transparent'}`}
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
