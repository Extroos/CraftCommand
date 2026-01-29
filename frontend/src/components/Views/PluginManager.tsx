
import React, { useState } from 'react';
import { Plugin } from '@shared/types';
import { Search, Download, Check, ExternalLink, Filter, Box, Loader2 } from 'lucide-react';

const PluginManager: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [installingId, setInstallingId] = useState<string | null>(null);
    const [activeCategory, setActiveCategory] = useState<string>('All');

    const [plugins, setPlugins] = useState<Plugin[]>([
        { id: '1', name: 'EssentialsX', description: 'The essential suite of commands for Minecraft servers.', author: 'EssentialsX Team', downloads: '12M+', category: 'Admin', installed: true, version: '2.20.1', icon: 'E' },
        { id: '2', name: 'WorldEdit', description: 'In-game voxel map editor and terrain modification tool.', author: 'EngineHub', downloads: '8.5M+', category: 'World', installed: false, version: '7.3.0', icon: 'W' },
        { id: '3', name: 'Vault', description: 'Permissions, Chat, and Economy API.', author: 'ChatControl', downloads: '25M+', category: 'Economy', installed: true, version: '1.7.3', icon: 'V' },
        { id: '4', name: 'LuckPerms', description: 'Advanced permissions plugin.', author: 'Luck', downloads: '5M+', category: 'Admin', installed: false, version: '5.4.102', icon: 'L' },
        { id: '5', name: 'CoreProtect', description: 'Fast, efficient data logging and anti-griefing tool.', author: 'Intelli', downloads: '3M+', category: 'Admin', installed: false, version: '22.2', icon: 'C' },
        { id: '6', name: 'Multiverse-Core', description: 'World management solution.', author: 'Multiverse', downloads: '10M+', category: 'World', installed: false, version: '4.3.1', icon: 'M' },
        { id: '7', name: 'PlaceholderAPI', description: 'A flexible placeholder expansion service.', author: 'Clip', downloads: '15M+', category: 'General', installed: true, version: '2.11.5', icon: 'P' },
        { id: '8', name: 'ViaVersion', description: 'Allow newer client versions to join older server versions.', author: 'ViaMaintainers', downloads: '9M+', category: 'General', installed: false, version: '4.9.2', icon: 'V' },
    ]);

    const handleInstall = (id: string) => {
        setInstallingId(id);
        setTimeout(() => {
            setPlugins(prev => prev.map(p => p.id === id ? { ...p, installed: !p.installed } : p));
            setInstallingId(null);
        }, 1500);
    };

    const categories = ['All', 'Admin', 'World', 'Economy', 'General', 'Chat'];

    const filteredPlugins = plugins.filter(p => 
        (activeCategory === 'All' || p.category === activeCategory) &&
        (p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="h-[calc(100vh-120px)] flex flex-col gap-6 animate-fade-in relative overflow-hidden">
            {/* Premium Teaser Overlay */}
            <div className="absolute inset-0 z-20 backdrop-blur-sm bg-background/20 flex items-center justify-center p-6">
                <div className="bg-card/90 border border-border/50 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl backdrop-blur-md animate-in zoom-in-95 duration-300 ring-1 ring-white/10">
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 text-primary shadow-inner">
                        <Box size={32} />
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight mb-2">Marketplace Engine</h2>
                    <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                         The automated plugin distribution system <span className="text-primary font-semibold italic">will be in the upcoming updates</span>.
                    </p>
                    <div className="flex items-center gap-2 justify-center py-2 px-4 rounded-full bg-secondary/80 border border-border w-fit mx-auto shadow-sm">
                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Development in Progress</span>
                    </div>
                </div>
            </div>

            {/* Blurred Background Content */}
            <div className="flex flex-col gap-6 h-full blur-[6px] opacity-40 pointer-events-none select-none filter transition-all duration-700">
                {/* Search and Filter Header */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <div>
                            <h2 className="text-xl font-bold tracking-tight">Plugin Marketplace</h2>
                            <p className="text-sm text-muted-foreground">Browse and install addons from SpigotMC and Paper directly.</p>
                        </div>
                        <div className="relative w-full md:w-80">
                            <Search className="absolute left-3 top-2.5 text-muted-foreground h-4 w-4" />
                            <input 
                                type="text" 
                                placeholder="Search plugins..." 
                                value={searchTerm}
                                readOnly
                                className="w-full bg-secondary/50 border border-border rounded-lg pl-9 pr-4 py-2 text-sm"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 pb-2">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                                    activeCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Plugin Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-hidden pb-6 pr-2">
                    {filteredPlugins.map((plugin) => (
                        <div key={plugin.id} className="bg-card border border-border rounded-xl p-5 flex flex-col h-full opacity-50">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center text-xl font-bold">
                                        {plugin.icon}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-foreground leading-tight">{plugin.name}</h3>
                                        <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{plugin.category}</span>
                                    </div>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{plugin.description}</p>
                            <div className="mt-auto pt-4 border-t border-border/50">
                                <div className="w-full h-8 bg-secondary rounded-lg" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PluginManager;
