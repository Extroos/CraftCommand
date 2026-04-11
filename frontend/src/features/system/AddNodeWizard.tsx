import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Server, Plus, X, Monitor, Globe, ChevronRight, 
    Download, Terminal, Copy, Check, Wifi, AlertCircle
} from 'lucide-react';
import { NodeInfo } from '@shared/types';
import { API } from '@core/services/api';

interface AddNodeWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (node: NodeInfo) => void;
}

type WizardStep = 'MODE' | 'NAME' | 'PROVISIONING' | 'WAITING' | 'SUCCESS';

export const AddNodeWizard: React.FC<AddNodeWizardProps> = ({ isOpen, onClose, onSuccess }) => {
    const [step, setStep] = useState<WizardStep>('MODE');
    const [mode, setMode] = useState<'lan' | 'manual'>('lan');
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [nodeData, setNodeData] = useState<{ id?: string, secret?: string, token?: string }>({});
    const [copied, setCopied] = useState(false);

    const handlePreEnroll = async () => {
        if (!name.trim()) return;
        setLoading(true);
        try {
            const res = await API.preEnrollNode({ 
                name: name.trim(),
                mode: mode === 'lan' ? 'lan' : 'internet'
            });
            setNodeData(res);
            setStep('PROVISIONING');
        } catch (err) {
            console.error('Failed to pre-enroll:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        if (!nodeData.id || !nodeData.token) return;
        const url = `${import.meta.env.VITE_API_URL || '/api'}/nodes/enroll-wizard/download/${nodeData.id}?token=${nodeData.token}`;
        window.open(url, '_blank');
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="bg-card border border-border rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-8 border-b border-border/50 bg-secondary/5">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                                <Server className="text-primary" size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-foreground tracking-tight">Expand Infrastructure</h3>
                                <p className="text-sm text-muted-foreground">Add a new remote machine.</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary text-muted-foreground transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="p-8">
                        {step === 'MODE' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 gap-4">
                                    <button
                                        onClick={() => { setMode('lan'); setStep('NAME'); }}
                                        className="group flex items-start gap-6 p-6 rounded-2xl border border-border bg-card hover:border-primary hover:bg-primary/5 transition-all text-left shadow-sm"
                                    >
                                        <div className="w-14 h-14 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/10">
                                            <Monitor size={28} className="text-emerald-500" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-lg font-bold text-foreground">Local Machine / LAN</span>
                                                <ChevronRight size={20} className="text-muted-foreground group-hover:text-primary transition-colors" />
                                            </div>
                                            <p className="text-sm text-muted-foreground leading-relaxed">
                                                Perfect for repurposing an old PC or another computer in your house. Uses a simple auto-config script.
                                            </p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => { setMode('manual'); setStep('NAME'); }}
                                        className="group flex items-start gap-6 p-6 rounded-2xl border border-border bg-card hover:border-violet-500 hover:bg-violet-500/5 transition-all text-left shadow-sm"
                                    >
                                        <div className="w-14 h-14 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0 border border-violet-500/10">
                                            <Globe size={28} className="text-violet-500" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-lg font-bold text-foreground">Cloud VPS / Internet</span>
                                                <ChevronRight size={20} className="text-muted-foreground group-hover:text-violet-500 transition-colors" />
                                            </div>
                                            <p className="text-sm text-muted-foreground leading-relaxed">
                                                For high-performance cloud servers (AWS, DigitalOcean, Hetzner). Requires manual IP/Port configuration.
                                            </p>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 'NAME' && (
                            <div className="space-y-8 py-4">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 px-1">
                                        Assign a Descriptor
                                    </label>
                                    <div className="relative">
                                        <input
                                            autoFocus
                                            type="text"
                                            value={name}
                                            onChange={e => setName(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && name && handlePreEnroll()}
                                            placeholder="e.g. secondary-worker-01"
                                            className="w-full px-6 py-4 bg-secondary/20 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-lg font-medium"
                                        />
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/30">
                                            <Plus size={24} />
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground px-1">
                                        This name will identify the machine in your Dashboard.
                                    </p>
                                </div>

                                <div className="flex gap-4">
                                    <button onClick={() => setStep('MODE')} className="flex-1 py-4 text-sm font-bold border border-border rounded-2xl hover:bg-secondary transition-all">
                                        Back
                                    </button>
                                    <button
                                        onClick={handlePreEnroll}
                                        disabled={!name.trim() || loading}
                                        className="flex-[2] py-4 bg-primary text-primary-foreground rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {loading ? <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> : 'Initialize Node'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 'PROVISIONING' && (
                            <div className="space-y-8">
                                <div className="p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 flex gap-4">
                                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20">
                                        <Check className="text-emerald-500" size={24} />
                                    </div>
                                    <div>
                                        <h4 className="text-lg font-bold text-emerald-500 mb-1">Initialization Successful</h4>
                                        <p className="text-sm text-muted-foreground leading-relaxed">Your node is reserved. Follow these steps to complete the link.</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="p-6 rounded-2xl bg-secondary/20 border border-border relative group">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="space-y-1">
                                                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Phase 1</span>
                                                <h5 className="font-bold">Download Bootstrap</h5>
                                            </div>
                                            <button 
                                                onClick={handleDownload}
                                                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                                            >
                                                <Download size={16} /> DOWNLOAD ENV
                                            </button>
                                        </div>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            This package contains the agent core and your unique pairing token. Unzip it on the machine you want to add.
                                        </p>
                                    </div>

                                    <div className="p-6 rounded-2xl bg-secondary/20 border border-border">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="space-y-1">
                                                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Phase 2</span>
                                                <h5 className="font-bold">Execute Link</h5>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <code className="px-3 py-1.5 bg-black/40 rounded-lg font-mono text-xs text-primary border border-primary/20">
                                                    link_node.bat
                                                </code>
                                            </div>
                                        </div>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Run the batch script (Windows) or shell script (Linux). The machine will call back to this dashboard.
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setStep('WAITING')}
                                    className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold shadow-xl shadow-primary/20 hover:scale-[1.01] transition-all flex items-center justify-center gap-2"
                                >
                                    I have started the machine <ChevronRight size={18} />
                                </button>
                            </div>
                        )}

                        {step === 'WAITING' && (
                            <div className="py-16 flex flex-col items-center text-center space-y-8">
                                <div className="relative w-32 h-32">
                                    <motion.div 
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                                        className="absolute inset-0 rounded-full border-4 border-dashed border-primary/20"
                                    />
                                    <motion.div 
                                        animate={{ scale: [1, 1.1, 1] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                        className="absolute inset-4 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20"
                                    >
                                        <Wifi size={40} className="text-primary" />
                                    </motion.div>
                                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-[10px] font-black rounded-full shadow-lg">
                                        SCANNING...
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h4 className="text-2xl font-black text-foreground">Listening for Signal</h4>
                                    <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                                        We're searching for <span className="text-foreground font-bold">{name}</span> on the network. This will complete automatically once the agent connects.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/5 text-amber-500 border border-amber-500/20 rounded-xl text-xs font-medium">
                                        <AlertCircle size={14} />
                                        <span>Ensure the machine has internet access.</span>
                                    </div>
                                    <button onClick={onClose} className="text-sm font-bold text-muted-foreground hover:text-foreground transition-all">
                                        Run in Background
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 'SUCCESS' && (
                            <div className="py-12 text-center space-y-8 animate-in zoom-in-95 duration-500">
                                <div className="w-24 h-24 mx-auto rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-2xl shadow-emerald-500/10">
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: 'spring', damping: 10 }}
                                    >
                                        <Check size={48} className="text-emerald-500" />
                                    </motion.div>
                                </div>
                                
                                <div className="space-y-2">
                                    <h4 className="text-3xl font-black text-foreground">Machine Linked!</h4>
                                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                                        <b>{name}</b> has been added and is ready to use.
                                    </p>
                                </div>

                                <button
                                    onClick={onClose}
                                    className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black shadow-xl shadow-emerald-500/20 hover:scale-[1.02] transition-all"
                                >
                                    CONTINUE
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
