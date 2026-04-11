import React, { useState, useEffect } from 'react';
import { 
    Settings2, 
    Save, 
    Shield, 
    Clock, 
    Activity, 
    Link, 
    Layout, 
    RefreshCcw,
    Layers,
    History
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PAGE_VARIANTS } from '../../../styles/motion';
import { useUser } from '../../auth/context/UserContext';
import { useToast } from '../../ui/Toast';
import { API } from '@core/services/api';
import { GlobalSettings as GlobalSettingsType } from '@shared/types';
import { RemoteAccessWizard } from '../../ui/RemoteAccessWizard';

// Modular Sections
import { OperationsCard } from './sections/OperationsCard';
import { MaintenanceCard } from './sections/MaintenanceCard';
import { RemoteAccessCard } from './sections/RemoteAccessCard';
import { SecurityCard } from './sections/SecurityCard';
import { InfrastructureSection } from './sections/InfrastructureSection';
import { IntegrationsSection } from './sections/IntegrationsSection';

// Existing Shared Components
import NodesManager from '../../nodes/NodesManager';
import AuditLog from '../../auth/AuditLog';
import { SystemHealthMatrix } from '../RepairAudit';

type SettingsTab = 'CONFIG' | 'AUDIT' | 'NODES' | 'INTEGRATIONS' | 'HEALTH';

