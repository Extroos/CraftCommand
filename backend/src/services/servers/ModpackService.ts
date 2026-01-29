import axios from 'axios';

class ModpackService {
    private readonly API_URL = 'https://api.modrinth.com/v2';

    async searchModpacks(query: string, loader: string = 'fabric', version?: string) {
        try {
            // 1. Try Exact Match First (if query is simple)
            let exactMatch = null;
            if (query && !query.includes(' ')) {
                try {
                    const exactRes = await axios.get(`${this.API_URL}/project/${query.toLowerCase()}`);
                    if (exactRes.data && exactRes.data.project_type === 'modpack') {
                        exactMatch = exactRes.data;
                    }
                } catch (e) { /* Ignore 404 */ }
            }

            // 2. Build Facets
            const facetList = [
                ["project_type:modpack"],
                [`categories:${loader}`]
            ];
            
            if (version) {
                facetList.push([`versions:${version}`]);
            }

            const facets = JSON.stringify(facetList);

            // 3. Perform General Search
            const response = await axios.get(`${this.API_URL}/search`, {
                params: {
                    query,
                    facets,
                    limit: 20
                },
                headers: {
                    'User-Agent': 'CraftCommand/1.0 (internal-dev)'
                }
            });

            const hits = response.data.hits.map((hit: any) => ({
                id: hit.project_id,
                title: hit.title,
                description: hit.description,
                author: hit.author,
                icon_url: hit.icon_url,
                slug: hit.slug,
                downloads: hit.downloads,
                version_id: hit.latest_version
            }));

            // 4. Merge (Avoid duplicates)
            if (exactMatch) {
                // Transform exact match to hit format
                const exactHit = {
                    id: exactMatch.id,
                    title: exactMatch.title,
                    description: exactMatch.description,
                    author: 'Unknown', // full project struct varies slightly
                    icon_url: exactMatch.icon_url,
                    slug: exactMatch.slug,
                    downloads: exactMatch.downloads,
                    version_id: null // would need another call, but simple search is fine
                };
                
                // Unshift if not already in hits
                if (!hits.find((h: any) => h.id === exactMatch.id)) {
                    hits.unshift(exactHit);
                }
            }

            return hits;

        } catch (e) {
            console.error('Modpack Search Failed', e);
            throw e;
        }
    }

    async getVersionFile(projectId: string, versionId?: string) {
        try {
            let url = versionId 
                ? `${this.API_URL}/version/${versionId}`
                : `${this.API_URL}/project/${projectId}/version`;
            
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'CraftCommand/1.0' }
            });

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
            console.error('Failed to get modpack version info', e);
            throw e;
        }
    }
}

export const modpackService = new ModpackService();
