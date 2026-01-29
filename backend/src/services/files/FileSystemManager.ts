
import fs from 'fs-extra';
import path from 'path';

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
        const files = await fs.readdir(fullPath, { withFileTypes: true });
        
        return files.map(file => {
            const stats = fs.statSync(path.join(fullPath, file.name));
            return {
                name: file.name,
                isDirectory: file.isDirectory(),
                size: file.isDirectory() ? 0 : stats.size,
                modified: stats.mtime.toLocaleString(),
                path: path.relative(this.basePath, path.join(fullPath, file.name)).replace(/\\/g, '/')
            };
        });
    }

    async readFile(filePath: string): Promise<string> {
        return fs.readFile(this.resolvePath(filePath), 'utf-8');
    }

    async writeFile(filePath: string, content: string): Promise<void> {
        const fullPath = this.resolvePath(filePath);
        const tempPath = `${fullPath}.tmp`;
        await fs.writeFile(tempPath, content);
        await fs.rename(tempPath, fullPath);
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
        console.log(`[FileSys] Moved ${source} -> ${dest}`);
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
        console.log(`[FileSys] Copied ${source} -> ${dest}`);
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
}
