import React from 'react';
import { Monitor } from 'lucide-react';
import { motion } from 'framer-motion';
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
    
    const toggleAutoUpdate = () => {
        setSettings({
            ...settings,
            app: {
                ...settings.app,
                autoUpdate: !settings.app.autoUpdate
            }
        });
    };

    const toggleAutoHealing = () => {
        setSettings({
            ...settings,
            app: {
                ...settings.app,
                autoHealing: !settings.app.autoHealing
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
                            <div className="font-bold text-[11px]">Auto-Healing</div>
                            <p className="text-[9px] text-muted-foreground mt-0.5 font-medium leading-tight">
                                Detect and fix common server issues.
                            </p>
                        </div>
                        <button
                            onClick={toggleAutoHealing}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                                settings.app.autoHealing ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-zinc-300 dark:bg-zinc-700'
                            }`}
                        >
                            <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition duration-200 ${
                                    settings.app.autoHealing ? 'translate-x-4' : 'translate-x-0'
                                }`}
                            />
                        </button>
                    </div>
                </div>
                
                <div className="md:col-span-2 p-3 bg-secondary/30 rounded-lg border border-border/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="font-medium text-sm mb-2 md:mb-0">System Theme</div>
                    <div className="self-start md:self-auto overflow-x-auto w-full md:w-auto">
                        <ThemeToggle />
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
