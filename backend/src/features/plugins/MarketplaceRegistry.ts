import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../utils/logger';
import { PluginSearchQuery, PluginSearchResult, PluginPlatform, PluginSource, PluginUpdateInfo } from '@shared/types';

const CACHE_DIR = path.join(process.cwd(), 'backups', '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'plugin_search.json');
const CACHE_TTL = 30 * 60 * 1000; // Increased to 30 minutes for persistent cache
const searchCache = new Map<string, { data: PluginSearchResult, timestamp: number }>();

// Load cache from disk
try {
    if (fs.existsSync(CACHE_FILE)) {
        const data = fs.readJsonSync(CACHE_FILE);
        Object.entries(data).forEach(([key, value]: [string, any]) => {
            if (Date.now() - value.timestamp < CACHE_TTL) {
                searchCache.set(key, value);
            }
        });
        logger.info(`[MarketplaceRegistry] Loaded ${searchCache.size} search results from disk cache`);
    }
} catch (err: any) {
    logger.warn(`[MarketplaceRegistry] Failed to load disk cache: ${err.message}`);
}

function saveCacheToDisk() {
    try {
        fs.ensureDirSync(CACHE_DIR);
        const obj = Object.fromEntries(searchCache.entries());
        fs.writeJsonSync(CACHE_FILE, obj);
    } catch (err: any) {
        logger.warn(`[MarketplaceRegistry] Failed to save disk cache: ${err.message}`);
    }
}

function getCacheKey(query: PluginSearchQuery, source: string): string {
    return `${source}:${query.query}:${query.category || ''}:${query.platform || ''}:${query.gameVersion || ''}:${query.page || 0}:${query.sort || 'downloads'}`;
}

function getCached(key: string): PluginSearchResult | null {
    const entry = searchCache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
        return entry.data;
    }
    searchCache.delete(key);
    return null;
}

function setCache(key: string, data: PluginSearchResult) {
    searchCache.set(key, { data, timestamp: Date.now() });
    saveCacheToDisk();
}

// --- Platform Mapping ---
export const SOFTWARE_TO_PLATFORMS: Record<string, string[]> = {
    'Paper': ['bukkit', 'spigot', 'paper'],
    'Purpur': ['bukkit', 'spigot', 'paper', 'purpur'],
    'Spigot': ['bukkit', 'spigot'],
    'Forge': ['forge'],
    'Fabric': ['fabric'],
    'Vanilla': [],
};

const SOFTWARE_TO_SEARCH_ORDER: Record<string, string[]> = {
    'Paper': ['hangar', 'modrinth', 'spiget'],
    'Purpur': ['hangar', 'modrinth', 'spiget'],
    'Spigot': ['spiget', 'modrinth'],
    'Forge': ['modrinth'],
    'Fabric': ['modrinth'],
    'Vanilla': [],
};

export function getTargetDir(software: string): string {
    if (software === 'Forge' || software === 'Fabric') return 'mods';
    return 'plugins';
}

export function supportsPlugins(software: string): boolean {
    return software !== 'Vanilla';
}

