import React, { useState, useEffect, useCallback } from 'react';
// import { useParams } from 'react-router-dom'; // Removed
import { motion, AnimatePresence } from 'framer-motion';
import { Player } from '@shared/types';
import { Shield, Ban, Trash2, UserPlus, UserCheck, Gavel, Crown, Search, Eye, EyeOff, Globe, RotateCw, Loader2, Users, Copy, Check, History as ActivityHistory } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { API } from '@core/services/api';
import { socketService } from '@core/services/socket';
import { useServers } from '@features/servers/context/ServerContext';
import { usePermissions } from '@features/auth/hooks/usePermissions';
import { useUser } from '@features/auth/context/UserContext';
import ActivityTimeline from './ActivityTimeline';

type ListType = 'ONLINE' | 'ALL' | 'WHITELIST' | 'OPS' | 'BANNED' | 'IP_BANNED' | 'ACTIVITY';

const getGridTemplate = (activeList: ListType) => {
    if (activeList === 'IP_BANNED') return 'grid-cols-[1fr_140px]';
    if (activeList === 'ONLINE' || activeList === 'ALL') return 'grid-cols-[2fr_1.5fr_1fr_1fr_140px]';
    return 'grid-cols-[2fr_1.5fr_140px]';
};

const PlayerSkeleton = ({ activeList }: { activeList: ListType }) => (
    <div className={`grid ${getGridTemplate(activeList)} gap-4 p-2.5 items-center animate-pulse border-b border-border/50`}>
        {activeList !== 'IP_BANNED' && (
            <div className="flex gap-3 items-center"><div className="h-8 w-8 bg-muted rounded-md" /><div className="h-4 w-24 bg-muted rounded" /></div>
        )}
        <div><div className="h-4 w-32 bg-muted rounded" /></div>
        {(activeList === 'ONLINE' || activeList === 'ALL') && (
            <>
                <div><div className="h-4 w-24 bg-muted rounded" /></div>
                <div><div className="h-4 w-16 bg-muted rounded" /></div>
            </>
        )}
        <div className="flex justify-end"><div className="h-6 w-20 bg-muted rounded" /></div>
    </div>
);

interface PlayerManagerProProps {
    serverId?: string;
}

