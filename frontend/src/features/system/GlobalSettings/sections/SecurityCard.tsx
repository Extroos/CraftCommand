import React from 'react';
import { Shield, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { STAGGER_ITEM } from '../../../../styles/motion';
import { GlobalSettings, UserProfile } from '@shared/types';

interface SecurityCardProps {
    settings: GlobalSettings;
    setSettings: (settings: GlobalSettings) => void;
    user: UserProfile | null;
}

export const SecurityCard: React.FC<SecurityCardProps> = ({ settings, setSettings, user }) => {
    return (
        <motion.div 
            variants={STAGGER_ITEM}
            className="border border-border p-5 bg-card rounded transition-all duration-300"
        >
                <div className="flex items-center gap-3 mb-4">
                <div className="text-foreground">
                    <Shield size={18} />
                </div>
                <div>
                    <h3 className="text-sm font-bold tracking-tight text-foreground">Security & 2FA</h3>
                    <p className="text-[10px] font-medium text-muted-foreground">Global security policies and authentication hardening.</p>
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex flex-col justify-between p-3 bg-secondary/30 rounded-lg border border-border/50 gap-2">
                    <div className="flex justify-between items-start gap-4">
                    <div>
                        <div className="font-bold text-[11px] flex items-center gap-2">
                            Enforce Admin 2FA
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-0.5 font-medium leading-tight max-w-[280px]">
                            Require all Administrators and Owners to have Two-Factor Authentication enabled to access the panel.
                        </p>
                    </div>
                        <button
                            onClick={() => {
                                setSettings({
                                    ...settings,
                                    app: { 
                                        ...settings.app, 
                                        security: { 
                                            ...settings.app.security,
                                            forceAdmin2FA: !settings.app.security?.forceAdmin2FA 
                                        } 
                                    }
                                });
                            }}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                                settings.app.security?.forceAdmin2FA ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-zinc-300 dark:bg-zinc-700'
                            }`}
                        >
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition duration-200 ${
                                settings.app.security?.forceAdmin2FA ? 'translate-x-4' : 'translate-x-0'
                            }`}
                        />
                        </button>
                    </div>
                </div>

                {settings.app.security?.forceAdmin2FA && (
                    <div className="flex gap-2 p-2 bg-rose-500/10 border border-rose-500/20 text-rose-600 rounded-md text-[10px] items-center">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                        <p>
                            <strong>Policy Active:</strong> Admins without 2FA will be blocked from management actions immediately after saving.
                        </p>
                    </div>
                )}
            </div>
        </motion.div>
    );
};
