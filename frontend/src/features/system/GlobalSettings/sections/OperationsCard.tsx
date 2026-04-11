import React from 'react';
import { Settings2, Shield, Database, Activity, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { STAGGER_ITEM } from '../../../../styles/motion';
import { GlobalSettings, UserProfile } from '@shared/types';
import { useToast } from '../../../ui/Toast';

interface OperationsCardProps {
    settings: GlobalSettings;
    setSettings: (settings: GlobalSettings) => void;
    user: UserProfile | null;
}

export const OperationsCard: React.FC<OperationsCardProps> = ({ settings, setSettings, user }) => {
    const { addToast } = useToast();

    const toggleHostMode = () => {
        setSettings({
            ...settings,
            app: {
                ...settings.app,
                hostMode: !settings.app.hostMode
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
                    <Settings2 size={18} />
                </div>
                <div>
                    <h3 className="text-sm font-bold tracking-tight text-foreground">Operational Mode</h3>
                    <p className="text-[10px] font-medium text-muted-foreground">Define how CraftCommand operates this instance.</p>
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex flex-col justify-between p-3 bg-secondary/30 rounded-lg border border-border/50 gap-2">
                    <div className="flex justify-between items-start gap-4">
                    <div>
                        <div className="font-bold text-[11px] flex items-center gap-2">
                            Host Mode <Shield size={12} className="text-emerald-500" />
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-0.5 font-medium leading-tight max-w-[280px]">
                            Enables Multi-User Authentication, Role-Based Access Control, and strict API security. Disabling this switches to "Personal Mode".
                        </p>
                    </div>
                    <button
                        onClick={toggleHostMode}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                            settings.app.hostMode ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-zinc-300 dark:bg-zinc-700'
                        }`}
                    >
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition duration-200 ${
                                settings.app.hostMode ? 'translate-x-4' : 'translate-x-0'
                            }`}
                        />
                        </button>
                    </div>
                </div>

                {/* Docker Support Toggle */}
                <div className="flex flex-col justify-between p-3 bg-secondary/30 rounded-lg border border-border/50 gap-2">
                    <div className="flex justify-between items-start gap-4">
                    <div>
                        <div className="font-bold text-[11px] flex items-center gap-2">
                            Docker Engine Support <Database size={12} className="text-foreground" />
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-0.5 font-medium leading-tight max-w-[280px]">
                            Enable experimental Docker container execution. Requires Docker Daemon to be running on the host machine.
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            if (user?.role !== 'OWNER') {
                                addToast('error', 'Permissions', 'Only the System Owner can toggle Docker support');
                                return;
                            }
                            setSettings({
                                ...settings,
                                app: { ...settings.app, dockerEnabled: !settings.app.dockerEnabled }
                            });
                        }}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                            settings.app.dockerEnabled ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-zinc-300 dark:bg-zinc-700'
                        }`}
                    >
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition duration-200 ${
                                settings.app.dockerEnabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                        />
                        </button>
                    </div>
                </div>
                
                {/* Professional Mode Toggle */}
                <div className="flex flex-col justify-between p-3 bg-secondary/30 rounded-lg border border-border/50 gap-2">
                    <div className="flex justify-between items-start gap-4">
                    <div>
                        <div className="font-bold text-[11px] flex items-center gap-2">
                            Professional Mode <Activity size={12} className="text-zinc-500" />
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-0.5 font-medium leading-tight max-w-[280px]">
                            Show live CPU, memory, TPS, and player counts on the server list.
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            setSettings({
                                ...settings,
                                app: { ...settings.app, professionalMode: !settings.app.professionalMode }
                            });
                        }}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                            settings.app.professionalMode ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-zinc-300 dark:bg-zinc-700'
                        }`}
                    >
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition duration-200 ${
                                settings.app.professionalMode ? 'translate-x-4' : 'translate-x-0'
                            }`}
                        />
                        </button>
                    </div>
                </div>

                {!settings.app.hostMode && (
                    <div className="flex gap-2 p-2 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-md text-[10px] items-center">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                        <p>
                            <strong>Warning:</strong> Disabling Host Mode reduces security. Ensure this instance is not publicly accessible.
                        </p>
                    </div>
                )}
            </div>
        </motion.div>
    );
};
