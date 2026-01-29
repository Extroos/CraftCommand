import fs from 'fs-extra';
import path from 'path';
import { AuditLog } from '../../../shared/types';

export class AuditRepository {
    private filePath: string;
    private logs: AuditLog[] = [];

    constructor() {
        this.filePath = path.join(process.cwd(), 'data', 'audit.json');
        this.load();
    }

    private load() {
        try {
            fs.ensureDirSync(path.dirname(this.filePath));
            if (fs.existsSync(this.filePath)) {
                this.logs = fs.readJSONSync(this.filePath);
            }
        } catch (e) {
            console.error('[AuditRepo] Failed to load audit logs:', e);
            this.logs = [];
        }
    }

    public async add(entry: AuditLog) {
        this.logs.unshift(entry);
        
        // Cap at 5000
        if (this.logs.length > 5000) {
            this.logs = this.logs.slice(0, 5000);
        }

        await this.persist();
    }

    public getLogs(limit: number = 100, filterAction?: string): AuditLog[] {
        let result = this.logs;
        if (filterAction) {
            result = result.filter(l => l.action === filterAction);
        }
        return result.slice(0, limit);
    }

    private async persist() {
        try {
            await fs.writeJSON(this.filePath, this.logs, { spaces: 2 });
        } catch (e) {
            console.error('[AuditRepo] Failed to persist logs:', e);
        }
    }
}

export const auditRepository = new AuditRepository();
