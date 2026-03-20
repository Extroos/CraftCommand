import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Activity, Server, Network, Cpu, MemoryStick, HardDrive, 
    Wifi, WifiOff, RefreshCw, Layers, Shield, ExternalLink,
    AlertTriangle, CheckCircle2, Search, Filter, Globe, 
    ArrowUpRight, Clock, Wand2, Box
} from 'lucide-react';
import { useSystem } from '@features/system/context/SystemContext';
import { useServers } from '@features/servers/context/ServerContext';
import { useUser } from '@features/auth/context/UserContext';
import { NodeInfo, ServerConfig, NodeStatus, AuditLog as AuditLogType, AppState } from '@shared/types';
import { API } from '@core/services/api';

/**
 * GlobalOperations — Centralized monitoring for distributed clusters
 * 
 * Provides:
 * 1. Cluster-wide health metrics (Aggregate CPU/RAM/Network)
 * 2. Node Grid (Detailed view of each enrolled agent)
 * 3. Unified Instance List (Search across all local and remote servers)
 */
interface GlobalOperationsProps {
    onNavigate?: (state: AppState) => void;
}

const GlobalOperations: React.FC<GlobalOperationsProps> = ({ onNavigate }) => {
    const { nodes, refreshSettings } = useSystem();
    const { servers, stats, refreshServers } = useServers();
    const { user } = useUser();
    
    const [searchQuery, setSearchQuery] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>('GRID');
    const [fixingIds, setFixingIds] = useState<Record<string, string>>({});
    const [auditLogs, setAuditLogs] = useState<AuditLogType[]>([]);

    // Cluster Statistics
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

        const avgCpu = totalNodes > 0 ? (totalCpu / totalNodes).toFixed(1) : 0;
        const memPercent = totalMemTotal > 0 ? (totalMemUsed / totalMemTotal * 100).toFixed(1) : 0;

        return {
            totalNodes,
            onlineNodes,
            totalServers,
            onlineServers,
            avgCpu,
            memPercent,
            totalMemUsed: (totalMemUsed / (1024**3)).toFixed(1), // GB
            totalMemTotal: (totalMemTotal / (1024**3)).toFixed(1) // GB
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
            const data = await API.getAuditLogs({ limit: 8 });
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

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const handleFix = async (nodeId: string, nodeName: string, capability: string) => {
        if (fixingIds[nodeId]) return;
        
        setFixingIds(prev => ({ ...prev, [nodeId]: capability }));
        // Toast logic would go here if useToast was consumed
        
        try {
            await API.fixNodeCapability(nodeId, capability);
            await refreshSettings();
        } catch (err: any) {
            console.error('Fix Failed', err);
        } finally {
            setFixingIds(prev => {
                const updated = { ...prev };
                delete updated[nodeId];
                return updated;
            });
        }
    };

    return (
        <div className="space-y-8 pb-12">
            {/* GOC Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-6">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-3">
                        <Globe className="text-primary" size={24} />
                        Global Operations
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">Real-time orchestration and telemetry for multi-node deployments.</p>
                </div>
                
                <div className="flex items-center gap-2">
                    <button 
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="bg-secondary/50 border border-border hover:bg-secondary text-foreground px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-all"
                    >
                        <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                        Refresh Telemetry
                    </button>
                    <div className="h-6 w-px bg-border mx-2"></div>
                    <div className="flex items-center bg-muted p-1 rounded-lg border border-border">
                         <button 
                            onClick={() => setViewMode('GRID')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'GRID' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                         >
                            <Layers size={16} />
                         </button>
                         <button 
                            onClick={() => setViewMode('LIST')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'LIST' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                         >
                            <Activity size={16} />
                         </button>
                    </div>
                </div>
            </div>

            {/* Cluster Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard 
                    label="Active Nodes" 
                    value={`${clusterStats.onlineNodes}/${clusterStats.totalNodes}`} 
                    sub={`${clusterStats.totalNodes - clusterStats.onlineNodes} Offline`}
                    icon={<Network className="text-blue-500" />}
                    trend={clusterStats.onlineNodes === clusterStats.totalNodes ? 'stable' : 'down'}
                />
                <StatCard 
                    label="Instance Density" 
                    value={clusterStats.onlineServers} 
                    sub={`of ${clusterStats.totalServers} Total`}
                    icon={<Server className="text-emerald-500" />}
                />
                <StatCard 
                    label="Avg CPU Load" 
                    value={`${clusterStats.avgCpu}%`} 
                    sub="Across Cluster"
                    icon={<Cpu className="text-amber-500" />}
                    progress={parseFloat(clusterStats.avgCpu.toString())}
                />
                <StatCard 
                    label="Mem Commitment" 
                    value={`${clusterStats.totalMemUsed} GB`} 
                    sub={`of ${clusterStats.totalMemTotal} GB`}
                    icon={<MemoryStick className="text-violet-500" />}
                    progress={parseFloat(clusterStats.memPercent.toString())}
                />
            </div>

            {/* Advanced Visualization: Heatmap */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
                            <Layers size={16} className="text-muted-foreground" /> Resource Distribution
                        </h2>
                        <div className="flex items-center gap-4 text-[10px] font-medium text-muted-foreground">
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-secondary border border-border"></div> Idle</div>
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-primary/40"></div> Active</div>
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-primary"></div> Heavy</div>
                        </div>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-6 min-h-[200px] flex flex-col justify-center shadow-sm">
                        <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                            {nodes.map(node => (
                                <HeatmapCell key={node.id} node={node} />
                            ))}
                            {nodes.length === 0 && Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="aspect-square bg-secondary/30 rounded-md border border-border/50"></div>
                            ))}
                        </div>
                        {nodes.length > 0 && (
                            <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                                <div className="text-xs text-muted-foreground">
                                    Capacity Utilization
                                </div>
                                <div className="text-xs font-medium text-foreground">
                                    {nodes.filter(n => (n.health?.cpu || 0) > 80).length} High Load
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2">
                        <Shield size={14} /> Environment Health
                    </h2>
                    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                        <div className="space-y-3">
                            {nodes.filter(n => !n.capabilities?.java || !n.capabilities?.docker).length > 0 ? (
                                nodes.filter(n => !n.capabilities?.java || !n.capabilities?.docker).map(node => (
                                    <div key={node.id} className="p-3 bg-secondary/30 rounded-xl border border-border/50 group">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="text-xs font-bold text-foreground">{node.name}</div>
                                            <AlertTriangle size={14} className="text-amber-500" />
                                        </div>
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {!node.capabilities?.java && <span className="text-[10px] bg-red-500/10 text-red-500 border border-red-500/20 px-1.5 py-0.5 rounded">Java Missing</span>}
                                            {!node.capabilities?.docker && <span className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded">Docker Missing</span>}
                                        </div>
                                        <button 
                                            onClick={() => handleFix(node.id, node.name, !node.capabilities?.java ? 'java' : 'docker')}
                                            disabled={!!fixingIds[node.id]}
                                            className="w-full py-2 bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-black uppercase tracking-widest rounded-lg transition-all border border-primary/20 flex items-center justify-center gap-2"
                                        >
                                            {fixingIds[node.id] ? (
                                                <RefreshCw size={12} className="animate-spin" />
                                            ) : (
                                                <Wand2 size={12} />
                                            )}
                                            {fixingIds[node.id] ? 'Fixing...' : 'Resolve Issues'}
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className="py-12 text-center">
                                    <CheckCircle2 size={32} className="mx-auto text-emerald-500/30 mb-3" />
                                    <p className="text-xs font-bold text-foreground">Cluster Stabilized</p>
                                    <p className="text-[10px] text-muted-foreground mt-1">All nodes meet runtime prerequisites.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Nodes Health Grid */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
                        <Network size={16} className="text-muted-foreground" /> Node Fleet
                    </h2>
                    <span className="text-[10px] font-medium text-muted-foreground bg-secondary px-2 py-1 rounded-md border border-border">
                        {nodes.length} AGENTS
                    </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {nodes.map(node => (
                        <NodeCard key={node.id} node={node} servers={servers.filter(s => s.nodeId === node.id)} />
                    ))}
                    {nodes.length === 0 && (
                        <div className="col-span-full py-12 border-2 border-dashed border-border rounded-2xl text-center">
                            <WifiOff className="mx-auto text-muted-foreground/20 mb-4" size={48} />
                            <p className="text-muted-foreground font-medium">No distributed nodes connected.</p>
                            <p className="text-[10px] text-muted-foreground/50 mt-1 uppercase tracking-wider font-mono">Check system settings to enroll an agent</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Unified Instance Monitor */}
            <div className="space-y-4 pt-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2">
                        <Activity size={14} /> Unified Instance Monitor
                    </h2>
                    
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                        <input 
                            type="text"
                            placeholder="Filter across cluster..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-secondary/30 border border-border rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                        />
                    </div>
                </div>

                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-muted/50 border-b border-border text-[10px] uppercase tracking-tighter font-black text-muted-foreground/40">
                                <tr>
                                    <th className="px-6 py-4">Instance / ID</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Orchestrator Node</th>
                                    <th className="px-6 py-4">Telemetry</th>
                                    <th className="px-6 py-4">Security</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {filteredServers.map(server => (
                                    <tr key={server.id} className="hover:bg-secondary/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                                                    server.status === 'ONLINE' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-muted border-border text-muted-foreground'
                                                }`}>
                                                    <Server size={16} />
                                                </div>
                                                <div>
                                                    <div className="font-bold text-foreground leading-none">{server.name}</div>
                                                    <div className="text-[10px] text-muted-foreground font-mono mt-1 opacity-60 italic">{server.id}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatusBadge status={server.status} />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <Network size={14} className="text-primary/50" />
                                                <span className="font-mono text-xs font-bold">
                                                    {nodes.find(n => n.id === server.nodeId)?.name || 'Primary Node'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
                                                <span className="flex items-center gap-1"><Cpu size={12} /> {server.status === 'ONLINE' ? `${(stats[server.id]?.cpu || 0).toFixed(1)}%` : '0%'}</span>
                                                <span className="flex items-center gap-1"><MemoryStick size={12} /> {server.ram}GB</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <SafetyBadge type={server.executionEngine === 'remote' ? 'REMOTE' : 'LOCAL'} />
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                                                <ArrowUpRight size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredServers.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground font-medium italic">
                                            No instances found matching your filter query.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Global Audit Feed */}
            <div className="space-y-4 pt-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2">
                        <Clock size={14} /> Global Audit Feed
                    </h2>
                    <button onClick={() => onNavigate?.('AUDIT_LOG')} className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline">
                        View Full Logs
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {auditLogs.map(log => (
                        <div key={log.id} className="bg-card border border-border p-4 rounded-2xl flex items-center gap-4 group hover:border-primary/20 transition-all">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                                log.action.includes('FAIL') || log.action.includes('DELETE') ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' :
                                log.action.includes('CREATE') || log.action.includes('SUCCESS') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                                'bg-secondary border-border text-muted-foreground'
                            }`}>
                                <Activity size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                    <div className="text-xs font-bold truncate text-foreground">{log.action.replace(/_/g, ' ')}</div>
                                    <div className="text-[9px] font-mono text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString()}</div>
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate opacity-70 mt-0.5">
                                    by <span className="text-foreground font-medium">{log.userEmail || 'System'}</span> on {log.resourceId || 'Global'}
                                </div>
                            </div>
                        </div>
                    ))}
                    {auditLogs.length === 0 && (
                        <div className="col-span-full py-8 text-center border border-dashed border-border rounded-2xl text-muted-foreground text-xs font-medium italic">
                            No recent administrative activity recorded.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Subcomponents ---

interface StatCardProps {
    label: string;
    value: string | number;
    subText?: string;
    icon: React.ReactNode;
    progress?: number;
    trend?: 'up' | 'down' | 'stable';
    sub?: string;
}

const HeatmapCell: React.FC<{ node: NodeInfo }> = ({ node }) => {
    const isOnline = node.status === 'ONLINE';
    const cpu = node.health?.cpu || 0;
    
    // Determine color based on load
    const getColor = () => {
        if (!isOnline) return 'bg-secondary border-border opacity-50';
        if (cpu > 80) return 'bg-primary border-primary';
        if (cpu > 40) return 'bg-primary/40 border-primary/40';
        return 'bg-secondary border-border hover:border-primary/50';
    };

    return (
        <motion.div 
            whileHover={{ scale: 1.05 }}
            className={`aspect-square rounded-sm border transition-all group relative cursor-pointer ${getColor()}`}
        >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-popover/90 flex items-center justify-center rounded-sm backdrop-blur-[1px] transition-opacity z-20 pointer-events-none border border-border">
                <div className="text-[9px] font-medium text-popover-foreground text-center leading-tight">
                    {node.name}
                    <div className="text-primary font-bold">{cpu}%</div>
                </div>
            </div>
            {!isOnline && (
                <div className="absolute inset-0 flex items-center justify-center opacity-40">
                    <WifiOff size={12} className="text-muted-foreground" />
                </div>
            )}
        </motion.div>
    );
};

const StatCard: React.FC<StatCardProps> = ({ label, value, sub, icon, progress, trend }) => (
    <div className="bg-card border border-border p-5 rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
        <div className="flex justify-between items-start mb-4">
            <div className="text-muted-foreground group-hover:text-primary transition-colors">
                {icon}
            </div>
             {trend && (
                <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    trend === 'stable' ? 'text-emerald-500 bg-emerald-500/10' : 'text-rose-500 bg-rose-500/10'
                }`}>
                    {trend === 'stable' ? 'OK' : 'WARN'}
                </div>
            )}
        </div>
        <div>
            <div className="text-2xl font-bold tracking-tight text-foreground leading-none">{value}</div>
            <div className="text-xs font-medium text-muted-foreground mt-2">{label}</div>
            <div className="text-[11px] text-muted-foreground/60">{sub}</div>
        </div>
        {progress !== undefined && (
            <div className="absolute bottom-0 left-0 w-full h-1 bg-secondary">
                <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className="h-full bg-primary/50"
                />
            </div>
        )}
    </div>
);

const NodeCard: React.FC<{ node: NodeInfo; servers: ServerConfig[] }> = ({ node, servers }) => {
    const isOnline = node.status === 'ONLINE';
    
    return (
        <motion.div 
            whileHover={{ y: -2 }}
            className={`bg-card p-5 rounded-xl shadow-sm border transition-all ${
                isOnline ? 'border-border hover:border-primary/30' : 'border-border/50 opacity-60'
            }`}
        >
            <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-lg ${isOnline ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                        <Network size={18} />
                    </div>
                    <div>
                        <div className="font-bold text-sm text-foreground">{node.name}</div>
                        <div className="text-[11px] font-mono text-muted-foreground">{node.host}:{node.port}</div>
                    </div>
                </div>
                <StatusBadge status={node.status} />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                    <div className="text-[10px] font-semibold text-muted-foreground mb-1">Load</div>
                    <div className="flex items-center gap-2">
                        <Cpu size={14} className="text-muted-foreground/70" />
                        <span className="text-sm font-medium">{node.health?.cpu || 0}%</span>
                    </div>
                </div>
                <div>
                    <div className="text-[10px] font-semibold text-muted-foreground mb-1">Memory</div>
                    <div className="flex items-center gap-2">
                        <MemoryStick size={14} className="text-muted-foreground/70" />
                        <span className="text-sm font-medium">
                            {node.health ? (node.health.memoryUsed / (1024**3)).toFixed(1) : 0} GB
                        </span>
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground border-t border-border pt-3">
                    <span>Instances</span>
                    <span>{servers.length} Active</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {servers.slice(0, 5).map(s => (
                        <div key={s.id} className={`w-2 h-2 rounded-full ${s.status === 'ONLINE' ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}`} title={s.name} />
                    ))}
                    {servers.length > 5 && <span className="text-[9px] text-muted-foreground">+{servers.length - 5}</span>}
                </div>
            </div>
            
            <div className="mt-5 flex gap-2">
                <button className="flex-1 bg-secondary hover:bg-secondary/80 text-foreground py-2 rounded-lg text-xs font-medium transition-all border border-border">
                    Diagnostics
                </button>
                <button className="p-2 text-muted-foreground hover:text-primary transition-all">
                    <ExternalLink size={16} />
                </button>
            </div>
        </motion.div>
    );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const config: any = {
        'ONLINE': { color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20', icon: <CheckCircle2 size={12} /> },
        'OFFLINE': { color: 'text-muted-foreground bg-secondary border-border', icon: <WifiOff size={12} /> },
        'STARTING': { color: 'text-amber-500 bg-amber-500/10 border-amber-500/20', icon: <RefreshCw size={12} className="animate-spin" /> },
        'STOPPING': { color: 'text-rose-500 bg-rose-500/10 border-rose-500/20', icon: <RefreshCw size={12} className="animate-spin" /> },
        'CRASHED': { color: 'text-rose-600 bg-rose-600/10 border-rose-600/20', icon: <AlertTriangle size={12} /> },
    };

    const current = config[status] || config['OFFLINE'];

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${current.color}`}>
            {current.icon}
            {status}
        </span>
    );
};

const SafetyBadge: React.FC<{ type: 'LOCAL' | 'REMOTE' | 'ENCRYPTED' }> = ({ type }) => {
    const config: any = {
        'LOCAL': { color: 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20', icon: <Shield size={10} />, label: 'Internal' },
        'REMOTE': { color: 'text-blue-500 bg-blue-500/10 border-blue-500/20', icon: <Globe size={10} />, label: 'Distributed' },
        'ENCRYPTED': { color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20', icon: <Shield size={10} />, label: 'Shielded' },
    };

    const current = config[type];

    return (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wide ${current.color}`}>
            {current.icon}
            {current.label}
        </span>
    );
};

export default GlobalOperations;
