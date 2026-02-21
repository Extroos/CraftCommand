import React, { useState, useEffect } from 'react';
import { 
    Webhook, 
    Plus, 
    Trash2, 
    Play, 
    Settings2, 
    Shield, 
    Globe, 
    CheckCircle2, 
    AlertCircle,
    Copy,
    ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { API } from '@features/core/services/api';
import { WebhookConfig, WebhookTrigger } from '@shared/types';
import { useToast } from '../ui/Toast';

const STAGGER_CONTAINER = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

const STAGGER_ITEM = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 }
};

export const WebhookHub: React.FC = () => {
    const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const { addToast } = useToast();

    const fetchWebhooks = async () => {
        try {
            const data = await API.getGlobalWebhooks();
            setWebhooks(data);
        } catch (e) {
            console.error('Failed to fetch webhooks:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWebhooks();
    }, []);

    const handleDelete = async (id: string) => {
        try {
            await API.deleteGlobalWebhook(id);
            setWebhooks(prev => prev.filter(w => w.id !== id));
            addToast('success', 'Webhook Deleted', 'The endpoint was removed successfully.');
        } catch (e) {
            addToast('error', 'Operation Failed', 'Could not delete the webhook.');
        }
    };

    const handleTest = async (id: string) => {
        try {
            const res = await API.testGlobalWebhook(id);
            if (res.success) {
                addToast('success', 'Webhook Test', 'Delivery confirmed. Status: ' + res.status);
            } else {
                addToast('warning', 'Webhook Test', 'Delivery attempted but failed: ' + res.error);
            }
        } catch (e) {
            addToast('error', 'Test Failed', 'Could not reach the webhook endpoint.');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold tracking-tight mb-1 flex items-center gap-2">
                        <Globe size={20} className="text-primary" />
                        Outbound Webhook Hub
                    </h2>
                    <p className="text-xs text-muted-foreground font-medium">Synchronize system events with external REST services and analytics platforms.</p>
                </div>
                <button 
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-bold hover:opacity-90 transition-all shadow-lg shadow-primary/10"
                >
                    <Plus size={14} /> Register Endpoint
                </button>
            </div>

            <motion.div 
                variants={STAGGER_CONTAINER}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
                <AnimatePresence mode="popLayout">
                    {webhooks.map((webhook) => (
                        <motion.div 
                            key={webhook.id}
                            variants={STAGGER_ITEM}
                            layout
                            className="bg-card glass-morphism border border-border/50 rounded-xl p-5 relative overflow-hidden group hover:border-primary/30 transition-all duration-300"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-primary/10 text-primary rounded-lg border border-primary/20">
                                        <Webhook size={16} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-foreground">{webhook.name}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`w-1.5 h-1.5 rounded-full ${webhook.enabled ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                                            <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[150px]">{webhook.url}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => handleTest(webhook.id)}
                                        className="p-1.5 hover:bg-primary/10 text-primary rounded-md transition-colors"
                                        title="Send Test Payload"
                                    >
                                        <Play size={14} />
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(webhook.id)}
                                        className="p-1.5 hover:bg-rose-500/10 text-rose-500 rounded-md transition-colors"
                                        title="Delete Endpoint"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex flex-wrap gap-1.5">
                                    {webhook.triggers.map((trigger) => (
                                        <span key={trigger} className="px-2 py-0.5 bg-secondary/50 text-[9px] font-bold text-muted-foreground uppercase tracking-widest rounded border border-border/30">
                                            {trigger.replace('_', ' ')}
                                        </span>
                                    ))}
                                </div>

                                <div className="pt-3 border-t border-border/20 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-tighter">Availability</span>
                                            <span className="text-[10px] font-bold text-emerald-500">NOMINAL</span>
                                        </div>
                                        <div className="w-px h-6 bg-border/20" />
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-tighter">Deliveries</span>
                                            <span className="text-[10px] font-bold tabular-nums">0</span>
                                        </div>
                                    </div>
                                    <span className="text-[9px] font-mono text-muted-foreground/40">ID: {webhook.id.slice(0, 8)}</span>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {webhooks.length === 0 && !loading && (
                    <div className="md:col-span-2 border border-dashed border-border/50 rounded-xl p-12 flex flex-col items-center justify-center text-center opacity-40">
                        <Globe size={32} className="mb-3 text-muted-foreground" />
                        <h3 className="text-sm font-bold mb-1">No endpoints configured</h3>
                        <p className="text-xs max-w-xs">Register your first webhook to begin orchestrating system-wide event flows.</p>
                    </div>
                )}
            </motion.div>
        </div>
    );
};
