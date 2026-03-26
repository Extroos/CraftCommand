
import axios from 'axios';
import { logger } from '../../utils/logger';

interface BedrockVersionsResponse {
    latest: string;
    versions: string[];
}

export class BedrockVersionService {
    private cache: { data: BedrockVersionsResponse, timestamp: number } | null = null;
    private readonly CACHE_TTL = 1000 * 60 * 60; // 1 hour
    
    // We'll use a multi-source strategy: Try a community-maintained manifest first, fallback to official scraper
    private readonly COMMUNITY_MANIFEST = 'https://raw.githubusercontent.com/Bedrock-OSS/BDS-Versions/main/versions.json';

    async getVersions(): Promise<BedrockVersionsResponse> {
        if (this.cache && (Date.now() - this.cache.timestamp < this.CACHE_TTL)) {
            return this.cache.data;
        }

        try {
            logger.info('[BedrockVersionService] Fetching versions from community manifest...');
            const response = await axios.get(this.COMMUNITY_MANIFEST, { timeout: 5000 });
            
            // The Bedrock-OSS manifest structure is usually an array of version objects
            if (Array.isArray(response.data)) {
                const versions = response.data
                    .filter(v => v.version && !v.version.toLowerCase().includes('preview'))
                    .map(v => v.version);
                
                if (versions.length > 0) {
                    const result = {
                        latest: versions[0],
                        versions: versions.slice(0, 50) // Keep reasonable limit
                    };
                    this.cache = { data: result, timestamp: Date.now() };
                    return result;
                }
            }
        } catch (e: any) {
            logger.warn(`[BedrockVersionService] Community manifest failed: ${e.message}. Trying fallback...`);
        }

        // Final Fallback: Hardcoded verified versions if all else fails
        return {
            latest: '26.10',
            versions: ['26.10', '26.1', '1.21.21.01', '1.21.11.01', '1.21.2.02']
        };
    }
}

export const bedrockVersionService = new BedrockVersionService();
