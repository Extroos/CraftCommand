import React, { useState, useEffect } from 'react';
import { Settings2, Shield, Database, Activity, AlertTriangle, Layers, Zap, Clock, LifeBuoy, RefreshCcw, CheckCircle2, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { STAGGER_ITEM } from '../../../../styles/motion';
import { GlobalSettings, UserProfile } from '@shared/types';
import { useToast } from '../../../ui/Toast';
import { ServerLifecyclePolicy } from '@shared/types';
import { API } from '@core/services/api';

interface OperationsCardProps {
    settings: GlobalSettings;
    setSettings: (settings: GlobalSettings) => void;
    user: UserProfile | null;
}

export const OperationsCard: React.FC<OperationsCardProps> = ({ settings, setSettings, user }) => {
    const { addToast } = useToast();
    const [pStatus, setPStatus] = useState<'OK' | 'PATH_DRIFT' | 'UNREGISTERED' | 'ERROR' | 'LOADING'>('LOADING');
    const [dockerChecking, setDockerChecking] = useState(false);

    useEffect(() => {
        if (settings.app.hostPersistenceEnabled) {
            checkPersistenceHealth();
        } else {
            setPStatus('UNREGISTERED');
        }
    }, [settings.app.hostPersistenceEnabled]);

    const checkPersistenceHealth = async () => {
        try {
            const { status } = await API.getPersistenceStatus();
            setPStatus(status);
        } catch (e) {
            setPStatus('ERROR');
        }
    };

    const toggleHostMode = () => {
        setSettings({
            ...settings,
            app: { ...settings.app, hostMode: !settings.app.hostMode }
        });
    };

    const handleReRegister = async () => {
        try {
            setPStatus('LOADING');
            const response = await fetch('/api/settings/persistence', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('cc_token')}`
                },
                body: JSON.stringify({ enabled: true })
            });
            
            if (response.ok) {
                addToast('success', 'Diagnostics', 'Environment persistence re-synchronized.');
                await checkPersistenceHealth();
            }
        } catch (e) {
            addToast('error', 'Diagnostics', 'Failed to repair environment link.');
            setPStatus('ERROR');
        }
    };

    const renderStatusBadge = () => {
        if (!settings.app.hostPersistenceEnabled) return null;

        const config = {
            OK: { color: 'text-emerald-500', icon: CheckCircle2, text: 'Agent: OK' },
            PATH_DRIFT: { color: 'text-amber-500', icon: AlertTriangle, text: 'Agent: Drift detected' },
            UNREGISTERED: { color: 'text-zinc-500', icon: XCircle, text: 'Agent: Missing' },
            ERROR: { color: 'text-rose-500', icon: AlertTriangle, text: 'Agent: Permission Error' },
            LOADING: { color: 'text-zinc-500', icon: RefreshCcw, text: 'Agent: Checking...' }
        }[pStatus];

        return (
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded bg-secondary border border-border text-[8px] font-black uppercase tracking-tighter ${config.color}`}>
                <config.icon size={10} className={pStatus === 'LOADING' ? 'animate-spin' : ''} />
                {config.text}
            </div>
        );
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
                    <h3 className="text-sm font-bold tracking-tight text-foreground">Instance Parameters</h3>
                    <p className="text-[10px] font-medium text-muted-foreground">Server and process settings for this host.</p>
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex flex-col justify-between p-3 bg-secondary/30 rounded-lg border border-border/50 gap-2">
                    <div className="flex justify-between items-start gap-4">
                    <div>
                        <div className="font-bold text-[11px] flex items-center gap-2">
                            Team Mode (Multi-User Auth) <Shield size={12} className="text-emerald-500" />
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-0.5 font-medium leading-tight max-w-[280px]">
                            Require login and enforce role-based permissions. Disabling puts the panel in single-user Personal Mode.
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
                            Docker Support <Database size={12} className="text-foreground" />
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-0.5 font-medium leading-tight max-w-[280px]">
                            Enable Docker/Podman as an execution engine for running Minecraft servers in containers.
                        </p>
                    </div>
                    <button
                        onClick={async () => {
                            if (user?.role !== 'OWNER') {
                                addToast('error', 'Permissions', 'Only the System Owner can toggle Docker support');
                                return;
                            }

                            // Pre-flight: When enabling, verify Docker daemon is reachable
                            if (!settings.app.dockerEnabled) {
                                setDockerChecking(true);
                                try {
                                    const res = await fetch('/api/system/docker/status', {
                                        headers: { 'Authorization': `Bearer ${localStorage.getItem('cc_token')}` }
                                    });
                                    const body = await res.json().catch(() => ({ online: false }));
                                    if (!body.online) {
                                        addToast('error', 'Docker', body.error || 'Docker daemon is not reachable. Install Docker and ensure it is running before enabling this setting.');
                                        setDockerChecking(false);
                                        return;
                                    }
                                    addToast('success', 'Docker', `Connected to Docker ${body.version || ''}`);
                                } catch {
                                    addToast('error', 'Docker', 'Could not connect to Docker. Make sure Docker Desktop or the Docker daemon is running.');
                                    setDockerChecking(false);
                                    return;
                                }
                                setDockerChecking(false);
                            }

                            setSettings({
                                ...settings,
                                app: { ...settings.app, dockerEnabled: !settings.app.dockerEnabled }
                            });
                        }}
                        disabled={dockerChecking}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                            dockerChecking ? 'opacity-50 animate-pulse cursor-wait' : ''
                        } ${
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
                            Detailed Dashboard Mode <Activity size={12} className="text-zinc-500" />
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-0.5 font-medium leading-tight max-w-[280px]">
                            Show expanded CPU, memory, and player metrics on dashboard cards.
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
                    <div className="flex gap-2 p-2 bg-rose-500/10 border border-rose-500/20 text-rose-600 rounded-md text-[10px] items-center">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                        <p>
                            <strong>Critical:</strong> Personal Mode bypasses session security. Use only on air-gapped or localhost-restricted environments.
                        </p>
                    </div>
                )}

                <div className="pt-4 mt-4 border-t border-border/40">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="text-foreground">
                            <Zap size={18} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold tracking-tight text-foreground">High Availability & Recovery</h3>
                            <p className="text-[10px] font-medium text-muted-foreground">Automated process persistence and environment diagnostics.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Default Recovery Protocol</label>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { id: ServerLifecyclePolicy.MANUAL, name: 'Passive', icon: Clock, desc: 'Manual control' },
                                    { id: ServerLifecyclePolicy.ADAPTIVE, name: 'Adaptive', icon: Zap, desc: 'Last known state' },
                                    { id: ServerLifecyclePolicy.RESILIENT, name: 'Sentinel', icon: LifeBuoy, desc: 'Watchdog enforcement' }
                                ].map((p) => (
                                    <button
                                        key={p.id}
                                        onClick={() => setSettings({
                                            ...settings,
                                            app: { ...settings.app, defaultLifecyclePolicy: p.id as any }
                                        })}
                                        className={`p-2.5 rounded-lg border flex flex-col items-center gap-1.5 transition-all text-center ${
                                            (settings.app.defaultLifecyclePolicy || ServerLifecyclePolicy.ADAPTIVE) === p.id 
                                                ? 'bg-foreground/5 border-foreground/30 shadow-sm' 
                                                : 'bg-secondary/30 border-border/50 hover:border-border text-muted-foreground grayscale opacity-70'
                                        }`}
                                    >
                                        <p.icon size={14} className={(settings.app.defaultLifecyclePolicy || ServerLifecyclePolicy.ADAPTIVE) === p.id ? 'text-foreground' : 'text-muted-foreground'} />
                                        <span className="text-[10px] font-bold leading-none">{p.name}</span>
                                        <span className="text-[8px] leading-tight font-medium opacity-60 px-1">{p.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Node Agent Persistence Button */}
                        <div className="p-3 bg-secondary/30 rounded-lg border border-border/50">
                            <div className="flex justify-between items-start gap-4">
                                <div>
                                    <div className="font-bold text-[11px] flex items-center gap-3">
                                        Host Registration (OS Startup)
                                        {renderStatusBadge()}
                                    </div>
                                    <p className="text-[9px] text-muted-foreground mt-0.5 font-medium leading-tight max-w-[280px]">
                                        Register as a system service (systemd/NSSM) to start CraftCommand on boot.
                                    </p>
                                    
                                    {pStatus === 'PATH_DRIFT' && (
                                        <button 
                                            onClick={handleReRegister}
                                            className="mt-2 flex items-center gap-1.5 text-[9px] font-black uppercase text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded hover:bg-amber-500/20 transition-all"
                                        >
                                            <RefreshCcw size={10} /> Re-link Environment
                                        </button>
                                    )}
                                </div>
                                <button
                                    onClick={() => setSettings({
                                        ...settings, 
                                        app: { ...settings.app, hostPersistenceEnabled: !settings.app.hostPersistenceEnabled }
                                    })}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                                        settings.app.hostPersistenceEnabled ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-zinc-300 dark:bg-zinc-700'
                                    }`}
                                >
                                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition duration-200 ${
                                        settings.app.hostPersistenceEnabled ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-4 mt-4 border-t border-border/40">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="text-foreground">
                            <Layers size={18} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold tracking-tight text-foreground">Execution Engine</h3>
                            <p className="text-[10px] font-medium text-muted-foreground">How new Minecraft servers are started and managed.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Process Controller</label>
                            <select
                                value={settings.app.defaultExecutionEngine || 'native'}
                                onChange={(e) => {
                                    setSettings({
                                        ...settings,
                                        app: { ...settings.app, defaultExecutionEngine: e.target.value as any }
                                    });
                                }}
                                className="w-full bg-secondary/50 border border-border/50 rounded p-2 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all font-mono"
                            >
                                <option value="native">Native (Local Process)</option>
                                <option value="remote" disabled={!settings.app.distributedNodes?.enabled}>Remote Agent</option>
                                <option value="docker" disabled={!settings.app.dockerEnabled}>Docker Container</option>
                            </select>
                        </div>

                        <div className="space-y-3 px-1">
                            <p className="text-[10px] text-muted-foreground leading-relaxed font-medium">
                                <strong>Native</strong> runs server processes directly on this machine. 
                                <strong>Remote Agent</strong> delegates to a background agent on another machine.
                                <strong>Docker</strong> runs each server in an isolated container.
                            </p>
                            
                            <div className="flex items-start gap-2 text-rose-500/90 font-bold text-[10px] bg-rose-500/5 border border-rose-500/10 p-2.5 rounded">
                                <AlertTriangle size={14} className="shrink-0 mt-0.5" /> 
                                <span>Changing the default engine only affects new servers. Existing servers keep their current engine until manually changed.</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
