import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

/**
 * Common backup file exclusion patterns to keep archives lean.
 */
export const BACKUP_EXCLUDES = [
    'session.lock',
    '*.lck',
    'logs/latest.log',
    'backups/**',
    '*.zip',
    'temp/**',
    '.temp/**'
];

export interface SharedBackup {
    id: string;
    serverId: string;
    filename: string;
    size: number;
    createdAt: string;
    description?: string;
    sha256?: string;
    scope?: 'full' | 'world' | 'configs' | 'plugins';
}

/**
 * Detect world folders in a Minecraft server directory.
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
        } catch (e) {}
    }

    // 2. Server Properties Level Name
    try {
        const propsPath = path.join(serverDir, 'server.properties');
        if (await fs.pathExists(propsPath)) {
            const content = await fs.readFile(propsPath, 'utf-8');
            const match = content.match(/^[ \t]*level-name[ \t]*=[ \t]*(.+)$/m);
            if (match && match[1].trim()) {
                const levelName = match[1].trim();
                const candidates = [levelName, path.join('worlds', levelName), 'world'];
                for (const cand of candidates) {
                    const fullPath = path.join(serverDir, cand);
                    if (await fs.pathExists(fullPath) && (await fs.stat(fullPath)).isDirectory()) {
                        worlds.push(cand);
                    }
                }
            }
        }
    } catch (e) {}

    // 3. Fallback: Standard Java names
    const standardJava = ['world', 'world_nether', 'world_the_end', 'DIM1', 'DIM-1'];
    for (const w of standardJava) {
        const fullPath = path.join(serverDir, w);
        if (await fs.pathExists(fullPath) && (await fs.stat(fullPath)).isDirectory()) {
            worlds.push(w);
        }
    }
    
    return [...new Set(worlds)];
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
