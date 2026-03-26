import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useServers } from '../context/ServerContext';

const DeploymentProgressOverlay: React.FC = () => {
    const { installProgress, servers } = useServers();
    
    // Get active deployments
    const activeDeployments = Object.entries(installProgress);
    
    if (activeDeployments.length === 0) return null;

    return (
        <div className="fixed bottom-6 left-6 z-[100] flex flex-col-reverse gap-3 max-w-sm w-full pointer-events-none">
            <AnimatePresence mode="popLayout">
                {activeDeployments.map(([serverId, progress]) => {
                    const server = servers.find(s => s.id === serverId);
                    const serverName = server?.name || 'Installing Server...';
                    const isComplete = progress.percent === 100;
                    const isFailed = progress.message.toLowerCase().includes('failed') || progress.message.toLowerCase().includes('error');

                    return (
                        <motion.div
                            key={serverId}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            layout
                            className="pointer-events-auto"
                        >
                            <div className="bg-zinc-950/90 border border-white/5 rounded-lg p-4 shadow-2xl backdrop-blur-md">
                                <div className="flex items-center gap-4">
                                    <div className="shrink-0">
                                        {isFailed ? (
                                            <AlertCircle size={18} className="text-rose-500" />
                                        ) : isComplete ? (
                                            <CheckCircle2 size={18} className="text-emerald-500" />
                                        ) : (
                                            <Loader2 size={18} className="text-primary animate-spin" />
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-4 mb-1.5">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-white/90 truncate">
                                                {serverName}
                                            </span>
                                            <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                                                {Math.round(progress.percent)}%
                                            </span>
                                        </div>

                                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                            <motion.div 
                                                className={`h-full ${isFailed ? 'bg-rose-500' : 'bg-primary'}`}
                                                initial={{ width: 0 }}
                                                animate={{ width: `${progress.percent}%` }}
                                                transition={{ duration: 0.3 }}
                                            />
                                        </div>

                                        <p className="text-[9px] text-muted-foreground font-medium mt-2 uppercase tracking-wide opacity-60">
                                            {progress.message}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
};

export default DeploymentProgressOverlay;
