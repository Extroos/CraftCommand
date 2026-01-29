import fs from 'fs-extra';
import path from 'path';
import { StorageProvider } from './StorageProvider';

export abstract class JsonRepository<T extends { id: string }> implements StorageProvider<T> {
    protected filePath: string;
    protected data: T[] = [];

    constructor(fileName: string) {
        this.filePath = path.join(process.cwd(), 'data', fileName);
        this.load();
    }

    init() {
        this.load();
    }

    private load() {
        try {
            fs.ensureDirSync(path.dirname(this.filePath));
            if (fs.existsSync(this.filePath)) {
                this.data = fs.readJSONSync(this.filePath);
            } else {
                this.data = [];
                this.save();
            }
        } catch (e) {
            console.error(`[Repository] Failed to load ${this.filePath}:`, e);
            this.data = [];
        }
    }

    protected save() {
        try {
            const tempPath = `${this.filePath}.tmp`;
            fs.writeJSONSync(tempPath, this.data, { spaces: 2 });
            fs.renameSync(tempPath, this.filePath);
        } catch (e) {
            console.error(`[Repository] Failed to save ${this.filePath}:`, e);
            // Attempt cleanup of temp file
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
                if (item[key] !== criteria[key]) return false;
            }
            return true;
        });
    }

    public create(item: T): T {
        this.data.push(item);
        this.save();
        return item;
    }

    public update(id: string, updates: Partial<T>): T | null {
        const index = this.data.findIndex(item => item.id === id);
        if (index === -1) return null;

        this.data[index] = { ...this.data[index], ...updates };
        this.save();
        return this.data[index];
    }

    public delete(id: string): boolean {
        const initialLength = this.data.length;
        this.data = this.data.filter(item => item.id !== id);
        if (this.data.length !== initialLength) {
            this.save();
            return true;
        }
        return false;
    }
}

export class GenericJsonProvider<T extends { id: string }> extends JsonRepository<T> {
    constructor(fileName: string) {
        super(fileName);
    }
}
