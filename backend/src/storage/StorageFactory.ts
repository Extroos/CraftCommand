import { StorageProvider } from './StorageProvider';
import { GenericJsonProvider } from './JsonRepository';
import { SqliteProvider } from './SqliteProvider';
import { systemSettingsService } from '../features/system/SystemSettingsService';
import { logger } from '../utils/logger';
import path from 'path';

export class StorageFactory {
    
    /**
     * Creates a storage provider based on global system settings.
     * @param name The base name for the storage (e.g., 'servers', 'users').
     * @param tableName Optional override for SQL table name. Defaults to `name`.
     * @returns A StorageProvider instance.
     */
    public static get<T extends { id: string }>(name: string, tableName?: string, isFragmented: boolean = false): StorageProvider<T> {
        // We need to defer accessing settings until runtime to ensure config is loaded
        const settings = systemSettingsService.getSettings();
        const providerType = settings.app.storageProvider || 'json';
        
        const finalTableName = tableName || name;
        const jsonFileName = `${name}.json`;

        if (providerType === 'sqlite') {
            logger.info(`[StorageFactory] Creating SQLite provider for ${name} (Fragmented: ${isFragmented})`);
            return new SqliteProvider<T>('core.db', finalTableName, jsonFileName, isFragmented);
        } else {
            logger.info(`[StorageFactory] Creating JSON provider for ${name} (Fragmented: ${isFragmented})`);
            return new GenericJsonProvider<T>(jsonFileName, isFragmented);
        }
    }
}
