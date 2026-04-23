import React, { useState, useEffect, useCallback } from 'react';
import { Search, Package, Download, User, Loader2, ArrowRight, X, RefreshCw, Blocks, Box, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API } from '@core/services/api';

interface Modpack {
    id: string;
    title: string;
    description: string;
    author: string;
    icon_url: string;
    slug: string;
    downloads: number;
    version_id: string;
    game_versions?: string[];
    project_type: 'mod' | 'modpack';
}

interface ModpackBrowserProps {
    onSelect: (pack: Modpack, loader: string) => void;
    serverSoftware?: string;
}

// Maps server software → Modrinth loader category
const SOFTWARE_TO_LOADER: Record<string, string> = {
    'Fabric': 'fabric',
    'Forge': 'forge',
    'NeoForge': 'neoforge',
    'Quilt': 'quilt',
    'Paper': 'paper',
    'Purpur': 'paper',
    'Spigot': 'spigot',
    'Bukkit': 'bukkit',
};

const LOADER_OPTIONS = [
    { label: 'Fabric', value: 'fabric' },
    { label: 'Forge', value: 'forge' },
    { label: 'NeoForge', value: 'neoforge' },
    { label: 'Quilt', value: 'quilt' },
];

const TYPE_OPTIONS = [
    { label: 'All', value: 'all' },
    { label: 'Mods', value: 'mod' },
    { label: 'Modpacks', value: 'modpack' },
];

const ModpackBrowser: React.FC<ModpackBrowserProps> = ({ onSelect, serverSoftware }) => {
    const { t } = useTranslation();
    // Auto-detect loader from server software
    const detectedLoader = serverSoftware ? (SOFTWARE_TO_LOADER[serverSoftware] || 'fabric') : 'fabric';

    const [query, setQuery] = useState('');
    const [packs, setPacks] = useState<Modpack[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [activeLoader, setActiveLoader] = useState(detectedLoader);
    const [activeType, setActiveType] = useState<'all' | 'mod' | 'modpack'>('all');
    const [error, setError] = useState<string | null>(null);

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query), 500);
        return () => clearTimeout(timer);
    }, [query]);

    // Fetch Logic
    const search = useCallback(async () => {
        if (!debouncedQuery) {
            setPacks([]);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                q: debouncedQuery,
                loader: activeLoader,
                type: activeType,
            });
            const res = await fetch(`/api/modpacks/search?${params.toString()}`);
            if (!res.ok) {
                throw new Error(t('modpack_browser.search_failed_msg'));
            }
            const data = await res.json();
            setPacks(Array.isArray(data) ? data : []);
        } catch (e: any) {
            setError(e.message || t('modpack_browser.search_failed_msg'));
            setPacks([]);
        } finally {
            setIsLoading(false);
        }
    }, [debouncedQuery, activeLoader, activeType]);

    useEffect(() => {
        search();
    }, [search]);

    const formatDownloads = (n: number): string => {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
        return String(n);
    };

    return (
        <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-3 top-3 text-muted-foreground w-5 h-5" />
                <input 
                    type="text" 
                    placeholder={t('modpack_browser.search_placeholder')} 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full bg-secondary/30 border border-border rounded-xl pl-10 pr-10 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-muted-foreground/50"
                />
                {query && (
                    <button 
                        onClick={() => setQuery('')} 
                        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap gap-4">
                {/* Loader Toggle */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mr-1">{t('modpack_browser.loader')}</span>
                    {LOADER_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => setActiveLoader(opt.value)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                                activeLoader === opt.value 
                                    ? 'bg-primary text-primary-foreground shadow-sm' 
                                    : 'bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {/* Type Toggle */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mr-1">{t('modpack_browser.type')}</span>
                    {TYPE_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => setActiveType(opt.value as typeof activeType)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                                activeType === opt.value 
                                    ? 'bg-primary text-primary-foreground shadow-sm' 
                                    : 'bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground'
                            }`}
                        >
                            {opt.value === 'all' ? t('modpack_browser.all') : opt.value === 'mod' ? t('modpack_browser.mods') : t('modpack_browser.modpacks')}
                        </button>
                    ))}
                </div>
            </div>

            {/* Error State */}
            {error && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm bg-red-500/10 border border-red-500/30 text-red-400">
                    <AlertTriangle size={16} />
                    <span className="flex-1">{error}</span>
                    <button 
                        onClick={search} 
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-500/20 hover:bg-red-500/30 transition-colors"
                    >
                        <RefreshCw size={12} /> {t('modpack_browser.retry')}
                    </button>
                </div>
            )}

            {/* Results Count */}
            {packs.length > 0 && (
                <p className="text-xs text-muted-foreground">
                    {packs.length === 1 ? t('modpack_browser.results_info', { count: packs.length }) : t('modpack_browser.results_info_plural', { count: packs.length })}
                </p>
            )}

            {/* Results Grid */}
            <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                {isLoading ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="animate-spin text-primary" size={32} />
                    </div>
                ) : packs.length === 0 && !error ? (
                    <div className="text-center py-10 text-muted-foreground bg-secondary/10 rounded-xl border border-dashed border-border">
                        <Package size={32} className="mx-auto mb-2 opacity-50" />
                        {debouncedQuery ? (
                            <>
                                <p className="font-medium">{t('modpack_browser.no_results')}</p>
                                <p className="text-xs mt-1">{t('modpack_browser.try_different')}</p>
                            </>
                        ) : (
                            <>
                                <p>{t('modpack_browser.search_begin')}</p>
                                <p className="text-xs mt-1 text-muted-foreground/60">
                                    {t('modpack_browser.try_examples')}
                                </p>
                            </>
                        )}
                    </div>
                ) : (
                    packs.map((pack) => (
                        <div 
                            key={pack.id}
                            onClick={() => onSelect(pack, activeLoader)}
                            className="flex items-center gap-4 p-3 rounded-xl border border-border bg-card/50 hover:bg-secondary/50 hover:border-primary/30 cursor-pointer transition-all group"
                        >
                            <img 
                                src={pack.icon_url || 'https://via.placeholder.com/64'} 
                                alt={pack.title}
                                className="w-12 h-12 rounded-lg object-cover bg-secondary" 
                            />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <h4 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{pack.title}</h4>
                                    {/* Type Badge */}
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase flex-shrink-0 ${
                                        pack.project_type === 'modpack' 
                                            ? 'bg-violet-500/15 text-violet-400 border border-violet-500/20' 
                                            : 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                                    }`}>
                                        {pack.project_type === 'modpack' ? (
                                            <span className="flex items-center gap-0.5"><Blocks size={8} /> {t('modpack_browser.pack')}</span>
                                        ) : (
                                            <span className="flex items-center gap-0.5"><Box size={8} /> {t('modpack_browser.mod')}</span>
                                        )}
                                    </span>
                                    {pack.game_versions && pack.game_versions.length > 0 && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase flex-shrink-0 bg-secondary/80 text-foreground border border-border">
                                            {pack.game_versions[pack.game_versions.length - 1]}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground truncate">{pack.description}</p>
                                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground font-mono">
                                    <span className="flex items-center gap-1"><User size={10} /> {pack.author}</span>
                                    <span className="flex items-center gap-1"><Download size={10} /> {formatDownloads(pack.downloads)}</span>
                                </div>
                            </div>
                            <button className="p-2 text-primary opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10 rounded-lg">
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default ModpackBrowser;
