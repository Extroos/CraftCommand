
import React, { useState, useMemo, useEffect } from 'react';
import { Backup } from '@shared/types';
import { 
    ArchiveRestore, Plus, Clock, HardDrive, Lock, Unlock, 
    Trash2, RotateCcw, Download, ShieldCheck, Loader2, 
    Cloud, FileBox, AlertTriangle, Check, X, Filter, Save 
} from 'lucide-react';
import { useToast } from '../ui/Toast';
import { API } from '@core/services/api';
import { socketService } from '@core/services/socket';
import { useServers } from '@features/servers/context/ServerContext';
import { usePermissions } from '@features/auth/hooks/usePermissions';
import { motion, AnimatePresence } from 'framer-motion';
import AccessDenied from '@features/auth/components/AccessDenied';
import { CloudDestinationsWidget } from './components/CloudDestinationsWidget';
import { useConfirm } from '../ui/hooks/useConfirm';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface BackupManagerProps {
    serverId: string;
}

const BackupManager: React.FC<BackupManagerProps> = ({ serverId }) => {
    const { addToast } = useToast();
    const { can } = usePermissions();
    const [filter, setFilter] = useState<'ALL' | 'MANUAL' | 'SCHEDULED' | 'LOCKED'>('ALL');
    const { isOpen: isConfirmOpen, config: confirmConfig, confirm: requestConfirm, handleConfirm, handleCancel } = useConfirm();
    
    // Workflow States
    const [creationState, setCreationState] = useState<'IDLE' | 'CONFIG' | 'CREATING'>('IDLE');
    const [newBackupName, setNewBackupName] = useState('');
    const [progress, setProgress] = useState(0);
    const [restoreId, setRestoreId] = useState<string | null>(null);
    const [restoreWorldOnly, setRestoreWorldOnly] = useState(false);
    const [isAutoBackupEnabled, setIsAutoBackupEnabled] = useState(false);
    const [worldOnlyBackup, setWorldOnlyBackup] = useState(false); // NEW: world-only toggle state
    const [autoBackupWorldOnly, setAutoBackupWorldOnly] = useState(false); // NEW: automated backup mode preference
    const [deletedBackupIds, setDeletedBackupIds] = useState<Set<string>>(new Set());
    const [pendingLockIds, setPendingLockIds] = useState<Set<string>>(new Set());

    const { backups: globalBackups, refreshServerData, loading, servers } = useServers();
    const backups = globalBackups[serverId] || [];
    const currentServer = servers?.[serverId];

    // Fetch backups on mount if not present (although context handles this, extra safety)
    useEffect(() => {
        if (!globalBackups[serverId]) {
            refreshServerData(serverId);
        }

        // Check Auto-Backup Status
        API.getSchedules(serverId).then(schedules => {
            const exists = schedules.some((s: any) => s.id === 'auto-backup-2h' && s.isActive);
            setIsAutoBackupEnabled(exists);
        });

        // Load server's automated backup preference
        if (currentServer?.backupConfig?.worldOnly !== undefined) {
            setAutoBackupWorldOnly(currentServer.backupConfig.worldOnly);
        }

        // Listen for backup progress
        const unsubscribe = socketService.onBackupProgress((data: any) => {
            if (data.serverId === serverId) {
                setProgress(data.percent);
            }
        });

        const unsubscribeStatus = socketService.onBackupStatus((data: any) => {
            // Could show detailed status if needed
        });

        return () => {
            unsubscribe();
            unsubscribeStatus();
        };
    }, [serverId, globalBackups[serverId], refreshServerData]);

    const fetchBackups = async () => {
        await refreshServerData(serverId);
    };

    // Computed Stats
    const totalUsage = useMemo(() => {
        const totalBytes = backups.reduce((sum, b) => sum + (b.size || 0), 0);
        return (totalBytes / (1024 * 1024 * 1024)).toFixed(2); // Convert to GB
    }, [backups]);

    const maxStorage = 10; // GB (Could be dynamic later)
    const usagePercent = (Number(totalUsage) / maxStorage) * 100;

    const filteredBackups = useMemo(() => {
        return backups
            .filter(b => !deletedBackupIds.has(b.id))
            .filter(b => {
                if (filter === 'LOCKED') return b.locked;
                if (filter === 'MANUAL') return b.type === 'Manual';
                if (filter === 'SCHEDULED') return b.type === 'Scheduled';
                return true;
            });
    }, [backups, filter, deletedBackupIds]);

    // Actions
    const startCreation = () => {
        setNewBackupName(`Backup-${new Date().toLocaleDateString().replace(/\//g, '-')}`);
        setCreationState('CONFIG');
    };

    const confirmCreation = async () => {
        if (!can('server.backups.manage', serverId)) {
            addToast('error', 'Permissions', 'Insufficient permissions to create backups');
            return;
        }
        setCreationState('CREATING');
        setProgress(0);
        
        try {
            // The backend now waits 2s for save-all, so we show it in UI
            addToast('info', 'Preparing Backup', 'Flushing server data to disk...');
            await API.createBackup(serverId, newBackupName, worldOnlyBackup);
            addToast('success', 'Snapshot Created', 'Backup created successfully');
            await fetchBackups();
        } catch (e: any) {
            addToast('error', 'Backup Failed', e.message || 'Failed to create backup');
        } finally {
            setCreationState('IDLE');
            setProgress(0);
        }
    };

    const toggleLock = async (id: string) => {
        if (!can('server.backups.manage', serverId)) {
            addToast('error', 'Permissions', 'Insufficient permissions to modify backup lock');
            return;
        }
        setPendingLockIds(prev => new Set(prev).add(id));
        try {
            const res = await API.toggleBackupLock(serverId, id);
            await refreshServerData(serverId); // Refresh context
            addToast('success', res.locked ? 'Snapshot Locked' : 'Snapshot Unlocked', res.locked ? 'Backup is safe from auto-cleanup.' : 'Backup can now be deleted.');
        } catch (e) {
            addToast('error', 'Action Failed', 'Could not toggle lock status.');
        } finally {
            setPendingLockIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const deleteBackup = async (id: string, locked?: boolean) => {
        if (!can('server.backups.manage', serverId)) {
            addToast('error', 'Permissions', 'Insufficient permissions to delete backups');
            return;
        }
        if (locked) {
            addToast('error', 'Backup Locked', 'Unlock this snapshot before deleting it.');
            return;
        }

        const isConfirmed = await requestConfirm({
            title: 'Delete Backup',
            description: 'Are you sure you want to delete this backup? This action cannot be undone.',
            confirmText: 'Delete Backup',
            cancelText: 'Cancel'
        });

        if (isConfirmed) {
            setDeletedBackupIds(prev => new Set(prev).add(id));
            try {
                await API.deleteBackup(serverId, id);
                addToast('info', 'Backup Deleted', 'The archive was removed from storage.');
                await fetchBackups();
            } catch (e) {
                setDeletedBackupIds(prev => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
                addToast('error', 'Delete Failed', 'Failed to delete backup');
            }
        }
    };

    const handleRestore = (id: string) => {
        setRestoreId(id);
    };

    const confirmRestore = async () => {
        if (!restoreId) return;
        if (!can('server.backups.manage', serverId)) {
            addToast('error', 'Permissions', 'Insufficient permissions to restore backups');
            return;
        }
        addToast('warning', 'Restoration Started', 'Server is stopping for file restoration...');
        
        try {
            await API.restoreBackup(serverId, restoreId, restoreWorldOnly);
            addToast('success', 'Restoration Complete', `Server ${restoreWorldOnly ? 'world' : 'files'} have been reverted.`);
            setRestoreId(null);
            setRestoreWorldOnly(false);
        } catch (e) {
            addToast('error', 'Restore Failed', 'Failed to restore backup');
            setRestoreId(null);
        }
    };

    if (!can('server.backups.read', serverId)) {
        return (
            <AccessDenied 
                title="Backup Access Restricted"
                description="You do not have permission to view or manage backups for this server. Please contact an administrator for access."
            />
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100vh-120px)] animate-fade-in relative">
            
            {/* Restore Confirmation Modal */}
            {restoreId && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl">
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-card border border-rose-500/30 p-6 rounded-xl shadow-2xl max-w-md w-full"
                    >
                        <div className="flex items-center gap-4 mb-4 text-rose-500">
                            <div className="p-3 bg-rose-500/10 rounded-full">
                                <AlertTriangle size={24} />
                            </div>
                            <h2 className="text-xl font-bold">Confirm Restoration</h2>
                        </div>
                            <p className="text-muted-foreground text-sm mb-6">
                                Are you sure you want to restore <span className="text-foreground font-mono font-bold">{backups.find(b => b.id === restoreId)?.description || backups.find(b => b.id === restoreId)?.filename || 'Unknown Backup'}</span>? 
                                <br /><br />
                                <span className="text-rose-400">
                                    {restoreWorldOnly 
                                        ? "Only world data will be reverted. Existing plugins, mods, and configuration will be preserved." 
                                        : "Current server files will be overwritten and lost. The server will restart automatically."}
                                </span>
                            </p>

                            <div className="mb-6 p-4 bg-secondary/20 rounded-xl flex items-center justify-between border border-border/40">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/80">Selective Recovery</span>
                                    <span className="text-xs font-bold text-foreground">Restore World Data Only</span>
                                    <span className="text-[10px] text-muted-foreground italic mt-0.5">Retain Current JARs, Plugins & Configs</span>
                                </div>
                                <button 
                                    onClick={() => setRestoreWorldOnly(!restoreWorldOnly)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${restoreWorldOnly ? 'bg-primary shadow-[0_0_12px_rgba(var(--primary-rgb),0.3)]' : 'bg-muted'}`}
                                >
                                    <span 
                                        className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform duration-300 ${restoreWorldOnly ? 'translate-x-6' : 'translate-x-1'}`}
                                    />
                                </button>
                            </div>

                            <div className="flex gap-3">
                                <button 
                                    onClick={() => { setRestoreId(null); setRestoreWorldOnly(false); }}
                                    className="flex-1 py-2.5 rounded-lg border border-border hover:bg-secondary transition-colors text-sm font-medium"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={confirmRestore}
                                    className="flex-1 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-rose-900/20"
                                >
                                    <RotateCcw size={16} /> {restoreWorldOnly ? 'Restore World' : 'Full Restore'}
                                </button>
                            </div>
                    </motion.div>
                </div>
            )}

            {/* Left Column: Actions & Stats */}
            <div className="lg:col-span-1 space-y-6 overflow-y-auto pb-6 pr-2 custom-scrollbar">
                
                {/* Creation Card */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm overflow-hidden relative">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-primary/10 text-primary rounded-lg"><ArchiveRestore size={20} /></div>
                        <div>
                            <h2 className="text-lg font-bold">Backups</h2>
                            <p className="text-xs text-muted-foreground">Manage restoration points.</p>
                        </div>
                    </div>

                    <AnimatePresence mode="wait">
                        {creationState === 'IDLE' && (
                            <motion.button 
                                key="btn"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                onClick={startCreation}
                                disabled={!can('server.backups.manage', serverId)}
                                title={!can('server.backups.manage', serverId) ? 'Insufficient Permissions' : ''}
                                className={`w-full py-4 border-2 border-dashed border-border rounded-xl transition-all flex flex-col items-center justify-center gap-2 group ${
                                    can('server.backups.manage', serverId)
                                    ? 'text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-secondary/20'
                                    : 'opacity-50 cursor-not-allowed text-zinc-600'
                                }`}
                            >
                                <Plus size={24} className={can('server.backups.manage', serverId) ? "group-hover:scale-110 transition-transform" : ""} />
                                <span className="font-medium text-sm">Create New Snapshot</span>
                            </motion.button>
                        )}

                        {creationState === 'CONFIG' && (
                            <motion.div 
                                key="config"
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                className="space-y-4"
                            >
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground uppercase">Backup Name</label>
                                    <input 
                                        autoFocus
                                        type="text" 
                                        value={newBackupName} 
                                        onChange={(e) => setNewBackupName(e.target.value)}
                                        className="w-full mt-1.5 bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                        placeholder="e.g., Pre-Boss Fight"
                                    />
                                </div>

                                {/* World Data Only Toggle */}
                                <div className="flex items-center justify-between p-3 bg-muted/50 rounded border border-border">
                                    <div>
                                        <div className="font-semibold text-sm">World Data Only</div>
                                        <div className="text-xs text-muted-foreground">
                                            Only backup world folders (saves, player data) - excludes plugins/mods
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setWorldOnlyBackup(!worldOnlyBackup)}
                                        className={`relative w-11 h-6 rounded-full transition ${
                                            worldOnlyBackup ? 'bg-primary' : 'bg-muted'
                                        }`}
                                    >
                                        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition transform ${
                                            worldOnlyBackup ? 'translate-x-5' : ''
                                        }`} />
                                    </button>
                                </div>

                                <div className="flex gap-2">
                                    <button onClick={() => setCreationState('IDLE')} className="flex-1 py-2 text-xs font-medium hover:bg-secondary rounded-lg transition-colors">Cancel</button>
                                    <button 
                                        onClick={confirmCreation} 
                                        disabled={!can('server.backups.manage', serverId)}
                                        className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        <Save size={14} /> Start Backup
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {creationState === 'CREATING' && (
                            <motion.div 
                                key="creating"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="text-center py-4 space-y-4"
                            >
                                <Loader2 size={32} className="animate-spin text-primary mx-auto" />
                                <div>
                                    <h3 className="font-semibold text-sm">Compressing World...</h3>
                                    <p className="text-xs text-muted-foreground">Please wait while we archive your files.</p>
                                </div>
                                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-primary transition-all duration-300 ease-out"
                                        style={{ width: `${progress}%` }}
                                    ></div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Storage Widget */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <HardDrive size={16} className="text-muted-foreground" /> Storage Usage
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">{totalUsage}GB / {maxStorage}GB</span>
                    </div>
                    
                    <div className="h-4 w-full bg-secondary rounded-full overflow-hidden flex mb-2">
                        {/* Manual Part */}
                        <div className="h-full bg-emerald-500/80" style={{ width: `${Math.min(backups.filter(b => !deletedBackupIds.has(b.id) && b.type === 'Manual').reduce((s, b) => s + (b.size || 0), 0) / (maxStorage * 1024 * 1024 * 1024) * 100, 100)}%` }} title="Manual Backups"></div>
                        {/* Scheduled Part */}
                        <div className="h-full bg-blue-500/80" style={{ width: `${Math.min(backups.filter(b => !deletedBackupIds.has(b.id) && b.type === 'Scheduled').reduce((s, b) => s + (b.size || 0), 0) / (maxStorage * 1024 * 1024 * 1024) * 100, 100)}%` }} title="Scheduled Backups"></div>
                    </div>
                    
                    <div className="flex justify-between text-[10px] text-muted-foreground uppercase tracking-wider">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-emerald-500/80"></div> Manual
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-blue-500/80"></div> Scheduled
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-secondary"></div> Free
                        </div>
                    </div>
                </div>


                {/* Automation Card */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-violet-500/10 text-violet-500 rounded-lg"><Clock size={20} /></div>
                        <div>
                            <h2 className="text-lg font-bold">Automation</h2>
                            <p className="text-xs text-muted-foreground">Scheduled tasks.</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border">
                        <div>
                            <h4 className="font-medium text-sm text-foreground">Auto-Backup {autoBackupWorldOnly ? '(World Only)' : '(Full Server)'}</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">Create snapshot every 2 hours</p>
                        </div>
                        <button
                            onClick={async () => {
                                if (!can('server.backups.manage', serverId)) {
                                    addToast('error', 'Permissions', 'Insufficient permissions to manage automation');
                                    return;
                                }
                                try {
                                    if (isAutoBackupEnabled) {
                                        await API.deleteSchedule(serverId, 'auto-backup-2h');
                                        addToast('info', 'Auto-Backup Disabled', 'Scheduled task removed.');
                                        setIsAutoBackupEnabled(false);
                                    } else {
                                        await API.createSchedule(serverId, {
                                            id: 'auto-backup-2h',
                                            name: 'Auto-Backup (2h)',
                                            cron: '0 */2 * * *',
                                            command: 'backup',
                                            isActive: true
                                        });
                                        addToast('success', 'Auto-Backup Enabled', 'Server will now backup every 2 hours.');
                                        setIsAutoBackupEnabled(true);
                                    }
                                } catch (e) {
                                    addToast('error', 'Action Failed', 'Could not toggle auto-backup.');
                                }
                            }}
                            disabled={!can('server.backups.manage', serverId)}
                            title={!can('server.backups.manage', serverId) ? 'Insufficient Permissions' : ''}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${isAutoBackupEnabled ? 'bg-primary' : 'bg-secondary'} ${!can('server.backups.manage', serverId) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <span className="sr-only">Enable auto-backup</span>
                             <div className={`h-4 w-4 transform rounded-full bg-white transition-transform ${isAutoBackupEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    {/* Automated Backup Mode Toggle */}
                    <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border mt-3">
                        <div>
                            <h4 className="font-medium text-sm text-foreground">Automated Backup Mode</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {autoBackupWorldOnly 
                                    ? 'World only (saves, player data, dimensions)' 
                                    : 'Full server (world + plugins + mods + configs)'}
                            </p>
                        </div>
                        <button
                            onClick={async () => {
                                if (!can('server.backups.manage', serverId)) {
                                    addToast('error', 'Permissions', 'Insufficient permissions to manage automation');
                                    return;
                                }
                                try {
                                    const newValue = !autoBackupWorldOnly;
                                    await API.updateServer(serverId, {
                                        backupConfig: { worldOnly: newValue }
                                    });
                                    setAutoBackupWorldOnly(newValue);
                                    await refreshServerData(serverId);
                                    addToast('success', 'Preference Saved', `Automated backups will now be ${newValue ? 'world-only' : 'full server'}.`);
                                } catch (e) {
                                    addToast('error', 'Update Failed', 'Could not save backup preference.');
                                }
                            }}
                            disabled={!can('server.backups.manage', serverId)}
                            title={!can('server.backups.manage', serverId) ? 'Insufficient Permissions' : ''}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${autoBackupWorldOnly ? 'bg-primary' : 'bg-secondary'} ${!can('server.backups.manage', serverId) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <span className="sr-only">Toggle automated backup mode</span>
                             <div className={`h-4 w-4 transform rounded-full bg-white transition-transform ${autoBackupWorldOnly ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>
                </div>

                {/* Cloud Sync Widget */}
                <CloudDestinationsWidget serverId={serverId} />
            </div>

            {/* Right Column: Backup List */}
            <div className="lg:col-span-2 bg-card border border-border rounded-xl flex flex-col overflow-hidden shadow-sm">
                
                {/* Filter Header */}
                <div className="p-4 border-b border-border bg-muted/10 flex flex-col sm:flex-row gap-4 justify-between items-center">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <FileBox size={16} />
                        <span>Archives</span>
                        <span className="ml-2 bg-secondary px-2 py-0.5 rounded text-xs text-foreground">{filteredBackups.length}</span>
                    </div>

                    <div className="flex bg-secondary/50 p-1 rounded-lg">
                        {(['ALL', 'MANUAL', 'SCHEDULED', 'LOCKED'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                                    filter === f 
                                    ? 'bg-background text-foreground shadow-sm' 
                                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                                }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    <AnimatePresence mode="popLayout">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                                <Loader2 size={32} className="animate-spin mb-2" />
                                <p>Loading backups...</p>
                            </div>
                        ) : filteredBackups.map((backup) => (
                            <motion.div 
                                key={backup.id}
                                layout
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="group bg-background border border-border rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-primary/30 transition-all shadow-sm"
                            >
                                <div className="flex items-start gap-4">
                                    <div className={`p-3 rounded-lg bg-emerald-500/10 text-emerald-500`}>
                                        <Save size={20} />
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-foreground flex items-center gap-2">
                                            {backup.description || backup.id}
                                        </h4>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1 font-mono">
                                            <span className="flex items-center gap-1" title="Created At"><Clock size={10} /> {new Date(backup.createdAt).toLocaleString()}</span>
                                            <span className="w-1 h-1 bg-border rounded-full"></span>
                                            <span title="Size">{(backup.size / 1024 / 1024).toFixed(2)} MB</span>
                                            {backup.scope === 'world' && (
                                                <>
                                                    <span className="w-1 h-1 bg-border rounded-full"></span>
                                                    <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-500/10 text-blue-500 rounded uppercase">
                                                        World Only
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 w-full sm:w-auto justify-end border-t sm:border-t-0 border-border pt-3 sm:pt-0">
                                    <button 
                                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed" 
                                        title={!can('server.files.read', serverId) ? 'Insufficient Permissions' : 'Download Archive'}
                                        disabled={!can('server.files.read', serverId)}
                                        onClick={() => API.downloadBackup(serverId, backup.id)}
                                    >
                                        <Download size={16} />
                                    </button>

                                    <button 
                                        onClick={() => toggleLock(backup.id)}
                                        disabled={pendingLockIds.has(backup.id) || !can('server.backups.manage', serverId)}
                                        className={`p-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${backup.locked ? 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`} 
                                        title={!can('server.backups.manage', serverId) ? 'Insufficient Permissions' : (backup.locked ? "Unlock Snapshot" : "Lock Snapshot")}
                                    >
                                        {pendingLockIds.has(backup.id) ? (
                                            <Loader2 size={16} className="animate-spin" />
                                        ) : backup.locked ? (
                                            <Lock size={16} />
                                        ) : (
                                            <Unlock size={16} />
                                        )}
                                    </button>
                                    
                                    <button 
                                        onClick={() => handleRestore(backup.id)}
                                        disabled={!can('server.backups.manage', serverId)}
                                        className="p-2 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed" 
                                        title={!can('server.backups.manage', serverId) ? 'Insufficient Permissions' : 'Restore Server'}
                                    >
                                        <RotateCcw size={16} />
                                    </button>
                                    
                                    <button 
                                        onClick={() => deleteBackup(backup.id, backup.locked)}
                                        disabled={!can('server.backups.manage', serverId)}
                                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed" 
                                        title={!can('server.backups.manage', serverId) ? 'Insufficient Permissions' : 'Delete Backup'}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    
                    {!loading && filteredBackups.length === 0 && (
                        <div className="text-center py-16 text-muted-foreground animate-in fade-in zoom-in-95">
                            <ArchiveRestore size={48} className="mx-auto mb-4 opacity-20" />
                            {backups.length === 0 ? (
                                <>
                                    <p className="font-bold text-foreground">No snapshots found.</p>
                                    <p className="text-xs mt-1">Create your first backup to secure your server.</p>
                                </>
                            ) : (
                                <>
                                    <p className="font-bold text-foreground">No matches found.</p>
                                    <p className="text-xs mt-1">Try clearing your filters to see all archives.</p>
                                    <button onClick={() => setFilter('ALL')} className="text-primary text-xs mt-3 hover:underline font-bold">Show All Backups</button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BackupManager;
