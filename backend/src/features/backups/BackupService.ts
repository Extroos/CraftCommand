import fs from 'fs-extra';
import path from 'path';
import archiver from 'archiver';
import extract from 'extract-zip';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import { logger } from '../../utils/logger';

export interface Backup {
    id: string;
    serverId: string;
    filename: string;
    size: number;
    createdAt: string;
    description?: string;
    locked?: boolean;
    type?: 'Manual' | 'Scheduled' | 'Auto-Save';
    scope?: 'full' | 'world'; // Track if this was a world-only backup
    sha256?: string; // Integrity hash
}

export class BackupService extends EventEmitter {
    private backupsDir: string;
    private activeBackups: Set<string> = new Set(); // Concurrency set

    constructor() {
        super();
        this.backupsDir = path.join(__dirname, '../../data/backups');
        fs.ensureDirSync(this.backupsDir);
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

        this.emit('status', 'Creating backup archive...');

        // Detect world folders before creating archive (if world-only mode)
        let worldFolders: string[] = [];
        if (worldOnly) {
            worldFolders = await this.detectWorldFolders(serverDir);
            
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
                            ignore: [
                                'session.lock',
                                '*.lck',
                                'logs/latest.log',
                                'backups/**',
                                '*.zip'
                            ]
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
        this.emit('status', 'Calculating integrity hash...');
        const sha256 = await this.calculateHash(outputPath);
        
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

        // Save metadata
        await this.saveBackupMetadata(serverId, backup);

        // Auto-cleanup old backups (keep last 10)
        await this.cleanupOldBackups(serverId, 10);

        this.emit('status', 'Backup created successfully');
        return backup;
        } finally {
            this.activeBackups.delete(serverId);
        }
    }

