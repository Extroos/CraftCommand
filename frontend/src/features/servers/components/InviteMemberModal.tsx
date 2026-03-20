import React, { useState } from 'react';
import { X, Mail, Shield, UserPlus, Loader2, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface InviteMemberModalProps {
    serverId: string;
    onClose: () => void;
    onInvite: (email: string, role: string) => Promise<void>;
}

const ROLES = [
    { id: 'admin', label: 'Administrator', description: 'Full access to all server functions and settings.', icon: Shield, color: 'text-rose-500' },
    { id: 'developer', label: 'Developer', description: 'Access to files, console, and power actions.', icon: UserPlus, color: 'text-blue-500' },
    { id: 'support', label: 'Support', description: 'Read-only access to console and basic stats.', icon: Mail, color: 'text-emerald-500' }
];

const InviteMemberModal: React.FC<InviteMemberModalProps> = ({ serverId, onClose, onInvite }) => {
    const [email, setEmail] = useState('');
    const [selectedRole, setSelectedRole] = useState(ROLES[1].id);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !selectedRole) return;

        setError(null);
        setIsSubmitting(true);
        try {
            await onInvite(email, selectedRole);
            setSuccess(true);
            setTimeout(() => onClose(), 2000);
        } catch (err: any) {
            setError(err.message || 'Failed to send invitation.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="max-w-md w-full bg-card rounded-xl shadow-2xl border border-border/50 overflow-hidden"
            >
                {/* Header */}
                <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            <UserPlus size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-foreground">Invite Team Member</h2>
                            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest opacity-60">Access Control Protocol</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-1 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {success ? (
                        <div className="py-8 flex flex-col items-center text-center space-y-4">
                            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500">
                                <CheckCircle2 size={32} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-foreground">Invitation Sent!</h3>
                                <p className="text-sm text-muted-foreground">Verification link dispatched to {email}.</p>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {error && (
                                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-3 text-xs text-rose-500 font-medium">
                                    <AlertCircle size={14} />
                                    {error}
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest">Email Address</label>
                                <div className="relative group">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors" size={14} />
                                    <input 
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="collaborator@example.com"
                                        className="w-full bg-muted/10 border border-border/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded-lg pl-10 pr-4 py-2.5 text-sm transition-all outline-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest">Permissions Role</label>
                                <div className="grid grid-cols-1 gap-2">
                                    {ROLES.map((role) => {
                                        const Icon = role.icon;
                                        const isSelected = selectedRole === role.id;
                                        return (
                                            <button
                                                key={role.id}
                                                type="button"
                                                onClick={() => setSelectedRole(role.id)}
                                                className={`flex items-start gap-3 p-3 rounded-lg border transition-all text-left group ${
                                                    isSelected 
                                                    ? 'bg-primary/5 border-primary/30 shadow-sm' 
                                                    : 'bg-muted/5 border-border/40 hover:border-border hover:bg-muted/10'
                                                }`}
                                            >
                                                <div className={`mt-0.5 p-1.5 rounded bg-background border border-border/50 ${isSelected ? role.color : 'text-muted-foreground'}`}>
                                                    <Icon size={14} />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className={`text-[11px] font-bold uppercase tracking-tight ${isSelected ? 'text-foreground' : 'text-muted-foreground/80'}`}>{role.label}</span>
                                                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                                                    </div>
                                                    <p className="text-[9px] text-muted-foreground/60 font-medium mt-0.5 leading-relaxed">{role.description}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm font-bold text-muted-foreground hover:bg-secondary transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !email}
                                    className="flex-[1.5] px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            <span>Processing</span>
                                        </>
                                    ) : (
                                        <>
                                            <UserPlus size={16} />
                                            <span>Dispatch Invite</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-muted/20 border-t border-border flex justify-center">
                    <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-tighter opacity-40">
                        Zero-Trust Security • Audit Trail Enabled
                    </p>
                </div>
            </motion.div>
        </div>
    );
};

export default InviteMemberModal;
