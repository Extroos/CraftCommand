import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Server, Globe, X, RotateCcw, ShieldAlert, Check, Gamepad2, ChevronDown, ScrollText, Swords, Feather, Ghost, AlertTriangle, Image, Upload, Clock, Shield, MonitorPlay, AlertCircle } from 'lucide-react';
import { STAGGER_ITEM } from '../../../styles/motion';
import { SettingsInputField as InputField } from './SettingsInputField';
import { useTranslation } from 'react-i18next';

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
    const { t } = useTranslation();
    
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
                                <h3 className="text-xs font-bold text-foreground/90">{t('settings.general.velocity')}</h3>
                                <p className="text-[10px] text-muted-foreground font-medium opacity-70">{t('settings.general.proxy_desc')}</p>
                            </div>
                        </div>
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="space-y-1">
                                <p className="text-[11px] font-bold text-foreground/80">{t('settings.general.linked_to')} <span className="text-primary">{linkedProxy.name}</span></p>
                                <p className="text-[9px] text-muted-foreground/60 leading-tight">{t('settings.general.proxy_managed')}</p>
                            </div>
                            <button 
                                onClick={handleUnlink}
                                disabled={isUnlinking}
                                className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 px-4 py-1.5 rounded-md text-[10px] font-bold tracking-tight border border-rose-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                                {isUnlinking ? <RotateCcw size={12} className="animate-spin" /> : <X size={12} />}
                                {t('settings.general.unlink_proxy')}
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
                                <h3 className="text-xs font-bold text-foreground/90">{t('settings.general.proxy_config')}</h3>
                                <p className="text-[10px] text-muted-foreground font-medium opacity-70">{t('settings.general.network_settings')}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1 group/select">
                                <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground group-hover/select:text-foreground transition-colors">{t('settings.general.forwarding')}</label>
                                <div className="relative">
                                    <select 
                                        value={config.forwardingMode}
                                        onChange={(e) => handleChange('forwardingMode', e.target.value)}
                                        className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none transition-colors hover:border-primary/40"
                                    >
                                        <option value="modern">{t('settings.general.forwarding_modern')}</option>
                                        <option value="bungeeguard">{t('settings.general.forwarding_bungeeguard')}</option>
                                        <option value="legacy">{t('settings.general.forwarding_legacy')}</option>
                                        <option value="none">{t('settings.general.forwarding_none')}</option>
                                    </select>
                                    <div className="absolute right-2.5 top-2 pointer-events-none text-muted-foreground/50">
                                        <ChevronDown size={12} />
                                    </div>
                                </div>
                                <p className="text-[9px] text-muted-foreground/50 italic leading-tight mt-1">
                                    {config.forwardingMode === 'modern' ? t('settings.general.modern_desc') : 
                                     config.forwardingMode === 'bungeeguard' ? t('settings.general.bungeeguard_desc') :
                                     t('settings.general.legacy_desc')}
                                </p>
                            </div>

                            <div className="space-y-1.5 group">
                                <label className="text-[11px] font-bold text-muted-foreground/80 group-hover:text-foreground transition-colors flex justify-between items-center h-4 tracking-normal">
                                    {t('settings.general.forwarding_secret')}
                                </label>
                                <div className="relative flex items-center bg-background border border-border/60 rounded-md transition-all group-focus-within:ring-1 group-focus-within:ring-primary/20 group-hover:border-primary/40 focus-within:border-primary">
                                    <input 
                                        type="text"
                                        value={config.proxySecret}
                                        onChange={(e) => handleChange('proxySecret', e.target.value)}
                                        className="flex-1 min-w-0 bg-transparent px-2.5 py-1.5 text-[11px] outline-none font-mono text-primary/80 tabular-nums"
                                        placeholder={t('settings.general.auto_generated')}
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
                            <h3 className="text-xs font-bold text-foreground/90">{t('settings.general.node_config')}</h3>
                            <p className="text-[10px] text-muted-foreground font-medium opacity-70">{t('settings.general.core_instance')}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="md:col-span-2">
                            <InputField 
                                label={t('settings.general.server_name')}
                                propKey="serverName" 
                                placeholder="My Awesome Server" 
                                config={config} 
                                errors={errors} 
                                handleChange={handleChange} 
                            />
                        </div>
                        <div>
                            <InputField 
                                label={t('settings.general.interface_ip')}
                                propKey="ip" 
                                mono 
                                note={t('settings.general.bind_address')} 
                                config={config} 
                                errors={errors} 
                                handleChange={handleChange} 
                            />
                            {config.ip === '0.0.0.0' && currentServer?.software === 'Bedrock' && (
                                <motion.div 
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex gap-3"
                                >
                                    <ShieldAlert size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">{t('settings.general.wan_warning')}</p>
                                        <p className="text-[10px] text-amber-200/70 leading-relaxed font-medium">
                                            {t('settings.general.wan_warning_desc', { port: config.port })}
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
                                                 {t('settings.general.wan_confirm')}
                                             </span>
                                         </label>
                                     </div>
                                </motion.div>
                            )}
                        </div>
                        <div>
                            <InputField 
                                label={t('settings.general.service_port')}
                                propKey="port" 
                                type="number" 
                                mono 
                                config={config} 
                                errors={errors} 
                                handleChange={handleChange} 
                            />
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
                                <h3 className="text-xs font-bold text-foreground/90">{t('settings.general.gameplay')}</h3>
                                <p className="text-[10px] text-muted-foreground font-medium opacity-70">{t('settings.general.behavior_rules')}</p>
                            </div>
                        </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                        <div className="space-y-1 group/select">
                            <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground group-hover/select:text-foreground transition-colors">{t('settings.general.java_version')}</label>
                            <div className="relative">
                                <select 
                                    value={config.javaVersion}
                                    onChange={(e) => handleChange('javaVersion', e.target.value)}
                                    className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none transition-colors hover:border-primary/40"
                                >
                                    <option value="Do Not Override">{t('settings.general.do_not_override')}</option>
                                    <option value="Java 8">{t('settings.general.java_8')}</option>
                                    <option value="Java 11">{t('settings.general.java_11')}</option>
                                    <option value="Java 17">{t('settings.general.java_17')}</option>
                                    <option value="Java 21">{t('settings.general.java_21')}</option>
                                </select>
                                <div className="absolute right-2.5 top-2 pointer-events-none text-muted-foreground/50">
                                    <ChevronDown size={12} />
                                </div>
                            </div>
                            <p className="text-[9px] text-muted-foreground/50 italic leading-tight mt-1">{t('settings.general.java_version_desc')}</p>
                        </div>
                        <div className="space-y-1 group/select">
                            <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground group-hover/select:text-foreground transition-colors">{t('settings.general.gamemode')}</label>
                            <div className="relative">
                                <select 
                                    value={config.gamemode}
                                    onChange={(e) => handleChange('gamemode', e.target.value)}
                                    className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none transition-colors hover:border-primary/40"
                                >
                                    <option value="survival">{t('players.gamemode_survival')}</option>
                                    <option value="creative">{t('players.gamemode_creative')}</option>
                                    <option value="adventure">{t('players.gamemode_adventure')}</option>
                                    <option value="spectator">{t('players.gamemode_spectator')}</option>
                                </select>
                                <div className="absolute right-2.5 top-2 pointer-events-none text-muted-foreground/50">
                                    <ChevronDown size={12} />
                                </div>
                            </div>
                        </div>

                        {/* Difficulty */}
                        <div className="space-y-1 group/select">
                            <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground group-hover/select:text-foreground transition-colors">{t('settings.general.difficulty')}</label>
                            <div className="relative">
                                <select 
                                    value={config.difficulty}
                                    onChange={(e) => handleChange('difficulty', e.target.value)}
                                    className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none transition-colors hover:border-primary/40"
                                >
                                    <option value="peaceful">{t('settings.general.peaceful')}</option>
                                    <option value="easy">{t('settings.general.easy')}</option>
                                    <option value="normal">{t('settings.general.normal')}</option>
                                    <option value="hard">{t('settings.general.hard')}</option>
                                </select>
                                <div className="absolute right-2.5 top-2 pointer-events-none text-muted-foreground/50">
                                    <ChevronDown size={12} />
                                </div>
                            </div>
                        </div>

                        {/* Max Players */}
                        <div>
                            <InputField label={t('settings.general.max_players')} propKey="maxPlayers" type="number" config={config} errors={errors} handleChange={handleChange} />
                        </div>

                        <div className="space-y-1.5 font-sans">
                            <label className="text-[9px] uppercase tracking-[0.2em] font-bold text-muted-foreground flex justify-between">
                                {t('settings.general.view_distance')}
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
                            <label className="text-[9px] uppercase tracking-[0.2em] font-bold text-muted-foreground group-hover/motd:text-foreground transition-colors">{t('settings.general.motd')}</label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    value={config.motd}
                                    onChange={(e) => handleChange('motd', e.target.value)}
                                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono text-foreground placeholder:text-muted-foreground transition-colors hover:border-muted-foreground/50"
                                    placeholder={t('settings.general.motd_placeholder')}
                                />
                                <div className="absolute right-3 top-2.5 text-muted-foreground">
                                    <ScrollText size={12} />
                                </div>
                            </div>
                        </div>
                        
                        {/* Seed */}
                        <div className="md:col-span-2">
                            <InputField label={t('settings.general.level_seed')} propKey="levelSeed" placeholder={t('settings.general.seed_placeholder')} mono config={config} errors={errors} handleChange={handleChange} />
                        </div>
                            {capabilities.supportsJava && (
                                <div className="space-y-1 md:col-span-2">
                                    <InputField label={t('settings.general.jvm_flags')} propKey="jvmOptions" placeholder={t('settings.general.jvm_flags_placeholder')} note={t('settings.general.jvm_flags_desc')} config={config} errors={errors} handleChange={handleChange} />
                                </div>
                            )}

                        <div className="md:col-span-2 grid grid-cols-2 gap-3 pt-2">
                            {[
                                { label: t('settings.general.pvp'), key: 'pvp', icon: <Swords size={12} /> },
                                { label: t('settings.general.flight'), key: 'allowFlight', icon: <Feather size={12} /> },
                                { label: t('settings.general.monsters'), key: 'spawnMonsters', icon: <Ghost size={12} /> },
                                ...(capabilities.supportsJava ? [{ label: t('settings.general.hardcore'), key: 'hardcore', icon: <AlertTriangle size={12} /> }] : [])
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

                {/* Automation & Background Tasks */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className={`p-6 transition-all duration-300 bg-card rounded-md border border-border/40 shadow-sm`}
                >
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                        <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                            <RotateCcw size={14} className="text-primary/70" />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-foreground/90">{t('settings.general.automation')}</h3>
                            <p className="text-[10px] text-muted-foreground font-medium opacity-70">{t('settings.general.automation_desc')}</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {[
                            { label: t('settings.general.auto_start'), key: 'autoStart', icon: <Clock size={12} /> },
                            { label: t('settings.general.watchdog'), key: 'crashDetection', icon: <AlertTriangle size={12} /> },
                            { label: t('settings.general.player_sync'), key: 'includeInTotal', icon: <Shield size={12} /> },
                            { label: t('settings.general.public_status'), key: 'publicStatus', icon: <Globe size={12} /> },
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

            {/* Sidebar for General */}
            <div className="space-y-3 xl:col-span-1">
                {/* Advanced Node Settings */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className={`p-6 transition-all duration-300 bg-card rounded-md border border-border/40 shadow-sm`}
                >
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                        <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                            <Activity size={14} className="text-primary/70" />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-foreground/90">{t('settings.general.resources')}</h3>
                            <p className="text-[10px] text-muted-foreground font-medium opacity-70">{t('settings.general.resources_desc')}</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <InputField 
                            label={t('settings.general.ram_alloc')}
                            propKey="ram" 
                            type="number" 
                            config={config} 
                            errors={errors} 
                            handleChange={handleChange} 
                            note={t('settings.general.ram_alloc_desc')}
                        />

                        <div className="space-y-1 group/select">
                            <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground group-hover/select:text-foreground transition-colors">{t('settings.general.cpu_priority')}</label>
                            <div className="relative">
                                <select 
                                    value={config.cpuPriority}
                                    onChange={(e) => handleChange('cpuPriority', e.target.value)}
                                    className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none transition-colors hover:border-primary/40"
                                >
                                    <option value="normal">{t('settings.general.priority_normal')}</option>
                                    <option value="high">{t('settings.general.priority_high')}</option>
                                    <option value="realtime">{t('settings.general.priority_realtime')}</option>
                                </select>
                                <div className="absolute right-2.5 top-2 pointer-events-none text-muted-foreground/50">
                                    <ChevronDown size={12} />
                                </div>
                            </div>
                            <p className="text-[9px] text-muted-foreground/50 italic leading-tight mt-1">{t('settings.general.cpu_priority_desc')}</p>
                        </div>

                        <div className="space-y-1 group/select">
                            <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground group-hover/select:text-foreground transition-colors">{t('settings.general.execution_engine')}</label>
                            <div className="relative">
                                <select 
                                    value={config.executionEngine}
                                    onChange={(e) => handleChange('executionEngine', e.target.value)}
                                    className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none transition-colors hover:border-primary/40"
                                >
                                    <option value="native">{t('settings.general.engine_native')}</option>
                                    <option value="docker">{t('settings.general.engine_docker')}</option>
                                    <option value="remote">{t('settings.general.engine_remote')}</option>
                                </select>
                                <div className="absolute right-2.5 top-2 pointer-events-none text-muted-foreground/50">
                                    <ChevronDown size={12} />
                                </div>
                            </div>
                        </div>

                        {config.executionEngine === 'docker' && (
                            <InputField 
                                label={t('settings.general.docker_image')}
                                propKey="dockerImage" 
                                placeholder={t('settings.general.image_placeholder')} 
                                config={config} 
                                errors={errors} 
                                handleChange={handleChange} 
                            />
                        )}
                    </div>
                </motion.div>

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
                            <h3 className="text-xs font-bold text-foreground/90">{t('settings.general.appearance')}</h3>
                            <p className="text-[10px] text-muted-foreground font-medium opacity-70">{t('settings.general.appearance_desc')}</p>
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-4">
                        <div className="relative group/icon">
                            <div className={`w-24 h-24 rounded-2xl border border-border/80 flex items-center justify-center overflow-hidden bg-muted/20 transition-all ${isUploadingIcon ? 'opacity-50' : 'group-hover/icon:border-primary/50'}`}>
                                <img src={currentServer?.iconUrl || '/website-icon.png'} alt={t('settings.general.appearance')} className="w-full h-full object-cover" />
                                
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
                            <p className="text-[8px] text-muted-foreground/40 mt-0.5">{t('settings.general.recommended_icon')}</p>
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
            </div>
        </div>
    );
};
