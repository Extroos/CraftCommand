import { randomUUID } from 'crypto';
import { DatabaseInstance } from '@shared/types';
import { serverRepository } from '../../storage/ServerRepository';
import { logger } from '../../utils/logger';

class DatabaseService {
    async getDatabases(serverId: string): Promise<DatabaseInstance[]> {
        const server = serverRepository.findById(serverId);
        if (!server) throw new Error('Server not found');
        return server.databases || [];
    }

    async createDatabase(serverId: string, data: { name: string, type: string, host: string }): Promise<DatabaseInstance> {
        const server = serverRepository.findById(serverId);
        if (!server) throw new Error('Server not found');

        const dbId = randomUUID();
        // Generate a standard username format: s[prefix]_[short_id]
        const username = `u${serverId.substring(0, 4)}_${dbId.substring(0, 4)}`;
        const password = randomUUID().substring(0, 12); // Simulated secure password

        const newDb: DatabaseInstance = {
            id: dbId,
            serverId,
            name: data.name,
            type: data.type,
            host: data.host,
            username,
            createdAt: Date.now()
        };

        const databases = [...(server.databases || []), newDb];
        serverRepository.update(serverId, { databases });

        logger.info(`[DatabaseService] Provisioned database "${data.name}" for server ${serverId}`);
        
        // Return with password for the initial success screen
        return { ...newDb, password };
    }

    async deleteDatabase(serverId: string, dbId: string): Promise<void> {
        const server = serverRepository.findById(serverId);
        if (!server) {
            logger.error(`[DatabaseService] Delete failed: Server ${serverId} not found`);
            throw new Error('Server not found');
        }

        const initialDatabases = server.databases || [];
        const databases = initialDatabases.filter(db => db.id !== dbId);
        
        if (databases.length === initialDatabases.length) {
            logger.warn(`[DatabaseService] Delete target ${dbId} not found on server ${serverId}`);
            throw new Error('Database instance not found.');
        }

        logger.info(`[DatabaseService] Deleting database ${dbId} from server ${serverId}. Count: ${initialDatabases.length} -> ${databases.length}`);
        
        serverRepository.update(serverId, { databases });
        logger.info(`[DatabaseService] Terminated database instance ${dbId} on server ${serverId}`);
    }

    async rotateDatabasePassword(serverId: string, dbId: string): Promise<{ password: string }> {
        const server = serverRepository.findById(serverId);
        if (!server) throw new Error('Server not found');

        const databases = server.databases || [];
        const dbExists = databases.some(db => db.id === dbId);
        if (!dbExists) throw new Error('Database instance not found');

        const newPassword = randomUUID().substring(0, 12);
        
        logger.info(`[DatabaseService] Rotated credentials for database ${dbId} on server ${serverId}`);
        return { password: newPassword };
    }
}

export const databaseService = new DatabaseService();
