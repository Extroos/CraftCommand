import React, { useState, useEffect } from 'react';
import { GlobalSettings as GlobalSettingsType, SecurityConfig, DiscordConfig } from '@shared/types';
import { API } from '../../services/api';
import { useToast } from '../UI/Toast';
import { Save, AlertTriangle, Monitor, Shield, Settings2, Database } from 'lucide-react';
import { motion } from 'framer-motion';
import { useUser } from '../../context/UserContext';
import AuditLog from './AuditLog';
import { ThemeToggle } from '../UI/ThemeToggle';
import { RemoteAccessWizard } from '../Wizards/RemoteAccessWizard';

const GlobalSettingsView: React.FC = () => {
    const [settings, setSettings] = useState<GlobalSettingsType | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showWizard, setShowWizard] = useState(false);
    const { addToast } = useToast();

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const data = await API.getGlobalSettings();
            setSettings(data);
        } catch (e) {
            console.error(e);
            addToast('error', 'Settings', 'Failed to load system settings');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!settings) return;
        setIsSaving(true);
        try {
            await API.updateGlobalSettings(settings);
            addToast('success', 'Settings', 'System configuration updated');
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

    const [activeTab, setActiveTab] = useState<'SETTINGS' | 'AUDIT'>('SETTINGS');
    const { user } = useUser();

    if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading System Configuration...</div>;
    if (!settings) return <div className="p-8 text-center text-rose-500">Failed to load configuration.</div>;

    const renderSettings = () => (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Operation Mode Card */}
                <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
                    <div className="flex items-start gap-3 mb-3">
                        <div className="p-2 bg-violet-500/10 text-violet-500 rounded">
                            <Settings2 size={20} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-base">Operational Mode</h3>
                            <p className="text-xs text-muted-foreground">Define how CraftCommand operates this instance.</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-secondary/30 rounded border border-border/50">
                            <div>
                                <div className="font-medium text-sm flex items-center gap-2">
                                    Host Mode <Shield size={12} className="text-emerald-500" />
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 max-w-[280px]">
                                    Enables Multi-User Authentication, Role-Based Access Control, and strict API security. Disabling this switches to "Personal Mode".
                                </p>
                            </div>
                            <button
                                onClick={toggleHostMode}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    settings.app.hostMode ? 'bg-primary' : 'bg-input'
                                }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                                        settings.app.hostMode ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>
                        
                        {!settings.app.hostMode && (
                            <div className="flex gap-3 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-lg text-xs">
                                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                                <p>
                                    <strong>Warning:</strong> Disabling Host Mode reduces security. Ensure this instance is not publicly accessible.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* System Maintenance Card */}
                <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
                     <div className="flex items-start gap-3 mb-3">
                        <div className="p-2 bg-blue-500/10 text-blue-500 rounded">
                            <Monitor size={20} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-base">System Maintenance</h3>
                            <p className="text-xs text-muted-foreground">Automatic updates and health checks.</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-secondary/30 rounded border border-border/50">
                            <div>
                                <div className="font-medium text-sm">Auto-Updates</div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Automatically download and apply critical security patches and updates on startup.
                                </p>
                            </div>
                            <button
                                onClick={toggleAutoUpdate}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    settings.app.autoUpdate ? 'bg-primary' : 'bg-input'
                                }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                                        settings.app.autoUpdate ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>
                        
                        <div className="p-3 bg-secondary/30 rounded border border-border/50">
                            <div className="font-medium text-sm mb-2">System Theme</div>
                            <ThemeToggle />
                        </div>
                    </div>
                </div>



                {/* Remote Access Card (Phase R3) */}
                <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
                     <div className="flex items-start gap-3 mb-3">
                        <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded">
                            <Monitor size={20} />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-base">Remote Access</h3>
                            <p className="text-xs text-muted-foreground">Share your server with friends outside your local network.</p>
                        </div>
                    </div>

                    {!settings.app.remoteAccess?.enabled ? (
                        <div className="space-y-3">
                            <div className="bg-secondary/30 rounded p-3 border border-border/50">
                                <div className="flex items-start gap-4">
                                    <div className="p-1.5 bg-amber-500/10 rounded">
                                        <AlertTriangle size={18} className="text-amber-500" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-medium text-sm mb-1">Remote Access Not Configured</h4>
                                        <p className="text-xs text-muted-foreground mb-3">
                                            Your server is currently only accessible from this computer. To allow friends to join from anywhere, you need to set up remote access.
                                        </p>
                                        <button
                                            onClick={() => setShowWizard(true)}
                                            className="bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:bg-primary/90 inline-flex items-center gap-2">
                                            <Shield size={14} />
                                            Configure Remote Access
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="bg-secondary/20 rounded-lg p-4 border border-border/30">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Shield size={14} className="text-emerald-500" />
                                        <span className="font-medium text-sm">Safest: VPN</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Encrypted private connection via Tailscale/ZeroTier. No ports needed.</p>
                                </div>
                                <div className="bg-secondary/20 rounded-lg p-4 border border-border/30">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Monitor size={14} className="text-blue-500" />
                                        <span className="font-medium text-sm">Easiest: Playit.gg</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">One-click tunnel. Game + Web dashboard access.</p>
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
                                                <div className="bg-background/50 rounded p-3">
                                                    <p className="text-xs text-muted-foreground mb-1">Share with friends:</p>
                                                    <code className="text-xs bg-secondary px-2 py-1 rounded">Your VPN IP (e.g., 192.168.x.x)</code>
                                                </div>
                                                <p className="text-xs text-emerald-600">✓ Game + Web access</p>
                                            </div>
                                        )}
                                        {settings.app.remoteAccess.method === 'proxy' && (
                                            <div className="space-y-2">
                                                <p className="text-sm text-emerald-700"><strong>Playit.gg Proxy:</strong> Server tunneled through Playit network.</p>
                                                <div className="bg-background/50 rounded p-3">
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
                                                <div className="bg-background/50 rounded p-3">
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
                                                <div className="bg-background/50 rounded p-3">
                                                    <p className="text-xs text-muted-foreground mb-1">Share with friends:</p>
                                                    <code className="text-xs bg-secondary px-2 py-1 rounded">
                                                        {settings.app.remoteAccess.externalIP || 'Detecting...'}
                                                    </code>
                                                    <p className="text-xs text-amber-600 mt-2">⚠ Ports must be forwarded</p>
                                                </div>
                                                <p className="text-xs text-emerald-600">✓ Game + Web access</p>
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
                </div>

                {/* Network Security Card */}
                <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
                     <div className="flex items-start gap-3 mb-3">
                        <div className="p-2 bg-fuchsia-500/10 text-fuchsia-500 rounded">
                            <Shield size={20} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-base">Network Security</h3>
                            <p className="text-xs text-muted-foreground">Configure secure access protocols (HTTPS).</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-secondary/30 rounded border border-border/50">
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
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    settings.app.https?.enabled ? 'bg-primary' : 'bg-input'
                                }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                                        settings.app.https?.enabled ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>

                        {settings.app.https?.enabled && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground uppercase">Certificate Path (.pem/.crt)</label>
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
                                    <label className="text-xs font-medium text-muted-foreground uppercase">Private Key Path (.key)</label>
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
                                <div className="col-span-1 md:col-span-2 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-lg text-xs flex gap-2">
                                    <AlertTriangle size={16} className="shrink-0" />
                                    <p>Ensure the backend process has read permissions for these files. Incorrect paths will cause a fallback to HTTP.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Data Storage Card (Phase 4) */}
                <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
                     <div className="flex items-start gap-3 mb-3">
                        <div className="p-2 bg-fuchsia-500/10 text-fuchsia-500 rounded">
                            <Database size={20} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-base">Data Storage</h3>
                            <p className="text-xs text-muted-foreground">Configure how CraftCommand persists server data.</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-secondary/30 rounded border border-border/50">
                            <div>
                                <div className="font-medium text-sm flex items-center gap-2">
                                    SQLite Storage Database
                                    {settings.app.storageProvider === 'sqlite' && <Database size={12} className="text-emerald-500" />}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Enable SQLite for better data integrity and crash resilience. Disabling switches back to standard JSON files.
                                </p>
                            </div>
                            <button
                                onClick={toggleStorageProvider}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    settings.app.storageProvider === 'sqlite' ? 'bg-primary' : 'bg-input'
                                }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                                        settings.app.storageProvider === 'sqlite' ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>
                         <div className="flex gap-3 p-3 bg-blue-500/10 border border-blue-500/20 text-blue-600 rounded-lg text-xs">
                            <Monitor size={16} className="shrink-0 mt-0.5" />
                            <p>
                                <strong>Note:</strong> Switching providers requires a restart. Data is auto-migrated from JSON to SQL, but NOT vice-versa.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-4 h-[calc(100vh-8rem)] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
                <div>
                     <h1 className="text-2xl font-bold tracking-tight mb-1">System Administration</h1>
                     <p className="text-sm text-muted-foreground">Manage global settings, security, and view audit logs.</p>
                </div>
                {activeTab === 'SETTINGS' && (
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                        <Save size={18} />
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
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
                <button
                    onClick={() => setActiveTab('AUDIT')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                        activeTab === 'AUDIT' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <Shield size={14} /> Audit Log
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-visible">
                {activeTab === 'SETTINGS' ? renderSettings() : <AuditLog />}
            </div>

            {showWizard && <RemoteAccessWizard onClose={() => { setShowWizard(false); loadSettings(); }} />}
        </div>
    );
};

export default GlobalSettingsView;
