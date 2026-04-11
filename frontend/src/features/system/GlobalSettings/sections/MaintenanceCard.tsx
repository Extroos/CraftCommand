import React from 'react';
import { Monitor, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { STAGGER_ITEM } from '../../../../styles/motion';
import { GlobalSettings, UserProfile } from '@shared/types';
import { SystemUpdateCard } from '../../components/SystemUpdateCard';
import { ThemeToggle } from '../../../ui/ThemeToggle';

interface MaintenanceCardProps {
    settings: GlobalSettings;
    setSettings: (settings: GlobalSettings) => void;
    user: UserProfile | null;
}

export const MaintenanceCard: React.FC<MaintenanceCardProps> = ({ settings, setSettings, user }) => {
    const [showAdvanced, setShowAdvanced] = React.useState(false);
    
    const toggleAutoUpdate = () => {
        setSettings({
            ...settings,
            app: {
                ...settings.app,
                autoUpdate: !settings.app.autoUpdate
            }
        });
    };

    const toggleAutomaticRepair = () => {
        setSettings({
            ...settings,
            app: {
                ...settings.app,
                automaticRepair: !settings.app.automaticRepair
            }
        });
    };

    return (
        <motion.div 
            variants={STAGGER_ITEM}
            className="border border-border p-5 bg-card rounded transition-all duration-300"
        >
                <div className="flex items-center gap-3 mb-4">
                <div className="text-foreground">
                    <Monitor size={18} />
                </div>
                <div>
                    <h3 className="text-sm font-bold tracking-tight text-foreground">System Maintenance</h3>
                    <p className="text-[10px] font-medium text-muted-foreground">Automatic updates and health checks.</p>
                </div>
            </div>

            <div className="space-y-3">
                <div className="md:col-span-2 mb-2">
                    <SystemUpdateCard variant="embedded" />
                </div>

                <div className="flex flex-col justify-between p-3 bg-secondary/30 rounded-lg border border-border/50 gap-2">
                    <div className="flex justify-between items-start gap-4">
                    <div>
                        <div className="font-bold text-[11px]">Auto-Updates</div>
                        <p className="text-[9px] text-muted-foreground mt-0.5 font-medium leading-tight">
                            Automatically download and apply critical security patches and updates on startup.
                        </p>
                    </div>
                    <button
                        onClick={toggleAutoUpdate}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                            settings.app.autoUpdate ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-zinc-300 dark:bg-zinc-700'
                        }`}
                    >
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition duration-200 ${
                                settings.app.autoUpdate ? 'translate-x-4' : 'translate-x-0'
                            }`}
                        />
                        </button>
                    </div>
                </div>
                <div className="flex flex-col justify-between p-3 bg-secondary/30 rounded-lg border border-border/50 gap-2">
                    <div className="flex justify-between items-start gap-4">
                        <div>
                            <div className="font-bold text-[11px]">Automatic Repair</div>
                            <p className="text-[9px] text-muted-foreground mt-0.5 font-medium leading-tight">
                                Detect and fix common server issues.
                            </p>
                        </div>
                        <button
                            onClick={toggleAutomaticRepair}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                                settings.app.automaticRepair ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-zinc-300 dark:bg-zinc-700'
                            }`}
                        >
                            <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition duration-200 ${
                                    settings.app.automaticRepair ? 'translate-x-4' : 'translate-x-0'
                                }`}
                            />
                        </button>
                    </div>
                    
                    {settings.app.automaticRepair && (
                        <div className="mt-2 pt-2 border-t border-border/40">
                            <button 
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {showAdvanced ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                {showAdvanced ? 'Hide Advanced Settings' : 'Advanced Repair Configuration'}
                            </button>

                            <AnimatePresence>
                                {showAdvanced && (
                                    <motion.div 
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden space-y-3 pt-3"
                                    >
                                        {/* Drift Detection */}
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <div className="text-[10px] font-bold">Sentinal Drift Detection</div>
                                                <p className="text-[8px] text-muted-foreground leading-tight">Restart servers if state is ONLINE but process is missing.</p>
                                            </div>
                                            <button
                                                onClick={() => setSettings({
                                                    ...settings,
                                                    app: { 
                                                        ...settings.app, 
                                                        automaticRepairV3: { ...settings.app.automaticRepairV3, driftDetectionEnabled: !settings.app.automaticRepairV3?.driftDetectionEnabled } 
                                                    }
                                                })}
                                                className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                                                    settings.app.automaticRepairV3?.driftDetectionEnabled ? 'bg-emerald-500/50' : 'bg-zinc-700'
                                                }`}
                                            >
                                                <span className={`inline-block h-3 w-3 transform rounded-full bg-background transition duration-200 ${
                                                    settings.app.automaticRepairV3?.driftDetectionEnabled ? 'translate-x-3' : 'translate-x-0'
                                                }`} />
                                            </button>
                                        </div>

                                        {/* IO Throttling */}
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <div className="text-[10px] font-bold">IO Throttling Threshold (%)</div>
                                                <p className="text-[8px] text-muted-foreground leading-tight">Pause repair if Disk IO exceeds this threshold.</p>
                                            </div>
                                            <input 
                                                type="number"
                                                className="w-16 h-7 rounded border border-border bg-background/50 px-1.5 text-[10px] outline-none"
                                                value={settings.app.automaticRepairV3?.ioThrottlingThreshold || 80}
                                                onChange={(e) => setSettings({
                                                    ...settings,
                                                    app: {
                                                        ...settings.app,
                                                        automaticRepairV3: { ...settings.app.automaticRepairV3, ioThrottlingThreshold: parseInt(e.target.value) || 80 }
                                                    }
                                                })}
                                            />
                                        </div>

                                        {/* Snapshot Interval */}
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <div className="text-[10px] font-bold">Health Snapshot Interval (Min)</div>
                                                <p className="text-[8px] text-muted-foreground leading-tight">Frequency of deep system integrity scans.</p>
                                            </div>
                                            <input 
                                                type="number"
                                                className="w-16 h-7 rounded border border-border bg-background/50 px-1.5 text-[10px] outline-none"
                                                value={settings.app.automaticRepairV3?.healthSnapshotInterval || 5}
                                                onChange={(e) => setSettings({
                                                    ...settings,
                                                    app: {
                                                        ...settings.app,
                                                        automaticRepairV3: { ...settings.app.automaticRepairV3, healthSnapshotInterval: parseInt(e.target.value) || 5 }
                                                    }
                                                })}
                                            />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
                
                <div className="md:col-span-2 p-3 bg-secondary/30 rounded-lg border border-border/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="font-medium text-sm mb-2 md:mb-0">System Theme</div>
                    <div className="self-start md:self-auto overflow-x-auto w-full md:w-auto">
                        <ThemeToggle />
                    </div>
                </div>

                {/* System Update Guide */}
                <div className="md:col-span-2 p-4 bg-primary/5 rounded-lg border border-primary/20 space-y-3">
                    <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
                        <Settings size={14} />
                        Maintenance & Safety Guide
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <h4 className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                                <div className="w-1 h-1 bg-primary rounded-full" />
                                Autonomous Patching
                            </h4>
                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                                When toggled, the system silently prepares updates in the background. Apply them instantly via the launcher with zero manual file handling.
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <h4 className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                                <div className="w-1 h-1 bg-primary rounded-full" />
                                Zero-Impact Policy
                            </h4>
                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                                Updates use an <b>Atomic Delta Overlay</b>. Your <code className="bg-primary/10 px-1 rounded">data/</code>, <code className="bg-primary/10 px-1 rounded">servers/</code>, and <code className="bg-primary/10 px-1 rounded">.env</code> are strictly isolated and never modified.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
