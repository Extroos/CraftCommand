
import React, { useState, useMemo } from 'react';
import { 
    Plus, Link2, Globe, Server, ShieldCheck, 
    Trash2, Network, Info, Check, X, LayoutGrid, Zap, Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useServers } from '@features/servers/context/ServerContext';
import { useToast } from '@features/ui/Toast';
import { API } from '@core/services/api';
import { useUser } from '@features/auth/context/UserContext';
import pkg from '../../../package.json';
import { useConfirm } from '../ui/hooks/useConfirm';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface ProxyNetworkManagerProps {
    serverId: string;
}

const ProxyNetworkManager: React.FC<ProxyNetworkManagerProps> = React.memo(({ serverId }) => {
    const { servers, refreshServers } = useServers();
    const { user } = useUser();
    const { addToast } = useToast();
    
    const proxyServer = servers.find(s => s.id === serverId);
    const [isLinking, setIsLinking] = useState(false);
    const [selectedBackendId, setSelectedBackendId] = useState('');
    const [alias, setAlias] = useState('');
    const [loading, setLoading] = useState(false);
    const [installingSuite, setInstallingSuite] = useState(false);
    const { isOpen: isConfirmOpen, config: confirmConfig, confirm: requestConfirm, handleConfirm, handleCancel } = useConfirm();

    // List of servers NOT already linked
    const availableBackends = useMemo(() => {
        if (!proxyServer) return [];
        const linkedIds = proxyServer.network?.proxyConfig?.links.map(l => l.serverId) || [];
        return servers.filter(s => s.id !== serverId && !linkedIds.includes(s.id));
    }, [servers, proxyServer, serverId]);

    const handleLink = async () => {
        if (!selectedBackendId || !alias) return;
        setLoading(true);
        try {
            await API.linkServerToProxy(serverId, selectedBackendId, alias);
            addToast('success', 'Server Linked', `Link for ${alias} created successfully.`);
            await refreshServers();
            setIsLinking(false);
            setSelectedBackendId('');
            setAlias('');
        } catch (e: any) {
            addToast('error', 'Link Failed', e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleUnlink = async (backendId: string) => {
        const isConfirmed = await requestConfirm({
            title: 'Unlink Server',
            description: 'Are you sure you want to unlink this server?',
            confirmText: 'Unlink',
            cancelText: 'Cancel'
        });
        if (!isConfirmed) return;

        try {
            await API.unlinkServerFromProxy(serverId, backendId);
            addToast('success', 'Server Unlinked', 'The connection has been removed.');
            await refreshServers();
        } catch (e: any) {
            addToast('error', 'Unlink Failed', e.message);
        }
    };

    const handleInstallViaSuite = async () => {
        const isConfirmed = await requestConfirm({
            title: 'Install Via Suite',
            description: 'This will install ViaVersion, ViaBackwards, and ViaRewind on your proxy. Continue?',
            confirmText: 'Install',
            cancelText: 'Cancel'
        });
        if (!isConfirmed) return;

        setInstallingSuite(true);
        try {
            await API.installViaSuite(serverId);
            addToast('success', 'Via Suite Installed', 'ViaVersion, ViaBackwards, and ViaRewind are now being prepared.');
            await refreshServers();
        } catch (e: any) {
            addToast('error', 'Installation Failed', e.message);
        } finally {
            setInstallingSuite(false);
        }
    };

    if (!proxyServer) return null;

    const links = proxyServer.network?.proxyConfig?.links || [];

    return (
        <div className="space-y-6 pb-20">
            {/* Header / Stats Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`p-6 rounded-xl border border-border flex items-center gap-5 transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card shadow-sm'}`}>
                    <div className="text-muted-foreground/40">
                        <Link2 size={22} strokeWidth={1.5} />
                    </div>
                    <div>
                        <div className="text-xl font-bold text-foreground tracking-tight">{links.length}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">Managed Links</div>
                    </div>
                </div>
                
                <div className={`p-6 rounded-xl border border-border flex items-center gap-5 transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card shadow-sm'}`}>
                    <div className="text-muted-foreground/40">
                        <Globe size={22} strokeWidth={1.5} />
                    </div>
                    <div>
                        <div className="text-xl font-bold text-foreground tracking-tight">{availableBackends.length}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">Available Nodes</div>
                    </div>
                </div>

                <div className={`p-6 rounded-xl border border-border flex items-center gap-5 transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card shadow-sm'}`}>
                    <div className="text-muted-foreground/40">
                        <ShieldCheck size={22} strokeWidth={1.5} />
                    </div>
                    <div>
                        <div className="text-xl font-bold text-emerald-500/80 tracking-tight">ENCRYPTED</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">Sync Status</div>
                    </div>
                </div>
            </div>

            {/* Main Grid: Links List */}
            <div className={`p-8 border border-border rounded-2xl transition-all duration-500 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card shadow-sm'}`}>
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Linked Servers</h2>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">Servers currently routed through this proxy.</p>
                    </div>
                    <button 
                        onClick={() => setIsLinking(true)}
                        className="h-10 px-6 rounded-xl bg-primary text-primary-foreground font-bold text-[10px] uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all shadow-sm"
                    >
                        LINK SERVER
                    </button>
                </div>

                <div className="">
                    {links.length === 0 ? (
                        <div className="py-16 border border-dashed border-border rounded-xl flex flex-col items-center justify-center text-center">
                            <Network size={28} strokeWidth={1} className="text-muted-foreground/20 mb-4" />
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">No servers linked yet</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {links.map((link) => {
                                const backend = servers.find(s => s.id === link.serverId);
                                return (
                                    <motion.div 
                                        key={link.serverId}
                                        layout
                                        className="p-6 border border-border rounded-xl bg-muted/20 hover:bg-muted/40 transition-all group relative overflow-hidden"
                                    >
                                        <div className="flex justify-between items-start mb-6">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-1.5 h-1.5 rounded-full ${backend?.status === 'ONLINE' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-zinc-800'}`} />
                                                <div>
                                                    <div className="text-xs font-bold text-foreground">{link.alias}</div>
                                                    <div className="text-[9px] text-muted-foreground font-mono tracking-tighter mt-0.5">ID: {link.serverId.substring(0, 8)}...</div>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleUnlink(link.serverId)}
                                                className="p-2 text-muted-foreground/20 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                                            >
                                                <Trash2 size={14} strokeWidth={1.5} />
                                            </button>
                                        </div>

                                        <div className="flex flex-col gap-6">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-[0.2em] mb-1">internal addr</div>
                                                    <div className="font-mono text-xs text-foreground/60">{backend?.ip === '127.0.0.1' ? 'Internal' : backend?.ip}:{backend?.port}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-[0.2em] mb-1">Protocol</div>
                                                    <div className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">{backend?.software || 'Minecraft'}</div>
                                                </div>
                                            </div>
                                            <div className="h-px bg-border/50 w-full" />
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <ShieldCheck size={12} className="text-emerald-500/40" />
                                                    <span className="text-[8px] font-bold text-emerald-500/60 uppercase tracking-widest">Bridged</span>
                                                </div>
                                                <div className={`text-[9px] font-bold uppercase tracking-widest ${backend?.status === 'ONLINE' ? 'text-emerald-500' : 'text-muted-foreground/40'}`}>
                                                    {backend?.status || 'UNKNOWN'}
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Multi-Version Control Section */}
            <div className={`p-8 rounded-[32px] border border-border transition-all duration-500 flex flex-col md:flex-row gap-8 items-center ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card shadow-sm'}`}>
                <div className="bg-muted p-6 rounded-2xl text-muted-foreground/40 shrink-0">
                    <Zap size={32} strokeWidth={1} />
                </div>
                <div className="flex-1 text-center md:text-left">
                    <div className="flex items-center gap-3 text-muted-foreground/30 mb-2 justify-center md:justify-start">
                        <LayoutGrid size={13} strokeWidth={1.5} />
                        <span className="text-[9px] font-bold uppercase tracking-[0.3em]">Proxy</span>
                    </div>
                    <h3 className="text-xl font-bold text-foreground tracking-tight">Multi-Version Support</h3>
                    <p className="text-[11px] text-muted-foreground/60 max-w-xl mt-2 leading-relaxed uppercase tracking-wider font-medium">
                        Install <span className="text-foreground/60 font-bold">ViaVersion, ViaBackwards, and ViaRewind</span> on your proxy. 
                        Enables cross-version compatibility from 1.7 to latest.
                    </p>
                </div>
                <button 
                    onClick={handleInstallViaSuite}
                    disabled={installingSuite}
                    className={`h-12 px-8 rounded-xl font-bold text-[10px] uppercase tracking-[0.2em] transition-all flex items-center gap-3 ${
                        installingSuite 
                        ? 'bg-muted text-muted-foreground cursor-not-allowed border border-border' 
                        : 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm'
                    }`}
                >
                    {installingSuite ? (
                        <>
                            <div className="w-3 h-3 border-2 border-current border-t-transparent animate-spin rounded-full" />
                            Initializing
                        </>
                    ) : (
                        <>
                            <Download size={14} /> Install ViaVersion
                        </>
                    )}
                </button>
            </div>

            {/* Forced Hosts Section */}
            <div className={`p-8 rounded-[32px] border border-border transition-all duration-500 flex flex-col md:flex-row gap-8 items-center opacity-40 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card shadow-sm'}`}>
                 <div className="bg-muted p-6 rounded-2xl text-muted-foreground/30 shrink-0">
                    <Globe size={32} strokeWidth={1} />
                 </div>
                 <div className="flex-1 text-center md:text-left">
                    <div className="flex items-center gap-3 text-muted-foreground/20 mb-2 justify-center md:justify-start">
                        <Globe size={13} strokeWidth={1.5} />
                        <span className="text-[9px] font-bold uppercase tracking-[0.3em]">Network Routing</span>
                    </div>
                    <h3 className="text-xl font-bold text-foreground/40 tracking-tight">Forced Hosts (Coming Soon)</h3>
                    <p className="text-[10px] text-muted-foreground/30 max-w-xl mt-2 leading-relaxed uppercase tracking-widest font-bold">
                        Domain-based routing support (v{pkg.version})
                    </p>
                </div>
            </div>

            <AnimatePresence>
                {isLinking && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 text-left">
                        <motion.div 
                            initial={{ opacity: 0, y: 40 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 40 }}
                            className="bg-card border border-border rounded-[32px] shadow-2xl w-full max-w-xl overflow-hidden"
                        >
                            <div className="p-10 pb-6 flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-3 text-muted-foreground/20 mb-4">
                                        <Link2 size={16} strokeWidth={1.5} />
                                        <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Proxy</span>
                                    </div>
                                    <h3 className="text-3xl font-bold text-foreground tracking-tight">Add Link</h3>
                                </div>
                                <button onClick={() => setIsLinking(false)} className="p-2 bg-muted hover:bg-muted/80 rounded-xl transition-all text-muted-foreground/40 hover:text-foreground">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-10 pt-0 space-y-8">
                                <div>
                                    <label className="text-[10px] font-bold text-muted-foreground/30 uppercase tracking-[0.2em] mb-4 block">
                                        Available Instances
                                    </label>
                                    {availableBackends.length === 0 ? (
                                        <div className="p-5 border border-border bg-muted/20 rounded-2xl text-muted-foreground text-xs flex items-center gap-4">
                                            <Info size={16} />
                                            <span>No available Java servers found.</span>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar text-center md:text-left">
                                            {availableBackends.map(s => (
                                                <button
                                                    key={s.id}
                                                    onClick={() => setSelectedBackendId(s.id)}
                                                    className={`p-4 rounded-xl border text-left transition-all ${
                                                        selectedBackendId === s.id 
                                                        ? 'bg-primary text-primary-foreground border-primary' 
                                                        : 'bg-muted/20 hover:bg-muted/40 border-border text-muted-foreground hover:text-foreground'
                                                    }`}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-1.5 h-1.5 rounded-full ${s.status === 'ONLINE' ? (selectedBackendId === s.id ? 'bg-primary-foreground' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]') : 'bg-zinc-800'}`} />
                                                            <span className="text-sm font-bold">{s.name}</span>
                                                        </div>
                                                        <span className={`text-[9px] font-bold uppercase tracking-widest ${selectedBackendId === s.id ? 'opacity-60' : 'opacity-30'}`}>{s.software}</span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-muted-foreground/30 uppercase tracking-[0.2em] mb-4 block">
                                        Route Alias
                                    </label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. survival_node"
                                        value={alias}
                                        onChange={(e) => setAlias(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                                        className="w-full bg-muted/20 border border-border rounded-xl px-5 py-4 text-sm text-foreground focus:border-primary/50 outline-none transition-all font-bold placeholder:text-muted-foreground/20"
                                    />
                                </div>

                                <div className="p-5 border border-border bg-muted/10 rounded-xl flex gap-4 items-start">
                                    <ShieldCheck size={18} className="text-muted-foreground/30 shrink-0 mt-0.5" />
                                    <p className="text-[10px] text-muted-foreground leading-relaxed uppercase tracking-widest font-medium">
                                        IP-Forwarding and Secret Sync will be applied to <span className="text-foreground/60">velocity.toml</span>.
                                    </p>
                                </div>

                                <div className="flex flex-col md:flex-row gap-3 pt-2">
                                    <button 
                                        onClick={handleLink}
                                        disabled={!selectedBackendId || !alias || loading}
                                        className={`
                                            flex-1 h-12 rounded-xl font-bold text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3
                                            ${(!selectedBackendId || !alias || loading) 
                                                ? 'bg-muted text-muted-foreground cursor-not-allowed border border-border' 
                                                : 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm'}
                                        `}
                                    >
                                        {loading ? (
                                            <div className="w-4 h-4 border-2 border-current border-t-transparent animate-spin rounded-full" />
                                        ) : (
                                            <Check size={14} strokeWidth={3} />
                                        )}
                                        {loading ? 'Processing' : 'Link Server'}
                                    </button>
                                    <button 
                                        onClick={() => setIsLinking(false)}
                                        className="h-12 px-6 rounded-xl text-[10px] font-bold text-muted-foreground hover:text-foreground uppercase tracking-[0.2em] transition-all border border-border bg-muted/10"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <ConfirmDialog 
                isOpen={isConfirmOpen}
                {...confirmConfig}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
            />
        </div>
    );
});

export default ProxyNetworkManager;
