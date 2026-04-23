import React, { useEffect } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { X, Activity, Loader2, CheckCircle2, AlertTriangle, Server, HardDrive, Zap, RotateCw, Trash2, ShieldCheck, History } from 'lucide-react';
import { useServers } from '../servers/context/ServerContext';
import { useSystem } from '../system/context/SystemContext';
import { useUser } from '../auth/context/UserContext';

const formatRelativeTime = (ts: number) => {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 30000) return 'Just now';
    if (diff < 60000) return 'Few seconds ago';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

interface ActivityTrayProps {
    isOpen: boolean;
    onClose: () => void;
}

const ActivityTray: React.FC<ActivityTrayProps> = ({ isOpen, onClose }) => {
    const { backgroundTasks, installProgress, servers, removeBackgroundTask } = useServers();
    const { isRestarting, isReconnecting } = useSystem();
    const { user } = useUser();
    const location = useLocation();

    // --- STABILITY: Auto-close tray on navigation ---
    useEffect(() => {
        if (isOpen) onClose();
    }, [location.pathname]);

    const tasks = Object.values(backgroundTasks).sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
    const activeInstalls = Object.entries(installProgress);
    
    const activeTasks = tasks.filter(t => t.status === 'running');
    const historyTasks = tasks.filter(t => t.status === 'complete' || t.status === 'failed');

    const handleClearHistory = () => {
        historyTasks.forEach(t => removeBackgroundTask(t.id));
    };

    const hasActivity = activeTasks.length > 0 || historyTasks.length > 0 || activeInstalls.length > 0;

    const getIcon = (taskId: string, status: string, size = 14) => {
        const isMuted = status !== 'running';
        const className = isMuted ? "text-muted-foreground/30" : "text-primary";

        if (taskId.includes('backup')) return <HardDrive size={size} className={className} />;
        if (taskId.includes('start')) return <Zap size={size} className={className} />;
        if (taskId.includes('stop')) return <X size={size} className={className} />;
        if (taskId.includes('restart')) return <RotateCw size={size} className={className} />;
        return <Activity size={size} className={className} />;
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[999]"
                    />

                    {/* Tray */}
                    <motion.div 
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className={`fixed top-0 right-0 h-full w-full max-w-sm border-l border-border/40 shadow-2xl z-[999] flex flex-col overflow-hidden ${user?.preferences?.visualQuality ? 'bg-background/80 backdrop-blur-xl' : 'bg-card'}`}
                    >
                        {/* HEADER */}
                        <div className="h-16 px-6 flex items-center justify-between border-b border-border/40 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeTasks.length > 0 ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                    <Activity size={16} className={activeTasks.length > 0 ? 'animate-pulse' : ''} />
                                </div>
                                <div>
                                    <h2 className="text-[13px] font-black uppercase tracking-tight text-foreground">System Activity</h2>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <div className={`w-1 h-1 rounded-full ${activeTasks.length > 0 ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-muted-foreground/30'}`} />
                                        <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest leading-none">Status Link Active</span>
                                    </div>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg transition-colors text-muted-foreground hover:text-foreground">
                                <X size={18} />
                            </button>
                        </div>

                        {/* CONTENT */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <div className="p-4 space-y-8">
                                <LayoutGroup>
                                    {!hasActivity ? (
                                        <div className="py-24 flex flex-col items-center justify-center text-center opacity-30 grayscale">
                                            <History size={32} strokeWidth={1} className="mb-4" />
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em]">No Recent Activity</p>
                                        </div>
                                    ) : (
                                        <>
                                            {/* ACTIVE OPERATIONS */}
                                            {(activeInstalls.length > 0 || activeTasks.length > 0) && (
                                                <div className="space-y-3">
                                                    <div className="px-1 flex items-center justify-between">
                                                        <h3 className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-[0.15em]">Active Tasks</h3>
                                                        <div className="flex items-center gap-3">
                                                            {activeTasks.length > 0 && (
                                                                <button 
                                                                    onClick={() => activeTasks.forEach(t => removeBackgroundTask(t.id))}
                                                                    className="text-[8px] font-bold text-primary/30 hover:text-primary transition-colors uppercase tracking-wider"
                                                                >
                                                                    Dismiss All
                                                                </button>
                                                            )}
                                                            <span className="text-[9px] font-mono text-primary animate-pulse">{activeTasks.length + activeInstalls.length}</span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="space-y-2">
                                                        {activeInstalls.map(([serverId, progress]) => (
                                                            <div key={serverId} className="cc-card p-3 space-y-3 border-primary/20 bg-primary/5">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2 truncate">
                                                                        <Loader2 size={12} className="text-primary animate-spin" />
                                                                        <span className="text-[11px] font-bold text-foreground">Deploying Node: {serverId.split('-')[0]}</span>
                                                                    </div>
                                                                    <span className="text-[10px] font-mono font-black text-primary">{progress.percent}%</span>
                                                                </div>
                                                                <div className="h-1 bg-muted rounded-full overflow-hidden">
                                                                    <motion.div initial={{ width: 0 }} animate={{ width: `${progress.percent}%` }} className="h-full bg-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]" />
                                                                </div>
                                                            </div>
                                                        ))}

                                                        {activeTasks.map((task) => (
                                                            <div key={task.id} className="cc-card p-3 space-y-3 border-primary/20 bg-primary/5">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="animate-spin">{getIcon(task.id, task.status, 12)}</div>
                                                                        <span className="text-[11px] font-bold text-foreground">{task.name}</span>
                                                                    </div>
                                                                    <span className="text-[10px] font-mono font-black text-primary/60">{task.progress}%</span>
                                                                </div>
                                                                <div className="h-1 bg-muted rounded-full overflow-hidden">
                                                                    <motion.div initial={{ width: 0 }} animate={{ width: `${task.progress}%` }} className="h-full bg-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]" />
                                                                </div>
                                                                {task.message && (
                                                                    <p className="text-[9px] text-muted-foreground/60 uppercase font-black tracking-wider truncate pt-1">
                                                                        {task.message}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* LOG HISTORY */}
                                            {historyTasks.length > 0 && (
                                                <div className="space-y-3">
                                                    <div className="px-1 flex items-center justify-between border-b border-border/20 pb-2">
                                                        <h3 className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-[0.15em]">Event History</h3>
                                                        <button onClick={handleClearHistory} className="text-[9px] font-black text-muted-foreground/30 hover:text-red-500 uppercase tracking-widest transition-colors">Clear</button>
                                                    </div>

                                                    <div className="space-y-0.5">
                                                        {historyTasks.map((task) => (
                                                            <div key={task.id} className="flex items-center gap-3 p-2.5 rounded hover:bg-white/5 transition-all group">
                                                                <div className={`p-1 rounded ${task.status === 'complete' ? 'text-emerald-500' : 'text-rose-500'} opacity-40`}>
                                                                    {task.status === 'complete' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-[11px] font-bold text-foreground/70 truncate">{task.name}</span>
                                                                        <span className="text-[9px] font-mono text-muted-foreground/30">{formatRelativeTime(task.lastUpdated)}</span>
                                                                    </div>
                                                                    <p className="text-[10px] text-muted-foreground/40 truncate mt-0.5">{task.message}</p>
                                                                </div>
                                                                <button onClick={() => removeBackgroundTask(task.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all"><Trash2 size={10} /></button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </LayoutGroup>
                            </div>
                        </div>

                        {/* FOOTER */}
                        <div className="p-6 bg-muted/20 border-t border-border/40 flex items-center justify-between">
                            <div className="flex items-center gap-2 opacity-20 grayscale">
                                <span className="text-[9px] font-black uppercase tracking-[0.2em]">CraftCommand v1.13.0</span>
                            </div>
                            <div className="flex items-center gap-1.5 capitalize text-[10px] font-bold text-muted-foreground/40 italic">
                                Ready for commands
                            </div>
                        </div>

                        {/* SYNC OVERLAY */}
                        <AnimatePresence>
                            {(isRestarting || isReconnecting) && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-background/90 backdrop-blur-md z-[200] flex flex-col items-center justify-center p-8 text-center">
                                    <Loader2 className="w-10 h-10 text-primary animate-spin mb-6" />
                                    <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Syncing System State</h3>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-tighter mt-2">Awaiting remote node heartbeat...</p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default ActivityTray;
