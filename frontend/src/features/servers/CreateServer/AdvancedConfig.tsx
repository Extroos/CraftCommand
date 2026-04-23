import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Zap, Settings2, Settings, Info, Layers } from 'lucide-react';
import { FormData } from './types';
import { NodeInfo } from '@shared/types';
import { useSystem } from '@features/system/context/SystemContext';
import { useUser } from '@features/auth/context/UserContext';
import ModpackBrowser from '../ModpackBrowser';

interface AdvancedConfigProps {
    formData: FormData;
    setFormData: React.Dispatch<React.SetStateAction<FormData>>;
    handleDeploy: () => void;
    isDeploying: boolean;
    softwareOptions: { id: string; icon: React.ReactNode; desc: string }[];
    nodes: NodeInfo[];
    renderSoftwareStep: () => React.ReactNode;
    renderDetailsStep: () => React.ReactNode;
    renderReviewStep: () => React.ReactNode;
    capabilities: any;
    bedrockVersions?: { latest: string, versions: string[] };
}
const AdvancedConfig: React.FC<AdvancedConfigProps> = ({ 
    formData, 
    setFormData, 
    handleDeploy, 
    isDeploying,
    nodes,
    renderSoftwareStep,
    renderDetailsStep,
    renderReviewStep,
    capabilities,
    bedrockVersions
}) => {
    const { t } = useTranslation();
    const { settings } = useSystem();
    const { user } = useUser();
    return (
        <motion.div 
            key="pro"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start"
        >
            <div className="xl:col-span-8 space-y-6">
                {/* Software Selection */}
                <div className={`border border-border rounded-xl bg-card shadow-sm overflow-hidden ${user?.preferences?.visualQuality ? 'glass-morphism' : ''}`}>
                    <div className="flex items-center gap-3 px-6 py-4 bg-muted/10 border-b border-border">
                        <div className="p-1.5 bg-primary/5 rounded border border-primary/10">
                            <Layers size={14} className="text-primary" />
                        </div>
                        <h3 className="text-[10px] font-bold text-foreground uppercase tracking-[0.2em]">{t('create_server.instance_software') || 'Instance Software'}</h3>
                    </div>
                    <div className="p-6">
                        {renderSoftwareStep()}
                    </div>
                </div>

                {/* Primary Configuration Section */}
                <div className={`border border-border rounded-xl bg-card shadow-sm overflow-hidden ${user?.preferences?.visualQuality ? 'glass-morphism' : ''}`}>
                    <div className="flex items-center gap-3 px-6 py-4 bg-muted/10 border-b border-border">
                        <div className="p-1.5 bg-primary/5 rounded border border-primary/10">
                            <Settings2 size={14} className="text-primary" />
                        </div>
                        <h3 className="text-[10px] font-bold text-foreground uppercase tracking-[0.2em]">{t('create_server.params')}</h3>
                    </div>
                    <div className="p-6">
                        {renderDetailsStep()}
                    </div>
                </div>

                {/* Advanced Logic & Overrides */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Node Selection */}
                    {settings?.app?.distributedNodes?.enabled && (
                        <div className={`border border-border rounded-xl p-5 bg-card shadow-sm ${user?.preferences?.visualQuality ? 'glass-morphism' : ''}`}>
                            <div className="flex items-center gap-3 mb-4">
                                <Globe size={14} className="text-primary" />
                                <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest">{t('create_server.deploy_node')}</h3>
                            </div>
                            <div className="relative group">
                                <select 
                                    value={formData.nodeId}
                                    onChange={e => setFormData(prev => ({ ...prev, nodeId: e.target.value }))}
                                    className="w-full bg-muted/20 border border-border rounded-lg py-2 px-3 outline-none text-[10px] text-foreground font-bold uppercase tracking-widest cursor-pointer hover:bg-muted/40 transition-all appearance-none"
                                >
                                    <option value="auto">{t('create_server.auto_node')}</option>
                                    <option value="local">{t('create_server.local_node')}</option>
                                    {nodes.filter(n => n.id !== 'local').map(node => (
                                        <option key={node.id} value={node.id}>
                                            {node.name || node.host}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Runtime Overrides */}
                    <div className={`border border-border rounded-xl p-5 bg-card shadow-sm col-span-1 md:col-span-1 ${user?.preferences?.visualQuality ? 'glass-morphism' : ''}`}>
                        <div className="flex items-center gap-3 mb-4">
                            <Zap size={14} className="text-primary" />
                            <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest">{t('create_server.runtime_logic') || 'Runtime Logic'}</h3>
                        </div>
                        <div className="space-y-3">
                            {[
                                { id: 'aikarFlags', label: t('create_server.aikar_flags'), desc: t('create_server.perf_flags') },
                                { id: 'installSpark', label: t('create_server.spark_profiler'), desc: t('create_server.auto_diag') },
                                { id: 'onlineMode', label: t('create_server.official_auth'), desc: t('create_server.mojang_val') }
                            ].map(flag => (
                                <label key={flag.id} className="flex items-center justify-between group cursor-pointer">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-foreground/80 uppercase tracking-tight leading-none mb-1">{flag.label}</span>
                                        <span className="text-[8px] text-muted-foreground/50 uppercase tracking-widest font-medium">{flag.desc}</span>
                                    </div>
                                    <div 
                                        onClick={() => setFormData({...formData, [flag.id]: !(formData as any)[flag.id]})}
                                        className={`relative w-8 h-4 rounded-full transition-all duration-300 cursor-pointer border ${
                                            (formData as any)[flag.id] 
                                            ? 'bg-primary border-primary' 
                                            : 'bg-muted/30 border-white/5 hover:bg-muted/50'
                                        }`}
                                    >
                                        <div className={`absolute top-[2px] w-2.5 h-2.5 rounded-full transition-all duration-300 transform ${
                                            (formData as any)[flag.id] 
                                            ? 'left-[17px] bg-primary-foreground' 
                                            : 'left-[2px] bg-muted-foreground'
                                        }`} />
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="xl:col-span-4 sticky top-6 space-y-6">
                <div className={`border border-border rounded-xl bg-card shadow-sm overflow-hidden ${user?.preferences?.visualQuality ? 'glass-morphism' : ''}`}>
                    <div className="px-6 py-4 border-b border-border bg-muted/5">
                        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] text-center">{t('create_server.summary')}</h3>
                    </div>
                    {renderReviewStep()}
                </div>
                
                <div className="p-4 rounded-xl border border-dashed border-border bg-muted/5 text-[9px] text-muted-foreground/50 uppercase tracking-widest font-medium leading-relaxed">
                    {t('create_server.isolation_note')}
                </div>
            </div>
        </motion.div>
    );
};

export default AdvancedConfig;
