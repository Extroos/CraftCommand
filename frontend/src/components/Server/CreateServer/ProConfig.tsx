import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Info, Zap, Terminal, Loader2, Settings2 } from 'lucide-react';
import { FormData } from './types';
import ModpackBrowser from '../ModpackBrowser';

interface ProConfigProps {
    formData: FormData;
    setFormData: React.Dispatch<React.SetStateAction<FormData>>;
    handleDeploy: () => void;
    isDeploying: boolean;
    softwareOptions: { id: string; icon: React.ReactNode; desc: string }[];
    renderSoftwareStep: () => React.ReactNode;
    renderDetailsStep: () => React.ReactNode;
    renderReviewStep: () => React.ReactNode;
}

const ProConfig: React.FC<ProConfigProps> = ({ 
    formData, 
    setFormData, 
    handleDeploy, 
    isDeploying,
    renderSoftwareStep,
    renderDetailsStep,
    renderReviewStep
}) => {
    return (
        <motion.div 
            key="pro"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
        >
            <div className="lg:col-span-8 space-y-3">
                <div className="bg-[#121214]/60 border border-[rgb(var(--color-border-subtle))] rounded-lg p-4">
                    {renderSoftwareStep()}
                </div>
                <div className="bg-[#121214]/60 border border-[rgb(var(--color-border-subtle))] rounded-lg p-4">
                    {renderDetailsStep()}
                </div>
                <div className="bg-[#121214]/60 border border-[rgb(var(--color-border-subtle))] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Zap size={14} className="text-emerald-500" />
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--color-fg-muted))]">Advanced Parameters</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[
                                { id: 'aikarFlags', label: "Aikar's Flags", desc: "Enterprise GC Tuning" },
                                { id: 'installSpark', label: "Spark Profiler", desc: "Real-time Diagnostics" },
                                { id: 'onlineMode', label: "Official Auth", desc: "Enable Minecraft Account verification" }
                            ].map(flag => (
                            <label key={flag.id} className={`flex flex-col gap-1 p-2 bg-black/20 border border-[rgb(var(--color-border-subtle))] rounded-lg cursor-pointer hover:border-[rgb(var(--color-border-default))] transition-all ${flag.id === 'onlineMode' && !formData.onlineMode ? 'border-rose-500/30 bg-rose-500/5' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <input 
                                        type="checkbox" 
                                        checked={(formData as any)[flag.id]} 
                                        onChange={() => setFormData({...formData, [flag.id]: !(formData as any)[flag.id]})}
                                        className={`w-3.5 h-3.5 rounded border-[rgb(var(--color-border-default))] bg-black ${flag.id === 'onlineMode' && !formData.onlineMode ? 'accent-rose-500' : 'accent-primary'}`}
                                    /> 
                                    <span className={`text-xs font-bold ${flag.id === 'onlineMode' && !formData.onlineMode ? 'text-rose-500' : 'text-[rgb(var(--color-fg-secondary))]'}`}>{flag.label}</span>
                                </div>
                                <p className="text-[9px] text-[rgb(var(--color-fg-subtle))] pl-6.5 font-medium">{flag.id === 'onlineMode' && !formData.onlineMode ? "CRACKED MODE ENABLED" : flag.desc}</p>
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            <div className="lg:col-span-4">
                <div className="sticky top-0">
                    {renderReviewStep()}
                    <div className="mt-4 p-4 rounded-xl border border-[rgb(var(--color-border-subtle))] bg-input/40 text-[9px] text-[rgb(var(--color-fg-subtle))] font-bold uppercase tracking-widest leading-relaxed">
                        Node provisioning is localized. verify host capacity before deployment.
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default ProConfig;
