
import { logger } from '../../utils/logger';

/**
 * ╔══════════════════════════════════════════════════════╗
 * ║         MOD BUNDLE SERVICE                          ║
 * ║  Curated mod collections for common use cases       ║
 * ║  Auto-installed via Modrinth API                    ║
 * ╚══════════════════════════════════════════════════════╝
 */

export interface ModEntry {
    slug: string;            // Modrinth project slug
    name: string;
    description: string;
    required: boolean;       // Core mod vs optional
    loader: 'fabric' | 'forge' | 'both';
}

export interface ModBundle {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: 'performance' | 'pvp' | 'creative' | 'quality-of-life' | 'administration';
    loaders: ('fabric' | 'forge')[];
    mods: ModEntry[];
}

const MOD_BUNDLES: ModBundle[] = [
    {
        id: 'performance-pack',
        name: 'Performance Pack',
        description: 'Essential server-side performance mods. Reduces lag, improves chunk loading, and optimizes tick rate.',
        icon: '⚡',
        category: 'performance',
        loaders: ['fabric'],
        mods: [
            { slug: 'lithium', name: 'Lithium', description: 'General-purpose optimization mod for tick performance', required: true, loader: 'fabric' },
            { slug: 'ferrite-core', name: 'FerriteCore', description: 'Reduces memory usage', required: true, loader: 'both' },
            { slug: 'krypton', name: 'Krypton', description: 'Optimizes networking stack', required: true, loader: 'fabric' },
            { slug: 'lazydfu', name: 'LazyDFU', description: 'Defers DataFixerUpper initialization for faster startup', required: false, loader: 'both' },
            { slug: 'starlight', name: 'Starlight', description: 'Rewrites the light engine for better performance', required: false, loader: 'fabric' },
            { slug: 'c2me-fabric', name: 'C2ME', description: 'Concurrent chunk generation and loading', required: false, loader: 'fabric' },
        ]
    },
    {
        id: 'pvp-pack',
        name: 'PvP Essentials',
        description: 'Must-have plugins for competitive PvP servers: combat system, kits, arenas.',
        icon: '🗡️',
        category: 'pvp',
        loaders: ['fabric', 'forge'],
        mods: [
            { slug: 'combat-log-x', name: 'CombatLogX', description: 'Prevent combat logging', required: true, loader: 'both' },
            { slug: 'graves', name: 'Graves', description: 'Death chest for item protection', required: false, loader: 'fabric' },
        ]
    },
    {
        id: 'creative-building',
        name: 'Creative Building Tools',
        description: 'World editing, voxel tools, and building utilities for creative servers.',
        icon: '🏗️',
        category: 'creative',
        loaders: ['fabric', 'forge'],
        mods: [
            { slug: 'worldedit', name: 'WorldEdit', description: 'In-game map editor for large-scale building', required: true, loader: 'both' },
            { slug: 'axiom', name: 'Axiom', description: 'Advanced world editing with visual tools', required: false, loader: 'fabric' },
        ]
    },
    {
        id: 'qol-pack',
        name: 'Quality of Life',
        description: 'Essential QoL improvements: sleep voting, mob heads, armor stand editing, and more.',
        icon: '✨',
        category: 'quality-of-life',
        loaders: ['fabric'],
        mods: [
            { slug: 'fabric-api', name: 'Fabric API', description: 'Core API for Fabric mods', required: true, loader: 'fabric' },
            { slug: 'ledger', name: 'Ledger', description: 'Block logging and rollback', required: true, loader: 'fabric' },
            { slug: 'styled-chat', name: 'Styled Chat', description: 'Customizable chat formatting', required: false, loader: 'fabric' },
        ]
    },
    {
        id: 'admin-pack',
        name: 'Server Administration',
        description: 'Tools for server operators: permissions, logging, anti-cheat, backups.',
        icon: '🛡️',
        category: 'administration',
        loaders: ['fabric', 'forge'],
        mods: [
            { slug: 'luckperms', name: 'LuckPerms', description: 'Advanced permissions system', required: true, loader: 'both' },
            { slug: 'spark', name: 'spark', description: 'Performance profiler and monitoring', required: true, loader: 'both' },
            { slug: 'chunky', name: 'Chunky', description: 'Pre-generate chunks to reduce lag', required: false, loader: 'both' },
        ]
    }
];

class ModBundleService {
    /**
     * Get all available mod bundles.
     */
    getBundles(): ModBundle[] {
        return MOD_BUNDLES;
    }

    /**
     * Get a specific mod bundle.
     */
    getBundle(id: string): ModBundle | undefined {
        return MOD_BUNDLES.find(b => b.id === id);
    }

    /**
     * Get bundles compatible with a specific mod loader.
     */
    getBundlesForLoader(loader: 'fabric' | 'forge'): ModBundle[] {
        return MOD_BUNDLES.filter(b => b.loaders.includes(loader));
    }

    /**
     * Get bundles by category.
     */
    getBundlesByCategory(category: ModBundle['category']): ModBundle[] {
        return MOD_BUNDLES.filter(b => b.category === category);
    }

    /**
     * Get the list of required mods for a bundle (for install confirmation UI).
     */
    getRequiredMods(bundleId: string, loader: 'fabric' | 'forge'): ModEntry[] {
        const bundle = this.getBundle(bundleId);
        if (!bundle) return [];
        return bundle.mods.filter(m => m.required && (m.loader === loader || m.loader === 'both'));
    }

    /**
     * Get Modrinth slugs for installation.
     */
    getInstallSlugs(bundleId: string, loader: 'fabric' | 'forge', includeOptional: boolean = false): string[] {
        const bundle = this.getBundle(bundleId);
        if (!bundle) return [];

        return bundle.mods
            .filter(m => (m.loader === loader || m.loader === 'both'))
            .filter(m => m.required || includeOptional)
            .map(m => m.slug);
    }
}

export const modBundleService = new ModBundleService();
