import React, { useState, useEffect } from 'react';
import { GlobalSettings as GlobalSettingsType, SecurityConfig, DiscordConfig } from '@shared/types';
import { API } from '@core/services/api';
import { useToast } from '../ui/Toast';
import { Save, AlertTriangle, Monitor, Shield, Settings2, Database, Layers, Check, RefreshCw, Webhook, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { STAGGER_CONTAINER, STAGGER_ITEM, INTERACTION_VARIANTS } from '../../styles/motion';
import { useUser } from '@features/auth/context/UserContext';
import AuditLog from '../auth/AuditLog';
import { ThemeToggle } from '../ui/ThemeToggle';
import { RemoteAccessWizard } from '../ui/RemoteAccessWizard';
import { useSystem } from '@features/system/context/SystemContext';
import NodesManager from '@features/nodes/NodesManager';
import { SystemHealthMatrix } from './SelfHealingAudit';
import { usePermissions } from '@features/auth/hooks/usePermissions';
import { SystemUpdateCard } from './components/SystemUpdateCard';
import { WebhookHub } from './WebhookHub';
import { TokenManager } from './TokenManager';
import { Activity, Globe, Lock } from 'lucide-react';
import { useLock } from '../collaboration/hooks/useLock';

const GlobalSettingsView: React.FC = () => {
    const [settings, setSettings] = useState<GlobalSettingsType | null>(null);
    const [initialSettings, setInitialSettings] = useState<GlobalSettingsType | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showWizard, setShowWizard] = useState(false);
    const [systemStatus, setSystemStatus] = useState<{ protocol: string, sslStatus: string, localIP?: string } | null>(null);
    const { addToast } = useToast();
    const { user } = useUser();
    const { can } = usePermissions();
    const { refreshSettings } = useSystem();

    const { isLockedByOther, acquireLock, releaseLock, lock: activeLock } = useLock('system:global:settings', user?.id || '');

    useEffect(() => {
        loadSettings();
        fetchSystemStatus();
        acquireLock(); // Try to acquire lock on mount
        return () => releaseLock(); // Release on unmount
    }, []);

    const fetchSystemStatus = async () => {
        try {
            const data = await API.getSystemStatus();
            setSystemStatus(data);
        } catch (e) {
            console.warn('Failed to fetch system status:', e);
        }
    };

    const loadSettings = async () => {
        try {
            const data = await API.getGlobalSettings();
            setSettings(data);
            setInitialSettings(JSON.parse(JSON.stringify(data))); // Deep clone for comparison
        } catch (e) {
            addToast('error', 'Settings', 'Failed to load system settings');
        } finally {
            setIsLoading(false);
        }
    };

    const hasInfraChanges = () => {
        if (!settings || !initialSettings) return false;
        return (
            settings.app.dockerEnabled !== initialSettings.app.dockerEnabled ||
            settings.app.https?.enabled !== initialSettings.app.https?.enabled ||
            settings.app.storageProvider !== initialSettings.app.storageProvider
        );
    };

    const handleSave = async () => {
        if (!settings || isLockedByOther) return;
        if (!can('system.settings.manage')) {
            addToast('error', 'Permissions', 'Insufficient permissions to modify system settings');
            return;
        }
        const rebootRequired = hasInfraChanges();
        
        setIsSaving(true);
        try {
            await API.updateGlobalSettings(settings);
            
            if (rebootRequired) {
                addToast('success', 'System', 'Infrastructure updated. Refreshing application...');
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                addToast('success', 'Settings', 'System configuration updated');
                setInitialSettings(JSON.parse(JSON.stringify(settings)));
                await refreshSettings();
            }
        } catch (e) {
            addToast('error', 'Settings', 'Failed to save changes');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleHostMode = () => {
        if (!settings) return;
        setSettings({
            ...settings,
            app: {
                ...settings.app,
                hostMode: !settings.app.hostMode
            }
        });
    };

    const toggleAutoUpdate = () => {
        if (!settings) return;
        setSettings({
            ...settings,
            app: {
                ...settings.app,
                autoUpdate: !settings.app.autoUpdate
            }
        });
    };

    const toggleAutoHealing = () => {
        if (!settings) return;
        setSettings({
            ...settings,
            app: {
                ...settings.app,
                autoHealing: !settings.app.autoHealing
            }
        });
    };

    const toggleStorageProvider = () => {
        if (!settings) return;
        setSettings({
            ...settings,
            app: {
                ...settings.app,
                storageProvider: settings.app.storageProvider === 'sqlite' ? 'json' : 'sqlite'
            }
        });
    };

    const [activeTab, setActiveTab] = useState<'SETTINGS' | 'AUDIT' | 'NODES' | 'INTEGRATIONS' | 'HEALTH'>('SETTINGS');
    const [activeIntegrationTab, setActiveIntegrationTab] = useState<'BOT' | 'WEBHOOKS' | 'TOKENS'>('BOT');

    if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading System Configuration...</div>;
    if (!settings) return <div className="p-8 text-center text-rose-500">Failed to load configuration.</div>;

    const renderLockOverlay = () => {
        if (!isLockedByOther) return null;
        return (
            <div className="absolute inset-0 z-[100] bg-background/60 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mb-4">
                    <Lock size={32} />
                </div>
                <h3 className="text-xl font-bold mb-2">Resource Locked</h3>
                <p className="text-muted-foreground max-w-md">
                    <span className="font-bold text-foreground">{activeLock?.username}</span> is currently editing these settings. 
                    Changes are restricted to prevent data loss.
                </p>
            </div>
        );
    };

    const renderSettings = () => (
        <div className="relative">
            {renderLockOverlay()}
            <motion.div 
            variants={STAGGER_CONTAINER}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
                {/* Operation Mode Card */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className={`border border-border p-5 transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow rounded-2xl' : 'bg-card shadow-sm rounded-lg'}`}
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
                                    settings.app.hostMode ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'
                                }`}
                            >
                                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
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
                                    Docker Engine Support <Database size={12} className="text-blue-500" />
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
                                    settings.app.dockerEnabled ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'
                                }`}
                            >
                                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
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
                                    Professional Mode <Activity size={12} className="text-cyan-500" />
                                </div>
                                <p className="text-[9px] text-muted-foreground mt-0.5 font-medium leading-tight max-w-[280px]">
                                    
                                    Upgrades the Server Selection to an enterprise operations dashboard with live CPU, memory, TPS, player counts, and system health.
                                
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
                                    settings.app.professionalMode ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'
                                }`}
                            >
                                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
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

                {/* System Maintenance Card */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className={`border border-border p-5 transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow rounded-2xl' : 'bg-card shadow-sm rounded-lg'}`}
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
                        {/* Phase 5: System Update Card */}
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
                                    settings.app.autoUpdate ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'
                                }`}
                            >
                                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
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
                                        settings.app.autoHealing ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
                                            settings.app.autoHealing ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>
                        </div>

                        {/* 
                            Web Update UI removed per user request.
                            Updates are now handled exclusively by the launcher (run_CraftCommand.bat) on startup.
                        */}
                        
                        <div className="md:col-span-2 p-3 bg-secondary/30 rounded-lg border border-border/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="font-medium text-sm mb-2 md:mb-0">System Theme</div>
                            <div className="self-start md:self-auto overflow-x-auto w-full md:w-auto">
                                <ThemeToggle />
                            </div>
                        </div>
                    </div>
                </motion.div>



                {/* Remote Access Card (Phase R3) */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className={`border border-border p-5 transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow rounded-2xl' : 'bg-card shadow-sm rounded-lg'}`}
                >
                    <div className="flex items-center gap-3 mb-4">
                        <div className="text-foreground">
                            <Monitor size={18} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold tracking-tight text-foreground">Remote Access</h3>
                            <p className="text-[10px] font-medium text-muted-foreground">Share your server with friends outside your local network.</p>
                        </div>
                    </div>

                    {!settings.app.remoteAccess?.enabled ? (
                        <div className="space-y-3">
                            <div className="bg-secondary/30 rounded-lg p-3 border border-border/50">
                                <div className="flex items-start gap-4">
                                    <div className="p-1.5 bg-amber-500/10 rounded-md">
                                        <AlertTriangle size={16} className="text-amber-500" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-[11px] mb-1">Remote Access Not Configured</h4>
                                        <p className="text-[9px] font-medium text-muted-foreground mb-3 leading-tight">
                                            Your server is currently only accessible from this computer. To allow friends to join from anywhere, you need to set up remote access.
                                        </p>
                                        <button
                                            onClick={() => setShowWizard(true)}
                                            className="bg-indigo-600 text-white px-4 py-1.5 rounded-md text-[10px] font-bold hover:bg-indigo-500 inline-flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/10">
                                            <Shield size={12} />
                                            Configure Remote Access
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="bg-secondary rounded-lg p-3 border border-border/30">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Shield size={14} className="text-emerald-500" />
                                        <span className="font-bold text-[10px]">Safest: VPN</span>
                                    </div>
                                    <p className="text-[9px] font-medium text-muted-foreground leading-tight">Encrypted private connection via Tailscale/ZeroTier. No ports needed.</p>
                                </div>
                                <div className="bg-secondary rounded-lg p-3 border border-border/30">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Monitor size={14} className="text-blue-500" />
                                        <span className="font-bold text-[10px]">Easiest: Playit.gg</span>
                                    </div>
                                    <p className="text-[9px] font-medium text-muted-foreground leading-tight">One-click tunnel. Game + Web dashboard access.</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-3">
                                <div className="flex items-start gap-4">
                                    <Shield size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <h4 className="font-semibold text-emerald-600">Remote Access Active</h4>
                                            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-600 rounded text-xs font-medium uppercase">
                                                {settings.app.remoteAccess.method}
                                            </span>
                                        </div>
                                        {settings.app.remoteAccess.method === 'vpn' && (
                                            <div className="space-y-2">
                                                <p className="text-sm text-emerald-700"><strong>VPN Mode:</strong> Friends connect using your VPN IP.</p>
                                                <div className="bg-background rounded p-3">
                                                    <p className="text-xs text-muted-foreground mb-1">Share with friends:</p>
                                                    <code className="text-xs bg-secondary px-2 py-1 rounded">Your VPN IP (e.g., 192.168.x.x)</code>
                                                </div>
                                                <p className="text-xs text-emerald-600">✓ Game + Web access</p>
                                            </div>
                                        )}
                                        {settings.app.remoteAccess.method === 'proxy' && (
                                            <div className="space-y-2">
                                                <p className="text-sm text-emerald-700"><strong>Playit.gg Proxy:</strong> Server tunneled through Playit network.</p>
                                                <div className="bg-background rounded p-3">
                                                    <p className="text-xs text-muted-foreground mb-1">Find public link in:</p>
                                                    <ul className="text-xs space-y-1 ml-4 list-disc text-emerald-700">
                                                        <li>"CraftCommand Tunnel" window</li>
                                                        <li>Backend console</li>
                                                    </ul>
                                                </div>
                                                <p className="text-xs text-emerald-600">✓ Game + Web access</p>
                                            </div>
                                        )}
                                        {settings.app.remoteAccess.method === 'cloudflare' && (
                                            <div className="space-y-2">
                                                <p className="text-sm text-emerald-700"><strong>Cloudflare Quick Share:</strong> Fast dashboard link.</p>
                                                <div className="bg-background rounded p-3">
                                                    <p className="text-xs text-muted-foreground mb-1">Find link in:</p>
                                                    <ul className="text-xs space-y-1 ml-4 list-disc text-emerald-700">
                                                        <li>"Cloudflare Website Share" window</li>
                                                    </ul>
                                                </div>
                                                <p className="text-xs text-amber-600">⚠ Web only - Game needs VPN/Proxy</p>
                                            </div>
                                        )}
                                        {settings.app.remoteAccess.method === 'direct' && (
                                            <div className="space-y-2">
                                                <p className="text-sm text-emerald-700"><strong>Direct:</strong> Port forwarding via router.</p>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                    <div className="bg-background rounded p-3 border border-emerald-500/10">
                                                        <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">External IP</p>
                                                        <code className="text-xs text-foreground bg-secondary px-2 py-0.5 rounded">
                                                            {settings.app.remoteAccess.externalIP || 'Detecting...'}
                                                        </code>
                                                    </div>
                                                    <div className="bg-background rounded p-3 border border-emerald-500/10">
                                                        <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Local machine IP</p>
                                                        <code className="text-xs text-foreground bg-secondary px-2 py-0.5 rounded">
                                                            {systemStatus?.localIP || '127.0.0.1'}
                                                        </code>
                                                    </div>
                                                </div>
                                                <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded text-[10px] mt-2">
                                                    <strong>Port Forwarding Tip:</strong> In your router settings, forward internal port <strong>{window.location.port || '3001'}</strong> to IP <strong>{systemStatus?.localIP}</strong>.
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={async () => {
                                        try {
                                            await API.disableRemoteAccess();
                                            await loadSettings();
                                            addToast('success', 'Remote Access', 'Remote access disabled');
                                        } catch (e: any) {
                                            addToast('error', 'Remote Access', e.message);
                                        }
                                    }}
                                    className="bg-red-500/10 text-red-600 border border-red-500/30 px-4 py-2 rounded text-sm font-medium hover:bg-red-500/20"
                                >
                                    Disable
                                </button>
                                <button
                                    onClick={() => setShowWizard(true)}
                                    className="bg-secondary text-foreground px-4 py-2 rounded text-sm font-medium hover:bg-secondary/80"
                                >
                                    Change Configuration
                                </button>
                            </div>
                        </div>
                    )}
                </motion.div>

                {/* Network Security Card */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className={`border border-border p-5 transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow rounded-2xl' : 'bg-card shadow-sm rounded-lg'}`}
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
                                        settings.app.https?.enabled ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
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
                                <div className="col-span-1 md:col-span-2 p-3 bg-blue-500/10 border border-blue-500/20 text-blue-600 rounded-md text-[10px] items-center flex gap-2">
                                    <Monitor size={16} className="shrink-0" />
                                    <p>
                                        <strong>Note:</strong> Enabling HTTPS requires a system restart to bind the secure listener. Fallback to HTTP occurs on certificate errors.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Data Storage Card (Phase 4) */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className={`border border-border p-5 transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow rounded-2xl' : 'bg-card shadow-sm rounded-lg'}`}
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
                                    onClick={toggleStorageProvider}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                                        settings.app.storageProvider === 'sqlite' ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'
                                    }`}
                                >
                                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
                                            settings.app.storageProvider === 'sqlite' ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>
                         <div className="flex gap-2 p-2 bg-blue-500/10 border border-blue-500/20 text-blue-600 rounded-md text-[10px] items-center">
                            <Monitor size={16} className="shrink-0 mt-0.5" />
                            <p>
                                <strong>Note:</strong> Switching providers requires a restart. Data is auto-migrated from JSON to SQL, but NOT vice-versa.
                            </p>
                        </div>
                    </div>
                </motion.div>

                {/* Distributed Nodes Card */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className={`border border-border p-5 transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow rounded-2xl' : 'bg-card shadow-sm rounded-lg'}`}
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
                                            distributedNodes: { enabled: newValue } 
                                        }
                                    });
                                    if (!newValue && activeTab === 'NODES') {
                                        setActiveTab('SETTINGS');
                                    }
                                }}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                                    settings.app.distributedNodes?.enabled ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'
                                }`}
                            >
                                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
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
                                            className="w-24 h-8 rounded border border-input bg-background/50 px-2 text-[11px] focus:ring-1 focus:ring-primary outline-none"
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
                                                settings.app.distributedNodes?.mirrorRemoteBackups ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'
                                            }`}
                                        >
                                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
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
                
                {/* Security & 2FA Policy Card */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className={`border border-border p-5 transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow rounded-2xl' : 'bg-card shadow-sm rounded-lg'}`}
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
                                    settings.app.security?.forceAdmin2FA ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'
                                }`}
                            >
                                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
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
            </motion.div>
        </div>
    );

    const renderIntegrations = () => (
        <motion.div 
            variants={STAGGER_CONTAINER}
            initial="hidden"
            animate="show"
            className="space-y-6"
        >
            <div className="flex items-center gap-1.5 p-1 bg-secondary/30 rounded-lg border border-border/50 w-fit mb-6">
                {[
                    { id: 'BOT', label: 'Discord Bot', icon: <Webhook size={14} /> },
                    { id: 'WEBHOOKS', label: 'Webhook Hub', icon: <Globe size={14} /> },
                    { id: 'TOKENS', label: 'API Tokens', icon: <Zap size={14} /> }
                ].map((tab) => (
                    <button 
                        key={tab.id}
                        onClick={() => setActiveIntegrationTab(tab.id as any)}
                        className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                            activeIntegrationTab === tab.id 
                            ? 'bg-background text-primary shadow-sm border border-border/50' 
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={activeIntegrationTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                >
                    {activeIntegrationTab === 'BOT' && (
                        <div className={`border border-border p-8 transition-all duration-500 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow rounded-3xl specular-border' : 'bg-card shadow-sm rounded-lg'}`}>
                             <div className="flex items-start gap-4 mb-8">
                                <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-2xl shadow-inner border border-indigo-500/20" id="discord-bot-icon">
                                    <Webhook size={28} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black tracking-tight text-foreground">Global Discord Bot</h3>
                                    <p className="text-sm text-muted-foreground font-medium">The master orchestrator for cross-server synchronization.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Bot Gateway Token</label>
                                        <input 
                                            type="password"
                                            id="discord-bot-token"
                                            value={settings.discordBot?.token || ''}
                                            onChange={(e) => setSettings({
                                                ...settings,
                                                discordBot: { ...settings.discordBot!, token: e.target.value }
                                            })}
                                            placeholder="MTA..."
                                            className="w-full bg-black/20 border border-border/40 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono transition-all hover:border-primary/20"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Application Client ID</label>
                                        <input 
                                            type="text"
                                            id="discord-client-id"
                                            value={settings.discordBot?.clientId || ''}
                                            onChange={(e) => setSettings({
                                                ...settings,
                                                discordBot: { ...settings.discordBot!, clientId: e.target.value }
                                            })}
                                            placeholder="123456789..."
                                            className="w-full bg-black/20 border border-border/40 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all hover:border-primary/20"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Authorized Guild (Instant Sync)</label>
                                        <input 
                                            type="text"
                                            id="discord-guild-id"
                                            value={settings.discordBot?.guildId || ''}
                                            onChange={(e) => setSettings({
                                                ...settings,
                                                discordBot: { ...settings.discordBot!, guildId: e.target.value }
                                            })}
                                            placeholder="987654321..."
                                            className="w-full bg-black/20 border border-border/40 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all hover:border-primary/20"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">System Audit Channel</label>
                                        <input 
                                            type="text"
                                            id="discord-notification-channel"
                                            value={settings.discordBot?.notificationChannel || ''}
                                            onChange={(e) => setSettings({
                                                ...settings,
                                                discordBot: { ...settings.discordBot!, notificationChannel: e.target.value }
                                            })}
                                            placeholder="1122334455..."
                                            className="w-full bg-black/20 border border-border/40 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all hover:border-primary/20"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="mt-12 pt-8 border-t border-border/20 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                     <button 
                                        id="btn-reconnect-discord"
                                        onClick={async () => {
                                            try {
                                                await API.reconnectDiscord();
                                                addToast('success', 'Discord', 'Bot reconnection signal sent');
                                            } catch (e: any) {
                                                addToast('error', 'Discord', e.message);
                                            }
                                        }}
                                        className="px-6 py-2.5 bg-indigo-500/10 text-indigo-500 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-500/20 transition-all border border-indigo-500/20 shadow-lg"
                                     >
                                        Hard Reset Connection
                                     </button>
                                     <button 
                                        id="btn-sync-discord"
                                        onClick={async () => {
                                            try {
                                                await API.syncDiscordCommands();
                                                addToast('success', 'Discord', 'Global commands synchronized');
                                            } catch (e: any) {
                                                addToast('error', 'Discord', e.message);
                                            }
                                        }}
                                        className="px-6 py-2.5 bg-secondary text-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:bg-secondary/80 transition-all border border-border shadow-md"
                                     >
                                        Sync Slash Commands
                                     </button>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.3em]">Module Status</span>
                                    <span className="text-[10px] font-bold text-emerald-500/80">LATENCY_SYNCED</span>
                                </div>
                            </div>
                        </div>
                    )}
                    {activeIntegrationTab === 'WEBHOOKS' && <WebhookHub />}
                    {activeIntegrationTab === 'TOKENS' && <TokenManager />}
                </motion.div>
            </AnimatePresence>
        </motion.div>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-4 h-[calc(100vh-8rem)] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
                <div>
                     <div className="flex items-center gap-3 mb-1">
                        <h1 className="text-2xl font-bold tracking-tight">System Administration</h1>
                        {systemStatus && (
                            <div className="flex gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    systemStatus?.protocol === 'https' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                }`}>
                                    {systemStatus?.protocol?.toUpperCase() || 'HTTP'}
                                </span>
                                {systemStatus?.sslStatus && systemStatus.sslStatus !== 'NONE' && (
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        systemStatus.sslStatus === 'VALID' ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20' : 'bg-violet-500/10 text-violet-600 border border-violet-500/20'
                                    }`}>
                                        {systemStatus.sslStatus.replace('_', ' ')}
                                    </span>
                                )}
                            </div>
                        )}
                     </div>
                     <p className="text-sm text-muted-foreground">Manage global settings, security, and view audit logs.</p>
                </div>
                {systemStatus && window.location.protocol.replace(':', '') !== systemStatus.protocol && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="flex bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 gap-3 overflow-hidden shadow-inner"
                    >
                        <div className="p-2 bg-amber-500/20 rounded h-min">
                            <AlertTriangle className="text-amber-600" size={18} />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-bold text-amber-700">Security / Protocol Inconsistency</p>
                            <p className="text-xs text-amber-700/80 leading-relaxed">
                                Your browser is accessing via <span className="font-mono bg-amber-500/10 px-1 rounded">{window.location.protocol.replace(':', '').toUpperCase()}</span>, 
                                but the backend reports <span className="font-mono bg-amber-500/10 px-1 rounded">{systemStatus?.protocol?.toUpperCase() || '...'}</span>. 
                                {systemStatus?.protocol === 'https' && (
                                    <span className="block mt-1 font-medium italic">
                                        Note: If you are using a self-signed certificate, you must manually visit the backend URL once to "allow" the connection in this browser.
                                    </span>
                                )}
                            </p>
                        </div>
                        <button 
                            onClick={fetchSystemStatus}
                            className="text-[10px] font-bold text-amber-600 hover:text-amber-700 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20"
                        >
                            Retry Check
                        </button>
                    </motion.div>
                )}
                {activeTab === 'SETTINGS' && (
                    <div className="flex items-center gap-3">
                        {hasInfraChanges() && (
                            <motion.div 
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded text-[10px] font-bold uppercase tracking-wider"
                            >
                                <AlertTriangle size={12} /> Restart Required
                            </motion.div>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={isSaving || !can('system.settings.manage')}
                            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={!can('system.settings.manage') ? 'Insufficient Permissions' : ''}
                        >
                            <Save size={18} />
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg w-fit border border-border/50 shrink-0">
                <button
                    onClick={() => setActiveTab('SETTINGS')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                        activeTab === 'SETTINGS' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    Configuration
                </button>
                {can('system.audit.view') && (
                    <button
                        onClick={() => setActiveTab('AUDIT')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                            activeTab === 'AUDIT' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Shield size={14} /> Audit Log
                    </button>
                )}

                {settings.app.distributedNodes?.enabled && can('system.nodes.manage') && (
                    <button
                        onClick={() => setActiveTab('NODES')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                            activeTab === 'NODES' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Layers size={14} /> Nodes
                    </button>
                )}

                {can('system.integrations.manage') && (
                    <button
                        onClick={() => setActiveTab('INTEGRATIONS')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                            activeTab === 'INTEGRATIONS' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Webhook size={14} /> Integrations
                    </button>
                )}

                <button
                    onClick={() => setActiveTab('HEALTH')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                        activeTab === 'HEALTH' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <Activity size={14} /> System Health
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
                {activeTab === 'SETTINGS' ? renderSettings() : 
                 activeTab === 'AUDIT' ? <AuditLog /> : 
                 activeTab === 'NODES' ? <NodesManager /> : 
                 activeTab === 'HEALTH' ? <SystemHealthMatrix /> :
                 renderIntegrations()}
            </div>

            {showWizard && <RemoteAccessWizard onClose={() => { setShowWizard(false); loadSettings(); }} />}
        </div>
    );
};

export default GlobalSettingsView;
