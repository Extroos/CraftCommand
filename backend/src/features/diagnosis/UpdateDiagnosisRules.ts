import { DiagnosisRule, ServerConfig, DiagnosisResult, SystemStats } from './types';
import { CrashReport } from './CrashReportReader';
import fs from 'fs-extra';
import path from 'path';

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

export const EulaRule: DiagnosisRule = {
    id: 'eula_not_accepted',
    name: 'EULA Not Accepted',
    description: 'Checks if the user has accepted the Minecraft EULA',
    triggers: [
        /You need to agree to the EULA/i,
        /eula\.txt/i
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        // --- SMART STATE VERIFICATION (v4.6) ---
        // Check disk first - if eula is already true, the issue is physically resolved.
        // We do this BEFORE log matching to ensure immediate suppression of stale evidence.
        const eulaPath = path.join(server.workingDirectory, 'eula.txt');
        try {
            if (await fs.pathExists(eulaPath)) {
                const content = await fs.readFile(eulaPath, 'utf8');
                if (content.match(/^eula\s*=\s*true/m)) {
                    return null; // Physically resolved
                }
            } else {
                // v4.8: missing eula.txt IS a failure (proactive detection)
                return {
                    id: `eula-missing-${server.id}-${Date.now()}`,
                    ruleId: 'eula_not_accepted',
                    severity: 'CRITICAL',
                    title: 'EULA Not Accepted',
                    explanation: 'Server failed to start because the Minecraft EULA has not been accepted.',
                    recommendation: 'Accept the EULA in the server settings or the console.',
                    action: {
                        type: 'AGREE_EULA',
                        payload: { serverId: server.id },
                        automaticRepair: true
                    },
                    timestamp: Date.now()
                };
            }
        } catch (e) { /* ignore read errors */ }

        // Only process logs if disk state confirms EULA is still unaccepted
        // This prevents the rule from returning a result if the user manually fixed the file
        // but the logs haven't rotated yet.
        const hasLogMatch = logs.some(l => /You need to agree to the EULA|eula\.txt/i.test(l));
        if (hasLogMatch) {
            return {
                id: `eula-${server.id}-${Date.now()}`,
                ruleId: 'eula_not_accepted',
                severity: 'CRITICAL',
                title: 'EULA Not Accepted',
                explanation: 'Server failed to start because the Minecraft EULA has not been accepted.',
                recommendation: 'Accept the EULA in the server settings or the console.',
                action: {
                    type: 'AGREE_EULA',
                    payload: { serverId: server.id },
                    automaticRepair: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const MissingDirectoryRule: DiagnosisRule = {
    id: 'missing_working_directory',
    name: 'Missing Server Directory',
    description: 'Checks if the server working directory exists',
    tier: 1,
    defaultConfidence: 100,
    triggers: [],
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (!server.workingDirectory) return null;
        if (!(await fs.pathExists(server.workingDirectory))) {
            return {
                id: `missing-dir-${server.id}-${Date.now()}`,
                ruleId: 'missing_working_directory',
                severity: 'CRITICAL',
                title: 'Directory Not Found',
                explanation: `The configured server directory does not exist on disk.`,
                recommendation: 'Verify the server path or reinstall the software.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const MissingJarRule: DiagnosisRule = {
    id: 'missing_jar_file',
    name: 'Missing Server File',
    description: 'Checks if the server JAR/executable exists',
    tier: 1,
    defaultConfidence: 100,
    triggers: [],
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (!server.workingDirectory) return null;
        
        // --- SMART PATH VERIFICATION ---
        const isWin = process.platform === 'win32';
        let exeName = server.executable || 'server.jar';
        
        // Software-specific intelligence (v4.5)
        if (server.software === 'Bedrock' && !server.executable) {
            exeName = isWin ? 'bedrock_server.exe' : 'bedrock_server';
        }

        const jarPath = path.join(server.workingDirectory, exeName);
        if (!(await fs.pathExists(jarPath))) {
            return {
                id: `missing-jar-${server.id}-${Date.now()}`,
                ruleId: 'missing_jar_file',
                severity: 'CRITICAL',
                title: 'Executable Not Found',
                explanation: `The server file '${exeName}' is missing from the directory.`,
                recommendation: 'Reinstall the server software or fix the filename in settings.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const BadConfigRule: DiagnosisRule = {
    id: 'malformed_config',
    name: 'Malformed Configuration',
    description: 'Detects syntax errors in config files',
    triggers: [
        /Failed to load server\.properties/i,
        /Config file .* is malformed/i,
        /Expected \w+ but found \w+/i
    ],
    tier: 1,
    defaultConfidence: 90,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const propsPath = path.join(server.workingDirectory, 'server.properties');
        
        // --- SMART CONFIG PARSING ---
        // If the file exists and is readable, we verify its sanity before trusting logs.
        if (await fs.pathExists(propsPath)) {
            try {
                const content = await fs.readFile(propsPath, 'utf8');
                // Basic sanity check: Does it have key=value pairs?
                const pairs = content.split('\n').filter(l => l.includes('=') && !l.startsWith('#'));
                if (pairs.length > 5 && content.includes('server-port')) {
                    // File appears logically valid. Suppress stale log warnings.
                    return null; 
                }
            } catch (e) { /* fall back to logs if read fails */ }
        }

        const logLine = logs.find(l => /server\.properties|malformed|Expected/i.test(l));
        if (logLine) {
            return {
                id: `bad-config-${server.id}-${Date.now()}`,
                ruleId: 'malformed_config',
                severity: 'CRITICAL',
                title: 'Config File Error',
                explanation: `Failed to parse configuration: "${logLine.trim()}"`,
                recommendation: 'Check server.properties or plugin configs for syntax errors/extra spaces.',
                action: {
                    type: 'REPAIR_PROPERTIES',
                    payload: { serverId: server.id },
                    automaticRepair: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const PermissionRule: DiagnosisRule = {
    id: 'filesystem_permission_denied',
    name: 'Permission Denied',
    description: 'Detects OS-level permission issues',
    triggers: [
        /Permission denied/i,
        /Access is denied/i,
        /java\.io\.IOException: Access is denied/i
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        // --- PROACTIVE PERMISSION CHECK ---
        if (process.platform !== 'win32' && server.workingDirectory) {
            try {
                await fs.access(server.workingDirectory, fs.constants.R_OK | fs.constants.W_OK);
                // Directory is accessible. Check logs for specific file access failures.
            } catch (e) {
                 return {
                    id: `perm-proactive-${server.id}-${Date.now()}`,
                    ruleId: 'filesystem_permission_denied',
                    severity: 'CRITICAL',
                    title: 'Filesystem Access Denied',
                    explanation: 'The panel user does not have read/write access to the server directory.',
                    recommendation: 'Run the "Fix Permissions" tool or use chown -R on the host.',
                    action: { type: 'REPAIR_PERMISSIONS', payload: { serverId: server.id }, automaticRepair: true },
                    timestamp: Date.now()
                };
            }
        }

        const logLine = logs.find(l => /Permission denied|Access is denied/i.test(l));
        if (logLine) {
             return {
                id: `perm-denied-${server.id}-${Date.now()}`,
                ruleId: 'filesystem_permission_denied',
                severity: 'CRITICAL',
                title: 'Filesystem Permission Denied',
                explanation: 'The server cannot read or write to its files due to OS restrictions.',
                recommendation: 'Run the "Fix Permissions" tool or ensure the panel user has full access.',
                action: {
                    type: 'REPAIR_PERMISSIONS',
                    payload: { serverId: server.id },
                    automaticRepair: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const WatchdogRule: DiagnosisRule = {
    id: 'watchdog_timeout',
    name: 'Watchdog Timeout',
    description: 'Detects server hangs caught by Watchdog',
    triggers: [
        /A single server tick took/i,
        /Watching Server/i,
        /The server has stopped responding/i
    ],
    tier: 2,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const hasError = logs.some(l => /single server tick took|stopped responding/i.test(l));
        if (hasError) {
             return {
                id: `watchdog-${server.id}-${Date.now()}`,
                ruleId: 'watchdog_timeout',
                severity: 'CRITICAL',
                title: 'Server Hang (Watchdog)',
                explanation: 'The server was killed because a single tick took too long (usually ≥60s).',
                recommendation: 'Identify lagging mods/plugins or increase "max-tick-time" in server.properties.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const WorldCorruptionRule: DiagnosisRule = {
    id: 'world_corruption',
    name: 'World Corruption',
    description: 'Detects corrupted region files or NBT data',
    triggers: [
        /Wrong location!/i,
        /Failed to load chunk/i,
        /chunk is corrupted/i,
        /ZipException: Not in GZIP format/i
    ],
    tier: 2,
    defaultConfidence: 95,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const logLine = logs.find(l => /Wrong location|Failed to load chunk|corrupted/i.test(l));
        if (logLine) {
            return {
                id: `world-corrupt-${server.id}-${Date.now()}`,
                ruleId: 'world_corruption',
                severity: 'CRITICAL',
                title: 'World Data Corrupted',
                explanation: 'Minecraft failed to load a region or chunk due to corruption.',
                recommendation: 'Restore a backup or use a region fixer tool (e.g. MCASelector/MCAFixer).',
                action: {
                    type: 'RESTORE_LEVEL_DATA',
                    payload: { serverId: server.id },
                    automaticRepair: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const TpsLagRule: DiagnosisRule = {
    id: 'tps_lag',
    name: 'TPS Lag Warning',
    description: 'Checks for "Can\'t keep up" warnings',
    triggers: [
        /Can't keep up!/i,
        /Is the server overloaded\?/i
    ],
    tier: 3,
    defaultConfidence: 80,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const logLine = logs.find(l => /Can't keep up/i.test(l));
        if (logLine) {
            return {
                id: `tps-lag-${server.id}-${Date.now()}`,
                ruleId: 'tps_lag',
                severity: 'WARNING',
                title: 'Server Overloaded (Lag)',
                explanation: 'Server is falling behind processing game ticks.',
                recommendation: 'Check Spark profiles to find the lagging mod/entity.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const ResourceExhaustionRule: DiagnosisRule = {
    id: 'resource_exhaustion',
    name: 'Resource Exhaustion',
    description: 'Detects OS level resource limits',
    triggers: [
        /Resource exhaustion event/i,
        /Too many open files/i
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const hasError = logs.some(l => /Resource exhaustion|Too many open files/i.test(l));
        if (hasError) {
             return {
                id: `res-exhaust-${server.id}-${Date.now()}`,
                ruleId: 'resource_exhaustion',
                severity: 'CRITICAL',
                title: 'OS Resource Limit Reached',
                explanation: 'The system has run out of file descriptors (Too many open files).',
                recommendation: 'Increase "ulimit -n" on the host machine.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const UpdateRules = [
    UpdateSignatureRule,
    UpdateApplyFailedRule,
    MigrationFailedRule,
    EulaRule,
    MissingDirectoryRule,
    MissingJarRule,
    BadConfigRule,
    PermissionRule,
    WatchdogRule,
    WorldCorruptionRule,
    TpsLagRule,
    ResourceExhaustionRule
];
