import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import { logger } from '../utils/logger';
import { StorageProvider } from './StorageProvider';

export class SqliteProvider<T extends { id: string }> implements StorageProvider<T> {
    private db: Database.Database;
    private tableName: string;
    private syncTimeouts: Map<string, NodeJS.Timeout> = new Map();

    constructor(
        fileName: string, 
        tableName: string = 'store', 
        private migrationJsonPath?: string,
        private isFragmented: boolean = false
    ) {
        const dbPath = path.join(process.cwd(), 'data', fileName);
        fs.ensureDirSync(path.dirname(dbPath));
        this.db = new Database(dbPath);
        this.tableName = tableName;
        this.init();
    }

    init() {
        // Create a simple Key-Value table suitable for storing JSON objects
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS ${this.tableName} (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            )
        `);

        // Migration logic: Atomicity and Safety (v1.13.0: Fragmented aware)
        const count = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName}`).get() as { count: number };
        const jsonPath = this.migrationJsonPath ? path.join(process.cwd(), 'data', this.migrationJsonPath) : null;
        const fragmentDir = jsonPath ? jsonPath.replace('.json', '') : null;
        
        // Migration triggers if DB is empty AND (monolithic JSON exists OR fragmented directory exists)
        const hasMonolithic = jsonPath && fs.existsSync(jsonPath);
        const hasFragments = this.isFragmented && fragmentDir && fs.existsSync(fragmentDir);

        if (count.count === 0 && (hasMonolithic || hasFragments)) {
            const migrationMarker = jsonPath ? `${jsonPath}.migrated` : null;
            if (migrationMarker && fs.existsSync(migrationMarker)) return;

            try {
                let items: any[] = [];

                if (hasMonolithic) {
                    logger.info(`[SqliteProvider] Migrating from monolithic ${this.migrationJsonPath}...`);
                    const raw = fs.readJSONSync(jsonPath!);
                    items = Array.isArray(raw) ? raw : [];
                } else if (hasFragments) {
                    logger.info(`[SqliteProvider] Migrating from fragmented directory ${fragmentDir}...`);
                    const files = fs.readdirSync(fragmentDir!).filter(f => f.endsWith('.json'));
                    items = files.map(f => fs.readJSONSync(path.join(fragmentDir!, f)));
                }

                if (items.length > 0) {
                    const insert = this.db.prepare(`INSERT INTO ${this.tableName} (id, data) VALUES (?, ?)`);
                    const tx = this.db.transaction((toMigrate: any[]) => {
                        for (const item of toMigrate) insert.run(item.id, JSON.stringify(item));
                    });
                    tx(items);
                logger.info(`[SqliteProvider] Successfully migrated ${items.length} items to SQLite.`);
                    if (migrationMarker) fs.writeFileSync(migrationMarker, new Date().toISOString());
                }
            } catch (e: any) {
                logger.error(`[SqliteProvider] CRITICAL MIGRATION FAILURE: ${e}`);
                // Throwing ensures the system doesn't start with partial/corrupted data
                throw new Error(`Migration to SQLite failed: ${e.message}`);
            }
        }
    }

    findAll(): T[] {
        const stmt = this.db.prepare(`SELECT data FROM ${this.tableName}`);
        const rows = stmt.all() as { data: string }[];
        return rows.map(row => JSON.parse(row.data));
    }

    findById(id: string): T | undefined {
        const stmt = this.db.prepare(`SELECT data FROM ${this.tableName} WHERE id = ?`);
        const row = stmt.get(id) as { data: string } | undefined;
        return row ? JSON.parse(row.data) : undefined;
    }

    findOne(criteria: Partial<T>): T | undefined {
        // Optimization: If ID is in criteria, use findById
        if (criteria.id) {
            const item = this.findById(criteria.id);
            if (!item) return undefined;
            
            // Verify remaining criteria
            for (const key in criteria) {
                if ((item as any)[key] !== (criteria as any)[key]) return undefined;
            }
            return item;
        }

        // Fallback to full scanning for complex criteria
        const all = this.findAll();
        return all.find(item => {
            for (const key in criteria) {
                if ((item as any)[key] !== (criteria as any)[key]) return false;
            }
            return true;
        });
    }

    create(item: T): T {
        const stmt = this.db.prepare(`INSERT INTO ${this.tableName} (id, data) VALUES (?, ?)`);
        stmt.run(item.id, JSON.stringify(item));
        this.syncToJson(item.id); // Maintain JSON sync for safe downgrade (optimized)
        return item;
    }

    update(id: string, updates: Partial<T>): T | null {
        const updateTx = this.db.transaction(() => {
            const current = this.findById(id);
            if (!current) return null;

            const updated = { ...current, ...updates };
            const stmt = this.db.prepare(`UPDATE ${this.tableName} SET data = ? WHERE id = ?`);
            stmt.run(JSON.stringify(updated), id);
            return updated;
        });

        const result = updateTx();
        if (result) this.syncToJson(id); // Maintain JSON sync (optimized)
        return result;
    }

    delete(id: string): boolean {
        const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`);
        const info = stmt.run(id);
        const success = info.changes > 0;
        if (success) this.syncToJson(id); // Optimized fragment removal
        return success;
    }

    saveAll(items: T[]): void {
        const stmt = this.db.prepare(`INSERT OR REPLACE INTO ${this.tableName} (id, data) VALUES (?, ?)`);
        const tx = this.db.transaction((items: T[]) => {
            for (const item of items) {
                stmt.run(item.id, JSON.stringify(item));
            }
        });
        tx(items);
        this.syncToJson();
    }

    /**
     * Safe Downgrade Helper: Syncs a single item or all items back to JSON.
     * v1.13.0: Refactored to be asynchronous and fragmented-aware.
     */
    private async syncToJson(id?: string) {
        if (!this.migrationJsonPath) return;

        // Debounce per-item or global
        const key = id || 'GLOBAL_SYNC';
        if (this.syncTimeouts.has(key)) return;

        const timeout = setTimeout(async () => {
            this.syncTimeouts.delete(key);
            try {
                const jsonPath = path.join(process.cwd(), 'data', this.migrationJsonPath!);
                
                if (this.isFragmented && id) {
                    // Optimized path: Sync only one fragment
                    const item = this.findById(id);
                    if (item) {
                        const fragmentPath = path.join(jsonPath.replace('.json', ''), `${id}.json`);
                        await fs.ensureDir(path.dirname(fragmentPath));
                        await fs.writeJSON(fragmentPath, item, { spaces: 2 });
                    }
                } else {
                    // Full sync (Used for saveAll() or non-fragmented mode)
                    const data = this.findAll();
                    await fs.writeJSON(jsonPath, data, { spaces: 2 });
                }
            } catch (e) {
                logger.error(`[SqliteProvider] Async sync failed for ${key}: ${e}`);
            }
        }, 100); // 100ms debounce for high-frequency updates

        this.syncTimeouts.set(key, timeout);
    }
}
