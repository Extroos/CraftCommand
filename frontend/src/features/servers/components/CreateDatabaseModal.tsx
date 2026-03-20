import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Database, Shield, Globe, Terminal, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { MODAL_BACKDROP, MODAL_CONTENT } from '../../../styles/motion';

interface CreateDatabaseModalProps {
    serverId: string;
    onClose: () => void;
    onCreate: (data: { name: string; type: string; host: string }) => Promise<void>;
}

const CreateDatabaseModal: React.FC<CreateDatabaseModalProps> = ({ serverId, onClose, onCreate }) => {
    const [step, setStep] = useState<'FORM' | 'SUCCESS'>('FORM');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        name: `s${serverId.substring(0, 4)}_`,
        type: 'MySQL 8.0',
        host: 'db1.craft-commands.internal'
    });
    const [error, setError] = useState<string | null>(null);
    const [createdDb, setCreatedDb] = useState<any>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validation
        if (!formData.name.trim() || formData.name.length < 5) {
            setError('Database name must be at least 5 characters');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await onCreate(formData);
            setCreatedDb(result);
            setStep('SUCCESS');
        } catch (err: any) {
            setError(err.message || 'Failed to provision database. Internal cluster error.');
        } finally {
            setIsSubmitting(false);
        }
    };

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
                className="w-full max-w-md bg-card border border-border/80 rounded-2xl shadow-2xl overflow-hidden"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between bg-muted/20">
                    <div className="flex items-center gap-2">
                        <Database size={18} className="text-primary" />
                        <h2 className="text-sm font-black uppercase tracking-widest">Provision Database</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-muted rounded-md transition-colors">
                        <X size={16} className="text-muted-foreground" />
                    </button>
                </div>

                <div className="p-6">
                    {step === 'FORM' ? (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {error && (
                                <div className="p-3 bg-rose-500/5 border border-rose-500/20 rounded-lg flex items-center gap-3 text-rose-500 text-[10px] font-bold uppercase tracking-tight">
                                    <AlertCircle size={14} />
                                    {error}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em]">Database Name</label>
                                    <div className="relative">
                                        <Terminal size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                                        <input 
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                                            className="w-full bg-muted/20 border border-border/40 rounded-lg pl-9 pr-4 py-2.5 text-xs font-mono text-foreground focus:ring-1 focus:ring-primary/40 outline-none transition-all"
                                            placeholder="my_app_db"
                                            disabled={isSubmitting}
                                        />
                                    </div>
                                    <p className="text-[9px] text-muted-foreground/60 italic lowercase">Must start with your server prefix.</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em]">Engine</label>
                                        <select 
                                            value={formData.type}
                                            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                            className="w-full bg-muted/20 border border-border/40 rounded-lg px-3 py-2.5 text-xs font-bold text-foreground focus:ring-1 focus:ring-primary/40 outline-none transition-all appearance-none"
                                            disabled={isSubmitting}
                                        >
                                            <option>MySQL 8.0</option>
                                            <option>MariaDB 10.6</option>
                                            <option>PostgreSQL 14</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em]">Cluster Host</label>
                                        <div className="w-full bg-muted/10 border border-border/20 rounded-lg px-3 py-2.5 text-xs font-bold text-muted-foreground/40 italic truncate">
                                            db1.internal
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-border/40">
                                <button 
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full py-3 bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-[0.2em] rounded-lg shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                                    {isSubmitting ? 'Provisioning...' : 'Provision Instance'}
                                </button>
                                <p className="text-center text-[9px] text-muted-foreground/40 mt-4 uppercase tracking-tighter">
                                    By creating a database, you agree to our fair-use resource policy.
                                </p>
                            </div>
                        </form>
                    ) : (
                        <div className="py-8 text-center space-y-4">
                            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
                                <CheckCircle2 size={32} className="text-emerald-500" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Database Provisioned</h3>
                                <p className="text-[10px] text-muted-foreground font-medium mt-1">
                                    Your secure instance `{formData.name}` is now online and ready for connections.
                                </p>
                            </div>
                            <div className="p-4 bg-muted/20 border border-border/40 rounded-lg text-left space-y-2">
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="font-black text-muted-foreground/40 uppercase">Username</span>
                                    <code className="text-primary font-bold">{createdDb?.username || 'Provisioning...'}</code>
                                </div>
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="font-black text-muted-foreground/40 uppercase">Password</span>
                                    <code className="text-foreground font-mono">{createdDb?.password || '(Check console logs)'}</code>
                                </div>
                            </div>
                            <button 
                                onClick={onClose}
                                className="w-full py-2.5 bg-secondary hover:bg-muted text-foreground font-bold text-[10px] uppercase tracking-widest rounded-lg transition-all"
                            >
                                Close Manager
                            </button>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

export default CreateDatabaseModal;
