import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { FormData, WizardStep } from './types';
import { ServerTemplate, NodeInfo } from '@shared/types';
import { useSystem } from '@features/system/context/SystemContext';
import { useUser } from '@features/auth/context/UserContext';
import { Check, ArrowRight, Globe, Zap, Info, Link } from 'lucide-react';
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
    const { t } = useTranslation();
    const { settings } = useSystem();
    const { user } = useUser();

    const handleTemplateSelect = (template: ServerTemplate) => {
        const isPurpurMatch = template.type === 'Purpur' || (template.type === 'Paper' && formData.usePurpur);
        setFormData(prev => ({
            ...prev,
            templateId: template.id,
            software: isPurpurMatch ? 'Purpur' : template.type,
            version: template.version,
            usePurpur: isPurpurMatch,
            ram: Math.max(prev.ram, Math.ceil((template.recommendedRam || 4096) / 1024)),
        }));
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
            {/* Steps Indicator - Professional subtle design */}
            <div className="flex justify-center mb-10 gap-4">
                {['software', 'details', 'review'].map((s, i) => {
                    const steps = ['software', 'details', 'review'];
                    const currentIdx = steps.indexOf(step);
                    const stepIdx = steps.indexOf(s);
                    const isActive = currentIdx >= stepIdx;
                    return (
                        <div key={s} className="flex flex-col items-center gap-2 w-28">
                            <div className={`h-1 w-full rounded-full transition-all duration-500 ${
                                isActive ? 'bg-primary' : 'bg-muted/30'
                            }`} />
                            <span className={`text-[9px] font-bold uppercase tracking-[0.15em] transition-colors duration-300 ${isActive ? 'text-foreground' : 'text-muted-foreground/30'}`}>
                                {t(`common.${s}`) || s}
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
                        <div className="text-center space-y-1 mb-2">
                            <h2 className="text-xl font-bold text-foreground tracking-tight">{t('create_server.provisioning_target')}</h2>
                            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest opacity-50">{t('create_server.choose_env')}</p>
                        </div>

                        {/* Software & Templates Grid */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                {/* Official Software Options (Direct Selection) */}
                                {softwareOptions
                                    .filter(sw => !gameTemplates.some(tmpl => tmpl.type === sw.id)) // Deduplicate: Hide if template exists
                                    .map(sw => (
                                    <button
                                        key={sw.id}
                                        onClick={() => {
                                            setFormData(prev => synthesizeDefaultState(sw.id, prev, bedrockVersions));
                                        }}
                                        className={`group relative flex flex-col items-start p-4 gap-4 rounded-xl border transition-all duration-200 ${
                                            (formData.software === sw.id || (sw.id === 'Paper' && formData.software === 'Purpur')) && !formData.templateId
                                            ? 'bg-primary/5 border-primary'
                                            : 'bg-muted/20 border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between w-full">
                                            <div className="w-8 h-8">
                                                {typeof sw.icon === 'string' || React.isValidElement(sw.icon) ? (
                                                    <div className={`w-full h-full flex items-center justify-center ${(formData.software === sw.id || (sw.id === 'Paper' && formData.software === 'Purpur')) && !formData.templateId ? 'text-primary' : 'text-muted-foreground opacity-50'}`}>
                                                        {sw.icon}
                                                    </div>
                                                ) : (
                                                    <img 
                                                        src={getIconPath(sw.id)} 
                                                        alt={sw.id}
                                                        className={`w-full h-full object-contain transition-transform duration-300 ${(formData.software === sw.id || (sw.id === 'Paper' && formData.software === 'Purpur')) && !formData.templateId ? 'scale-110' : 'group-hover:scale-105 opacity-80'}`}
                                                    />
                                                )}
                                            </div>
                                            {((formData.software === sw.id || (sw.id === 'Paper' && formData.software === 'Purpur')) && !formData.templateId) && (
                                                <div className="p-1 bg-primary rounded-full text-primary-foreground">
                                                    <Check size={10} strokeWidth={4} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-left">
                                            <div className="font-bold text-[12px] leading-none text-foreground">
                                                {sw.id === 'Paper' && (formData.software === 'Paper' || formData.software === 'Purpur') && formData.usePurpur ? 'Purpur' : sw.id}
                                            </div>
                                            <div className="text-[9px] text-muted-foreground mt-2 font-bold uppercase tracking-wider opacity-60">
                                                {sw.id === 'Paper' && formData.usePurpur ? t('create_server.optimized_fork') : t('create_server.primary_source')}
                                            </div>
                                        </div>
                                    </button>
                                ))}

                                {/* Templates */}
                                {gameTemplates.map(tmpl => (
                                    <button
                                        key={tmpl.id}
                                        onClick={() => handleTemplateSelect(tmpl)}
                                        className={`group relative flex flex-col items-start p-4 gap-4 rounded-xl border transition-all duration-200 ${
                                            formData.templateId === tmpl.id
                                            ? 'bg-primary/5 border-primary'
                                            : 'bg-muted/20 border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between w-full">
                                            <div className="w-8 h-8">
                                                <img 
                                                    src={getIconPath(tmpl.type)} 
                                                    alt={tmpl.name}
                                                    className={`w-full h-full object-contain transition-transform duration-300 ${formData.templateId === tmpl.id ? 'scale-110' : 'group-hover:scale-105 opacity-80'}`}
                                                />
                                            </div>
                                            {formData.templateId === tmpl.id && (
                                                <div className="p-1 bg-primary rounded-full text-primary-foreground">
                                                    <Check size={10} strokeWidth={4} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-left">
                                            <div className="font-bold text-[12px] leading-none text-foreground">{tmpl.name}</div>
                                            <div className="text-[9px] text-muted-foreground mt-2 font-medium flex items-center gap-2">
                                                <span className="font-bold uppercase tracking-wider opacity-60">{tmpl.version}</span>
                                                <span className="w-1 h-1 bg-muted-foreground/20 rounded-full" />
                                                <span className="font-mono text-[8px] opacity-40">{t('create_server.ram_short', { ram: Math.ceil((tmpl.recommendedRam || 4096)/1024) })}</span>
                                            </div>
                                        </div>
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
                                            <h3 className="text-sm font-bold text-white">{t('create_server.custom_url')}</h3>
                                            <p className="text-[10px] text-zinc-500 font-medium">{t('create_server.custom_url_desc')}</p>
                                        </div>
                                    </div>
                                    <input 
                                        type="text"
                                        value={formData.modpackUrl || ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, modpackUrl: e.target.value }))}
                                        placeholder={t('create_server.custom_url_placeholder')}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg py-3 px-4 outline-none text-xs text-white font-mono placeholder:text-zinc-700 focus:border-indigo-500/50 transition-colors"
                                    />
                                </div>
                            </motion.div>
                        )}

                        {/* Manual Purpur Toggle in Wizard - Stabilized Design */}
                        {(formData.software === 'Paper' || formData.software === 'Purpur') && (
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
                                            <h3 className="text-sm font-bold text-white">{t('create_server.use_purpur')}</h3>
                                            <p className="text-[10px] text-zinc-500 font-medium max-w-[320px]">{t('create_server.purpur_desc')}</p>
                                        </div>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only peer" 
                                            checked={formData.usePurpur} 
                                            onChange={(e) => setFormData(prev => ({ 
                                                ...prev, 
                                                usePurpur: e.target.checked,
                                                software: e.target.checked ? 'Purpur' : 'Paper'
                                            }))} 
                                        />
                                        <div className="w-10 h-5 bg-zinc-800 border border-white/5 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                                    </label>
                                </div>
                            </motion.div>
                        )}

                        {/* Step Progression Button - Solid Design */}
                        <div className="pt-8 flex flex-col items-center gap-5">
                             <button
                                onClick={() => setStep('details')}
                                disabled={!formData.templateId && !formData.software}
                                className="group flex items-center gap-3 px-14 py-3.5 bg-primary text-primary-foreground rounded-lg text-[10px] font-bold uppercase tracking-[0.2em] hover:opacity-90 disabled:opacity-20 transition-all shadow-lg"
                             >
                                {t('create_server.configuring')} <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                             </button>
                             <div className="flex items-center gap-4 opacity-10">
                                <div className="h-px w-8 bg-foreground" />
                                <span className="text-[8px] font-bold uppercase tracking-[0.2em]">CraftCommand v4.0</span>
                                <div className="h-px w-8 bg-foreground" />
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
                         <div className="text-center space-y-1 mb-8">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[9px] font-bold uppercase tracking-wider mb-2">
                                {t('create_server.instance_node_template', { software: formData.usePurpur ? 'Purpur' : formData.software, version: formData.version })}
                            </div>
                            <h2 className="text-xl font-bold text-foreground tracking-tight">{t('create_server.resource_allocation')}</h2>
                            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest opacity-50">{t('create_server.hardware_provisioning')}</p>
                        </div>
                        
                        {/* Phase 4: Node Selection - Only if Distributed Nodes is Enabled */}
                        {settings?.app?.distributedNodes?.enabled && (
                            <div className="mb-6 p-4 border border-white/5 rounded-xl bg-zinc-900/30">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                                        <Globe size={14} className="text-cyan-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-[10px] font-bold text-white uppercase tracking-wider">{t('create_server.deploy_node')}</h3>
                                        <p className="text-[9px] text-zinc-500 font-medium">{t('create_server.node_desc')}</p>
                                    </div>
                                </div>

                                <select 
                                    value={formData.nodeId}
                                    onChange={e => setFormData(prev => ({ ...prev, nodeId: e.target.value }))}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-3 outline-none text-xs text-white font-medium cursor-pointer hover:bg-black/60 transition-colors"
                                >
                                    <option value="auto">{t('create_server.auto_node')}</option>
                                    <option value="local">{t('create_server.local_node')}</option>
                                    {nodes.filter(n => n.id !== 'local').map(node => (
                                        <option key={node.id} value={node.id}>
                                            {node.name || node.host} ({node.status})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        
                        {renderDetailsStep()}

                        <div className="flex justify-between items-center pt-8 border-t border-border mt-8">
                            <button 
                                onClick={() => setStep('software')} 
                                className="text-muted-foreground hover:text-foreground text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 ml-1"
                            >
                                <ArrowRight size={14} className="rotate-180" /> {t('create_server.change_software')}
                            </button>
                            <button 
                                disabled={!formData.name}
                                onClick={() => setStep('review')} 
                                className="group flex items-center gap-3 px-8 py-3 bg-primary text-primary-foreground rounded-lg text-[10px] font-bold uppercase tracking-[0.1em] hover:opacity-90 disabled:opacity-20 transition-all shadow-md"
                            >
                                {t('create_server.finalize')} <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
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
                            <h2 className="text-lg font-black text-white uppercase tracking-tight">{t('create_server.ready')}</h2>
                            <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-widest opacity-60">{t('create_server.validation')}</p>
                        </div>

                        {renderReviewStep()}
                        
                         <div className="flex justify-center mt-6">
                            <button 
                                onClick={() => setStep('details')} 
                                className="text-muted-foreground hover:text-white text-xs font-bold uppercase tracking-wider transition-colors"
                            >
                                ← {t('create_server.adjust')}
                            </button>
                        </div>
                    </motion.div>
                )}
            </div>
            

        </motion.div>
    );
};

export default WizardMode;
