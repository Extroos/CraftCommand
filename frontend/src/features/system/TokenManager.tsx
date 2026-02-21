import React, { useState, useEffect } from 'react';
import { 
    Key, 
    Plus, 
    Trash2, 
    Shield, 
    Eye, 
    EyeOff, 
    Copy, 
    Clock, 
    Zap,
    Lock,
    Unlock
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

export const TokenManager: React.FC = () => {
    const [tokens, setTokens] = useState<ApiToken[]>([]);
    const [loading, setLoading] = useState(true);
    const [visibleTokens, setVisibleTokens] = useState<Record<string, boolean>>({});
    const { addToast } = useToast();

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

    const handleDelete = async (id: string) => {
        try {
            await API.deleteApiToken(id);
            setTokens(prev => prev.filter(t => t.id !== id));
            addToast('success', 'Token Revoked', 'The API key has been invalidated.');
        } catch (e) {
            addToast('error', 'Operation Failed', 'Could not delete the token.');
        }
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
                        <Key size={20} className="text-primary" />
                        Infrastructure Access Tokens
                    </h2>
                    <p className="text-xs text-muted-foreground font-medium">Issue and manage Personal Access Tokens (PATs) for programmatic API access.</p>
                </div>
                <button 
                    onClick={() => {/* Trigger Create Flow */}}
                    className="flex items-center gap-2 bg-zinc-100 text-black px-4 py-2 rounded-lg text-xs font-black hover:bg-white transition-all shadow-lg"
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
                        className="bg-card/50 glass-morphism border border-border/50 rounded-xl p-4 flex items-center justify-between group hover:border-primary/20 transition-all duration-300"
                    >
                        <div className="flex items-center gap-4 flex-1">
                            <div className="p-3 bg-secondary/50 rounded-lg text-muted-foreground group-hover:text-primary transition-colors">
                                <Lock size={18} />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-bold text-foreground">{token.name}</h3>
                                    <div className="flex gap-1">
                                        {token.scopes.slice(0, 2).map(s => (
                                            <span key={s} className="px-1.5 py-0.5 bg-primary/5 text-primary text-[8px] font-black uppercase tracking-wider rounded border border-primary/10">
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
                                        className="p-1 hover:text-primary transition-colors"
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
                                onClick={() => handleDelete(token.id)}
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
        </div>
    );
};
