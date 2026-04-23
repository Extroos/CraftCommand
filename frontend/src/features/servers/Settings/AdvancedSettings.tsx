import React from 'react';
import { motion } from 'framer-motion';
import { Folder, Lock, Cpu, ChevronDown, Terminal, Database, RotateCcw, Play, AlertCircle } from 'lucide-react';
import { STAGGER_ITEM } from '../../../styles/motion';
import { SettingsInputField as InputField } from './SettingsInputField';
import { useTranslation } from 'react-i18next';

interface AdvancedSettingsProps {
    config: any;
    setConfig: (val: any) => void;
    errors: Record<string, string>;
    handleChange: (key: string, value: any) => void;
    serverId: string;
    servers: any[];
    globalSettings: any;
    capabilities: any;
    user: any;
    dockerStatus: any;
    checkDocker: () => void;
    setIsDirty: (val: boolean) => void;
}
export const AdvancedSettings: React.FC<AdvancedSettingsProps> = ({
    config, setConfig, errors, handleChange, serverId, servers,
    globalSettings, capabilities, user, dockerStatus, checkDocker, setIsDirty
}) => {
    const { t } = useTranslation();
    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
            <div className="space-y-3 xl:col-span-2">
                {/* Paths & Environment */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className={`p-6 transition-all duration-300 bg-card rounded-md border border-border/40 shadow-sm`}
                >

                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                        <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                            <Folder size={14} className="text-primary/70" />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-foreground/90">{t('settings.advanced.path_registry')}</h3>
                            <p className="text-[10px] text-muted-foreground font-medium opacity-70">{t('settings.advanced.io_mapping')}</p>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{t('settings.general.working_dir')}</label>
                                <Lock size={10} className="text-muted-foreground/30" />
                            </div>
                            <div className="relative group/path">
                                <input 
                                    type="text" 
                                    readOnly
                                    value={config.workingDirectory}
                                    className="w-full bg-muted/20 border border-border/40 rounded-md px-2.5 py-1.5 text-[10px] font-mono text-muted-foreground/70 focus:outline-none cursor-not-allowed select-all"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <InputField label={t('settings.general.executable')} propKey="executable" mono note={t('settings.general.executable_desc')} config={config} errors={errors} handleChange={handleChange} />
                            <InputField label={t('settings.advanced.log_trace')} propKey="logLocation" mono config={config} errors={errors} handleChange={handleChange} />
                        </div>
                    </div>
                </motion.div>

                 {/* Java & Memory */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className={`p-6 transition-all duration-300 bg-card rounded-md border border-border/40 shadow-sm`}
                >

                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                        <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                            <Cpu size={14} className="text-primary/70" />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-foreground/90">{t('settings.advanced.runtime_engine')}</h3>
                            <p className="text-[10px] text-muted-foreground font-medium opacity-70">{t('settings.advanced.jvm_opt')}</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {capabilities.supportsJava && (
                                <div className="space-y-1 group/select">
                                    <label className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground group-hover/select:text-foreground">{t('settings.general.java_version')}</label>
                                    <div className="relative">
                                        <select 
                                            value={config.javaVersion}
                                            onChange={(e) => handleChange('javaVersion', e.target.value)}
                                            className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none transition-colors hover:border-primary/40"
                                        >
                                            <option value="Java 21">{t('settings.general.java_21')}</option>
                                            <option value="Java 17">{t('settings.general.java_17')}</option>
                                            <option value="Java 11">{t('settings.general.java_11')}</option>
                                            <option value="Java 8">{t('settings.general.java_8')}</option>
                                        </select>
                                        <div className="absolute right-2.5 top-2 pointer-events-none text-muted-foreground/50">
                                            <ChevronDown size={12} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {capabilities.supportsJava && (
                                <div className="space-y-1">
                                    <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">{t('settings.advanced.gc_engine')}</label>
                                    <div className="relative">
                                        <select 
                                            value={config.advancedFlags?.gcEngine || 'G1GC'}
                                            onChange={(e) => {
                                                handleChange('advancedFlags.gcEngine', e.target.value);
                                                setIsDirty(true);
                                            }}
                                            className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[11px] font-mono font-semibold text-primary/80 focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none transition-colors hover:border-primary/40"
                                        >
                                            <option value="G1GC">G1GC (Balanced)</option>
                                            <option value="ZGC">ZGC (Low Latency)</option>
                                            <option value="Shenandoah">Shenandoah (Ultra-Low)</option>
                                            <option value="Parallel">Parallel (High Throughput)</option>
                                        </select>
                                        <div className="absolute right-2.5 top-2 pointer-events-none text-muted-foreground/50">
                                            <ChevronDown size={12} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {!capabilities.supportsJava && (
                                <>
                                    <div className="space-y-1">
                                        <InputField label="Tick Distance" propKey="advancedFlags.tickDistance" type="number" note="4-12 recommendations" config={config} errors={errors} handleChange={handleChange} />
                                    </div>
                                    <div className="space-y-1">
                                        <InputField label="Compression Limit" propKey="advancedFlags.compressionLimit" type="number" note="Native packet threshold" config={config} errors={errors} handleChange={handleChange} />
                                    </div>
                                    <div className="flex items-center justify-between p-2 rounded-lg bg-orange-500/5 border border-orange-500/10">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-orange-400">Content Logging</span>
                                            <span className="text-[8px] text-muted-foreground">Log script/content errors to disk</span>
                                        </div>
                                        <button 
                                            onClick={() => handleChange('advancedFlags.contentLog', !config.advancedFlags?.contentLog)}
                                            className={`w-8 h-4 rounded-full transition-colors relative ${config.advancedFlags?.contentLog ? 'bg-orange-500' : 'bg-muted-foreground/30'}`}
                                        >
                                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${config.advancedFlags?.contentLog ? 'right-0.5' : 'left-0.5'}`} />
                                        </button>
                                    </div>
                                </>
                            )}

                            <div className="md:col-span-2 space-y-1">
                                <div className="flex justify-between items-center h-4">
                                    <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">{t('settings.advanced.ram_heap')}</label>
                                    <span className="text-[9px] font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">{config.ram}.0 GB</span>
                                </div>
                                <div className="relative flex items-center h-6">
                                    <input 
                                        type="range" 
                                        min="1" 
                                        max="64" 
                                        step="1"
                                        value={config.ram}
                                        onChange={(e) => handleChange('ram', parseInt(e.target.value))}
                                        className="w-full h-1 bg-muted/40 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-primary-foreground/30 [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1 group/cmd">
                            <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground group-hover/cmd:text-foreground">{t('settings.advanced.start_sequence')}</label>
                            <div className="relative">
                                <textarea 
                                    value={config.executionCommand}
                                    onChange={(e) => handleChange('executionCommand', e.target.value)}
                                    className="w-full h-20 bg-muted/10 border border-border/60 rounded-md px-2.5 py-2 text-[10px] font-mono text-primary/70 focus:outline-none focus:border-primary focus:bg-muted/5 transition-all resize-none leading-relaxed"
                                    placeholder={capabilities.supportsJava ? "java -Xmx4G -jar server.jar nogui" : (process.platform === 'win32' ? "bedrock_server.exe" : "./bedrock_server")}
                                />
                                <div className="absolute right-3 bottom-3 text-muted-foreground/30 pointer-events-none">
                                    <Terminal size={14} />
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Execution Engine */}
                {globalSettings?.app?.dockerEnabled && (
                    <motion.div 
                        variants={STAGGER_ITEM}
                        className={`p-6 transition-all duration-300 bg-card rounded-md border border-border/40 shadow-sm`}
                    >
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                            <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                                <Database size={14} className="text-primary/70" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-xs font-bold text-foreground/90">{t('settings.general.execution_engine')}</h3>
                                <p className="text-[10px] text-muted-foreground font-medium opacity-70">{t('settings.general.execution_engine_desc')}</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1 group/select">
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground group-hover/select:text-foreground">Execution Engine</label>
                                    {servers.find(s => s.id === serverId)?.status !== 'OFFLINE' && (
                                        <div className="flex items-center gap-1 text-[8px] font-black text-rose-500 uppercase">
                                            <Lock size={8} /> {t('settings.advanced.active_lock')}
                                        </div>
                                    )}
                                </div>
                                <div className="relative">
                                    <select 
                                        value={config.executionEngine}
                                        disabled={servers.find(s => s.id === serverId)?.status !== 'OFFLINE'}
                                        onChange={(e) => handleChange('executionEngine', e.target.value)}
                                        className={`w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none transition-colors hover:border-primary/40 ${
                                            servers.find(s => s.id === serverId)?.status !== 'OFFLINE' ? 'opacity-50 cursor-not-allowed bg-muted/20' : ''
                                        }`}
                                    >
                                        <option value="native">{t('settings.general.engine_native')}</option>
                                        <option value="docker">{t('settings.general.engine_docker')}</option>
                                    </select>
                                    <div className="absolute right-2.5 top-2 pointer-events-none text-muted-foreground/50">
                                        <ChevronDown size={12} />
                                    </div>
                                </div>
                                {servers.find(s => s.id === serverId)?.status !== 'OFFLINE' && (
                                    <p className="text-[7px] font-bold text-rose-400/60 uppercase tracking-tighter mt-1">{t('settings.advanced.stop_to_change')}</p>
                                )}
                            </div>

                                    {dockerStatus.online && (
                                        <div className="space-y-2 pt-3 border-t border-primary/10">
                                            <div className="flex justify-between items-center h-4">
                                                <div className="flex items-center gap-1.5">
                                                    <label className="text-[9px] uppercase tracking-wider font-bold text-primary/80">{t('settings.advanced.disk_thio')}</label>
                                                    <div className="group/io relative">
                                                        <Database size={8} className="text-primary/40" />
                                                        <div className="absolute hidden group-hover/io:block left-0 bottom-full mb-2 p-2 bg-popover border border-border rounded text-[8px] w-32 shadow-xl z-50">
                                                            {t('settings.advanced.io_limit_desc')}
                                                        </div>
                                                    </div>
                                                </div>
                                                <span className="text-[9px] font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">{config.ioLimit || 0} MB/s</span>
                                            </div>
                                            <div className="relative flex items-center h-6">
                                                <input 
                                                    type="range" 
                                                    min="0" 
                                                    max="500" 
                                                    step="10"
                                                    value={config.ioLimit || 0}
                                                    onChange={(e) => handleChange('ioLimit', parseInt(e.target.value))}
                                                    className="w-full h-1 bg-primary/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-primary-foreground/30 [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:transition-all"
                                                />
                                            </div>
                                            <p className="text-[7px] text-muted-foreground/60 uppercase font-bold text-center">{t('settings.advanced.unlimited')}</p>
                                        </div>
                                    )}
                                </div>
                        </motion.div>
                )}
            </div>
            
            <div className="space-y-3 xl:col-span-1">
                {/* Process Management */}
                <div className={`p-4 relative group transition-all duration-300 bg-card rounded-md border border-border/40 shadow-sm hover:border-primary/40`}>

                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                        <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                            <Play size={14} className="text-primary/70" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-xs font-bold text-foreground/90">{t('settings.advanced.lifecycle')}</h3>
                            <p className="text-[10px] text-muted-foreground font-medium opacity-70">{t('settings.advanced.lifecycle_desc')}</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <InputField label={t('settings.advanced.stop_cmd')} propKey="stopCommand" mono placeholder="stop" config={config} errors={errors} handleChange={handleChange} />

                        <div className="grid grid-cols-2 gap-3">
                            <InputField label={t('settings.advanced.boot_delay')} propKey="autostartDelay" type="number" suffix="ms" config={config} errors={errors} handleChange={handleChange} />
                            <InputField label={t('settings.advanced.sigterm_grace')} propKey="shutdownTimeout" type="number" suffix="s" config={config} errors={errors} handleChange={handleChange} />
                        </div>

                        <div className="p-3 rounded-md bg-primary/5 border border-primary/10">
                            <div className="flex justify-between items-center mb-1.5">
                                <div className="flex items-center gap-2">
                                     <div className={`w-2 h-2 rounded-full transition-all ${config.advancedFlags.automaticRepair ? 'bg-primary-foreground' : 'bg-muted-foreground'}`} />
                                </div>
                            </div>
                            
                            <div className="flex justify-between items-center py-2 border-y border-primary/10 mb-2">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-bold text-foreground/80 uppercase tracking-tighter">{t('settings.advanced.integrity_scan')}</span>
                                    <span className="text-[7px] text-muted-foreground uppercase opacity-60">{t('settings.advanced.integrity_desc')}</span>
                                </div>
                                <button 
                                    onClick={() => {
                                        const newFlags = { ...config.advancedFlags, deepIntegrity: !config.advancedFlags.deepIntegrity };
                                        setConfig({ ...config, advancedFlags: newFlags });
                                        setIsDirty(true);
                                    }}
                                    className={`w-8 h-4 rounded-full border flex items-center p-0.5 transition-all cursor-pointer ${
                                        config.advancedFlags.deepIntegrity
                                        ? 'bg-emerald-500 border-emerald-600 justify-end' 
                                        : 'bg-muted border-border justify-start'
                                    }`}
                                >
                                    <div className={`w-2 h-2 rounded-full transition-all ${config.advancedFlags.deepIntegrity ? 'bg-white' : 'bg-muted-foreground'}`} />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <InputField label="Check Int." propKey="advancedFlags.healthCheckInterval" type="number" suffix="s" config={config} errors={errors} handleChange={handleChange} />
                                <InputField label="Retry Pattern" propKey="advancedFlags.retryPattern" placeholder="10s, 30s..." config={config} errors={errors} handleChange={handleChange} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
