
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MarketplacePlugin, InstalledPlugin, PluginSearchQuery, PluginUpdateInfo, PluginSource } from '@shared/types';
import { 
    Search, Download, Check, ExternalLink, Trash2, Power, RefreshCw, 
    ArrowUpCircle, Package, Store, AlertTriangle, Loader2, 
    ChevronDown, X, ShoppingBag
} from 'lucide-react';
import { API } from '@core/services/api';
import { useServers } from '@features/servers/context/ServerContext';
import { usePermissions } from '@features/auth/hooks/usePermissions';
import AccessDenied from '@features/auth/components/AccessDenied';

interface PluginManagerProps {
    serverId: string;
}

type Tab = 'installed' | 'marketplace' | 'updates';

const PluginManager: React.FC<PluginManagerProps> = ({ serverId }) => {
    const { currentServer, refreshServers } = useServers();
    const { can } = usePermissions();
    const [activeTab, setActiveTab] = useState<Tab>('marketplace');
    
    // Marketplace state
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<MarketplacePlugin[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [activeCategory, setActiveCategory] = useState('All');
    const [activeSource, setActiveSource] = useState<PluginSource | ''>('');
    const [totalResults, setTotalResults] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    
    // Installed state
    const [installedPlugins, setInstalledPlugins] = useState<InstalledPlugin[]>([]);
    const [isLoadingInstalled, setIsLoadingInstalled] = useState(false);
    
    // Updates state
    const [updates, setUpdates] = useState<PluginUpdateInfo[]>([]);
    const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
    
    // Action state
    const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    
    const searchTimeoutRef = useRef<number | null>(null);

    const categories = ['All', 'Admin', 'World', 'Economy', 'General', 'Chat', 'Performance'];
    const sources: { label: string; value: PluginSource | '' }[] = [
        { label: 'All Sources', value: '' },
        { label: 'Modrinth', value: 'modrinth' },
        { label: 'Spiget', value: 'spiget' },
        { label: 'Hangar', value: 'hangar' },
    ];

    // --- Clear messages after timeout ---
    useEffect(() => {
        if (error || successMessage) {
            const timer = setTimeout(() => { setError(null); setSuccessMessage(null); }, 5000);
            return () => clearTimeout(timer);
        }
    }, [error, successMessage]);

    // --- Load installed on mount and tab change ---
    const loadInstalled = useCallback(async () => {
        setIsLoadingInstalled(true);
        try {
            const plugins = await API.scanPlugins(serverId);
            setInstalledPlugins(plugins);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoadingInstalled(false);
        }
    }, [serverId]);

    useEffect(() => {
        loadInstalled();
    }, [loadInstalled]);

    // --- Search marketplace ---
    const doSearch = useCallback(async (page = 1) => {
        setIsSearching(true);
        setError(null);
        try {
            const query: PluginSearchQuery = {
                query: searchTerm,
                category: activeCategory !== 'All' ? activeCategory : undefined,
                source: activeSource || undefined,
                page,
                limit: 20,
                sort: 'downloads',
            };
            const result = await API.searchPlugins(query, serverId);
            setSearchResults(result.plugins);
            setTotalResults(result.total);
            setCurrentPage(page);
        } catch (err: any) {
            setError(err.message);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    }, [searchTerm, activeCategory, activeSource, serverId]);

    // Debounced search when filters change
    useEffect(() => {
        if (activeTab !== 'marketplace') return;
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = window.setTimeout(() => { doSearch(1); }, 400);
        return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
    }, [searchTerm, activeCategory, activeSource, activeTab, doSearch]);

    // --- Check updates ---
    const checkUpdates = useCallback(async () => {
        setIsCheckingUpdates(true);
        try {
            const result = await API.checkPluginUpdates(serverId);
            setUpdates(result);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsCheckingUpdates(false);
        }
    }, [serverId]);

    useEffect(() => {
        if (activeTab === 'updates') checkUpdates();
    }, [activeTab, checkUpdates]);

    // --- Actions ---
    const handleInstall = async (plugin: MarketplacePlugin) => {
        if (!can('server.plugins.manage', serverId)) return;
        setPendingActions(prev => new Set(prev).add(plugin.sourceId));
        setError(null);
        try {
            const result = await API.installPlugin(serverId, plugin.sourceId, plugin.source);
            // Dynamic update: add to installed list immediately so button changes to "Installed"
            setInstalledPlugins(prev => [...prev.filter(p => p.sourceId !== plugin.sourceId), result]);
            setSuccessMessage(`${plugin.name} installed successfully! Restart the server for changes to take effect.`);
            refreshServers(); // Refresh to get needsRestart flag
        } catch (err: any) {
            setError(err.message);
        } finally {
            setPendingActions(prev => {
                const next = new Set(prev);
                next.delete(plugin.sourceId);
                return next;
            });
        }
    };

    const handleUninstall = async (plugin: InstalledPlugin) => {
        if (!can('server.plugins.manage', serverId)) return;
        if (!confirm(`Uninstall ${plugin.name}? The plugin JAR will be deleted.`)) return;
        
        // Optimistic Deletion
        const originalPlugins = [...installedPlugins];
        setInstalledPlugins(prev => prev.filter(p => p.id !== plugin.id));
        setPendingActions(prev => new Set(prev).add(plugin.id));
        
        try {
            await API.uninstallPlugin(serverId, plugin.id);
            setSuccessMessage(`${plugin.name} uninstalled.`);
            // No need to reload, we already removed it optimistically
        } catch (err: any) {
            setInstalledPlugins(originalPlugins);
            setError(err.message);
        } finally {
            setPendingActions(prev => {
                const next = new Set(prev);
                next.delete(plugin.id);
                return next;
            });
        }
    };

    const handleToggle = async (plugin: InstalledPlugin) => {
        if (!can('server.plugins.manage', serverId)) return;
        // Optimistic Toggle
        const originalPlugins = [...installedPlugins];
        setInstalledPlugins(prev => prev.map(p => p.id === plugin.id ? { ...p, enabled: !p.enabled } : p));
        setPendingActions(prev => new Set(prev).add(plugin.id));
        
        try {
            const updated = await API.togglePlugin(serverId, plugin.id);
            setInstalledPlugins(prev => prev.map(p => p.id === plugin.id ? updated : p));
            setSuccessMessage(`${plugin.name} ${updated.enabled ? 'enabled' : 'disabled'}. Restart the server for changes to take effect.`);
        } catch (err: any) {
            setInstalledPlugins(originalPlugins);
            setError(err.message);
        } finally {
            setPendingActions(prev => {
                const next = new Set(prev);
                next.delete(plugin.id);
                return next;
            });
        }
    };

    const handleUpdate = async (update: PluginUpdateInfo) => {
        if (!can('server.plugins.manage', serverId)) return;
        setPendingActions(prev => new Set(prev).add(update.pluginId));
        try {
            await API.updatePlugin(serverId, update.pluginId);
            setSuccessMessage(`${update.name} updated to ${update.latestVersion}! Restart the server for changes to take effect.`);
            checkUpdates();
            loadInstalled();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setPendingActions(prev => {
                const next = new Set(prev);
                next.delete(update.pluginId);
                return next;
            });
        }
    };

    const isAlreadyInstalled = (sourceId: string): boolean => {
        return installedPlugins.some(p => p.sourceId === sourceId);
    };

    // --- Tab content ---
    const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
        { id: 'marketplace', label: 'Marketplace', icon: <Store size={16} /> },
        { id: 'installed', label: 'Installed', icon: <Package size={16} />, badge: installedPlugins.length },
        { id: 'updates', label: 'Updates', icon: <ArrowUpCircle size={16} />, badge: updates.length },
    ];

    if (!can('server.plugins.read', serverId)) {
        return (
            <AccessDenied 
                title="Plugin Access Restricted"
                description="You do not have permission to view or manage plugins for this server. Please contact an administrator for access."
            />
        );
    }

    return (
        <div className="h-[calc(100vh-120px)] flex flex-col gap-4 animate-fade-in">
            {/* ===== Notification Bar ===== */}
            {(error || successMessage) && (
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border animate-in slide-in-from-top-2 duration-300 ${
                    error 
                        ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                }`}>
                    {error ? <AlertTriangle size={16} /> : <Check size={16} />}
                    <span className="flex-1">{error || successMessage}</span>
                    <button onClick={() => { setError(null); setSuccessMessage(null); }} className="opacity-60 hover:opacity-100 transition-opacity">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* ===== Restart Required Banner ===== */}
            {currentServer?.needsRestart && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-amber-500/10 border border-amber-500/30 text-amber-400 animate-in fade-in slide-in-from-top-1 duration-500">
                    <RefreshCw size={16} className="animate-spin-slow" />
                    <span className="flex-1">Restart required to apply plugin changes.</span>
                </div>
            )}

            {/* ===== Tab Bar ===== */}
            <div className="bg-card border border-border rounded-xl p-1.5 flex gap-1 shadow-sm">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
                            activeTab === tab.id 
                                ? 'bg-primary text-primary-foreground shadow-md' 
                                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                        }`}
                    >
                        {tab.icon}
                        <span>{tab.label}</span>
                        {tab.badge !== undefined && tab.badge > 0 && (
                            <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] ${
                                activeTab === tab.id 
                                    ? 'bg-white/20 text-primary-foreground' 
                                    : 'bg-primary/15 text-primary'
                            }`}>
                                {tab.badge}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ===== MARKETPLACE TAB ===== */}
            {activeTab === 'marketplace' && (
                <div className="flex flex-col gap-4 flex-1 min-h-0">
                    {/* Search + Filter bar */}
                    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                        <div className="flex flex-col md:flex-row gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-2.5 text-muted-foreground h-4 w-4" />
                                <input 
                                    type="text" 
                                    placeholder="Search plugins and mods..." 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-secondary/50 border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                                />
                                {searchTerm && (
                                    <button onClick={() => setSearchTerm('')} className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors">
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                            <div className="relative">
                                <select 
                                    value={activeSource}
                                    onChange={(e) => setActiveSource(e.target.value as PluginSource | '')}
                                    className="appearance-none bg-secondary/50 border border-border rounded-lg px-4 py-2 pr-8 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
                                >
                                    {sources.map(s => (
                                        <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-2.5 text-muted-foreground h-4 w-4 pointer-events-none" />
                            </div>
                        </div>

                        {/* Category chips */}
                        <div className="flex gap-2 mt-3 flex-wrap">
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setActiveCategory(cat)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                        activeCategory === cat 
                                            ? 'bg-primary text-primary-foreground shadow-sm' 
                                            : 'bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground'
                                    }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Results */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {isSearching ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="animate-spin text-primary" size={32} />
                            </div>
                        ) : searchResults.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                                <ShoppingBag size={48} className="mb-4 opacity-30" />
                                <p className="text-lg font-medium">No plugins found</p>
                                <p className="text-sm">Try a different search term or filter</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                {searchResults.map(plugin => {
                                    const installed = isAlreadyInstalled(plugin.sourceId);
                                    const installing = pendingActions.has(plugin.sourceId);
                                    return (
                                        <div 
                                            key={`${plugin.source}-${plugin.sourceId}`}
                                            className="bg-card border border-border rounded-xl p-4 flex flex-col hover:border-primary/30 transition-all group"
                                        >
                                            <div className="flex items-start gap-3 mb-3">
                                                {plugin.iconUrl ? (
                                                    <img src={plugin.iconUrl} alt="" className="w-10 h-10 rounded-lg object-cover bg-secondary flex-shrink-0" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                                                        {plugin.name.charAt(0)}
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-semibold text-sm text-foreground truncate">{plugin.name}</h3>
                                                    <p className="text-[11px] text-muted-foreground">by {plugin.author}</p>
                                                </div>
                                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground uppercase flex-shrink-0">
                                                    {plugin.source}
                                                </span>
                                            </div>
                                            
                                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3 flex-1">{plugin.description}</p>
                                            
                                            <div className="flex items-center justify-between pt-3 border-t border-border/50">
                                                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                                    <span className="flex items-center gap-1">
                                                        <Download size={11} />
                                                        {plugin.downloads >= 1000000 
                                                            ? `${(plugin.downloads / 1000000).toFixed(1)}M` 
                                                            : plugin.downloads >= 1000 
                                                            ? `${(plugin.downloads / 1000).toFixed(0)}K` 
                                                            : plugin.downloads}
                                                    </span>
                                                    <span>v{plugin.latestVersion}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {plugin.externalUrl && (
                                                        <a 
                                                            href={plugin.externalUrl} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer" 
                                                            className="text-muted-foreground hover:text-foreground transition-colors"
                                                        >
                                                            <ExternalLink size={13} />
                                                        </a>
                                                    )}
                                                    <button
                                                        onClick={() => handleInstall(plugin)}
                                                        disabled={installed || installing || !can('server.plugins.manage', serverId)}
                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                                            installed 
                                                                ? 'bg-emerald-500/10 text-emerald-400 cursor-default' 
                                                                : installing 
                                                                ? 'bg-primary/20 text-primary cursor-wait' 
                                                                : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-md'
                                                        }`}
                                                    >
                                                        {installed ? (
                                                            <><Check size={12} /> Installed</>
                                                        ) : installing ? (
                                                            <><Loader2 size={12} className="animate-spin" /> Installing...</>
                                                        ) : (
                                                            <><Download size={12} /> Install</>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ===== INSTALLED TAB ===== */}
            {activeTab === 'installed' && (
                <div className="flex flex-col gap-4 flex-1 min-h-0">
                    <div className="flex justify-between items-center">
                        <p className="text-sm text-muted-foreground">
                            {installedPlugins.length} plugin{installedPlugins.length !== 1 ? 's' : ''} installed
                        </p>
                        <button 
                            onClick={loadInstalled}
                            disabled={isLoadingInstalled}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground transition-all"
                        >
                            <RefreshCw size={12} className={isLoadingInstalled ? 'animate-spin' : ''} />
                            Scan Directory
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {isLoadingInstalled ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="animate-spin text-primary" size={32} />
                            </div>
                        ) : installedPlugins.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                                <Package size={48} className="mb-4 opacity-30" />
                                <p className="text-lg font-medium">No plugins installed</p>
                                <p className="text-sm">Head to the Marketplace to find and install plugins</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {installedPlugins.map(plugin => {
                                    const busy = pendingActions.has(plugin.id);
                                    return (
                                        <div 
                                            key={plugin.id}
                                            className={`bg-card border rounded-xl p-4 flex items-center gap-4 transition-all ${
                                                plugin.enabled ? 'border-border' : 'border-border/50 opacity-60'
                                            }`}
                                        >
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                                                plugin.enabled 
                                                    ? 'bg-gradient-to-br from-primary/20 to-primary/5 text-primary' 
                                                    : 'bg-secondary text-muted-foreground'
                                            }`}>
                                                {plugin.name.charAt(0).toUpperCase()}
                                            </div>
                                            
                                            <div className="flex-1 min-w-0 mr-2">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-semibold text-sm truncate">{plugin.name}</h3>
                                                    {!plugin.enabled && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 font-medium">Disabled</span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-muted-foreground truncate">
                                                    {plugin.fileName} — v{plugin.version}
                                                    {plugin.source !== 'manual' && ` · ${plugin.source}`}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                {/* Toggle */}
                                                <button
                                                    onClick={() => handleToggle(plugin)}
                                                    disabled={busy || !can('server.plugins.manage', serverId)}
                                                    title={can('server.plugins.manage', serverId) ? (plugin.enabled ? 'Disable' : 'Enable') : 'Insufficient Permissions'}
                                                    className={`p-2 rounded-lg text-xs transition-all ${
                                                        plugin.enabled 
                                                            ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' 
                                                            : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                                                    }`}
                                                >
                                                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                                                </button>
                                                {/* Uninstall */}
                                                <button
                                                    onClick={() => handleUninstall(plugin)}
                                                    disabled={busy || !can('server.plugins.manage', serverId)}
                                                    title={can('server.plugins.manage', serverId) ? 'Uninstall' : 'Insufficient Permissions'}
                                                    className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ===== UPDATES TAB ===== */}
            {activeTab === 'updates' && (
                <div className="flex flex-col gap-4 flex-1 min-h-0">
                    <div className="flex justify-between items-center">
                        <p className="text-sm text-muted-foreground">
                            {updates.length} update{updates.length !== 1 ? 's' : ''} available
                        </p>
                        <button 
                            onClick={checkUpdates}
                            disabled={isCheckingUpdates}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground transition-all"
                        >
                            <RefreshCw size={12} className={isCheckingUpdates ? 'animate-spin' : ''} />
                            Check Updates
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {isCheckingUpdates ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="animate-spin text-primary" size={32} />
                            </div>
                        ) : updates.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                                <Check size={48} className="mb-4 opacity-30" />
                                <p className="text-lg font-medium">All plugins up to date</p>
                                <p className="text-sm">No updates available at this time</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {updates.map(update => {
                                    const busy = pendingActions.has(update.pluginId);
                                    return (
                                        <div
                                            key={update.pluginId}
                                            className="bg-card border border-border rounded-xl p-4 flex items-center gap-4"
                                        >
                                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/5 flex items-center justify-center text-blue-400 font-bold text-sm flex-shrink-0">
                                                {update.name.charAt(0).toUpperCase()}
                                            </div>
                                            
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-sm truncate">{update.name}</h3>
                                                <p className="text-[11px] text-muted-foreground">
                                                    <span className="text-yellow-400">{update.currentVersion}</span>
                                                    {' → '}
                                                    <span className="text-emerald-400">{update.latestVersion}</span>
                                                    {' · '}{update.source}
                                                </p>
                                            </div>

                                            <button
                                                onClick={() => handleUpdate(update)}
                                                disabled={busy || !can('server.plugins.manage', serverId)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 transition-all shadow-sm disabled:opacity-50 disabled:bg-blue-500/50"
                                            >
                                                {busy ? (
                                                    <><Loader2 size={12} className="animate-spin" /> Updating...</>
                                                ) : (
                                                    <><ArrowUpCircle size={12} /> Update</>
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PluginManager;
