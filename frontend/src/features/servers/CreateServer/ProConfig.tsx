import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Zap } from 'lucide-react';
import { FormData } from './types';
import { NodeInfo } from '@shared/types';
import { useSystem } from '@features/system/context/SystemContext';
import { useUser } from '@features/auth/context/UserContext';
import ModpackBrowser from '../ModpackBrowser';

interface ProConfigProps {
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
const ProConfig: React.FC<ProConfigProps> = ({ 
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
    const { settings } = useSystem();
    const { user } = useUser();
    return (
        <motion.div 
            key="pro"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
        >
            <div className="lg:col-span-8 space-y-4">
                <div className={`border border-border rounded-xl p-5 shadow-sm transition-all duration-500 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card/40'}`}>
                    {renderSoftwareStep()}
                </div>
                {settings?.app?.distributedNodes?.enabled && (
                    <div className={`border border-border rounded-xl p-5 shadow-sm transition-all duration-500 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card/40'}`}>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-1.5 bg-cyan-500/10 rounded-md border border-cyan-500/20">
                                <Globe size={14} className="text-cyan-400" />
                            </div>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground/70">Deployment Target</h3>
                        </div>
                        <select 
                            value={formData.nodeId}
                            onChange={e => setFormData(prev => ({ ...prev, nodeId: e.target.value }))}
                            className="w-full bg-muted/40 border border-border rounded-lg py-2.5 px-4 outline-none text-[11px] text-foreground font-black uppercase tracking-widest cursor-pointer hover:bg-muted/60 transition-all appearance-none"
                        >
                            <option value="auto">Automatic (Recommended)</option>
                            <option value="local">Local Panel (Current System)</option>
                            {nodes.filter(n => n.id !== 'local').map(node => (
                                <option key={node.id} value={node.id}>
                                    {node.name || node.host} ({node.status})
                                </option>
                            ))}
                        </select>
                        <p className="text-[8px] text-muted-foreground mt-2 font-bold uppercase tracking-widest opacity-40">Distributed provisioning optimizes for node latency.</p>
                    </div>
                )}

                <div className={`border border-border rounded-xl p-5 shadow-sm transition-all duration-500 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card/40'}`}>
                    {renderDetailsStep()}
                </div>
                <div className={`border border-border rounded-xl p-5 shadow-sm transition-all duration-500 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card/40'}`}>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 bg-emerald-500/10 rounded-md border border-emerald-500/20">
                            <Zap size={14} className="text-emerald-500" />
                        </div>
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground/70">Advanced Parameters</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[
                                { id: 'aikarFlags', label: "Aikar's Flags", desc: "Enterprise GC Tuning", javaOnly: true },
                                { id: 'installSpark', label: "Spark Profiler", desc: "Real-time Diagnostics", javaOnly: true, supportsSpark: capabilities.supportsSpark },
                                { id: 'onlineMode', label: "Official Auth", desc: "Minecraft verification", javaOnly: false }
                            ].filter(flag => (!flag.javaOnly || capabilities.supportsJava) && (flag.supportsSpark === undefined || flag.supportsSpark)).map(flag => (
                            <label key={flag.id} className={`flex flex-col gap-1 p-3 bg-muted/20 border border-border rounded-xl cursor-pointer hover:bg-muted/40 transition-all ${flag.id === 'onlineMode' && !formData.onlineMode ? 'border-rose-500/30 bg-rose-500/5' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <input 
                                        type="checkbox" 
                                        checked={(formData as any)[flag.id]} 
                                        onChange={() => setFormData({...formData, [flag.id]: !(formData as any)[flag.id]})}
                                        className={`w-3.5 h-3.5 rounded border-border bg-black ${flag.id === 'onlineMode' && !formData.onlineMode ? 'accent-rose-500' : 'accent-primary'}`}
                                    /> 
                                    <span className={`text-[11px] font-black uppercase tracking-widest ${flag.id === 'onlineMode' && !formData.onlineMode ? 'text-rose-500' : 'text-foreground/80'}`}>{flag.label}</span>
                                </div>
                                <p className="text-[8px] text-muted-foreground pl-6.5 font-bold uppercase tracking-widest opacity-40">{flag.id === 'onlineMode' && !formData.onlineMode ? "SECURITY RISK" : flag.desc}</p>
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            <div className="lg:col-span-4">
                <div className="sticky top-0">
                    {renderReviewStep()}
                    <div className="mt-4 p-4 rounded-xl border border-border bg-muted/20 text-[8px] text-muted-foreground font-black uppercase tracking-[0.2em] leading-relaxed opacity-40">
                        Node provisioning is localized. verify host capacity before deployment.
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default ProConfig;