// --- Modrinth Adapter ---
async function searchModrinth(query: PluginSearchQuery, software: string): Promise<PluginSearchResult> {
    const limit = query.limit || 20;
    const offset = ((query.page || 1) - 1) * limit;

    // Build facets based on server software
    const facets: string[][] = [];
    if (software === 'Forge') {
        facets.push(['categories:forge']);
        facets.push(['project_type:mod']);
    } else if (software === 'Fabric') {
        facets.push(['categories:fabric']);
        facets.push(['project_type:mod']);
    } else {
        // Bukkit-family: search for plugins
        facets.push(['project_type:plugin']);
        // Add paper/spigot/bukkit as category facets (OR within group)
        facets.push(['categories:paper', 'categories:spigot', 'categories:bukkit']);
    }

    if (query.gameVersion) {
        facets.push([`versions:${query.gameVersion}`]);
    }

    if (query.category && query.category !== 'All') {
        facets.push([`categories:${query.category.toLowerCase()}`]);
    }

    const sortMap: Record<string, string> = {
        'downloads': 'downloads',
        'updated': 'updated',
        'name': 'relevance',
        'rating': 'follows',
    };

    const params = {
        query: query.query,
        limit,
        offset,
        index: sortMap[query.sort || 'downloads'] || 'downloads',
        facets: JSON.stringify(facets),
    };

    const response = await axios.get('https://api.modrinth.com/v2/search', {
        params,
        headers: { 'User-Agent': 'CraftCommand/1.8.0 (contact@craftcommand.io)' },
        timeout: 10000,
    });

    const data = response.data;
    const plugins = (data as any).hits.map((hit: any) => ({
        sourceId: hit.project_id,
        source: 'modrinth',
        name: hit.title,
        slug: hit.slug,
        description: hit.description || '',
        author: hit.author || 'Unknown',
        iconUrl: hit.icon_url,
        downloads: hit.downloads || 0,
        rating: hit.follows || 0,
        category: hit.categories?.[0] || 'General',
        platforms: hit.categories?.filter((c: string) => ['bukkit', 'spigot', 'paper', 'purpur', 'forge', 'fabric'].includes(c)) || [],
        latestVersion: hit.latest_version || 'Unknown',
        latestGameVersions: hit.versions || [],
        externalUrl: `https://modrinth.com/plugin/${hit.slug}`,
        updatedAt: new Date(hit.date_modified).getTime(),
    }));

    return {
        plugins,
        total: (data as any).total_hits,
        page: query.page || 1,
        pages: Math.ceil((data as any).total_hits / limit),
    };
}

// --- Modrinth Download URL Resolution ---
export async function getModrinthDownloadUrl(projectId: string, gameVersion?: string, platforms?: string[]) {
    const headers = { 'User-Agent': 'CraftCommand/1.8.0 (contact@craftcommand.io)' };
    
    // Parallel fetch project and versions
    const [projectRes, versionsRes] = await Promise.all([
        axios.get(`https://api.modrinth.com/v2/project/${projectId}`, { headers, timeout: 10000 }),
        axios.get(`https://api.modrinth.com/v2/project/${projectId}/version`, { headers, timeout: 10000 })
    ]);

    const project = projectRes.data as any;
    let versions = versionsRes.data as any[];

    // Filter by game version if specified
    if (gameVersion) {
        const filtered = versions.filter((v: any) => v.game_versions?.includes(gameVersion));
        if (filtered.length > 0) versions = filtered;
    }

    // Filter by loaders/platforms if specified
    if (platforms && platforms.length > 0) {
        const platformSet = new Set(platforms.map(p => p.toLowerCase()));
        const filtered = versions.filter((v: any) => 
            v.loaders?.some((loader: string) => platformSet.has(loader.toLowerCase()))
        );
        if (filtered.length > 0) {
            versions = filtered;
        } else {
            // Hardening: If we explicitly requested specific platforms and NONE matched,
            // do NOT fall back to incompatible versions (like Forge on Paper).
            throw new Error(`No compatible versions found for requested platforms: ${platforms.join(', ')}`);
        }
    }

    if (!versions.length) throw new Error('No compatible versions found for this plugin');

    const latest = versions[0];
    const primaryFile = (latest as any).files.find((f: any) => f.primary) || (latest as any).files[0];

    if (!primaryFile?.url) throw new Error('No download URL found');

    return {
        url: (primaryFile as any).url,
        fileName: (primaryFile as any).filename,
        version: (latest as any).version_number,
        // Metadata fields
        description: project.description,
        author: project.author || 'Unknown',
        iconUrl: project.icon_url,
        category: project.categories?.[0] || 'General',
        externalUrl: `https://modrinth.com/plugin/${project.slug}`
    };
}

