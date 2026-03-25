
import React from 'react';
import { Database, Plus, Trash2, Eye, Loader2, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { STAGGER_ITEM } from '../../styles/motion';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/hooks/useConfirm';
import { API } from '@core/services/api';
import CreateDatabaseModal from './components/CreateDatabaseModal';
import DatabaseCredentialsModal from './components/DatabaseCredentialsModal';
import { usePermissions } from '../auth/hooks/usePermissions';
import { AnimatePresence } from 'framer-motion';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface DatabaseManagerProps {
    serverId: string;
}

export const DatabaseManager: React.FC<DatabaseManagerProps> = ({ serverId }) => {
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
            addToast('success', 'Database Online', `Instance ${data.name} has been provisioned.`);
            fetchDatabases();
            return result;
        } catch (e: any) {
            addToast('error', 'Provisioning Failed', e.message || 'Failed to create database.');
            throw e;
        }
    };

    return (
        <motion.div variants={STAGGER_ITEM} className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
                        <Database className="text-primary" size={20} />
                        Database Instances
                    </h2>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-1">Managed SQL & NoSQL Provisioning</p>
                </div>
                {canManageDB && (
                    <button 
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(var(--primary-rgb),0.2)]"
                    >
                        <Plus size={14} /> New Instance
                    </button>
                )}
            </div>

            <div className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-muted/30 border-b border-border/40">
                                <th className="px-4 py-2 text-[9px] font-black text-muted-foreground uppercase tracking-wider">Database</th>
                                <th className="px-4 py-2 text-[9px] font-black text-muted-foreground uppercase tracking-wider">Host</th>
                                <th className="px-4 py-2 text-[9px] font-black text-muted-foreground uppercase tracking-wider">User</th>
                                <th className="px-4 py-2 text-[9px] font-black text-muted-foreground uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={4} className="py-20 text-center">
                                        <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
                                            <Loader2 size={24} className="animate-spin" />
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Synchronizing...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : databases.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="py-16 text-center">
                                        <Database size={32} className="mx-auto text-muted-foreground/10 mb-4" />
                                        <p className="text-[11px] font-bold text-muted-foreground/40 uppercase tracking-widest">No Active Databases Found</p>
                                        <p className="text-[9px] text-muted-foreground/20 mt-1 uppercase">Click "New Instance" to provision one</p>
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
                                                         className="p-1.5 hover:text-primary transition-colors hover:bg-primary/10 rounded" title="View Connection Details"
                                                     >
                                                         <Eye size={12} />
                                                     </button>
                                                 )}
                                                 {canManageDB && (
                                                     <button 
                                                         onClick={async () => {
                                                             const res = await confirm({
                                                                 title: 'Drop Database',
                                                                 description: `Are you sure you want to permanently delete \`${db.name}\`? All data will be lost.`,
                                                                 isDestructive: true
                                                             });
                                                             if (res) {
                                                                 try {
                                                                     await API.deleteDatabase(serverId, db.id);
                                                                     addToast('warning', 'Database Purged', `Instance ${db.name} has been deleted.`);
                                                                     fetchDatabases();
                                                                 } catch (e: any) {
                                                                     const errorMsg = e.response?.data?.error || e.message || 'Failed to delete database.';
                                                                     addToast('error', 'Action Failed', errorMsg);
                                                                 }
                                                             }
                                                         }}
                                                         className="p-1.5 hover:text-rose-500 transition-colors hover:bg-rose-500/10 rounded" 
                                                         title="Delete Instance"
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
                    <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider italic">Passwords are generated during provisioning and sent to the server console.</p>
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
