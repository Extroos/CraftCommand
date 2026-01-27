import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, Box, Cpu, Layers, Loader2, HardDrive, Shield, Zap, Globe, Lock, Leaf, FileCode, Hammer, Package, Sparkles, MonitorPlay, ChevronRight, Info, Settings2, Activity, Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ModpackBrowser from './ModpackBrowser';
import { API } from '../../services/api';
import { useServers } from '../../context/ServerContext';

interface CreateServerProps {
    onBack: () => void;
    onDeploy: () => void;
}

type WizardStep = 'marketing' | 'software' | 'details' | 'review';
type CreateMode = 'wizard' | 'pro';

const CreateServer: React.FC<CreateServerProps> = ({ onBack, onDeploy }) => {
    const { refreshServers } = useServers();
    const [mode, setMode] = useState<CreateMode>('wizard');
    const [step, setStep] = useState<WizardStep>('software');
    const [isDeploying, setIsDeploying] = useState(false);
    
    const [formData, setFormData] = useState({
        name: '',
        software: 'Paper',
        version: '1.21.1',
        javaVersion: 'Java 21',
        port: 25565,
        ram: 4,
        maxPlayers: 20,
        levelType: 'default',
        levelSeed: '',
        motd: 'A Minecraft Server',
        eula: false,
        modpackUrl: '',
        enableSecurity: true,
        aikarFlags: true,
        proxySupport: false,
        installSpark: false,
        onlineMode: true
    });

    const [selectedModpack, setSelectedModpack] = useState<any>(null);
    const [uploadedFileData, setUploadedFileData] = useState<{blob: Blob, name: string, size: number} | null>(null);
    const [useModpack, setUseModpack] = useState(false);

    // Smart RAM & Java Suggestions
    useEffect(() => {
        // Auto-Java
        const mcMajor = parseInt(formData.version.split('.')[1]);
        if (mcMajor >= 21) setFormData(p => ({ ...p, javaVersion: 'Java 21' }));
        else if (mcMajor >= 17) setFormData(p => ({ ...p, javaVersion: 'Java 17' }));
        else setFormData(p => ({ ...p, javaVersion: 'Java 8' }));

        // Auto-RAM
        if (formData.software === 'Modpack' || formData.software === 'Forge' || formData.software === 'NeoForge') {
             if (formData.ram < 4) setFormData(p => ({ ...p, ram: 4 }));
        }
    }, [formData.software, formData.version]);

    const handleDeploy = async () => {
        if (!formData.name || !formData.eula) return;
        setIsDeploying(true);
        
        try {
            // 1. Create Server
            const server = await API.createServer({
                name: formData.name,
                software: formData.software as any,
                version: formData.version,
                port: formData.port,
                ram: formData.ram,
                motd: formData.motd,
                maxPlayers: formData.maxPlayers,
                javaVersion: formData.javaVersion,
                securityConfig: formData.enableSecurity ? {
                    firewallEnabled: true,
                    allowedIps: ['127.0.0.1'],
                    ddosProtection: true,
                    requireOp2fa: false,
                    forceSsl: false,
                    regionLock: []
                } : undefined,
                onlineMode: formData.onlineMode,
                advancedFlags: {
                    aikarFlags: formData.aikarFlags,
                    antiDdos: formData.enableSecurity, // Implied
                    debugMode: false,
                    proxySupport: formData.proxySupport,
                    installSpark: formData.installSpark
                }
            });

            // 2. Install Software
            const installOpts = { version: formData.version };
            
            switch (formData.software) {
                case 'Paper': await API.installServer(server.id, 'paper', installOpts); break;
                case 'Purpur': await API.installServer(server.id, 'purpur', installOpts); break;
                case 'Vanilla': await API.installServer(server.id, 'vanilla', installOpts); break;
                case 'Fabric': await API.installServer(server.id, 'fabric', installOpts); break;
                case 'Spigot': await API.installServer(server.id, 'spigot', installOpts); break;
                case 'NeoForge': await API.installServer(server.id, 'neoforge', installOpts); break;
                case 'Forge': 
                    let localModpack = null;
                    if (uploadedFileData && useModpack) {
                         const file = new File([uploadedFileData.blob], uploadedFileData.name);
                         await API.uploadFile(server.id, file);
                         localModpack = uploadedFileData.name;
                    }
                    await API.installServer(server.id, 'forge', { ...installOpts, localModpack });
                    break;
                case 'Modpack':
                    await API.installServer(server.id, 'modpack', { url: formData.modpackUrl });
                    break;
            }

            // 3. Refresh server list to ensure new server is in context
            await refreshServers();
            
            setIsDeploying(false);
            onDeploy();
        } catch (e) {
            console.error(e);
            setIsDeploying(false);
            alert('Deployment failed. Check console.');
        }
    };

    const softwareOptions = [
        { id: 'Paper', icon: <Leaf className="text-emerald-500" />, desc: 'High performance for plugins.' },
        { id: 'Purpur', icon: <Sparkles className="text-pink-500" />, desc: 'Features & Customization.' },
        { id: 'NeoForge', icon: <Zap className="text-orange-500" />, desc: 'The future of modding.' },
        { id: 'Forge', icon: <Hammer className="text-red-500" />, desc: 'Classic mod loader.' },
        { id: 'Fabric', icon: <FileCode className="text-blue-500" />, desc: 'Lightweight & fast.' },
        { id: 'Modpack', icon: <Package className="text-purple-500" />, desc: 'CurseForge & Modrinth.' },
        { id: 'Vanilla', icon: <Box className="text-stone-500" />, desc: 'Official Mojang server.' },
    ];

    // --- RENDERERS ---

    const renderSoftwareStep = () => (
        <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="space-y-4"
        >
            <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-primary/10 rounded-md border border-primary/20">
                    <Layers size={16} className="text-primary" />
                </div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white">Engine Selection</h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {softwareOptions.map((sw, i) => (
                    <motion.button
                        key={sw.id}
                        whileHover={{ borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.05)' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                            setFormData({ ...formData, software: sw.id });
                            if (mode === 'wizard') setStep('details');
                        }}
                        className={`group relative p-4 rounded-xl border text-left transition-all ${
                            formData.software === sw.id 
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/20' 
                            : 'border-white/5 bg-zinc-900/50'
                        }`}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg transition-colors ${
                                formData.software === sw.id ? 'text-primary' : 'text-zinc-500 group-hover:text-zinc-300'
                            }`}>
                                {sw.icon}
                            </div>
                            <div>
                                <div className="font-bold text-sm text-white">{sw.id}</div>
                                <div className="text-[10px] text-zinc-500 leading-none mt-0.5 opacity-60">{sw.id} Instance</div>
                            </div>
                        </div>

                        {formData.software === sw.id && (
                            <div className="absolute top-3 right-3 text-primary">
                                <Check size={12} strokeWidth={4} />
                            </div>
                        )}
                    </motion.button>
                ))}
            </div>

            {mode === 'wizard' && (
                <div className="flex justify-end pt-2">
                    <button 
                        onClick={() => setStep('details')} 
                        className="flex items-center gap-2 px-5 py-2 bg-white text-black rounded-lg text-xs font-bold hover:bg-zinc-200 transition-all shadow-lg"
                    >
                        Continue <ChevronRight size={14} />
                    </button>
                </div>
            )}
        </motion.div>
    );

    const renderDetailsStep = () => (
        <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="space-y-6"
        >
            <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 bg-blue-500/10 rounded-md border border-blue-500/20">
                    <Settings2 size={16} className="text-blue-500" />
                </div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white">Instance Configuration</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Server Name</label>
                        <div className="relative">
                            <input 
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                                className="w-full bg-zinc-900 border border-white/5 rounded-lg py-2 px-3 focus:border-primary/50 outline-none text-sm text-white font-medium"
                                placeholder="Alpha-01"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Software Version</label>
                        <select 
                            value={formData.version}
                            onChange={e => setFormData({...formData, version: e.target.value})}
                            className="w-full bg-zinc-900 border border-white/5 rounded-lg py-2 px-3 outline-none text-sm text-white font-medium cursor-pointer appearance-none"
                        >
                            <optgroup label="Modern">
                                <option value="1.21.11">1.21.11 (Latest)</option>
                                <option value="1.21.1">1.21.1</option>
                                <option value="1.20.6">1.20.6</option>
                                <option value="1.20.1">1.20.1</option>
                            </optgroup>
                            <optgroup label="Legacy">
                                <option value="1.19.4">1.19.4</option>
                                <option value="1.18.2">1.18.2</option>
                                <option value="1.16.5">1.16.5</option>
                            </optgroup>
                        </select>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-3 p-4 bg-zinc-900/50 border border-white/5 rounded-xl">
                         <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex justify-between items-center">
                             <span>Memory</span>
                             <span className="text-primary font-mono text-xs">{formData.ram} GB</span>
                         </label>
                         <input 
                            type="range" min="2" max="16" step="1"
                            value={formData.ram}
                            onChange={e => setFormData({...formData, ram: parseInt(e.target.value)})}
                            className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-white"
                        />
                         <div className="flex gap-2 text-[9px] text-muted-foreground/50 italic px-1">
                            <Info size={10} className="shrink-0" />
                            <span>Recommended: {formData.software.match(/Forge|Modpack/) ? '4GB+' : '2GB+'}</span>
                        </div>
                    </div>

                    {/* Forge Modpack Upload */}
                    {formData.software === 'Forge' && (
                         <div className="p-3 border border-dashed border-white/10 rounded-xl bg-zinc-900/30">
                             <label className="flex items-center gap-2 cursor-pointer select-none">
                                 <input type="checkbox" className="w-3 h-3 rounded bg-black accent-primary" checked={useModpack} onChange={() => setUseModpack(!useModpack)} />
                                 <span className="text-xs font-medium text-zinc-400">Custom Upload (.zip)</span>
                             </label>
                             <AnimatePresence>
                                 {useModpack && (
                                     <motion.div 
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden"
                                     >
                                         <input 
                                            type="file" accept=".zip" 
                                            className="mt-2 block w-full text-[10px] text-zinc-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-white/5 file:text-white"
                                            onChange={(e) => {
                                                if (e.target.files?.[0]) {
                                                    const f = e.target.files[0];
                                                    f.arrayBuffer().then(b => setUploadedFileData({ blob: new Blob([b]), name: f.name, size: f.size }));
                                                }
                                            }}
                                         />
                                     </motion.div>
                                 )}
                             </AnimatePresence>
                         </div>
                    )}

                    {/* Modpack Browser */}
                    {formData.software === 'Modpack' && (
                        <div className="bg-zinc-900 border border-white/5 p-1 rounded-xl">
                            <ModpackBrowser onSelect={(p) => {
                                setSelectedModpack(p);
                                setFormData({...formData, name: p.title, modpackUrl: `modrinth:${p.id}`});
                            }} />
                        </div>
                    )}
                </div>
            </div>

            {mode === 'wizard' && (
                <div className="flex justify-between items-center pt-4 border-t border-white/5">
                    <button onClick={() => setStep('software')} className="text-zinc-500 hover:text-white text-xs font-medium">Back</button>
                    <button 
                        disabled={!formData.name}
                        onClick={() => setStep('review')} 
                        className="px-6 py-2 bg-white text-black rounded-lg text-xs font-bold hover:bg-zinc-200 disabled:opacity-20 shadow-lg"
                    >
                        Review Output
                    </button>
                </div>
            )}
        </motion.div>
    );

    const renderReviewStep = () => (
        <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-4"
        >
            <div className="bg-[#121214] border border-white/5 rounded-2xl p-6 shadow-xl">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-1.5 bg-primary/10 rounded-md border border-primary/20">
                        <Terminal size={16} className="text-primary" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white">Review & Deploy</h3>
                </div>

                <div className="bg-black/20 border border-white/5 rounded-xl p-4 space-y-3 text-xs mb-6">
                    <div className="flex justify-between items-center">
                        <span className="text-zinc-500 font-medium">Instance</span>
                        <span className="font-bold text-zinc-300">{formData.name}</span>
                    </div>
                    <div className="h-px bg-white/5" />
                    <div className="flex justify-between items-center">
                        <span className="text-zinc-500 font-medium">Software</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-zinc-400">{formData.software}</span>
                            <span className="text-zinc-300">{formData.version}</span>
                        </div>
                    </div>
                    <div className="h-px bg-white/5" />
                    <div className="flex justify-between items-center">
                        <span className="text-zinc-500 font-medium">Resources</span>
                        <span className="text-zinc-300 font-bold">{formData.ram} GB RAM</span>
                    </div>
                </div>

                <div 
                    className="flex items-start gap-3 p-4 bg-zinc-900/50 border border-white/5 rounded-xl cursor-pointer hover:bg-zinc-900 transition-colors" 
                    onClick={() => setFormData({...formData, eula: !formData.eula})}
                >
                    <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-all ${formData.eula ? 'bg-emerald-500 border-emerald-500' : 'bg-black border-white/10'}`}>
                        {formData.eula && <Check size={10} className="text-black" strokeWidth={4} />}
                    </div>
                    <div>
                        <div className="text-xs font-bold text-white mb-0.5">Accept Minecraft EULA</div>
                        <div className="text-[10px] text-zinc-500 leading-tight">
                            I verify that I have read and agree to the Mojang EULA.
                        </div>
                    </div>
                </div>

                <button 
                    onClick={handleDeploy}
                    disabled={!formData.eula || isDeploying}
                    className="w-full mt-6 bg-white text-black py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-zinc-200 disabled:opacity-10 shadow-lg"
                >
                    {isDeploying ? (
                        <>
                            <Loader2 className="animate-spin" size={16} />
                            <span>DEPLOYING...</span>
                        </>
                    ) : ( 
                        <>
                            <Zap size={16} />
                            Deploy Instance
                        </>
                    )}
                </button>
            </div>

            {mode === 'wizard' && (
                <div className="flex justify-center">
                    <button 
                        onClick={() => setStep('details')} 
                        className="text-zinc-600 hover:text-zinc-400 text-[10px] font-bold uppercase tracking-widest"
                    >
                        Adjust Configuration
                    </button>
                </div>
            )}
        </motion.div>
    );

    // --- MAIN RENDER ---
    return (
        <div className="min-h-screen bg-background p-4 md:p-6 pb-20 overflow-hidden">
            <div className="max-w-5xl mx-auto h-full flex flex-col">
                {/* Compact Header */}
                <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pt-2"
                >
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={onBack} 
                            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 transition-all"
                        >
                            <ArrowLeft size={16} className="text-zinc-400" />
                        </button>
                        <div>
                            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2 leading-none uppercase">
                                Deploy Node
                            </h1>
                            <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-1">Manual Provisioning Protocol</p>
                        </div>
                    </div>
                    
                    <div className="flex bg-zinc-900 border border-white/5 p-1 rounded-lg">
                        <button 
                            onClick={() => { setMode('wizard'); setStep('software'); }}
                            className={`px-4 py-1.5 rounded text-[10px] font-black tracking-widest transition-all ${mode === 'wizard' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            WIZARD
                        </button>
                        <button 
                            onClick={() => { setMode('pro'); }}
                            className={`px-4 py-1.5 rounded text-[10px] font-black tracking-widest transition-all ${mode === 'pro' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            PRO CONFIG
                        </button>
                    </div>
                </motion.div>

                <div className="flex-1 overflow-y-auto pr-1">
                    <AnimatePresence mode="wait">
                        {mode === 'wizard' ? (
                            <motion.div 
                                key="wizard"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="max-w-2xl mx-auto"
                            >
                                <div className="flex justify-center mb-8 gap-2">
                                    {['software', 'details', 'review'].map((s, i) => {
                                        const isActive = ['software', 'details', 'review'].indexOf(step) >= i;
                                        return (
                                            <div key={s} className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                                                isActive ? 'bg-primary' : 'bg-white/5'
                                            }`} />
                                        );
                                    })}
                                </div>
                                <div className="bg-[#121214]/60 border border-white/5 rounded-2xl p-6 md:p-10">
                                    {step === 'software' && renderSoftwareStep()}
                                    {step === 'details' && renderDetailsStep()}
                                    {step === 'review' && renderReviewStep()}
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div 
                                key="pro"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                className="grid grid-cols-1 lg:grid-cols-12 gap-6"
                            >
                                <div className="lg:col-span-8 space-y-4">
                                    <div className="bg-[#121214]/60 border border-white/5 rounded-2xl p-6">
                                        {renderSoftwareStep()}
                                    </div>
                                    <div className="bg-[#121214]/60 border border-white/5 rounded-2xl p-6">
                                        {renderDetailsStep()}
                                    </div>
                                    <div className="bg-[#121214]/60 border border-white/5 rounded-2xl p-6">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Zap size={14} className="text-emerald-500" />
                                            <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Advanced Parameters</h3>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {[
                                                 { id: 'aikarFlags', label: "Aikar's Flags", desc: "Enterprise GC Tuning" },
                                                 { id: 'proxySupport', label: "Proxy Forwarding", desc: "Velocity/Bungee Compatibility" },
                                                 { id: 'installSpark', label: "Spark Profiler", desc: "Real-time Diagnostics" },
                                                 { id: 'onlineMode', label: "Official Auth", desc: "Enable Minecraft Account verification" }
                                             ].map(flag => (
                                                <label key={flag.id} className={`flex flex-col gap-1 p-3 bg-black/20 border border-white/5 rounded-xl cursor-pointer hover:border-white/10 transition-all ${flag.id === 'onlineMode' && !(formData as any)[flag.id] ? 'border-rose-500/30 bg-rose-500/5' : ''}`}>
                                                    <div className="flex items-center gap-3">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={(formData as any)[flag.id]} 
                                                            onChange={() => setFormData({...formData, [flag.id]: !(formData as any)[flag.id]})}
                                                            className={`w-3.5 h-3.5 rounded border-white/10 bg-black ${flag.id === 'onlineMode' ? 'accent-rose-500' : 'accent-primary'}`}
                                                        /> 
                                                        <span className={`text-xs font-bold ${flag.id === 'onlineMode' && !(formData as any)[flag.id] ? 'text-rose-500' : 'text-zinc-300'}`}>{flag.label}</span>
                                                    </div>
                                                    <p className="text-[9px] text-zinc-600 pl-6.5 font-medium">{flag.id === 'onlineMode' && !(formData as any)[flag.id] ? "CRACKED MODE ENABLED" : flag.desc}</p>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="lg:col-span-4">
                                    <div className="sticky top-0">
                                        {renderReviewStep()}
                                        <div className="mt-4 p-4 rounded-xl border border-white/5 bg-zinc-900/40 text-[9px] text-zinc-600 font-bold uppercase tracking-widest leading-relaxed">
                                            Node provisioning is localized. verify host capacity before deployment.
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

export default CreateServer;
