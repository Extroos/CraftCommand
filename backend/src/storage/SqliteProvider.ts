
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import { StorageProvider } from './StorageProvider';

export class SqliteProvider<T extends { id: string }> implements StorageProvider<T> {
    private db: Database.Database;
    private tableName: string;

    constructor(fileName: string, tableName: string = 'store', private migrationJsonPath?: string) {
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

        // Auto-Migration: If DB is empty and migration path is provided, try to load from existing JSON
        const count = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName}`).get() as { count: number };
        if (count.count === 0 && this.migrationJsonPath) {
            const jsonPath = path.join(process.cwd(), 'data', this.migrationJsonPath);
            if (fs.existsSync(jsonPath)) {
                try {
                    console.log(`[SqliteProvider] Migrating data from ${this.migrationJsonPath}...`);
                    const jsonData = fs.readJSONSync(jsonPath);
                    if (Array.isArray(jsonData)) {
                        const insert = this.db.prepare(`INSERT INTO ${this.tableName} (id, data) VALUES (?, ?)`);
                        const tx = this.db.transaction((items: any[]) => {
                            for (const item of items) insert.run(item.id, JSON.stringify(item));
                        });
                        tx(jsonData);
                        console.log(`[SqliteProvider] Migrated ${jsonData.length} items from ${this.migrationJsonPath}.`);
                    }
                } catch (e) {
                    console.error(`[SqliteProvider] Migration from ${this.migrationJsonPath} failed:`, e);
                }
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
        // Since we are storing as JSON blob, SQL filtering is limited unless we use JSON_EXTRACT.
        // For simplicity and compatibility with the generic interface, we fetch all (cached?) or iterate.
        // Given typical server counts (<100), fetching all is acceptable performance-wise.
        const all = this.findAll();
        return all.find(item => {
            for (const key in criteria) {
                if (item[key] !== criteria[key]) return false;
            }
            return true;
        });
    }

    create(item: T): T {
        const stmt = this.db.prepare(`INSERT INTO ${this.tableName} (id, data) VALUES (?, ?)`);
        stmt.run(item.id, JSON.stringify(item));
        return item;
    }

    update(id: string, updates: Partial<T>): T | null {
        // Transaction to ensure atomicity
        const updateTx = this.db.transaction(() => {
            const current = this.findById(id);
            if (!current) return null;

            const updated = { ...current, ...updates };
            const stmt = this.db.prepare(`UPDATE ${this.tableName} SET data = ? WHERE id = ?`);
            stmt.run(JSON.stringify(updated), id);
            return updated;
        });

        return updateTx();
    }

    delete(id: string): boolean {
        const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`);
        const info = stmt.run(id);
        return info.changes > 0;
    }
}