const GlobalSettings: React.FC = () => {
    const { user } = useUser();
    const { addToast } = useToast();
    const [activeTab, setActiveTab] = useState<SettingsTab>('CONFIG');
    const [settings, setSettings] = useState<GlobalSettingsType | null>(null);
    const [originalSettings, setOriginalSettings] = useState<GlobalSettingsType | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showWizard, setShowWizard] = useState(false);
    const [systemStatus, setSystemStatus] = useState<any>(null);

    useEffect(() => {
        loadSettings();
        fetchSystemStatus();
    }, []);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const data = await API.getGlobalSettings();
            setSettings(data);
            setOriginalSettings(JSON.parse(JSON.stringify(data)));
        } catch (error: any) {
            addToast('error', 'Configuration', 'Failed to load system settings: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchSystemStatus = async () => {
        try {
            const data = await API.getSystemStats();
            setSystemStatus(data);
        } catch (e) {
            console.error('Failed to fetch system status');
        }
    };

    const handleSave = async () => {
        if (!settings) return;
        try {
            setSaving(true);
            await API.updateGlobalSettings(settings);
            setOriginalSettings(JSON.parse(JSON.stringify(settings)));
            addToast('success', 'Configuration', 'System settings updated successfully');
            
            // Re-fetch to confirm persistence
            await loadSettings();
        } catch (error: any) {
            addToast('error', 'Configuration', 'Failed to update settings: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const isDirty = JSON.stringify(settings) !== JSON.stringify(originalSettings);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-20 space-y-4">
                <RefreshCcw className="animate-spin text-foreground/50" size={40} />
                <p className="text-muted-foreground font-mono text-xs uppercase tracking-widest animate-pulse">Initializing System Configuration...</p>
            </div>
        );
    }

    if (!settings) return null;

    return (
        <motion.div 
            variants={PAGE_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            className="space-y-6 max-w-7xl mx-auto pb-20"
        >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-secondary rounded border border-border text-foreground">
                            <Settings2 size={24} />
                        </div>
                        System Administration
                    </h2>
                    <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mt-1 opacity-70">
                        High-level configuration for the CraftCommand host engine.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {isDirty && (
                        <motion.button
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-2 bg-foreground text-background px-5 py-2.5 rounded border border-border font-extrabold text-[10px] uppercase tracking-widest hover:bg-foreground/90 transition-all disabled:opacity-50"
                        >
                            {saving ? <RefreshCcw size={14} className="animate-spin" /> : <Save size={14} />}
                            {saving ? 'Saving...' : 'Save Changes'}
                        </motion.button>
                    )}
                    <button 
                        onClick={() => loadSettings()}
                        className="p-2.5 rounded bg-secondary hover:bg-secondary/80 text-foreground transition-all border border-border"
                    >
                        <RefreshCcw size={18} />
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 bg-black/10 p-1 rounded border border-border/40 w-full overflow-x-auto">
                <button
                    onClick={() => setActiveTab('CONFIG')}
                    className={`flex items-center gap-2 px-5 py-2 rounded text-[10px] font-black tracking-tighter transition-all ${
                        activeTab === 'CONFIG' ? 'bg-zinc-800 text-white border border-white/10' : 'text-muted-foreground hover:bg-secondary/50'
                    }`}
                >
                    <Layout size={14} /> CONFIGURATION
                </button>
                {settings.app.distributedNodes?.enabled && (
                    <button
                        onClick={() => setActiveTab('NODES')}
                        className={`flex items-center gap-2 px-5 py-2 rounded text-[10px] font-black tracking-tighter transition-all ${
                            activeTab === 'NODES' ? 'bg-zinc-800 text-white border border-white/10' : 'text-muted-foreground hover:bg-secondary/50'
                        }`}
                    >
                        <Layers size={14} /> NODES
                    </button>
                )}
                <button
                    onClick={() => setActiveTab('INTEGRATIONS')}
                    className={`flex items-center gap-2 px-5 py-2 rounded text-[10px] font-black tracking-tighter transition-all ${
                        activeTab === 'INTEGRATIONS' ? 'bg-zinc-800 text-white border border-white/10' : 'text-muted-foreground hover:bg-secondary/50'
                    }`}
                >
                    <Link size={14} /> INTEGRATIONS
                </button>
                <button
                    onClick={() => setActiveTab('AUDIT')}
                    className={`flex items-center gap-2 px-5 py-2 rounded text-[10px] font-black tracking-tighter transition-all ${
                        activeTab === 'AUDIT' ? 'bg-zinc-800 text-white border border-white/10' : 'text-muted-foreground hover:bg-secondary/50'
                    }`}
                >
                    <History size={14} /> AUDIT LOG
                </button>
                <button
                    onClick={() => setActiveTab('HEALTH')}
                    className={`flex items-center gap-2 px-5 py-2 rounded text-[10px] font-black tracking-tighter transition-all ${
                        activeTab === 'HEALTH' ? 'bg-zinc-800 text-white border border-white/10' : 'text-muted-foreground hover:bg-secondary/50'
                    }`}
                >
                    <Activity size={14} /> SYSTEM HEALTH
                </button>
            </div>

            <AnimatePresence mode="wait">
                {activeTab === 'CONFIG' && (
                    <motion.div 
                        key="config"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
                    >
                        <div className="space-y-6">
                            <OperationsCard settings={settings} setSettings={setSettings} user={user} />
                            <SecurityCard settings={settings} setSettings={setSettings} user={user} />
                            <MaintenanceCard settings={settings} setSettings={setSettings} user={user} />
                        </div>
                        <div className="space-y-6">
                            <RemoteAccessCard settings={settings} loadSettings={loadSettings} user={user} systemStatus={systemStatus} setShowWizard={setShowWizard} />
                            <InfrastructureSection settings={settings} setSettings={setSettings} user={user} systemStatus={systemStatus} setActiveTab={setActiveTab} />
                        </div>
                    </motion.div>
                )}

                {activeTab === 'NODES' && (
                    <motion.div key="nodes" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <NodesManager />
                    </motion.div>
                )}

                {activeTab === 'INTEGRATIONS' && (
                    <motion.div key="integrations" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <IntegrationsSection settings={settings} setSettings={setSettings} user={user} />
                    </motion.div>
                )}

                {activeTab === 'AUDIT' && (
                    <motion.div key="audit" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <AuditLog />
                    </motion.div>
                )}

                {activeTab === 'HEALTH' && (
                    <motion.div key="health" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <SystemHealthMatrix />
                    </motion.div>
                )}
            </AnimatePresence>

            {showWizard && (
                <RemoteAccessWizard 
                    onClose={() => {
                        setShowWizard(false);
                        loadSettings();
                    }} 
                />
            )}
        </motion.div>
    );
};

export default GlobalSettings;
