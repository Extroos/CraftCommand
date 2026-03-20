
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
import { useConfirm } from '@features/ui/hooks/useConfirm';
import { ConfirmDialog } from '@features/ui/ConfirmDialog';

interface PluginManagerProps {
    serverId: string;
}

type Tab = 'installed' | 'marketplace' | 'updates';

const PluginManagerPro: React.FC<PluginManagerProps> = ({ serverId }) => {
    const { currentServer, refreshServers } = useServers();
    const { can } = usePermissions();
    const [activeTab, setActiveTab] = useState<Tab>('marketplace');
    const { isOpen: isConfirmOpen, config: confirmConfig, confirm: requestConfirm, handleConfirm, handleCancel } = useConfirm();
    
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
    
    // Bulk state
    const [selectedMarketplace, setSelectedMarketplace] = useState<Set<string>>(new Set());
    const [selectedInstalled, setSelectedInstalled] = useState<Set<string>>(new Set());
    const [selectedUpdates, setSelectedUpdates] = useState<Set<string>>(new Set());

    useEffect(() => {
        setSelectedMarketplace(new Set());
        setSelectedInstalled(new Set());
        setSelectedUpdates(new Set());
    }, [activeTab]);

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
        
        const isConfirmed = await requestConfirm({
            title: 'Uninstall Plugin',
            description: `Uninstall ${plugin.name}? The plugin JAR will be deleted.`,
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
        const targetIds = selectedUpdates.size > 0 ? Array.from(selectedUpdates) : updates.map(u => u.pluginId);
        if (targetIds.length === 0) return;
        
        setPendingActions(prev => new Set([...prev, ...targetIds]));
        
        try {
            const results = await API.bulkUpdatePlugins(serverId, targetIds);
            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;
            
            if (failed > 0) {
                setError(`Updated ${successful} plugins, but ${failed} failed.`);
            } else {
                setSuccessMessage(`Successfully updated ${successful} plugins! Restart the server to apply changes.`);
            }
            checkUpdates();
            loadInstalled();
            setSelectedUpdates(new Set());
        } catch (err: any) {
            setError(err.message);
        } finally {
            setPendingActions(prev => {
                const next = new Set(prev);
                targetIds.forEach(id => next.delete(id));
                return next;
            });
        }
    };

    const handleBulkUninstall = async () => {
        if (!can('server.plugins.manage', serverId)) return;
        const targetIds = Array.from(selectedInstalled);
        if (targetIds.length === 0) return;
        
        const isConfirmed = await requestConfirm({
            title: 'Bulk Uninstall',
            description: `Uninstall ${targetIds.length} plugins? The JAR files will be deleted.`,
            confirmText: 'Uninstall All',
            cancelText: 'Cancel'
        });
        if (!isConfirmed) return;

        setPendingActions(prev => new Set([...prev, ...targetIds]));
        let successCount = 0;
        let failCount = 0;

        for (const id of targetIds) {
            try {
                await API.uninstallPlugin(serverId, id);
                successCount++;
            } catch (e) {
                failCount++;
            }
        }
        
        if (failCount > 0) {
            setError(`Uninstalled ${successCount} plugins, but ${failCount} failed.`);
        } else {
            setSuccessMessage(`Successfully uninstalled ${successCount} plugins.`);
        }
        
        setSelectedInstalled(new Set());
        loadInstalled();
        setPendingActions(prev => {
            const next = new Set(prev);
            targetIds.forEach(id => next.delete(id));
            return next;
        });
    };

    const handleBulkToggle = async (enable: boolean) => {
        if (!can('server.plugins.manage', serverId)) return;
        const targetIds = Array.from(selectedInstalled);
        if (targetIds.length === 0) return;

        setPendingActions(prev => new Set([...prev, ...targetIds]));
        let successCount = 0;
        let failCount = 0;

        for (const id of targetIds) {
            try {
                const p = installedPlugins.find(x => x.id === id);
                if (p && p.enabled !== enable) {
                    await API.togglePlugin(serverId, id);
                    successCount++;
                }
            } catch (e) {
                failCount++;
            }
        }
        
        if (failCount > 0) {
            setError(`Toggled ${successCount} plugins, but ${failCount} failed.`);
        } else {
            setSuccessMessage(`Successfully toggled ${successCount} plugins. Restart required.`);
        }
        
        setSelectedInstalled(new Set());
        loadInstalled();
        setPendingActions(prev => {
            const next = new Set(prev);
            targetIds.forEach(id => next.delete(id));
            return next;
        });
    };

    const handleBulkInstall = async () => {
        if (!can('server.plugins.manage', serverId)) return;
        const targets = searchResults.filter(p => selectedMarketplace.has(p.sourceId));
        if (targets.length === 0) return;

        const targetIds = targets.map(t => t.sourceId);
        setPendingActions(prev => new Set([...prev, ...targetIds]));
        let successCount = 0;
        let failCount = 0;

        for (const plugin of targets) {
            try {
                if (!isAlreadyInstalled(plugin.sourceId)) {
                    await API.installPlugin(serverId, plugin.sourceId, plugin.source);
                    successCount++;
                }
            } catch (e) {
                failCount++;
            }
        }
        
        if (failCount > 0) {
            setError(`Installed ${successCount} plugins, but ${failCount} failed.`);
        } else {
            setSuccessMessage(`Successfully installed ${successCount} plugins. Restart required.`);
            refreshServers();
        }
        
        setSelectedMarketplace(new Set());
        loadInstalled();
        setPendingActions(prev => {
            const next = new Set(prev);
            targetIds.forEach(id => next.delete(id));
            return next;
        });
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
                    {/* Header + Bulk Actions */}
                    <div className="flex justify-between items-center h-8">
                        <p className="text-sm text-muted-foreground">
                            {totalResults} plugin{totalResults !== 1 ? 's' : ''} found
                        </p>
                        {selectedMarketplace.size > 0 && (
                            <button 
                                onClick={handleBulkInstall}
                                disabled={Array.from(selectedMarketplace).some(id => pendingActions.has(id))}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground shadow-sm hover:shadow-md hover:bg-primary/90 transition-all animate-in fade-in slide-in-from-right-4"
                            >
                                <Download size={13} />
                                Install Selected ({selectedMarketplace.size})
                            </button>
                        )}
                    </div>
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
                            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                                <div className="grid grid-cols-[40px_3fr_1fr_1fr_100px] gap-4 p-3 border-b border-border bg-muted/20 font-semibold text-[11px] text-muted-foreground tracking-wider uppercase items-center">
                                    <div className="flex items-center justify-center">
                                        <input 
                                            type="checkbox" 
                                            className="rounded border-border/50 bg-secondary"
                                            checked={searchResults.length > 0 && selectedMarketplace.size === searchResults.length}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedMarketplace(new Set(searchResults.map(p => p.sourceId)));
                                                else setSelectedMarketplace(new Set());
                                            }}
                                        />
                                    </div>
                                    <div>Plugin</div>
                                    <div>Source</div>
                                    <div>Downloads</div>
                                    <div className="text-right">Action</div>
                                </div>
                                <div className="flex flex-col">
                                    {searchResults.map((plugin, i) => {
                                        const installed = isAlreadyInstalled(plugin.sourceId);
                                        const installing = pendingActions.has(plugin.sourceId);
                                        const selected = selectedMarketplace.has(plugin.sourceId);
                                        return (
                                            <div key={`${plugin.source}-${plugin.sourceId}`} className={`grid grid-cols-[40px_3fr_1fr_1fr_100px] gap-4 p-3 items-center group transition-colors ${i !== searchResults.length - 1 ? 'border-b border-border/50' : ''} ${selected ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
                                                <div className="flex items-center justify-center">
                                                    <input 
                                                        type="checkbox" 
                                                        className="rounded border-border/50 bg-secondary"
                                                        checked={selected}
                                                        onChange={(e) => {
                                                            const next = new Set(selectedMarketplace);
                                                            if (e.target.checked) next.add(plugin.sourceId);
                                                            else next.delete(plugin.sourceId);
                                                            setSelectedMarketplace(next);
                                                        }}
                                                    />
                                                </div>
                                                <div className="flex items-center gap-3 min-w-0">
                                                    {plugin.iconUrl ? (
                                                        <img src={plugin.iconUrl} alt="" className="w-8 h-8 rounded-md object-cover bg-secondary flex-shrink-0" />
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center text-muted-foreground font-bold text-xs flex-shrink-0">
                                                            {plugin.name.charAt(0)}
                                                        </div>
                                                    )}
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="font-semibold text-sm text-foreground truncate">{plugin.name}</h3>
                                                            {plugin.externalUrl && (
                                                                <a href={plugin.externalUrl} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all">
                                                                    <ExternalLink size={12} />
                                                                </a>
                                                            )}
                                                        </div>
                                                        <p className="text-[11px] text-muted-foreground truncate" title={plugin.description}>{plugin.description}</p>
                                                    </div>
                                                </div>
                                                <div className="text-[10px] font-medium text-muted-foreground uppercase flex items-center gap-1.5 truncate">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-primary/40"></span>
                                                    {plugin.source}
                                                </div>
                                                <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                                                    <Download size={12} className="opacity-50" />
                                                    {plugin.downloads >= 1000000 ? `${(plugin.downloads / 1000000).toFixed(1)}M` : plugin.downloads >= 1000 ? `${(plugin.downloads / 1000).toFixed(0)}K` : plugin.downloads}
                                                </div>
                                                <div className="flex justify-end">
                                                    <button
                                                        onClick={() => handleInstall(plugin)}
                                                        disabled={installed || installing || !can('server.plugins.manage', serverId)}
                                                        className={`flex items-center justify-center gap-1.5 px-3 py-1.5 w-[90px] rounded-lg text-xs font-medium transition-all ${installed ? 'bg-emerald-500/10 text-emerald-400 cursor-default' : installing ? 'bg-primary/20 text-primary cursor-wait' : 'bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground'}`}
                                                    >
                                                        {installed ? <><Check size={12} /> Has</> : installing ? <Loader2 size={12} className="animate-spin" /> : <><Download size={12} /> Get</>}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ===== INSTALLED TAB ===== */}
            {activeTab === 'installed' && (
                <div className="flex flex-col gap-4 flex-1 min-h-0">
                    <div className="flex justify-between items-center h-8">
                        <p className="text-sm text-muted-foreground">
                            {installedPlugins.length} plugin{installedPlugins.length !== 1 ? 's' : ''} installed
                        </p>
                        <div className="flex items-center gap-2">
                            {selectedInstalled.size > 0 && (
                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 mr-2">
                                    <button onClick={() => handleBulkToggle(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-all flex items-center gap-1.5"><Power size={13} /> Dsb ({selectedInstalled.size})</button>
                                    <button onClick={() => handleBulkToggle(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-all flex items-center gap-1.5"><Check size={13} /> Enb ({selectedInstalled.size})</button>
                                    <button onClick={handleBulkUninstall} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all flex items-center gap-1.5"><Trash2 size={13} /> Del ({selectedInstalled.size})</button>
                                </div>
                            )}
                            <button 
                                onClick={loadInstalled}
                                disabled={isLoadingInstalled}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground transition-all"
                            >
                                <RefreshCw size={12} className={isLoadingInstalled ? 'animate-spin' : ''} />
                                Rescan
                            </button>
                        </div>
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
                            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                                <div className="grid grid-cols-[40px_3fr_1.5fr_1fr_100px] gap-4 p-3 border-b border-border bg-muted/20 font-semibold text-[11px] text-muted-foreground tracking-wider uppercase items-center">
                                    <div className="flex items-center justify-center">
                                        <input 
                                            type="checkbox" 
                                            className="rounded border-border/50 bg-secondary"
                                            checked={installedPlugins.length > 0 && selectedInstalled.size === installedPlugins.length}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedInstalled(new Set(installedPlugins.map(p => p.id)));
                                                else setSelectedInstalled(new Set());
                                            }}
                                        />
                                    </div>
                                    <div>Plugin</div>
                                    <div>FileName / Identifier</div>
                                    <div>Version</div>
                                    <div className="text-right">Actions</div>
                                </div>
                                <div className="flex flex-col">
                                    {installedPlugins.map((plugin, i) => {
                                        const busy = pendingActions.has(plugin.id);
                                        const selected = selectedInstalled.has(plugin.id);
                                        return (
                                            <div key={plugin.id} className={`grid grid-cols-[40px_3fr_1.5fr_1fr_100px] gap-4 p-3 items-center group transition-colors ${i !== installedPlugins.length - 1 ? 'border-b border-border/50' : ''} ${selected ? 'bg-primary/5' : 'hover:bg-muted/30'} ${!plugin.enabled ? 'opacity-60' : ''}`}>
                                                <div className="flex items-center justify-center">
                                                    <input 
                                                        type="checkbox" 
                                                        className="rounded border-border/50 bg-secondary"
                                                        checked={selected}
                                                        onChange={(e) => {
                                                            const next = new Set(selectedInstalled);
                                                            if (e.target.checked) next.add(plugin.id);
                                                            else next.delete(plugin.id);
                                                            setSelectedInstalled(next);
                                                        }}
                                                    />
                                                </div>
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className={`w-8 h-8 rounded-md flex items-center justify-center font-bold text-xs flex-shrink-0 ${plugin.enabled ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                                                        {plugin.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0 flex flex-col justify-center">
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="font-semibold text-sm text-foreground truncate">{plugin.name}</h3>
                                                            {!plugin.enabled && (
                                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 font-bold uppercase tracking-wider">Disabled</span>
                                                            )}
                                                        </div>
                                                        <p className="text-[10px] text-muted-foreground truncate opacity-0 group-hover:opacity-100 transition-opacity">ID: {plugin.id}</p>
                                                    </div>
                                                </div>
                                                <div className="text-[11px] font-mono text-muted-foreground truncate bg-secondary/30 px-2 py-1 flex items-center h-[26px] rounded w-fit">
                                                    {plugin.fileName}
                                                </div>
                                                <div className="text-[11px] text-muted-foreground flex flex-col justify-center gap-0.5">
                                                    <span className="font-semibold text-foreground/80">v{plugin.version}</span>
                                                    <span className="text-[9px] uppercase tracking-wider opacity-60 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-border"></span>{plugin.source || 'Local'}</span>
                                                </div>
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        onClick={() => handleToggle(plugin)}
                                                        disabled={busy || !can('server.plugins.manage', serverId)}
                                                        title={plugin.enabled ? 'Disable' : 'Enable'}
                                                        className={`p-1.5 rounded-lg text-xs transition-all flex items-center justify-center w-8 h-8 ${plugin.enabled ? 'text-amber-500 hover:bg-amber-500/10' : 'text-emerald-500 hover:bg-emerald-500/10'}`}
                                                    >
                                                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleUninstall(plugin)}
                                                        disabled={busy || !can('server.plugins.manage', serverId)}
                                                        title="Uninstall"
                                                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30 flex items-center justify-center w-8 h-8"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
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
                            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                                <div className="grid grid-cols-[40px_3fr_1.5fr_100px] gap-4 p-3 border-b border-border bg-muted/20 font-semibold text-[11px] text-muted-foreground tracking-wider uppercase items-center">
                                    <div className="flex items-center justify-center">
                                        <input 
                                            type="checkbox" 
                                            className="rounded border-border/50 bg-secondary"
                                            checked={updates.length > 0 && selectedUpdates.size === updates.length}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedUpdates(new Set(updates.map(u => u.pluginId)));
                                                else setSelectedUpdates(new Set());
                                            }}
                                        />
                                    </div>
                                    <div>Plugin Name</div>
                                    <div>Version Jump</div>
                                    <div className="text-right">Action</div>
                                </div>
                                <div className="flex flex-col">
                                    {updates.map((update, i) => {
                                        const busy = pendingActions.has(update.pluginId);
                                        const selected = selectedUpdates.has(update.pluginId);
                                        return (
                                            <div key={update.pluginId} className={`grid grid-cols-[40px_3fr_1.5fr_100px] gap-4 p-3 items-center group transition-colors ${i !== updates.length - 1 ? 'border-b border-border/50' : ''} ${selected ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
                                                <div className="flex items-center justify-center">
                                                    <input 
                                                        type="checkbox" 
                                                        className="rounded border-border/50 bg-secondary"
                                                        checked={selected}
                                                        onChange={(e) => {
                                                            const next = new Set(selectedUpdates);
                                                            if (e.target.checked) next.add(update.pluginId);
                                                            else next.delete(update.pluginId);
                                                            setSelectedUpdates(next);
                                                        }}
                                                    />
                                                </div>
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-8 h-8 rounded-md bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold text-xs flex-shrink-0">
                                                        {update.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3 className="font-semibold text-sm text-foreground truncate">{update.name}</h3>
                                                        <p className="text-[10px] text-muted-foreground truncate uppercase font-medium">{update.source}</p>
                                                    </div>
                                                </div>
                                                <div className="text-[12px] font-mono flex items-center gap-2">
                                                    <span className="text-yellow-500/80">{update.currentVersion}</span>
                                                    <span className="text-muted-foreground/30">→</span>
                                                    <span className="text-emerald-500 font-semibold">{update.latestVersion}</span>
                                                </div>
                                                <div className="flex justify-end">
                                                    <button
                                                        onClick={() => handleUpdate(update)}
                                                        disabled={busy || !can('server.plugins.manage', serverId)}
                                                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 w-[90px] rounded-lg text-xs font-medium bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white transition-all shadow-sm disabled:opacity-50"
                                                    >
                                                        {busy ? <Loader2 size={12} className="animate-spin" /> : <><ArrowUpCircle size={12} /> Sync</>}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
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

export default PluginManagerPro;
