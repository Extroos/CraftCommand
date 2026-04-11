import axios from 'axios';
import { logger } from '../../utils/logger';

interface ModpackHit {
    id: string;
    title: string;
    description: string;
    author: string;
    icon_url: string;
    slug: string;
    downloads: number;
    version_id: string;
    game_versions: string[];
    project_type: 'mod' | 'modpack';
}

// Maps server software to Modrinth loader categories
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

class ModpackService {
    private readonly API_URL = 'https://api.modrinth.com/v2';
    private readonly HEADERS = { 'User-Agent': 'CraftCommand/1.12.0 (contact@craftcommand.io)' };

    private async requestWithRetry(url: string, params: any = {}, attempts: number = 2): Promise<any> {
        for (let i = 0; i < attempts; i++) {
            try {
                return await axios.get(url, {
                    params,
                    headers: this.HEADERS,
                    timeout: 10000,
                });
            } catch (e: any) {
                if (e.response?.status === 429 && i < attempts - 1) {
                    const retryAfter = parseInt(e.response.headers['retry-after'] || '2', 10);
                    logger.warn(`[ModpackService] Rate limited (429). Retrying in ${retryAfter}s...`);
                    await new Promise(r => setTimeout(r, retryAfter * 1000));
                    continue;
                }
                throw e;
            }
        }
    }

    /**
     * Search Modrinth for a specific project type.
     */
    private async searchByType(
        query: string,
        projectType: 'mod' | 'modpack',
        loader: string = 'fabric',
        version?: string,
        limit: number = 20
    ): Promise<ModpackHit[]> {
        try {
            const facetList: string[][] = [
                [`project_type:${projectType}`],
            ];

            // Add loader facet — for mods/modpacks it's a category
            if (loader) {
                facetList.push([`categories:${loader}`]);
            }

            if (version) {
                facetList.push([`versions:${version}`]);
            }

            const response = await this.requestWithRetry(`${this.API_URL}/search`, {
                query,
                facets: JSON.stringify(facetList),
                limit,
                index: 'relevance',
            });

            return (response.data as any).hits.map((hit: any) => ({
                id: hit.project_id,
                title: hit.title,
                description: hit.description,
                author: hit.author || 'Unknown',
                icon_url: hit.icon_url,
                slug: hit.slug,
                downloads: hit.downloads || 0,
                version_id: hit.latest_version,
                game_versions: hit.versions || [],
                project_type: projectType,
            }));
        } catch (e: any) {
            logger.error(`[ModpackService] ${projectType} search failed: ${e.message}`);
            return []; // Graceful fallback instead of throwing
        }
    }

    /**
     * Search for modpacks only (legacy method, kept for backward compatibility).
     */
    async searchModpacks(query: string, loader: string = 'fabric', version?: string): Promise<ModpackHit[]> {
        return this.searchByType(query, 'modpack', loader, version);
    }

    /**
     * Search for mods only.
     */
    async searchMods(query: string, loader: string = 'fabric', version?: string): Promise<ModpackHit[]> {
        return this.searchByType(query, 'mod', loader, version, 30);
    }

    /**
     * Unified search: queries both mods and modpacks in parallel, merges and deduplicates.
     */
    async searchAll(query: string, loader: string = 'fabric', version?: string, type: 'all' | 'mod' | 'modpack' = 'all'): Promise<ModpackHit[]> {
        if (!query || !query.trim()) return [];

        if (type === 'mod') {
            return this.searchMods(query, loader, version);
        }
        if (type === 'modpack') {
            return this.searchModpacks(query, loader, version);
        }

        // Search both in parallel
        const [mods, modpacks] = await Promise.all([
            this.searchMods(query, loader, version),
            this.searchModpacks(query, loader, version),
        ]);

        // Merge: modpacks first, then mods (natural priority)
        const merged = [...modpacks, ...mods];

        // Deduplicate by project ID
        const seen = new Set<string>();
        return merged.filter(hit => {
            if (seen.has(hit.id)) return false;
            seen.add(hit.id);
            return true;
        });
    }

    /**
     * Resolve the correct loader string from server software.
     */
    static resolveLoader(software?: string): string {
        if (!software) return 'fabric';
        return SOFTWARE_TO_LOADER[software] || 'fabric';
    }

    async getVersionFile(projectId: string, versionId?: string) {
        try {
            let url = versionId 
                ? `${this.API_URL}/version/${versionId}`
                : `${this.API_URL}/project/${projectId}/version`;
            
            const response = await this.requestWithRetry(url);

            // If we got an array (versions list), take the first one
            const versionData = Array.isArray(response.data) ? response.data[0] : response.data;
            
            if (!versionData || !versionData.files || versionData.files.length === 0) {
                throw new Error('No files found for this modpack version.');
            }

            // Find the primary file (usually first or marked as primary)
            const primaryFile = versionData.files.find((f: any) => f.primary) || versionData.files[0];

            return {
                version_number: versionData.version_number,
                file_url: primaryFile.url,
                file_name: primaryFile.filename,
                size: primaryFile.size
            };
        } catch (e) {
            logger.error(`Failed to get modpack version info: ${e}`);
            throw e;
        }
    }
}

export const modpackService = new ModpackService();
