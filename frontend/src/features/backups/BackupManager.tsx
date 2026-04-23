
import React, { useState, useMemo, useEffect } from 'react';
import { Backup } from '@shared/types';
import { 
    ArchiveRestore, Plus, Clock, HardDrive, Lock, Unlock, 
    Trash2, RotateCcw, Download, ShieldCheck, Loader2, 
    Cloud, FileBox, AlertTriangle, Check, X, Filter, Save,
    ChevronLeft, ChevronRight
} from 'lucide-react';
import { useToast } from '../ui/Toast';
import { API } from '@core/services/api';
import { socketService } from '@core/services/socket';
import { useServers } from '@features/servers/context/ServerContext';
import { usePermissions } from '@features/auth/hooks/usePermissions';
import { GlobalSettings } from '@shared/types';
import { motion, AnimatePresence } from 'framer-motion';
import AccessDenied from '@features/auth/components/AccessDenied';
import { CloudDestinationsWidget } from './components/CloudDestinationsWidget';
import { useConfirm } from '../ui/hooks/useConfirm';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface BackupManagerProps {
    serverId: string;
}

const BackupManager: React.FC<BackupManagerProps> = ({ serverId }) => {
    const { t } = useTranslation();
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
    const [maxStorage, setMaxStorage] = useState(10); // GB Default
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;

    const { backups: globalBackups, refreshServerData, loading, servers } = useServers();
    const backups = globalBackups[serverId] || [];
    const backupCount = backups.length; // Stable primitive for dependency tracking
    const currentServer = servers?.[serverId];

    // One-time mount: initial data fetch + socket listeners
    useEffect(() => {
        if (!globalBackups[serverId]) {
            refreshServerData(serverId);
        }

        // Check Auto-Backup Status
        API.getSchedules(serverId).then(schedules => {
            const exists = schedules.some((s: any) => s.id === 'auto-backup-2h' && s.isActive);
            setIsAutoBackupEnabled(exists);
        });

        // Load Global Storage Limit
        API.getGlobalSettings().then(settings => {
            if (settings?.app?.backupLimitGB) {
                setMaxStorage(settings.app.backupLimitGB);
            }
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
    }, [serverId]);

    // Reset pagination on server or filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [serverId, filter]);

    const fetchBackups = async () => {
        await refreshServerData(serverId);
    };

    // Computed Stats
    const totalUsage = useMemo(() => {
        const totalBytes = backups.reduce((sum, b) => sum + (b.size || 0), 0);
        return (totalBytes / (1024 * 1024 * 1024)).toFixed(2); // Convert to GB
    }, [backups]);

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

    const totalPages = Math.ceil(filteredBackups.length / pageSize);
    const paginatedBackups = useMemo(() => {
        return filteredBackups.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    }, [filteredBackups, currentPage]);

    // Actions
    const startCreation = () => {
        setNewBackupName(`Backup-${new Date().toLocaleDateString().replace(/\//g, '-')}`);
        setCreationState('CONFIG');
    };

    const handleQuickBackup = async () => {
        if (!can('server.backups.manage', serverId)) {
            addToast('error', t('backups.insufficient_permissions'), t('backups.backups_permissions_desc'));
            return;
        }
        setCreationState('CREATING');
        setProgress(0);
        
        try {
            addToast('info', t('backups.preparing_backup'), t('backups.flushing_data'));
            const quickName = `Quick-${new Date().toLocaleDateString().replace(/\//g, '-')}-${new Date().toLocaleTimeString('en-US', { hour12: false }).replace(/:/g, '')}`;
            await API.createBackup(serverId, quickName, false);
            addToast('success', t('backups.snapshot_created'), t('backups.quick_backup_success'));
            await fetchBackups();
        } catch (e: any) {
            addToast('error', t('backups.backup_failed'), e.message || t('backups.backup_failed'));
        } finally {
            setCreationState('IDLE');
            setProgress(0);
        }
    };

    const confirmCreation = async () => {
        if (!can('server.backups.manage', serverId)) {
            addToast('error', t('backups.insufficient_permissions'), t('backups.backups_permissions_desc'));
            return;
        }
        setCreationState('CREATING');
        setProgress(0);
        
        try {
            // The backend now waits 2s for save-all, so we show it in UI
            addToast('info', t('backups.preparing_backup'), t('backups.flushing_data'));
            await API.createBackup(serverId, newBackupName, worldOnlyBackup);
            addToast('success', t('backups.snapshot_created'), t('backups.backup_success'));
            await fetchBackups();
        } catch (e: any) {
            addToast('error', t('backups.backup_failed'), e.message || t('backups.backup_failed'));
        } finally {
            setCreationState('IDLE');
            setProgress(0);
        }
    };

    const toggleLock = async (id: string) => {
        if (!can('server.backups.manage', serverId)) {
            addToast('error', t('backups.insufficient_permissions'), t('backups.backups_permissions_desc'));
            return;
        }
        setPendingLockIds(prev => new Set(prev).add(id));
        try {
            const res = await API.toggleBackupLock(serverId, id);
            await refreshServerData(serverId); // Refresh context
            addToast('success', res.locked ? t('backups.snapshot_locked') : t('backups.snapshot_unlocked'), res.locked ? t('backups.backup_locked_safe') : t('backups.backup_unlocked_desc'));
        } catch (e) {
            addToast('error', t('common.action_failed'), t('backups.backup_locked_title'));
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
            addToast('error', t('backups.insufficient_permissions'), t('backups.backups_permissions_desc'));
            return;
        }
        if (locked) {
            addToast('error', t('backups.backup_locked_title'), t('backups.unlock_before_delete'));
            return;
        }
 
        const isConfirmed = await requestConfirm({
            title: t('backups.delete_backup_title'),
            description: t('backups.delete_backup_confirm'),
            confirmText: t('common.delete'),
            cancelText: t('common.cancel')
        });

        if (isConfirmed) {
            setDeletedBackupIds(prev => new Set(prev).add(id));
            try {
                await API.deleteBackup(serverId, id);
                addToast('info', t('backups.backup_deleted'), t('backups.archive_removed'));
                await fetchBackups();
            } catch (e) {
                setDeletedBackupIds(prev => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
                addToast('error', t('backups.delete_failed'), t('backups.delete_failed'));
            }
        }
    };

    const handleRestore = (id: string) => {
        setRestoreId(id);
    };

    const confirmRestore = async () => {
        if (!restoreId) return;
        if (!can('server.backups.manage', serverId)) {
            addToast('error', t('backups.insufficient_permissions'), t('backups.backups_permissions_desc'));
            return;
        }
        addToast('warning', t('backups.restoration_started'), t('backups.server_stopping_restore'));
        
        try {
            await API.restoreBackup(serverId, restoreId, restoreWorldOnly);
            addToast('success', t('backups.restoration_complete'), t('backups.server_reverted_desc', { scope: restoreWorldOnly ? t('backups.world_only').toLowerCase() : t('backups.full_server').toLowerCase() }));
            setRestoreId(null);
            setRestoreWorldOnly(false);
        } catch (e) {
            addToast('error', t('backups.restore_failed'), t('backups.restore_failed'));
            setRestoreId(null);
        }
    };

    if (!can('server.backups.read', serverId)) {
        return (
            <AccessDenied 
                title={t('backups.backup_access_restricted')}
                description={t('backups.backups_permissions_desc')}
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
                            <h2 className="text-xl font-bold">{t('backups.confirm_restoration')}</h2>
                        </div>
                            <p className="text-muted-foreground text-sm mb-6">
                                <span dangerouslySetInnerHTML={{ __html: t('backups.confirm_restore_desc', { name: backups.find(b => b.id === restoreId)?.description || backups.find(b => b.id === restoreId)?.filename || t('backups.unknown_backup') }) }} />
                                <br /><br />
                                <span className="text-rose-400">
                                    {restoreWorldOnly 
                                        ? t('backups.world_restore_warning') 
                                        : t('backups.full_restore_warning')}
                                </span>
                            </p>

                            <div className="mb-6 p-4 bg-secondary/20 rounded-xl flex items-center justify-between border border-border/40">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/80">{t('backups.selective_recovery')}</span>
                                    <span className="text-xs font-bold text-foreground">{t('backups.restore_world_data_only')}</span>
                                    <span className="text-[10px] text-muted-foreground italic mt-0.5">{t('backups.retain_current_note')}</span>
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
                                    {t('common.cancel')}
                                </button>
                                <button 
                                    onClick={confirmRestore}
                                    className="flex-1 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-rose-900/20"
                                >
                                    <RotateCcw size={16} /> {restoreWorldOnly ? t('backups.restore_world') : t('backups.full_restore')}
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
                            <h2 className="text-lg font-bold">{t('common.backups')}</h2>
                            <p className="text-xs text-muted-foreground">{t('backups.manage_restoration')}</p>
                        </div>
                    </div>

                    <AnimatePresence mode="wait">
                        {creationState === 'IDLE' && (
                            <motion.div 
                                key="btn-group"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="flex gap-3"
                            >
                                <button 
                                    onClick={handleQuickBackup}
                                    disabled={!can('server.backups.manage', serverId)}
                                    title={!can('server.backups.manage', serverId) ? t('common.insufficient_permissions') : t('backups.quick_backup_tooltip')}
                                    className={`flex-1 py-4 border-2 border-dashed border-emerald-500/30 rounded-xl transition-all flex flex-col items-center justify-center gap-2 group ${
                                        can('server.backups.manage', serverId)
                                        ? 'text-emerald-500 hover:text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/10'
                                        : 'opacity-50 cursor-not-allowed text-zinc-600 border-border'
                                    }`}
                                >
                                    <Save size={24} className={can('server.backups.manage', serverId) ? "group-hover:scale-110 transition-transform" : ""} />
                                    <span className="font-medium text-sm">{t('backups.quick_backup')}</span>
                                </button>
                                <button 
                                    onClick={startCreation}
                                    disabled={!can('server.backups.manage', serverId)}
                                    title={!can('server.backups.manage', serverId) ? t('common.insufficient_permissions') : t('backups.advanced_backup_tooltip')}
                                    className={`flex-1 py-4 border-2 border-dashed border-border rounded-xl transition-all flex flex-col items-center justify-center gap-2 group ${
                                        can('server.backups.manage', serverId)
                                        ? 'text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-secondary/20'
                                        : 'opacity-50 cursor-not-allowed text-zinc-600'
                                    }`}
                                >
                                    <Plus size={24} className={can('server.backups.manage', serverId) ? "group-hover:scale-110 transition-transform" : ""} />
                                    <span className="font-medium text-sm">{t('backups.advanced')}</span>
                                </button>
                            </motion.div>
                        )}

                        {creationState === 'CONFIG' && (
                            <motion.div 
                                key="config"
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                className="space-y-4"
                            >
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground uppercase">{t('backups.backup_name_label')}</label>
                                    <input 
                                        autoFocus
                                        type="text" 
                                        value={newBackupName} 
                                        onChange={(e) => setNewBackupName(e.target.value)}
                                        className="w-full mt-1.5 bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                        placeholder={t('backups.backup_name_placeholder')}
                                    />
                                </div>

                                {/* World Data Only Toggle */}
                                <div className="flex items-center justify-between p-3 bg-muted/50 rounded border border-border">
                                    <div>
                                        <div className="font-semibold text-sm">{t('backups.world_data_only')}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {t('backups.world_data_only_desc')}
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
                                    <button onClick={() => setCreationState('IDLE')} className="flex-1 py-2 text-xs font-medium hover:bg-secondary rounded-lg transition-colors">{t('common.cancel')}</button>
                                    <button 
                                        onClick={confirmCreation} 
                                        disabled={!can('server.backups.manage', serverId)}
                                        className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        <Save size={14} /> {t('backups.start_backup')}
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
                                    <h3 className="font-semibold text-sm">{t('backups.compressing_world')}</h3>
                                    <p className="text-xs text-muted-foreground">{t('backups.compressing_desc')}</p>
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
                            <HardDrive size={16} className="text-muted-foreground" /> {t('backups.storage_usage')}
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
                            <div className="w-2 h-2 rounded-full bg-emerald-500/80"></div> {t('backups.manual')}
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-blue-500/80"></div> {t('backups.scheduled')}
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-secondary"></div> {t('backups.free')}
                        </div>
                    </div>
                </div>


                {/* Automation Card */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-violet-500/10 text-violet-500 rounded-lg"><Clock size={20} /></div>
                        <div>
                            <h2 className="text-lg font-bold">{t('backups.automation')}</h2>
                            <p className="text-xs text-muted-foreground">{t('backups.scheduled_tasks')}</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border">
                        <div>
                            <h4 className="font-medium text-sm text-foreground">{t('backups.auto_backup_label', { mode: autoBackupWorldOnly ? `(${t('backups.world_only')})` : `(${t('backups.full_server')})` })}</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">{t('backups.every_2_hours')}</p>
                        </div>
                        <button
                             onClick={async () => {
                                 if (!can('server.backups.manage', serverId)) {
                                     addToast('error', t('common.access_denied'), t('backups.automation_perm_desc'));
                                     return;
                                 }
                                 try {
                                     if (isAutoBackupEnabled) {
                                         await API.deleteSchedule(serverId, 'auto-backup-2h');
                                         addToast('info', t('backups.auto_backup_disabled_title'), t('backups.auto_backup_disabled_desc'));
                                         setIsAutoBackupEnabled(false);
                                     } else {
                                         await API.createSchedule(serverId, {
                                             id: 'auto-backup-2h',
                                             name: t('backups.auto_backup_label_short'),
                                             cron: '0 */2 * * *',
                                             command: 'backup',
                                             isActive: true
                                         });
                                         addToast('success', t('backups.auto_backup_enabled_title'), t('backups.auto_backup_enabled_desc'));
                                         setIsAutoBackupEnabled(true);
                                     }
                                 } catch (e) {
                                     addToast('error', t('common.action_failed'), t('common.operation_failed'));
                                 }
                             }}
                             disabled={!can('server.backups.manage', serverId)}
                             title={!can('server.backups.manage', serverId) ? t('common.insufficient_permissions') : ''}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${isAutoBackupEnabled ? 'bg-primary' : 'bg-secondary'} ${!can('server.backups.manage', serverId) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <span className="sr-only">{t('backups.enable_auto_backup')}</span>
                             <div className={`h-4 w-4 transform rounded-full bg-white transition-transform ${isAutoBackupEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    {/* Automated Backup Mode Toggle */}
                    <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border mt-3">
                        <div>
                            <h4 className="font-medium text-sm text-foreground">{t('backups.automated_backup_mode')}</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {autoBackupWorldOnly 
                                    ? t('backups.world_only_mode_desc') 
                                    : t('backups.full_server_mode_desc')}
                            </p>
                        </div>
                        <button
                             onClick={async () => {
                                 if (!can('server.backups.manage', serverId)) {
                                     addToast('error', t('common.access_denied'), t('backups.automation_perm_desc'));
                                     return;
                                 }
                                 try {
                                     const newValue = !autoBackupWorldOnly;
                                     await API.updateServer(serverId, {
                                         backupConfig: { worldOnly: newValue }
                                     });
                                     setAutoBackupWorldOnly(newValue);
                                     await refreshServerData(serverId);
                                     addToast('success', t('backups.preference_saved'), t('backups.auto_backup_pref_desc', { mode: newValue ? t('backups.world_only').toLowerCase() : t('backups.full_server').toLowerCase() }));
                                 } catch (e) {
                                     addToast('error', t('backups.update_failed'), t('backups.save_pref_failed'));
                                 }
                             }}
                             disabled={!can('server.backups.manage', serverId)}
                             title={!can('server.backups.manage', serverId) ? t('common.insufficient_permissions') : ''}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${autoBackupWorldOnly ? 'bg-primary' : 'bg-secondary'} ${!can('server.backups.manage', serverId) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <span className="sr-only">{t('backups.toggle_auto_backup_mode')}</span>
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
                        <span>{t('backups.archives')}</span>
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
                                <p>{t('backups.loading_backups')}</p>
                            </div>
                        ) : paginatedBackups.map((backup) => (
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
                                            <span className="flex items-center gap-1" title={t('backups.created_at')}><Clock size={10} /> {new Date(backup.createdAt).toLocaleString()}</span>
                                            <span className="w-1 h-1 bg-border rounded-full"></span>
                                            <span title={t('files.size')}>{(backup.size / 1024 / 1024).toFixed(2)} MB</span>
                                            {backup.scope === 'world' && (
                                                <>
                                                    <span className="w-1 h-1 bg-border rounded-full"></span>
                                                    <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-500/10 text-blue-500 rounded uppercase">
                                                        {t('backups.world_only')}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 w-full sm:w-auto justify-end border-t sm:border-t-0 border-border pt-3 sm:pt-0">
                                    <button 
                                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed" 
                                        title={!can('server.files.read', serverId) ? t('backups.insufficient_permissions') : t('backups.download_archive')}
                                        aria-label={t('backups.download_archive')}
                                        disabled={!can('server.files.read', serverId)}
                                        onClick={() => API.downloadBackup(serverId, backup.id)}
                                    >
                                        <Download size={16} />
                                    </button>

                                    <button 
                                        onClick={() => toggleLock(backup.id)}
                                        disabled={pendingLockIds.has(backup.id) || !can('server.backups.manage', serverId)}
                                        className={`p-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${backup.locked ? 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`} 
                                        title={!can('server.backups.manage', serverId) ? t('backups.insufficient_permissions') : (backup.locked ? t('backups.unlock_snapshot') : t('backups.lock_snapshot'))}
                                        aria-label={backup.locked ? t('backups.unlock_snapshot') : t('backups.lock_snapshot')}
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
                                        title={!can('server.backups.manage', serverId) ? t('backups.insufficient_permissions') : t('backups.restore_server')}
                                        aria-label={t('backups.restore_server')}
                                    >
                                        <RotateCcw size={16} />
                                    </button>
                                    
                                    <button 
                                        onClick={() => deleteBackup(backup.id, backup.locked)}
                                        disabled={!can('server.backups.manage', serverId)}
                                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed" 
                                        title={!can('server.backups.manage', serverId) ? t('backups.insufficient_permissions') : t('backups.delete_backup_title')}
                                        aria-label={t('backups.delete_backup_title')}
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
                                    <p className="font-bold text-foreground">{t('backups.no_snapshots_found')}</p>
                                    <p className="text-xs mt-1">{t('backups.create_first_backup')}</p>
                                </>
                            ) : (
                                <>
                                    <p className="font-bold text-foreground">{t('backups.no_matches_found')}</p>
                                    <p className="text-xs mt-1">{t('backups.try_clearing_filters')}</p>
                                    <button onClick={() => setFilter('ALL')} className="text-primary text-xs mt-3 hover:underline font-bold">{t('backups.show_all_backups')}</button>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="p-4 border-t border-border bg-muted/5 flex items-center justify-between">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            {t('backups.page_info', { current: currentPage, total: totalPages })}
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-2 border border-border rounded-lg hover:bg-muted disabled:opacity-20 transition-all font-bold text-xs flex items-center gap-2"
                            >
                                <ChevronLeft size={16} /> {t('backups.previous')}
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-2 border border-border rounded-lg hover:bg-muted disabled:opacity-20 transition-all font-bold text-xs flex items-center gap-2"
                            >
                                {t('backups.next')} <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
            <ConfirmDialog 
                isOpen={isConfirmOpen}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
                {...confirmConfig}
            />
        </div>
    );
};

export default BackupManager;
