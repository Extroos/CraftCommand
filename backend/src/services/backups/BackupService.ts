import fs from 'fs-extra';
import path from 'path';
import archiver from 'archiver';
import extract from 'extract-zip';
import { EventEmitter } from 'events';

export interface Backup {
    id: string;
    serverId: string;
    filename: string;
    size: number;
    createdAt: string;
    description?: string;
    locked?: boolean;
    type?: 'Manual' | 'Scheduled' | 'Auto-Save';
}

export class BackupService extends EventEmitter {
    private backupsDir: string;

    constructor() {
        super();
        this.backupsDir = path.join(__dirname, '../../data/backups');
        fs.ensureDirSync(this.backupsDir);
    }

    // Create a backup of a server
    async createBackup(serverDir: string, serverId: string, description?: string): Promise<Backup> {
        const timestamp = Date.now();
        const backupId = `backup-${timestamp}`;
        const filename = `${backupId}.zip`;
        const serverBackupsDir = path.join(this.backupsDir, serverId);
        
        await fs.ensureDir(serverBackupsDir);
        
        const outputPath = path.join(serverBackupsDir, filename);

        this.emit('status', 'Creating backup archive...');

        // Create ZIP archive
        await new Promise<void>((resolve, reject) => {
            const output = fs.createWriteStream(outputPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => resolve());
            archive.on('error', (err) => reject(err));
            archive.on('progress', (data) => {
                const percent = Math.round((data.entries.processed / data.entries.total) * 100);
                this.emit('progress', { serverId, percent, backupId });
            });

            archive.pipe(output);
            archive.directory(serverDir, false);
            archive.finalize();
        });

        const stats = await fs.stat(outputPath);
        
        const backup: Backup = {
            id: backupId,
            serverId,
            filename,
            size: stats.size,
            createdAt: new Date(timestamp).toISOString(),
            description
        };

        // Save metadata
        await this.saveBackupMetadata(serverId, backup);

        // Auto-cleanup old backups (keep last 10)
        await this.cleanupOldBackups(serverId, 10);

        this.emit('status', 'Backup created successfully');
        return backup;
    }

    // List all backups for a server
    async listBackups(serverId: string): Promise<Backup[]> {
        const serverBackupsDir = path.join(this.backupsDir, serverId);
        const manifestPath = path.join(serverBackupsDir, 'manifest.json');

        if (!(await fs.pathExists(manifestPath))) {
            return [];
        }

        const manifest = await fs.readJSON(manifestPath);
        return manifest.backups || [];
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

        this.emit('status', 'Preparing for atomic restore...');
        
        // 1. Create a safety snapshot of current state
        const tempRestoreId = `.temp_pre_restore_${Date.now()}`;
        const tempRestorePath = path.join(serverBackupsDir, tempRestoreId);
        
        try {
            // Move current files to temp safety folder
            // We use move instead of copy for speed, essentially "swapping" the active state
            await fs.ensureDir(tempRestorePath);
            
            // Get all items in server dir
            const items = await fs.readdir(serverDir);
            for (const item of items) {
                // Don't move the backups folder itself if it happens to be inside (it shouldn't be, but safety first)
                if (path.resolve(serverDir, item) === this.backupsDir) continue;
                
                await fs.move(path.join(serverDir, item), path.join(tempRestorePath, item));
            }

            this.emit('status', 'Extracting backup...');
            
            // 2. Extract backup to now-empty server dir
            await extract(backupPath, { dir: serverDir });
            
            this.emit('status', 'Restore verification successful. Cleaning up...');
            
            // 3. Success! Cleanup safety snapshot
            await fs.remove(tempRestorePath);
            
            this.emit('status', 'Restore complete');

        } catch (e: any) {
            console.error(`[BackupService] RESTORE FAILED for ${serverId} (${backupId}):`, e);
            this.emit('status', `CRITICAL: Restore failed (${e.message}). Rolling back...`);
            
            // 4. Rollback: Restore files from temp safety folder
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
                
                await fs.remove(tempRestorePath);
                throw new Error(`Restore failed (Safe Rollback executed): ${e}`);
            } catch (rollbackError) {
                throw new Error(`CATASTROPHIC FAILURE: Restore failed AND Rollback failed. Files may be in ${tempRestorePath}. Error: ${rollbackError}`);
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

    // Cleanup old backups
    private async cleanupOldBackups(serverId: string, keepCount: number): Promise<void> {
        const backups = await this.listBackups(serverId);
        
        // Filter out locked backups (they are immune to auto-cleanup)
        const candidates = backups.filter(b => !b.locked);

        if (candidates.length <= keepCount) {
            return;
        }

        // Sort by date (oldest first)
        candidates.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        // Delete oldest backups
        const toDelete = candidates.slice(0, candidates.length - keepCount);
        
        for (const backup of toDelete) {
            console.log(`[BackupService] Auto-cleaning old backup: ${backup.id}`);
            await this.deleteBackup(serverId, backup.id);
        }
    }
}

export const backupService = new BackupService();
