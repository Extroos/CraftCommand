import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Webhook, Plus, Trash2, Play, Check, AlertCircle, Loader2, Save, X, Settings2, Bell, Link, Info, Activity } from 'lucide-react';
import { STAGGER_CONTAINER, STAGGER_ITEM } from '../../../styles/motion';

import { API } from '@core/services/api';
import { useToast } from '../../ui/Toast';
import { WebhookConfig, WebhookTrigger } from '@shared/types';

interface ExtensionsManagerProps {
    serverId: string;
}

const AVAILABLE_TRIGGERS: { value: WebhookTrigger; label: string; description: string }[] = [
    { value: 'SERVER_START', label: 'Server Start', description: 'Triggered when the server finishes starting up.' },
    { value: 'SERVER_STOP', label: 'Server Stop', description: 'Triggered when the server is stopped.' },
    { value: 'SERVER_CRASH', label: 'Server Crash', description: 'Triggered when the server process crashes.' },
    { value: 'BACKUP_COMPLETE', label: 'Backup Complete', description: 'Triggered after a successful backup.' },
    { value: 'PLAYER_JOIN', label: 'Player Join', description: 'Triggered when a player connects to the server.' },
    { value: 'PLAYER_LEAVE', label: 'Player Leave', description: 'Triggered when a player disconnects.' },
];