const PlayerManagerPro: React.FC<PlayerManagerProProps> = ({ serverId }) => {
    // const { id } = useParams<{ id: string }>(); // Deprecated in favor of Prop
    const id = serverId; // Alias for compatibility with existing code
    const [activeList, setActiveList] = useState<ListType>('ONLINE');
    const view = activeList === 'ACTIVITY' ? 'activity' : 'list';
    const { can } = usePermissions();
    const { user } = useUser();
    const canManage = can('server.players.manage', serverId);
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showIps, setShowIps] = useState(false);
    const [addInput, setAddInput] = useState('');
    const [copied, setCopied] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, player: Player } | null>(null);
    
    const { addToast } = useToast();

    // Close context menu on click outside
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const { players: globalPlayers, refreshServerData, loading: contextLoading } = useServers();
    const onlinePlayers = globalPlayers[id] || [];

    const fetchPlayers = useCallback(async () => {
        if (!id) return;
        
        // If we are looking for ONLINE players, we rely on context
        if (activeList === 'ONLINE') {
            await refreshServerData(id);
            return;
        }

        if (view === 'activity') return; // Activity is handled by its own component
        setLoading(true);
        try {
            const apiType = activeList === 'ALL' ? 'all' :
                          activeList === 'WHITELIST' ? 'whitelist' : 
                          activeList === 'OPS' ? 'ops' :
                          activeList === 'BANNED' ? 'banned-players' : 'banned-ips';

            const data = await API.getPlayers(id, apiType);
            
            const normalized: Player[] = data.map((p: any) => {
                const isOnline = p.online === true; 
                
                return {
                    name: p.name || (p.ip ? 'Unknown' : 'Unknown'),
                    uuid: p.uuid || p.ip || 'unknown',
                    skinUrl: p.skinUrl || (p.name ? `https://mc-heads.net/avatar/${p.name}/64` : ''),
                    isOp: p.level ? p.level >= 4 : p.isOp,
                    ping: p.ping,
                    ip: p.ip,
                    online: isOnline,
                    lastSeen: p.lastSeen,
                    isIp: activeList === 'IP_BANNED',
                    banReason: p.reason || p.banReason,
                    banCreated: p.created || p.banCreated,
                    banExpires: p.expires || p.banExpires,
                };
            });

            setPlayers(normalized);
        } catch (e) {
            console.error(e);
            addToast('error', 'Fetch Failed', 'Could not load player list.');
        } finally {
            setLoading(false);
        }
    }, [id, activeList, addToast, refreshServerData]);

    // Initial Fetch on Change
    useEffect(() => {
        fetchPlayers();
    }, [fetchPlayers, id, activeList]);

    // Real-time Updates Lifecycle
    useEffect(() => {
        if (!id) return;
        
        const handleJoin = (data: { serverId: string, name: string }) => {
            if (data.serverId === id) {
                addToast('info', 'Player Join', `${data.name} joined the game`);
                if (activeList === 'ONLINE') {
                    refreshServerData(id);
                } else {
                    fetchPlayers();
                }
            }
        };
        
        const handleLeave = (data: { serverId: string, name: string }) => {
            if (data.serverId === id) {
                addToast('info', 'Player Leave', `${data.name} left the game`);
                if (activeList === 'ONLINE') {
                    refreshServerData(id);
                } else {
                    fetchPlayers();
                }
            }
        };

        const unsubJoin = socketService.onPlayerJoin(handleJoin);
        const unsubLeave = socketService.onPlayerLeave(handleLeave);
        
        return () => {
            unsubJoin();
            unsubLeave();
        };
    }, [id, activeList, refreshServerData, fetchPlayers, addToast]);

    // Derived list
    const displayedPlayers = activeList === 'ONLINE' ? onlinePlayers : players;
    const isLoading = activeList === 'ONLINE' ? contextLoading : (loading || contextLoading);

    const handleAction = async (player: Player, action: 'KICK' | 'BAN' | 'OP' | 'DEOP' | 'UNBAN' | 'UNWHITELIST' | 'BAN_IP') => {
        if (!id) return;
        
        if (!canManage) {
            addToast('error', 'Access Denied', 'You do not have permission to moderate players.');
            return;
        }

        try {
            if (action === 'KICK') {
                await API.kickPlayer(id, player.name, 'Kicked by operator');
                addToast('success', 'Kicked', `Kicked ${player.name}`);
                fetchPlayers(); // Refresh safely
            } else if (action === 'BAN') {
                await API.addPlayer(id, 'banned-players', player.name);
                addToast('warning', 'Banned', `Banned ${player.name}`);
                fetchPlayers();
            } else if (action === 'UNBAN') {
                // Determine if unbanning name or IP
                const type = activeList === 'IP_BANNED' ? 'banned-ips' : 'banned-players';
                const identifier = activeList === 'IP_BANNED' ? player.ip! : player.name;
                await API.removePlayer(id, type, identifier);
                addToast('success', 'Unbanned', `Unbanned ${identifier}`);
                setPlayers(prev => prev.filter(p => activeList === 'IP_BANNED' ? p.ip !== identifier : p.name !== identifier));
            } else if (action === 'OP') {
                await API.addPlayer(id, 'ops', player.name);
                addToast('success', 'Promoted', `${player.name} is now an operator`);
                fetchPlayers();
            } else if (action === 'DEOP') {
                await API.removePlayer(id, 'ops', player.name);
                await refreshServerData(id);
                fetchPlayers();
                addToast('success', 'Permissions Revoked', `${player.name} is no longer an operator.`);
            } else if (action === 'UNWHITELIST') {
                await API.removePlayer(id, 'whitelist', player.name);
                addToast('info', 'Removed', `${player.name} removed from whitelist`);
                setPlayers(prev => prev.filter(p => p.name !== player.name));
            } else if (action === 'BAN_IP' && player.ip) {
                 await API.addPlayer(id, 'banned-ips', player.ip);
                 addToast('warning', 'IP Banned', `Banned IP ${player.ip}`);
            }

        } catch (e: any) {
            addToast('error', 'Action Failed', e.message || 'Operation failed');
        }
    };

    const handleAdd = async () => {
        if (!id || !addInput) return;

        if (!canManage) {
            addToast('error', 'Access Denied', 'You do not have permission to moderate players.');
            return;
        }

        try {
            const apiType = activeList === 'WHITELIST' ? 'whitelist' : 
                          activeList === 'OPS' ? 'ops' :
                          activeList === 'BANNED' ? 'banned-players' : 
                          activeList === 'IP_BANNED' ? 'banned-ips' : null;
            
            if (!apiType) return; // Cannot add to 'online' or 'all'

            await API.addPlayer(id, apiType, addInput);
            addToast('success', 'Added', `Added ${addInput} to list`);
            setAddInput('');
            fetchPlayers();
        } catch (e: any) {
            addToast('error', 'Add Failed', e.message);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(text);
        setTimeout(() => setCopied(null), 1500);
        addToast('info', 'Copied', 'Copied to clipboard');
    };

    const filteredPlayers = displayedPlayers.filter(p => 
        (p.name && p.name.toLowerCase().includes(searchTerm.toLowerCase())) || 
        (p.ip && p.ip.includes(searchTerm)) ||
        (p.uuid && p.uuid.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const maskIp = (ip?: string) => {
        if (!ip) return 'Unknown';
        if (showIps) return ip;
        const parts = ip.split('.');
        return `${parts[0]}.${parts[1]}.*.*`;
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 animate-fade-in items-start">
            {/* Sidebar Controls */}
            <div className="lg:col-span-1 space-y-6">
                <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                    <nav className="flex flex-col">
                        {[
                            { id: 'ONLINE', label: 'Online Players', icon: <UserCheck size={16} />, color: 'emerald' },
                            { id: 'ACTIVITY', label: 'Live Activity', icon: <ActivityHistory size={16} />, color: 'amber' },
                            { id: 'ALL', label: 'All Players', icon: <Users size={16} />, color: 'blue' },
                            { id: 'WHITELIST', label: 'Whitelist', icon: <Shield size={16} />, color: 'primary' },
                            { id: 'OPS', label: 'Operators', icon: <Crown size={16} />, color: 'amber' },
                            { id: 'BANNED', label: 'Ban List', icon: <Ban size={16} />, color: 'destructive' },
                            { id: 'IP_BANNED', label: 'IP Bans', icon: <Globe size={16} />, color: 'rose' }
                        ].map((tab) => (
                            <button 
                                key={tab.id}
                                onClick={() => setActiveList(tab.id as ListType)}
                                className={`flex items-center justify-between p-4 border-l-2 transition-all ${
                                    activeList === tab.id 
                                    ? `bg-secondary/50 border-${tab.color === 'primary' ? 'blue' : tab.color}-500` 
                                    : 'border-transparent hover:bg-secondary/30'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-1.5 rounded bg-${tab.color === 'primary' ? 'blue' : tab.color}-500/10 text-${tab.color === 'primary' ? 'blue' : tab.color}-500`}>
                                        {tab.icon}
                                    </div>
                                    <span className="font-medium text-sm">{tab.label}</span>
                                </div>
                            </button>
                        ))}
                    </nav>
                </div>

                {activeList !== 'ONLINE' && activeList !== 'ALL' && canManage && (
                    <div className="bg-blue-900/10 border border-blue-900/30 rounded-xl p-4">
                        <h3 className="text-sm font-semibold text-blue-400 mb-2">
                            Add to {activeList === 'OPS' ? 'Operators' : activeList === 'WHITELIST' ? 'Whitelist' : activeList === 'BANNED' ? 'Ban List' : 'IP Ban List'}
                        </h3>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                placeholder={activeList === 'IP_BANNED' ? "IP Address..." : "Username..."}
                                value={addInput}
                                onChange={(e) => setAddInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                className="w-full bg-background/50 border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <button 
                                onClick={handleAdd}
                                className="p-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-500 hover:text-white transition-all"
                            >
                                <UserPlus size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Main Content */}
            {/* Main Content */}
            <div className="lg:col-span-3 min-w-0">
                {activeList === 'ACTIVITY' ? (
                    <ActivityTimeline serverId={id!} />
                ) : (
                    <div className="bg-card border border-border rounded-xl flex flex-col h-full overflow-hidden shadow-sm">
                        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
                            <h2 className="font-semibold text-lg tracking-tight flex items-center gap-3">
                                {activeList === 'ONLINE' ? 'Server Roster' : 
                                 activeList === 'ALL' ? 'All Known Players' :
                                 activeList === 'WHITELIST' ? 'Whitelisted Users' :
                                 activeList === 'OPS' ? 'Server Operators' : 
                                 activeList === 'IP_BANNED' ? 'Blocked IP Addresses' : 'Banned Users'}
                                 
                                {isLoading && <Loader2 size={16} className="animate-spin text-muted-foreground" />}
                            </h2>
                            <div className="flex gap-3">
                                <button 
                                     onClick={fetchPlayers}
                                     className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
                                     title="Refresh List"
                                >
                                    <RotateCw size={16} className={isLoading ? "animate-spin" : ""} />
                                </button>
                                {(activeList === 'ONLINE' || activeList === 'ALL') && (
                                    <button 
                                        onClick={() => setShowIps(!showIps)}
                                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
                                        title={showIps ? "Hide IPs" : "Show IPs"}
                                    >
                                        {showIps ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                )}
                                <div className="relative w-64">
                                    <Search className="absolute left-2.5 top-2.5 text-muted-foreground h-4 w-4" />
                                    <input 
                                        type="text" 
                                        placeholder="Search..." 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2">
                            <div className="flex flex-col flex-1 min-h-0 font-mono">
                                <div className={`grid ${getGridTemplate(activeList)} gap-4 p-3 border-b border-border bg-muted/20 font-semibold text-[11px] text-muted-foreground tracking-wider uppercase items-center sticky top-0 z-10`}>
                                    {activeList !== 'IP_BANNED' ? <div>User</div> : <div>IP Address</div>}
                                    {activeList !== 'IP_BANNED' && <div>UUID</div>}
                                    {(activeList === 'ONLINE' || activeList === 'ALL') && <div>IP Address</div>}
                                    {(activeList === 'ONLINE' || activeList === 'ALL') && <div>Status</div>}
                                    <div className="text-right">Actions</div>
                                </div>
                                <div className="flex flex-col flex-1">
                                    {isLoading ? (
                                        <>
                                            <PlayerSkeleton activeList={activeList} />
                                            <PlayerSkeleton activeList={activeList} />
                                            <PlayerSkeleton activeList={activeList} />
                                        </>
                                    ) : (
                                        <AnimatePresence mode="popLayout">
                                            {filteredPlayers.length === 0 ? (
                                                 <motion.div 
                                                    initial={{ opacity: 0 }} 
                                                    animate={{ opacity: 1 }} 
                                                    key="empty"
                                                    className="flex-1 flex flex-col items-center justify-center p-12 text-center"
                                                >
                                                    <div className="flex flex-col items-center justify-center text-muted-foreground opacity-50">
                                                        <UserCheck size={48} className="mb-4" />
                                                        <p>No players found in this list.</p>
                                                        <p className="text-xs mt-1">Try changing tabs or adding a player.</p>
                                                    </div>
                                                </motion.div>
                                            ) : (
                                                filteredPlayers.map((player) => (
                                                    <motion.div 
                                                        key={player.uuid + player.name} 
                                                        layout
                                                        initial={{ opacity: 0, scale: 0.95 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        exit={{ opacity: 0, scale: 0.95 }}
                                                        transition={{ duration: 0.15 }}
                                                        onContextMenu={(e) => {
                                                            e.preventDefault();
                                                            setContextMenu({ x: e.clientX, y: e.clientY, player });
                                                        }}
                                                        className={`grid ${getGridTemplate(activeList)} gap-4 p-2.5 items-center border-b border-border/50 bg-muted/10 hover:bg-muted/30 transition-colors group relative`}
                                                    >
                                                        {activeList !== 'IP_BANNED' && (
                                                            <div>
                                                                <div className="flex items-center gap-3">
                                                                    <div className="relative">
                                                                        <img 
                                                                            src={player.skinUrl} 
                                                                            alt={player.name} 
                                                                            className={`w-8 h-8 rounded-md bg-muted ${!player.online && activeList === 'ALL' ? 'grayscale opacity-70' : ''}`} 
                                                                            onError={(e) => {
                                                                                (e.target as HTMLImageElement).src = 'https://mc-heads.net/avatar/steve/64';
                                                                            }}
                                                                        />
                                                                        {activeList === 'ALL' && (
                                                                            <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-card ${player.online ? 'bg-emerald-500' : 'bg-gray-400'}`}></div>
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <div className="font-medium flex items-center gap-1.5 line-clamp-1 break-all">
                                                                            {player.name}
                                                                            {player.isOp && activeList !== 'OPS' && <Crown size={12} className="text-amber-500 shrink-0" fill="currentColor" />}
                                                                        </div>
                                                                        <div className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded w-fit mt-0.5">
                                                                            {player.online ? 'Online' : 'Offline'}
                                                                        </div>
                                                                    </div>
                                                                    {activeList === 'BANNED' && player.banReason && (
                                                                        <div className="text-[9px] text-muted-foreground/60 mt-0.5 italic truncate max-w-[200px]" title={player.banReason}>
                                                                            Reason: {player.banReason}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                        <div className="font-mono text-xs text-muted-foreground">
                                                            <div className="flex items-center gap-2 group/uuid">
                                                                <span className="truncate">{activeList === 'IP_BANNED' ? player.ip : player.uuid?.substring(0, 18) + (player.uuid?.length > 18 ? '...' : '')}</span>
                                                                <button 
                                                                    onClick={() => copyToClipboard(activeList === 'IP_BANNED' ? player.ip! : player.uuid)}
                                                                    className="opacity-0 group-hover/uuid:opacity-100 transition-opacity hover:text-foreground shrink-0"
                                                                >
                                                                    {copied === (activeList === 'IP_BANNED' ? player.ip : player.uuid) ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                                                                </button>
                                                            </div>
                                                        </div>
                                                        
                                                        {(activeList === 'ONLINE' || activeList === 'ALL') && (
                                                            <div className="font-mono text-xs text-muted-foreground">
                                                                <span className={`px-2 py-0.5 rounded flex items-center w-fit ${showIps ? 'bg-secondary' : 'blur-[4px] bg-secondary/50'}`}>
                                                                    {maskIp(player.ip)}
                                                                </span>
                                                            </div>
                                                        )}

                                                        {(activeList === 'ONLINE' || activeList === 'ALL') && (
                                                            <div>
                                                                {player.online ? (
                                                                    <div className="flex items-center gap-1.5">
                                                                        <div className={`w-2 h-2 rounded-full ${player.ping !== undefined && player.ping < 50 ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                                                                        <span className="font-mono text-xs">{player.ping || 0}ms</span>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-xs text-muted-foreground">
                                                                        Last seen: {player.lastSeen ? new Date(player.lastSeen).toLocaleDateString() : 'Unknown'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                        
                                                        <div className="text-right flex items-center justify-end">
                                                            <div className="flex items-center justify-end gap-1 opacity-100 transition-opacity">
                                                                {(activeList === 'ONLINE' || activeList === 'ALL') && (
                                                                    <>
                                                                        {player.online && (
                                                                            <button 
                                                                                onClick={() => handleAction(player, 'KICK')}
                                                                                disabled={!canManage}
                                                                                className={`px-2 py-1 text-[11px] font-medium border border-border rounded transition-colors ${!canManage ? 'opacity-40 cursor-not-allowed' : 'hover:bg-secondary hover:text-foreground'}`}
                                                                                title={canManage ? "Kick Player" : "Insufficient Permissions"}
                                                                            >
                                                                                Kick
                                                                            </button>
                                                                        )}
                                                                        <button 
                                                                            onClick={() => handleAction(player, 'BAN')}
                                                                            disabled={!canManage}
                                                                            className={`p-1.5 rounded transition-colors ${!canManage ? 'opacity-40 cursor-not-allowed text-muted-foreground' : 'text-rose-500 hover:bg-rose-500/10'}`} 
                                                                            title={canManage ? "Ban Player" : "Insufficient Permissions"}
                                                                        >
                                                                            <Gavel size={14} />
                                                                        </button>
                                                                    </>
                                                                )}
                                                                
                                                                {activeList === 'BANNED' && (
                                                                    <button 
                                                                        onClick={() => handleAction(player, 'UNBAN')}
                                                                        disabled={!canManage}
                                                                        className={`px-2 py-1 flex items-center gap-1 text-[11px] font-medium border rounded transition-colors ${!canManage ? 'opacity-40 cursor-not-allowed bg-muted text-muted-foreground border-border' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20'}`}
                                                                    >
                                                                        Unban
                                                                    </button>
                                                                )}
                                                                
                                                                {activeList === 'IP_BANNED' && (
                                                                    <button 
                                                                        onClick={() => handleAction(player, 'UNBAN')}
                                                                        disabled={!canManage}
                                                                        className={`px-2 py-1 flex items-center gap-1 text-[11px] font-medium border rounded transition-colors ${!canManage ? 'opacity-40 cursor-not-allowed bg-muted text-muted-foreground border-border' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20'}`}
                                                                    >
                                                                        Unblock
                                                                    </button>
                                                                )}
                                                                
                                                                {activeList === 'WHITELIST' && (
                                                                    <button 
                                                                        onClick={() => handleAction(player, 'UNWHITELIST')}
                                                                        disabled={!canManage}
                                                                        className={`p-1.5 rounded transition-colors ${!canManage ? 'opacity-40 cursor-not-allowed text-muted-foreground' : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'}`}
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                )}
                                                                
                                                                {(activeList === 'ONLINE' || activeList === 'OPS' || activeList === 'ALL') && (
                                                                    player.isOp ? (
                                                                        <button 
                                                                            onClick={() => handleAction(player, 'DEOP')}
                                                                            disabled={!canManage}
                                                                            className={`p-1.5 rounded transition-colors ${!canManage ? 'opacity-40 cursor-not-allowed text-muted-foreground' : 'text-amber-500 hover:bg-amber-500/10'}`} 
                                                                            title={canManage ? "De-Op" : "Insufficient Permissions"}
                                                                        >
                                                                            <Crown size={14} />
                                                                        </button>
                                                                    ) : (
                                                                        <button 
                                                                            onClick={() => handleAction(player, 'OP')}
                                                                            disabled={!canManage}
                                                                            className={`p-1.5 rounded transition-colors ${!canManage ? 'opacity-40 cursor-not-allowed text-muted-foreground' : 'text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10'}`} 
                                                                            title={canManage ? "Make Operator" : "Insufficient Permissions"}
                                                                        >
                                                                            <Crown size={14} />
                                                                        </button>
                                                                    )
                                                                )}
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                ))
                                            )}
                                        </AnimatePresence>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Context Menu Overlay */}
            <AnimatePresence>
                {contextMenu && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.1 }}
                        style={{ top: contextMenu.y, left: contextMenu.x }}
                        className="fixed z-50 w-48 bg-card border border-border shadow-2xl rounded-xl py-1 backdrop-blur-md overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-3 py-2 border-b border-border/40 bg-muted/10 mb-1">
                            <span className="text-xs font-bold text-foreground/70 truncate block">{contextMenu.player.name}</span>
                        </div>
                        
                        {(activeList === 'ONLINE' || activeList === 'ALL') && contextMenu.player.online && (
                            <button 
                                onClick={() => { handleAction(contextMenu.player, 'KICK'); setContextMenu(null); }}
                                disabled={!canManage}
                                className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center justify-between transition-colors ${!canManage ? 'opacity-40 cursor-not-allowed' : 'hover:bg-secondary text-foreground hover:text-foreground'}`}
                            >
                                Kick Player
                            </button>
                        )}
                        
                        {(activeList === 'ONLINE' || activeList === 'ALL') && (
                            <button 
                                onClick={() => { handleAction(contextMenu.player, 'BAN'); setContextMenu(null); }}
                                disabled={!canManage}
                                className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center justify-between transition-colors ${!canManage ? 'opacity-40 cursor-not-allowed' : 'text-rose-500 hover:bg-rose-500/10'}`}
                            >
                                Ban User <Gavel size={12} />
                            </button>
                        )}
                        
                        {(activeList === 'ONLINE' || activeList === 'ALL' || activeList === 'OPS') && (
                            contextMenu.player.isOp ? (
                                <button 
                                    onClick={() => { handleAction(contextMenu.player, 'DEOP'); setContextMenu(null); }}
                                    disabled={!canManage}
                                    className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center justify-between transition-colors ${!canManage ? 'opacity-40 cursor-not-allowed' : 'text-amber-500 hover:bg-amber-500/10'}`}
                                >
                                    Revoke Operator <Crown size={12} />
                                </button>
                            ) : (
                                <button 
                                    onClick={() => { handleAction(contextMenu.player, 'OP'); setContextMenu(null); }}
                                    disabled={!canManage}
                                    className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center justify-between transition-colors ${!canManage ? 'opacity-40 cursor-not-allowed' : 'text-amber-500 hover:bg-amber-500/10'}`}
                                >
                                    Make Operator <Crown size={12} />
                                </button>
                            )
                        )}
                        
                        {activeList === 'WHITELIST' && (
                            <button 
                                onClick={() => { handleAction(contextMenu.player, 'UNWHITELIST'); setContextMenu(null); }}
                                disabled={!canManage}
                                className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center justify-between transition-colors ${!canManage ? 'opacity-40 cursor-not-allowed' : 'text-rose-500 hover:bg-rose-500/10'}`}
                            >
                                Remove Whitelist <Trash2 size={12} />
                            </button>
                        )}
                        
                        {(activeList === 'BANNED' || activeList === 'IP_BANNED') && (
                            <button 
                                onClick={() => { handleAction(contextMenu.player, 'UNBAN'); setContextMenu(null); }}
                                disabled={!canManage}
                                className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center justify-between transition-colors ${!canManage ? 'opacity-40 cursor-not-allowed' : 'text-emerald-500 hover:bg-emerald-500/10'}`}
                            >
                                Pardon Ban <Shield size={12} />
                            </button>
                        )}
                        
                        <div className="h-px bg-border/40 my-1"></div>
                        
                        <button 
                            onClick={() => { copyToClipboard(activeList === 'IP_BANNED' ? contextMenu.player.ip! : contextMenu.player.uuid); setContextMenu(null); }}
                            className="w-full text-left px-3 py-1.5 text-xs font-medium flex items-center justify-between transition-colors hover:bg-secondary text-muted-foreground hover:text-foreground"
                        >
                            Copy UUID/IP <Copy size={12} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PlayerManagerPro;
