import fs from 'fs-extra';
import path from 'path';
import archiver from 'archiver';
import extract from 'extract-zip';
import AdmZip from 'adm-zip';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import { logger } from '../../utils/logger';
import { CloudBackupDestination, CloudUploadResult, createCloudProvider } from './CloudBackupProvider';
import { detectWorldFolders, calculateHash, SharedBackup, BACKUP_EXCLUDES } from '@shared/utils/BackupUtils';

export interface Backup extends SharedBackup {
    locked?: boolean;
    type?: 'Manual' | 'Scheduled' | 'Auto-Save';
    cloudUploads?: CloudUploadResult[];
}

export class BackupService extends EventEmitter {
    private backupsDir: string;
    private activeBackups: Set<string> = new Set();
    private destinationsPath: string;

    constructor() {
        super();
        this.backupsDir = path.join(__dirname, '../../data/backups');
        this.destinationsPath = path.join(__dirname, '../../data/cloud-destinations.json');
        fs.ensureDirSync(this.backupsDir);
    }

    // ZIP bomb protection: pre-scan archive before extraction
    private validateArchive(archivePath: string, maxEntries: number = 50000, maxSizeBytes: number = 10 * 1024 * 1024 * 1024): void {
        const zip = new AdmZip(archivePath);
        const entries = zip.getEntries();
        
        if (entries.length > maxEntries) {
            throw new Error(`Archive rejected: ${entries.length} entries exceeds safety limit of ${maxEntries}. Possible ZIP bomb.`);
        }
        
        let totalUncompressed = 0;
        for (const entry of entries) {
            totalUncompressed += entry.header.size;
            if (totalUncompressed > maxSizeBytes) {
                throw new Error(`Archive rejected: uncompressed size exceeds ${Math.round(maxSizeBytes / (1024 * 1024 * 1024))}GB safety limit. Possible ZIP bomb.`);
            }
        }
    }

    // --- Cloud Destination Management ---

    async getCloudDestinations(): Promise<CloudBackupDestination[]> {
        try {
            if (await fs.pathExists(this.destinationsPath)) {
                return await fs.readJSON(this.destinationsPath);
            }
        } catch (e: any) {
            logger.error(`[BackupService] Failed to load cloud destinations: ${e.message}`);
        }
        return [];
    }

    async saveCloudDestinations(destinations: CloudBackupDestination[]): Promise<void> {
        const tempPath = `${this.destinationsPath}.tmp`;
        await fs.writeJSON(tempPath, destinations, { spaces: 2 });
        await fs.rename(tempPath, this.destinationsPath);
    }

    async addCloudDestination(destination: CloudBackupDestination): Promise<CloudBackupDestination[]> {
        const destinations = await this.getCloudDestinations();
        // Prevent duplicate names
        if (destinations.some(d => d.name === destination.name)) {
            throw new Error(`A destination named "${destination.name}" already exists.`);
        }
        destinations.push(destination);
        await this.saveCloudDestinations(destinations);
        return destinations;
    }

    async removeCloudDestination(name: string): Promise<CloudBackupDestination[]> {
        let destinations = await this.getCloudDestinations();
        destinations = destinations.filter(d => d.name !== name);
        await this.saveCloudDestinations(destinations);
        return destinations;
    }

    async testCloudDestination(destination: CloudBackupDestination): Promise<{ success: boolean; message: string }> {
        try {
            const provider = createCloudProvider(destination);
            return await provider.testConnection();
        } catch (e: any) {
            return { success: false, message: e.message };
        }
    }

