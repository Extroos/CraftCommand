import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Check, Box, Layers, Loader2, Zap, Package, Sparkles, MonitorPlay, Info, Settings2, Activity, Terminal, AlertTriangle, Plus, Minus, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { API } from '@core/services/api';
import { useServers } from '@features/servers/context/ServerContext';
import { useSystem } from '@features/system/context/SystemContext';
import { useUser } from '@features/auth/context/UserContext';
import { useToast } from '@features/ui/Toast';
import { ServerTemplate, NodeInfo } from '@shared/types';
import ModpackBrowser from '../ModpackBrowser';

// Sub-components
import WizardMode from './WizardMode';
import ProConfig from './ProConfig';

import { getErrorHelp } from '@core/settings/ErrorHelpMap';
import { CreateMode, FormData, WizardStep, CreateServerProps, ServerCategory } from './types';
import { getServerCapabilities } from '@shared/utils/CapabilityUtils';
import { synthesizeDefaultState, getRecommendedJavaForVersion, syncFormDataForModpack } from './CreateServerUtils';
import { usePermissions } from '@features/auth/hooks/usePermissions';
import AccessDenied from '@features/auth/components/AccessDenied';

const CreateServer: React.FC<CreateServerProps> = ({ onBack, onDeploy }) => {
    const { refreshServers } = useServers();
    const { settings } = useSystem();
    const { user } = useUser();
    const { addToast } = useToast();
    const { can } = usePermissions();
    const canCreate = can('server.create');
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
        cpuPriority: 'normal',
        nodeId: settings?.app?.distributedNodes?.enabled ? 'auto' : 'local',
        forwardingMode: 'modern',
        proxySecret: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    });

    const capabilities = useMemo(() => getServerCapabilities(formData.software), [formData.software]);

    const [selectedModpack, setSelectedModpack] = useState<any>(null);
    const [uploadedFileData, setUploadedFileData] = useState<{blob: Blob, name: string, size: number} | null>(null);
    const [useModpack, setUseModpack] = useState(false);
    const [templates, setTemplates] = useState<ServerTemplate[]>([]);
    const [availableNodes, setAvailableNodes] = useState<NodeInfo[]>([]);
    const [bedrockVersions, setBedrockVersions] = useState<{ latest: string, versions: string[] }>({
        latest: '1.26.1.1',
        versions: ['1.26.1.1']
    });

    // Load Bedrock Versions
    useEffect(() => {
        const loadBedrock = async () => {
            try {
                const res = await API.getBedrockVersions();
                setBedrockVersions(res);
            } catch (e) {
                console.error('Failed to load Bedrock versions', e);
            }
        };
        loadBedrock();
    }, []);


    // Load Templates
    useEffect(() => {
        const load = async () => {
            try {
                const token = localStorage.getItem('cc_token');
                if (token) {
                    const isDistributedEnabled = settings?.app?.distributedNodes?.enabled;
                    
                    if (isDistributedEnabled) {
                        try {
                            const [t, n] = await Promise.all([
                                API.getTemplates(),
                                API.getNodes()
                            ]);
                            setTemplates(t);
                            setAvailableNodes(n.nodes || []);
                        } catch (err) {
                            console.error('Failed to load nodes, falling back to templates only', err);
                            const t = await API.getTemplates();
                            setTemplates(t);
                        }
                    } else {
                        const t = await API.getTemplates();
                        setTemplates(t);
                        setAvailableNodes([]);
                    }
                }
            } catch (e) {
                console.error('Failed to load templates', e);
            }
        };
        load();
    }, [settings?.app?.distributedNodes?.enabled]);



    // Handle Version Change (Unlocks Template)
    const handleVersionChange = (newVersion: string) => {
        const recommended = getRecommendedJavaForVersion(newVersion, formData.software); 
        setFormData(prev => ({
            ...prev,
            version: newVersion,
            javaVersion: recommended as any,
            templateId: undefined
        }));
    };

    const recommendedJava = getRecommendedJavaForVersion(formData.version, formData.software);
    const showJavaWarning = formData.javaVersion !== recommendedJava;

    const handleDeploy = async () => {
        // Validation: EULA is only required for Game Servers (Mojang EULA)
        if (!formData.name || !formData.eula) return;
        
        if (!canCreate) {
            addToast('error', 'Access Denied', 'You do not have permission to create servers.');
            return;
        }

        setIsDeploying(true);
        
        try {
            const token = localStorage.getItem('cc_token');
            
            // 1. Create Server Container
            const server = await API.createServer({
                name: formData.name,
                folderName: formData.folderName, // Custom Folder Name (P0)
                software: formData.software as 'Paper' | 'Forge' | 'Fabric' | 'Vanilla' | 'Bedrock' | 'Spigot' | 'Purpur' | 'Velocity',
                version: formData.version,
                port: formData.port,
                ram: formData.ram,
                nodeId: formData.nodeId,
                cpuPriority: formData.cpuPriority,
                motd: formData.motd,
                maxPlayers: formData.maxPlayers,
                javaVersion: formData.javaVersion as 'Java 8' | 'Java 11' | 'Java 17' | 'Java 21',
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
                },
                network: formData.software === 'Velocity' ? {
                    updateEnabled: false,
                    monitoringEnabled: true,
                    updateInterval: 60,
                    proxyConfig: {
                        links: [],
                        forwardingMode: formData.forwardingMode,
                        secret: formData.proxySecret
                    }
                } : undefined,
                modpackId: selectedModpack?.id,
                modpackTitle: selectedModpack?.title,
                modpackIcon: selectedModpack?.icon_url,
                modpackAuthor: selectedModpack?.author,
                modpackType: selectedModpack?.project_type
            });

            // 2. If template is used, install it NOW before starting the server
            if (formData.templateId) {
                await API.installTemplate(server.id, formData.templateId, { customUrl: formData.modpackUrl });
            }
            else {
                // Fallback / Pro Mode Manual Install
                const installOpts = { version: formData.version, build: formData.loaderBuild };
                
                // STEP 1: If a modpackUrl is set (from Modrinth browser), install the mod/modpack FIRST
                // This downloads the actual mod .jar files into the mods/ folder
                if (formData.modpackUrl) {
                    await API.installServer(server.id, 'modpack', { url: formData.modpackUrl, version: formData.version });
                }

                // STEP 2: Install the base server software (Fabric/Forge/etc.)
                // When modpackUrl was set above, the backend's installModpackFromZip already installs
                // the loader for single mods. For .mrpack packs, it also installs the loader.
                // So we skip the redundant base install if modpackUrl was handled.
                if (!formData.modpackUrl) {
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
                        case 'Bedrock':
                            await API.installServer(server.id, 'bedrock', { version: formData.version });
                            break;
                        case 'Velocity':
                            await API.installServer(server.id, 'velocity', { version: formData.version });
                            break;
                    }
                }
            }

            // 3. Refresh server list
            await refreshServers();
            
            setIsDeploying(false);
            onDeploy();
        } catch (e: any) {
            console.error(e);
            setIsDeploying(false);
            
            const msg = e.response?.data?.error || e.message || 'Unknown error';
            
            if (msg.includes('DNS Resolution failed')) {
                addToast('error', 'Deployment Failed', `DNS Issues Detected. TIP: Check your internet connection or manually upload the bedrock_server binary via the Files tab after creation if automatic download persists.`);
            } else {
                const help = getErrorHelp(e.code);
                if (help) {
                    addToast('error', help.title, `${help.description}. See: ${help.docsUrl || 'Wiki'}`);
                } else {
                    addToast('error', 'Deployment failed', msg);
                }
            }
        }
    };



    if (!canCreate) {
        return (
            <AccessDenied 
                title="Server Provisioning Restricted"
                description="You do not have the required permissions to create new server instances. Please contact the system owner for elevation."
                onBack={onBack}
            />
        );
    }

    const softwareOptions = [
        { id: 'Paper', icon: <img src="/software-icons/paper.png" className="w-10 h-10 object-contain" alt="Paper" />, desc: 'High performance for plugins.' },
        { id: 'NeoForge', icon: <img src="/software-icons/neoforge.png" className="w-10 h-10 object-contain" alt="NeoForge" />, desc: 'The future of modding.' },
        { id: 'Forge', icon: <img src="/software-icons/forge.png" className="w-10 h-10 object-contain" alt="Forge" />, desc: 'Classic mod loader.' },
        { id: 'Fabric', icon: <img src="/software-icons/fabric-minecraft.png" className="w-10 h-10 object-contain" alt="Fabric" />, desc: 'Lightweight & fast.' },
        { id: 'Modpack', icon: <img src="/software-icons/modapack.png" className="w-10 h-10 object-contain" alt="Modpack" />, desc: 'CurseForge & Modrinth.' },
        { id: 'Vanilla', icon: <img src="/software-icons/vanilla.png" className="w-10 h-10 object-contain" alt="Vanilla" />, desc: 'Official Mojang server.' },
        { id: 'Bedrock', icon: <img src="/software-icons/bedrock.png" className="w-10 h-10 object-contain" alt="Bedrock" />, desc: 'Bedrock Dedicated Server.' },
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
                    <Layers size={14} className="text-primary" />
                </div>
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-foreground/70">Select Template</h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {softwareOptions.map((sw, i) => (
                    <motion.button
                        key={sw.id}
                        whileHover={{ borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.05)' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                            setFormData(prev => synthesizeDefaultState(sw.id, prev, bedrockVersions));
                        }}
                        className={`group relative p-3 rounded-lg border text-left transition-all ${
                            (formData.software === sw.id || (sw.id === 'Paper' && formData.software === 'Purpur'))
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/20 shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)]' 
                            : 'border-border bg-card/40'
                        }`}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg transition-colors ${
                                (formData.software === sw.id || (sw.id === 'Paper' && formData.software === 'Purpur')) ? 'text-primary' : 'text-[rgb(var(--color-fg-muted))] group-hover:text-[rgb(var(--color-fg-secondary))]'
                            }`}>
                                {sw.icon}
                            </div>
                            <div>
                                <div className="font-bold text-[11px] text-foreground">
                                    {sw.id === 'Paper' && formData.usePurpur ? 'Purpur' : sw.id}
                                </div>
                                <div className="text-[9px] text-muted-foreground leading-none mt-0.5 opacity-60 uppercase tracking-widest">
                                    {sw.id === 'Paper' && formData.usePurpur ? 'Optimize Fork' : 'Instance'}
                                </div>
                            </div>
                        </div>
                        {(formData.software === sw.id || (sw.id === 'Paper' && formData.software === 'Purpur')) && (
                            <div className="absolute top-3 right-3 text-primary">
                                <Check size={12} strokeWidth={4} />
                            </div>
                        )}
                    </motion.button>
                ))}
            </div>

            {/* Manual Paper Fork Selection */}
            {capabilities.softwareCategory === 'JAVA' && (formData.software === 'Paper' || formData.software === 'Purpur') && !formData.templateId && (
                    <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-3 p-3 border border-border rounded-lg bg-card/40"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-pink-500/10 rounded-lg border border-pink-500/20">
                                    <img src="/software-icons/purpur.png" className="w-6 h-6 object-contain" alt="Purpur" />
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold text-foreground">Use Purpur Fork</h3>
                                    <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-widest">High-performance fork.</p>
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
            className="space-y-4"
        >
            <div className="flex items-center gap-2 mb-1">
                {/* Only show header in Pro mode detail renderer, Wizard handles it differently */}
                {mode === 'pro' && (
                    <>
                    <div className="p-1.5 bg-blue-500/10 rounded-md border border-blue-500/20">
                        <Settings2 size={14} className="text-blue-500" />
                    </div>
                    <h2 className="text-[10px] font-bold uppercase tracking-widest text-foreground/70">Instance Configuration</h2>
                    </>
                )}
            </div>

            {formData.software === 'Velocity' ? renderVelocityDetails() : (
                <>
                {/* Regular Game Server Config */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Server Name</label>
                            <div className="relative">
                                <input 
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    className="w-full bg-muted/40 border border-border rounded-lg py-2 px-3 focus:border-primary/50 outline-none text-xs text-foreground font-medium transition-all"
                                    placeholder="Alpha-01"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Software Version</label>
                             <select 
                                value={formData.version}
                                onChange={e => handleVersionChange(e.target.value)}
                                className="w-full bg-muted/40 border border-border rounded-lg py-2 px-3 outline-none text-xs text-foreground font-medium cursor-pointer appearance-none hover:bg-muted/60 transition-colors"
                            >
                                {capabilities.softwareCategory === 'BEDROCK' ? (
                                    <optgroup label="Bedrock Stable">
                                        {bedrockVersions.versions.map(v => (
                                            <option key={v} value={v}>{v} {v === bedrockVersions.latest ? '(Latest)' : ''}</option>
                                        ))}
                                    </optgroup>
                                ) : (
                                    <>
                                    <optgroup label="Modern">
                                        <option value="1.21.11">1.21.11 (Latest)</option>
                                        <option value="1.21.10">1.21.10</option>
                                        <option value="1.21.9">1.21.9</option>
                                        <option value="1.21.8">1.21.8</option>
                                        <option value="1.21.7">1.21.7</option>
                                        <option value="1.21.6">1.21.6</option>
                                        <option value="1.21.5">1.21.5</option>
                                        <option value="1.21.4">1.21.4</option>
                                        <option value="1.21.3">1.21.3</option>
                                        <option value="1.21.2">1.21.2</option>
                                        <option value="1.21.1">1.21.1</option>
                                        <option value="1.21">1.21</option>
                                        <option value="1.20.6">1.20.6</option>
                                        <option value="1.20.4">1.20.4</option>
                                        <option value="1.20.1">1.20.1</option>
                                    </optgroup>
                                    <optgroup label="Legacy">
                                        <option value="1.19.4">1.19.4</option>
                                        <option value="1.19.2">1.19.2</option>
                                        <option value="1.18.2">1.18.2</option>
                                        <option value="1.17.1">1.17.1</option>
                                        <option value="1.16.5">1.16.5</option>
                                        <option value="1.12.2">1.12.2</option>
                                        <option value="1.8.9">1.8.9</option>
                                        <option value="1.8.8">1.8.8</option>
                                        <option value="1.7.10">1.7.10</option>
                                    </optgroup>
                                    </>
                                )}
                            </select>
                            {formData.templateId && <p className="text-[10px] text-emerald-400 flex items-center gap-1"><Sparkles size={10} /> Template Selected (Change version to customize)</p>}
                        </div>

                         {/* Java Version Selector with smart warning */}
                         {capabilities.supportsJava && (
                          <div className="space-y-1.5 mt-4">
                             <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between">
                                 <span>Java Runtime</span>
                                 {showJavaWarning && <span className="text-amber-500 flex items-center gap-1"><AlertTriangle size={10} /> Not Recommended</span>}
                             </label>
                             <select 
                                 value={formData.javaVersion}
                                 onChange={e => setFormData({...formData, javaVersion: e.target.value as any})}
                                 className={`w-full bg-muted/40 border rounded-lg py-2 px-3 outline-none text-xs font-medium cursor-pointer appearance-none transition-colors ${showJavaWarning ? 'border-amber-500/50 text-amber-200' : 'border-border text-foreground'}`}
                             >
                                 <option value="Java 21">Java 21 (Recommended for 1.21+)</option>
                                 <option value="Java 17">Java 17 (Recommended for 1.17-1.20)</option>
                                 <option value="Java 11">Java 11</option>
                                 <option value="Java 8">Java 8 (Legacy)</option>
                                 <option value="Do Not Override">Do Not Override (Environment Default)</option>
                             </select>
                             {showJavaWarning && (
                                 <p className="text-[10px] text-amber-500/80 leading-tight">
                                     Warning: Minecraft {formData.version} usually requires {recommendedJava}.
                                 </p>
                             )}
                          </div>
                         )}

                         <div className="grid grid-cols-2 gap-3 mt-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Service Port</label>
                                 <div className="flex items-center bg-muted/40 border border-border rounded-lg overflow-hidden focus-within:border-primary/50 transition-all">
                                    <input 
                                        type="number"
                                        value={formData.port}
                                        onChange={e => setFormData({...formData, port: parseInt(e.target.value) || 0})}
                                        className="flex-1 min-w-0 bg-transparent px-3 py-1.5 text-xs text-foreground font-mono outline-none"
                                    />
                                    <div className="flex items-stretch border-l border-border h-8 bg-muted/20">
                                        <button 
                                            type="button"
                                            onClick={() => setFormData({...formData, port: Math.max(1, formData.port - 1)})}
                                            className="px-2 hover:bg-rose-500/10 text-muted-foreground/40 hover:text-rose-500 transition-colors border-r border-white/5"
                                        >
                                            <Minus size={12} strokeWidth={3} />
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setFormData({...formData, port: Math.min(65535, formData.port + 1)})}
                                            className="px-2 hover:bg-emerald-500/10 text-muted-foreground/40 hover:text-emerald-500 transition-colors"
                                        >
                                            <Plus size={12} strokeWidth={3} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Max Players</label>
                                 <div className="flex items-center bg-muted/40 border border-border rounded-lg overflow-hidden focus-within:border-primary/50 transition-all">
                                    <input 
                                        type="number"
                                        value={formData.maxPlayers}
                                        onChange={e => setFormData({...formData, maxPlayers: parseInt(e.target.value) || 0})}
                                        className="flex-1 min-w-0 bg-transparent px-3 py-1.5 text-xs text-foreground font-mono outline-none"
                                    />
                                    <div className="flex items-stretch border-l border-border h-8 bg-muted/20">
                                        <button 
                                            type="button"
                                            onClick={() => setFormData({...formData, maxPlayers: Math.max(1, formData.maxPlayers - 1)})}
                                            className="px-2 hover:bg-rose-500/10 text-muted-foreground/40 hover:text-rose-500 transition-colors border-r border-white/5"
                                        >
                                            <Minus size={12} strokeWidth={3} />
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setFormData({...formData, maxPlayers: Math.min(1000, formData.maxPlayers + 1)})}
                                            className="px-2 hover:bg-emerald-500/10 text-muted-foreground/40 hover:text-emerald-500 transition-colors"
                                        >
                                            <Plus size={12} strokeWidth={3} />
                                        </button>
                                    </div>
                                </div>
                            </div>
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
                                                className="w-full bg-muted/40 border border-border rounded-lg py-2 px-3 focus:border-primary/50 outline-none text-xs text-foreground font-medium font-mono"
                                                placeholder="Auto-generated"
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
                                                className="w-full bg-muted/40 border border-border rounded-lg py-2 px-3 focus:border-primary/50 outline-none text-xs text-foreground font-medium"
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
                        <div className="space-y-2 p-3 bg-input/50 border border-[rgb(var(--color-border-subtle))] rounded-lg">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex justify-between items-center">
                                    <span>Memory</span>
                                    <span className="text-primary font-mono text-xs">{formData.ram} GB</span>
                                </label>
                                 <input 
                                type="range" min="2" max="16" step="1"
                                value={formData.ram}
                                onChange={e => setFormData({...formData, ram: parseInt(e.target.value)})}
                                className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                            />
                                <div className="flex gap-2 text-[9px] text-muted-foreground/50 italic px-1">
                                <Info size={10} className="shrink-0" />
                                <span>Recommended: {capabilities.softwareCategory === 'BEDROCK' ? '1GB+' : (formData.software.match(/Forge|Modpack/) ? '4GB+' : '2GB+')}</span>
                            </div>
                        </div>

                        {/* Forge Modpack Upload - Visible for both Template and Manual Forge */}
                        {formData.software === 'Forge' && (
                                <div className="p-3 border border-dashed border-border rounded-xl bg-muted/20">
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
                        {formData.software === 'Modpack' && (
                            <div className="bg-card/40 border border-border p-1 rounded-lg">
                                <ModpackBrowser onSelect={(p, loader) => {
                                    setSelectedModpack(p);
                                    setFormData(prev => syncFormDataForModpack(p, loader, prev, bedrockVersions));
                                }} />
                            </div>
                        )}
                    </div>
                </div>
                </>
            )}

            
            {/* CPU Priority & Advanced Resource Config */}
            <div className="mt-3 space-y-1.5">
                <div className="bg-input/30 border border-[rgb(var(--color-border-subtle))] rounded-lg p-1 flex items-center justify-between gap-4">
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

    const renderVelocityDetails = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-4">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Proxy Name</label>
                    <input 
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        className="w-full bg-muted/40 border border-border rounded-lg py-2 px-3 focus:border-primary/50 outline-none text-xs text-foreground font-medium"
                        placeholder="Velocity-Bridge"
                    />
                </div>
                
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Velocity Version</label>
                    <select 
                        value={formData.version}
                        onChange={e => handleVersionChange(e.target.value)}
                        className="w-full bg-muted/40 border border-border rounded-lg py-2 px-3 outline-none text-xs text-foreground font-medium cursor-pointer appearance-none hover:bg-muted/60 transition-colors"
                    >
                        <option value="3.4.0-SNAPSHOT">3.4.0 (Latest)</option>
                        <option value="3.3.0-SNAPSHOT">3.3.0 (LTS)</option>
                        <option value="3.2.0-SNAPSHOT">3.2.0 (Legacy)</option>
                    </select>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Forwarding Mode</label>
                    <select 
                        value={formData.forwardingMode}
                        onChange={e => setFormData({...formData, forwardingMode: e.target.value as any})}
                        className="w-full bg-muted/40 border border-border rounded-lg py-2 px-3 outline-none text-xs text-foreground font-medium cursor-pointer appearance-none hover:bg-muted/60 transition-colors"
                    >
                        <option value="modern">Modern (Recommended)</option>
                        <option value="bungeeguard">BungeeGuard</option>
                        <option value="legacy">Legacy (IP Forwarding)</option>
                        <option value="none">None (Local Only)</option>
                    </select>
                    <p className="text-[10px] text-muted-foreground/60 leading-tight">
                        {formData.forwardingMode === 'modern' ? 'Uses a shared secret for high security. Recommended for most users.' : 
                         formData.forwardingMode === 'bungeeguard' ? 'Requires BungeeGuard plugin on backends.' :
                         formData.forwardingMode === 'legacy' ? 'Vulnerable to IP spoofing if firewalls are misconfigured.' : 'No player information is forwarded.'}
                    </p>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Proxy Secret</label>
                    <div className="relative">
                        <input 
                            value={formData.proxySecret}
                            onChange={e => setFormData({...formData, proxySecret: e.target.value})}
                            className="w-full bg-muted/40 border border-border rounded-lg py-2 px-3 focus:border-primary/50 outline-none text-xs text-foreground font-mono"
                            placeholder="Auto-generated"
                        />
                        <button 
                            type="button"
                            onClick={() => setFormData({...formData, proxySecret: Math.random().toString(36).substring(2, 15)+Math.random().toString(36).substring(2, 15)})}
                            className="absolute right-2 top-1.5 p-1 hover:bg-white/5 rounded text-primary transition-colors"
                        >
                            <Zap size={14} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <div className="space-y-2 p-3 bg-input/50 border border-[rgb(var(--color-border-subtle))] rounded-lg">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex justify-between items-center">
                        <span>Allocated Memory</span>
                        <span className="text-primary font-mono text-xs">{formData.ram} GB</span>
                    </label>
                    <input 
                        type="range" min="1" max="8" step="0.5"
                        value={formData.ram}
                        onChange={e => setFormData({...formData, ram: parseFloat(e.target.value)})}
                        className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex gap-2 text-[9px] text-muted-foreground/50 italic px-1">
                        <Info size={10} className="shrink-0" />
                        <span>Proxies require far less RAM than game servers. 1-2GB is usually sufficient for 500+ players.</span>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Public Proxy Port</label>
                    <div className="flex items-center bg-muted/40 border border-border rounded-lg overflow-hidden focus-within:border-primary/50 transition-all">
                        <input 
                            type="number"
                            value={formData.port}
                            onChange={e => setFormData({...formData, port: parseInt(e.target.value) || 0})}
                            className="flex-1 min-w-0 bg-transparent px-3 py-1.5 text-xs text-foreground font-mono outline-none"
                        />
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 border-dashed">
                    <div className="flex gap-3">
                        <MonitorPlay size={18} className="text-blue-400 shrink-0" />
                        <div>
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1">Network Awareness</h4>
                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                                Velocity acts as the entry point. Once created, go to the <strong>Proxy Network</strong> tab to link your backend servers (Lobby, Survival, etc.) to this proxy.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderReviewStep = () => (
        <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4"
        >
            <div className={`border border-border rounded-xl p-6 shadow-xl relative overflow-hidden transition-all duration-500 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card'}`}>
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                    <Terminal size={120} />
                </div>

                <div className="flex items-center gap-3 mb-6 relative z-10">
                    <div className="p-1.5 bg-primary/10 rounded-md border border-primary/20">
                        <Terminal size={14} className="text-primary" />
                    </div>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-foreground/70">Review & Deploy</h3>
                </div>

                <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-2 text-xs mb-5 relative z-10 font-mono">
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest">Instance</span>
                        <span className="font-bold text-foreground">{formData.name}</span>
                    </div>
                    <div className="h-px bg-border/40" />
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest">Software</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                                {formData.templateId ? 'Template: ' : ''}
                                {formData.usePurpur ? 'Purpur' : formData.software}
                            </span>
                            <span className="text-foreground font-bold">{formData.version}</span>
                        </div>
                    </div>
                    <div className="h-px bg-border/40" />
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest">Resources</span>
                        <span className="text-foreground font-bold">{formData.ram} GB RAM</span>
                    </div>
                     <div className="h-px bg-border/40" />
                     <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest">Network</span>
                        <span className="text-foreground font-bold">Port {formData.port}</span>
                    </div>
                </div>

                <div 
                    className="relative z-10 flex items-start gap-4 p-4 bg-muted/20 border border-border rounded-xl cursor-pointer hover:bg-muted/40 transition-all" 
                    onClick={() => setFormData({...formData, eula: !formData.eula})}
                >
                    <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-all ${formData.eula ? 'bg-emerald-500 border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-black border-border'}`}>
                        {formData.eula && <Check size={10} className="text-black" strokeWidth={4} />}
                    </div>
                    <div>
                        <div className="text-[11px] font-bold text-foreground mb-1 uppercase tracking-widest">Accept Legal Agreement</div>
                        <div className="text-[9px] text-muted-foreground leading-relaxed uppercase tracking-widest font-medium opacity-60">
                            I verify that I have read and agree to the {capabilities.softwareCategory === 'BEDROCK' ? 'Minecraft Bedrock' : 'Mojang'} EULA and Terms.
                        </div>
                    </div>
                </div>

                <button 
                    onClick={handleDeploy}
                    disabled={!formData.eula || isDeploying}
                    className="relative z-10 w-full mt-6 bg-primary text-primary-foreground h-12 rounded-xl font-bold text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:opacity-90 disabled:opacity-10 transition-all shadow-sm"
                >
                    {isDeploying ? (
                        <>
                            <Loader2 className="animate-spin" size={14} />
                            <span>Provisioning...</span>
                        </>
                    ) : ( 
                        <>
                            <Zap size={14} />
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
                                <h1 className="text-lg font-black tracking-tight text-foreground flex items-center gap-2 leading-none uppercase">
                                    Deploy Node
                                </h1>
                                <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mt-1.5 opacity-60">
                                    {mode === 'wizard' ? 'Guided Deployment' : mode === 'pro' ? 'Manual Provisioning Protocol' : 'Network Bridge Setup'}
                                </p>
                        </div>
                    </div>
                    
                    <div className="flex bg-muted/40 border border-border p-1 rounded-xl">
                        <button 
                            onClick={() => { 
                                setCategory('GAME'); 
                                setMode('wizard'); 
                                setStep('software'); 
                                if (formData.software === 'Velocity') {
                                    setFormData(prev => synthesizeDefaultState('Paper', prev, bedrockVersions));
                                }
                            }}
                            className={`px-5 py-1.5 rounded-lg text-[9px] font-black tracking-widest transition-all ${category === 'GAME' && mode === 'wizard' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            WIZARD
                        </button>
                        <button 
                            onClick={() => { 
                                setCategory('GAME'); 
                                setMode('pro'); 
                                setStep('software'); 
                                if (formData.software === 'Velocity') {
                                    setFormData(prev => synthesizeDefaultState('Paper', prev, bedrockVersions));
                                }
                            }}
                            className={`px-5 py-1.5 rounded-lg text-[9px] font-black tracking-widest transition-all ${category === 'GAME' && mode === 'pro' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            PRO CONFIG
                        </button>
                        <button 
                            onClick={() => { 
                                setCategory('GAME'); 
                                setMode('proxy'); 
                                setStep('details'); 
                                setFormData(p => ({ 
                                    ...p, 
                                    software: 'Velocity', 
                                    version: '3.4.0-SNAPSHOT', 
                                    ram: 1,
                                    port: 25565,
                                    name: 'Velocity-Bridge'
                                })); 
                            }}
                            className={`px-5 py-1.5 rounded-lg text-[9px] font-black tracking-widest transition-all ${mode === 'proxy' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            VELOCITY
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
                                nodes={availableNodes}
                                renderDetailsStep={renderDetailsStep}
                                renderReviewStep={renderReviewStep}
                                softwareOptions={softwareOptions}
                                capabilities={capabilities}
                                bedrockVersions={bedrockVersions}
                            />
                        ) : mode === 'pro' ? (
                            <ProConfig 
                                formData={formData}
                                setFormData={setFormData}
                                handleDeploy={handleDeploy}
                                isDeploying={isDeploying}
                                nodes={availableNodes}
                                softwareOptions={softwareOptions}
                                renderSoftwareStep={renderSoftwareStep}
                                renderDetailsStep={renderDetailsStep}
                                renderReviewStep={renderReviewStep}
                                capabilities={capabilities}
                                bedrockVersions={bedrockVersions}
                            />
                        ) : ( // This will be for 'proxy' mode
                            <WizardMode 
                                formData={formData}
                                setFormData={setFormData}
                                step={step}
                                setStep={setStep}
                                templates={templates}
                                nodes={availableNodes}
                                renderDetailsStep={renderDetailsStep}
                                renderReviewStep={renderReviewStep}
                                softwareOptions={softwareOptions}
                                capabilities={capabilities}
                                bedrockVersions={bedrockVersions}
                            />
                        )}
                     </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

export default CreateServer;
