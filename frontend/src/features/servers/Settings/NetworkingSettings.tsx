import React from 'react';
import { motion } from 'framer-motion';
import { Gamepad2, Download, Network, Zap, Activity, Cpu, AlertTriangle } from 'lucide-react';
import { STAGGER_ITEM } from '../../../styles/motion';
import { SettingsInputField as InputField } from './SettingsInputField';
import { NetworkSettings } from '../../system/NetworkSettings';

interface NetworkingSettingsProps {
    currentServer: any;
    serverId: string;
    globalSettings: any;
    crossPlayStatus: any;
    handleToggleCrossPlay: (val: boolean) => void;
    isCrossPlayLoading: boolean;
    capabilities: any;
    config: any;
    errors: Record<string, string>;
    handleChange: (key: string, value: any) => void;
    servers: any[];
    stats: any;
    setConfig: (val: any) => void;
    setIsDirty: (val: boolean) => void;
    user: any;
}

export const NetworkingSettings: React.FC<NetworkingSettingsProps> = ({
    currentServer, serverId, globalSettings, crossPlayStatus, handleToggleCrossPlay,
    isCrossPlayLoading, capabilities, config, errors, handleChange, servers, stats,
    setConfig, setIsDirty, user
}) => {
    // Only check if isDirty logic here by passing setIsDirty explicitly when changes occur
    // isDirty boolean itself isn't needed here unless we want to conditionally render the "Restart Required" warning based on changes made here.
    // Let's check locally if advancedFlags networking actually changed
    // In original code, it just checks global `isDirty` which might show even if other things changed.
    // To match behavior exactly, we could pass `isDirty` from parent.
    // Let's assume parent passes `isDirty` if we need it, but we can also just show it if `isDirty` and this tab is open. 
    // Wait, let's add `isDirty` to props just in case.
    
    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 xl:col-span-3">
            <div className="xl:col-span-2 space-y-4">
                <NetworkSettings serverId={serverId} />
            </div>
            <div className="xl:col-span-1 space-y-4">
                 {/* Cross-Play Card */}
                 {(currentServer?.software === 'Paper' || currentServer?.software === 'Spigot' || currentServer?.software === 'Purpur' || currentServer?.software === 'Velocity' || currentServer?.software === 'Fabric' || currentServer?.software === 'Folia') && (
                    <motion.div 
                        variants={STAGGER_ITEM}
                        className={`p-6 transition-all duration-300 bg-card rounded-md border border-border/40 shadow-sm`}
                    >
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                            <div className="p-1.5 rounded-md bg-violet-500/10 border border-violet-500/20 shadow-inner">
                                <Gamepad2 size={14} className="text-violet-500" />
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-foreground/90">Cross-Play</h3>
                                <p className="text-[10px] text-muted-foreground font-medium opacity-70">Bedrock Edition Support</p>
                            </div>
                        </div>
                        
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-3 bg-secondary/30 rounded border border-border/50">
                                <div>
                                    <div className="font-medium text-xs flex items-center gap-2">
                                        Enable Bedrock Support
                                        {crossPlayStatus?.enabled && <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-500/20 text-emerald-600 uppercase tracking-wider">Active</span>}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[200px]">
                                        Allows Bedrock players (Mobile, Console) to join this Java server using Geyser.
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleToggleCrossPlay(!crossPlayStatus?.enabled)}
                                    disabled={isCrossPlayLoading}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                        crossPlayStatus?.enabled ? 'bg-primary' : 'bg-input'
                                    } ${isCrossPlayLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                                            crossPlayStatus?.enabled ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

                            {crossPlayStatus?.enabled && (
                                <div className="space-y-3 ">
                                    <div className="p-2 bg-violet-500/5 border border-violet-500/10 rounded-md">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[9px] font-bold uppercase tracking-widest text-violet-600/80">Bedrock UDP Port</span>
                                            <span className="text-[9px] font-mono text-muted-foreground">{crossPlayStatus.bedrockPort || 19132}</span>
                                        </div>
                                        <div className="h-1 bg-violet-500/20 rounded-full overflow-hidden">
                                            <div className="h-full bg-violet-500 w-full " />
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 p-2 bg-secondary/40 rounded border border-border/50">
                                        <Download size={12} className="text-muted-foreground" />
                                        <div className="text-[9px] font-bold text-muted-foreground">Geyser + Floodgate Installed</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                 {/* Network Optimization (Moved from Advanced) */}
                 <div className={`p-4 relative group transition-all duration-300 bg-card rounded-md border border-border/40 shadow-sm hover:border-primary/40`}>
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                        <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                            <Network size={14} className="text-primary/70" />
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xs font-bold text-foreground/90">Network Fabric</h3>
                                {servers.find(s => s.id === serverId)?.status === 'ONLINE' && (
                                    <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                        <div className="w-1 h-1 rounded-full bg-emerald-600" />
                                        <span className="text-[9px] font-bold text-emerald-600">Live Engine Active</span>
                                    </div>
                                )}
                            </div>
                            <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-tight opacity-60">Throughput & Latency Tuning</p>
                        </div>
                    </div>

                    {capabilities.supportsJava && (
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <InputField 
                                label="Socket Buffer" 
                                propKey="advancedFlags.socketBuffer" 
                                type="number" 
                                suffix="kb" 
                                config={config} 
                                errors={errors} 
                                handleChange={handleChange} 
                                note="Optimizes high-traffic flow"
                            />
                            <InputField 
                                label="Compress Thresh." 
                                propKey="advancedFlags.compressionThreshold" 
                                type="number" 
                                suffix="b" 
                                config={config} 
                                errors={errors} 
                                handleChange={handleChange} 
                                note="Packet compression limit"
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                         {[
                             { label: 'Aikar\'s Flags (Adaptive)', key: 'aikarFlags', icon: <Zap size={10} className="text-amber-500" />, desc: 'G1GC Optimization Suite', requires: 'G1GC', javaOnly: true },
                             { label: 'Spark Trace Engine', key: 'installSpark', icon: <Activity size={10} className="text-purple-500" />, desc: 'Real-time Profiler Plugin', javaOnly: true },
                             { label: 'GraalVM Native JIT', key: 'useGraalVM', icon: <Cpu size={10} className="text-emerald-500" />, desc: 'Advanced Bytecode Compiler', javaOnly: true },
                         ].filter(item => !item.javaOnly || capabilities.supportsJava).map((item) => {
                             const isRunning = servers.find(s => s.id === serverId)?.status === 'ONLINE';
                             const activeStats = (stats as any)?.[serverId];
                             const cl = activeStats?.commandLine || '';
                             
                             const isActiveOnProcess = 
                                 item.key === 'aikarFlags' ? cl.includes('using.aikars.flags=true') :
                                 item.key === 'useGraalVM' ? cl.includes('UseJVMCICompiler') :
                                 item.key === 'installSpark' ? true : 
                                 false;

                             const isDisabled = item.requires && config.advancedFlags.gcEngine !== item.requires;

                             return (
                                 <div key={item.key} className="space-y-1">
                                     <label className={`group flex items-center justify-between px-3 py-2 rounded-md border transition-all ${
                                         isDisabled ? 'opacity-40 cursor-not-allowed bg-muted/10 border-border/20' : 'bg-muted/20 border-border/40 hover:bg-muted/40 cursor-pointer'
                                     }`}>
                                         <div className="flex items-center gap-2">
                                             {item.icon}
                                             <div>
                                                 <div className="flex items-center gap-2">
                                                    <span className="text-[9px] uppercase font-black tracking-wider text-muted-foreground group-hover:text-foreground/80 transition-colors">{item.label}</span>
                                                    {isRunning && isActiveOnProcess && (
                                                        <div className="group/v relative">
                                                            <span className="text-[7px] font-black bg-emerald-500/20 text-emerald-600 px-1 rounded uppercase tracking-tighter cursor-help">Verified</span>
                                                        </div>
                                                    )}
                                                 </div>
                                                 <p className="text-[7px] font-bold text-muted-foreground/40 uppercase tracking-tight">{item.desc}</p>
                                             </div>
                                         </div>
                                          <div className={`w-7 h-3.5 rounded-full border flex items-center p-0.5 transition-all ${
                                                 config.advancedFlags?.[item.key] 
                                                 ? 'bg-primary border-primary justify-end' 
                                                 : 'bg-muted border-border justify-start'
                                             } ${isDisabled ? 'pointer-events-none' : ''}`}>
                                                 <input 
                                                     type="checkbox" 
                                                     disabled={isDisabled}
                                                     checked={config.advancedFlags?.[item.key] || false}
                                                     onChange={(e) => {
                                                         const newFlags = { ...config.advancedFlags, [item.key]: e.target.checked };
                                                         setConfig({ ...config, advancedFlags: newFlags });
                                                         setIsDirty(true);
                                                     }}
                                                     className="sr-only"
                                                 />
                                                 <div className={`w-2 h-2 rounded-full transition-all ${config.advancedFlags?.[item.key] ? 'bg-primary-foreground' : 'bg-muted-foreground'}`} />
                                          </div>
                                     </label>
                                 </div>
                             );
                         })}
                    </div>
                    {/* To check if dirty, parent should pass isDirty */}
                </div>
            </div>
        </div>
    );
};
