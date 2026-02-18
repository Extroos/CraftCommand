import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { API } from '@core/services/api';
import { useServers } from './context/ServerContext';
import { MapStatus } from '@shared/types';
import { 
    Loader2, 
    Map as MapIcon, 
    RefreshCw, 
    ExternalLink, 
    ShieldAlert, 
    CheckCircle2, 
    AlertTriangle,
    Download,
    Power,
    Server,
    Play,
    ChevronDown,
    Target
} from 'lucide-react';
import { useToast } from '../ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';

interface MapManagerProps {
    serverId?: string;
}

export const MapManager: React.FC<MapManagerProps> = ({ serverId: propId }) => {
    const { id: paramId } = useParams<{ id: string }>();
    const { currentServer } = useServers();
    const serverId = propId || currentServer?.id || paramId;
    
    const [status, setStatus] = useState<MapStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [verifying, setVerifying] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [rendering, setRendering] = useState(false);
    const [renderMode, setRenderMode] = useState<'update' | 'full' | 'radius'>('update');
    const [renderRadius, setRenderRadius] = useState(100);
    const [showRenderOptions, setShowRenderOptions] = useState(false);
    const [isPolling, setIsPolling] = useState(false);
    const { addToast } = useToast();

    const fetchStatus = async () => {
        if (!serverId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const data = await API.getMapStatus(serverId);
            setStatus(data);
        } catch (error: any) {
            addToast('error', 'Map Error', 'Failed to load map status');
        } finally {
            setLoading(false);
        }
    };

    const handleInstall = async () => {
        if (!serverId) return;
        setInstalling(true);
        try {
            await API.installMap(serverId);
            addToast('success', 'Installation Success', 'Dynmap has been installed. Please restart your server.');
            await fetchStatus();
        } catch (error: any) {
            addToast('error', 'Installation Failed', error.message || 'Failed to install plugin');
        } finally {
            setInstalling(false);
        }
    };

    const handleVerify = async (silent = false) => {
        if (!serverId) return;
        if (!silent) setVerifying(true);
        try {
            const result = await API.verifyMap(serverId);
            if (result.verified) {
                if (!silent) addToast('success', 'Handshake Verified', 'Telemetry link established!');
                fetchStatus();
                return true;
            } else {
                if (!silent) {
                    addToast('error', 'Handshake Failed', result.error || 'Connection refused');
                    setStatus(prev => prev ? { ...prev, verified: false, error: result.error } : null);
                }
                return false;
            }
        } catch (error) {
            if (!silent) addToast('error', 'Network Error', 'Verification request failed');
            return false;
        } finally {
            if (!silent) setVerifying(false);
        }
    };

    const handleTriggerRender = async (mode: 'update' | 'full' | 'radius' = 'update') => {
        if (!serverId) return;
        setRendering(true);
        try {
            await API.renderMap(serverId, mode, mode === 'radius' ? renderRadius : undefined);
            const modeLabels = { update: 'Update', full: 'Full', radius: 'Radius' };
            addToast('success', `${modeLabels[mode]} Render Started`, `World ${mode} render has been triggered.`);
            setShowRenderOptions(false);
        } catch (error: any) {
            addToast('error', 'Render Failed', error.message || 'Failed to trigger render');
        } finally {
            setRendering(false);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, [serverId]);

    // Auto-sync polling
    useEffect(() => {
        let interval: any;
        
        // Only poll if installed, not verified, and server is online
        if (status?.installed && !status?.verified && currentServer?.status === 'ONLINE') {
            setIsPolling(true);
            interval = setInterval(() => {
                handleVerify(true);
            }, 5000);
        } else {
            setIsPolling(false);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [status?.installed, status?.verified, currentServer?.status, serverId]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
                <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Initializing World Layer...</p>
            </div>
        );
    }

    // --- Scenario A: Not Installed ---
    if (!status?.installed) {
        return (
            <div className="p-6 max-w-4xl mx-auto h-full flex flex-col justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="border border-border rounded-xl bg-card shadow-lg overflow-hidden flex flex-col items-center text-center">
                    {/* Module Header */}
                    <div className="w-full h-12 bg-muted/30 border-b border-border flex items-center px-6 shrink-0">
                        <div className="flex items-center gap-2">
                             <MapIcon size={14} className="text-muted-foreground" />
                             <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Software Integration</span>
                        </div>
                    </div>

                    <div className="p-12">
                        <div className="w-16 h-16 rounded-xl bg-primary/5 flex items-center justify-center mb-6 mx-auto border border-primary/10">
                            <Download className="w-8 h-8 text-primary" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground mb-3">Dynmap Integration Ready</h2>
                        <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
                            Deploy real-time world telemetry and player logistics. Automate your dynamic map generation with a single click.
                        </p>
                        
                        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
                            <button 
                                onClick={handleInstall}
                                disabled={installing}
                                className="flex items-center gap-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-xs transition-all shadow-sm disabled:opacity-50"
                            >
                                {installing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                {installing ? 'Installing Plugin...' : 'Install Dynmap'}
                            </button>
                            <button 
                                onClick={fetchStatus}
                                className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded border border-zinc-700 font-bold text-xs transition-all"
                            >
                                <RefreshCw size={16} className="inline mr-2" />
                                Re-scan
                            </button>
                        </div>

                        <div className="bg-muted/30 border border-border rounded-lg p-6 text-left max-w-lg mx-auto">
                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Deployment Checklist</h4>
                            <div className="space-y-3">
                                <div className="flex gap-3 text-xs text-muted-foreground">
                                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                                    <span>Download and install the latest Dynmap JAR automatically.</span>
                                </div>
                                <div className="flex gap-3 text-xs text-muted-foreground">
                                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                                    <span>Proxy discovery for port 8123 (Web GUI).</span>
                                </div>
                                <div className="flex gap-3 text-xs text-muted-foreground">
                                    <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                    <span>Requires a server restart after installation.</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // --- Scenario B: Installed & Ready ---
    return (
        <div className="h-full flex flex-col p-4 md:p-6 pt-2 space-y-4 animate-in fade-in duration-500">
            {/* Header / Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        <MapIcon size={24} className="text-primary" />
                        World Telemetry
                    </h2>
                    <div className="flex items-center gap-3 mt-1">
                        <div className={`w-2 h-2 rounded-full ${status.verified ? 'bg-emerald-500' : isPolling ? 'bg-primary animate-pulse' : 'bg-amber-500'}`}></div>
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest leading-none">
                            {status.verified ? 'Link Active' : isPolling ? 'Synchronizing Telemetry' : 'Waiting for Handshake'}
                        </span>
                        {status.port && (
                            <>
                                <span className="text-muted-foreground/30 text-xs">|</span>
                                <span className="text-[10px] font-mono text-muted-foreground/60">PORT: {status.port}</span>
                            </>
                        )}
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <button 
                        onClick={fetchStatus}
                        className="flex items-center gap-2 h-10 px-4 rounded bg-muted/50 hover:bg-muted border border-border text-foreground text-xs font-semibold transition-all"
                    >
                        <RefreshCw size={14} />
                        Refresh
                    </button>
                    
                    {status.verified && (
                        <div className="relative">
                            <div className="flex items-center bg-primary/10 border border-primary/20 rounded overflow-hidden">
                                <button 
                                    onClick={() => handleTriggerRender('update')}
                                    disabled={rendering}
                                    className="flex items-center gap-2 h-10 px-4 hover:bg-primary/20 text-primary text-xs font-semibold transition-all disabled:opacity-50 border-r border-primary/20"
                                    title="Fast render: Only update changed tiles"
                                >
                                    {rendering ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                                    Update Render
                                </button>
                                <button 
                                    onClick={() => setShowRenderOptions(!showRenderOptions)}
                                    className="h-10 px-2 hover:bg-primary/20 text-primary transition-all"
                                >
                                    <ChevronDown size={14} className={`transition-transform duration-200 ${showRenderOptions ? 'rotate-180' : ''}`} />
                                </button>
                            </div>

                            <AnimatePresence>
                                {showRenderOptions && (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                        className="absolute right-0 top-12 w-64 bg-card border border-border rounded-lg shadow-xl z-50 p-3 space-y-3"
                                    >
                                        <div className="space-y-1">
                                            <button 
                                                onClick={() => handleTriggerRender('full')}
                                                disabled={rendering}
                                                className="w-full flex items-center justify-between p-2 rounded hover:bg-muted/50 text-[11px] font-bold text-foreground transition-all group"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <RefreshCw size={12} className="text-amber-500" />
                                                    <span>Full World Render</span>
                                                </div>
                                                <span className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 uppercase tracking-tighter">Slow</span>
                                            </button>
                                            <p className="px-2 text-[9px] text-muted-foreground/60 leading-tight">Re-renders every single tile. Use for first-time setups or major world changes.</p>
                                        </div>

                                        <div className="pt-2 border-t border-border/60 space-y-2">
                                            <div className="flex items-center justify-between px-2">
                                                <div className="flex items-center gap-2">
                                                    <Target size={12} className="text-emerald-500" />
                                                    <span className="text-[11px] font-bold text-foreground">Radius Render</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <input 
                                                        type="number" 
                                                        value={renderRadius}
                                                        onChange={(e) => setRenderRadius(Math.max(10, parseInt(e.target.value) || 0))}
                                                        className="w-12 bg-muted border border-border rounded px-1 py-0.5 text-[10px] font-mono text-center outline-none focus:ring-1 focus:ring-primary/30"
                                                    />
                                                    <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter">Blocks</span>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleTriggerRender('radius')}
                                                disabled={rendering}
                                                className="w-full py-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 rounded text-[10px] font-bold transition-all disabled:opacity-50"
                                            >
                                                Trigger Radius Scan
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                    
                    {!status.verified ? (
                        <button 
                            onClick={() => handleVerify()}
                            disabled={verifying || isPolling}
                            className="flex items-center gap-2 h-10 px-6 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                        >
                            {verifying || isPolling ? <Loader2 size={16} className="animate-spin" /> : <ShieldAlert size={16} />}
                            {isPolling ? 'Auto-Syncing...' : 'Verify Link'}
                        </button>
                    ) : (
                        <button 
                            onClick={() => window.open(status.internalUrl, '_blank')}
                            className="flex items-center gap-2 h-10 px-4 rounded bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 text-xs font-semibold transition-all"
                        >
                            <ExternalLink size={14} />
                            External View
                        </button>
                    )}
                </div>
            </div>

            {/* Alerts Area */}
            <div className="space-y-4">
                {!status.verified && (
                    <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/10 flex gap-3 text-amber-600/80">
                        <AlertTriangle size={18} className="shrink-0" />
                        <div className="text-xs font-medium">
                            <span className="font-bold text-amber-700 block mb-0.5">Integration Handshake Required</span>
                            Plugin detected, but telemetry link is not established. Click "Verify Link" above or restart your server if you just installed it.
                        </div>
                    </div>
                )}

                {status.error && !isPolling && (
                    <div className="p-4 rounded-lg bg-rose-500/5 border border-rose-500/10 flex gap-3 text-rose-600/80">
                        <ShieldAlert size={18} className="shrink-0" />
                        <div className="text-xs font-medium uppercase tracking-wide">
                            <span className="font-bold text-rose-700 block mb-0.5 uppercase tracking-widest text-[10px]">Fault Detected</span>
                            {status.error}
                        </div>
                    </div>
                )}
            </div>

            {/* Main Viewport */}
            <div className="flex-1 min-h-[750px] border border-border rounded-xl overflow-hidden relative shadow-sm bg-card group">
                {/* Dashboard-style Module Header for the frame */}
                <div className="h-10 bg-muted/20 border-b border-border flex items-center px-4 shrink-0 justify-between">
                     <div className="flex items-center gap-2 opacity-60">
                         <div className={`w-1.5 h-1.5 rounded-full ${status.verified ? 'bg-emerald-500' : 'bg-zinc-500'}`}></div>
                         <span className="text-[10px] font-bold uppercase tracking-widest">Viewport Layer</span>
                     </div>
                     {status.verified && (
                         <span className="text-[10px] font-mono text-muted-foreground/40">{status.internalUrl}</span>
                     )}
                </div>

                <div className="absolute inset-0 top-10 flex">
                    <AnimatePresence mode="wait">
                        {status.verified && status.internalUrl ? (
                            <motion.div 
                                key="frame"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="w-full h-full"
                            >
                                <iframe 
                                    src={status.internalUrl} 
                                    className="w-full h-full border-0 grayscale-[0.3] hover:grayscale-0 transition-all duration-700"
                                    title="Dynmap Viewport"
                                />
                            </motion.div>
                        ) : (
                            <motion.div 
                                key="placeholder"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="w-full flex flex-col items-center justify-center text-center p-12 bg-muted/5"
                            >
                                <div className="w-20 h-20 rounded-full bg-muted/10 flex items-center justify-center mb-6 border border-border">
                                    <MapIcon size={32} className="text-muted-foreground/20" />
                                </div>
                                <h3 className="text-lg font-bold text-muted-foreground/30 uppercase tracking-[0.2em] mb-2">Telemetry Offline</h3>
                                <p className="text-xs text-muted-foreground/40 max-w-xs font-medium">
                                    Establish a secure handshake to unlock real-time world intelligence.
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};
