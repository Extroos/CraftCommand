import React, { useState, useEffect } from 'react';
import { 
    Key, 
    Plus, 
    Trash2, 
    Shield, 
    Eye, 
    EyeOff, 
    Copy, 
    Lock,
    X,
    Loader2,
    AlertTriangle,
    Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { API } from '@features/core/services/api';
import { ApiToken } from '@shared/types';
import { useToast } from '../ui/Toast';
import { format } from 'date-fns';

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
    hidden: { opacity: 0, scale: 0.95 },
    show: { opacity: 1, scale: 1 }
};

const AVAILABLE_SCOPES = [
    { id: 'server:read', label: 'Server Read', description: 'View server status and info' },
    { id: 'server:write', label: 'Server Write', description: 'Start, stop, restart servers' },
    { id: 'server:console', label: 'Console Access', description: 'Read and send console commands' },
    { id: 'server:files', label: 'File Access', description: 'Read and write server files' },
    { id: 'server:backups', label: 'Backup Management', description: 'Create and restore backups' },
    { id: 'server:players', label: 'Player Management', description: 'Manage player lists' },
    { id: 'system:read', label: 'System Read', description: 'View system settings and stats' },
    { id: 'system:write', label: 'System Write', description: 'Modify system configuration' },
];

export const TokenManager: React.FC = () => {
    const [tokens, setTokens] = useState<ApiToken[]>([]);
    const [loading, setLoading] = useState(true);
    const [visibleTokens, setVisibleTokens] = useState<Record<string, boolean>>({});
    const { addToast } = useToast();

    // Create modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newTokenName, setNewTokenName] = useState('');
    const [newTokenScopes, setNewTokenScopes] = useState<string[]>(['server:read']);
    const [creating, setCreating] = useState(false);
    const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null);

    // Delete confirmation state
    const [deleteTarget, setDeleteTarget] = useState<ApiToken | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fetchTokens = async () => {
        try {
            const data = await API.getApiTokens();
            setTokens(data);
        } catch (e) {
            console.error('Failed to fetch tokens:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTokens();
    }, []);

    const handleCreate = async () => {
        if (!newTokenName.trim()) {
            addToast('warning', 'Name Required', 'Please enter a name for the token.');
            return;
        }
        if (newTokenScopes.length === 0) {
            addToast('warning', 'Scopes Required', 'Select at least one permission scope.');
            return;
        }
        setCreating(true);
        try {
            const result = await API.createApiToken(newTokenName.trim(), newTokenScopes);
            setTokens(prev => [result, ...prev]);
            setNewlyCreatedToken(result.token);
            addToast('success', 'Token Created', 'Your new PAT has been generated. Copy it now — it won\'t be shown again.');
        } catch (e: any) {
            addToast('error', 'Creation Failed', e.message || 'Could not generate the token.');
        } finally {
            setCreating(false);
        }
    };

    const closeCreateModal = () => {
        setShowCreateModal(false);
        setNewTokenName('');
        setNewTokenScopes(['server:read']);
        setNewlyCreatedToken(null);
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await API.deleteApiToken(deleteTarget.id);
            setTokens(prev => prev.filter(t => t.id !== deleteTarget.id));
            addToast('success', 'Token Revoked', 'The API key has been invalidated.');
            setDeleteTarget(null);
        } catch (e) {
            addToast('error', 'Operation Failed', 'Could not delete the token.');
        } finally {
            setDeleting(false);
        }
    };

    const toggleScope = (scope: string) => {
        setNewTokenScopes(prev => 
            prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
        );
    };

    const toggleVisibility = (id: string) => {
        setVisibleTokens(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        addToast('success', 'Copied', 'Token copied to clipboard.');
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold tracking-tight mb-1 flex items-center gap-2">
                        <Key size={20} className="text-foreground" />
                        Infrastructure Access Tokens
                    </h2>
                    <p className="text-xs text-muted-foreground font-medium">Issue and manage Personal Access Tokens (PATs) for programmatic API access.</p>
                </div>
                <button 
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded border border-border text-xs font-extrabold uppercase tracking-widest hover:bg-foreground/90 transition-all shadow-sm"
                >
                    <Plus size={14} /> New PAT
                </button>
            </div>

            <motion.div 
                variants={STAGGER_CONTAINER}
                initial="hidden"
                animate="show"
                className="space-y-3"
            >
                {tokens.map((token) => (
                    <motion.div 
                        key={token.id}
                        variants={STAGGER_ITEM}
                        className="bg-card border border-border/50 rounded p-4 flex items-center justify-between group hover:border-zinc-500/50 transition-all duration-300"
                    >
                        <div className="flex items-center gap-4 flex-1">
                             <div className="p-3 bg-secondary rounded border border-border text-muted-foreground group-hover:text-foreground transition-colors">
                                <Lock size={18} />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-bold text-foreground">{token.name}</h3>
                                    <div className="flex gap-1">
                                        {token.scopes.slice(0, 2).map(s => (
                                            <span key={s} className="px-1.5 py-0.5 bg-secondary text-muted-foreground text-[8px] font-black uppercase tracking-wider rounded border border-border">
                                                {s}
                                            </span>
                                        ))}
                                        {token.scopes.length > 2 && <span className="text-[8px] text-muted-foreground">+{token.scopes.length - 2} more</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 mt-1.5">
                                    <div className="relative group/token px-2 py-1 bg-black/40 border border-border/30 rounded font-mono text-[10px] text-emerald-500/80 min-w-[200px]">
                                        {visibleTokens[token.id] ? token.token : '••••••••••••••••••••••••••••••••'}
                                        <button 
                                            onClick={() => toggleVisibility(token.id)}
                                            className="absolute right-2 top-1 opacity-0 group-hover/token:opacity-100 transition-opacity"
                                        >
                                            {visibleTokens[token.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                                        </button>
                                    </div>
                                    <button 
                                        onClick={() => copyToClipboard(token.token)}
                                        className="p-1 hover:text-foreground transition-colors"
                                    >
                                        <Copy size={12} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-6 text-right">
                            <div className="hidden sm:flex flex-col">
                                <span className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-tighter mb-0.5">Created On</span>
                                <span className="text-[10px] font-bold text-muted-foreground/80">{format(token.createdAt, 'MMM d, yyyy')}</span>
                            </div>
                            <div className="hidden sm:flex flex-col">
                                <span className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-tighter mb-0.5">Last Use</span>
                                <span className="text-[10px] font-bold text-emerald-500/70">{token.lastUsedAt ? format(token.lastUsedAt, 'HH:mm') : 'Never'}</span>
                            </div>
                            <button 
                                onClick={() => setDeleteTarget(token)}
                                className="p-2 hover:bg-rose-500/10 text-rose-500 rounded-lg transition-colors"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </motion.div>
                ))}

                {tokens.length === 0 && !loading && (
                    <div className="bg-secondary/20 border border-dashed border-border/50 rounded-xl p-10 flex flex-col items-center justify-center text-center opacity-30">
                        <Shield size={32} className="mb-3" />
                        <h3 className="text-xs font-bold">Safe Mode Enabled</h3>
                        <p className="text-[10px] max-w-xs">No active access tokens detected. Programmatic access is currently locked for this instance.</p>
                    </div>
                )}
            </motion.div>

            {/* ── Create Token Modal ── */}
            <AnimatePresence>
                {showCreateModal && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                            onClick={!creating && !newlyCreatedToken ? closeCreateModal : undefined}
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
                                        {newlyCreatedToken ? 'TOKEN GENERATED' : 'ISSUE NEW PAT'}
                                    </span>
                                </div>
                                {!creating && (
                                    <button onClick={closeCreateModal} className="text-muted-foreground/60 hover:text-foreground transition-colors p-1">
                                        <X size={16} />
                                    </button>
                                )}
                            </div>

                            {newlyCreatedToken ? (
                                /* ── Success View ── */
                                <div className="p-6 space-y-4">
                                    <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Check size={14} className="text-emerald-500" />
                                            <span className="text-xs font-bold text-emerald-500">Token Created Successfully</span>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">
                                            Copy this token now. For security, it will <strong>not</strong> be displayed in full again.
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 px-3 py-2 bg-black/40 border border-border/30 rounded font-mono text-[11px] text-emerald-500 break-all select-all">
                                                {newlyCreatedToken}
                                            </code>
                                            <button
                                                onClick={() => copyToClipboard(newlyCreatedToken)}
                                                className="p-2 bg-emerald-500/10 text-emerald-500 rounded hover:bg-emerald-500/20 transition-colors shrink-0"
                                            >
                                                <Copy size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        onClick={closeCreateModal}
                                        className="w-full py-2.5 bg-foreground text-background rounded text-xs font-extrabold uppercase tracking-widest hover:bg-foreground/90 transition-all"
                                    >
                                        Done
                                    </button>
                                </div>
                            ) : (
                                /* ── Create Form ── */
                                <div className="p-6 space-y-5">
                                    {/* Name input */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Token Name</label>
                                        <input
                                            type="text"
                                            value={newTokenName}
                                            onChange={(e) => setNewTokenName(e.target.value)}
                                            placeholder="e.g. CI/CD Pipeline, Bot Integration"
                                            maxLength={64}
                                            className="w-full px-3 py-2 bg-secondary border border-border rounded text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all"
                                            autoFocus
                                            disabled={creating}
                                        />
                                    </div>

                                    {/* Scope selection */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                            Permission Scopes
                                            <span className="ml-2 text-foreground/40 normal-case tracking-normal font-medium">
                                                ({newTokenScopes.length} selected)
                                            </span>
                                        </label>
                                        <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto custom-scrollbar">
                                            {AVAILABLE_SCOPES.map(scope => {
                                                const isActive = newTokenScopes.includes(scope.id);
                                                return (
                                                    <button
                                                        key={scope.id}
                                                        onClick={() => toggleScope(scope.id)}
                                                        disabled={creating}
                                                        className={`text-left p-2.5 rounded border transition-all duration-200 ${
                                                            isActive
                                                                ? 'bg-foreground/5 border-foreground/20 text-foreground'
                                                                : 'bg-secondary/30 border-border/40 text-muted-foreground hover:border-border'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <div className={`w-3 h-3 rounded-sm border flex items-center justify-center transition-colors ${
                                                                isActive ? 'bg-foreground border-foreground' : 'border-border'
                                                            }`}>
                                                                {isActive && <Check size={8} className="text-background" />}
                                                            </div>
                                                            <span className="text-[10px] font-bold uppercase tracking-tight">{scope.label}</span>
                                                        </div>
                                                        <p className="text-[9px] text-muted-foreground/60 pl-5">{scope.description}</p>
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
                                            onClick={handleCreate}
                                            disabled={creating || !newTokenName.trim() || newTokenScopes.length === 0}
                                            className="flex items-center gap-2 bg-foreground text-background px-5 py-2 rounded text-xs font-extrabold uppercase tracking-widest hover:bg-foreground/90 disabled:opacity-40 transition-all"
                                        >
                                            {creating ? (
                                                <><Loader2 size={12} className="animate-spin" /> Generating...</>
                                            ) : (
                                                <><Key size={12} /> Generate Token</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
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
                                        <h3 className="text-sm font-bold text-foreground">Revoke Access Token</h3>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">This action is irreversible.</p>
                                    </div>
                                </div>
                                <div className="p-3 bg-secondary/50 border border-border/50 rounded">
                                    <p className="text-xs text-muted-foreground">
                                        Token <strong className="text-foreground">{deleteTarget.name}</strong> will be permanently invalidated. 
                                        Any applications using this token will immediately lose access.
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
                                            <><Loader2 size={12} className="animate-spin" /> Revoking...</>
                                        ) : (
                                            <><Trash2 size={12} /> Revoke Token</>
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