    async uploadToCloud(localFilePath: string, remoteFileName: string, metadata: Record<string, any> = {}): Promise<CloudUploadResult[]> {
        const destinations = await this.getCloudDestinations();
        const enabled = destinations.filter(d => d.enabled);
        
        if (enabled.length === 0) return [];

        const results: CloudUploadResult[] = [];
        for (const dest of enabled) {
            try {
                const provider = createCloudProvider(dest);
                const result = await provider.upload(localFilePath, remoteFileName);
                results.push(result);
                
                if (result.success) {
                    logger.success(`[CloudBackup] Uploaded to "${dest.name}" (${dest.type}): ${result.remotePath}`);
                } else {
                    logger.error(`[CloudBackup] Failed to upload to "${dest.name}": ${result.error}`);
                }
            } catch (e: any) {
                results.push({
                    destination: dest.name,
                    type: dest.type,
                    success: false,
                    error: e.message,
                    durationMs: 0
                });
            }
        }
        return results;
    }

    // Create a backup of a server
    async createBackup(serverDir: string, serverId: string, description?: string, worldOnly?: boolean): Promise<Backup> {
        // 0. Concurrency Guard
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

            this.emit('status', { serverId, backupId, message: 'Creating backup archive...' });

            // Detect world folders before creating archive (if world-only mode)
            let worldFolders: string[] = [];
            if (worldOnly) {
                worldFolders = await detectWorldFolders(serverDir);
                
                if (worldFolders.length === 0) {
                    throw new Error('No world folders detected. Cannot create world-only backup.');
                }
                
                logger.info(`[BackupService] Creating world-only backup for: ${worldFolders.join(', ')}`);
            }

            // Create ZIP archive with Retry Logic (Windows Lock Handling)
            let attempts = 0;
            const maxAttempts = 3;
            let success = false;

            while (attempts < maxAttempts && !success) {
                try {
                    attempts++;
                    await new Promise<void>((resolve, reject) => {
                        const output = fs.createWriteStream(outputPath);
                        const archive = archiver('zip', { zlib: { level: 9 } });

                        output.on('close', () => resolve());
                        archive.on('warning', (err) => {
                            if (err.code === 'ENOENT') {
                                logger.warn(`[BackupService] Archive warning (skipping): ${err.message}`);
                            } else {
                                logger.warn(`[BackupService] Archive warning: ${err.message}`);
                            }
                        });

                        archive.on('error', (err) => {
                            logger.error(`[BackupService] Archive Error (Attempt ${attempts}): ${err.message}`);
                            reject(err);
                        });

                        archive.on('progress', (data) => {
                            const percent = Math.round((data.entries.processed / data.entries.total) * 100);
                            this.emit('progress', { serverId, percent, backupId });
                        });

                        archive.pipe(output);
                        
                        if (worldOnly) {
                            for (const worldFolder of worldFolders) {
                                archive.directory(path.join(serverDir, worldFolder), worldFolder);
                            }
                        } else {
                            archive.glob('**/*', {
                                cwd: serverDir,
                                ignore: BACKUP_EXCLUDES
                            });
                        }

                        archive.finalize();
                    });
                    success = true;
                } catch (e: any) {
                    if (attempts >= maxAttempts) throw e;
                    logger.warn(`[BackupService] Backup attempt ${attempts} failed, retrying in 2s... (${e.message})`);
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            const stats = await fs.stat(outputPath);
            
            // Calculate SHA-256 for integrity
            this.emit('status', { serverId, backupId, message: 'Calculating integrity hash...' });
            const sha256 = await calculateHash(outputPath);
            
            const backup: Backup = {
                id: backupId,
                serverId,
                filename,
                size: stats.size,
                createdAt: new Date(timestamp).toISOString(),
                description,
                type: 'Manual',
                scope: worldOnly ? 'world' : 'full',
                sha256
            };

            // Cloud upload (non-blocking — local backup succeeds regardless)
            try {
                this.emit('status', { serverId, backupId, message: 'Uploading to cloud destinations...' });
                const cloudResults = await this.uploadToCloud(
                    outputPath,
                    `${serverId}/${filename}`,
                    { serverId, backupId, scope: backup.scope }
                );
                if (cloudResults.length > 0) {
                    backup.cloudUploads = cloudResults;
                }
            } catch (e: any) {
                logger.warn(`[BackupService] Cloud upload failed (local backup safe): ${e.message}`);
            }

            // Save metadata
            await this.saveBackupMetadata(serverId, backup);

            // Auto-cleanup old backups (keep last 10)
            await this.cleanupOldBackups(serverId, 10);

            this.emit('status', { serverId, backupId, status: 'complete', message: 'Backup created successfully' });
            return backup;
        } finally {
            this.activeBackups.delete(serverId);
        }
    }

    /**
     * Store a mirrored backup received from an agent (Phase 11)
     */
    async storeMirroredBackup(nodeId: string, serverId: string, backupId: string, stream: NodeJS.ReadableStream): Promise<void> {
        const { serverRepository } = require('../../storage/ServerRepository');
        const server = serverRepository.findById(serverId);
        
        if (!server || server.nodeId !== nodeId) {
            logger.error(`[BackupService] REFUSED: Node ${nodeId} attempted to store backup for unauthorized server ${serverId}.`);
            throw new Error(`Forbidden: Server ${serverId} does not belong to node ${nodeId}.`);
        }

        const mirrorDir = path.join(this.backupsDir, 'mirrors', nodeId, serverId);
        await fs.ensureDir(mirrorDir);
        
        const filename = `${backupId}.zip`;
        const filePath = path.join(mirrorDir, filename);
        const out = fs.createWriteStream(filePath);
        
        logger.info(`[BackupService] Receiving mirrored backup ${backupId} for server ${serverId} from node ${nodeId}...`);
        
        return new Promise((resolve, reject) => {
            stream.pipe(out);
            out.on('finish', () => {
                logger.success(`[BackupService] Mirrored backup ${backupId} stored at ${filePath}`);
                resolve();
            });
            out.on('error', (err) => {
                logger.error(`[BackupService] Mirror storage failed for ${backupId}: ${err.message}`);
                reject(err);
            });
        });
    }

    // List all backups for a server
    async listBackups(serverId: string): Promise<Backup[]> {
        const serverBackupsDir = path.join(this.backupsDir, serverId);
        if (!(await fs.pathExists(serverBackupsDir))) return [];

        const manifestPath = path.join(serverBackupsDir, 'manifest.json');
        let manifestBackups: Backup[] = [];
        
        if (await fs.pathExists(manifestPath)) {
            try {
                const manifest = await fs.readJSON(manifestPath);
                manifestBackups = manifest.backups || [];
            } catch (e: any) {
                logger.error(`[BackupService] Corrupt manifest for ${serverId}: ${e.message}`);
            }
        }

        const files = await fs.readdir(serverBackupsDir);
        const zipFiles = files.filter(f => f.endsWith('.zip'));

        let changed = false;
        const beforeCount = manifestBackups.length;
        manifestBackups = manifestBackups.filter(b => zipFiles.includes(b.filename));
        if (manifestBackups.length !== beforeCount) changed = true;

        for (const filename of zipFiles) {
            if (!manifestBackups.some(b => b.filename === filename)) {
                try {
                    const filePath = path.join(serverBackupsDir, filename);
                    const stats = await fs.stat(filePath);
                    const idMatch = filename.match(/backup-(\d+)/);
                    const timestamp = idMatch ? parseInt(idMatch[1]) : stats.birthtimeMs || stats.mtimeMs;
                    const id = filename.replace('.zip', '');

                    manifestBackups.push({
                        id,
                        serverId,
                        filename,
                        size: stats.size,
                        createdAt: new Date(timestamp).toISOString(),
                        description: 'Recovered Archive',
                        locked: false,
                        type: 'Manual'
                    });
                    changed = true;
                } catch (e: any) {
                    logger.error(`[BackupService] Failed to recover backup metadata for ${filename}: ${e.message}`);
                }
            }
        }

        if (changed) {
            manifestBackups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            await this.saveManifest(serverId, manifestBackups);
        }

        return manifestBackups;
    }

    // Restore a backup (Atomic / Safe Mode)
    async restoreBackup(serverDir: string, serverId: string, backupId: string, options: { scope?: 'full' | 'world' | 'configs' | 'plugins' } = {}): Promise<void> {
        const scope = options.scope || 'full';
        const serverBackupsDir = path.join(this.backupsDir, serverId);
        const backups = await this.listBackups(serverId);
        const backup = backups.find(b => b.id === backupId);

        if (!backup) throw new Error('Backup not found');

        const backupPath = path.join(serverBackupsDir, backup.filename);
        if (!(await fs.pathExists(backupPath))) throw new Error('Backup file not found');

        // 1. Verify Integrity
        if (backup.sha256) {
            this.emit('status', { serverId, backupId, message: 'Verifying backup integrity...' });
            const currentHash = await calculateHash(backupPath);
            if (currentHash !== backup.sha256) {
                throw new Error('Backup integrity verification failed. Archive may be corrupted.');
            }
            logger.success(`[BackupService] Integrity verified for ${backup.id}`);
        }

        this.emit('status', { serverId, backupId, message: 'Preparing for atomic restore...' });
        const tempRestoreId = `.temp_pre_restore_${Date.now()}`;
        const tempRestorePath = path.join(serverBackupsDir, tempRestoreId);
        
        try {
            await fs.ensureDir(tempRestorePath);
            const items = await fs.readdir(serverDir);
            
            let itemsToRestore: string[] = [];
            if (scope !== 'full') {
                itemsToRestore = await this.getItemsForScope(serverDir, scope);
                logger.info(`[BackupService] Selective restore (${scope}): Targeting: ${itemsToRestore.join(', ')}`);
            }

            for (const item of items) {
                const fullItemPath = path.resolve(serverDir, item);
                // More robust check for the backups directory using relative path
                const relativeToBackups = path.relative(this.backupsDir, fullItemPath);
                if (!relativeToBackups.startsWith('..') && !path.isAbsolute(relativeToBackups)) continue;
                
                if (scope === 'full' || itemsToRestore.includes(item)) {
                    await fs.move(fullItemPath, path.join(tempRestorePath, item));
                }
            }

            this.emit('status', { serverId, backupId, message: 'Extracting backup...' });
            // Pre-scan archive for ZIP bomb before extraction
            this.validateArchive(backupPath);
            
            if (scope !== 'full') {
                const extractTempId = `.temp_extract_${Date.now()}`;
                const extractTempPath = path.join(serverBackupsDir, extractTempId);
                await fs.ensureDir(extractTempPath);
                
                try {
                    await extract(backupPath, { dir: extractTempPath });
                    const extractedScopedItems = await this.getItemsForScope(extractTempPath, scope);
                    for (const item of extractedScopedItems) {
                        const source = path.join(extractTempPath, item);
                        if (await fs.pathExists(source)) {
                            await fs.move(source, path.join(serverDir, item), { overwrite: true });
                        }
                    }
                } finally {
                    await fs.remove(extractTempPath).catch(() => {});
                }
            } else {
                await extract(backupPath, { dir: serverDir });
            }

            this.emit('status', { serverId, backupId, status: 'complete', message: 'Restore complete' });
        } catch (e: any) {
            logger.error(`[BackupService] RESTORE FAILED for ${serverId}: ${e.message}`);
            this.emit('status', { serverId, backupId, status: 'failed', message: `CRITICAL: Restore failed. Rolling back...` });
            
            try {
                const items = await fs.readdir(serverDir);
                for (const item of items) await fs.remove(path.join(serverDir, item));
                
                const tempItems = await fs.readdir(tempRestorePath);
                for (const item of tempItems) {
                    await fs.move(path.join(tempRestorePath, item), path.join(serverDir, item));
                }
            } catch (error: any) {
                throw new Error(`CATASTROPHIC FAILURE: Rollback failed. Files in ${tempRestorePath}. Error: ${error.message}`);
            }
            throw new Error(`Restore failed (Rollback executed): ${e.message}`);
        } finally {
            if (await fs.pathExists(tempRestorePath)) {
                await fs.remove(tempRestorePath).catch(err => logger.warn(`[BackupService] Restoration cleanup warning: ${err.message}`));
            }
        }
    }

    async deleteBackup(serverId: string, backupId: string): Promise<void> {
        const serverBackupsDir = path.join(this.backupsDir, serverId);
        const backups = await this.listBackups(serverId);
        const backup = backups.find(b => b.id === backupId);
        if (!backup) throw new Error('Backup not found');

        await fs.remove(path.join(serverBackupsDir, backup.filename));
        const updatedBackups = backups.filter(b => b.id !== backupId);
        await this.saveManifest(serverId, updatedBackups);
    }

    async clearAllBackups(serverId: string): Promise<void> {
        await fs.remove(path.join(this.backupsDir, serverId));
    }

    async getBackupPath(serverId: string, backupId: string): Promise<string> {
        const backups = await this.listBackups(serverId);
        const backup = backups.find(b => b.id === backupId);
        if (!backup) throw new Error('Backup not found');
        return path.join(this.backupsDir, serverId, backup.filename);
    }

    private async saveBackupMetadata(serverId: string, backup: Backup): Promise<void> {
        const backups = await this.listBackups(serverId);
        backups.push(backup);
        await this.saveManifest(serverId, backups);
    }

    private async saveManifest(serverId: string, backups: Backup[]): Promise<void> {
        const manifestPath = path.join(this.backupsDir, serverId, 'manifest.json');
        const tempPath = `${manifestPath}.tmp`;
        await fs.writeJSON(tempPath, { backups }, { spaces: 2 });
        await fs.rename(tempPath, manifestPath);
    }

    async toggleLock(serverId: string, backupId: string): Promise<boolean> {
        const backups = await this.listBackups(serverId);
        const backup = backups.find(b => b.id === backupId);
        if (!backup) throw new Error('Backup not found');
        backup.locked = !backup.locked;
        await this.saveManifest(serverId, backups);
        return !!backup.locked;
    }

    private async getItemsForScope(dir: string, scope: 'world' | 'configs' | 'plugins'): Promise<string[]> {
        if (scope === 'world') return await detectWorldFolders(dir);
        if (scope === 'configs') {
            const possibleConfigs = [
                'server.properties', 'whitelist.json', 'ops.json', 
                'banned-players.json', 'banned-ips.json', 'bukkit.yml', 
                'spigot.yml', 'paper.yml', 'server.json', 'allowlist.json',
                'permissions.json', 'config.json', 'eula.txt'
            ];
            const items = await fs.readdir(dir);
            return items.filter(item => possibleConfigs.includes(item));
        }
        if (scope === 'plugins') {
            const items = await fs.readdir(dir);
            return items.filter(item => item === 'plugins' || item === 'mods');
        }
        return [];
    }

    private async cleanupOldBackups(serverId: string, keepCount: number): Promise<void> {
        const backups = await this.listBackups(serverId);
        const candidates = backups.filter(b => !b.locked);
        if (candidates.length <= keepCount) return;

        const latest = candidates.slice(0, keepCount);
        const older = candidates.slice(keepCount);
        const toKeep = new Set(latest.map(b => b.id));
        
        older.forEach(backup => {
            const daysAge = (Date.now() - new Date(backup.createdAt).getTime()) / (1000 * 60 * 60 * 24);
            if (daysAge <= 3) toKeep.add(backup.id);
        });

        const toDelete = candidates.filter(b => !toKeep.has(b.id));
        toDelete.sort((a, b) => {
            if (a.type === 'Auto-Save' && b.type !== 'Auto-Save') return -1;
            if (a.type !== 'Auto-Save' && b.type === 'Auto-Save') return 1;
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });

        for (const backup of toDelete) {
            await this.deleteBackup(serverId, backup.id).catch(e => logger.warn(`[BackupService] Cleanup failed: ${e.message}`));
        }
    }
}

export const backupService = new BackupService();
