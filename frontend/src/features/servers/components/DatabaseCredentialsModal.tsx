import React from 'react';
import { motion } from 'framer-motion';
import { X, Database, Shield, Globe, Copy, Check, Terminal } from 'lucide-react';
import { MODAL_BACKDROP, MODAL_CONTENT } from '../../../styles/motion';
import { useToast } from '../../ui/Toast';

interface DatabaseCredentialsModalProps {
    db: any;
    onClose: () => void;
}

const DatabaseCredentialsModal: React.FC<DatabaseCredentialsModalProps> = ({ db, onClose }) => {
    const { addToast } = useToast();
    const [copiedField, setCopiedField] = React.useState<string | null>(null);

    const copyToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        addToast('success', 'Copied', `${field} copied to clipboard`);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const fields = [
        { label: 'Hostname', value: db.host, icon: Globe },
        { label: 'Username', value: db.username, icon: Shield },
        { label: 'Password', value: db.password || '••••••••••••••••', icon: Terminal, isPassword: true },
        { label: 'Database', value: db.name, icon: Database },
    ];

    return (
        <motion.div 
            variants={MODAL_BACKDROP}
            initial="hidden"
            animate="show"
            exit="exit"
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
        >
            <motion.div 
                variants={MODAL_CONTENT}
                className="w-full max-w-sm bg-card border border-border/80 rounded-2xl shadow-2xl overflow-hidden"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between bg-muted/20">
                    <div className="flex items-center gap-2">
                        <Shield size={18} className="text-primary" />
                        <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Secure Credentials</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-muted rounded-md transition-colors">
                        <X size={16} className="text-muted-foreground" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    <div className="flex items-center gap-3 p-3 bg-secondary/20 rounded-xl border border-border/40">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            <Database size={20} />
                        </div>
                        <div>
                            <div className="text-[11px] font-bold text-foreground capitalize">{db.name}</div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">{db.type || 'MySQL'} Instance</div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {fields.map((field) => (
                            <div key={field.label} className="space-y-1.5">
                                <label className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] ml-1">{field.label}</label>
                                <div className="group relative flex items-center">
                                    <div className="absolute left-3 text-muted-foreground/40 pointer-events-none">
                                        <field.icon size={12} />
                                    </div>
                                    <div className={`w-full bg-muted/20 border border-border/40 rounded-xl pl-9 pr-10 py-2.5 text-xs font-mono transition-all ${field.isPassword ? 'text-rose-300' : 'text-foreground'}`}>
                                        {field.value}
                                    </div>
                                    <button 
                                        onClick={() => copyToClipboard(field.value, field.label)}
                                        disabled={field.isPassword && !db.password}
                                        className="absolute right-2 p-1.5 text-muted-foreground/40 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                                    >
                                        {copiedField === field.label ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {!db.password && (
                        <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl flex gap-3 items-start">
                            <Terminal size={14} className="text-amber-500 mt-0.5" />
                            <p className="text-[9px] text-amber-500/80 font-medium leading-relaxed uppercase tracking-tighter italic">
                                For security reasons, existing passwords cannot be retrieved. If lost, they must be reset via administrative CLI or checked in the server's initial provisioning logs.
                            </p>
                        </div>
                    )}

                    <button 
                        onClick={onClose}
                        className="w-full py-3 bg-foreground text-background font-black text-[10px] uppercase tracking-[0.2em] rounded-xl hover:bg-foreground/90 active:scale-[0.98] transition-all shadow-xl shadow-black/20"
                    >
                        Acknowledge & Close
                    </button>
                </div>

                <div className="px-6 py-3 bg-rose-500/5 border-t border-rose-500/10 flex items-center justify-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-rose-500 animate-pulse" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-rose-500/60">Encrypted Session Data</span>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default DatabaseCredentialsModal;
