import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Server, Globe, X, RotateCcw, ShieldAlert, Check, Gamepad2, ChevronDown, ScrollText, Swords, Feather, Ghost, AlertTriangle, Image, Upload, Clock, Shield, MonitorPlay, AlertCircle } from 'lucide-react';
import { STAGGER_ITEM } from '../../../styles/motion';
import { SettingsInputField as InputField } from './SettingsInputField';

interface GeneralSettingsProps {
    config: any;
    errors: Record<string, string>;
    handleChange: (key: string, value: any) => void;
    linkedProxy: any;
    handleUnlink: () => void;
    isUnlinking: boolean;
    currentServer: any;
    globalSettings: any;
    wanConfirmed: boolean;
    setWanConfirmed: (val: boolean) => void;
    capabilities: any;
    isUploadingIcon: boolean;
    handleIconUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    iconInputRef: React.RefObject<HTMLInputElement>;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({
    config, errors, handleChange, linkedProxy, handleUnlink, isUnlinking,
    currentServer, globalSettings, wanConfirmed, setWanConfirmed,
    capabilities, isUploadingIcon, handleIconUpload, iconInputRef
}) => {
    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
            <div className="space-y-3 xl:col-span-2">
                {/* Velocity Link Info */}
                {linkedProxy && (
                    <motion.div 
                        variants={STAGGER_ITEM}
                        className={`p-6 transition-all duration-300 bg-card rounded-md border border-border/40 shadow-sm`}
                    >
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                            <div className="p-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 shadow-inner">
                                <Globe size={14} className="text-blue-500" />
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-foreground/90">Velocity Integration</h3>
                                <p className="text-[10px] text-muted-foreground font-medium opacity-70">Proxy Network Configuration</p>
                            </div>
                        </div>
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="space-y-1">
                                <p className="text-[11px] font-bold text-foreground/80">Linked to <span className="text-primary">{linkedProxy.name}</span></p>
                                <p className="text-[9px] text-muted-foreground/60 leading-tight">This server is currently managed by a Velocity proxy. Direct joins are disabled via <span className="text-primary/70 font-mono italic">online-mode=false</span>.</p>
                            </div>
                            <button 
                                onClick={handleUnlink}
                                disabled={isUnlinking}
                                className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 px-4 py-1.5 rounded-md text-[10px] font-bold tracking-tight border border-rose-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                                {isUnlinking ? <RotateCcw size={12} className="animate-spin" /> : <X size={12} />}
                                Unlink from Velocity
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* Proxy Specific Settings */}
                {currentServer?.software === 'Velocity' && (
                    <motion.div 
                        variants={STAGGER_ITEM}
                        className={`p-6 transition-all duration-300 bg-card rounded-md border border-border/40 shadow-sm`}
                    >
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                            <div className="p-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 shadow-inner group-hover:bg-blue-500/20 transition-colors">
                                <MonitorPlay size={14} className="text-blue-500" />
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-foreground/90">Proxy Configuration</h3>
                                <p className="text-[10px] text-muted-foreground font-medium opacity-70">Forwarding & Security Protocol</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1 group/select">
                                <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground group-hover/select:text-foreground transition-colors">Forwarding Mode</label>
                                <div className="relative">
                                    <select 
                                        value={config.forwardingMode}
                                        onChange={(e) => handleChange('forwardingMode', e.target.value)}
                                        className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none transition-colors hover:border-primary/40"
                                    >
                                        <option value="modern">Modern (Recommended)</option>
                                        <option value="bungeeguard">BungeeGuard (Advanced)</option>
                                        <option value="legacy">Legacy (IP Forwarding)</option>
                                        <option value="none">None (Local Only)</option>
                                    </select>
                                    <div className="absolute right-2.5 top-2 pointer-events-none text-muted-foreground/50">
                                        <ChevronDown size={12} />
                                    </div>
                                </div>
                                <p className="text-[9px] text-muted-foreground/50 italic leading-tight mt-1">
                                    {config.forwardingMode === 'modern' ? 'High security via shared secret. Best for modern networks.' : 
                                     config.forwardingMode === 'bungeeguard' ? 'Requires separate plugin on backend servers.' :
                                     'Compatibility modes for older or specialized setups.'}
                                </p>
                            </div>

                            <div className="space-y-1.5 group">
                                <label className="text-[11px] font-bold text-muted-foreground/80 group-hover:text-foreground transition-colors flex justify-between items-center h-4 tracking-normal">
                                    Forwarding Secret
                                </label>
                                <div className="relative flex items-center bg-background border border-border/60 rounded-md transition-all group-focus-within:ring-1 group-focus-within:ring-primary/20 group-hover:border-primary/40 focus-within:border-primary">
                                    <input 
                                        type="text"
                                        value={config.proxySecret}
                                        onChange={(e) => handleChange('proxySecret', e.target.value)}
                                        className="flex-1 min-w-0 bg-transparent px-2.5 py-1.5 text-[11px] outline-none font-mono text-primary/80 tabular-nums"
                                        placeholder="Auto-generated if empty"
                                    />
                                    <button 
                                        onClick={() => handleChange('proxySecret', Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15))}
                                        className="p-1.5 hover:bg-white/5 rounded text-primary/60 hover:text-primary transition-colors border-l border-border/20"
                                    >
                                        <RotateCcw size={12} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* General Settings */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className={`p-6 transition-all duration-300 bg-card rounded-md border border-border/40 shadow-sm`}
                >
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                        <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                            <Server size={14} className="text-primary/70" />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-foreground/90">Core Instance</h3>
                            <p className="text-[10px] text-muted-foreground font-medium opacity-70">Identity & Network Mapping</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="md:col-span-2">
                            <InputField label="Server Name" propKey="serverName" placeholder="My Awesome Server" config={config} errors={errors} handleChange={handleChange} />
                        </div>
                        <div>
                            <InputField label="Interface IP" propKey="ip" mono note="Bind address (0.0.0.0 for global)" config={config} errors={errors} handleChange={handleChange} />
                            {config.ip === '0.0.0.0' && currentServer?.software === 'Bedrock' && (
                                <motion.div 
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex gap-3"
                                >
                                    <ShieldAlert size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">WAN Exposure Warning</p>
                                        <p className="text-[10px] text-amber-200/70 leading-relaxed font-medium">
                                            Binding to <span className="text-amber-400 font-mono">0.0.0.0</span> exposes this Bedrock server to the internet. 
                                            Ensure you have opened <span className="text-emerald-400 font-bold">UDP port {config.port}</span> in your router firewall. 
                                             TCP rules will not work for Bedrock.
                                         </p>
                                         <label className="flex items-center gap-2 cursor-pointer select-none group/confirm mt-2">
                                             <div 
                                                 onClick={() => setWanConfirmed(!wanConfirmed)}
                                                 className={`w-3.5 h-3.5 rounded border transition-all flex items-center justify-center ${
                                                     wanConfirmed 
                                                     ? 'bg-amber-500 border-amber-500 ' 
                                                     : 'border-amber-500/40 bg-amber-500/5 group-hover/confirm:border-amber-500/60'
                                                 }`}
                                             >
                                                 {wanConfirmed && <Check size={10} className="text-black" strokeWidth={4} />}
                                             </div>
                                             <span className="text-[9px] font-bold text-amber-500/80 group-hover/confirm:text-amber-500 transition-colors">
                                                 I confirm the UDP firewall rules are configured on my router
                                             </span>
                                         </label>
                                     </div>
                                </motion.div>
                            )}
                        </div>
                        <div>
                            <InputField label="Service Port" propKey="port" type="number" mono config={config} errors={errors} handleChange={handleChange} />
                        </div>
                    </div>
                </motion.div>


                {/* Game Mechanics - HIDDEN FOR VELOCITY */}
                {currentServer?.software !== 'Velocity' && (
                    <motion.div 
                        variants={STAGGER_ITEM}
                        className={`p-6 transition-all duration-300 bg-card rounded-md border border-border/40 shadow-sm`}
                    >

                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                            <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                                <Gamepad2 size={14} className="text-primary/70" />
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-foreground/90">Gameplay Environment</h3>
                                <p className="text-[10px] text-muted-foreground font-medium opacity-70">Runtime Behavioral rules</p>
                            </div>
                        </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                        <div className="space-y-1 group/select">
                            <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground group-hover/select:text-foreground transition-colors">Default Gamemode</label>
                            <div className="relative">
                                <select 
                                    value={config.gamemode}
                                    onChange={(e) => handleChange('gamemode', e.target.value)}
                                    className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none transition-colors hover:border-primary/40"
                                >
                                    <option value="survival">Survival</option>
                                    <option value="creative">Creative</option>
                                    <option value="adventure">Adventure</option>
                                    <option value="spectator">Spectator</option>
                                </select>
                                <div className="absolute right-2.5 top-2 pointer-events-none text-muted-foreground/50">
                                    <ChevronDown size={12} />
                                </div>
                            </div>
                        </div>

                        {/* Difficulty */}
                        <div className="space-y-1 group/select">
                            <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground group-hover/select:text-foreground transition-colors">Difficulty</label>
                            <div className="relative">
                                <select 
                                    value={config.difficulty}
                                    onChange={(e) => handleChange('difficulty', e.target.value)}
                                    className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none transition-colors hover:border-primary/40"
                                >
                                    <option value="peaceful">Peaceful</option>
                                    <option value="easy">Easy</option>
                                    <option value="normal">Normal</option>
                                    <option value="hard">Hard</option>
                                </select>
                                <div className="absolute right-2.5 top-2 pointer-events-none text-muted-foreground/50">
                                    <ChevronDown size={12} />
                                </div>
                            </div>
                        </div>

                        {/* Max Players */}
                        <div>
                            <InputField label="Max Players" propKey="maxPlayers" type="number" config={config} errors={errors} handleChange={handleChange} />
                        </div>

                        <div className="space-y-1.5 font-sans">
                            <label className="text-[9px] uppercase tracking-[0.2em] font-bold text-muted-foreground flex justify-between">
                                View Distance
                                {errors.viewDistance && <span className="text-rose-500 normal-case flex items-center gap-1"><AlertCircle size={10} /> {errors.viewDistance}</span>}
                            </label>
                            <div className="relative flex items-center gap-4 h-[34px] px-1">
                                <input 
                                    type="range" 
                                    min="2" max="32" 
                                    value={config.viewDistance}
                                    onChange={(e) => handleChange('viewDistance', parseInt(e.target.value))}
                                    className="flex-1 h-1 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:transition-colors"
                                />
                                <span className="font-mono text-xs w-6 text-right text-muted-foreground">{config.viewDistance}</span>
                            </div>
                        </div>

                        <div className="md:col-span-2 space-y-1.5 group/motd">
                            <label className="text-[9px] uppercase tracking-[0.2em] font-bold text-muted-foreground group-hover/motd:text-foreground transition-colors">MOTD</label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    value={config.motd}
                                    onChange={(e) => handleChange('motd', e.target.value)}
                                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono text-foreground placeholder:text-muted-foreground transition-colors hover:border-muted-foreground/50"
                                    placeholder="A Minecraft Server"
                                />
                                <div className="absolute right-3 top-2.5 text-muted-foreground">
                                    <ScrollText size={12} />
                                </div>
                            </div>
                        </div>
                        
                        {/* Seed */}
                        <div className="md:col-span-2">
                            <InputField label="Level Seed" propKey="levelSeed" placeholder="(Leave empty for random)" mono config={config} errors={errors} handleChange={handleChange} />
                        </div>
                            {capabilities.supportsJava && (
                                <div className="space-y-1 md:col-span-2">
                                    <InputField label="JVM Optimization Flags" propKey="jvmOptions" placeholder="-Xms1G -XX:+UseG1GC" note="Standard JVM arguments" config={config} errors={errors} handleChange={handleChange} />
                                </div>
                            )}

                        <div className="md:col-span-2 grid grid-cols-2 gap-3 pt-2">
                            {[
                                { label: 'PvP Enabled', key: 'pvp', icon: <Swords size={12} /> },
                                { label: 'Allow Flight', key: 'allowFlight', icon: <Feather size={12} /> },
                                { label: 'Spawn Monsters', key: 'spawnMonsters', icon: <Ghost size={12} /> },
                                ...(capabilities.supportsJava ? [{ label: 'Hardcore Mode', key: 'hardcore', icon: <AlertTriangle size={12} /> }] : [])
                            ].map((item) => (
                                <label key={item.key} className="group flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 cursor-pointer transition-all duration-200">
                                    <div className="flex items-center gap-3">
                                        <div className={`text-muted-foreground group-hover:text-primary transition-colors ${config[item.key as keyof typeof config] ? 'text-primary' : ''}`}>
                                            {item.icon}
                                        </div>
                                        <span className={`text-[9px] font-bold uppercase tracking-widest transition-colors ${config[item.key as keyof typeof config] ? 'text-foreground' : 'text-muted-foreground'}`}>{item.label}</span>
                                    </div>
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                        config[item.key as keyof typeof config] 
                                        ? 'bg-primary border-primary' 
                                        : 'bg-background border-border group-hover:border-muted-foreground/50'
                                    }`}>
                                        <input 
                                            type="checkbox" 
                                            checked={config[item.key as keyof typeof config] as boolean}
                                            onChange={(e) => handleChange(item.key, e.target.checked)}
                                            className="sr-only"
                                        />
                                        {config[item.key as keyof typeof config] && <Check size={10} className="text-primary-foreground" />}
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                </motion.div>
                )}

                {/* Proxy Dynamics - Special for Velocity */}
                {currentServer?.software === 'Velocity' && (
                    <motion.div 
                        variants={STAGGER_ITEM}
                        className={`p-6 transition-all duration-300 bg-card rounded-md border border-border/40 shadow-sm`}
                    >
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                            <div className="p-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 shadow-inner group-hover:bg-cyan-500/20 transition-colors">
                                <Activity size={14} className="text-cyan-500" />
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-foreground/90">Proxy Dynamics</h3>
                                <p className="text-[10px] text-muted-foreground font-medium opacity-70">Capacity & Identity Routing</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <InputField label="Max Slots" propKey="maxPlayers" type="number" config={config} errors={errors} handleChange={handleChange} note="Total concurrent connections allowed" />
                            
                            <div className="md:col-span-2 space-y-1.5 group/motd">
                                <label className="text-[9px] uppercase tracking-[0.2em] font-bold text-muted-foreground group-hover/motd:text-foreground transition-colors">Public MOTD</label>
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        value={config.motd}
                                        onChange={(e) => handleChange('motd', e.target.value)}
                                        className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono text-foreground placeholder:text-muted-foreground transition-colors hover:border-muted-foreground/50"
                                        placeholder="A Velocity Proxy"
                                    />
                                    <div className="absolute right-3 top-2.5 text-muted-foreground">
                                        <ScrollText size={12} />
                                    </div>
                                </div>
                            </div>

                            {capabilities.supportsJava && (
                                <div className="md:col-span-2">
                                    <InputField label="Tuning Flags" propKey="jvmOptions" placeholder="-Xms1G -XX:+UseG1GC" note="High-performance JVM arguments for proxy scaling" config={config} errors={errors} handleChange={handleChange} />
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </div>
            {/* Sidebar for General */}
            <div className="space-y-3 xl:col-span-1">
                {/* Server Appearance */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className={`p-6 transition-all duration-300 bg-card rounded-md border border-border/40 shadow-sm`}
                >
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                        <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                            <Image size={14} className="text-primary/70" />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-foreground/90">Appearance</h3>
                            <p className="text-[10px] text-muted-foreground font-medium opacity-70">Visual Identity</p>
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-4">
                        <div className="relative group/icon">
                            <div className={`w-24 h-24 rounded-2xl border border-border/80 flex items-center justify-center overflow-hidden bg-muted/20 transition-all ${isUploadingIcon ? 'opacity-50' : 'group-hover/icon:border-primary/50'}`}>
                                <img src={currentServer?.iconUrl || '/website-icon.png'} alt="Server Icon" className="w-full h-full object-cover" />
                                
                                {isUploadingIcon && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-background/40 ">
                                        <RotateCcw size={16} className="text-primary animate-spin" />
                                    </div>
                                )}
                            </div>
                            
                            <button 
                                onClick={() => iconInputRef.current?.click()}
                                disabled={isUploadingIcon}
                                className="absolute -bottom-2 -right-2 p-2 bg-primary text-primary-foreground rounded-xl shadow-lg hover:scale-110 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                            >
                                <Upload size={12} strokeWidth={3} />
                            </button>
                        </div>

                        <div className="text-center">
                            <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest">{capabilities.softwareCategory === 'BEDROCK' ? 'world_icon.png' : 'server-icon.png'}</p>
                            <p className="text-[8px] text-muted-foreground/40 mt-0.5">Recommended: 64x64 PNG</p>
                        </div>

                        <input 
                            type="file" 
                            ref={iconInputRef}
                            onChange={handleIconUpload}
                            accept="image/*"
                            className="hidden"
                        />
                    </div>
                </motion.div>

                {/* Automation & Toggles */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className={`p-6 transition-all duration-300 bg-card rounded-md border border-border/40 shadow-sm`}
                >

                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                        <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                            <RotateCcw size={14} className="text-primary/70" />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-foreground/90">Autonomous Ops</h3>
                            <p className="text-[10px] text-muted-foreground font-medium opacity-70">Background logic hooks</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {[
                            { label: 'Instance Auto-Boot', key: 'autoStart', icon: <Clock size={12} /> },
                            { label: 'Watchdog / Crash Rec.', key: 'crashDetection', icon: <AlertTriangle size={12} /> },
                            { label: 'Global Player Sync', key: 'includeInTotal', icon: <Shield size={12} /> },
                            { label: 'API Public Exposure', key: 'publicStatus', icon: <Globe size={12} /> },
                        ].map((item) => (
                            <label key={item.key} className="group flex items-center justify-between px-3 py-2 rounded-md border border-border/40 bg-muted/20 hover:bg-muted/40 cursor-pointer transition-all">
                                <div className="flex items-center gap-2.5">
                                    <div className="text-muted-foreground/60 group-hover:text-primary transition-colors">
                                        {item.icon}
                                    </div>
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/80 group-hover:text-foreground/80 transition-colors">{item.label}</span>
                                </div>
                                 <div className={`w-7 h-3.5 rounded-full border flex items-center p-0.5 transition-all ${
                                        config[item.key as keyof typeof config] 
                                        ? 'bg-primary border-primary justify-end' 
                                        : 'bg-muted border-border justify-start'
                                    }`}>
                                        <input 
                                            type="checkbox" 
                                            checked={config[item.key as keyof typeof config] as boolean}
                                            onChange={(e) => handleChange(item.key, e.target.checked)}
                                            className="sr-only"
                                        />
                                        <div className={`w-2 h-2 rounded-full transition-all ${config[item.key as keyof typeof config] ? 'bg-primary-foreground' : 'bg-muted-foreground'}`} />
                                    </div>
                            </label>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    );
};
