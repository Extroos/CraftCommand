import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FormData, WizardStep } from './types';
import { ServerTemplate, NodeInfo } from '@shared/types';
import { useSystem } from '@features/system/context/SystemContext';
import { useUser } from '@features/auth/context/UserContext';
import { Check, ArrowRight, Globe, Link } from 'lucide-react';
import { synthesizeDefaultState } from './CreateServerUtils';

interface WizardModeProps {
    formData: FormData;
    setFormData: React.Dispatch<React.SetStateAction<FormData>>;
    step: WizardStep;
    setStep: (step: WizardStep) => void;
    templates: ServerTemplate[];
    nodes: NodeInfo[];
    renderDetailsStep: () => React.ReactNode;
    renderReviewStep: () => React.ReactNode;
    softwareOptions: any[];
    capabilities: any;
    bedrockVersions?: { latest: string, versions: string[] };
}

const WizardMode: React.FC<WizardModeProps> = ({
    formData,
    setFormData,
    step,
    setStep,
    templates,
    nodes,
    renderDetailsStep,
    renderReviewStep,
    softwareOptions,
    capabilities,
    bedrockVersions
}) => {
    const { settings } = useSystem();
    const { user } = useUser();

    const handleTemplateSelect = (t: ServerTemplate) => {
        setFormData(prev => ({
            ...prev,
            templateId: t.id,
            software: t.type,
            version: t.version,
            ram: Math.max(prev.ram, Math.ceil((t.recommendedRam || 4096) / 1024)),
        }));
        // setStep('details'); // REMOVED: No more instant jump
    };

    // Group templates
    const gameTemplates = templates;

    // Custom Icon Mapping
    const getIconPath = (type: string) => {
        switch (type) {
            case 'Paper': return '/software-icons/paper.png';
            case 'Fabric': return '/software-icons/fabric-minecraft.png';
            case 'Forge': return '/software-icons/forge.png';
            case 'NeoForge': return '/software-icons/neoforge.png';
            case 'Vanilla': return '/software-icons/vanilla.png';
            case 'Modpack': return '/software-icons/modapack.png';
            case 'Purpur': return '/software-icons/purpur.png';
            case 'Bedrock': return '/software-icons/bedrock.png';
            default: return '/software-icons/vanilla.png';
        }
    };

    return (
        <motion.div 
            key="wizard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="max-w-4xl mx-auto"
        >
            {/* Steps Indicator - Modern subtle design */}
            <div className="flex justify-center mb-8 gap-3">
                {['software', 'details', 'review'].map((s, i) => {
                    const steps = ['software', 'details', 'review'];
                    const currentIdx = steps.indexOf(step);
                    const stepIdx = steps.indexOf(s);
                    const isActive = currentIdx >= stepIdx;
                    return (
                        <div key={s} className="flex flex-col items-center gap-1.5 w-24">
                            <div className={`h-1 w-full rounded-full transition-all duration-500 ${
                                isActive ? 'bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.3)]' : 'bg-muted'
                            }`} />
                            <span className={`text-[8px] font-black uppercase tracking-[0.2em] transition-colors duration-300 ${isActive ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                                {s}
                            </span>
                        </div>
                    );
                })}
            </div>

            <div className={`border border-border rounded-2xl p-6 md:p-10 shadow-xl transition-all duration-500 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card'}`}>
                
                {/* STEP 1: SOFTWARE SELECTION */}
                {step === 'software' && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                    >
                        <div className="text-center space-y-2">
                            <h2 className="text-lg font-black text-white uppercase tracking-tight">Select Software</h2>
                            <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-widest opacity-60">Provisioning Protocol</p>
                        </div>

                        {/* Software & Templates Grid */}
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-bold text-muted-foreground/30 uppercase tracking-[0.2em] pl-1">Primary Selection</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {/* Official Software Options (Direct Selection) */}
                                {softwareOptions
                                    .filter(sw => !gameTemplates.some(t => t.type === sw.id)) // Deduplicate: Hide if template exists
                                    .map(sw => (
                                    <button
                                        key={sw.id}
                                        onClick={() => {
                                            setFormData(prev => synthesizeDefaultState(sw.id, prev, bedrockVersions));
                                        }}
                                        className={`group relative flex flex-col items-center p-4 gap-3 rounded-xl border transition-all duration-200 ${
                                            formData.software === sw.id && !formData.templateId
                                            ? 'bg-primary/5 border-primary ring-1 ring-primary/20'
                                            : 'bg-zinc-900/50 border-white/5 hover:border-white/10 hover:bg-zinc-900'
                                        }`}
                                    >
                                        <div className="w-10 h-10 relative">
                                            {typeof sw.icon === 'string' || React.isValidElement(sw.icon) ? (
                                                <div className={`w-full h-full flex items-center justify-center ${formData.software === sw.id && !formData.templateId ? 'text-primary' : 'text-zinc-500 opacity-60 group-hover:opacity-100'}`}>
                                                    {sw.icon}
                                                </div>
                                            ) : (
                                                <img 
                                                    src={getIconPath(sw.id)} 
                                                    alt={sw.id}
                                                    className={`w-full h-full object-contain relative z-10 transition-transform duration-300 ${formData.software === sw.id && !formData.templateId ? 'scale-110' : 'group-hover:scale-105 opacity-60 group-hover:opacity-100'}`}
                                                />
                                            )}
                                        </div>
                                        <div className="text-center">
                                            <div className={`font-bold text-xs leading-none transition-colors ${formData.software === sw.id && !formData.templateId ? 'text-white' : 'text-zinc-500'}`}>{sw.id}</div>
                                            <div className="text-[9px] text-zinc-600 mt-1.5 font-mono">
                                                Platform
                                            </div>
                                        </div>
                                        {formData.software === sw.id && !formData.templateId && (
                                            <div className="absolute top-2 right-2 text-primary">
                                                <Check size={10} strokeWidth={4} />
                                            </div>
                                        )}
                                    </button>
                                ))}

                                {/* Templates */}
                                {gameTemplates.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => handleTemplateSelect(t)}
                                        className={`group relative flex flex-col items-center p-4 gap-3 rounded-xl border transition-all duration-200 ${
                                            formData.templateId === t.id
                                            ? 'bg-primary/5 border-primary ring-1 ring-primary/20'
                                            : 'bg-zinc-900/50 border-white/5 hover:border-white/10 hover:bg-zinc-900'
                                        }`}
                                    >
                                        <div className="w-10 h-10 relative">
                                            <img 
                                                src={getIconPath(t.type)} 
                                                alt={t.name}
                                                className={`w-full h-full object-contain relative z-10 transition-transform duration-300 ${formData.templateId === t.id ? 'scale-110' : 'group-hover:scale-105 opacity-60 group-hover:opacity-100'}`}
                                            />
                                        </div>
                                        <div className="text-center">
                                            <div className={`font-bold text-xs leading-none transition-colors ${formData.templateId === t.id ? 'text-white' : 'text-zinc-500'}`}>{t.name}</div>
                                            <div className="text-[9px] text-zinc-600 mt-1.5 font-mono">
                                                {t.version}
                                            </div>
                                        </div>
                                        {formData.templateId === t.id && (
                                            <div className="absolute top-2 right-2 text-primary">
                                                <Check size={10} strokeWidth={4} />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Custom Modpack URL Input */}
                        {formData.templateId === 'custom-modpack' && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="p-4 border border-white/5 rounded-xl bg-zinc-900/30"
                            >
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                                            <Link size={20} className="text-indigo-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-white">Custom Modpack URL</h3>
                                            <p className="text-[10px] text-zinc-500 font-medium">Direct download link (.zip) or Modrinth Project ID.</p>
                                        </div>
                                    </div>
                                    <input 
                                        type="text"
                                        value={formData.modpackUrl || ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, modpackUrl: e.target.value }))}
                                        placeholder="https://example.com/modpack.zip or modrinth:project-id"
                                        className="w-full bg-black/40 border border-white/10 rounded-lg py-3 px-4 outline-none text-xs text-white font-mono placeholder:text-zinc-700 focus:border-indigo-500/50 transition-colors"
                                    />
                                </div>
                            </motion.div>
                        )}

                        {/* Manual Purpur Toggle in Wizard - Stabilized Design */}
                        {formData.software === 'Paper' && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="p-4 border border-white/5 rounded-xl bg-zinc-900/30"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-zinc-800 rounded-lg border border-white/5">
                                            <img src="/software-icons/purpur.png" className="w-5 h-5 object-contain" alt="Purpur" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-white">Optimize with Purpur</h3>
                                            <p className="text-[10px] text-zinc-500 font-medium max-w-[320px]">Recommended optimization for Paper-based servers.</p>
                                        </div>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only peer" 
                                            checked={formData.usePurpur} 
                                            onChange={(e) => setFormData(prev => ({ ...prev, usePurpur: e.target.checked }))} 
                                        />
                                        <div className="w-10 h-5 bg-zinc-800 border border-white/5 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                                    </label>
                                </div>
                            </motion.div>
                        )}

                        {/* Step Progression Button - Solid Design */}
                        <div className="pt-8 flex flex-col items-center gap-4">
                             <button
                                onClick={() => setStep('details')}
                                disabled={!formData.templateId && !formData.software}
                                className="group flex items-center gap-3 px-12 py-4 bg-white text-black rounded-xl text-xs font-black uppercase tracking-[0.2em] hover:bg-zinc-200 disabled:opacity-10 transition-all shadow-xl"
                             >
                                Next Step <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                             </button>
                             <div className="flex items-center gap-4 opacity-20">
                                <div className="h-px w-12 bg-white" />
                                <span className="text-[9px] font-bold uppercase tracking-[0.3em]">Phase 01</span>
                                <div className="h-px w-12 bg-white" />
                             </div>
                        </div>

                    </motion.div>
                )}

                {/* STEP 2: DETAILS */}
                {step === 'details' && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                    >
                         <div className="text-center space-y-1 mb-6">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold mb-2">
                                {formData.software} {formData.version}
                            </div>
                            <h2 className="text-lg font-black text-white uppercase tracking-tight">Configuration</h2>
                            <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-widest opacity-60">Hardware Allocation</p>
                        </div>
                        
                        {/* Phase 4: Node Selection - Only if Distributed Nodes is Enabled */}
                        {settings?.app?.distributedNodes?.enabled && (
                            <div className="mb-6 p-4 border border-white/5 rounded-xl bg-zinc-900/30">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                                        <Globe size={14} className="text-cyan-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-[10px] font-bold text-white uppercase tracking-wider">Deployment Node</h3>
                                        <p className="text-[9px] text-zinc-500 font-medium">Automatic selection optimizes for latency and resource availability.</p>
                                    </div>
                                </div>

                                <select 
                                    value={formData.nodeId}
                                    onChange={e => setFormData(prev => ({ ...prev, nodeId: e.target.value }))}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-3 outline-none text-xs text-white font-medium cursor-pointer hover:bg-black/60 transition-colors"
                                >
                                    <option value="auto">Automatic (Recommended)</option>
                                    <option value="local">Local Panel (Current System)</option>
                                    {nodes.filter(n => n.id !== 'local').map(node => (
                                        <option key={node.id} value={node.id}>
                                            {node.name || node.host} ({node.status})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        
                        {renderDetailsStep()}

                        <div className="flex justify-between items-center pt-6 border-t border-[rgb(var(--color-border-subtle))] mt-6">
                            <button 
                                onClick={() => setStep('software')} 
                                className="text-muted-foreground hover:text-white text-xs font-bold uppercase tracking-wider transition-colors"
                            >
                                ← Choose Software
                            </button>
                            <button 
                                disabled={!formData.name}
                                onClick={() => setStep('review')} 
                                className="group flex items-center gap-2 px-6 py-3 bg-white text-black rounded-xl text-sm font-bold hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-white/20 transition-all"
                            >
                                Review Output <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* STEP 3: REVIEW */}
                {step === 'review' && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <div className="text-center space-y-1 mb-6">
                            <h2 className="text-lg font-black text-white uppercase tracking-tight">Ready to Deploy?</h2>
                            <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-widest opacity-60">Final Validation</p>
                        </div>

                        {renderReviewStep()}
                        
                         <div className="flex justify-center mt-6">
                            <button 
                                onClick={() => setStep('details')} 
                                className="text-muted-foreground hover:text-white text-xs font-bold uppercase tracking-wider transition-colors"
                            >
                                ← Adjust Configuration
                            </button>
                        </div>
                    </motion.div>
                )}
            </div>
            

        </motion.div>
    );
};

export default WizardMode;
