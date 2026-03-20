import React, { useState, useEffect, useMemo } from 'react';
import { API } from '@core/services/api';
import { AuditLog } from '@shared/types';
import { StabilityMarker } from '@shared/types/health';
import { format } from 'date-fns';
import { Activity, ShieldCheck, AlertTriangle, CheckCircle, Cpu, HardDrive, Database, Zap, ArrowUpRight, History, Layers, Network, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '@features/auth/context/UserContext';
import { NodeInfo, NodeStatus } from '@shared/types';
import { STAGGER_CONTAINER, STAGGER_ITEM, MOTION_SPRINGS } from '../../styles/motion';

interface HealthStats {
    cpuLoad: number;
    memoryPressure: number;
    diskIO: number;
    isOverloaded: boolean;
    stabilityMarkers: StabilityMarker[];
    timestamp: number;
}

const TelemetryLine = ({ data, color, height = 40 }: { data: number[], color: string, height?: number }) => {
    if (data.length < 2) return <div className="h-[40px]" />;
    const max = Math.max(...data, 10);
    const width = 200;
    const points = data.map((d, i) => `${(i / (data.length - 1)) * width},${height - (d / max) * height}`).join(' ');

    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
            <defs>
                <linearGradient id={`glow-${color.replace('#', '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path
                d={`M 0,${height} ${points} L ${width},${height} Z`}
                fill={`url(#glow-${color.replace('#', '')})`}
            />
            <polyline
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
                className="drop-shadow-[0_0_8px_rgba(var(--color-rgb),0.5)]"
            />
        </svg>
    );
};

export const SystemHealthMatrix: React.FC = () => {
    const { user } = useUser();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [health, setHealth] = useState<HealthStats | null>(null);
    const [nodes, setNodes] = useState<NodeInfo[]>([]);
    const [cpuHistory, setCpuHistory] = useState<number[]>([]);
    const [ramHistory, setRamHistory] = useState<number[]>([]);
    const [ioHistory, setIoHistory] = useState<number[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        try {
            const [logData, healthData, nodeData] = await Promise.all([
                API.getAuditLogs({ action: 'AUTO_HEAL', limit: 30 }),
                API.getSystemHealth(),
                API.getNodes()
            ]);
            
            setLogs(logData.logs);
            setHealth(healthData);
            setNodes(nodeData.nodes);
            
            setCpuHistory(prev => [...prev.slice(-15), healthData.cpuLoad]);
            setRamHistory(prev => [...prev.slice(-15), healthData.memoryPressure]);
            setIoHistory(prev => [...prev.slice(-15), healthData.diskIO / 1024 / 1024]);

            setError(null);
        } catch (err: any) {
            console.error('Audit Fetch Error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleResetStability = async (serverId: string) => {
        try {
            await API.resetStabilityMarker(serverId);
            fetchData();
        } catch (err: any) {
            console.error('Reset Stability Error:', err);
        }
    };

    if (loading && logs.length === 0 && !health) {
        return (
            <div className="flex flex-col items-center justify-center p-12 space-y-3 opacity-50">
                <Activity size={18} className="text-primary animate-spin" />
                <p className="text-[11px] font-bold tracking-tight">Synchronizing System Telemetry...</p>
            </div>
        );
    }

    return (
        <motion.div 
            variants={STAGGER_CONTAINER}
            initial="hidden"
            animate="show"
            className="space-y-4 animate-in fade-in duration-500"
        >
            {/* --- INFRASTRUCTURE TOPOLOGY --- */}
            <motion.div 
                variants={STAGGER_ITEM}
                className={`border border-border/80 transition-all duration-300 overflow-hidden ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow rounded-2xl' : 'bg-card shadow-sm rounded-lg'}`}
            >
                <div className="h-10 bg-muted/20 border-b border-border/60 flex items-center justify-between px-4">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/40"></div>
                        <span className="text-[11px] font-semibold text-muted-foreground tracking-tight uppercase">Infrastructure Topology Matrix</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                            <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                            <span className="text-[9px] font-bold text-primary/60 uppercase">Master Hub</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground/40">
                            <div className="w-1 h-1 rounded-full bg-zinc-600" />
                            <span className="text-[9px] font-bold uppercase tracking-wider">Worker Node</span>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {/* Master Hub Card */}
                        <motion.div 
                            variants={STAGGER_ITEM}
                            className={`col-span-1 p-4 border transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow rounded-2xl' : 'bg-card shadow-sm rounded-lg'} border-primary/20 relative overflow-hidden group`}
                        >
                            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Database size={40} />
                            </div>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)]">
                                    <Database size={20} className="text-primary" />
                                </div>
                                <div>
                                    <h4 className="text-[11px] font-black uppercase tracking-wider text-primary">Master Hub</h4>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-tight">ONLINE</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-[9px] font-medium text-muted-foreground uppercase tracking-widest">
                                    <span>Primary Cluster</span>
                                    <span className="text-[10px] text-foreground font-black">HOST</span>
                                </div>
                                {health && (
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="p-2 bg-secondary/30 rounded-lg border border-border/50">
                                            <p className="text-[8px] font-bold text-muted-foreground mb-1 uppercase">Load</p>
                                            <p className="text-[11px] font-black">{Math.round(health.cpuLoad)}%</p>
                                        </div>
                                        <div className="p-2 bg-secondary/30 rounded-lg border border-border/50">
                                            <p className="text-[8px] font-bold text-muted-foreground mb-1 uppercase">Memory</p>
                                            <p className="text-[11px] font-black">{Math.round(health.memoryPressure)}%</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>

                        {/* Worker Nodes */}
                        {nodes.map((node, i) => (
                            <motion.div
                                key={node.id}
                                variants={STAGGER_ITEM}
                                className={`p-4 border transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow rounded-2xl' : 'bg-card shadow-sm rounded-lg'} ${
                                    node.status === NodeStatus.ONLINE ? 'border-border/60' : 'border-zinc-500/10 opacity-60'
                                } group relative`}
                             >
                                <div className="flex items-center gap-3 mb-4">
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                                        node.status === NodeStatus.ONLINE 
                                        ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-500' 
                                        : 'bg-zinc-500/5 border-zinc-500/20 text-zinc-500'
                                    }`}>
                                        <Layers size={16} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-[10px] font-black uppercase truncate tracking-tight">{node.name}</h4>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <div className={`w-1.5 h-1.5 rounded-full ${node.status === NodeStatus.ONLINE ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
                                            <span className={`text-[8px] font-bold uppercase ${node.status === NodeStatus.ONLINE ? 'text-emerald-600' : 'text-zinc-500'}`}>
                                                {node.status}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {node.health ? (
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center text-[8px] font-bold text-muted-foreground uppercase">
                                            <span>Telemetry</span>
                                            <span className="text-foreground">{Math.round(node.health.cpu)}% CPU</span>
                                        </div>
                                        <div className="h-1 bg-secondary rounded-full overflow-hidden">
                                            <motion.div 
                                                initial={{ width: 0 }}
                                                animate={{ width: `${node.health.cpu}%` }}
                                                className={`h-full ${node.health.cpu > 80 ? 'bg-rose-500' : node.health.cpu > 50 ? 'bg-amber-500' : 'bg-primary'}`}
                                            />
                                        </div>
                                        <div className="flex justify-between items-center text-[8px] text-muted-foreground font-medium">
                                            <span>IP: {node.host}</span>
                                            <span>{node.health.memoryUsed ? `${Math.round(node.health.memoryUsed / (1024 * 1024 * 1024))}GB` : 'N/A'}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-12 flex items-center justify-center bg-secondary/20 rounded-lg border border-dashed border-border/40">
                                        <p className="text-[8px] font-bold text-muted-foreground/40 uppercase tracking-widest">Awaiting Sync</p>
                                    </div>
                                )}
                            </motion.div>
                        ))}

                        {nodes.length === 0 && (
                            <div className="col-span-full py-12 flex flex-col items-center gap-3 opacity-20">
                                <Network size={32} strokeWidth={1} />
                                <span className="text-[10px] font-black uppercase tracking-widest">No worker nodes detected in mesh</span>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>

            {/* --- TOP PERFORMANCE ANALYTICS --- */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <motion.div 
                    variants={STAGGER_ITEM}
                    className="xl:col-span-2 space-y-4"
                >
                    <div className={`border border-border/80 transition-all duration-300 overflow-hidden ${user?.preferences.visualQuality ? 'glass-morphism rounded-2xl' : 'bg-card rounded-md shadow-sm'}`}>
                        <div className="h-10 bg-muted/20 border-b border-border/60 flex items-center justify-between px-4">
                            <div className="flex items-center gap-2">
                                <Cpu size={14} className="text-primary/70" />
                                <span className="text-[11px] font-semibold tracking-tight uppercase text-muted-foreground">Host Performance Core</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-emerald-500">
                                <Activity size={12} className="animate-pulse" />
                                <span className="text-[10px] font-mono font-bold tracking-tighter">ENGINE_READY</span>
                            </div>
                        </div>
                        
                        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[
                                { label: 'PROCESSING', val: `${Math.round(health?.cpuLoad || 0)}%`, history: cpuHistory, color: '#10b981' },
                                { label: 'MEMORY LOAD', val: `${Math.round(health?.memoryPressure || 0)}%`, history: ramHistory, color: '#8b5cf6' },
                                { label: 'THROUGHPUT', val: `${Math.round((health?.diskIO || 0) / 1024 / 1024)} MB/s`, history: ioHistory, color: '#3b82f6' }
                            ].map((stat, i) => (
                                <div key={i} className="space-y-3">
                                    <div className="flex justify-between items-end">
                                        <span className="text-[9px] font-black text-muted-foreground/50 tracking-[0.2em]">{stat.label}</span>
                                        <span className="text-sm font-mono font-bold tabular-nums text-foreground/90">{stat.val}</span>
                                    </div>
                                    <div className="h-12 bg-black/10 rounded-lg p-1.5 border border-border/20 shadow-inner">
                                        <TelemetryLine data={stat.history} color={stat.color} height={36} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Stability Indices */}
                    <div className={`border border-border/80 transition-all duration-300 opacity-90 overflow-hidden ${user?.preferences.visualQuality ? 'glass-morphism rounded-2xl' : 'bg-card rounded-md shadow-sm'}`}>
                         <div className="h-10 bg-muted/20 border-b border-border/60 flex items-center justify-between px-4">
                            <div className="flex items-center gap-2">
                                <ShieldCheck size={14} className="text-primary/70" />
                                <span className="text-[11px] font-semibold tracking-tight uppercase text-muted-foreground">Stability Matrix Indices</span>
                            </div>
                        </div>
                        <div className="p-0 overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-muted/10 border-b border-border/40">
                                    <tr>
                                        <th className="px-4 py-2 text-[9px] font-black text-muted-foreground uppercase tracking-wider">Node ID</th>
                                        <th className="px-4 py-2 text-[9px] font-black text-muted-foreground uppercase tracking-wider">Health Score</th>
                                        <th className="px-4 py-2 text-[9px] font-black text-muted-foreground uppercase tracking-wider">Status</th>
                                        <th className="px-4 py-2 text-[9px] font-black text-muted-foreground uppercase tracking-wider text-right">Protection</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/20">
                                    {health?.stabilityMarkers?.map((marker) => (
                                        <tr key={marker.serverId} className="hover:bg-muted/5 transition-colors group">
                                            <td className="px-4 py-2.5">
                                                <span className="text-[10px] font-mono font-bold text-primary/60">{marker.serverId.slice(0, 8)}</span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 h-1.5 bg-black/20 rounded-full overflow-hidden min-w-[60px] max-w-[100px] border border-border/30">
                                                        <div 
                                                            className={`h-full transition-all duration-1000 ${marker.score > 80 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : marker.score > 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                                            style={{ width: `${marker.score}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[10px] font-mono font-bold tabular-nums w-4">{marker.score}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-1.5">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${marker.score > 50 ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
                                                    <span className="text-[10px] font-bold text-muted-foreground">{marker.score > 50 ? 'NOMINAL' : 'DEGRADED'}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <div className="flex items-center gap-2 justify-end">
                                                    {marker.isSafeMode && (
                                                        <button 
                                                            onClick={() => handleResetStability(marker.serverId)}
                                                            className="p-1 hover:bg-rose-500/20 rounded transition-colors text-rose-500"
                                                            title="Reset Stability Marker"
                                                        >
                                                            <RotateCcw size={10} />
                                                        </button>
                                                    )}
                                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border inline-block ${marker.isSafeMode ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'}`}>
                                                        {marker.isSafeMode ? 'SAFE_MODE' : 'ACTIVE'}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {(!health?.stabilityMarkers || health.stabilityMarkers.length === 0) && (
                                        <tr>
                                            <td colSpan={4} className="py-12 text-center text-[10px] font-bold text-muted-foreground/30 italic">
                                                No active stability markers registered.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </motion.div>

                {/* Right Column: Integrated Transcript */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className={`xl:col-span-1 border border-border/80 flex flex-col transition-all duration-300 overflow-hidden ${user?.preferences.visualQuality ? 'glass-morphism rounded-2xl' : 'bg-card rounded-md shadow-sm'}`}
                >
                    <div className="h-10 bg-muted/20 border-b border-border/60 flex items-center justify-between px-4 shrink-0">
                        <div className="flex items-center gap-2">
                            <History size={14} className="text-primary/70" />
                            <span className="text-[11px] font-semibold tracking-tight uppercase text-muted-foreground">Security Audit Feed</span>
                        </div>
                        <div className="flex items-center gap-2">
                             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                             <span className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">Live_Sink</span>
                        </div>
                    </div>
                    
                    <div className="flex-1 p-4 bg-black/5 font-mono text-[11px] space-y-4 overflow-y-auto max-h-[500px] custom-cc-scroll">
                        {logs.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center space-y-2 opacity-20 py-12">
                                <CheckCircle size={24} strokeWidth={1} />
                                <span className="text-[9px] font-black uppercase tracking-widest text-center">Engine Standby</span>
                            </div>
                        ) : (
                            logs.map((log) => (
                                <div key={log.id} className="group relative border-l-2 border-border/40 pl-3 py-1 hover:border-primary/40 transition-colors">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-muted-foreground/40 font-bold tabular-nums">[{format(log.timestamp, 'HH:mm:ss')}]</span>
                                        <span className={`font-black uppercase tracking-tighter text-[9px] ${
                                            log.metadata?.action === 'RECOVERY' || log.metadata?.action === 'AUTO_HEAL' ? 'text-emerald-500' : 'text-amber-500'
                                        }`}>{log.metadata?.action || 'SENTINEL'}</span>
                                    </div>
                                    <p className="text-foreground/80 leading-relaxed font-medium">
                                        {log.metadata?.title || 'System integrity event logged.'}
                                    </p>
                                    {log.metadata?.details && (
                                        <div className="mt-1.5 p-2 bg-black/10 rounded border border-border/20 text-[10px] text-muted-foreground/70 overflow-hidden leading-snug">
                                            {log.metadata.details}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </motion.div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                .specular-border {
                    background-image: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.02) 100%);
                    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05);
                }
                .custom-cc-scroll::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-cc-scroll::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-cc-scroll::-webkit-scrollbar-thumb {
                    background: rgba(var(--primary-rgb), 0.1);
                    border-radius: 10px;
                }
                .custom-cc-scroll::-webkit-scrollbar-thumb:hover {
                    background: rgba(var(--primary-rgb), 0.2);
                }
            ` }} />
        </motion.div>
    );
};
