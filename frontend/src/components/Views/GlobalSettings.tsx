import React, { useState, useEffect } from 'react';
import { GlobalSettings as GlobalSettingsType, SecurityConfig, DiscordConfig } from '@shared/types';
import { API } from '../../services/api';
import { useToast } from '../UI/Toast';
import { Save, AlertTriangle, Monitor, Shield, Settings2, Database } from 'lucide-react';
import { motion } from 'framer-motion';
import { useUser } from '../../context/UserContext';
import AuditLog from './AuditLog';
import { ThemeToggle } from '../UI/ThemeToggle';

const GlobalSettingsView: React.FC = () => {
    const [settings, setSettings] = useState<GlobalSettingsType | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-300">
                {/* Operation Mode Card */}
                <motion.div 
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="bg-card border border-border rounded-xl p-6 shadow-sm"
                >
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 bg-violet-500/10 text-violet-500 rounded-lg">
                            <Settings2 size={24} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg">Operational Mode</h3>
                            <p className="text-sm text-muted-foreground">Define how CraftCommand operates this instance.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border/50">
                            <div>
                                <div className="font-medium flex items-center gap-2">
                                    Host Mode <Shield size={14} className="text-emerald-500" />
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
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
                </motion.div>

                {/* System Maintenance Card */}
                <motion.div 
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                    className="bg-card border border-border rounded-xl p-6 shadow-sm"
                >
                     <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 bg-blue-500/10 text-blue-500 rounded-lg">
                            <Monitor size={24} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg">System Maintenance</h3>
                            <p className="text-sm text-muted-foreground">Automatic updates and health checks.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border/50">
                            <div>
                                <div className="font-medium">Auto-Updates</div>
                                <p className="text-xs text-muted-foreground mt-1">
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
                        
                        <div className="p-4 bg-secondary/30 rounded-lg border border-border/50">
                            <div className="font-medium text-sm mb-3">System Theme</div>
                            <ThemeToggle />
                        </div>
                    </div>
                </motion.div>

                {/* Data Storage Card (Phase 4) */}
                <motion.div 
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                    className="bg-card border border-border rounded-xl p-6 shadow-sm col-span-1 md:col-span-2"
                >
                     <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 bg-fuchsia-500/10 text-fuchsia-500 rounded-lg">
                            <Database size={24} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg">Data Storage</h3>
                            <p className="text-sm text-muted-foreground">Configure how CraftCommand persists server data.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border/50">
                            <div>
                                <div className="font-medium flex items-center gap-2">
                                    SQLite Storage Database
                                    {settings.app.storageProvider === 'sqlite' && <Database size={14} className="text-emerald-500" />}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
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
                </motion.div>
            </div>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 h-[calc(100vh-8rem)] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
                <div>
                     <h1 className="text-3xl font-bold tracking-tight mb-2">System Administration</h1>
                     <p className="text-muted-foreground">Manage global settings, security, and view audit logs.</p>
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
        </div>
    );
};

export default GlobalSettingsView;
