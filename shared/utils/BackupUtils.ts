import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

/**
 * Detect world folders in a Minecraft server directory.
 * Supports Java (standard and custom level-name) and Bedrock (worlds/ folder).
 */
export async function detectWorldFolders(serverDir: string): Promise<string[]> {
    const worlds: string[] = [];
    
    // 1. Bedrock Container Discovery
    const bedrockWorldsDir = path.join(serverDir, 'worlds');
    if (await fs.pathExists(bedrockWorldsDir)) {
        try {
            const items = await fs.readdir(bedrockWorldsDir, { withFileTypes: true });
            for (const item of items) {
                if (item.isDirectory()) {
                    worlds.push(path.join('worlds', item.name));
                }
            }
        } catch (e) {
            // Log or ignore
        }
    }

    // 2. Server Properties Level Name (Java & Bedrock)
    try {
        const propsPath = path.join(serverDir, 'server.properties');
        if (await fs.pathExists(propsPath)) {
            const content = await fs.readFile(propsPath, 'utf-8');
            // Improved regex to handle various line endings and potential spaces
            const match = content.match(/^[ \t]*level-name[ \t]*=[ \t]*(.+)$/m);
            if (match && match[1].trim()) {
                const levelName = match[1].trim();
                
                // Check various potential locations for this level name
                const candidates = [
                    levelName,
                    path.join('worlds', levelName),
                    'world', // Standard Fallback
                ];

                for (const cand of candidates) {
                    const fullPath = path.join(serverDir, cand);
                    if (await fs.pathExists(fullPath)) {
                        const stat = await fs.stat(fullPath);
                        if (stat.isDirectory()) {
                            worlds.push(cand);
                        }
                    }
                }
            }
        }
    } catch (e) {
        // Properties parsing failed
    }

    // 3. Fallback: Standard Java names if still empty or as supplementary
    const standardJava = ['world', 'world_nether', 'world_the_end', 'DIM1', 'DIM-1'];
    for (const w of standardJava) {
        const fullPath = path.join(serverDir, w);
        if (await fs.pathExists(fullPath)) {
            const stat = await fs.stat(fullPath);
            if (stat.isDirectory()) {
                worlds.push(w);
            }
        }
    }
    
    return [...new Set(worlds)]; // Deduplicate
}

/**
 * Calculate SHA-256 hash of a file for integrity verification.
 */
export async function calculateHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', (err) => reject(err));
    });
}
