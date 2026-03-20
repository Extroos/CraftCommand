import React, { useState, useEffect } from 'react';
import { API } from '@core/services/api';
import { AuditLog as AuditLogType, AuditAction } from '@shared/types';
import { useToast } from '../ui/Toast';
import { useUser } from '@features/auth/context/UserContext';
import { Clock, User, Activity, Search, Filter, Shield } from 'lucide-react';
import { usePermissions } from './hooks/usePermissions';
import { motion } from 'framer-motion';
import AccessDenied from './components/AccessDenied';



const AuditLog: React.FC = () => {
    const [logs, setLogs] = useState<AuditLogType[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [filterAction, setFilterAction] = useState<string>('');
    const [filterUser, setFilterUser] = useState<string>('');
    const [search, setSearch] = useState<string>('');
    const [page, setPage] = useState(0);
    const limit = 20;

    const { user } = useUser();
    const { addToast } = useToast();
    const { can } = usePermissions();
    const canViewAudit = can('system.audit.view');

    useEffect(() => {
        if (canViewAudit) {
            const timer = setTimeout(() => loadLogs(), 300);
            return () => clearTimeout(timer);
        }
    }, [filterAction, filterUser, search, page, canViewAudit]);

    const loadLogs = async () => {
        setIsLoading(true);
        try {
            const data = await API.getAuditLogs({
                limit,
                offset: page * limit,
                action: filterAction || undefined,
                userId: filterUser || undefined,
                search: search || undefined
            });
            
            // Robust fallback for transition period or different data shapes
            const finalLogs = data?.logs || (Array.isArray(data) ? data : []);
            const finalTotal = data?.total || (Array.isArray(data) ? data.length : 0);
            
            setLogs(finalLogs);
            setTotal(finalTotal);
        } catch (e: any) {
            addToast('error', 'Audit Log', e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const formatDate = (ts: number) => {
        return new Intl.DateTimeFormat('en-US', {
            month: 'short', day: 'numeric',
            hour: 'numeric', minute: 'numeric', second: 'numeric'
        }).format(new Date(ts));
    };

    const formatAction = (action: string) => {
        return action.replace(/_/g, ' ');
    };

    const getActionColor = (action: string) => {
        if (action.includes('FAIL') || action.includes('DELETE')) return 'text-rose-500 bg-rose-500/10';
        if (action.includes('CREATE') || action.includes('SUCCESS')) return 'text-emerald-500 bg-emerald-500/10';
        if (action.includes('UPDATE')) return 'text-amber-500 bg-amber-500/10';
        return 'text-blue-500 bg-blue-500/10';
    };

    const getSmartDetails = (log: AuditLogType) => {
        const meta = log.metadata;
        if (!meta) return '-';

        const action = log.action;
        
        try {
            if (action === 'PERMISSION_DENIED') {
                const perm = meta.permission || 'unknown action';
                return `Access Denied: ${perm.replace(/\./g, ' ')}`;
            }

            if (action === 'FILE_EDIT') return `Modified: ${meta.path || 'unknown file'}`;
            if (action === 'FOLDER_CREATE') return `Created Directory: ${meta.path}`;
            if (action === 'FILE_UPLOAD') return `Uploaded: ${meta.filename} to ${meta.path}`;
            if (action === 'FILE_EXTRACT') return `Extracted: ${meta.path}`;
            if (action === 'FILE_MOVE') return `Moved: ${meta.source} -> ${meta.dest}`;
            if (action === 'FILE_COPY') return `Copied: ${meta.source} -> ${meta.dest}`;
            if (action === 'FILE_COMPRESS') return `Compressed: ${meta.archive} (${meta.count} items)`;
            if (action === 'FILE_DELETE_BULK') return `Deleted ${meta.count} files/folders`;
            if (action === 'FILE_DOWNLOAD') return `Downloaded: ${meta.path}`;
            
            if (action === 'EULA_ACCEPT') return 'Accepted Minecraft EULA';
            
            if (action === 'LOGIN_SUCCESS') return `IP: ${log.ip || 'Unknown'}`;
            if (action === 'LOGIN_FAIL') return `Failed attempt from ${log.ip || 'Unknown'}`;

            if (action.includes('PLUGIN_')) {
                const name = meta.pluginName || meta.pluginId || 'Unknown plugin';
                if (action === 'PLUGIN_INSTALL') return `Installed: ${name} (${meta.source})`;
                if (action === 'PLUGIN_UNINSTALL') return `Uninstalled: ${name}`;
                if (action === 'PLUGIN_TOGGLE') return `${meta.enabled ? 'Enabled' : 'Disabled'}: ${name}`;
                if (action === 'PLUGIN_UPDATE') return `Updated: ${name} to ${meta.version}`;
                if (action === 'PLUGIN_BULK_UPDATE') return `Bulk updated ${meta.count} plugins`;
                if (action === 'PLUGIN_CONFIG_SAVE') return `Saved Config: ${meta.path} (${name})`;
            }

            if (action.includes('MAP_')) {
                if (action === 'MAP_INSTALL') return 'Installed Dynmap Integration';
                if (action === 'MAP_VERIFY') return 'Verified Map Integrity';
                if (action === 'MAP_RENDER') return `Triggered Render: ${meta.mode} (Radius: ${meta.radius})`;
            }

            if (action.includes('BACKUP_')) {
                if (action === 'BACKUP_CREATE') return `Created Backup: ${meta.backupId.slice(0, 8)}`;
                if (action === 'BACKUP_DELETE') return `Deleted Backup: ${meta.backupId.slice(0, 8)}`;
                if (action === 'BACKUP_LOCK') return `Locked Backup: ${meta.backupId.slice(0, 8)}`;
                if (action === 'BACKUP_UNLOCK') return `Unlocked Backup: ${meta.backupId.slice(0, 8)}`;
                if (action === 'BACKUP_CLOUD_ADD') return `Added Cloud Dest: ${meta.name} (${meta.provider})`;
                if (action === 'BACKUP_CLOUD_REMOVE') return `Removed Cloud Dest: ${meta.name}`;
            }

            if (action.includes('SCHEDULE_')) {
                if (action === 'SCHEDULE_CREATE') return `Created Schedule: ${meta.taskName} (${meta.type})`;
                if (action === 'SCHEDULE_UPDATE') return `Updated Schedule: ${meta.taskName}`;
                if (action === 'SCHEDULE_DELETE') return `Deleted Schedule`;
            }

            if (action.includes('PROXY_') || action === 'DDNS_UPDATE') {
                if (action === 'PROXY_LINK') return `Linked Proxy to Server: ${meta.alias}`;
                if (action === 'PROXY_UNLINK') return `Unlinked Proxy from Server`;
                if (action === 'DDNS_UPDATE') return `Updated DDNS: ${meta.status?.success ? 'Success' : 'Failed'}`;
                if (action === 'PROXY_INSTALL') return `Installed Proxy Suite`;
            }

            if (action.includes('PLAYER_')) {
                const p = meta.playerName || 'Unknown player';
                if (action === 'PLAYER_KICK') return `Kicked: ${p} (${meta.reason || 'No reason'})`;
                if (action === 'PLAYER_OP') return `Opped: ${p}`;
                if (action === 'PLAYER_DEOP') return `De-opped: ${p}`;
                if (action === 'PLAYER_WHITELIST_ADD') return `Whitelisted: ${p}`;
                if (action === 'PLAYER_WHITELIST_REMOVE') return `Un-whitelisted: ${p}`;
                if (action === 'PLAYER_BAN') return `Banned: ${p}`;
                if (action === 'PLAYER_PARDON') return `Pardoned: ${p}`;
            }

            if (action.includes('USER_')) {
                if (meta.email) return `Target: ${meta.email}`;
                if (meta.role) return `Role set to ${meta.role}`;
            }

            if (action.includes('SERVER_')) {
                if (action === 'SERVER_RESTORE') return `Restored Backup: ${meta.backupId.slice(0, 8)} ${meta.worldOnly ? '(World Only)' : ''}`;
                if (meta.name) return `Server: ${meta.name}`;
                if (meta.port) return `Port: ${meta.port}`;
            }

            if (action === 'SYSTEM_SETTINGS_UPDATE') {
                const keys = Object.keys(meta).join(', ');
                return `Updated: ${keys}`;
            }

            // Fallback for simple objects
            if (typeof meta === 'object' && Object.keys(meta).length <= 2) {
                return JSON.stringify(meta).replace(/["{}]/g, '').replace(/:/g, ': ');
            }
        } catch (e) {
            // Silently fall back to JSON on error
        }

        return JSON.stringify(meta).slice(0, 60) + (JSON.stringify(meta).length > 60 ? '...' : '');
    };

    if (!canViewAudit) {
        return (
            <AccessDenied 
                title="Audit Logs Restricted"
                description="You do not have the required permissions to view the system audit logs. Please contact the system owner for elevation."
            />
        );
    }

    return (
        <div className="h-[calc(100vh-140px)] flex flex-col gap-6 font-sans">
            <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 bg-secondary/50 p-1.5 rounded-lg border border-border min-w-[200px] flex-1">
                    <Search size={14} className="ml-2 text-muted-foreground" />
                    <input 
                        type="text"
                        placeholder="Search logs (metadata, path, etc)..."
                        className="bg-transparent border-none text-xs focus:ring-0 w-full"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                    />
                </div>

                <div className="flex items-center gap-2 bg-secondary/50 p-1.5 rounded-lg border border-border">
                    <User size={14} className="ml-2 text-muted-foreground" />
                    <input 
                        type="text"
                        placeholder="User Email..."
                        className="bg-transparent border-none text-xs focus:ring-0 w-32"
                        value={filterUser}
                        onChange={(e) => { setFilterUser(e.target.value); setPage(0); }}
                    />
                </div>

                <div className="flex items-center gap-2 bg-secondary/50 p-1.5 rounded-lg border border-border">
                    <Filter size={14} className="ml-2 text-muted-foreground" />
                    <select 
                        className="bg-transparent border-none text-xs focus:ring-0 cursor-pointer pr-8 text-foreground"
                        style={{ backgroundColor: 'var(--secondary)' }}
                        value={filterAction}
                        onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
                    >
                        <option value="" style={{ backgroundColor: '#1a1a1a', color: 'white' }}>All Actions</option>
                        <option value="LOGIN_SUCCESS" style={{ backgroundColor: '#1a1a1a', color: 'white' }}>Login Success</option>
                        <option value="LOGIN_FAIL" style={{ backgroundColor: '#1a1a1a', color: 'white' }}>Login Fail</option>
                        <option value="SERVER_START" style={{ backgroundColor: '#1a1a1a', color: 'white' }}>Server Start</option>
                        <option value="SERVER_STOP" style={{ backgroundColor: '#1a1a1a', color: 'white' }}>Server Stop</option>
                        <option value="FILE_EDIT" style={{ backgroundColor: '#1a1a1a', color: 'white' }}>File Edits</option>
                        <option value="USER_UPDATE" style={{ backgroundColor: '#1a1a1a', color: 'white' }}>User Management</option>
                        <option value="SERVER_CREATE" style={{ backgroundColor: '#1a1a1a', color: 'white' }}>Server Creation</option>
                    </select>
                </div>
                
                <div className="ml-auto flex items-center gap-3">
                    <div className="text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded border border-border">
                        Total: <span className="text-foreground font-bold">{total}</span>
                    </div>
                    <button onClick={loadLogs} className="text-[10px] text-muted-foreground hover:text-foreground uppercase tracking-widest font-bold">Refresh</button>
                </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 relative overflow-hidden group shadow-sm">
                <div className="overflow-x-auto h-full">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted text-xs uppercase text-muted-foreground font-medium sticky top-0 border-b border-border">
                            <tr>
                                <th className="px-4 py-3">Time</th>
                                <th className="px-4 py-3">User</th>
                                <th className="px-4 py-3">Action</th>
                                <th className="px-4 py-3">Target</th>
                                <th className="px-4 py-3">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                            {isLoading ? (
                                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading logs...</td></tr>
                            ) : (logs?.length || 0) === 0 ? (
                                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No logs found.</td></tr>
                            ) : logs?.map((log) => (
                                <tr key={log.id} className="hover:bg-secondary/20 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground font-mono text-xs">
                                        {formatDate(log.timestamp)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs">
                                                {log.userEmail?.[0].toUpperCase() || '?'}
                                            </div>
                                            <span className="truncate max-w-[150px]" title={log.userEmail}>{log.userEmail || log.userId}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${getActionColor(log.action)}`}>
                                            {formatAction(log.action)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                                        {log.resourceId || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground text-xs font-mono truncate max-w-[200px]" title={JSON.stringify(log.metadata, null, 2)}>
                                        {getSmartDetails(log)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                
                {/* Pagination */}
                <div className="mt-4 flex items-center justify-between px-2 pt-4 border-t border-border/40">
                    <div className="text-[10px] text-muted-foreground">
                        Showing <span className="font-bold text-foreground">{logs?.length || 0}</span> of <span className="font-bold text-foreground">{total}</span> entries
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            disabled={page === 0 || isLoading}
                            onClick={() => setPage(p => p - 1)}
                            className="px-3 py-1 text-[10px] bg-secondary border border-border rounded hover:bg-muted disabled:opacity-50 transition-colors uppercase font-bold"
                        >
                            Previous
                        </button>
                        <div className="text-[10px] items-center gap-1 flex">
                            Page <span className="font-bold">{page + 1}</span> of <span className="font-bold">{Math.ceil(total / limit) || 1}</span>
                        </div>
                        <button 
                            disabled={(page + 1) * limit >= total || isLoading}
                            onClick={() => setPage(p => p + 1)}
                            className="px-3 py-1 text-[10px] bg-secondary border border-border rounded hover:bg-muted disabled:opacity-50 transition-colors uppercase font-bold"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AuditLog;
