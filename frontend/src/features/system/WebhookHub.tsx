import React, { useState, useEffect } from 'react';
import { 
    Webhook, 
    Plus, 
    Trash2, 
    Play, 
    Globe, 
    X,
    Loader2,
    AlertTriangle,
    Check,
    Settings2
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

const ALL_TRIGGERS: { id: WebhookTrigger; label: string }[] = [
    { id: 'SERVER_START', label: 'Server Start' },
    { id: 'SERVER_STOP', label: 'Server Stop' },
    { id: 'SERVER_CRASH', label: 'Server Crash' },
    { id: 'BACKUP_COMPLETE', label: 'Backup Complete' },
    { id: 'PLAYER_JOIN', label: 'Player Join' },
    { id: 'PLAYER_LEAVE', label: 'Player Leave' },
];

export const WebhookHub: React.FC = () => {
    const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const { addToast } = useToast();

    // Create modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newName, setNewName] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [newTriggers, setNewTriggers] = useState<WebhookTrigger[]>(['SERVER_START', 'SERVER_STOP']);
    const [newSecret, setNewSecret] = useState('');
    const [creating, setCreating] = useState(false);

    // Delete confirmation state
    const [deleteTarget, setDeleteTarget] = useState<WebhookConfig | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Test spinner state (per webhook)
    const [testingId, setTestingId] = useState<string | null>(null);

    // Editing state
    const [editingWebhook, setEditingWebhook] = useState<WebhookConfig | null>(null);

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

    const handleSave = async () => {
        if (!newName.trim()) {
            addToast('warning', 'Name Required', 'Enter a name for this webhook.');
            return;
        }
        if (!newUrl.trim() || !newUrl.startsWith('http')) {
            addToast('warning', 'Invalid URL', 'Enter a valid HTTP(S) endpoint URL.');
            return;
        }
        if (newTriggers.length === 0) {
            addToast('warning', 'Triggers Required', 'Select at least one event trigger.');
            return;
        }
        setCreating(true);
        try {
            const webhookData = {
                id: editingWebhook?.id,
                name: newName.trim(),
                url: newUrl.trim(),
                triggers: newTriggers,
                enabled: editingWebhook ? editingWebhook.enabled : true,
                secret: newSecret.trim() || undefined,
                failureCount: editingWebhook ? editingWebhook.failureCount : 0,
            };

            if (editingWebhook) {
                const result = await API.updateGlobalWebhook(editingWebhook.id, webhookData);
                setWebhooks(prev => prev.map(w => w.id === editingWebhook.id ? result : w));
                addToast('success', 'Webhook Updated', 'Configuration has been synchronized.');
            } else {
                const result = await API.createGlobalWebhook(webhookData);
                setWebhooks(prev => [...prev, result]);
                addToast('success', 'Webhook Registered', 'Endpoint has been configured and is now active.');
            }
            closeCreateModal();
        } catch (e: any) {
            addToast('error', 'Operation Failed', e.message || 'Could not save the webhook.');
        } finally {
            setCreating(false);
        }
    };

    const closeCreateModal = () => {
        setShowCreateModal(false);
        setEditingWebhook(null);
        setNewName('');
        setNewUrl('');
        setNewTriggers(['SERVER_START', 'SERVER_STOP']);
        setNewSecret('');
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await API.deleteGlobalWebhook(deleteTarget.id);
            setWebhooks(prev => prev.filter(w => w.id !== deleteTarget.id));
            addToast('success', 'Webhook Deleted', 'The endpoint was removed successfully.');
            setDeleteTarget(null);
        } catch (e) {
            addToast('error', 'Operation Failed', 'Could not delete the webhook.');
        } finally {
            setDeleting(false);
        }
    };

    const handleTest = async (id: string) => {
        setTestingId(id);
        try {
            const res = await API.testGlobalWebhook(id);
            if (res.success) {
                addToast('success', 'Webhook Test', 'Delivery confirmed. Status: ' + res.status);
            } else {
                addToast('warning', 'Webhook Test', 'Delivery attempted but failed: ' + res.error);
            }
        } catch (e) {
            addToast('error', 'Test Failed', 'Could not reach the webhook endpoint.');
        } finally {
            setTestingId(null);
        }
    };

    const handleEdit = (webhook: WebhookConfig) => {
        setEditingWebhook(webhook);
        setNewName(webhook.name);
        setNewUrl(webhook.url);
        setNewTriggers(webhook.triggers);
        setNewSecret(webhook.secret || '');
        setShowCreateModal(true);
    };

    const toggleTrigger = (trigger: WebhookTrigger) => {
        setNewTriggers(prev =>
            prev.includes(trigger) ? prev.filter(t => t !== trigger) : [...prev, trigger]
        );
    };

    const getAvailabilityStatus = (webhook: WebhookConfig) => {
        if (webhook.failureCount >= 5) return { label: 'FAILING', color: 'text-rose-500' };
        if (webhook.failureCount >= 2) return { label: 'DEGRADED', color: 'text-amber-500' };
        if (!webhook.enabled) return { label: 'DISABLED', color: 'text-muted-foreground' };
        return { label: 'NOMINAL', color: 'text-emerald-500' };
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold tracking-tight mb-1 flex items-center gap-2">
                        <Globe size={20} className="text-foreground" />
                        Outbound Webhook Hub
                    </h2>
                    <p className="text-xs text-muted-foreground font-medium">Send automatic notifications to external services when events happen on your servers.</p>
                </div>
                <button 
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded border border-border text-xs font-extrabold uppercase tracking-widest hover:bg-foreground/90 transition-all shadow-sm"
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
                    {webhooks.map((webhook) => {
                        const status = getAvailabilityStatus(webhook);
                        return (
                            <motion.div 
                                key={webhook.id}
                                variants={STAGGER_ITEM}
                                layout
                                className="bg-card border border-border/50 rounded p-5 relative overflow-hidden group hover:border-zinc-500/50 transition-all duration-300"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-secondary text-foreground rounded border border-border">
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
                                            disabled={testingId === webhook.id}
                                            className="p-1.5 hover:bg-secondary text-foreground rounded transition-colors disabled:opacity-50"
                                            title="Send Test Payload"
                                        >
                                            {testingId === webhook.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                                        </button>
                                        <button 
                                            onClick={() => handleEdit(webhook)}
                                            className="p-1.5 hover:bg-secondary text-foreground rounded transition-colors"
                                            title="Edit Endpoint"
                                        >
                                            <Settings2 size={14} />
                                        </button>
                                        <button 
                                            onClick={() => setDeleteTarget(webhook)}
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
                                                <span className={`text-[10px] font-bold ${status.color}`}>{status.label}</span>
                                            </div>
                                            <div className="w-px h-6 bg-border/20" />
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-tighter">Failures</span>
                                                <span className={`text-[10px] font-bold tabular-nums ${webhook.failureCount > 0 ? 'text-amber-500' : 'text-muted-foreground/60'}`}>
                                                    {webhook.failureCount}
                                                </span>
                                            </div>
                                        </div>
                                        <span className="text-[9px] font-mono text-muted-foreground/40">ID: {webhook.id.slice(0, 8)}</span>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                {webhooks.length === 0 && !loading && (
                    <div className="md:col-span-2 border border-dashed border-border/50 rounded-xl p-12 flex flex-col items-center justify-center text-center opacity-40">
                        <Globe size={32} className="mb-3 text-muted-foreground" />
                        <h3 className="text-sm font-bold mb-1">No endpoints configured</h3>
                        <p className="text-xs max-w-xs">Register your first webhook to start sending event notifications.</p>
                    </div>
                )}
            </motion.div>

            {/* ── Create Webhook Modal ── */}
            <AnimatePresence>
                {showCreateModal && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                            onClick={!creating ? closeCreateModal : undefined}
                        />
                        <motion.div
                            initial={{ opacity: 0, y: 15, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -15, scale: 0.98 }}
                            className="relative w-full max-w-lg bg-card border border-border shadow-xl rounded-xl overflow-hidden"
                        >
                            {/* Header */}
                            <div className="bg-muted/20 border-b border-border p-4 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                        {editingWebhook ? 'EDIT WEBHOOK ENDPOINT' : 'REGISTER WEBHOOK ENDPOINT'}
                                    </span>
                                </div>
                                {!creating && (
                                    <button onClick={closeCreateModal} className="text-muted-foreground/60 hover:text-foreground transition-colors p-1">
                                        <X size={16} />
                                    </button>
                                )}
                            </div>

                            {/* Form */}
                            <div className="p-6 space-y-5">
                                {/* Name input */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Endpoint Name</label>
                                    <input
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        placeholder="e.g. Discord Alerts, Monitoring Service"
                                        maxLength={64}
                                        className="w-full px-3 py-2 bg-secondary border border-border rounded text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all"
                                        autoFocus
                                        disabled={creating}
                                    />
                                </div>

                                {/* URL input */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Delivery URL</label>
                                    <input
                                        type="url"
                                        value={newUrl}
                                        onChange={(e) => setNewUrl(e.target.value)}
                                        placeholder="https://example.com/webhook"
                                        className="w-full px-3 py-2 bg-secondary border border-border rounded text-sm text-foreground font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all"
                                        disabled={creating}
                                    />
                                </div>

                                {/* Secret (optional) */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                        Signing Secret <span className="text-muted-foreground/40 normal-case tracking-normal font-medium">(optional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={newSecret}
                                        onChange={(e) => setNewSecret(e.target.value)}
                                        placeholder="Used to sign payloads for verification"
                                        className="w-full px-3 py-2 bg-secondary border border-border rounded text-sm text-foreground font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all"
                                        disabled={creating}
                                    />
                                </div>

                                {/* Trigger selection */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                        Event Triggers
                                        <span className="ml-2 text-foreground/40 normal-case tracking-normal font-medium">
                                            ({newTriggers.length} selected)
                                        </span>
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {ALL_TRIGGERS.map(trigger => {
                                            const isActive = newTriggers.includes(trigger.id);
                                            return (
                                                <button
                                                    key={trigger.id}
                                                    onClick={() => toggleTrigger(trigger.id)}
                                                    disabled={creating}
                                                    className={`text-center p-2 rounded border transition-all duration-200 ${
                                                        isActive
                                                            ? 'bg-foreground/5 border-foreground/20 text-foreground'
                                                            : 'bg-secondary/30 border-border/40 text-muted-foreground hover:border-border'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <div className={`w-2.5 h-2.5 rounded-sm border flex items-center justify-center transition-colors ${
                                                            isActive ? 'bg-foreground border-foreground' : 'border-border'
                                                        }`}>
                                                            {isActive && <Check size={7} className="text-background" />}
                                                        </div>
                                                        <span className="text-[9px] font-bold uppercase tracking-tight">{trigger.label}</span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center justify-end gap-3 pt-2 border-t border-border/30">
                                    <button
                                        onClick={closeCreateModal}
                                        disabled={creating}
                                        className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors rounded"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={creating || !newName.trim() || !newUrl.trim() || newTriggers.length === 0}
                                        className="flex items-center gap-2 bg-foreground text-background px-5 py-2 rounded text-xs font-extrabold uppercase tracking-widest hover:bg-foreground/90 disabled:opacity-40 transition-all"
                                    >
                                        {creating ? (
                                            <><Loader2 size={12} className="animate-spin" /> {editingWebhook ? 'Saving...' : 'Registering...'}</>
                                        ) : (
                                            <><Webhook size={12} /> {editingWebhook ? 'Update' : 'Register'}</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ── Delete Confirmation Modal ── */}
            <AnimatePresence>
                {deleteTarget && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                            onClick={!deleting ? () => setDeleteTarget(null) : undefined}
                        />
                        <motion.div
                            initial={{ opacity: 0, y: 15, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -15, scale: 0.98 }}
                            className="relative w-full max-w-sm bg-card border border-border shadow-xl rounded-xl overflow-hidden"
                        >
                            <div className="p-6 space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-rose-500/10 rounded-lg">
                                        <AlertTriangle size={18} className="text-rose-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-foreground">Delete Webhook</h3>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">This action cannot be undone.</p>
                                    </div>
                                </div>
                                <div className="p-3 bg-secondary/50 border border-border/50 rounded">
                                    <p className="text-xs text-muted-foreground">
                                        Endpoint <strong className="text-foreground">{deleteTarget.name}</strong> will stop receiving all event deliveries immediately.
                                    </p>
                                </div>
                                <div className="flex items-center justify-end gap-3">
                                    <button
                                        onClick={() => setDeleteTarget(null)}
                                        disabled={deleting}
                                        className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors rounded"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleDelete}
                                        disabled={deleting}
                                        className="flex items-center gap-2 bg-rose-500 text-white px-4 py-2 rounded text-xs font-extrabold uppercase tracking-widest hover:bg-rose-600 disabled:opacity-50 transition-all"
                                    >
                                        {deleting ? (
                                            <><Loader2 size={12} className="animate-spin" /> Deleting...</>
                                        ) : (
                                            <><Trash2 size={12} /> Delete</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
