import React, { useState, useEffect, useCallback } from 'react';
// import { useParams } from 'react-router-dom'; // Removed
import { motion, AnimatePresence } from 'framer-motion';
import { Player } from '../../types';
import { Shield, Ban, Trash2, UserPlus, UserCheck, Gavel, Crown, Search, Eye, EyeOff, Globe, RotateCw, Loader2, Users, Copy, Check } from 'lucide-react';
import { useToast } from '../UI/Toast';
import { API } from '../../services/api';
import { socketService } from '../../services/socket';
import { useServers } from '../../context/ServerContext';

type ListType = 'ONLINE' | 'ALL' | 'WHITELIST' | 'OPS' | 'BANNED' | 'IP_BANNED';

const PlayerSkeleton = () => (
    <tr className="animate-pulse border-b border-border/50">
        <td className="px-4 py-3"><div className="h-8 w-8 bg-muted rounded-md" /></td>
        <td className="px-4 py-3"><div className="h-4 w-32 bg-muted rounded" /></td>
        <td className="px-4 py-3"><div className="h-4 w-24 bg-muted rounded" /></td>
        <td className="px-4 py-3 text-right"><div className="h-8 w-20 bg-muted rounded ml-auto" /></td>
    </tr>
);

interface PlayerManagerProps {
    serverId?: string;
}

