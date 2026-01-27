import React, { useState, useEffect } from 'react';
import { Search, Package, Download, User, Loader2, ArrowRight } from 'lucide-react';
import { API } from '../../services/api';

interface Modpack {
    id: string;
    title: string;
    description: string;
    author: string;
    icon_url: string;
    slug: string;
    downloads: number;
    version_id: string;
}

interface ModpackBrowserProps {
    onSelect: (pack: Modpack) => void;
}

const ModpackBrowser: React.FC<ModpackBrowserProps> = ({ onSelect }) => {
    const [query, setQuery] = useState('');
    const [packs, setPacks] = useState<Modpack[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [debouncedQuery, setDebouncedQuery] = useState('');

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query), 500);
        return () => clearTimeout(timer);
    }, [query]);

    // Fetch Logic
    useEffect(() => {
        const search = async () => {
            if (!debouncedQuery) return; // Wait for input
            setIsLoading(true);
            try {
                // We'll use the generic fetch in API or add a dedicated method later
                // For now, direct fetch to our new endpoint
                const res = await fetch(`/api/modpacks/search?q=${encodeURIComponent(debouncedQuery)}&loader=fabric`); // Default to fabric for now, can add toggle later
                if (res.ok) {
                    const data = await res.json();
                    setPacks(data);
                }
            } catch (e) {
                console.error("Failed to search modpacks", e);
            } finally {
                setIsLoading(false);
            }
        };
        search();
    }, [debouncedQuery]);

    return (
        <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-3 top-3 text-muted-foreground w-5 h-5" />
                <input 
                    type="text" 
                    placeholder="Search Modpacks (e.g. 'Better Minecraft', 'Origins')..." 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full bg-secondary/30 border border-border rounded-xl pl-10 pr-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-muted-foreground/50"
                />
            </div>

            {/* Results Grid */}
            <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                {isLoading ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="animate-spin text-primary" size={32} />
                    </div>
                ) : packs.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground bg-secondary/10 rounded-xl border border-dashed border-border">
                        <Package size={32} className="mx-auto mb-2 opacity-50" />
                        <p>Search for a modpack to begin</p>
                    </div>
                ) : (
                    packs.map((pack) => (
                        <div 
                            key={pack.id}
                            onClick={() => onSelect(pack)}
                            className="flex items-center gap-4 p-3 rounded-xl border border-border bg-card/50 hover:bg-secondary/50 cursor-pointer transition-all group"
                        >
                            <img 
                                src={pack.icon_url || 'https://via.placeholder.com/64'} 
                                alt={pack.title}
                                className="w-12 h-12 rounded-lg object-cover bg-secondary" 
                            />
                            <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{pack.title}</h4>
                                <p className="text-xs text-muted-foreground truncate">{pack.description}</p>
                                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground font-mono">
                                    <span className="flex items-center gap-1"><User size={10} /> {pack.author}</span>
                                    <span className="flex items-center gap-1"><Download size={10} /> {pack.downloads.toLocaleString()}</span>
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
