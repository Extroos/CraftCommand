
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../utils/logger';

export class FileSystemManager {
    private basePath: string;

    constructor(basePath: string) {
        this.basePath = path.resolve(basePath);
        fs.ensureDirSync(this.basePath);
    }

    private resolvePath(relativePath: string): string {
        const unsafePath = path.resolve(this.basePath, relativePath);
        // Ensure strictly within base path, preventing prefix attacks (e.g. /data vs /data2)
        if (unsafePath !== this.basePath && !unsafePath.startsWith(this.basePath + path.sep)) {
            throw new Error('Access denied: Path outside server directory.');
        }
        return unsafePath;
    }

    async listFiles(dirPath: string) {
        const fullPath = this.resolvePath(dirPath);
        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        
        const results = await Promise.all(entries.map(async (entry) => {
            try {
                const entryPath = path.join(fullPath, entry.name);
                const stats = await fs.stat(entryPath);
                return {
                    name: entry.name,
                    isDirectory: entry.isDirectory(),
                    size: entry.isDirectory() ? 0 : stats.size,
                    modified: stats.mtime.toLocaleString(),
                    path: path.relative(this.basePath, entryPath).replace(/\\/g, '/')
                };
            } catch (e) {
                // Handle files that might have been deleted during readdir
                return null;
            }
        }));

        return results.filter(r => r !== null);
    }

    async readFile(filePath: string): Promise<string> {
        return fs.readFile(this.resolvePath(filePath), 'utf-8');
    }

    async writeFile(filePath: string, content: string): Promise<void> {
        const fullPath = this.resolvePath(filePath);
        const tempPath = `${fullPath}.tmp`;
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(tempPath, content);
        await fs.rename(tempPath, fullPath);
    }

    async appendFile(filePath: string, content: string): Promise<void> {
        const fullPath = this.resolvePath(filePath);
        await fs.ensureDir(path.dirname(fullPath));
        await fs.appendFile(fullPath, content);
    }
    
    async createDirectory(dirPath: string): Promise<void> {
        await fs.ensureDir(this.resolvePath(dirPath));
    }
    
    async deletePath(pathToDelete: string): Promise<void> {
        await fs.remove(this.resolvePath(pathToDelete));
    }

    async move(source: string, dest: string): Promise<void> {
        const srcPath = this.resolvePath(source);
        const destPath = this.resolvePath(dest);

        if (srcPath === destPath) throw new Error('Source and destination cannot be the same.');
        if (!(await fs.pathExists(srcPath))) throw new Error('Source file not found.');
        
        await fs.ensureDir(path.dirname(destPath));
        await fs.move(srcPath, destPath, { overwrite: true });
        logger.info(`[FileSys] Moved ${source} -> ${dest}`);
    }

    async copy(source: string, dest: string): Promise<void> {
        const srcPath = this.resolvePath(source);
        const destPath = this.resolvePath(dest);
        
        if (srcPath === destPath) {
             const ext = path.extname(srcPath);
             const name = path.basename(srcPath, ext);
             // Create "File - Copy.txt" logic
             const newDest = path.join(path.dirname(destPath), `${name} - Copy${ext}`);
             return this.copy(source, path.relative(this.basePath, newDest));
        }

        if (!(await fs.pathExists(srcPath))) throw new Error('Source file not found.');

        await fs.ensureDir(path.dirname(destPath));
        await fs.copy(srcPath, destPath, { overwrite: true });
        logger.info(`[FileSys] Copied ${source} -> ${dest}`);
    }

    async compress(paths: string[], archiveName: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const archiver = require('archiver');
            const destPath = this.resolvePath(archiveName);
            const output = fs.createWriteStream(destPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => resolve());
            archive.on('error', (err: any) => reject(err));

            archive.pipe(output);

            for (const p of paths) {
                 const fullPath = this.resolvePath(p);
                 const stats = fs.statSync(fullPath);
                 if (stats.isDirectory()) {
                     archive.directory(fullPath, path.basename(fullPath));
                 } else {
                     archive.file(fullPath, { name: path.basename(fullPath) });
                 }
            }

            archive.finalize();
        });
    }

    async getStats(relativePath: string): Promise<fs.Stats> {
        return fs.stat(this.resolvePath(relativePath));
    }

    async exists(relativePath: string): Promise<boolean> {
        return fs.pathExists(this.resolvePath(relativePath));
    }

    async searchFiles(query: string, dirPath: string = '.', maxResults: number = 100, searchContent: boolean = false): Promise<Array<{
        name: string;
        path: string;
        isDirectory: boolean;
        size: number;
        modified: string;
        snippet?: string;
    }>> {
        const results: Array<{ name: string; path: string; isDirectory: boolean; size: number; modified: string; snippet?: string }> = [];
        const lowerQuery = query.toLowerCase();

        const walk = async (currentDir: string) => {
            if (results.length >= maxResults) return;

            try {
                const fullPath = this.resolvePath(currentDir);
                const entries = await fs.readdir(fullPath, { withFileTypes: true });

                for (const entry of entries) {
                    if (results.length >= maxResults) break;

                    const entryRelPath = path.join(currentDir, entry.name).replace(/\\/g, '/');
                    const entryFullPath = path.join(fullPath, entry.name);

                    // Skip common binary/heavy folders
                    if (entry.isDirectory() && ['node_modules', '.git', 'cache', '.fabric', 'world', 'world_nether', 'world_the_end', 'backups', 'logs'].includes(entry.name)) {
                        continue;
                    }

                    if (entry.isDirectory()) {
                        await walk(entryRelPath);
                    } else {
                        // 1. Filename match
                        const nameMatches = entry.name.toLowerCase().includes(lowerQuery);
                        let contentMatches = false;
                        let snippet: string | undefined;

                        // 2. Content match (if requested and not a binary file)
                        if (searchContent && !nameMatches) {
                            const isBinary = /\.(jar|zip|gz|png|jpg|exe|bin|dat|mca|db)$/i.test(entry.name);
                            if (!isBinary) {
                                try {
                                    const stats = await fs.stat(entryFullPath);
                                    if (stats.size < 5 * 1024 * 1024) { // Only search files < 5MB
                                        const content = await fs.readFile(entryFullPath, 'utf8');
                                        const lowerContent = content.toLowerCase();
                                        const idx = lowerContent.indexOf(lowerQuery);
                                        if (idx !== -1) {
                                            contentMatches = true;
                                            // Extract snippet
                                            const start = Math.max(0, idx - 40);
                                            const end = Math.min(content.length, idx + query.length + 40);
                                            snippet = `...${content.substring(start, end).replace(/\n/g, ' ')}...`;
                                        }
                                    }
                                } catch { /* skip inaccessible */ }
                            }
                        }

                        if (nameMatches || contentMatches) {
                            try {
                                const stats = await fs.stat(entryFullPath);
                                results.push({
                                    name: entry.name,
                                    path: entryRelPath,
                                    isDirectory: false,
                                    size: stats.size,
                                    modified: stats.mtime.toLocaleString(),
                                    snippet
                                });
                            } catch { /* skip inaccessible */ }
                        }
                    }
                }
            } catch { /* skip inaccessible directories */ }
        };

        await walk(dirPath);
        return results;
    }
}
