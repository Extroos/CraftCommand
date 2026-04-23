import React from 'react';
import { Database, Plus, Trash2, Eye, Loader2, Info, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { STAGGER_ITEM } from '../../styles/motion';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/hooks/useConfirm';
import { API } from '@core/services/api';
import CreateDatabaseModal from './components/CreateDatabaseModal';
import DatabaseCredentialsModal from './components/DatabaseCredentialsModal';
import { usePermissions } from '../auth/hooks/usePermissions';
import { AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface DatabaseManagerProps {
    serverId: string;
}

export const DatabaseManager: React.FC<DatabaseManagerProps> = ({ serverId }) => {
    const { t } = useTranslation();
    const { addToast } = useToast();
    const { isOpen: isConfirmOpen, config: confirmConfig, confirm, handleConfirm, handleCancel } = useConfirm();
    const { can } = usePermissions();
    const [databases, setDatabases] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [showCreateModal, setShowCreateModal] = React.useState(false);
    const [selectedDbForCreds, setSelectedDbForCreds] = React.useState<any | null>(null);

    const canManageDB = can('server.databases.manage', serverId);
    const canReadDB = can('server.databases.read', serverId);

    const fetchDatabases = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await API.getDatabases(serverId);
            setDatabases(data);
        } catch (e) {
            console.error("Failed to fetch databases", e);
        } finally {
            setIsLoading(false);
        }
    }, [serverId]);

    React.useEffect(() => {
        fetchDatabases();
    }, [fetchDatabases]);

    const handleCreateDb = async (data: { name: string; type: string; host: string }) => {
        try {
            const result = await API.createDatabase(serverId, data);
            addToast('success', t('database_manager.database_online'), t('database_manager.db_provisioned_desc', { name: data.name }));
            fetchDatabases();
            return result;
        } catch (e: any) {
            addToast('error', t('database_manager.provisioning_failed'), e.message || t('database_manager.failed_create_db'));
            throw e;
        }
    };

    return (
        <motion.div variants={STAGGER_ITEM} className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
                        <Database className="text-primary" size={20} />
                        {t('database_manager.instances')}
                    </h2>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-1">{t('database_manager.managed_sql')}</p>
                </div>
                {canManageDB && (
                    <div className="flex items-center gap-2">
                         <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-md">
                            <ShieldCheck size={12} className="text-amber-500" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-amber-500/80">{t('database_manager.virtual_mode_active')}</span>
                        </div>
                        <button 
                            onClick={() => setShowCreateModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(var(--primary-rgb),0.2)]"
                        >
                            <Plus size={14} /> {t('database_manager.new_instance')}
                        </button>
                    </div>
                )}
            </div>

            <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
                <Info size={16} className="text-primary mt-0.5 shrink-0" />
                <div className="space-y-1">
                    <p className="text-[11px] font-black uppercase tracking-wider text-foreground">{t('database_manager.infrastructure_advisory')}</p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed font-medium" dangerouslySetInnerHTML={{ __html: t('database_manager.advisory_long_desc') }} />
                </div>
            </div>

            <div className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-muted/30 border-b border-border/40">
                                <th className="px-4 py-2 text-[9px] font-black text-muted-foreground uppercase tracking-wider">{t('database_manager.db_name')}</th>
                                <th className="px-4 py-2 text-[9px] font-black text-muted-foreground uppercase tracking-wider">{t('database_manager.host')}</th>
                                <th className="px-4 py-2 text-[9px] font-black text-muted-foreground uppercase tracking-wider">{t('database_manager.user')}</th>
                                <th className="px-4 py-2 text-[9px] font-black text-muted-foreground uppercase tracking-wider text-right">{t('common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={4} className="py-20 text-center">
                                        <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
                                            <Loader2 size={24} className="animate-spin" />
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">{t('database_manager.synchronizing')}</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : databases.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="py-16 text-center">
                                        <Database size={32} className="mx-auto text-muted-foreground/10 mb-4" />
                                        <p className="text-[11px] font-bold text-muted-foreground/40 uppercase tracking-widest">{t('database_manager.no_active_databases')}</p>
                                        <p className="text-[9px] text-muted-foreground/20 mt-1 uppercase">{t('database_manager.click_to_provision')}</p>
                                    </td>
                                </tr>
                            ) : (
                                databases.map((db) => (
                                    <tr key={db.id} className="hover:bg-muted/5 transition-colors group">
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-bold text-foreground/80 lowercase">{db.name}</span>
                                                <span className="text-[8px] text-muted-foreground/40 uppercase font-black">{db.type || 'MySQL'}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground/40 font-mono text-[10px]">
                                            {db.host}
                                        </td>
                                        <td className="px-4 py-3 text-primary/70 font-bold font-mono text-[10px]">
                                            {db.username}
                                        </td>
                                         <td className="px-4 py-3 text-right">
                                             <div className="flex items-center justify-end gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
                                                 {canReadDB && (
                                                     <button 
                                                         onClick={() => setSelectedDbForCreds(db)}
                                                         className="p-1.5 hover:text-primary transition-colors hover:bg-primary/10 rounded" title={t('database_manager.view_connection_details')}
                                                     >
                                                         <Eye size={12} />
                                                     </button>
                                                 )}
                                                 {canManageDB && (
                                                     <button 
                                                         onClick={async () => {
                                                             const res = await confirm({
                                                                 title: t('database_manager.drop_database_title'),
                                                                 description: t('database_manager.drop_database_confirm', { name: db.name }),
                                                                 isDestructive: true
                                                             });
                                                             if (res) {
                                                                 try {
                                                                     await API.deleteDatabase(serverId, db.id);
                                                                     addToast('warning', t('database_manager.database_purged'), t('database_manager.db_deleted_desc', { name: db.name }));
                                                                     fetchDatabases();
                                                                 } catch (e: any) {
                                                                     const errorMsg = e.response?.data?.error || e.message || t('database_manager.failed_create_db');
                                                                     addToast('error', t('common.action_failed'), errorMsg);
                                                                 }
                                                             }
                                                         }}
                                                         className="p-1.5 hover:text-rose-500 transition-colors hover:bg-rose-500/10 rounded" 
                                                         title={t('database_manager.delete_instance')}
                                                     >
                                                         <Trash2 size={12} />
                                                     </button>
                                                 )}
                                             </div>
                                         </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="px-4 py-3 bg-muted/10 border-t border-border/40 flex items-center gap-3">
                    <Info size={12} className="text-primary/60" />
                    <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider italic">{t('database_manager.passwords_note')}</p>
                </div>
            </div>

            <AnimatePresence>
                {showCreateModal && (
                    <CreateDatabaseModal 
                        serverId={serverId}
                        onClose={() => setShowCreateModal(false)}
                        onCreate={handleCreateDb}
                    />
                )}
                {selectedDbForCreds && (
                    <DatabaseCredentialsModal 
                        db={selectedDbForCreds}
                        onClose={() => setSelectedDbForCreds(null)}
                    />
                )}
            </AnimatePresence>

            <ConfirmDialog 
                isOpen={isConfirmOpen}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
                {...confirmConfig}
            />
        </motion.div>
    );
};
