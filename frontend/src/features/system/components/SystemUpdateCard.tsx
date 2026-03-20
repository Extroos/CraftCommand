import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, RefreshCw, CheckCircle2, AlertTriangle, Shield, Play, Power, Package, Info, ArrowRight } from 'lucide-react';
import { API } from '@features/core/services/api'; // Using correct path based on finding
import { useToast } from '@features/ui/Toast';
import { usePermissions } from '@features/auth/hooks/usePermissions';
import { useUser } from '@features/auth/context/UserContext';
import { useConfirm } from '@features/ui/hooks/useConfirm';
import { ConfirmDialog } from '@features/ui/ConfirmDialog';

// Types aligning with backend
export type UpdateStatus = 'IDLE' | 'CHECKING' | 'DOWNLOADING' | 'VERIFYING' | 'READY_TO_INSTALL' | 'ERROR';

interface UpdateStateInfo {
    status: UpdateStatus;
    progress: number;
    currentStep?: string;
    error?: string;
    targetVersion?: string;
}

interface SystemUpdateCardProps {
    variant?: 'card' | 'embedded';
}

export const SystemUpdateCard: React.FC<SystemUpdateCardProps> = ({ variant = 'card' }) => {
    const [statusInfo, setStatusInfo] = useState<UpdateStateInfo>({ status: 'IDLE', progress: 0 });
    const [currentVersion, setCurrentVersion] = useState<string>('Unknown');
    const [availableUpdate, setAvailableUpdate] = useState<any | null>(null); // UpdateCheckResult
    
    const [isChecking, setIsChecking] = useState(false);
    const [isStartingUpdate, setIsStartingUpdate] = useState(false);
    const [isRestarting, setIsRestarting] = useState(false);
    
    const { addToast } = useToast();
    const { user } = useUser();
    const isOwner = user?.role === 'OWNER';
    const { isOpen: isConfirmOpen, config: confirmConfig, confirm: requestConfirm, handleConfirm, handleCancel } = useConfirm();

    useEffect(() => {
        fetchCurrentVersion();
        fetchStatus();
        
        // Poll status if active
        // Logic: If status is not IDLE/ERROR/READY, we poll frequent.
        // If IDLE, we don't poll (or poll rarely).
        // If checking update, handled by button.
        
        const timer = setInterval(() => {
            if (statusInfo.status !== 'IDLE' && statusInfo.status !== 'ERROR' && statusInfo.status !== 'READY_TO_INSTALL') {
                fetchStatus();
            }
        }, 1000);
        
        return () => clearInterval(timer);
    }, [statusInfo.status]);

    const fetchCurrentVersion = async () => {
        try {
            // We can get version from system status or update check
            const sys = await API.getSystemStatus();
            if (sys.version) setCurrentVersion(sys.version);
            else {
                // Fallback attempt via update check cache?
                // Just leave as Unknown or fetch later
                const check = await API.checkSystemUpdates(false);
                if (check.currentVersion) setCurrentVersion(check.currentVersion);
            }
        } catch (e) {
            console.error('Failed to fetch version', e);
        }
    };

    const fetchStatus = async () => {
        try {
            const data = await API.getUpdateStatus();
            setStatusInfo(data as unknown as UpdateStateInfo);
        } catch (e) {
            console.error('Failed to fetch update status', e);
        }
    };

    const handleCheckUpdate = async () => {
        setIsChecking(true);
        try {
            const result = await API.checkSystemUpdates(true);
            setAvailableUpdate(result.available ? result : null);
            if (!result.available) {
                addToast('success', 'Update System', `You are on the latest version (v${result.currentVersion})`);
                setCurrentVersion(result.currentVersion);
            } else {
                 addToast('info', 'Update Available', `Version v${result.latestVersion} is available!`);
            }
        } catch (e: any) {
            addToast('error', 'Update Check Failed', e.message);
        } finally {
            setIsChecking(false);
        }
    };

    const handleStartUpdate = async () => {
        if (!availableUpdate) return;
        setIsStartingUpdate(true);
        try {
            await API.downloadUpdate(availableUpdate.latestVersion);
            addToast('success', 'Update Started', 'Downloading system update packages...');
            // Status polling will take over UI update
            await fetchStatus();
        } catch (e: any) {
            addToast('error', 'Update Failed', e.message);
        } finally {
            setIsStartingUpdate(false);
        }
    };

    const handleRestart = async () => {
        const isConfirmed = await requestConfirm({
            title: 'Restart System',
            description: 'This will restart the CraftCommand backend service to apply updates. Active server connections may be briefly interrupted.',
            confirmText: 'Restart & Apply Updates',
            cancelText: 'Cancel'
        });
        if (!isConfirmed) return;
        
        setIsRestarting(true);
        try {
            await API.restartSystem();
            addToast('success', 'System Restarting', 'Backend is restarting. The page will reload shortly.');
            
            // Wait and reload page
            setTimeout(() => {
                window.location.reload();
            }, 5000);
        } catch (e: any) {
            addToast('error', 'Restart Failed', e.message);
            setIsRestarting(false);
        }
    };

    const handleRetry = () => {
        // Reset status on backend? Ideally backend resets on new request, but we might want explicit reset endpoint?
        // Actually downloadUpdate resets status.
        // If we are in ERROR state, we can just allow checking/downloading again.
        handleCheckUpdate();
    };

    // Render Logic based on State
    const renderActiveState = () => {
        if (statusInfo.status === 'DOWNLOADING' || statusInfo.status === 'VERIFYING') {
            return (
                 <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                        <span>{statusInfo.status === 'DOWNLOADING' ? 'Downloading Package...' : 'Verifying Signature...'}</span>
                        <span>{statusInfo.progress}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <motion.div 
                            className="h-full bg-primary"
                            initial={{ width: 0 }}
                            animate={{ width: `${statusInfo.progress}%` }}
                            transition={{ ease: "easeInOut" }}
                        />
                    </div>
                    <p className="text-[10px] items-center gap-2 text-muted-foreground font-mono flex">
                        <RefreshCw size={10} className="animate-spin" />
                        {statusInfo.currentStep || 'Processing...'}
                    </p>
                </div>
            );
        }

        if (statusInfo.status === 'READY_TO_INSTALL') {
             return (
                 <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 space-y-3 animate-in zoom-in-95">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500 text-white rounded-full shadow-sm">
                            <CheckCircle2 size={20} />
                        </div>
                        <div>
                            <h4 className="font-bold text-emerald-600">Update Ready to Install</h4>
                            <p className="text-xs text-emerald-600/80">
                                Target Version: v{statusInfo.targetVersion || availableUpdate?.latestVersion || '?'}
                            </p>
                        </div>
                    </div>
                    <div className="pt-2">
                         <button 
                            onClick={handleRestart}
                            disabled={isRestarting}
                            className={`w-full py-2.5 rounded-lg font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition-all ${
                                isRestarting ? 'bg-secondary text-muted-foreground' : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                            }`}
                        >
                            {isRestarting ? (
                                <>
                                    <RefreshCw size={16} className="animate-spin" /> Restarting System...
                                </>
                            ) : (
                                <>
                                     <Power size={16} /> Restart & Apply Update
                                </>
                            )}
                        </button>
                        <p className="text-[10px] text-center text-emerald-600/60 mt-2">
                            This will restart the backend service. (~10s downtime)
                        </p>
                    </div>
                 </div>
             );
        }

        if (statusInfo.status === 'ERROR') {
             return (
                 <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-4 space-y-3 animate-in shake">
                    <div className="flex items-start gap-3">
                        <AlertTriangle size={20} className="text-rose-500 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-bold text-rose-600 text-sm">Update Failed</h4>
                            <p className="text-xs text-rose-600/80 mt-1 break-words font-mono bg-rose-500/10 p-2 rounded">
                                {statusInfo.error || "Unknown error occurred"}
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={handleRetry}
                        className="w-full py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 rounded text-xs font-bold transition-all"
                    >
                        Dismiss & Retry
                    </button>
                 </div>
             );
        }

        // IDLE State - Show Check or Available Update
        if (availableUpdate) {
            return (
                <div className="bg-primary/5 border border-primary/10 rounded-lg p-4 space-y-4 animate-in fade-in">
                     <div className="flex justify-between items-start">
                        <div>
                             <div className="flex items-center gap-2">
                                <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">NEW</span>
                                <h4 className="font-bold text-primary">v{availableUpdate.latestVersion} Available</h4>
                             </div>
                             <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">
                                {availableUpdate.title || 'A new update is available for installation.'}
                             </p>
                        </div>
                        {availableUpdate.priority === 'CRITICAL' && (
                             <Shield size={16} className="text-rose-500" />
                        )}
                     </div>

                     {/* Release Notes Preview - Simplified */}
                     {availableUpdate.notes && (
                         <div className="text-xs text-muted-foreground bg-background/50 p-2 rounded border border-border/50 max-h-24 overflow-y-auto">
                            <ul className="list-disc pl-4 space-y-1">
                                {availableUpdate.notes.slice(0, 3).map((n: string, i: number) => (
                                    <li key={i}>{n}</li>
                                ))}
                                {availableUpdate.notes.length > 3 && <li>...and more</li>}
                            </ul>
                         </div>
                     )}

                     {/* Incompatible Nodes Warning */}
                     {availableUpdate.incompatibleNodes && availableUpdate.incompatibleNodes.length > 0 && (
                         <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-2.5 text-xs text-amber-600/90">
                             <div className="flex items-center gap-1.5 font-bold mb-1">
                                 <AlertTriangle size={14} />
                                 <span>Compatibility Warning</span>
                             </div>
                             <p className="mb-1.5 opacity-90">Updating will break connection with these nodes:</p>
                             <ul className="list-disc pl-4 space-y-0.5 opacity-80 font-mono text-[10px]">
                                 {availableUpdate.incompatibleNodes.slice(0, 5).map((node: any) => (
                                     <li key={node.id}>
                                         {node.name} (v{node.version})
                                     </li>
                                 ))}
                                 {availableUpdate.incompatibleNodes.length > 5 && <li>...and {availableUpdate.incompatibleNodes.length - 5} more</li>}
                             </ul>
                         </div>
                     )}

                     <button 
                        onClick={handleStartUpdate}
                        disabled={isStartingUpdate}
                        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
                     >
                        {isStartingUpdate ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                        Download & Prepare Update
                     </button>
                </div>
            );
        }

        return (
            <button 
                onClick={handleCheckUpdate}
                disabled={isChecking}
                className={`w-full bg-secondary hover:bg-secondary/80 border border-border text-foreground py-2.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${variant === 'embedded' ? 'mt-2' : ''}`}
            >
                {isChecking ? (
                    <>
                        <RefreshCw size={14} className="animate-spin text-muted-foreground" />
                        Checking for updates...
                    </>
                ) : (
                    <>
                        <RefreshCw size={14} className="text-muted-foreground" />
                        Check for Updates
                    </>
                )}
            </button>
        );
    };

    if (!isOwner) return null; // Only owner sees this card

    if (variant === 'embedded') {
        return (
            <div className="space-y-3">
                <div className="flex items-center justify-between p-2.5 bg-secondary/20 rounded border border-border/40">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">v{currentVersion}</span>
                        <div className={`w-1.5 h-1.5 rounded-full ${availableUpdate ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                    </div>
                    <div className="flex items-center gap-3">
                         <div className={`text-[10px] font-bold ${
                             statusInfo.status === 'ERROR' ? 'text-rose-500' :
                             availableUpdate ? 'text-amber-500' :
                             'text-emerald-500'
                         }`}>
                             {statusInfo.status === 'ERROR' ? 'Update Error' : availableUpdate ? 'Update Available' : 'Up to Date'}
                         </div>
                    </div>
                </div>

                {renderActiveState()}
                
                <div className="flex gap-4 justify-between items-center px-1">
                    <a href="https://github.com/Extroos/Craft-Commands/releases" target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
                        Changelog <ArrowRight size={10} />
                    </a>
                    {statusInfo.status === 'IDLE' && !availableUpdate && (
                         <button 
                            onClick={handleCheckUpdate}
                            disabled={isChecking}
                            className="text-[10px] text-primary hover:underline font-bold disabled:opacity-50 flex items-center gap-1"
                        >
                            {isChecking ? <RefreshCw size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                            Check Now
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <motion.div 
            className="border border-border p-6 bg-card shadow-sm rounded-lg transition-all"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-cyan-500/10 text-cyan-500 rounded-lg">
                    <Package size={20} />
                </div>
                <div>
                    <h3 className="font-semibold text-base">System Updates</h3>
                    <p className="text-xs text-muted-foreground">Manage CraftCommand backend version and updates.</p>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border/50">
                    <div>
                        <div className="text-xs font-medium text-muted-foreground">Current Version</div>
                        <div className="text-lg font-bold font-mono tracking-tight text-foreground">v{currentVersion}</div>
                    </div>
                     <div className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                         statusInfo.status === 'ERROR' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                         availableUpdate ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                         'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                     }`}>
                         {statusInfo.status === 'ERROR' ? 'Error' : availableUpdate ? 'Update Available' : 'Up to Date'}
                     </div>
                </div>

                {renderActiveState()}
                
                <div className="flex gap-2 justify-center">
                    <a href="https://github.com/Extroos/Craft-Commands/releases" target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
                        View Changelog <ArrowRight size={10} />
                    </a>
                </div>
            </div>

            <ConfirmDialog 
                isOpen={isConfirmOpen}
                {...confirmConfig}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
            />
        </motion.div>
    );
};
