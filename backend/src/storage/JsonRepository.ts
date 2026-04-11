import fs from 'fs-extra';
import path from 'path';
import { StorageProvider } from './StorageProvider';

/**
 * JsonRepository: Scalable storage provider with Fragmented Mode support.
 * Fragmented Mode stores each entity in its own [id].json file to avoid 
 * monolithic file rewriting bottlenecks at 1000+ entities.
 */
export abstract class JsonRepository<T extends { id: string }> implements StorageProvider<T> {
    protected filePath: string;
    protected data: T[] = [];
    protected isFragmented: boolean;
    protected fragmentDir: string;
    private fragmentSyncTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private writeQueue: Promise<void> = Promise.resolve();

    constructor(fileName: string, isFragmented: boolean = false) {
        this.filePath = path.join(process.cwd(), 'data', fileName);
        this.isFragmented = isFragmented;
        this.fragmentDir = this.filePath.replace('.json', '');
        this.init();
    }

    init() {
        this.load();
    }

    private load() {
        try {
            fs.ensureDirSync(path.dirname(this.filePath));
            
            if (this.isFragmented) {
                fs.ensureDirSync(this.fragmentDir);
                const files = fs.readdirSync(this.fragmentDir);
                this.data = files
                    .filter(f => f.endsWith('.json'))
                    .map(f => fs.readJSONSync(path.join(this.fragmentDir, f)));
                // Also load legacy monolithic if it exists for migration
                if (fs.existsSync(this.filePath)) {
                    const legacy = fs.readJSONSync(this.filePath);
                    if (Array.isArray(legacy)) {
                        legacy.forEach(item => {
                            if (!this.data.find(d => d.id === item.id)) {
                                this.data.push(item);
                                this.saveFragment(item);
                            }
                        });
                        // Migration complete: archive legacy
                        fs.renameSync(this.filePath, `${this.filePath}.bak`);
                    }
                }
            } else {
                if (fs.existsSync(this.filePath)) {
                    const loaded = fs.readJSONSync(this.filePath);
                    this.data = Array.isArray(loaded) ? loaded : [];
                } else {
                    this.data = [];
                    this.save();
                }
            }
        } catch (e) {
            const { logger } = require('../utils/logger');
            logger.error(`[Repository] Failed to load ${this.filePath}: ${e}`);
            this.data = [];
        }
    }

    private saveTimeout: NodeJS.Timeout | null = null;

    protected save() {
        if (this.isFragmented) return; // Individual fragments saved immediately
        
        if (this.saveTimeout) return; 
        this.saveTimeout = setTimeout(() => {
            this.executeSave();
            this.saveTimeout = null;
        }, 500);
    }

    private async saveFragment(item: T) {
        if (!this.isFragmented) return;
        
        // Debounce per-fragment to handle rapid status bursts (e.g. STARTING -> RUNNING)
        if (this.fragmentSyncTimeouts.has(item.id)) return;

        const timeout = setTimeout(() => {
            this.fragmentSyncTimeouts.delete(item.id);
            // Chain to write queue to prevent concurrent EBUSY crashes (Phase 9)
            this.writeQueue = this.writeQueue.then(async () => {
                try {
                    const fPath = path.join(this.fragmentDir, `${item.id}.json`);
                    const tempPath = `${fPath}.tmp`;
                    // Atomic write: write to temp file, then rename
                    await fs.writeJSON(tempPath, item, { spaces: 2 });
                    await fs.rename(tempPath, fPath);
                } catch (e) {
                    const { logger } = require('../utils/logger');
                    logger.error(`[Repository] Async fragment save failed for ${item.id}: ${e}`);
                    // Cleanup temp file if rename failed
                    try {
                        const tempPath = path.join(this.fragmentDir, `${item.id}.json.tmp`);
                        if (await fs.pathExists(tempPath)) await fs.unlink(tempPath);
                    } catch { /* ignore cleanup errors */ }
                }
            });
        }, 50);

        this.fragmentSyncTimeouts.set(item.id, timeout);
    }

    private deleteFragment(id: string) {
        if (!this.isFragmented) return;
        try {
            const fPath = path.join(this.fragmentDir, `${id}.json`);
            if (fs.existsSync(fPath)) fs.unlinkSync(fPath);
        } catch (e) {
            const { logger } = require('../utils/logger');
            logger.error(`[Repository] Failed to delete fragment ${id}: ${e}`);
        }
    }

    private executeSave() {
        try {
            const tempPath = `${this.filePath}.tmp`;
            fs.writeJSONSync(tempPath, this.data, { spaces: 2 });
            fs.renameSync(tempPath, this.filePath);
        } catch (e) {
            const { logger } = require('../utils/logger');
            logger.error(`[Repository] Failed to save ${this.filePath}: ${e}`);
            try { 
                if (fs.existsSync(`${this.filePath}.tmp`)) fs.unlinkSync(`${this.filePath}.tmp`); 
            } catch (cleanupErr) { /* ignore */ }
        }
    }

    public findAll(): T[] {
        return [...this.data];
    }

    public findById(id: string): T | undefined {
        return this.data.find(item => item.id === id);
    }

    public findOne(criteria: Partial<T>): T | undefined {
        return this.data.find(item => {
            for (const key in criteria) {
                if ((item as any)[key] !== (criteria as any)[key]) return false;
            }
            return true;
        });
    }

    public create(item: T): T {
        this.data.push(item);
        this.saveFragment(item);
        this.save();
        return item;
    }

    public update(id: string, updates: Partial<T>): T | null {
        const index = this.data.findIndex(item => item.id === id);
        if (index === -1) return null;

        this.data[index] = { ...this.data[index], ...updates };
        this.saveFragment(this.data[index]);
        this.save();
        return this.data[index];
    }

    public delete(id: string): boolean {
        const index = this.data.findIndex(item => item.id === id);
        if (index !== -1) {
            this.data.splice(index, 1);
            this.deleteFragment(id);
            this.save();
            return true;
        }
        return false;
    }

    public saveAll(items: T[]): void {
        this.data = [...items];
        if (this.isFragmented) {
             items.forEach(item => this.saveFragment(item));
        }
        this.save();
    }
}

export class GenericJsonProvider<T extends { id: string }> extends JsonRepository<T> {
    constructor(fileName: string, isFragmented: boolean = false) {
        super(fileName, isFragmented);
    }
}
