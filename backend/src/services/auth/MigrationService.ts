import { UserProfile, Permission } from '../../../../shared/types';
import { userRepository } from '../../storage/UserRepository';
import { logger } from '../../utils/logger';

export class MigrationService {
    
    public migrateUsers() {
        const users = userRepository.findAll();
        let migratedCount = 0;

        for (const user of users) {
             if (this.needsMigration(user)) {
                 try {
                     const upgraded = this.migrateUserToSchema1(user);
                     userRepository.update(user.id, upgraded);
                     migratedCount++;
                     logger.info(`[Migration] Upgraded user ${user.username} to Schema 1`);
                 } catch (e: any) {
                     logger.error(`[Migration] Failed to upgrade user ${user.username}: ${e.message}`);
                 }
             }
        }

        if (migratedCount > 0) {
            logger.info(`[Migration] Completed. Upgraded ${migratedCount} users.`);
        }
    }

    private needsMigration(user: UserProfile): boolean {
        return !user.schemaVersion || user.schemaVersion < 1;
    }

    private migrateUserToSchema1(user: UserProfile): UserProfile {
        const serverAcl: Record<string, { allow: Permission[], deny: Permission[] }> = {};

        // Migrate old Permissions Array -> Server ACL Allow List
        if (user.permissions) {
            for (const [serverId, perms] of Object.entries(user.permissions)) {
                if (perms && perms.length > 0) {
                    serverAcl[serverId] = {
                        allow: perms,
                        deny: []
                    };
                }
            }
        }

        return {
            ...user,
            schemaVersion: 1,
            serverAcl,
            permissions: undefined // Remove old field
        };
    }
}

export const migrationService = new MigrationService();