const PlayerManager: React.FC<PlayerManagerProps> = ({ serverId }) => {
    // const { id } = useParams<{ id: string }>(); // Deprecated in favor of Prop
    const id = serverId; // Alias for compatibility with existing code
    const [activeList, setActiveList] = useState<ListType>('ONLINE');
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showIps, setShowIps] = useState(false);
    const [addInput, setAddInput] = useState('');
    const [copied, setCopied] = useState<string | null>(null);
    
    const { addToast } = useToast();

    const { players: globalPlayers, refreshServerData, loading: contextLoading } = useServers();
    const onlinePlayers = globalPlayers[id] || [];

    const fetchPlayers = useCallback(async () => {
        if (!id) return;
        
        // If we are looking for ONLINE players, we rely on context
        if (activeList === 'ONLINE') {
            await refreshServerData(id);
            return;
        }

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
                    isIp: activeList === 'IP_BANNED'
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

    useEffect(() => {
        fetchPlayers();
        
        // Real-time Updates
        if (id) {
            const handleJoin = (data: { serverId: string, name: string }) => {
                if (data.serverId === id) {
                    addToast('info', 'Player Join', `${data.name} joined the game`);
                    refreshServerData(id);
                }
            };
            
            const handleLeave = (data: { serverId: string, name: string }) => {
                if (data.serverId === id) {
                    addToast('info', 'Player Leave', `${data.name} left the game`);
                    refreshServerData(id);
                }
            };

            socketService.onPlayerJoin(handleJoin);
            socketService.onPlayerLeave(handleLeave);
            
            return () => {
                // socketService.offPlayerJoin(handleJoin);
            };
        }
    }, [fetchPlayers, id, activeList, refreshServerData]);

    // Derived list
    const displayedPlayers = activeList === 'ONLINE' ? onlinePlayers : players;
    const isLoading = activeList === 'ONLINE' ? contextLoading : (loading || contextLoading);

    const handleAction = async (player: Player, action: 'KICK' | 'BAN' | 'OP' | 'DEOP' | 'UNBAN' | 'UNWHITELIST' | 'BAN_IP') => {
        if (!id) return;

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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-120px)] animate-fade-in">
            {/* Sidebar Controls */}
            <div className="lg:col-span-1 space-y-6">
                <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                    <nav className="flex flex-col">
                        {[
                            { id: 'ONLINE', label: 'Online Players', icon: <UserCheck size={16} />, color: 'emerald' },
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

                {activeList !== 'ONLINE' && activeList !== 'ALL' && (
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
            <div className="lg:col-span-3 bg-card border border-border rounded-xl flex flex-col overflow-hidden shadow-sm">
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
                    <table className="w-full text-sm text-left border-separate border-spacing-y-2">
                        <thead className="text-xs uppercase text-muted-foreground font-semibold sticky top-0 bg-card z-10">
                            <tr>
                                {activeList !== 'IP_BANNED' && <th className="px-4 pb-2">User</th>}
                                <th className="px-4 pb-2">{activeList === 'IP_BANNED' ? 'IP Address' : 'UUID'}</th>
                                {(activeList === 'ONLINE' || activeList === 'ALL') && <th className="px-4 pb-2">IP Address</th>}
                                {(activeList === 'ONLINE' || activeList === 'ALL') && <th className="px-4 pb-2">Status</th>}
                                <th className="px-4 pb-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <>
                                    <PlayerSkeleton />
                                    <PlayerSkeleton />
                                    <PlayerSkeleton />
                                </>
                            ) : (
                                <AnimatePresence mode="popLayout">
                                    {filteredPlayers.length === 0 ? (
                                         <motion.tr 
                                            initial={{ opacity: 0 }} 
                                            animate={{ opacity: 1 }} 
                                            key="empty"
                                        >
                                            <td colSpan={5} className="h-64 text-center">
                                                <div className="flex flex-col items-center justify-center text-muted-foreground opacity-50">
                                                    <UserCheck size={48} className="mb-4" />
                                                    <p>No players found in this list.</p>
                                                    <p className="text-xs mt-1">Try changing tabs or adding a player.</p>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ) : (
                                        filteredPlayers.map((player) => (
                                            <motion.tr 
                                                key={player.uuid + player.name} 
                                                layout
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.95 }}
                                                transition={{ duration: 0.15 }}
                                                className="bg-muted/10 hover:bg-muted/30 transition-colors group"
                                            >
                                                {activeList !== 'IP_BANNED' && (
                                                    <td className="px-4 py-3 rounded-l-lg">
                                                        <div className="flex items-center gap-3">
                                                            <div className="relative">
                                                                <img src={player.skinUrl} alt={player.name} className={`w-8 h-8 rounded-md bg-muted ${!player.online && activeList === 'ALL' ? 'grayscale opacity-70' : ''}`} />
                                                                {activeList === 'ALL' && (
                                                                    <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-card ${player.online ? 'bg-emerald-500' : 'bg-gray-400'}`}></div>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <div className="font-medium flex items-center gap-1.5">
                                                                    {player.name}
                                                                    {player.isOp && activeList !== 'OPS' && <Crown size={12} className="text-amber-500" fill="currentColor" />}
                                                                </div>
                                                                <div className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded w-fit mt-0.5">
                                                                    {player.online ? 'Online' : 'Offline'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                )}
                                                <td className={`px-4 py-3 font-mono text-xs text-muted-foreground ${activeList === 'IP_BANNED' ? 'rounded-l-lg' : ''}`}>
                                                    <div className="flex items-center gap-2 group/uuid">
                                                        <span>{activeList === 'IP_BANNED' ? player.ip : player.uuid?.substring(0, 18) + (player.uuid?.length > 18 ? '...' : '')}</span>
                                                        <button 
                                                            onClick={() => copyToClipboard(activeList === 'IP_BANNED' ? player.ip! : player.uuid)}
                                                            className="opacity-0 group-hover/uuid:opacity-100 transition-opacity hover:text-foreground"
                                                        >
                                                            {copied === (activeList === 'IP_BANNED' ? player.ip : player.uuid) ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                                                        </button>
                                                    </div>
                                                </td>
                                                
                                                {(activeList === 'ONLINE' || activeList === 'ALL') && (
                                                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                                        <span className={`px-2 py-0.5 rounded ${showIps ? 'bg-secondary' : 'blur-[4px] bg-secondary/50'}`}>
                                                            {maskIp(player.ip)}
                                                        </span>
                                                    </td>
                                                )}

                                                {(activeList === 'ONLINE' || activeList === 'ALL') && (
                                                    <td className="px-4 py-3">
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
                                                    </td>
                                                )}
                                                
                                                <td className="px-4 py-3 rounded-r-lg text-right">
                                                    <div className="flex items-center justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                                        {(activeList === 'ONLINE' || activeList === 'ALL') && (
                                                            <>
                                                                {player.online && (
                                                                    <button 
                                                                        onClick={() => handleAction(player, 'KICK')}
                                                                        className="px-2 py-1 text-xs font-medium border border-border rounded hover:bg-secondary hover:text-foreground transition-colors"
                                                                    >
                                                                        Kick
                                                                    </button>
                                                                )}
                                                                <button 
                                                                    onClick={() => handleAction(player, 'BAN')}
                                                                    className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded transition-colors" title="Ban Player"
                                                                >
                                                                    <Gavel size={16} />
                                                                </button>
                                                            </>
                                                        )}
                                                        
                                                        {activeList === 'BANNED' && (
                                                            <button 
                                                                onClick={() => handleAction(player, 'UNBAN')}
                                                                className="px-3 py-1.5 text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded hover:bg-emerald-500/20 transition-colors"
                                                            >
                                                                Unban
                                                            </button>
                                                        )}

                                                        {activeList === 'IP_BANNED' && (
                                                            <button 
                                                                onClick={() => handleAction(player, 'UNBAN')}
                                                                className="px-3 py-1.5 text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded hover:bg-emerald-500/20 transition-colors"
                                                            >
                                                                Unblock IP
                                                            </button>
                                                        )}

                                                        {activeList === 'WHITELIST' && (
                                                            <button 
                                                                onClick={() => handleAction(player, 'UNWHITELIST')}
                                                                className="p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded transition-colors"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                        
                                                        {(activeList === 'ONLINE' || activeList === 'OPS' || activeList === 'ALL') && (
                                                            player.isOp ? (
                                                                <button 
                                                                    onClick={() => handleAction(player, 'DEOP')}
                                                                    className="p-1.5 text-amber-500 hover:bg-amber-500/10 rounded transition-colors" title="De-Op"
                                                                >
                                                                    <Crown size={16} />
                                                                </button>
                                                            ) : (
                                                                <button 
                                                                    onClick={() => handleAction(player, 'OP')}
                                                                    className="p-1.5 text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 rounded transition-colors" title="Make Operator"
                                                                >
                                                                    <Crown size={16} />
                                                                </button>
                                                            )
                                                        )}
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        ))
                                    )}
                                </AnimatePresence>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PlayerManager;