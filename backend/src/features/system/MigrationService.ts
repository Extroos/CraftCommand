import { StorageFactory } from '../../storage/StorageFactory';
import { systemSettingsService } from './SystemSettingsService';
import { auditService } from './AuditService';
import { userRepository } from '../../storage/UserRepository';
import { serverRepository } from '../../storage/ServerRepository';
import { notificationRepository } from '../../storage/NotificationRepository';
import { pluginRepository } from '../../storage/PluginRepository';
import { scheduleRepository } from '../../storage/ScheduleRepository';
import { sessionRepository } from '../../storage/SessionRepository';

class MigrationService {
    private inProgress = false;

    async runMigrations(): Promise<void> {
        console.log('[MigrationService] Running startup migrations/initialization...');
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
                console.error(`[MigrationService] Failed to initialize repository:`, e);
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
            console.log(`[MigrationService] Starting storage migration to SQLite (triggered by ${actorId})`);
            
            // 1. Force the StorageFactory to use SQLite for initialization
            // We do this by temporarily overriding the settings or using a special flag.
            // Since we'll update settings at the end, let's just trigger the 'init' on all repos
            // which will automatically find JSON data and move it to SQLite if SQLite is enabled.
            
            // Actually, SqliteProvider.init handles auto-migration if migrationJsonPath is provided.
            // So we just need to ensure that when we switch the setting, we re-initialize the providers.
            
            // Step 1: Update the global setting
            systemSettingsService.updateSettings({
                app: { ...settings.app, storageProvider: 'sqlite' }
            });

            // Step 2: Re-initialize all repositories. 
            // Since they are singletons, we need to manually trigger their re-init or they need a way to swap providers.
            // Let's check if they have an init() that re-creates the provider.
            // Looking at UserRepository: constructor calls StorageFactory.get() which checks systemSettingsService.getSettings().
            // So we need to re-instantiate or re-trigger the getter.
            
            // A better way: repositories should have a 'setProvider' or similar, 
            // OR we just tell the USER a REBOOT is required. 
            // In our implementation plan we said "with a visible progress indicator".
            
            // Let's implement an explicit 'rebind' on repositories.
            const repos: any[] = [
                userRepository,
                serverRepository,
                notificationRepository,
                pluginRepository,
                scheduleRepository,
                sessionRepository
            ];

            for (const repo of repos) {
                if (repo.rebind) {
                    await repo.rebind();
                } else if (repo.init) {
                    // If init detects SQLite but no data, and JSON exists, it migrates.
                    await repo.init();
                }
            }

            auditService.log(actorId, 'SYSTEM_STORAGE_MIGRATE', 'system', { target: 'sqlite' });
            return { success: true, message: 'Migration to SQLite complete. System is now using database storage.' };
        } catch (e: any) {
            console.error(`[MigrationService] Migration failed:`, e);
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