    private async calculateHash(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);
            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', (err) => reject(err));
        });
    }

    // List all backups for a server
    async listBackups(serverId: string): Promise<Backup[]> {
        const serverBackupsDir = path.join(this.backupsDir, serverId);
        
        // If directory doesn't exist, no backups
        if (!(await fs.pathExists(serverBackupsDir))) {
            return [];
        }

        const manifestPath = path.join(serverBackupsDir, 'manifest.json');
        let manifestBackups: Backup[] = [];
        
        // 1. Load existing manifest if present
        if (await fs.pathExists(manifestPath)) {
            try {
                const manifest = await fs.readJSON(manifestPath);
                manifestBackups = manifest.backups || [];
            } catch (e: any) {
                logger.error(`[BackupService] Corrupt manifest for ${serverId}: ${e.message}`);
                // Proceed with discovery to recover
            }
        }

        // 2. Scan for physical .zip files
        const files = await fs.readdir(serverBackupsDir);
        const zipFiles = files.filter(f => f.endsWith('.zip'));

        let changed = false;
        
        // 3. Sync: Remove entries that no longer exist on disk
        const beforeCount = manifestBackups.length;
        manifestBackups = manifestBackups.filter(b => zipFiles.includes(b.filename));
        if (manifestBackups.length !== beforeCount) changed = true;

        // 4. Sync: Discover orphaned ZIPs (on disk but not in manifest)
        for (const filename of zipFiles) {
            if (!manifestBackups.some(b => b.filename === filename)) {
                // Discovery & Recovery
                try {
                    const filePath = path.join(serverBackupsDir, filename);
                    const stats = await fs.stat(filePath);
                    
                    // Parse ID and timestamp from name: backup-1234567.zip
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

        // 5. Save updated manifest if we found discrepancies
        if (changed) {
            logger.info(`[BackupService] Manifest synced for ${serverId}. ${manifestBackups.length} snapshots discovered.`);
            // Sort new list by date descending
            manifestBackups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            await this.saveManifest(serverId, manifestBackups);
        }

        return manifestBackups;
    }

    // Restore a backup (Atomic / Safe Mode)
    async restoreBackup(serverDir: string, serverId: string, backupId: string): Promise<void> {
        const serverBackupsDir = path.join(this.backupsDir, serverId);
        const backups = await this.listBackups(serverId);
        const backup = backups.find(b => b.id === backupId);

        if (!backup) throw new Error('Backup not found');

        const backupPath = path.join(serverBackupsDir, backup.filename);

        if (!(await fs.pathExists(backupPath))) {
            throw new Error('Backup file not found');
        }

        // 1. Verify Integrity before disturbing filesystem
        if (backup.sha256) {
            this.emit('status', 'Verifying backup integrity...');
            const currentHash = await this.calculateHash(backupPath);
            if (currentHash !== backup.sha256) {
                logger.error(`[BackupService] Integrity check FAILED for ${backup.id}. Expected: ${backup.sha256}, Got: ${currentHash}`);
                throw new Error('Backup integrity verification failed. Archive may be corrupted.');
            }
            logger.success(`[BackupService] Integrity verified for ${backup.id}`);
        }

        this.emit('status', 'Preparing for atomic restore...');
        
        // 1. Create a safety snapshot of current state
        const tempRestoreId = `.temp_pre_restore_${Date.now()}`;
        const tempRestorePath = path.join(serverBackupsDir, tempRestoreId);
        
        try {
            // Move current files to temp safety folder
            await fs.ensureDir(tempRestorePath);
            const items = await fs.readdir(serverDir);
            for (const item of items) {
                if (path.resolve(serverDir, item) === this.backupsDir) continue;
                await fs.move(path.join(serverDir, item), path.join(tempRestorePath, item));
            }

            this.emit('status', 'Extracting backup...');
            await extract(backupPath, { dir: serverDir });

            this.emit('status', 'Restore verification successful. Cleaning up...');
           this.emit('status', 'Restore complete');

        } catch (e: any) {
            console.error(`[BackupService] RESTORE FAILED for ${serverId} (${backupId}):`, e);
            this.emit('status', `CRITICAL: Restore failed (${e.message}). Rolling back...`);
            
            try {
                // Clear any partial extraction
                const items = await fs.readdir(serverDir);
                for (const item of items) {
                    await fs.remove(path.join(serverDir, item));
                }
                
                // Move files back from temp
                const tempItems = await fs.readdir(tempRestorePath);
                for (const item of tempItems) {
                    await fs.move(path.join(tempRestorePath, item), path.join(serverDir, item));
                }
                
                throw new Error(`Restore failed (Safe Rollback executed): ${e}`);
            } catch (error: any) {
                throw new Error(`CATASTROPHIC FAILURE: Restore failed AND Rollback failed. Files may be in ${tempRestorePath}. Error: ${error.message}`);
            }
        } finally {
            // Success or Failure, we attempt to clean up the temp folder
            if (await fs.pathExists(tempRestorePath)) {
                await fs.remove(tempRestorePath).catch(err => {
                    logger.warn(`[BackupService] Restoration cleanup warning: ${err.message}`);
                });
            }
        }
    }

    // Delete a backup
    async deleteBackup(serverId: string, backupId: string): Promise<void> {
        const serverBackupsDir = path.join(this.backupsDir, serverId);
        const backups = await this.listBackups(serverId);
        const backup = backups.find(b => b.id === backupId);

        if (!backup) {
            throw new Error('Backup not found');
        }

        const backupPath = path.join(serverBackupsDir, backup.filename);
        await fs.remove(backupPath);

        // Update manifest
        const updatedBackups = backups.filter(b => b.id !== backupId);
        await this.saveManifest(serverId, updatedBackups);
    }

    // Clear manifest and backups if server is deleted
    async clearAllBackups(serverId: string): Promise<void> {
        const serverBackupsDir = path.join(this.backupsDir, serverId);
        await fs.remove(serverBackupsDir);
    }

    async getBackupPath(serverId: string, backupId: string): Promise<string> {
        const backups = await this.listBackups(serverId);
        const backup = backups.find(b => b.id === backupId);
        if (!backup) throw new Error('Backup not found');
        return path.join(this.backupsDir, serverId, backup.filename);
    }

    // Save backup metadata to manifest
    private async saveBackupMetadata(serverId: string, backup: Backup): Promise<void> {
        const backups = await this.listBackups(serverId);
        backups.push(backup);
        await this.saveManifest(serverId, backups);
    }

    // Save manifest file
    private async saveManifest(serverId: string, backups: Backup[]): Promise<void> {
        const serverBackupsDir = path.join(this.backupsDir, serverId);
        const manifestPath = path.join(serverBackupsDir, 'manifest.json');
        await fs.writeJSON(manifestPath, { backups }, { spaces: 2 });
    }

    // Toggle Lock status
    async toggleLock(serverId: string, backupId: string): Promise<boolean> {
        const backups = await this.listBackups(serverId);
        const backup = backups.find(b => b.id === backupId);
        
        if (!backup) throw new Error('Backup not found');
        
        backup.locked = !backup.locked; // Default is undefined/false
        await this.saveManifest(serverId, backups);
        return !!backup.locked;
    }

    // Detect world folders in server directory
    private async detectWorldFolders(serverDir: string): Promise<string[]> {
        const worlds: string[] = [];
        
        // 1. Check for Bedrock "worlds" container folder
        const bedrockWorldsDir = path.join(serverDir, 'worlds');
        if (await fs.pathExists(bedrockWorldsDir)) {
            const items = await fs.readdir(bedrockWorldsDir, { withFileTypes: true });
            for (const item of items) {
                if (item.isDirectory()) {
                    worlds.push(path.join('worlds', item.name));
                }
            }
        }

        // 2. Default Minecraft world names (Java)
        const defaultWorlds = ['world', 'world_nether', 'world_the_end'];
        
        // 3. Check server.properties for level-name
        try {
            const propsPath = path.join(serverDir, 'server.properties');
            if (await fs.pathExists(propsPath)) {
                const content = await fs.readFile(propsPath, 'utf-8');
                const match = content.match(/level-name=(.+)/);
                if (match && match[1].trim()) {
                    const levelName = match[1].trim();
                    
                    // For Bedrock, it might be in worlds/levelName
                    const bedrockPath = path.join('worlds', levelName);
                    if (await fs.pathExists(path.join(serverDir, bedrockPath))) {
                        worlds.push(bedrockPath);
                    } else if (await fs.pathExists(path.join(serverDir, levelName))) {
                        worlds.push(levelName);
                    }
                }
            }
        } catch (e) {
            logger.warn(`[BackupService] Failed to read server.properties: ${e}`);
        }
        
        // 4. Add Java defaults if they exist (and aren't already included)
        for (const worldName of defaultWorlds) {
            const worldPath = path.join(serverDir, worldName);
            if (await fs.pathExists(worldPath)) {
                worlds.push(worldName);
            }
        }
        
        return [...new Set(worlds)]; // Deduplicate
    }

    // Cleanup old backups with smart GFS-style retention
    private async cleanupOldBackups(serverId: string, keepCount: number): Promise<void> {
        const backups = await this.listBackups(serverId);
        
        // Locked backups are immune
        const manualAndScheduled = backups.filter(b => !b.locked);

        if (manualAndScheduled.length <= keepCount) {
            return;
        }

        // --- Smart Retention Logic ---
        // 1. Keep last 'keepCount' (e.g. 5 or 10) regardless of age
        // 2. Keep 1 per day for the last 3 days
        const latestBackups = manualAndScheduled.slice(0, keepCount);
        const olderBackups = manualAndScheduled.slice(keepCount);

        const toKeep = new Set<string>(latestBackups.map(b => b.id));
        
        // Helper: get YYYY-MM-DD
        const getDateKey = (dateStr: string) => dateStr.split('T')[0];
        
        const dailySnapshots = new Map<string, Backup>();
        for (const backup of olderBackups) {
            const dateKey = getDateKey(backup.createdAt);
            const daysAge = (Date.now() - new Date(backup.createdAt).getTime()) / (1000 * 60 * 60 * 24);
            
            if (daysAge <= 3) {
                if (!dailySnapshots.has(dateKey)) {
                    dailySnapshots.set(dateKey, backup);
                }
            }
        }

        for (const snapshot of dailySnapshots.values()) {
            toKeep.add(snapshot.id);
        }

        // 3. Separate list of candidates for deletion
        const deletionCandidates = manualAndScheduled.filter(b => !toKeep.has(b.id));

        // 4. Prioritize deleting Auto-Saves over Manual backups
        deletionCandidates.sort((a, b) => {
            if (a.type === 'Auto-Save' && b.type !== 'Auto-Save') return -1;
            if (a.type !== 'Auto-Save' && b.type === 'Auto-Save') return 1;
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });

        for (const backup of deletionCandidates) {
            logger.info(`[BackupService] Auto-cleaning old backup: ${backup.id} (Type: ${backup.type || 'Manual'}, Policy: GFS)`);
            await this.deleteBackup(serverId, backup.id).catch(e => {
                logger.warn(`[BackupService] Failed to clean up ${backup.id}: ${e.message}`);
            });
        }
    }
}

export const backupService = new BackupService();