// --- Spiget Adapter ---
async function searchSpiget(query: PluginSearchQuery): Promise<PluginSearchResult> {
    const limit = query.limit || 20;
    const page = query.page || 1;

    const sortMap: Record<string, string> = {
        'downloads': '-downloads',
        'updated': '-updateDate',
        'name': 'name',
        'rating': '-rating.average',
    };

    const isSearch = !!query.query?.trim();
    const endpoint = isSearch 
        ? `https://api.spiget.org/v2/search/resources/${encodeURIComponent(query.query || '')}`
        : `https://api.spiget.org/v2/resources`;

    let response;
    try {
        response = await axios.get(endpoint, {
            params: {
                size: limit,
                page,
                sort: sortMap[query.sort || 'downloads'] || '-downloads',
            },
            timeout: 10000,
        });
    } catch (err: any) {
        if (err.response?.status === 404) {
            // Spiget returns 404 for search queries it can't handle (e.g. including slashes or dots)
            // We return empty results instead of letting the error bubble up.
            return { plugins: [], total: 0, page, pages: 0 };
        }
        throw err; // Re-throw other errors (500, timeout, etc.)
    }

    const data = response.data;
    const plugins = (Array.isArray(data) ? data : []).map((resource: any) => ({
        sourceId: String(resource.id),
        source: 'spiget',
        name: resource.name || 'Unknown',
        slug: resource.name?.toLowerCase().replace(/\s+/g, '-') || String(resource.id),
        description: resource.tag || '',
        author: resource.author?.name || 'Unknown',
        iconUrl: resource.icon?.url ? `https://www.spigotmc.org/${resource.icon.url}` : undefined,
        downloads: resource.downloads || 0,
        rating: resource.rating?.average || 0,
        category: resource.category?.name || 'General',
        platforms: ['bukkit', 'spigot'],
        latestVersion: resource.version?.id ? String(resource.version.id) : 'Unknown',
        latestGameVersions: resource.testedVersions || [],
        externalUrl: `https://www.spigotmc.org/resources/${resource.id}/`,
        updatedAt: (resource.updateDate || 0) * 1000,
    }));

    return {
        plugins: plugins.map((p: any) => ({ ...p, source: p.source as PluginSource })),
        total: plugins.length < limit ? (page - 1) * limit + plugins.length : page * limit + 1,
        page,
        pages: plugins.length < limit ? page : page + 1,
    };
}

// --- Spiget Download URL ---
export async function getSpigetDownloadUrl(resourceId: string) {
    const detailRes = await axios.get(`https://api.spiget.org/v2/resources/${resourceId}`, { timeout: 10000 });
    const resource = detailRes.data as any;
    const name = resource.name || 'plugin';
    const version = resource.version?.id ? String(resource.version.id) : 'latest';

    return {
        url: `https://api.spiget.org/v2/resources/${resourceId}/download`,
        fileName: `${name.replace(/[^a-zA-Z0-9.-]/g, '_')}-${version}.jar`,
        version,
        // Metadata
        description: resource.tag || '',
        author: resource.author?.name || 'Unknown',
        iconUrl: resource.icon?.url ? `https://www.spigotmc.org/${resource.icon.url}` : undefined,
        category: resource.category?.name || 'General',
        externalUrl: `https://www.spigotmc.org/resources/${resourceId}/`
    };
}

// --- Hangar Adapter ---
async function searchHangar(query: PluginSearchQuery): Promise<PluginSearchResult> {
    const limit = query.limit || 20;
    const offset = ((query.page || 1) - 1) * limit;

    const sortMap: Record<string, string> = {
        'downloads': '-downloads',
        'updated': '-updated',
        'name': 'name',
        'rating': '-stars',
    };

    const params: any = {
        q: query.query,
        limit,
        offset,
        sort: sortMap[query.sort || 'downloads'] || '-downloads',
    };

    if (query.gameVersion) params.version = query.gameVersion;
    if (query.category && query.category !== 'All') params.category = query.category.toUpperCase();

    const response = await axios.get('https://hangar.papermc.io/api/v1/projects', {
        params,
        timeout: 10000,
    });

    const data = response.data;
    const plugins = ((data as any).result || []).map((project: any) => ({
        sourceId: project.namespace?.slug || project.name,
        source: 'hangar',
        name: project.name || 'Unknown',
        slug: project.namespace?.slug || project.name?.toLowerCase().replace(/\s+/g, '-'),
        description: project.description || '',
        author: project.namespace?.owner || 'Unknown',
        iconUrl: project.avatarUrl,
        downloads: project.stats?.downloads || 0,
        rating: project.stats?.stars || 0,
        category: project.category || 'General',
        platforms: ['paper', 'purpur'],
        latestVersion: project.lastUpdated || 'Unknown',
        latestGameVersions: [],
        externalUrl: `https://hangar.papermc.io/${project.namespace?.owner}/${project.namespace?.slug}`,
        updatedAt: new Date(project.lastUpdated).getTime() || 0,
    }));

    return {
        plugins,
        total: (data as any).pagination?.count || plugins.length,
        page: query.page || 1,
        pages: Math.ceil(((data as any).pagination?.count || 1) / limit),
    };
}

