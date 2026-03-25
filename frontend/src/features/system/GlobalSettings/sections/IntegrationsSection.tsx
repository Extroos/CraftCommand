import React from 'react';
import { MessageSquare, Link, Key, Shield, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { STAGGER_ITEM } from '../../../../styles/motion';
import { GlobalSettings, UserProfile } from '@shared/types';
import { WebhookHub } from '../../WebhookHub';
import { TokenManager } from '../../TokenManager';
import { API } from '@core/services/api';
import { useToast } from '../../../ui/Toast';

interface IntegrationsSectionProps {
    settings: GlobalSettings;
    setSettings: (settings: GlobalSettings) => void;
    user: UserProfile | null;
}

export const IntegrationsSection: React.FC<IntegrationsSectionProps> = ({ settings, setSettings, user }) => {
    const [activeTab, setActiveTab ] = React.useState<'discord' | 'webhooks' | 'tokens'>('discord');
    const [botStatus, setBotStatus] = React.useState<{ online: boolean, guilds: number, username: string | null }>({ online: false, guilds: 0, username: null });
    const { addToast } = useToast();

    React.useEffect(() => {
        if (activeTab === 'discord') {
            fetchBotStatus();
        }
    }, [activeTab]);

    const fetchBotStatus = async () => {
        try {
            const status = await API.getDiscordStatus();
            setBotStatus(status);
        } catch (e) {
            console.error('Failed to fetch bot status');
        }
    };

    const syncDiscordCommands = async () => {
        try {
            await API.syncDiscordCommands();
            addToast('success', 'Discord Bot', 'Slash commands synced successfully');
        } catch (e: any) {
            addToast('error', 'Discord Bot', 'Sync failed: ' + e.message);
        }
    };

    return (
        <div className="space-y-6">
            {/* Integration Tabs */}
            <div className="flex bg-secondary/30 p-1 rounded-lg border border-border/50 max-w-fit">
                <button
                    onClick={() => setActiveTab('discord')}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded text-xs font-bold transition-all ${
                        activeTab === 'discord' ? 'bg-zinc-800 text-white border border-white/10' : 'text-muted-foreground hover:bg-secondary'
                    }`}
                >
                    <MessageSquare size={14} /> Discord Bot
                </button>
                <button
                    onClick={() => setActiveTab('webhooks')}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded text-xs font-bold transition-all ${
                        activeTab === 'webhooks' ? 'bg-zinc-800 text-white border border-white/10' : 'text-muted-foreground hover:bg-secondary'
                    }`}
                >
                    <Link size={14} /> Webhook Hub
                </button>
                <button
                    onClick={() => setActiveTab('tokens')}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded text-xs font-bold transition-all ${
                        activeTab === 'tokens' ? 'bg-zinc-800 text-white border border-white/10' : 'text-muted-foreground hover:bg-secondary'
                    }`}
                >
                    <Key size={14} /> Token Manager
                </button>
            </div>

            <AnimatePresence mode="wait">
                {activeTab === 'discord' && (
                    <motion.div 
                        key="discord"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="space-y-6"
                    >
                        <div className="border border-border p-5 bg-card rounded transition-all duration-300">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-secondary rounded border border-border text-foreground">
                                        <MessageSquare size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold tracking-tight text-foreground">Discord Integration</h3>
                                        <p className="text-[10px] font-medium text-muted-foreground">Receive alerts and manage servers from your Discord.</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-bold border ${botStatus.online ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${botStatus.online ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                                        {botStatus.online ? 'CONNECTED' : 'OFFLINE'}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-muted-foreground/70 uppercase tracking-wider">Application Bot Token</label>
                                            <div className="relative group">
                                                <input 
                                                    type="password" 
                                                    className="flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-xs ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all group-hover:bg-background"
                                                    placeholder="Enter your Discord application token"
                                                    value={settings.discordBot?.token || ''}
                                                    onChange={(e) => setSettings({
                                                        ...settings,
                                                        discordBot: { ...(settings.discordBot || { clientId: '' }), token: e.target.value }
                                                    })}
                                                />
                                                <div className="absolute right-3 top-3 text-muted-foreground pointer-events-none opacity-50">
                                                    <Key size={14} />
                                                </div>
                                            </div>
                                            <p className="text-[9px] text-muted-foreground font-medium italic">Create a bot at discord.com/developers and paste the token here.</p>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-muted-foreground/70 uppercase tracking-wider">Alert Channel ID</label>
                                            <input 
                                                type="text" 
                                                className="flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-xs ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all"
                                                placeholder="Channel ID for server notifications"
                                                value={settings.discordBot?.notificationChannel || ''}
                                                onChange={(e) => setSettings({
                                                    ...settings,
                                                    discordBot: { ...(settings.discordBot || { token: '', clientId: '' }), notificationChannel: e.target.value }
                                                })}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4 flex flex-col justify-end">
                                        <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                                            <div className="flex items-start gap-3">
                                            <Shield size={18} className="text-zinc-500 shrink-0 mt-0.5" />
                                                <div>
                                                    <h4 className="font-bold text-[11px] mb-1">Slash Commands Support</h4>
                                                    <p className="text-[9px] text-muted-foreground font-medium leading-relaxed mb-3">
                                                        Enable /start, /stop, and /status commands directly from your Discord server. Requires syncing commands to your application.
                                                    </p>
                                                    <button 
                                                        onClick={syncDiscordCommands}
                                                        className="flex items-center gap-2 px-3 py-1.5 bg-foreground text-background border border-border rounded text-[10px] font-extrabold uppercase tracking-widest hover:bg-foreground/90 transition-all shadow-sm">
                                                        <RefreshCw size={12} /> Sync Commands Now
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'webhooks' && (
                    <motion.div 
                        key="webhooks"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <WebhookHub />
                    </motion.div>
                )}

                {activeTab === 'tokens' && (
                    <motion.div 
                        key="tokens"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <TokenManager />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
