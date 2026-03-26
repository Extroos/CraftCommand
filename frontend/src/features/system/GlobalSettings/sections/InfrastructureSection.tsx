import React from 'react';
import { Shield, Monitor, Database, Layers, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { STAGGER_ITEM } from '../../../../styles/motion';
import { GlobalSettings, UserProfile } from '@shared/types';
import { useToast } from '../../../ui/Toast';

interface InfrastructureSectionProps {
    settings: GlobalSettings;
    setSettings: (settings: GlobalSettings) => void;
    user: UserProfile | null;
    systemStatus: { protocol: string, sslStatus: string, localIP?: string } | null;
    setActiveTab: (tab: any) => void;
}

export const InfrastructureSection: React.FC<InfrastructureSectionProps> = ({ 
    settings, 
    setSettings, 
    user, 
    systemStatus,
    setActiveTab
}) => {
    const { addToast } = useToast();

    return (
        <>
            {/* Network Security Card */}
            <motion.div 
                variants={STAGGER_ITEM}
                className="border border-border p-5 bg-card rounded transition-all duration-300"
            >
                    <div className="flex items-center gap-3 mb-4">
                    <div className="text-foreground">
                        <Shield size={18} />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold tracking-tight text-foreground">Network Security</h3>
                        <p className="text-[10px] font-medium text-muted-foreground">Configure secure access protocols (HTTPS).</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex flex-col justify-between p-3 bg-secondary/30 rounded-lg border border-border/50 gap-2">
                        <div className="flex justify-between items-start gap-4">
                        <div>
                            <div className="font-medium flex items-center gap-2">
                                Built-in HTTPS
                                {settings.app.https?.enabled && <Shield size={14} className="text-emerald-500" />}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Enable direct HTTPS support. Requires valid SSL Certificate and Key files.
                            </p>
                        </div>
                            <button
                                onClick={() => {
                                    setSettings({
                                        ...settings,
                                        app: {
                                            ...settings.app,
                                            https: {
                                                ...settings.app.https,
                                                enabled: !settings.app.https?.enabled,
                                                keyPath: settings.app.https?.keyPath || '',
                                                certPath: settings.app.https?.certPath || ''
                                            } as any
                                        }
                                    });
                                }}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                                    settings.app.https?.enabled ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-zinc-300 dark:bg-zinc-700'
                                }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition duration-200 ${
                                        settings.app.https?.enabled ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>
                    </div>

                    {settings.app.https?.enabled && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground/70">Certificate Path (.pem/.crt)</label>
                                <input 
                                    type="text" 
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    placeholder="/path/to/cert.pem"
                                    value={settings.app.https?.certPath || ''}
                                    onChange={(e) => setSettings({
                                        ...settings,
                                        app: {
                                            ...settings.app,
                                            https: { ...settings.app.https!, certPath: e.target.value }
                                        }
                                    })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground/70">Private Key Path (.key)</label>
                                <input 
                                    type="text" 
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    placeholder="/path/to/key.pem"
                                    value={settings.app.https?.keyPath || ''}
                                    onChange={(e) => setSettings({
                                        ...settings,
                                        app: {
                                            ...settings.app,
                                            https: { ...settings.app.https!, keyPath: e.target.value }
                                        }
                                    })}
                                />
                            </div>
                            <div className="col-span-1 md:col-span-2 p-3 bg-secondary rounded-md border border-border text-muted-foreground text-[10px] items-center flex gap-2">
                                <Monitor size={16} className="shrink-0" />
                                <p>
                                    <strong>Note:</strong> Enabling HTTPS requires a system restart to bind the secure listener. Fallback to HTTP occurs on certificate errors.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Data Storage Card */}
            <motion.div 
                variants={STAGGER_ITEM}
                className="border border-border p-5 bg-card rounded transition-all duration-300"
            >
                    <div className="flex items-center gap-3 mb-4">
                    <div className="text-foreground">
                        <Database size={18} />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold tracking-tight text-foreground">Data Storage</h3>
                        <p className="text-[10px] font-medium text-muted-foreground">Configure how CraftCommand persists server data.</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4 p-3 bg-secondary/30 rounded border border-border/50">
                        <div>
                            <div className="font-bold text-[11px] flex items-center gap-2">
                                SQLite Storage Database
                                {settings.app.storageProvider === 'sqlite' && <Database size={12} className="text-emerald-500" />}
                            </div>
                            <p className="text-[9px] text-muted-foreground mt-0.5 font-medium leading-tight">
                                Enable SQLite for better data integrity and crash resilience. Disabling switches back to standard JSON files.
                            </p>
                        </div>
                            <button
                                onClick={() => {
                                    setSettings({
                                        ...settings,
                                        app: {
                                            ...settings.app,
                                            storageProvider: settings.app.storageProvider === 'sqlite' ? 'json' : 'sqlite'
                                        }
                                    });
                                }}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                                    settings.app.storageProvider === 'sqlite' ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-zinc-300 dark:bg-zinc-700'
                                }`}
                            >
                                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition duration-200 ${
                                        settings.app.storageProvider === 'sqlite' ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>
                        <div className="flex gap-2 p-2 bg-secondary rounded-md border border-border text-muted-foreground text-[10px] items-center">
                        <Monitor size={16} className="shrink-0 mt-0.5" />
                        <p>
                            <strong>Note:</strong> Switching providers requires a system restart. Data is automatically synchronized between JSON and SQLite to prevent data loss.
                        </p>
                    </div>
                </div>
            </motion.div>

            {/* Distributed Nodes Card */}
            <motion.div 
                variants={STAGGER_ITEM}
                className="border border-border p-5 bg-card rounded transition-all duration-300"
            >
                    <div className="flex items-center gap-3 mb-4">
                    <div className="text-foreground">
                        <Layers size={18} />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold tracking-tight text-foreground">Distributed Computing</h3>
                        <p className="text-[10px] font-medium text-muted-foreground">Expand your cluster by enrolling remote nodes.</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex flex-col justify-between p-3 bg-secondary/30 rounded-lg border border-border/50 gap-2">
                        <div className="flex justify-between items-start gap-4">
                        <div>
                            <div className="font-bold text-[11px] flex items-center gap-2">
                                Distributed Nodes Engine
                                {settings.app.distributedNodes?.enabled && <Check size={12} className="text-emerald-500" />}
                            </div>
                            <p className="text-[9px] text-muted-foreground mt-0.5 font-medium leading-tight max-w-[280px]">
                                Enable the distributed node manager to deploy and manage servers across multiple physical or virtual machines.
                            </p>
                        </div>
                        <button
                            onClick={() => {
                                const newValue = !settings.app.distributedNodes?.enabled;
                                setSettings({
                                    ...settings,
                                    app: { 
                                        ...settings.app, 
                                        distributedNodes: { ...settings.app.distributedNodes, enabled: newValue } 
                                    }
                                });
                            }}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                                settings.app.distributedNodes?.enabled ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-zinc-300 dark:bg-zinc-700'
                            }`}
                        >
                                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition duration-200 ${
                                    settings.app.distributedNodes?.enabled ? 'translate-x-4' : 'translate-x-0'
                                }`}
                            />
                            </button>
                        </div>
                    </div>
                    
                    {settings.app.distributedNodes?.enabled && (
                        <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2">
                            <div className="flex flex-col justify-between p-3 bg-secondary/30 rounded-lg border border-border/50 gap-2">
                                <div className="flex justify-between items-start gap-4">
                                    <div>
                                        <div className="font-bold text-[11px]">Heartbeat Threshold (ms)</div>
                                        <p className="text-[9px] text-muted-foreground mt-0.5 font-medium leading-tight">
                                            How long to wait before marking an inactive node as OFFLINE. Default: 60000.
                                        </p>
                                    </div>
                                    <input 
                                        type="number" 
                                        className="w-24 h-8 rounded border border-input bg-background/50 px-2 text-[11px] focus:ring-1 focus:ring-zinc-500 outline-none"
                                        value={settings.app.distributedNodes?.nodeHeartbeatThresholdMs || 60000}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            app: { 
                                                ...settings.app, 
                                                distributedNodes: { 
                                                    ...settings.app.distributedNodes, 
                                                    nodeHeartbeatThresholdMs: parseInt(e.target.value) || 60000 
                                                } 
                                            }
                                        })}
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col justify-between p-3 bg-secondary/30 rounded-lg border border-border/50 gap-2">
                                <div className="flex justify-between items-start gap-4">
                                    <div>
                                        <div className="font-bold text-[11px]">Mirror Remote Backups</div>
                                        <p className="text-[9px] text-muted-foreground mt-0.5 font-medium leading-tight">
                                            Enable global mirroring of remote node backups to this Primary node for redundancy.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setSettings({
                                            ...settings,
                                            app: { 
                                                ...settings.app, 
                                                distributedNodes: { 
                                                    ...settings.app.distributedNodes, 
                                                    mirrorRemoteBackups: !settings.app.distributedNodes?.mirrorRemoteBackups 
                                                } 
                                            }
                                        })}
                                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                                            settings.app.distributedNodes?.mirrorRemoteBackups ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-zinc-300 dark:bg-zinc-700'
                                        }`}
                                    >
                                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition duration-200 ${
                                            settings.app.distributedNodes?.mirrorRemoteBackups ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                        />
                                    </button>
                                </div>
                            </div>

                            <button 
                                onClick={() => setActiveTab('NODES')}
                                className="w-full flex items-center justify-center gap-2 p-2 bg-emerald-500/10 text-emerald-600 rounded text-xs font-bold hover:bg-emerald-500/20 transition-colors border border-emerald-500/20"
                            >
                                <Layers size={14} /> Open Nodes Manager
                            </button>
                        </div>
                    )}
                </div>
            </motion.div>
        </>
    );
};
