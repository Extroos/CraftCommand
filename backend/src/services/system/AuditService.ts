import { AuditLog, AuditAction } from '../../../../shared/types';
import { auditRepository } from '../../storage/AuditRepository';



export class AuditService {
    // Converted to Stateless Service wrapping Repository



    public async log(userId: string, action: AuditAction, resourceId?: string, metadata?: any, ip?: string, userEmail?: string) {
        const entry: AuditLog = {
            id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            timestamp: Date.now(),
            userId,
            userEmail,
            action,
            resourceId,
            metadata,
            ip
        };

        await auditRepository.add(entry);
    }

    public getLogs(options: any = {}): { logs: AuditLog[], total: number } {
        return auditRepository.getLogs(options);
    }


}

export const auditService = new AuditService();