export const ExtensionsManager: React.FC<ExtensionsManagerProps> = ({ serverId }) => {
    const { addToast } = useToast();
    const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);

    const [form, setForm] = useState<Partial<WebhookConfig>>({
        name: '',
        url: '',
        enabled: true,
        triggers: ['SERVER_CRASH', 'SERVER_START']
    });

    useEffect(() => {
        loadWebhooks();
    }, [serverId]);

    const loadWebhooks = async () => {
        setIsLoading(true);
        try {
            const data = await API.getWebhooks(serverId);
            setWebhooks(data);
        } catch (e: any) {
            addToast('error', 'Fetch Failed', e.message || 'Failed to load webhooks');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!form.name || !form.url) {
            addToast('warning', 'Missing Info', 'Please provide a name and URL for the webhook.');
            return;
        }

        setIsSaving(true);
        try {
            await API.createWebhook(serverId, form);
            addToast('success', 'Webhook Created', 'Extension has been added successfully.');
            setShowAddForm(false);
            setForm({ name: '', url: '', enabled: true, triggers: ['SERVER_CRASH', 'SERVER_START'] });
            loadWebhooks();
        } catch (e: any) {
            addToast('error', 'Creation Failed', e.message || 'Failed to create webhook');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await API.deleteWebhook(id);
            addToast('success', 'Webhook Deleted', 'Extension removed.');
            loadWebhooks();
        } catch (e: any) {
            addToast('error', 'Delete Failed', e.message || 'Failed to remove webhook');
        }
    };

    const handleTest = async (id: string) => {
        setTestingId(id);
        try {
            const res = await API.testWebhook(id);
            if (res.success) {
                addToast('success', 'Test Success', `Webhook responded with status ${res.status}`);
            } else {
                addToast('error', 'Test Failed', `Webhook responded with status ${res.status}`);
            }
        } catch (e: any) {
            addToast('error', 'Test Error', e.message || 'Failed to trigger test webhook');
        } finally {
            setTestingId(null);
        }
    };

    const toggleTrigger = (trigger: WebhookTrigger) => {
        setForm(prev => {
            const triggers = prev.triggers || [];
            if (triggers.includes(trigger)) {
                return { ...prev, triggers: triggers.filter(t => t !== trigger) };
            } else {
                return { ...prev, triggers: [...triggers, trigger] };
            }
        });
    };

    return (
        <motion.div 
            variants={STAGGER_CONTAINER}
            initial="hidden"
            animate="show"
            className="space-y-4"
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-muted/40 border border-border">
                        <Webhook size={14} className="text-primary/70" />
                    </div>
                    <div>
                        <h3 className="text-xs font-bold text-foreground/90 uppercase tracking-wider">Webhook Extensions</h3>
                        <p className="text-[9px] text-muted-foreground/50 font-medium tracking-tight">Dispatch real-time server events to external HTTP endpoints.</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-1.5 rounded-md text-[10px] font-bold tracking-tight flex items-center gap-2 transition-all shadow-sm"
                >
                    {showAddForm ? <X size={12} /> : <Plus size={12} />}
                    {showAddForm ? 'Cancel' : 'New Extension'}
                </button>
            </div>

            <AnimatePresence>
                {showAddForm && (
                    <motion.div
                        initial={{ opacity: 0, height: 0, scale: 0.98 }}
                        animate={{ opacity: 1, height: 'auto', scale: 1 }}
                        exit={{ opacity: 0, height: 0, scale: 0.98 }}
                        className="overflow-hidden"
                    >
                        <div className="border border-border/80 p-6 glass-morphism rounded-2xl bg-card/20 space-y-4 mb-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5 group">
                                    <label className="text-[11px] font-bold text-muted-foreground/80 lowercase tracking-normal flex items-center gap-1.5">
                                        <Info size={10} className="text-primary/60" /> Display Name
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Discord Server Alerts"
                                        value={form.name}
                                        onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                                        className="w-full bg-background border border-border/60 rounded-md px-3 py-1.5 text-[11px] font-semibold text-foreground outline-none focus:border-primary transition-colors"
                                    />
                                </div>
                                <div className="space-y-1.5 group">
                                    <label className="text-[11px] font-bold text-muted-foreground/80 lowercase tracking-normal flex items-center gap-1.5">
                                        <Link size={10} className="text-primary/60" /> Payload URL
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="https://discord.com/api/webhooks/..."
                                        value={form.url}
                                        onChange={e => setForm(prev => ({ ...prev, url: e.target.value }))}
                                        className="w-full bg-background border border-border/60 rounded-md px-3 py-1.5 text-[11px] font-mono text-primary/80 outline-none focus:border-primary transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-muted-foreground/80 lowercase tracking-normal flex items-center gap-1.5">
                                    <Bell size={10} className="text-primary/60" /> Event Subscriptions
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-2">
                                    {AVAILABLE_TRIGGERS.map(t => (
                                        <button
                                            key={t.value}
                                            onClick={() => toggleTrigger(t.value)}
                                            className={`flex items-start gap-2.5 p-2 rounded-lg border transition-all text-left group ${
                                                form.triggers?.includes(t.value)
                                                ? 'bg-primary/5 border-primary/30 ring-1 ring-primary/10'
                                                : 'bg-muted/5 border-border/40 hover:border-border/80'
                                            }`}
                                        >
                                            <div className={`mt-0.5 p-1 rounded ${form.triggers?.includes(t.value) ? 'bg-primary/20 text-primary' : 'bg-muted/20 text-muted-foreground/40'}`}>
                                                <Activity size={10} />
                                            </div>
                                            <div>
                                                <div className={`text-[10px] font-bold tracking-tight ${form.triggers?.includes(t.value) ? 'text-foreground' : 'text-muted-foreground/60'}`}>{t.label}</div>
                                                <div className="text-[8px] text-muted-foreground/30 leading-tight truncate">{t.description}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end pt-2">
                                <button
                                    onClick={handleCreate}
                                    disabled={isSaving}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-1.5 rounded-md text-[10px] font-bold tracking-tight flex items-center gap-2 transition-all shadow-sm"
                                >
                                    {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                    {isSaving ? 'Registering...' : 'Register Webhook'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="space-y-2">
                {isLoading ? (
                    <div className="py-12 flex flex-col items-center gap-3 text-muted-foreground/20">
                        <Loader2 size={24} className="animate-spin" />
                        <span className="text-[10px] font-bold tracking-[0.2em] uppercase">Checking Integrations</span>
                    </div>
                ) : webhooks.length === 0 ? (
                    <motion.div 
                        variants={STAGGER_ITEM}
                        className="border border-dashed border-border/40 rounded-2xl py-12 flex flex-col items-center gap-3 text-center opacity-40 grayscale"
                    >
                        <Webhook size={32} strokeWidth={1} />
                        <div>
                            <h4 className="text-[11px] font-bold text-foreground">Zero Integrations</h4>
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">Automate your workflow by pushing events to external services.</p>
                        </div>
                    </motion.div>
                ) : (
                    <div className="space-y-2">
                        {webhooks.map(wh => (
                            <motion.div
                                key={wh.id}
                                variants={STAGGER_ITEM}
                                className="border border-border/80 p-4 rounded-xl glass-morphism bg-card/20 flex items-center justify-between group hover:border-primary/40 transition-colors"
                            >
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className={`p-2 rounded-md border ${wh.failureCount > 5 ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-primary/10 border-primary/20 text-primary'}`}>
                                        <Webhook size={16} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-[11px] font-bold text-foreground truncate">{wh.name}</h4>
                                            {wh.enabled ? (
                                                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase tracking-widest border border-emerald-500/20 shadow-sm shadow-emerald-500/5">
                                                    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
                                                    Online
                                                </div>
                                            ) : (
                                                <span className="px-1.5 py-0.5 rounded-[4px] bg-muted/20 text-muted-foreground/40 text-[8px] font-black uppercase tracking-widest border border-border/20">Muted</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <p className="text-[9px] font-mono text-muted-foreground/40 truncate flex-1">{wh.url}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {wh.triggers.map(t => (
                                                <span key={t} className="px-1.5 py-0.5 rounded bg-muted/10 text-[8px] font-bold text-muted-foreground uppercase border border-border/10">
                                                    {t.replace('SERVER_', '').replace('_', ' ')}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5 ml-4">
                                    {wh.failureCount > 0 && (
                                        <div className="flex items-center gap-1 text-rose-500 bg-rose-500/5 px-2 py-1 rounded border border-rose-500/10 mr-1" title={`${wh.failureCount} recent failures`}>
                                            <AlertCircle size={10} />
                                            <span className="text-[9px] font-black">{wh.failureCount}</span>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => handleTest(wh.id)}
                                        disabled={testingId === wh.id}
                                        className="p-2 hover:bg-emerald-500/10 rounded-md text-muted-foreground/40 hover:text-emerald-500 transition-colors shadow-none"
                                        title="Trigger Test Payload"
                                    >
                                        {testingId === wh.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(wh.id)}
                                        className="p-2 hover:bg-rose-500/10 rounded-md text-muted-foreground/40 hover:text-rose-500 transition-colors shadow-none"
                                        title="Delete Webhook"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </motion.div>
    );
};

