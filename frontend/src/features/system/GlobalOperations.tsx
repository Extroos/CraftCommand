import React, { useState, useEffect, useMemo } from 'react';
import { 
    Activity, Server, Network, Cpu, MemoryStick, 
    WifiOff, RefreshCw, Layers, Shield, ExternalLink,
    AlertTriangle, CheckCircle2, Search, Globe, 
    ArrowUpRight, Clock, Box, MoreHorizontal
} from 'lucide-react';
import { useSystem } from '@features/system/context/SystemContext';
import { useServers } from '@features/servers/context/ServerContext';
import { useUser } from '@features/auth/context/UserContext';
import { NodeInfo, ServerConfig, AuditLog as AuditLogType } from '@shared/types';
import { API } from '@core/services/api';
import { useNavigate } from 'react-router-dom';

const GlobalOperations: React.FC = () => {
    const navigate = useNavigate();
    const { nodes, refreshSettings } = useSystem();
    const { servers, stats, refreshServers } = useServers();
    
    const [searchQuery, setSearchQuery] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>('LIST');
    const [fixingIds, setFixingIds] = useState<Record<string, string>>({});
    const [auditLogs, setAuditLogs] = useState<AuditLogType[]>([]);

    const clusterStats = useMemo(() => {
        const totalNodes = Array.isArray(nodes) ? nodes.length : 0;
        const onlineNodes = Array.isArray(nodes) ? nodes.filter(n => n.status === 'ONLINE').length : 0;
        const totalServers = Array.isArray(servers) ? servers.length : 0;
        const onlineServers = Array.isArray(servers) ? servers.filter(s => s.status === 'ONLINE').length : 0;
        
        let totalCpu = 0;
        let totalMemUsed = 0;
        let totalMemTotal = 0;
        
        nodes.forEach(n => {
            if (n.health) {
                totalCpu += n.health.cpu;
                totalMemUsed += n.health.memoryUsed;
                totalMemTotal += n.health.memoryTotal;
            }
        });

        return {
            totalNodes,
            onlineNodes,
            totalServers,
            onlineServers,
            avgCpu: totalNodes > 0 ? (totalCpu / totalNodes).toFixed(1) : 0,
            totalMemUsed: (totalMemUsed / (1024**3)).toFixed(1),
            totalMemTotal: (totalMemTotal / (1024**3)).toFixed(1)
        };
    }, [nodes, servers]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await Promise.all([refreshSettings(), refreshServers(), fetchAuditLogs()]);
        } finally {
            setIsRefreshing(false);
        }
    };

    const fetchAuditLogs = async () => {
        try {
            const data = await API.getAuditLogs({ limit: 12 });
            setAuditLogs(data.logs || []);
        } catch (err) {
            console.error('Failed to fetch audit logs', err);
        }
    };

    useEffect(() => {
        fetchAuditLogs();
    }, []);

    const filteredServers = Array.isArray(servers) ? servers.filter(s => 
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.nodeId?.toLowerCase().includes(searchQuery.toLowerCase())
    ) : [];

    return (
        <div className="space-y-6">
            {/* Minimal Header */}
            <header className="flex justify-between items-center border-b border-border pb-4">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Operations</h1>
                    <p className="text-muted-foreground text-xs">Node cluster and instance lifecycle overview.</p>
                </div>
                
                <div className="flex gap-2">
                    <button 
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="bg-secondary border border-border px-3 py-1.5 rounded text-xs font-medium flex items-center gap-2 hover:bg-secondary/80 disabled:opacity-50"
                    >
                        <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </header>

            {/* High Density Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-card border border-border p-4 rounded-lg shadow-sm">
                    <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-tight flex items-center gap-2">
                        <Globe size={10} /> Cluster Availability
                    </div>
                    <div className="text-xl font-bold mt-1">{((clusterStats.onlineNodes / (clusterStats.totalNodes || 1)) * 100).toFixed(0)}%</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{clusterStats.onlineNodes} of {clusterStats.totalNodes} nodes online</div>
                </div>
                <div className="bg-card border border-border p-4 rounded-lg shadow-sm">
                    <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-tight flex items-center gap-2">
                        <Box size={10} /> Container Density
                    </div>
                    <div className="text-xl font-bold mt-1">{clusterStats.totalServers}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{clusterStats.onlineServers} active instances</div>
                </div>
                <div className="bg-card border border-border p-4 rounded-lg shadow-sm">
                    <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-tight flex items-center gap-2">
                        <Cpu size={10} /> Aggregate Load
                    </div>
                    <div className="text-xl font-bold mt-1">{clusterStats.avgCpu}%</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Average across cluster</div>
                </div>
                <div className="bg-card border border-border p-4 rounded-lg shadow-sm">
                    <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-tight flex items-center gap-2">
                        <Layers size={10} /> Shared Storage
                    </div>
                    <div className="text-xl font-bold mt-1">{clusterStats.totalMemUsed}GB</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Physical RAM utilization</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Node Grid */}
                <div className="lg:col-span-8 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold flex items-center gap-2">
                            <Network size={14} className="text-muted-foreground" /> Infrastructure Nodes
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {nodes.map(node => (
                            <NodeMiniCard 
                                key={node.id} 
                                node={node} 
                                servers={servers.filter(s => s.nodeId === node.id)}
                                onAction={(action) => console.log(`Node ${node.id} action: ${action}`)}
                            />
                        ))}
                    </div>
                </div>

                {/* Health/Dependency Sidebar */}
                <div className="lg:col-span-4 space-y-4">
                    <h2 className="text-sm font-bold flex items-center gap-2">
                        <Shield size={14} className="text-muted-foreground" /> System Health
                    </h2>
                    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
                        <div className="space-y-2">
                            <div className="text-[10px] font-bold text-muted-foreground uppercase">Runtime Conflicts</div>
                            {nodes.filter(n => !n.capabilities?.java || !n.capabilities?.docker).map(node => (
                                <div key={node.id} className="p-3 bg-rose-500/5 rounded border border-rose-500/20 text-xs">
                                    <div className="font-bold flex items-center justify-between">
                                        <span>{node.name}</span>
                                        <AlertTriangle size={12} className="text-rose-500" />
                                    </div>
                                    <div className="text-[10px] text-rose-600 mt-1">
                                        Critically missing: 
                                        {!node.capabilities?.java && <span className="ml-1 font-mono">[java]</span>}
                                        {!node.capabilities?.docker && <span className="ml-1 font-mono">[docker]</span>}
                                    </div>
                                </div>
                            ))}
                            {nodes.every(n => n.capabilities?.java && n.capabilities?.docker) && (
                                <div className="flex items-center gap-2 text-emerald-600 text-xs py-1">
                                    <CheckCircle2 size={12} />
                                    All node runtimes verified
                                </div>
                            )}
                        </div>

                        <div className="pt-2 border-t border-border">
                            <div className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Network Topology</div>
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[10px]">
                                    <span className="text-muted-foreground">Fabric Bridge</span>
                                    <span className="font-mono text-emerald-500">ACTIVE</span>
                                </div>
                                <div className="flex justify-between text-[10px]">
                                    <span className="text-muted-foreground">Public Gateway</span>
                                    <span className="font-mono">{nodes[0]?.host || '0.0.0.0'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Instance Table */}
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-sm font-bold flex items-center gap-2">
                        <Activity size={14} className="text-muted-foreground" /> Live Instance Monitor
                    </h2>
                    <div className="flex gap-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={12} />
                            <input 
                                type="text"
                                placeholder="Search instances..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="bg-secondary/50 border border-border rounded px-8 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 w-48 transition-all"
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-secondary/30 text-muted-foreground font-bold uppercase tracking-tight border-b border-border">
                            <tr>
                                <th className="px-4 py-2.5">Identity</th>
                                <th className="px-4 py-2.5">Status</th>
                                <th className="px-4 py-2.5">Placement</th>
                                <th className="px-4 py-2.5">CPU Util</th>
                                <th className="px-4 py-2.5">Memory</th>
                                <th className="px-4 py-2.5 text-right">Management</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredServers.map(server => (
                                <tr key={server.id} className="hover:bg-secondary/10 transition-colors group">
                                    <td className="px-4 py-3">
                                        <div className="font-bold">{server.name}</div>
                                        <div className="text-[10px] text-muted-foreground font-mono">ID: {server.id.split('-')[0]}</div>
                                    </td>
                                    <td className="px-4 py-3"><StatusBadge status={server.status} /></td>
                                    <td className="px-4 py-3">
                                        <span className="bg-secondary px-1.5 py-0.5 rounded text-[10px] text-muted-foreground font-medium">
                                            {nodes.find(n => n.id === server.nodeId)?.name || 'Local'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono w-10">{(stats[server.id]?.cpu || 0).toFixed(1)}%</span>
                                            <div className="flex-1 max-w-[60px] h-1 bg-secondary rounded-full overflow-hidden">
                                                <div className="h-full bg-primary/40" style={{ width: `${Math.min(100, stats[server.id]?.cpu || 0)}%` }} />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">{server.ram}GB / {server.disk}GB</td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => navigate(`/server/${server.id}/dashboard`)} className="p-1.5 hover:bg-secondary border border-transparent hover:border-border rounded transition-all" title="Open Console">
                                                <ExternalLink size={12} />
                                            </button>
                                            <button className="p-1.5 hover:bg-secondary border border-transparent hover:border-border rounded transition-all">
                                                <MoreHorizontal size={12} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Audit Logs */}
            <div className="space-y-3">
                <h2 className="text-sm font-bold flex items-center gap-2">
                    <Clock size={14} className="text-muted-foreground" /> Infrastructure Audit
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {auditLogs.slice(0, 4).map(log => (
                        <div key={log.id} className="bg-card border border-border p-3 rounded-lg flex items-start gap-3 shadow-sm">
                            <div className="mt-1 w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-bold truncate uppercase tracking-tight">{log.action.replace(/_/g, ' ')}</div>
                                <div className="text-[10px] text-muted-foreground truncate">{log.userEmail || 'System Process'}</div>
                                <div className="text-[9px] text-muted-foreground/60 font-mono mt-1">{new Date(log.timestamp).toLocaleTimeString()}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const NodeMiniCard: React.FC<{ node: NodeInfo; servers: ServerConfig[]; onAction: (a: string) => void }> = ({ node, servers, onAction }) => (
    <div className="bg-card border border-border p-4 rounded-lg space-y-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start">
            <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${node.status === 'ONLINE' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-muted'}`} />
                    <div className="font-bold text-sm">{node.name}</div>
                </div>
                <div className="text-[10px] font-mono text-muted-foreground opacity-70">{node.host}:{node.port}</div>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded border border-border">
                <RefreshCw size={10} /> 42ms
            </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
            <div className="p-2 bg-secondary/30 rounded border border-border/50">
                <div className="text-muted-foreground text-[8px] font-bold uppercase">CPU Load</div>
                <div className="font-mono text-xs font-bold">{node.health?.cpu || 0}%</div>
            </div>
            <div className="p-2 bg-secondary/30 rounded border border-border/50">
                <div className="text-muted-foreground text-[8px] font-bold uppercase">Memory</div>
                <div className="font-mono text-xs font-bold">{(node.health?.memoryUsed / (1024**3) || 0).toFixed(1)}GB</div>
            </div>
            <div className="p-2 bg-secondary/30 rounded border border-border/50">
                <div className="text-muted-foreground text-[8px] font-bold uppercase">Disk I/O</div>
                <div className="font-mono text-xs font-bold">LOW</div>
            </div>
        </div>

        <div className="pt-2 border-t border-border flex justify-between items-center gap-4">
            <div className="flex items-center gap-2 shrink-0">
                <Box size={12} className="text-muted-foreground" />
                <span className="text-[10px] font-bold">{servers.length} Instances</span>
            </div>
            <div className="flex gap-1">
                <button 
                    onClick={() => onAction('RESTART')}
                    className="text-[10px] font-bold bg-secondary hover:bg-border px-2 py-1 rounded transition-colors"
                >
                    Restart
                </button>
                <button 
                    onClick={() => onAction('DIAGNOSTICS')}
                    className="text-[10px] font-bold text-primary hover:underline px-2 py-1"
                >
                    Diagnostics
                </button>
            </div>
        </div>
    </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const colors: any = {
        'ONLINE': 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
        'OFFLINE': 'text-muted-foreground bg-secondary border-border',
        'STARTING': 'text-amber-500 bg-amber-500/10 border-amber-500/20',
        'STOPPING': 'text-rose-500 bg-rose-500/10 border-rose-500/20',
        'CRASHED': 'text-rose-600 bg-rose-600/10 border-rose-600/20',
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-tight ${colors[status] || colors['OFFLINE']}`}>
            {status}
        </span>
    );
};

export default GlobalOperations;
