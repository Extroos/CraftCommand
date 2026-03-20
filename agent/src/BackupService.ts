import fs from 'fs-extra';
import path from 'path';
import archiver from 'archiver';
import extract from 'extract-zip';
import { EventEmitter } from 'events';
import crypto from 'crypto';

export interface Backup {
    id: string;
    serverId: string;
    filename: string;
    size: number;
    createdAt: string;
    description?: string;
    scope?: 'full' | 'world';
    sha256?: string;
}

export class BackupService extends EventEmitter {
    private backupsDir: string;
    private activeBackups: Set<string> = new Set();

    constructor(serversDir: string) {
        super();
        this.backupsDir = path.join(serversDir, 'backups');
        fs.ensureDirSync(this.backupsDir);
    }

    async createBackup(serverDir: string, serverId: string, description?: string, worldOnly?: boolean): Promise<Backup> {
        if (this.activeBackups.has(serverId)) {
            throw new Error('A backup operation is already in progress for this server.');
        }

        const timestamp = Date.now();
        const backupId = `backup-${timestamp}-${Math.random().toString(36).substring(7)}`;
        const filename = `${backupId}.zip`;
        const serverBackupsDir = path.join(this.backupsDir, serverId);
        
        this.activeBackups.add(serverId);

        try {
            await fs.ensureDir(serverBackupsDir);
            const outputPath = path.join(serverBackupsDir, filename);

            this.emit('status', { serverId, status: 'Creating archive...' });

            let worldFolders: string[] = [];
            if (worldOnly) {
                worldFolders = await this.detectWorldFolders(serverDir);
                if (worldFolders.length === 0) {
                    throw new Error('No world folders detected. Cannot create world-only backup.');
                }
            }

            await new Promise<void>((resolve, reject) => {
                const output = fs.createWriteStream(outputPath);
                const archive = archiver('zip', { zlib: { level: 9 } });

                output.on('close', () => resolve());
                archive.on('error', (err) => reject(err));

                archive.pipe(output);
                
                if (worldOnly) {
                    for (const worldFolder of worldFolders) {
                        archive.directory(path.join(serverDir, worldFolder), worldFolder);
                    }
                } else {
                    archive.glob('**/*', {
                        cwd: serverDir,
                        ignore: ['backups/**', '*.zip', 'logs/latest.log', '*.lck', 'session.lock']
                    });
                }

                archive.finalize();
            });

            const stats = await fs.stat(outputPath);
            const sha256 = await this.calculateHash(outputPath);

            const backup: Backup = {
                id: backupId,
                serverId,
                filename,
                size: stats.size,
                createdAt: new Date(timestamp).toISOString(),
                description,
                scope: worldOnly ? 'world' : 'full',
                sha256
            };

            await this.saveBackupMetadata(serverId, backup);
            this.emit('status', { serverId, status: 'Backup complete', backup });
            return backup;
        } finally {
            this.activeBackups.delete(serverId);
        }
    }

    async restoreBackup(serverDir: string, serverId: string, backupId: string, options: { worldOnly?: boolean } = {}): Promise<void> {
        const serverBackupsDir = path.join(this.backupsDir, serverId);
        const metadataPath = path.join(serverBackupsDir, 'backups.json');
        
        if (!fs.existsSync(metadataPath)) throw new Error('No backups found for this server.');
        const backups: Backup[] = await fs.readJSON(metadataPath);
        const backup = backups.find(b => b.id === backupId);

        if (!backup) throw new Error('Backup not found');
        const backupPath = path.join(serverBackupsDir, backup.filename);
        if (!fs.existsSync(backupPath)) throw new Error('Backup file missing on disk.');

        this.emit('status', { serverId, status: 'Preparing restoration...' });
        
        const tempRestoreId = `.temp_pre_restore_${Date.now()}`;
        const tempRestorePath = path.join(serverBackupsDir, tempRestoreId);
        
        try {
            await fs.ensureDir(tempRestorePath);
            const items = await fs.readdir(serverDir);
            
            let worldFolders: string[] = [];
            if (options.worldOnly) {
                worldFolders = await this.detectWorldFolders(serverDir);
            }

            // Move current state to safety
            for (const item of items) {
                if (item === 'backups') continue;
                if (options.worldOnly) {
                    if (worldFolders.includes(item)) {
                        await fs.move(path.join(serverDir, item), path.join(tempRestorePath, item));
                    }
                } else {
                    await fs.move(path.join(serverDir, item), path.join(tempRestorePath, item));
                }
            }

            if (options.worldOnly) {
                const extractTempPath = path.join(serverBackupsDir, `.temp_extract_${Date.now()}`);
                await fs.ensureDir(extractTempPath);
                try {
                    await extract(backupPath, { dir: extractTempPath });
                    const extractedWorlds = await this.detectWorldFolders(extractTempPath);
                    for (const wf of extractedWorlds) {
                        const source = path.join(extractTempPath, wf);
                        const dest = path.join(serverDir, wf);
                        if (await fs.pathExists(source)) {
                            await fs.move(source, dest, { overwrite: true });
                        }
                    }
                } finally {
                    await fs.remove(extractTempPath).catch(() => {});
                }
            } else {
                await extract(backupPath, { dir: serverDir });
            }

            await fs.remove(tempRestorePath).catch(() => {});
            this.emit('status', { serverId, status: 'Restore complete' });

        } catch (e: any) {
            this.emit('status', { serverId, status: 'Restore failed, rolling back...' });
            try {
                // Rollback logic
                const tempItems = await fs.readdir(tempRestorePath).catch(() => []);
                for (const item of tempItems) {
                    await fs.move(path.join(tempRestorePath, item), path.join(serverDir, item), { overwrite: true });
                }
                await fs.remove(tempRestorePath).catch(() => {});
            } catch (err: any) {
                throw new Error(`CATASTROPHIC FAILURE: Restore and Rollback failed: ${err.message}`);
            }
            throw e;
        }
    }

    private async detectWorldFolders(serverDir: string): Promise<string[]> {
        const worlds: string[] = [];
        const bedrockWorldsDir = path.join(serverDir, 'worlds');
        if (await fs.pathExists(bedrockWorldsDir)) {
            const items = await fs.readdir(bedrockWorldsDir, { withFileTypes: true });
            for (const item of items) {
                if (item.isDirectory()) worlds.push(path.join('worlds', item.name));
            }
        }
        const defaultWorlds = ['world', 'world_nether', 'world_the_end'];
        for (const w of defaultWorlds) {
            if (await fs.pathExists(path.join(serverDir, w))) worlds.push(w);
        }
        // Check server.properties
        try {
            const propsPath = path.join(serverDir, 'server.properties');
            if (await fs.pathExists(propsPath)) {
                const content = await fs.readFile(propsPath, 'utf-8');
                const match = content.match(/level-name=(.+)/);
                if (match && match[1].trim()) {
                    const levelName = match[1].trim();
                    if (await fs.pathExists(path.join(serverDir, levelName))) worlds.push(levelName);
                }
            }
        } catch {}
        return [...new Set(worlds)];
    }

    private async calculateHash(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);
            stream.on('data', data => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', err => reject(err));
        });
    }

    private async saveBackupMetadata(serverId: string, backup: Backup) {
        const serverBackupsDir = path.join(this.backupsDir, serverId);
        const metadataPath = path.join(serverBackupsDir, 'backups.json');
        let backups: Backup[] = [];
        if (fs.existsSync(metadataPath)) {
            backups = await fs.readJSON(metadataPath);
        }
        backups.push(backup);
        await fs.writeJSON(metadataPath, backups, { spaces: 2 });
    }
}
