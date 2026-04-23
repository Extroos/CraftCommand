
import React, { useState, useEffect } from 'react';
import { Globe, Link, MapPin, RotateCw, Clock, ArrowRight, Shield, AlertCircle, CheckCircle2, ExternalLink, Copy, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import { STAGGER_CONTAINER, STAGGER_ITEM } from '../../styles/motion';
import { API } from '@core/services/api';
import { useToast } from '../ui/Toast';
import { useUser } from '@features/auth/context/UserContext';
import { useServers } from '@features/servers/context/ServerContext';
import { NetworkState } from '@shared/types/network';
import { DdnsWizard } from './DdnsWizard';
import { PublicAccessWizard } from './PublicAccessWizard';
import { Edit2, Save, X as CloseIcon, Zap } from 'lucide-react';

interface NetworkSettingsProps {
    serverId: string;
}

export const NetworkSettings: React.FC<NetworkSettingsProps> = ({ serverId }) => {
    const [state, setState] = useState<NetworkState | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [showWizard, setShowWizard] = useState(false);
    const [showPublicWizard, setShowPublicWizard] = useState(false);
    const { addToast } = useToast();
    const { user } = useUser();
    const { servers, updateServerConfig } = useServers();
    
    const server = servers.find(s => s.id === serverId);
    
    const [editData, setEditData] = useState({
        hostname: server?.network?.hostname || '',
        provider: server?.network?.provider || 'duckdns',
        token: server?.network?.token || '',
        updateEnabled: server?.network?.updateEnabled ?? true
    });

    useEffect(() => {
        if (server?.network) {
            setEditData({
                hostname: server.network.hostname || '',
                provider: server.network.provider || 'duckdns',
                token: server.network.token || '',
                updateEnabled: server.network.updateEnabled ?? true
            });
        }
    }, [server?.network]);

    const fetchState = async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const data = await API.get(`/api/network/status?serverId=${serverId}`);
            setState(data);
        } catch (e) {
            console.error('[NetworkSettings] Failed to fetch status:', e);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            // Trigger verification for the specific server's hostname if it exists
            if (state?.ddns?.hostname) {
                await API.post('/api/network/ddns/verify', { hostname: state.ddns.hostname });
            }
            await fetchState();
            addToast('success', 'Network', 'Diagnostics updated');
        } catch (e) {
            addToast('error', 'Network', 'Failed to refresh diagnostics');
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleForceUpdate = async () => {
        setIsUpdating(true);
        try {
            const res = await API.get(`/api/network/ddns/update?serverId=${serverId}`);
            setState({ ...state!, ddns: res });
            addToast('success', 'DDNS', 'Update signal sent successfully');
        } catch (e) {
            addToast('error', 'DDNS Update Failed', (e as Error).message);
        } finally {
            setIsUpdating(false);
        }
    };

    useEffect(() => {
        fetchState();
        const interval = setInterval(() => fetchState(true), 30000);
        return () => clearInterval(interval);
    }, [serverId]);

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        addToast('success', 'Copied', `${label} copied to clipboard`);
    };

    if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading Network Status...</div>;

    return (
        <motion.div 
            variants={STAGGER_CONTAINER}
            initial="hidden"
            animate="show"
            className="space-y-6"
        >
            {/* Status Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatusCard 
                    title="Public IP"
                    value={state?.publicIp.current || 'Unknown'}
                    icon={<Globe size={18} />}
                    status={state?.publicIp.current ? 'success' : 'warning'}
                    detail={state?.publicIp.lastChangedAt ? `Changed ${new Date(state.publicIp.lastChangedAt).toLocaleString()}` : 'Detecting...'}
                    quality={user?.preferences.visualQuality}
                />
                <StatusCard 
                    title="DDNS Resolution"
                    value={state?.ddns.hostname || 'Not Configured'}
                    icon={<Link size={18} />}
                    status={state?.ddns.isMatching ? 'success' : state?.ddns.hostname ? 'error' : 'neutral'}
                    detail={
                        state?.ddns.errorType === 'AUTH' ? 'Invalid DuckDNS Token' :
                        state?.ddns.errorType === 'NOT_FOUND' ? 'Hostname not found' :
                        state?.ddns.errorType === 'REFUSED' ? 'Nameserver refused lookup' :
                        state?.ddns.errorType === 'TIMEOUT' ? 'DNS query timed out' :
                        state?.ddns.error ? `Error: ${state.ddns.error}` : 
                        state?.ddns.resolvedIp ? `Resolves to ${state.ddns.resolvedIp}` : 'Awaiting sync'
                    }
                    quality={user?.preferences.visualQuality}
                />
                <StatusCard 
                    title="Tunnel Status"
                    value={server?.network?.publicAccess === 'cloudflare' ? 'Cloudflare' : server?.network?.publicAccess === 'playit' ? 'Playit.gg' : 'Inactive'}
                    icon={<Zap size={18} />}
                    status={server?.network?.publicAccess !== 'none' ? 'success' : 'neutral'}
                    detail={server?.network?.publicAccess !== 'none' ? 'Managed Gateway Active' : 'Traditional Port Forwarding'}
                    quality={user?.preferences.visualQuality}
                />
            </div>

            {/* Main Config Card */}
            <motion.div 
                variants={STAGGER_ITEM}
                className={`border border-border p-6 transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow rounded-2xl' : 'bg-card shadow-sm rounded-lg'}`}
            >
                <div className="flex items-start justify-between mb-6">
                    <div className="flex gap-4">
                        <div className="p-3 bg-primary/10 text-primary rounded-xl">
                            <MapPin size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold tracking-tight">Stable Connectivity</h3>
                            <p className="text-sm text-muted-foreground max-w-md">Connect with a memorable address like <span className="text-foreground font-medium">play.example.com</span> instead of a changing numeric IP.</p>
                        </div>
                    </div>
                    <button 
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="p-2 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <RotateCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Share Addresses section */}
                    <div className="space-y-4">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Global Share Links</label>
                        <div className="space-y-3">
                            <AddressBox 
                                label="DDNS / Hostname" 
                                value={`${state?.ddns.hostname || 'None'}:25565`} 
                                onCopy={() => copyToClipboard(state?.ddns.hostname!, 'Hostname')}
                                disabled={!state?.ddns.hostname}
                            />
                            <AddressBox 
                                label="Public IP (Direct)" 
                                value={`${state?.publicIp.current || 'Detecting...'}:25565`} 
                                onCopy={() => copyToClipboard(state?.publicIp.current!, 'Public IP')}
                                disabled={!state?.publicIp.current}
                            />
                        </div>
                        <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg flex gap-3 text-amber-600/80 text-xs">
                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                            <p>Public access requires <span className="font-bold text-amber-600">Port Forwarding</span> configured in your router for TCP 25565.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Configuration</label>
                            {!isEditing && (
                                <button 
                                    onClick={() => setIsEditing(true)}
                                    className="flex items-center gap-1.5 text-[10px] font-bold text-primary hover:text-primary/80 transition-colors uppercase tracking-widest"
                                >
                                    <Edit2 size={10} /> Edit Domain
                                </button>
                            )}
                        </div>
                        
                        {isEditing ? (
                            <div className="bg-secondary/40 rounded-xl p-5 border border-primary/20 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">Hostname</label>
                                        <input 
                                            type="text"
                                            value={editData.hostname}
                                            onChange={(e) => setEditData({ ...editData, hostname: e.target.value })}
                                            className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/30"
                                            placeholder="server.duckdns.org"
                                        />
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">Provider</label>
                                            <select 
                                                value={editData.provider}
                                                onChange={(e) => setEditData({ ...editData, provider: e.target.value as any })}
                                                className="w-full bg-background/50 border border-border rounded-lg px-2 py-2 text-xs focus:outline-none"
                                            >
                                                <option value="duckdns">DuckDNS</option>
                                                <option value="no-ip">No-IP</option>
                                                <option value="dynu">Dynu</option>
                                                <option value="custom">Custom</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">Token / Secret</label>
                                            <input 
                                                type="password"
                                                value={editData.token}
                                                onChange={(e) => setEditData({ ...editData, token: e.target.value })}
                                                className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/30"
                                                placeholder="Token..."
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between p-2.5 bg-primary/5 rounded-lg border border-primary/10">
                                        <div className="flex items-center gap-2">
                                            <Activity size={12} className="text-primary/70" />
                                            <span className="text-[9px] font-bold uppercase tracking-widest text-foreground/80">Auto-Update</span>
                                        </div>
                                        <button 
                                            onClick={() => setEditData({ ...editData, updateEnabled: !editData.updateEnabled })}
                                            className={`w-7 h-3.5 rounded-full flex items-center px-0.5 transition-all ${editData.updateEnabled ? 'bg-primary justify-end' : 'bg-muted justify-start'}`}
                                        >
                                            <div className="w-2.5 h-2.5 bg-white rounded-full shadow-sm" />
                                        </button>
                                    </div>
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <button 
                                        onClick={async () => {
                                            try {
                                                await API.updateServer(serverId, {
                                                    network: {
                                                        ...server?.network,
                                                        hostname: editData.hostname,
                                                        provider: editData.provider as any,
                                                        token: editData.token,
                                                        updateEnabled: editData.updateEnabled,
                                                        monitoringEnabled: true,
                                                        updateInterval: 60
                                                    }
                                                });
                                                updateServerConfig(serverId, {
                                                    network: {
                                                        ...server?.network,
                                                        hostname: editData.hostname,
                                                        provider: editData.provider as any,
                                                        token: editData.token,
                                                        updateEnabled: editData.updateEnabled,
                                                        monitoringEnabled: true,
                                                        updateInterval: 60
                                                    }
                                                });
                                                setIsEditing(false);
                                                addToast('success', 'Networking', 'Domain configuration saved');
                                                fetchState();
                                            } catch (e) {
                                                addToast('error', 'Error', 'Failed to save configuration');
                                            }
                                        }}
                                        className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm"
                                    >
                                        <Save size={12} /> Save
                                    </button>
                                    <button 
                                        onClick={() => setIsEditing(false)}
                                        className="px-4 bg-secondary text-foreground py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-border"
                                    >
                                        <CloseIcon size={12} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                                    Our dynamic DNS monitoring will alert you if your public IP changes and fails to match your configured hostname.
                                </p>
                                <button 
                                    onClick={() => setShowWizard(true)}
                                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity mb-2"
                                >
                                    Domain Setup Wizard <ArrowRight size={16} />
                                </button>

                                {!state?.ddns.isMatching && state?.ddns.hostname && (
                                    <button 
                                        onClick={handleForceUpdate}
                                        disabled={isUpdating}
                                        className="w-full flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground py-2.5 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all border border-border"
                                    >
                                        {isUpdating ? <RotateCw size={14} className="animate-spin" /> : <Activity size={14} />}
                                        Force DDNS Update
                                    </button>
                                )}
                            </div>
                        )}
                        
                        <div className="flex items-center justify-between text-xs px-1">
                            <span className="text-muted-foreground">Last Check</span>
                            <span className="font-mono text-foreground/70">{state?.ddns.lastVerifiedAt ? new Date(state.ddns.lastVerifiedAt).toLocaleTimeString() : 'Never'}</span>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Public Access Card */}
            <motion.div 
                variants={STAGGER_ITEM}
                className={`border border-border p-6 transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow rounded-2xl' : 'bg-card shadow-sm rounded-lg'}`}
            >
                <div className="flex items-start justify-between mb-6">
                    <div className="flex gap-4">
                        <div className="p-3 bg-violet-500/10 text-violet-500 rounded-xl">
                            <Zap size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold tracking-tight">{t('settings.networking.public_access')}</h3>
                            <p className="text-sm text-muted-foreground max-w-md">{t('settings.networking.public_access_desc')}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <Shield size={16} className="text-primary" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Active Provider</span>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${server?.network?.publicAccess !== 'none' ? 'bg-emerald-500/20 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                                    {server?.network?.publicAccess === 'cloudflare' ? 'Cloudflare' : server?.network?.publicAccess === 'playit' ? 'Playit.gg' : 'None'}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                                {server?.network?.publicAccess !== 'none' 
                                    ? t('settings.networking.tunnel_active_desc')
                                    : 'No automated tunnel configured. The server will rely on manual port forwarding.'
                                }
                            </p>
                            <button 
                                onClick={() => setShowPublicWizard(true)}
                                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity"
                            >
                                {t('settings.networking.provision_tunnel')} <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Tunnel Configuration</label>
                        <div className="bg-muted/20 border border-border rounded-xl p-4 space-y-4">
                            {server?.network?.publicAccess === 'cloudflare' && (
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">{t('settings.networking.cloudflare_token')}</label>
                                    <div className="font-mono text-xs p-2 bg-background/50 border border-border rounded-md truncate">
                                        ••••••••••••••••••••••••••••••••
                                    </div>
                                </div>
                            )}
                            {server?.network?.publicAccess === 'playit' && (
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">{t('settings.networking.playit_secret')}</label>
                                    <div className="font-mono text-xs p-2 bg-background/50 border border-border rounded-md truncate">
                                        ••••••••••••••••••••••••••••••••
                                    </div>
                                </div>
                            )}
                            {server?.network?.publicAccess === 'none' && (
                                <div className="py-4 text-center">
                                    <Activity size={24} className="text-muted-foreground/20 mx-auto mb-2" />
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">No Tunnel Data</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>

            {showWizard && <DdnsWizard serverId={serverId} onClose={() => { setShowWizard(false); fetchState(); }} currentIp={state?.publicIp.current} />}
            {showPublicWizard && <PublicAccessWizard serverId={serverId} onClose={() => { setShowPublicWizard(false); fetchState(); }} />}
        </motion.div>
    );
};

const StatusCard = ({ title, value, icon, status, detail, quality }: any) => (
    <motion.div 
        variants={STAGGER_ITEM}
        className={`p-4 border border-border flex flex-col gap-2 ${quality ? 'glass-morphism rounded-xl' : 'bg-card rounded-lg shadow-sm'}`}
    >
        <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-muted-foreground">
                {icon}
                <span className="text-[10px] font-bold uppercase tracking-wider">{title}</span>
            </div>
            {status === 'success' ? <CheckCircle2 size={14} className="text-emerald-500" /> : status === 'error' ? <AlertCircle size={14} className="text-rose-500" /> : null}
        </div>
        <div className="text-base font-bold truncate">{value}</div>
        <div className="text-[10px] text-muted-foreground truncate">{detail}</div>
    </motion.div>
);

const AddressBox = ({ label, value, onCopy, disabled }: any) => (
    <div className={`p-3 bg-secondary/30 rounded-lg border border-border/50 flex items-center justify-between transition-opacity ${disabled ? 'opacity-40' : ''}`}>
        <div className="min-w-0">
            <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">{label}</div>
            <div className="text-sm font-mono truncate">{value}</div>
        </div>
        <button 
            disabled={disabled}
            onClick={onCopy}
            className="p-2 hover:bg-secondary rounded-md text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
            <Copy size={16} />
        </button>
    </div>
);
