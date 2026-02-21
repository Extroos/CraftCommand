import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Server, Plus, Trash2, RefreshCw, Wifi, WifiOff, 
    Activity, HardDrive, Cpu, MemoryStick, Clock, Tag, AlertTriangle, X,
    Coffee, Box, Wand2, Monitor, Globe, ChevronRight, Copy, Check, Download,
    Shield, Terminal, Power
} from 'lucide-react';
import { socketService } from '@core/services/socket';
import { API } from '@core/services/api';
import { useToast } from '../ui/Toast';
import { useUser } from '@features/auth/context/UserContext';
import { NodeInfo, NodeStatus } from '@shared/types';
import { AddNodeWizard } from './wizard/AddNodeWizard';

const STATUS_COLORS: Record<string, string> = {
    [NodeStatus.ONLINE]: 'bg-emerald-500',
    [NodeStatus.OFFLINE]: 'bg-zinc-500',
    [NodeStatus.DEGRADED]: 'bg-amber-500',
    [NodeStatus.ENROLLING]: 'bg-blue-500'
};

const NodeCard: React.FC<{ 
    node: NodeInfo, 
    isLocal?: boolean,
    onRemove: (id: string, name: string) => void,
    onShutdown: (id: string, name: string) => void,
    onFix: (id: string, name: string, cap: string) => void,
    fixingId: string | null
}> = ({ node, isLocal, onRemove, onShutdown, onFix, fixingId }) => {
    const { user } = useUser();
    const isOnline = node.status === NodeStatus.ONLINE;

    // Format uptime
    const formatUptime = (timestamp: number) => {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        if (mins < 60) return `${mins}m`;
        const hours = Math.floor(mins / 60);
        return `${hours}h ${mins % 60}m`;
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`group relative overflow-hidden rounded-xl border transition-all duration-500 ${
                isLocal 
                ? 'bg-gradient-to-br from-cyan-950/10 via-background to-background border-cyan-500/20' 
                : 'bg-card border-white/5 hover:border-white/10'
            } ${user?.preferences.visualQuality ? 'glass-morphism' : ''}`}
        >
            {/* Header / Status Bar */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-white/10 to-transparent group-hover:via-cyan-500/50 transition-all duration-700" />
            
            <div className="p-5 space-y-5">
                {/* ID & Type Header */}
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                            isOnline ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-500/10 text-zinc-500'
                        }`}>
                            {isLocal ? <Monitor size={20} /> : <Server size={20} />}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-white text-sm tracking-tight">{node.name}</h3>
                                {isLocal && (
                                    <span className="px-1.5 py-0.5 rounded-[4px] bg-cyan-500/10 border border-cyan-500/20 text-[9px] font-bold text-cyan-500 uppercase tracking-wider">
                                        Host System
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-white/40 font-mono mt-0.5">
                                <span>{node.host}:{node.port}</span>
                                <span className="w-1 h-1 rounded-full bg-white/20" />
                                <span>v{node.protocolVersion || '1.0'}</span>
                            </div>
                        </div>
                    </div>

                    <div className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                        isOnline ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-500' : 'bg-zinc-500/5 border-white/5 text-zinc-500'
                    }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'}`} />
                        {node.status}
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-3">
                    {/* CPU */}
                    <div className="bg-black/20 rounded-lg p-2.5 border border-white/5 space-y-2">
                        <div className="flex justify-between items-center text-[10px] text-white/40 font-bold uppercase tracking-wider">
                            <span className="flex items-center gap-1.5"><Cpu size={10} /> CPU Load</span>
                            <span className={isOnline ? 'text-white' : ''}>{isOnline ? `${node.health?.cpu || 0}%` : '-'}</span>
                        </div>
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                            <motion.div 
                                className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400"
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(node.health?.cpu || 0, 100)}%` }}
                                transition={{ duration: 1 }}
                            />
                        </div>
                    </div>

                    {/* RAM */}
                    <div className="bg-black/20 rounded-lg p-2.5 border border-white/5 space-y-2">
                        <div className="flex justify-between items-center text-[10px] text-white/40 font-bold uppercase tracking-wider">
                            <span className="flex items-center gap-1.5"><MemoryStick size={10} /> Memory</span>
                            <span className={isOnline ? 'text-white' : ''}>
                                {isOnline && node.health?.memoryTotal 
                                    ? `${Math.round((node.health.memoryUsed / node.health.memoryTotal) * 100)}%` 
                                    : '-'}
                            </span>
                        </div>
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                            <motion.div 
                                className="h-full bg-gradient-to-r from-violet-600 to-violet-400"
                                initial={{ width: 0 }}
                                animate={{ width: `${node.health?.memoryTotal ? (node.health.memoryUsed / node.health.memoryTotal) * 100 : 0}%` }}
                                transition={{ duration: 1 }}
                            />
                        </div>
                    </div>
                </div>

                {/* Footer / Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <div className="flex items-center gap-3">
                         {/* Capabilities Badges */}
                        {isOnline && node.capabilities && (
                            <div className="flex -space-x-2">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 border-[#1a1b1e] text-[10px] ${
                                        node.capabilities.docker ? 'bg-sky-500/20 text-sky-400' : 'bg-zinc-800 text-zinc-600'
                                    }`} title={node.capabilities.docker ? 'Docker Ready' : 'Docker Missing'}>
                                    <Box size={12} />
                                </div>
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 border-[#1a1b1e] text-[10px] ${
                                        node.capabilities.java ? 'bg-orange-500/20 text-orange-400' : 'bg-zinc-800 text-zinc-600'
                                    }`} title={node.capabilities.java ? `Java: ${node.capabilities.java}` : 'Java Missing'}>
                                    <Coffee size={12} />
                                </div>
                            </div>
                        )}
                        <span className="text-[10px] font-mono text-white/30 pl-2">
                            up: {isOnline ? formatUptime(node.lastHeartbeat) : '0s'}
                        </span>
                    </div>

                    <div className="flex items-center gap-1">
                        {/* Auto-Fix Button */}
                        {isOnline && !node.capabilities?.java && node.capabilities?.os?.toLowerCase().includes('windows') && (
                            <button 
                                onClick={() => onFix(node.id, node.name, 'java')}
                                disabled={!!fixingId}
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                title="Auto-Fix Java Environment"
                            >
                                <Wand2 size={14} className={fixingId ? 'animate-spin' : ''} />
                            </button>
                        )}

                        {/* Shutdown */}
                        <button
                            onClick={() => onShutdown(node.id, node.name)}
                            disabled={!isOnline || isLocal}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                                isLocal 
                                    ? 'text-white/10 cursor-not-allowed' 
                                    : 'text-white/40 hover:text-rose-400 hover:bg-rose-500/10'
                            }`}
                            title={isLocal ? "Cannot shutdown Host System via Panel" : "Shutdown Remote Agent"}
                        >
                            <Power size={14} />
                        </button>

                        {/* Remove */}
                        {!isLocal && (
                            <button
                                onClick={() => onRemove(node.id, node.name)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                title="Remove Node from Registry"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

const NodesManager: React.FC = () => {
    const [nodes, setNodes] = useState<NodeInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [showWizard, setShowWizard] = useState(false);
    const [fixingId, setFixingId] = useState<string | null>(null);
    const { addToast } = useToast();
    
    // Track previous status to prevent notification spam
    const lastStatuses = useRef<Record<string, string>>({});

    const fetchNodes = useCallback(async () => {
        try {
            // Don't set loading on poll to prevent UI flicker
            if (nodes.length === 0) setLoading(true);
            const data = await API.getNodes();
            setNodes(data.nodes || []);
        } catch (err: any) {
             if (!err.message?.includes('Distributed Nodes is disabled')) {
                // Silent fail on poll vs toast? Keep toast for visibility but maybe debounce
                console.error("Failed to fetch nodes:", err);
            }
        } finally {
            setLoading(false);
        }
    }, [nodes.length]);

    useEffect(() => {
        fetchNodes();
        const interval = setInterval(fetchNodes, 15000);
        return () => clearInterval(interval);
    }, []); // Only mount

    // Socket Listener
    useEffect(() => {
        const handleNodeStatus = (data: { nodeId: string, status: NodeStatus, node: NodeInfo }) => {
            setNodes(prev => {
                const index = prev.findIndex(n => n.id === data.nodeId);
                if (index >= 0) {
                    const next = [...prev];
                    next[index] = data.node;
                    return next;
                }
                return [...prev, data.node];
            });

            // Notification Logic: Only alert if transitioning TO Online FROM something else
            const prevStatus = lastStatuses.current[data.nodeId];
            const isTransitionToOnline = data.status === NodeStatus.ONLINE && prevStatus !== NodeStatus.ONLINE;

            if (isTransitionToOnline && data.nodeId !== 'local') {
                addToast('success', 'Node Connected', `Node "${data.node.name}" is now online!`);
            }

            // Update ref
            lastStatuses.current[data.nodeId] = data.status;
        };

        const unsub = socketService.onNodeStatus(handleNodeStatus);
        return () => { unsub(); };
    }, [addToast]);

    // Actions
    const handleRemove = async (nodeId: string, nodeName: string) => {
        if (!confirm(`Remove node "${nodeName}"? This cannot be undone.`)) return;
        try {
            await API.removeNode(nodeId);
            setNodes(prev => prev.filter(n => n.id !== nodeId));
            addToast('success', 'Removed', `Node "${nodeName}" removed.`);
        } catch (err: any) {
            addToast('error', 'Error', err.message);
        }
    };

    const handleShutdown = async (nodeId: string, nodeName: string) => {
        if (!confirm(`Shutdown node agent "${nodeName}"? The process will terminate and must be restarted manually on the remote host.`)) return;
        try {
            await API.shutdownNode(nodeId);
            addToast('success', 'Shutdown Sent', `Shutdown command sent to "${nodeName}".`);
        } catch (err: any) {
            addToast('error', 'Error', err.message);
        }
    };

    const handleFix = async (nodeId: string, nodeName: string, capability: string) => {
        if (fixingId) return;
        setFixingId(nodeId);
        addToast('info', 'Fixing', `Applying fix for ${capability} on node "${nodeName}"...`);
        try {
            const res = await API.fixNodeCapability(nodeId, capability);
            if (res.ok) {
                addToast('success', 'Fixed', `Successfully applied fix for ${capability}.`);
                await fetchNodes(); 
            }
        } catch (err: any) {
            addToast('error', 'Fix Failed', err.message);
        } finally {
            setFixingId(null);
        }
    };

    const localNode = nodes.find(n => n.id === 'local');
    const remoteNodes = nodes.filter(n => n.id !== 'local');

    if (loading && nodes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-white/20 animate-pulse">
                <RefreshCw size={32} className="animate-spin mb-4 opacity-50" />
                <span className="text-sm font-mono uppercase tracking-widest">Scanning Infrastructure...</span>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header / Actions */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight mb-1">Infrastructure</h2>
                    <p className="text-white/40 text-sm">Manage distributed compute nodes and agents.</p>
                </div>
                <button
                    onClick={() => setShowWizard(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white rounded-lg text-sm font-bold shadow-lg shadow-cyan-500/20 transition-all hover:scale-[1.02]"
                >
                    <Plus size={16} strokeWidth={3} />
                    Enroll Node
                </button>
            </div>

            {/* Host System Section - Distinct Visual Separation */}
            {localNode && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <span className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">Host Environment</span>
                        <div className="h-px bg-white/5 flex-1" />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                         <NodeCard 
                            node={localNode} 
                            isLocal={true}
                            onRemove={handleRemove}
                            onShutdown={handleShutdown}
                            onFix={handleFix}
                            fixingId={fixingId}
                        />
                         {/* Placeholder for Host Stats/Summary if we wanted a 2nd card, but 1 is fine */}
                    </div>
                </div>
            )}

            {/* Remote Nodes Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <span className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">Remote Fleet</span>
                    <div className="h-px bg-white/5 flex-1" />
                </div>

                {remoteNodes.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <AnimatePresence>
                            {remoteNodes.map(node => (
                                <NodeCard 
                                    key={node.id} 
                                    node={node} 
                                    onRemove={handleRemove}
                                    onShutdown={handleShutdown}
                                    onFix={handleFix}
                                    fixingId={fixingId}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                ) : (
                    <div className="rounded-xl border border-dashed border-white/5 bg-white/[0.02] p-12 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
                            <Server size={32} className="text-white/20" />
                        </div>
                        <h3 className="text-white font-bold mb-2">No Remote Nodes</h3>
                        <p className="text-white/40 text-sm max-w-sm mx-auto mb-6">
                            Expand your infrastructure by enrolling remote servers to distribute the workload.
                        </p>
                        <button
                            onClick={() => setShowWizard(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors border border-white/5"
                        >
                            <Plus size={14} />
                            Connect First Node
                        </button>
                    </div>
                )}
            </div>

            {/* Wizards */}
            {showWizard && (
                <AddNodeWizard 
                    onClose={() => setShowWizard(false)} 
                    onComplete={() => {
                        fetchNodes();
                        setShowWizard(false);
                    }}
                />
            )}
        </div>
    );
};

export default NodesManager;
