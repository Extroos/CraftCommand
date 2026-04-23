import axios from 'axios';
import { logger } from '../../utils/logger';

interface MojangVersion {
    id: string;
    type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
    url: string;
    time: string;
    releaseTime: string;
}

interface MinecraftVersionsResponse {
    latest: {
        release: string;
        snapshot: string;
    };
    versions: MojangVersion[];
}

export class MinecraftVersionService {
    private cache: { data: MinecraftVersionsResponse, timestamp: number } | null = null;
    private readonly CACHE_TTL = 1000 * 60 * 60; // 1 hour
    private readonly MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

    async fetchVersions(): Promise<MinecraftVersionsResponse> {
        if (this.cache && (Date.now() - this.cache.timestamp < this.CACHE_TTL)) {
            return this.cache.data;
        }

        try {
            logger.info(`[MinecraftVersionService] Fetching from Mojang at: ${this.MANIFEST_URL}`);
            const response = await axios.get(this.MANIFEST_URL, {
                timeout: 8000,
                headers: { 'User-Agent': 'CraftCommand-Panel/1.0' }
            });

            const respData = response.data as any;
            if (!respData || !respData.versions) {
                logger.error('[MinecraftVersionService] Invalid response from Mojang (Empty data)');
                throw new Error('Mojang returned empty data');
            }

            const data = response.data as MinecraftVersionsResponse;
            logger.info(`[MinecraftVersionService] Successfully fetched ${data.versions.length} versions.`);
            
            const result = {
                latest: data.latest,
                versions: data.versions
            };

            this.cache = { data: result, timestamp: Date.now() };
            return result;
        } catch (e: any) {
            logger.error(`[MinecraftVersionService] Fetch error: ${e.message}`);
            if (this.cache) {
                logger.info('[MinecraftVersionService] Serving from stale cache after failure.');
                return this.cache.data;
            }
            
            logger.warn('[MinecraftVersionService] No cache available. Serving hardcoded safety fallbacks.');
            return {
                latest: { release: '26.1', snapshot: '26.1.1-rc1' },
                versions: [
                    { id: '26.1', type: 'release', url: '', time: '', releaseTime: '' },
                    { id: '1.21.11', type: 'release', url: '', time: '', releaseTime: '' },
                    { id: '1.20.4', type: 'release', url: '', time: '', releaseTime: '' },
                    { id: '1.8.9', type: 'release', url: '', time: '', releaseTime: '' }
                ]
            };
        }
    }

    async getGroupedVersions() {
        const data = await this.fetchVersions();
        
        return {
            latest: data.latest.release,
            latestSnapshot: data.latest.snapshot,
            releases: data.versions.filter(v => v.type === 'release').map(v => v.id),
            snapshots: data.versions.filter(v => v.type === 'snapshot').map(v => v.id),
            beta: data.versions.filter(v => v.type === 'old_beta').map(v => v.id),
            alpha: data.versions.filter(v => v.type === 'old_alpha').map(v => v.id),
        };
    }
}

export const minecraftVersionService = new MinecraftVersionService();
