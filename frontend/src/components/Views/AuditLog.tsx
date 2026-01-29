import React, { useState, useEffect } from 'react';
import { API } from '../../services/api';
import { AuditLog as AuditLogType, AuditAction } from '@shared/types';
import { useToast } from '../UI/Toast';
import { useUser } from '../../context/UserContext';
import { Clock, User, Activity, Search, Filter } from 'lucide-react';
import { motion } from 'framer-motion';



const AuditLog: React.FC = () => {
    const [logs, setLogs] = useState<AuditLogType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterAction, setFilterAction] = useState<string>('');
    const { user } = useUser();
    const { addToast } = useToast();

    useEffect(() => {
        loadLogs();
    }, [filterAction]);

    const loadLogs = async () => {
        setIsLoading(true);
        try {
            const data = await API.getAuditLogs(100, filterAction || undefined);
            setLogs(data);
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

    const formatMetadata = (meta: any) => {
        if (!meta) return '-';
        return JSON.stringify(meta).slice(0, 50) + (JSON.stringify(meta).length > 50 ? '...' : '');
    };

    return (
        <div className="space-y-4 h-full flex flex-col">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 bg-secondary/50 p-1 rounded-lg border border-border/50">
                    <Search size={16} className="ml-2 text-muted-foreground" />
                    <select 
                        className="bg-transparent border-none text-sm focus:ring-0 cursor-pointer"
                        value={filterAction}
                        onChange={(e) => setFilterAction(e.target.value)}
                    >
                        <option value="">All Actions</option>
                        <option value="LOGIN_SUCCESS">Login Success</option>
                        <option value="LOGIN_FAIL">Login Fail</option>
                        <option value="SERVER_START">Server Start</option>
                        <option value="SERVER_STOP">Server Stop</option>
                        <option value="USER_UPDATE">User Update</option>
                    </select>
                </div>
                <button onClick={loadLogs} className="text-xs text-muted-foreground hover:text-foreground">Refresh</button>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden flex-1 shadow-sm">
                <div className="overflow-x-auto h-full">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-secondary/30 text-xs uppercase text-muted-foreground font-medium sticky top-0 backdrop-blur-md">
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
                            ) : logs.length === 0 ? (
                                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No logs found.</td></tr>
                            ) : logs.map((log) => (
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
                                        {formatMetadata(log.metadata)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AuditLog;
