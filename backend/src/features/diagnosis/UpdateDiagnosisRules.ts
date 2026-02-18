import { DiagnosisRule, ServerConfig, DiagnosisResult, SystemStats } from './types';
import { CrashReport } from './CrashReportReader';

export const UpdateSignatureRule: DiagnosisRule = {
    id: 'update_signature_invalid',
    name: 'Update Signature Verification Failed',
    description: 'Checks for failed update signature verifications',
    triggers: [
        /update signature verification failed/i,
        /Invalid signature for update/i,
        /GenericSignatureVerifier: Signature mismatch/i
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        const hasError = logs.some(l => /update signature verification failed|Invalid signature for update|Signature mismatch/i.test(l));
        
        if (hasError) {
            return {
                id: `update-sig-${Date.now()}`, // System-wide rule, server ID less relevant but needed for type
                ruleId: 'update_signature_invalid',
                severity: 'CRITICAL',
                title: 'Update Validation Failed',
                explanation: 'The downloaded update package failed security verification. This means the file is either corrupted during download or has been tampered with.',
                recommendation: 'Do not install this update. The system has blocked it for your safety. \n\n1. Check your internet connection.\n2. Try checking for updates again to re-download the package.\n3. If this persists, wait for a newer version.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const UpdateApplyFailedRule: DiagnosisRule = {
    id: 'update_apply_failed',
    name: 'Update Installation Failed',
    description: 'Checks for failures during the update application process',
    triggers: [
        /Failed to extract update/i,
        /Failed to replace file/i,
        /Update rollback initiated/i,
        /launcher: Update failed/i
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        const hasError = logs.some(l => /Failed to extract update|Failed to replace file|Update rollback initiated|launcher: Update failed/i.test(l));
        
        if (hasError) {
            return {
                id: `update-apply-${Date.now()}`,
                ruleId: 'update_apply_failed',
                severity: 'CRITICAL',
                title: 'Update Installation Failed',
                explanation: 'The system attempted to install an update but failed. A rollback was likely initiated to restore the previous version.',
                recommendation: '1. Check ensuring you have sufficient disk space.\n2. Ensure no external antivirus or firewall is locking the application files.\n3. Restart the server machine and try again.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const MigrationFailedRule: DiagnosisRule = {
    id: 'migration_failed',
    name: 'Database Migration Failed',
    description: 'Checks for database migration failures after an update',
    triggers: [
        /Migration failed:/i,
        /Failed to apply migration/i,
        /Database schema mismatch/i
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        const errorLog = logs.find(l => /Migration failed:|Failed to apply migration|Database schema mismatch/i.test(l));
        
        if (errorLog) {
            return {
                id: `migration-fail-${Date.now()}`,
                ruleId: 'migration_failed',
                severity: 'CRITICAL',
                title: 'Database Update Failed',
                explanation: `The system could not update its database structure. This is critical. Error: "${errorLog.substring(0, 100)}..."`,
                recommendation: '1. STOP the server immediately if running.\n2. Restore the latest backup of your database/files.\n3. Contact support with the crash report.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const UpdateRules = [
    UpdateSignatureRule,
    UpdateApplyFailedRule,
    MigrationFailedRule
];
