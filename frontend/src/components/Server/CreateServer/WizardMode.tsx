import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FormData, WizardStep } from './types';
import { ServerTemplate } from '@shared/types';
import { ChevronRight, Layers, Settings2, Terminal, Check, Info, ArrowRight, AlertTriangle, Command } from 'lucide-react';

interface WizardModeProps {
    formData: FormData;
    setFormData: React.Dispatch<React.SetStateAction<FormData>>;
    step: WizardStep;
    setStep: (step: WizardStep) => void;
    templates: ServerTemplate[];
    renderDetailsStep: () => React.ReactNode;
    renderReviewStep: () => React.ReactNode;

}

const WizardMode: React.FC<WizardModeProps> = ({
    formData,
    setFormData,
    step,
    setStep,
    templates,
    renderDetailsStep,
    renderReviewStep
}) => {

    const handleTemplateSelect = (t: ServerTemplate) => {
        setFormData(prev => ({
            ...prev,
            templateId: t.id,
            software: t.type,
            version: t.version,
            ram: Math.max(prev.ram, Math.ceil((t.recommendedRam || 4096) / 1024)),
        }));
        setStep('details');
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
            {/* Steps Indicator */}
            <div className="flex justify-center mb-6 gap-2">
                {['software', 'details', 'review'].map((s, i) => {
                    const steps = ['software', 'details', 'review'];
                    const currentIdx = steps.indexOf(step);
                    const stepIdx = steps.indexOf(s);
                    const isActive = currentIdx >= stepIdx;
                    return (
                        <div key={s} className="flex flex-col items-center gap-2 w-24">
                            <div className={`h-1 w-full rounded-full transition-all duration-500 ${
                                isActive ? 'bg-primary shadow-[0_0_10px_rgba(var(--color-primary-rgb),0.5)]' : 'bg-white/5'
                            }`} />
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${isActive ? 'text-white' : 'text-muted-foreground/50'}`}>
                                {s}
                            </span>
                        </div>
                    );
                })}
            </div>

            <div className="bg-[#121214]/80 border border-[rgb(var(--color-border-subtle))] rounded-lg p-5 md:p-8 shadow-2xl backdrop-blur-sm">
                
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

                        {/* Game Servers Grid */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-1">Game Servers</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {gameTemplates.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => handleTemplateSelect(t)}
                                        className={`group relative flex flex-col items-center p-4 gap-3 rounded-lg border transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${
                                            formData.templateId === t.id
                                            ? 'bg-primary/10 border-primary ring-1 ring-primary/50'
                                            : 'bg-card border-border hover:bg-input hover:border-primary/30'
                                        }`}
                                    >
                                        <div className="w-12 h-12 relative">
                                            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                                            <img 
                                                src={getIconPath(t.type)} 
                                                alt={t.name}
                                                className="w-full h-full object-contain relative z-10 drop-shadow-lg"
                                            />
                                        </div>
                                        <div className="text-center">
                                            <div className="font-bold text-white text-sm">{t.name}</div>
                                            <div className="text-[10px] text-muted-foreground mt-1 font-mono bg-black/20 px-2 py-0.5 rounded-full inline-block">
                                                {t.version}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Proxies Grid */}

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
