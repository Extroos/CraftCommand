
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
import { useSystem } from '@features/system/context/SystemContext';
import PluginManagerPro from './PluginManagerPro';
import AccessDenied from '@features/auth/components/AccessDenied';
import { useConfirm } from '@features/ui/hooks/useConfirm';
import { ConfirmDialog } from '@features/ui/ConfirmDialog';

interface PluginManagerProps {
    serverId: string;
}

type Tab = 'installed' | 'marketplace' | 'updates';

const PluginManager: React.FC<PluginManagerProps> = ({ serverId }) => {
    const { settings } = useSystem();
    const isPro = settings?.app?.professionalMode;

    if (isPro) {
        return <PluginManagerPro serverId={serverId} />;
    }

    const { currentServer, refreshServers } = useServers();
    const { can } = usePermissions();
    const [activeTab, setActiveTab] = useState<Tab>('marketplace');
    const { isOpen: isConfirmOpen, config: confirmConfig, confirm: requestConfirm, handleConfirm, handleCancel } = useConfirm();
    
    // Marketplace state
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<MarketplacePlugin[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [totalResults, setTotalResults] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    
    // Installed state
    const [installedPlugins, setInstalledPlugins] = useState<InstalledPlugin[]>([]);
    const [isLoadingInstalled, setIsLoadingInstalled] = useState(false);
    const [installedSearch, setInstalledSearch] = useState('');
    
    // Updates state
    const [updates, setUpdates] = useState<PluginUpdateInfo[]>([]);
    const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
    
    // Action state
    const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    
    // Advanced filtering & sorting
    const [filterCompatible, setFilterCompatible] = useState(true);
    const [activeCategory, setActiveCategory] = useState('All');
    const [activeSource, setActiveSource] = useState<PluginSource | ''>('');
    const [sortMode, setSortMode] = useState<'downloads' | 'updated' | 'name' | 'rating'>('downloads');
    
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
                gameVersion: filterCompatible ? currentServer?.version : undefined,
                page,
                limit: 20,
                sort: sortMode,
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
    }, [searchTerm, activeCategory, activeSource, filterCompatible, sortMode, currentServer?.version, serverId]);

    // Debounced search when filters change
    useEffect(() => {
        if (activeTab !== 'marketplace') return;
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = window.setTimeout(() => { doSearch(1); }, 400);
        return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
    }, [searchTerm, activeCategory, activeSource, filterCompatible, sortMode, activeTab, doSearch]);

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

        const isConfirmed = await requestConfirm({
            title: 'Uninstall Plugin',
            description: `Are you sure you want to uninstall ${plugin.name}? The plugin JAR will be deleted.`,
            confirmText: 'Uninstall',
            cancelText: 'Cancel'
        });
        if (!isConfirmed) return;
        
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

    const handleBulkUpdate = async () => {
        if (!can('server.plugins.manage', serverId)) return;
        if (updates.length === 0) return;
        
        const pluginIds = updates.map(u => u.pluginId);
        setPendingActions(prev => new Set([...prev, ...pluginIds]));
        
        try {
            const results = await API.bulkUpdatePlugins(serverId, pluginIds);
            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;
            
            if (failed > 0) {
                setError(`Updated ${successful} plugins, but ${failed} failed.`);
            } else {
                setSuccessMessage(`Successfully updated ${successful} plugins! Restart the server to apply changes.`);
            }
            checkUpdates();
            loadInstalled();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setPendingActions(prev => {
                const next = new Set(prev);
                pluginIds.forEach(id => next.delete(id));
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
                    {/* Search + Filter bar (Premium Glass Re-design) */}
                    <div className="bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl p-5 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-700">
                        <div className="flex flex-col xl:flex-row gap-4">
                            <div className="relative flex-1 group">
                                <Search className="absolute left-3.5 top-3 text-muted-foreground group-focus-within:text-primary transition-colors h-4.5 w-4.5" />
                                <input 
                                    type="text" 
                                    placeholder="Discover plugins, mods, and add-ons..." 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-secondary/30 border border-border/50 rounded-xl pl-10 pr-10 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all shadow-inner"
                                />
                                {searchTerm && (
                                    <button onClick={() => setSearchTerm('')} className="absolute right-3.5 top-3 text-muted-foreground hover:text-foreground transition-colors mr-1">
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-3">
                                {/* Source Selector */}
                                <div className="relative group">
                                    <select 
                                        value={activeSource}
                                        onChange={(e) => setActiveSource(e.target.value as PluginSource | '')}
                                        className="appearance-none bg-secondary/30 border border-border/50 rounded-xl px-4 py-2.5 pr-10 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 hover:bg-secondary/50 transition-all font-medium"
                                    >
                                        {sources.map(s => (
                                            <option key={s.value} value={s.value}>{s.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-3 text-muted-foreground h-4 w-4 pointer-events-none group-hover:text-primary transition-colors" />
                                </div>

                                {/* Sort Selector */}
                                <div className="relative group">
                                    <select 
                                        value={sortMode}
                                        onChange={(e) => setSortMode(e.target.value as any)}
                                        className="appearance-none bg-secondary/30 border border-border/50 rounded-xl px-4 py-2.5 pr-10 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 hover:bg-secondary/50 transition-all font-medium"
                                    >
                                        <option value="downloads">Most Downloaded</option>
                                        <option value="rating">Top Rated</option>
                                        <option value="updated">Recently Updated</option>
                                        <option value="name">A-Z Name</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-3 text-muted-foreground h-4 w-4 pointer-events-none group-hover:text-primary transition-colors" />
                                </div>

                                {/* Compatibility Toggle */}
                                <label className="flex items-center gap-2 px-4 py-2 bg-secondary/30 border border-border/50 rounded-xl cursor-pointer hover:bg-secondary/50 transition-all group active:scale-95">
                                    <input 
                                        type="checkbox" 
                                        className="w-4 h-4 rounded border-border/50 bg-transparent text-primary focus:ring-0 focus:ring-offset-0"
                                        checked={filterCompatible}
                                        onChange={(e) => setFilterCompatible(e.target.checked)}
                                    />
                                    <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                                        Only {currentServer?.version || 'Compatible'}
                                    </span>
                                </label>
                            </div>
                        </div>

                        {/* Category chips (Enhanced) */}
                        <div className="flex gap-2 mt-4 flex-wrap">
                            {categories.map(cat => {
                                const isActive = activeCategory === cat;
                                return (
                                    <button
                                        key={cat}
                                        onClick={() => setActiveCategory(cat)}
                                        className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                                            isActive 
                                                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105' 
                                                : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent hover:border-border/30'
                                        }`}
                                    >
                                        {cat}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Results (Premium Grid) */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-1">
                        {isSearching ? (
                            <div className="flex flex-col items-center justify-center py-24 gap-4 animate-pulse">
                                <Loader2 className="animate-spin text-primary/60" size={48} />
                                <p className="text-sm font-medium text-muted-foreground tracking-widest uppercase">Indexing Marketplace...</p>
                            </div>
                        ) : searchResults.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground animate-in fade-in zoom-in duration-500">
                                <ShoppingBag size={64} className="mb-4 opacity-10" />
                                <p className="text-xl font-bold text-foreground/80">End of the line</p>
                                <p className="text-sm opacity-60">No plugins match your current filters</p>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 pb-8">
                                    {searchResults.map((plugin, idx) => {
                                        const installed = installedPlugins.some(p => p.sourceId === plugin.sourceId);
                                        const installing = pendingActions.has(plugin.sourceId);
                                        const isCompatible = !currentServer?.version || (plugin.latestGameVersions && plugin.latestGameVersions.some(v => currentServer.version.startsWith(v)));
                                        
                                        return (
                                            <div 
                                                key={`${plugin.source}-${plugin.sourceId}`}
                                                style={{ animationDelay: `${idx * 40}ms` }}
                                                className="group relative bg-card/40 backdrop-blur-md border border-border/40 rounded-2xl p-5 flex flex-col hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/5 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 min-h-[190px]"
                                            >
                                                {/* Status Badge (Top Right Stabilization) */}
                                                <div className="absolute top-4 right-4 z-10">
                                                    {!isCompatible ? (
                                                        <span 
                                                            className="flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase tracking-widest cursor-help transition-all hover:bg-amber-500/20"
                                                            title={`Mismatch! Supported versions: ${plugin.latestGameVersions?.join(', ') || 'Unknown'}`}
                                                        >
                                                            <AlertTriangle size={10} /> Legacy
                                                        </span>
                                                    ) : (
                                                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase tracking-widest transition-all hover:bg-emerald-500/20">
                                                            Compatible
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-start gap-4 mb-4">
                                                    {plugin.iconUrl ? (
                                                        <div className="relative flex-shrink-0">
                                                            <img src={plugin.iconUrl} alt="" className="w-12 h-12 rounded-xl object-cover bg-secondary p-1 shadow-sm ring-1 ring-border/50" />
                                                        </div>
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent flex items-center justify-center text-primary font-black text-lg flex-shrink-0 border border-primary/10 shadow-inner">
                                                            {plugin.name.charAt(0)}
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0 pr-16">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <h3 className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">{plugin.name}</h3>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="text-[11px] font-medium text-muted-foreground/70 italic truncate">by {plugin.author}</p>
                                                            <span className="text-[8px] font-black px-1 py-0.5 rounded bg-secondary/80 text-muted-foreground uppercase tracking-tighter border border-border/50">
                                                                {plugin.source}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <p className="text-[12px] text-muted-foreground/80 leading-relaxed line-clamp-2 mb-5 flex-1 h-9 overflow-hidden">{plugin.description}</p>
                                                
                                                <div className="flex items-center justify-between pt-4 border-t border-border/30">
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground/60 tracking-wider">
                                                            <span className="flex items-center gap-1 bg-secondary/30 px-2 py-0.5 rounded-full ring-1 ring-border/30">
                                                                <Download size={10} className="text-primary" />
                                                                {plugin.downloads >= 1000000 
                                                                    ? `${(plugin.downloads / 1000000).toFixed(1)}M` 
                                                                    : plugin.downloads >= 1000 
                                                                    ? `${(plugin.downloads / 1000).toFixed(0)}K` 
                                                                    : plugin.downloads}
                                                            </span>
                                                            <span className="opacity-40">|</span>
                                                            <span className="font-mono opacity-80">v{plugin.latestVersion}</span>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        {plugin.externalUrl && (
                                                            <a 
                                                                href={plugin.externalUrl} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer" 
                                                                className="p-2 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-200"
                                                            >
                                                                <ExternalLink size={16} />
                                                            </a>
                                                        )}
                                                        <button
                                                            onClick={() => handleInstall(plugin)}
                                                            disabled={installed || installing || !can('server.plugins.manage', serverId)}
                                                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${installed ? 'bg-emerald-500/10 text-emerald-500 cursor-default border border-emerald-500/20' : installing ? 'bg-primary/20 text-primary cursor-wait' : 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0'}`}
                                                        >
                                                            {installed ? <><Check size={14} /> Installed</> : installing ? <><Loader2 size={14} className="animate-spin" /> Provisioning</> : <><Download size={14} /> Install</>}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Discovery Pagination Bar */}
                                <div className="flex items-center justify-between py-6 mt-4 border-t border-border/30">
                                    <div className="flex items-center gap-4">
                                        <button 
                                            onClick={() => doSearch(currentPage - 1)}
                                            disabled={currentPage <= 1 || isSearching}
                                            className="px-4 py-2 rounded-xl text-xs font-bold bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-border/50"
                                        >
                                            Previous Discovery
                                        </button>
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
                                            <span className="text-[10px] font-black text-primary uppercase tracking-widest">Page {currentPage}</span>
                                        </div>
                                        <button 
                                            onClick={() => doSearch(currentPage + 1)}
                                            disabled={searchResults.length < 20 || isSearching}
                                            className="px-4 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:shadow-lg hover:shadow-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                        >
                                            Next Results
                                        </button>
                                    </div>
                                    <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.2em] hidden sm:block">
                                        Explore 50,000+ Verified Addons
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ===== INSTALLED TAB ===== */}
            {activeTab === 'installed' && (
                <div className="flex flex-col gap-4 flex-1 min-h-0">
                    <div className="flex justify-between items-center gap-3">
                        <div className="flex items-center gap-2 bg-secondary/50 border border-border/50 rounded-lg px-2.5 py-1.5 flex-1 max-w-[280px]">
                            <Search size={13} className="text-muted-foreground/50" />
                            <input 
                                type="text"
                                placeholder="Filter installed plugins..."
                                value={installedSearch}
                                onChange={(e) => setInstalledSearch(e.target.value)}
                                className="bg-transparent border-none text-xs focus:outline-none w-full placeholder:text-muted-foreground/30"
                            />
                            {installedSearch && (
                                <button onClick={() => setInstalledSearch('')} className="text-muted-foreground/40 hover:text-foreground transition-colors">
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                        <p className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                            {installedSearch 
                                ? `${installedPlugins.filter(p => p.name.toLowerCase().includes(installedSearch.toLowerCase()) || p.fileName.toLowerCase().includes(installedSearch.toLowerCase())).length} of ${installedPlugins.length}`
                                : `${installedPlugins.length} plugin${installedPlugins.length !== 1 ? 's' : ''}`
                            }
                        </p>
                        <button 
                            onClick={loadInstalled}
                            disabled={isLoadingInstalled}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground transition-all shrink-0"
                        >
                            <RefreshCw size={12} className={isLoadingInstalled ? 'animate-spin' : ''} />
                            Scan
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
                                {installedPlugins
                                    .filter(p => !installedSearch || p.name.toLowerCase().includes(installedSearch.toLowerCase()) || p.fileName.toLowerCase().includes(installedSearch.toLowerCase()))
                                    .map(plugin => {
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
                        <div className="flex items-center gap-2">
                            {updates.length > 0 && (
                                <button 
                                    onClick={handleBulkUpdate}
                                    disabled={updates.some(u => pendingActions.has(u.pluginId))}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
                                >
                                    <ArrowUpCircle size={12} />
                                    Update All
                                </button>
                            )}
                            <button 
                                onClick={checkUpdates}
                                disabled={isCheckingUpdates}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground transition-all"
                            >
                                <RefreshCw size={12} className={isCheckingUpdates ? 'animate-spin' : ''} />
                                Check Updates
                            </button>
                        </div>
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

            <ConfirmDialog 
                isOpen={isConfirmOpen}
                {...confirmConfig}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
            />
        </div>
    );
};

export default PluginManager;
