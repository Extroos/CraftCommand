import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, Box, Cpu, Layers, Loader2, HardDrive, Shield, Zap, Globe, Lock, Leaf, FileCode, Hammer, Package, Sparkles, MonitorPlay, ChevronRight, Info, Settings2, Activity, Terminal, AlertTriangle, Command } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { API } from '../../../services/api';
import { useServers } from '../../../context/ServerContext';
import { ServerTemplate } from '@shared/types';
import ModpackBrowser from '../ModpackBrowser';
import TemplateSelector from '../TemplateSelector';

// Sub-components
import WizardMode from './WizardMode';
import ProConfig from './ProConfig';

import { CreateMode, FormData, WizardStep, CreateServerProps, ServerCategory } from './types';

const CreateServer: React.FC<CreateServerProps> = ({ onBack, onDeploy }) => {
    const { refreshServers } = useServers();
    const [mode, setMode] = useState<CreateMode>('wizard');
    const [step, setStep] = useState<WizardStep>('software'); // Start with Software Selection
    const [category, setCategory] = useState<ServerCategory | null>('GAME');
    const [isDeploying, setIsDeploying] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    
    const [formData, setFormData] = useState<FormData>({
        name: '',
        software: 'Paper',
        version: '1.21.11',
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

        installSpark: false,
        onlineMode: true,
        usePurpur: false,
        templateId: undefined,
        cpuPriority: 'normal'
    });

    const [selectedModpack, setSelectedModpack] = useState<any>(null);
    const [uploadedFileData, setUploadedFileData] = useState<{blob: Blob, name: string, size: number} | null>(null);
    const [useModpack, setUseModpack] = useState(false);
    const [templates, setTemplates] = useState<ServerTemplate[]>([]);


    // Load Templates
    useEffect(() => {
        const load = async () => {
            try {
                const token = localStorage.getItem('cc_token');
                if (token) {
                    const t = await API.getTemplates(token);
                    setTemplates(t);
                }
            } catch (e) {
                console.error('Failed to load templates', e);
            }
        };
        load();
    }, []);

    // Smart Defaults Helper
    const getRecommendedJava = (ver: string, software?: string): string => {
        try {
            const parts = ver.split('.');
            const major = parseInt(parts[1]);
            const minor = parseInt(parts[2] || '0');
            
            if (major >= 21) return 'Java 21'; // 1.21+
            if (major === 20) return minor >= 5 ? 'Java 21' : 'Java 17'; // 1.20.5+ -> 21
            if (major >= 17) return 'Java 17'; // 1.17+ -> 17
            return 'Java 8'; // 1.16.5 and below
        } catch { return 'Java 21'; }
    };

    // Handle Version Change (Unlocks Template)
    const handleVersionChange = (newVersion: string) => {
        const recommended = getRecommendedJava(newVersion, formData.software);
        setFormData(prev => ({
            ...prev,
            version: newVersion,
            javaVersion: recommended as any,
            templateId: undefined // Detach from template to allow custom version
        }));
    };

    // Auto-RAM Smart Logic
    useEffect(() => {
        switch (formData.software) {
            case 'Forge':
            case 'Modpack':
                if (formData.ram < 6) setFormData(p => ({ ...p, ram: 6 }));
                break;
            case 'NeoForge':
            case 'Fabric':
                if (formData.ram < 4) setFormData(p => ({ ...p, ram: 4 }));
                break;
            case 'Paper':
            case 'Purpur':
            case 'Vanilla':
            case 'Spigot':
                if (formData.ram < 2) setFormData(p => ({ ...p, ram: 2 }));
                break;
        }
    }, [formData.software]);

    const recommendedJava = getRecommendedJava(formData.version, formData.software);
    const showJavaWarning = formData.javaVersion !== recommendedJava;

    const handleDeploy = async () => {
        // Validation: EULA is only required for Game Servers (Mojang EULA)
        if (!formData.name || !formData.eula) return;
        setIsDeploying(true);
        
        try {
            const token = localStorage.getItem('cc_token');
            
            // 1. Create Server Container
            const server = await API.createServer({
                name: formData.name,
                folderName: formData.folderName, // Custom Folder Name (P0)
                software: (formData.software as any),
                version: formData.version,
                port: formData.port,
                ram: formData.ram,
                cpuPriority: (formData as any).cpuPriority,
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
                    antiDdos: formData.enableSecurity,
                    debugMode: false,

                    installSpark: formData.installSpark
                }
            });

            // 2. If template is used, install it NOW before starting the server
            if (formData.templateId) {
                await API.installTemplate(token!, server.id, formData.templateId);
            }
            else {
                // Fallback / Pro Mode Manual Install
                const installOpts = { version: formData.version, build: formData.loaderBuild };
                
                switch (formData.software) {
                    case 'Paper': 
                        await API.installServer(server.id, formData.usePurpur ? 'purpur' : 'paper', installOpts); 
                        break;
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
                        await API.installServer(server.id, 'modpack', { url: formData.modpackUrl, version: formData.version });
                        break;
                }
            }

            // 3. Refresh server list
            await refreshServers();
            
            setIsDeploying(false);
            onDeploy();
        } catch (e: any) {
            console.error(e);
            setIsDeploying(false);
            alert(`Deployment failed: ${e.message}`);
        }
    };

    // Category Selection Step Removed

    const softwareOptions = [
        { id: 'Paper', icon: <img src="/software-icons/paper.png" className="w-12 h-12 object-contain" alt="Paper" />, desc: 'High performance for plugins.' },
        { id: 'NeoForge', icon: <img src="/software-icons/neoforge.png" className="w-12 h-12 object-contain" alt="NeoForge" />, desc: 'The future of modding.' },
        { id: 'Forge', icon: <img src="/software-icons/forge.png" className="w-12 h-12 object-contain" alt="Forge" />, desc: 'Classic mod loader.' },
        { id: 'Fabric', icon: <img src="/software-icons/fabric-minecraft.png" className="w-12 h-12 object-contain" alt="Fabric" />, desc: 'Lightweight & fast.' },
        { id: 'Modpack', icon: <img src="/software-icons/modapack.png" className="w-12 h-12 object-contain" alt="Modpack" />, desc: 'CurseForge & Modrinth.' },
        { id: 'Vanilla', icon: <img src="/software-icons/vanilla.png" className="w-12 h-12 object-contain" alt="Vanilla" />, desc: 'Official Mojang server.' },
    ];
    // ...
    const renderSoftwareStep = () => (
        <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
        >
            <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-primary/10 rounded-md border border-primary/20">
                    <Layers size={16} className="text-primary" />
                </div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white">Select Template</h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {softwareOptions.map((sw, i) => (
                    <motion.button
                        key={sw.id}
                        whileHover={{ borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.05)' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                            setFormData({ ...formData, software: sw.id, templateId: undefined });
                        }}
                        className={`group relative p-4 rounded-xl border text-left transition-all ${
                            formData.software === sw.id 
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/20' 
                            : 'border-[rgb(var(--color-border-subtle))] bg-input/50'
                        }`}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg transition-colors ${
                                formData.software === sw.id ? 'text-primary' : 'text-[rgb(var(--color-fg-muted))] group-hover:text-[rgb(var(--color-fg-secondary))]'
                            }`}>
                                {sw.icon}
                            </div>
                            <div>
                                <div className="font-bold text-sm text-white">{sw.id}</div>
                                <div className="text-[10px] text-[rgb(var(--color-fg-muted))] leading-none mt-0.5 opacity-60">{sw.id} Instance</div>
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

            {/* Manual Paper Fork Selection */}
            {formData.software === 'Paper' && !formData.templateId && (
                    <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-4 p-4 border border-[rgb(var(--color-border-subtle))] rounded-xl bg-input/40"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-pink-500/10 rounded-lg border border-pink-500/20">
                                    <img src="/software-icons/purpur.png" className="w-6 h-6 object-contain" alt="Purpur" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white">Use Purpur Fork</h3>
                                    <p className="text-[10px] text-[rgb(var(--color-fg-muted))] font-medium">Alternative high-performance fork.</p>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={formData.usePurpur} 
                                onChange={(e) => setFormData({...formData, usePurpur: e.target.checked})} 
                                />
                                <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-pink-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-500"></div>
                            </label>
                        </div>
                    </motion.div>
            )}
        </motion.div>
    );

    const renderDetailsStep = () => (
        <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            <div className="flex items-center gap-2 mb-1">
                {/* Only show header in Pro mode detail renderer, Wizard handles it differently */}
                {mode === 'pro' && (
                    <>
                    <div className="p-1.5 bg-blue-500/10 rounded-md border border-blue-500/20">
                        <Settings2 size={16} className="text-blue-500" />
                    </div>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-white">Instance Configuration</h2>
                    </>
                )}
            </div>


            
                /* Regular Game Server Config */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Server Name</label>
                            <div className="relative">
                                <input 
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    className="w-full bg-input border border-[rgb(var(--color-border-subtle))] rounded-lg py-2 px-3 focus:border-primary/50 outline-none text-sm text-white font-medium"
                                    placeholder="Alpha-01"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Software Version</label>
                            <select 
                                value={formData.version}
                                onChange={e => handleVersionChange(e.target.value)}
                                className="w-full bg-input border border-[rgb(var(--color-border-subtle))] rounded-lg py-2 px-3 outline-none text-sm text-white font-medium cursor-pointer appearance-none hover:bg-input/80 transition-colors"
                            >

                                <optgroup label="Modern">
                                    <option value="1.21.11">1.21.11 (Latest)</option>
                                    <option value="1.21.1">1.21.1</option>
                                    <option value="1.21">1.21</option>
                                    <option value="1.20.6">1.20.6</option>
                                    <option value="1.20.4">1.20.4</option>
                                    <option value="1.20.1">1.20.1</option>
                                </optgroup>
                                <optgroup label="Legacy">
                                    <option value="1.19.4">1.19.4</option>
                                    <option value="1.18.2">1.18.2</option>
                                    <option value="1.17.1">1.17.1</option>
                                    <option value="1.16.5">1.16.5</option>
                                    <option value="1.12.2">1.12.2</option>
                                    <option value="1.8.9">1.8.9</option>
                                </optgroup>
                            </select>
                            {formData.templateId && <p className="text-[10px] text-emerald-400 flex items-center gap-1"><Sparkles size={10} /> Template Selected (Change version to customize)</p>}
                        </div>


                        {/* Java Version Selector with smart warning */}
                         <div className="space-y-1.5 mt-4">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between">
                                <span>Java Runtime</span>
                                {showJavaWarning && <span className="text-amber-500 flex items-center gap-1"><AlertTriangle size={10} /> Not Recommended</span>}
                            </label>
                            <select 
                                value={formData.javaVersion}
                                onChange={e => setFormData({...formData, javaVersion: e.target.value as any})}
                                className={`w-full bg-input border rounded-lg py-2 px-3 outline-none text-sm font-medium cursor-pointer appearance-none transition-colors ${showJavaWarning ? 'border-amber-500/50 text-amber-200' : 'border-[rgb(var(--color-border-subtle))] text-white'}`}
                            >
                                <option value="Java 21">Java 21 (Recommended for 1.21+)</option>
                                <option value="Java 17">Java 17 (Recommended for 1.18+)</option>
                                <option value="Java 11">Java 11 (Legacy)</option>
                                <option value="Java 8">Java 8 (Legacy 1.12)</option>
                            </select>
                            {showJavaWarning && (
                                <p className="text-[10px] text-amber-500/80 leading-tight">
                                    Warning: Minecraft {formData.version} usually requires {recommendedJava}.
                                </p>
                            )}
                        </div>

                        {/* Advanced Options (Folder Name & specific builds) */}
                        <div className="pt-2">
                             <button 
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground hover:text-white transition-colors uppercase tracking-widest"
                             >
                                <Settings2 size={12} />
                                {showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Options'}
                             </button>
                        </div>
                        
                        <AnimatePresence>
                            {showAdvanced && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden space-y-4 pt-2"
                                >
                                    {/* Folder Name */}
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Server Folder Name (Optional)</label>
                                        <div className="relative">
                                            <input 
                                                value={formData.folderName || ''}
                                                onChange={e => {
                                                    const val = e.target.value.replace(/[^a-zA-Z0-9_\-]/g, '');
                                                    setFormData({...formData, folderName: val});
                                                }}
                                                className="w-full bg-input border border-[rgb(var(--color-border-subtle))] rounded-lg py-2 px-3 focus:border-primary/50 outline-none text-sm text-white font-medium font-mono"
                                                placeholder="Auto-generated (local-timestamp)"
                                            />
                                            <div className="text-[9px] text-muted-foreground mt-1 font-mono break-all opacity-60">
                                                Path: .../backend/minecraft_servers/{formData.folderName || `local-TIMESTAMP`}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Loader Build (Forge/NeoForge Only) */}
                                    {(formData.software === 'Forge' || formData.software === 'NeoForge') && (
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Loader Build ID</label>
                                            <input 
                                                value={formData.loaderBuild || ''}
                                                onChange={e => setFormData({...formData, loaderBuild: e.target.value})}
                                                className="w-full bg-input border border-[rgb(var(--color-border-subtle))] rounded-lg py-2 px-3 focus:border-primary/50 outline-none text-sm text-white font-medium"
                                                placeholder="Latest (Default)"
                                            />
                                            <p className="text-[9px] text-amber-500/80 leading-tight flex items-center gap-1">
                                                <AlertTriangle size={10} /> Advanced: Only set this if you need a specific build.
                                            </p>
                                        </div>
                                    )}

                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-3 p-4 bg-input/50 border border-[rgb(var(--color-border-subtle))] rounded-xl">
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
                        {formData.software === 'Forge' && !formData.templateId && (
                                <div className="p-3 border border-dashed border-[rgb(var(--color-border-default))] rounded-xl bg-input/30">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input type="checkbox" className="w-3 h-3 rounded bg-black accent-primary" checked={useModpack} onChange={() => setUseModpack(!useModpack)} />
                                        <span className="text-xs font-medium text-[rgb(var(--color-fg-muted))]">Custom Upload (.zip)</span>
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
                                                className="mt-2 block w-full text-[10px] text-[rgb(var(--color-fg-muted))] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-white/5 file:text-white"
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
                        {formData.software === 'Modpack' && !formData.templateId && (
                            <div className="bg-input border border-[rgb(var(--color-border-subtle))] p-1 rounded-xl">
                                <ModpackBrowser onSelect={(p) => {
                                    setSelectedModpack(p);
                                    setFormData({...formData, name: p.title, modpackUrl: `modrinth:${p.id}`});
                                }} />
                            </div>
                        )}
                    </div>
                </div>

            
            {/* CPU Priority & Advanced Resource Config */}
            <div className="mt-4 space-y-2">
                <div className="bg-input/30 border border-[rgb(var(--color-border-subtle))] rounded-xl p-1.5 flex items-center justify-between gap-4">
                    <div className="px-2 flex items-center gap-3">
                        <div className="p-1.5 bg-white/5 rounded-md text-muted-foreground">
                            <Activity size={14} />
                        </div>
                        <div>
                            <h3 className="text-[10px] font-bold text-white uppercase tracking-wider">CPU Priority</h3>
                            <p className="text-[9px] text-muted-foreground font-medium hidden sm:block">Allocates processor cycles relative to system tasks.</p>
                        </div>
                    </div>

                    <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                        {[
                            { id: 'normal', label: 'Normal', icon: <Box size={10} /> },
                            { id: 'high', label: 'High', icon: <Zap size={10} /> },
                            { id: 'realtime', label: 'Realtime', icon: <AlertTriangle size={10} /> }
                        ].map((p) => (
                            <button
                                key={p.id}
                                onClick={() => setFormData({...formData, cpuPriority: p.id as any})}
                                className={`
                                    flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all
                                    ${(formData as any).cpuPriority === p.id 
                                        ? p.id === 'realtime' 
                                            ? 'bg-red-500/20 text-red-400 shadow-sm border border-red-500/20' 
                                            : p.id === 'high'
                                                ? 'bg-amber-500/20 text-amber-400 shadow-sm border border-amber-500/20'
                                                : 'bg-white/10 text-white shadow-sm border border-white/10'
                                        : 'text-muted-foreground hover:text-white hover:bg-white/5'
                                    }
                                `}
                            >
                                {p.icon}
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Realtime Warning */}
                {(formData as any).cpuPriority === 'realtime' && (
                    <div className="flex items-start gap-2 p-3 bg-red-500/5 border border-red-500/10 rounded-lg text-red-500/90 animate-in fade-in slide-in-from-top-1">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                        <p className="text-[10px] leading-relaxed">
                            <strong className="font-bold">Caution:</strong> Realtime priority forces the OS to process server tasks before <em>anything</em> else, including mouse input and system stability tasks. Only use on dedicated hardware.
                        </p>
                    </div>
                )}
            </div>
        </motion.div>
    );

    const renderReviewStep = () => (
        <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4"
        >
            <div className="bg-[#121214] border border-[rgb(var(--color-border-subtle))] rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Terminal size={100} />
                </div>

                <div className="flex items-center gap-3 mb-6 relative z-10">
                    <div className="p-1.5 bg-primary/10 rounded-md border border-primary/20">
                        <Terminal size={16} className="text-primary" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white">Review & Deploy</h3>
                </div>

                <div className="bg-black/20 border border-[rgb(var(--color-border-subtle))] rounded-xl p-4 space-y-3 text-xs mb-6 relative z-10 font-mono">
                    <div className="flex justify-between items-center">
                        <span className="text-[rgb(var(--color-fg-muted))] font-medium">Instance</span>
                        <span className="font-bold text-[rgb(var(--color-fg-secondary))]">{formData.name}</span>
                    </div>
                    <div className="h-px bg-white/5" />
                    <div className="flex justify-between items-center">
                        <span className="text-[rgb(var(--color-fg-muted))] font-medium">Software</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-[rgb(var(--color-fg-muted))]">
                                {formData.templateId ? 'Template: ' : ''}
                                {formData.usePurpur ? 'Purpur (Paper Fork)' : formData.software}
                            </span>
                            <span className="text-[rgb(var(--color-fg-secondary))]">{formData.version}</span>
                        </div>
                    </div>
                    <div className="h-px bg-white/5" />
                    <div className="flex justify-between items-center">
                        <span className="text-[rgb(var(--color-fg-muted))] font-medium">Resources</span>
                        <span className="text-[rgb(var(--color-fg-secondary))] font-bold">{formData.ram} GB RAM</span>
                    </div>
                     <div className="h-px bg-white/5" />
                     <div className="flex justify-between items-center">
                        <span className="text-[rgb(var(--color-fg-muted))] font-medium">Network</span>
                        <span className="text-[rgb(var(--color-fg-secondary))] font-bold">Port {formData.port}</span>
                    </div>
                </div>

                <div 
                    className="relative z-10 flex items-start gap-3 p-4 bg-input/50 border border-[rgb(var(--color-border-subtle))] rounded-xl cursor-pointer hover:bg-input transition-colors" 
                    onClick={() => setFormData({...formData, eula: !formData.eula})}
                >
                    <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-all ${formData.eula ? 'bg-emerald-500 border-emerald-500' : 'bg-black border-[rgb(var(--color-border-default))]'}`}>
                        {formData.eula && <Check size={10} className="text-black" strokeWidth={4} />}
                    </div>
                    <div>
                        <div className="text-xs font-bold text-white mb-0.5">Accept Minecraft EULA</div>
                        <div className="text-[10px] text-[rgb(var(--color-fg-muted))] leading-tight">
                            I verify that I have read and agree to the Mojang EULA.
                        </div>
                    </div>
                </div>

                <button 
                    onClick={handleDeploy}
                    disabled={!formData.eula || isDeploying}
                    className="relative z-10 w-full mt-6 bg-white text-black py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-zinc-200 disabled:opacity-10 shadow-lg"
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
        </motion.div>
    );


    return (
        <div className="min-h-screen bg-background p-4 md:p-6 pb-20 overflow-hidden">
            <div className="max-w-7xl mx-auto h-full flex flex-col">
                {/* Header */}
                <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pt-2"
                >
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={onBack} 
                            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg border border-[rgb(var(--color-border-subtle))] transition-all"
                        >
                            <ArrowLeft size={16} className="text-[rgb(var(--color-fg-muted))]" />
                        </button>
                        <div>
                            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2 leading-none uppercase">
                                Deploy Node
                            </h1>
                            <p className="text-[10px] text-[rgb(var(--color-fg-subtle))] font-bold uppercase tracking-widest mt-1">
                                {mode === 'wizard' ? 'Guided Deployment' : 'Manual Provisioning Protocol'}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex bg-input border border-[rgb(var(--color-border-subtle))] p-1 rounded-lg">
                        <button 
                            onClick={() => { setCategory('GAME'); setMode('wizard'); setStep('software'); }}
                            className={`px-4 py-1.5 rounded text-[10px] font-black tracking-widest transition-all ${category === 'GAME' && mode === 'wizard' ? 'bg-white text-black shadow-lg' : 'text-[rgb(var(--color-fg-muted))] hover:text-[rgb(var(--color-fg-secondary))]'}`}
                        >
                            WIZARD
                        </button>
                        <button 
                            onClick={() => { setCategory('GAME'); setMode('pro'); setStep('software'); }}
                            className={`px-4 py-1.5 rounded text-[10px] font-black tracking-widest transition-all ${category === 'GAME' && mode === 'pro' ? 'bg-white text-black shadow-lg' : 'text-[rgb(var(--color-fg-muted))] hover:text-[rgb(var(--color-fg-secondary))]'}`}
                        >
                            PRO CONFIG
                        </button>

                    </div>
                </motion.div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto pr-1">
                     <AnimatePresence mode="wait">
                        {mode === 'wizard' ? (
                            <WizardMode 
                                formData={formData}
                                setFormData={setFormData}
                                step={step}
                                setStep={setStep}
                                templates={templates}
                                renderDetailsStep={renderDetailsStep}
                                renderReviewStep={renderReviewStep}
                            />
                        ) : (
                            <ProConfig 
                                formData={formData}
                                setFormData={setFormData}
                                handleDeploy={handleDeploy}
                                isDeploying={isDeploying}
                                softwareOptions={softwareOptions}
                                renderSoftwareStep={renderSoftwareStep}
                                renderDetailsStep={renderDetailsStep}
                                renderReviewStep={renderReviewStep}
                            />
                        )}
                     </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

export default CreateServer;
