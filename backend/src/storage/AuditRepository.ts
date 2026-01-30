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

    public getLogs(options: { 
        limit?: number, 
        offset?: number, 
        action?: string, 
        userId?: string, 
        resourceId?: string, 
        search?: string 
    } = {}): { logs: AuditLog[], total: number } {
        let filtered = this.logs;

        if (options.action) {
            filtered = filtered.filter(l => l.action === options.action);
        }
        if (options.userId) {
            const uid = options.userId.toLowerCase();
            filtered = filtered.filter(l => 
                l.userId.toLowerCase() === uid || 
                (l.userEmail && l.userEmail.toLowerCase().includes(uid))
            );
        }
        if (options.resourceId) {
            filtered = filtered.filter(l => l.resourceId === options.resourceId);
        }
        if (options.search) {
            const s = options.search.toLowerCase();
            filtered = filtered.filter(l => 
                l.action.toLowerCase().includes(s) ||
                (l.userEmail && l.userEmail.toLowerCase().includes(s)) ||
                (l.resourceId && l.resourceId.toLowerCase().includes(s)) ||
                (l.metadata && JSON.stringify(l.metadata).toLowerCase().includes(s))
            );
        }

        const total = filtered.length;
        const limit = options.limit || 100;
        const offset = options.offset || 0;

        return {
            logs: filtered.slice(offset, offset + limit),
            total
        };
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
