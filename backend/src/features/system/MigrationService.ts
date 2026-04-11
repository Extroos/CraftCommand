import { StorageFactory } from '../../storage/StorageFactory';
import { systemSettingsService } from './SystemSettingsService';
import { auditService } from './AuditService';
import { userRepository } from '../../storage/UserRepository';
import { serverRepository } from '../../storage/ServerRepository';
import { notificationRepository } from '../../storage/NotificationRepository';
import { pluginRepository } from '../../storage/PluginRepository';
import { scheduleRepository } from '../../storage/ScheduleRepository';
import { sessionRepository } from '../../storage/SessionRepository';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../utils/logger';

class MigrationService {
    private inProgress = false;

    async runMigrations(): Promise<void> {
        logger.info('[MigrationService] Running startup migrations/initialization...');
        const repos: any[] = [
            userRepository,
            serverRepository,
            notificationRepository,
            pluginRepository,
            scheduleRepository,
            sessionRepository
        ];

        for (const repo of repos) {
            try {
                if (repo.init) {
                    await repo.init();
                }
            } catch (e) {
                logger.error(`[MigrationService] Failed to initialize repository: ${e}`);
            }
        }
    }

    async migrateToSqlite(actorId: string): Promise<{ success: boolean; message: string }> {
        if (this.inProgress) throw new Error('Migration already in progress');
        
        const settings = systemSettingsService.getSettings();
        if (settings.app.storageProvider === 'sqlite') {
            return { success: true, message: 'Existing storage is already SQLite.' };
        }

        this.inProgress = true;
        try {
            logger.info(`[MigrationService] Starting storage migration to SQLite (triggered by ${actorId})`);
            
            // Step 1: Create atomic backup of JSON storage (#5 — SQLite Rollback)
            const storageDir = path.resolve(__dirname, '../../../../storage');
            const backupDir = path.join(storageDir, `.migration_backup_${Date.now()}`);
            await fs.ensureDir(backupDir);
            
            const jsonFiles = (await fs.readdir(storageDir)).filter(f => f.endsWith('.json'));
            for (const file of jsonFiles) {
                await fs.copy(path.join(storageDir, file), path.join(backupDir, file));
            }

            // Step 1.5: Update the global setting
            systemSettingsService.updateSettings({
                app: { ...settings.app, storageProvider: 'sqlite' }
            });

            // Step 2: Re-initialize all repositories. 
            const repos: any[] = [
                userRepository,
                serverRepository,
                notificationRepository,
                pluginRepository,
                scheduleRepository,
                sessionRepository
            ];

            for (const repo of repos) {
                try {
                    if (repo.rebind) {
                        await repo.rebind();
                    } else if (repo.init) {
                        await repo.init();
                    }
                } catch (migrateError) {
                    logger.error(`[MigrationService] Repo re-init failed, rolling back...`);
                    // Rollback settings
                    systemSettingsService.updateSettings({
                        app: { ...settings.app, storageProvider: 'json' }
                    });
                    // Restore JSON files from backup
                    for (const file of jsonFiles) {
                        await fs.copy(path.join(backupDir, file), path.join(storageDir, file), { overwrite: true });
                    }
                    throw migrateError;
                }
            }

            auditService.log(actorId, 'SYSTEM_STORAGE_MIGRATE', 'system', { target: 'sqlite' });
            // Cleanup backup on success
            await fs.remove(backupDir);
            return { success: true, message: 'Migration to SQLite complete. System is now using database storage.' };
        } catch (e: any) {
            logger.error(`[MigrationService] Migration failed: ${e}`);
            // Revert setting if possible?
            systemSettingsService.updateSettings({
                app: { ...settings.app, storageProvider: 'json' }
            });
            throw e;
        } finally {
            this.inProgress = false;
        }
    }

    async migrateToJson(actorId: string): Promise<{ success: boolean; message: string }> {
        const settings = systemSettingsService.getSettings();
        if (settings.app.storageProvider === 'json') {
             return { success: true, message: 'Existing storage is already JSON.' };
        }

        // Switching back to JSON is easy because SqliteProvider maintains a sync by default.
        systemSettingsService.updateSettings({
            app: { ...settings.app, storageProvider: 'json' }
        });

        auditService.log(actorId, 'SYSTEM_STORAGE_MIGRATE', 'system', { target: 'json' });
        return { success: true, message: 'Migration to JSON complete. Database sync remains active for safe return.' };
    }
}

export const migrationService = new MigrationService();