// --- Hangar Download URL ---
export async function getHangarDownloadUrl(slug: string, gameVersion?: string) {
    const params: any = { limit: 1, offset: 0 };
    if (gameVersion) params.version = gameVersion;

    const [projectRes, versionsRes] = await Promise.all([
        axios.get(`https://hangar.papermc.io/api/v1/projects/${slug}`, { timeout: 10000 }),
        axios.get(`https://hangar.papermc.io/api/v1/projects/${slug}/versions`, { params, timeout: 10000 })
    ]);

    const project = projectRes.data as any;
    const versions = (versionsRes.data as any).result;

    if (!versions?.length) throw new Error(`No versions found for this plugin${gameVersion ? ' matching ' + gameVersion : ''}`);

    const latest = versions[0];
    const versionName = latest.name;
    const platform = 'PAPER'; 

    return {
        url: `https://hangar.papermc.io/api/v1/projects/${slug}/versions/${versionName}/${platform}/download`,
        fileName: `${slug}-${versionName}.jar`,
        version: versionName,
        // Metadata
        description: project.description || '',
        author: project.namespace?.owner || 'Unknown',
        iconUrl: project.avatarUrl,
        category: project.category || 'General',
        externalUrl: `https://hangar.papermc.io/${project.namespace?.owner}/${project.namespace?.slug}`
    };
}

// --- Main Registry ---
export class MarketplaceRegistry {
    async search(query: PluginSearchQuery, software: string): Promise<PluginSearchResult> {
        if (!supportsPlugins(software)) {
            return { plugins: [], total: 0, page: 1, pages: 0 };
        }

        const sources = query.source 
            ? [query.source as string] 
            : SOFTWARE_TO_SEARCH_ORDER[software] || ['modrinth'];

        const allPlugins: any[] = [];
        let totalHits = 0;

        for (const source of sources) {
            const cacheKey = getCacheKey(query, source);
            const cached = getCached(cacheKey);
            if (cached) {
                allPlugins.push(...cached.plugins);
                totalHits += cached.total;
                continue;
            }

            try {
                let result: PluginSearchResult;
                switch (source) {
                    case 'modrinth':
                        result = await searchModrinth(query, software);
                        break;
                    case 'spiget':
                        result = await searchSpiget(query);
                        break;
                    case 'hangar':
                        result = await searchHangar(query);
                        break;
                    default:
                        continue;
                }
                setCache(cacheKey, result);
                allPlugins.push(...result.plugins);
                totalHits += result.total;
            } catch (err: any) {
                logger.warn(`[Marketplace] ${source} search failed: ${err.message}`);
            }
        }

        // Deduplicate
        const seen = new Set<string>();
        const deduped = allPlugins.filter(p => {
            const key = p.name.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        const limit = query.limit || 20;
        return {
            plugins: deduped.slice(0, limit),
            total: totalHits,
            page: query.page || 1,
            pages: Math.ceil(totalHits / limit),
        };
    }

    async getDownloadUrl(sourceId: string, source: string, gameVersion?: string, platforms?: string[]) {
        switch (source) {
            case 'direct':
                let url = sourceId;
                let fileName = sourceId.split('/').pop()?.split('?')[0] || 'plugin.jar';

                // Support "url|filename.jar" syntax
                if (sourceId.includes('|')) {
                    const parts = sourceId.split('|');
                    url = parts[0];
                    fileName = parts[1];
                } else if (!fileName.endsWith('.jar')) {
                     fileName += '.jar';
                }

                return {
                    url: url,
                    fileName: fileName,
                    version: 'latest',
                    description: 'Manually specified download link',
                    author: 'Direct Link',
                    category: 'General'
                };
            case 'modrinth':
                return getModrinthDownloadUrl(sourceId, gameVersion, platforms);
            case 'spiget':
                return getSpigetDownloadUrl(sourceId);
            case 'hangar':
                return getHangarDownloadUrl(sourceId, gameVersion);
            default:
                throw new Error(`Unsupported source: ${source}`);
        }
    }
}

export const marketplaceRegistry = new MarketplaceRegistry();
