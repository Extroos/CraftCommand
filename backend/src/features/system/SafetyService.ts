import fs from 'fs-extra';
import path from 'path';
import si from 'systeminformation';
import {  ServerConfig  } from '@shared/types';
import { logger } from '../../utils/logger';

export class SafetyError extends Error {
    public code: string;
    public details?: any;

    constructor(message: string, code: string, details?: any) {
        super(message);
        this.name = 'SafetyError';
        this.code = code;
        this.details = details;
    }
}

export class SafetyService {
    
    async validateServer(server: ServerConfig): Promise<void> {
        logger.info(`[Safety] Validating server ${server.id} (${server.name})...`);
        const errors: { code: string, message: string }[] = [];

        // 1. Check Server Executable exists
        let defaultExe = 'server.jar';
        if (server.software === 'Bedrock') {
            defaultExe = process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server';
        } else if (server.software === 'Velocity' || (server as any).type === 'Velocity') {
            defaultExe = 'velocity.jar';
        }
        const exeName = server.executable || defaultExe;
        const exePath = path.join(server.workingDirectory, exeName);

        if (!fs.existsSync(exePath)) {
             throw new SafetyError(
                `Server executable not found: ${exeName} at ${exePath}`, 
                'MISSING_EXECUTABLE', 
                { path: exePath, executable: exeName }
            );
        }

        // 2. Check EULA (Definitive Physical Check)
        const eulaPath = path.join(server.workingDirectory, 'eula.txt');
        let isEulaPhysicallyAccepted = false;
        
        if (!fs.existsSync(eulaPath)) {
            // v4.8: If no eula.txt exists, it's effectively NOT accepted because Minecraft will create one and stop.
            throw new SafetyError(
                'EULA Not Found. Server failed to start because the Minecraft EULA has not been accepted.',
                'EULA_NOT_ACCEPTED',
                { path: eulaPath }
            );
        }

        const eulaContent = await fs.readFile(eulaPath, 'utf8');
        isEulaPhysicallyAccepted = eulaContent.match(/^eula\s*=\s*true/m) !== null;
        
        if (!isEulaPhysicallyAccepted) {
            throw new SafetyError(
                'EULA Not Accepted. Server failed to start because the Minecraft EULA has not been accepted.',
                'EULA_NOT_ACCEPTED',
                { path: eulaPath }
            );
        }

        // 3. Environment Integrity (Directory)
        if (!fs.existsSync(server.workingDirectory)) {
             throw new SafetyError(
                `Server directory missing: ${server.workingDirectory}`,
                'MISSING_DIRECTORY',
                { path: server.workingDirectory }
            );
        }

        // 4. System RAM Check
        try {
            const mem = await si.mem();
            const availableRAM = mem.available / 1024 / 1024 / 1024; // GB
            const totalRAM = mem.total / 1024 / 1024 / 1024;
            const allocatedRAM = server.ram || 2;
    
            if (allocatedRAM > totalRAM) {
                 throw new SafetyError(
                    `CRITICAL: Cannot allocate ${allocatedRAM}GB RAM. System only has ${totalRAM.toFixed(1)}GB installed.`,
                    'insufficient_ram_critical', 
                    { allocated: allocatedRAM, total: totalRAM }
                 );
            }
        } catch (e: any) {
            if (e instanceof SafetyError) throw e;
        }

        // 5. Proactive Diagnosis (v4.6 State-Aware Intelligence)
        try {
            const { diagnosisService } = require('../diagnosis/DiagnosisService');
            
            const logPath = path.join(server.workingDirectory, 'logs', 'latest.log');
            const recentLogs = fs.existsSync(logPath) 
                ? (await fs.readFile(logPath, 'utf8')).split('\n').slice(-100)
                : [];
                
            let diagnosis = await diagnosisService.diagnose(server, recentLogs);
            
            // --- OVERRIDE: Suppress stale EULA findings if physically accepted ---
            if (isEulaPhysicallyAccepted) {
                const countBefore = diagnosis.length;
                diagnosis = diagnosis.filter(d => d.ruleId !== 'eula_not_accepted');
                if (diagnosis.length < countBefore) {
                    logger.info(`[Safety] Suppressed stale EULA detection for ${server.id} (Disk state is OK).`);
                }
            }

            // Critical Root Causes: If any Tier 1 issue is identified as a root cause, BLOCK boot.
            const fatalRootCauses = diagnosis.filter(d => 
                (d.isRootCause || d.severity === 'CRITICAL') && 
                ['java_binary_missing', 'port_binding', 'eula_not_accepted', 'invalid_jvm_args'].includes(d.ruleId)
            );

            if (fatalRootCauses.length > 0) {
                const fatal = fatalRootCauses[0];
                throw new SafetyError(
                    `Startup Blocked: ${fatal.title}. ${fatal.explanation}`,
                    'FATAL_CONFIGURATION',
                    { ruleId: fatal.ruleId, diagnosisId: fatal.id }
                );
            }

            // Warnings only: If we have an incompatible mod or plugin, we WARN but don't block
            const warnings = diagnosis.filter(d => d.ruleId === 'incompatible_mods' || d.ruleId === 'plugin_incompatible');
            if (warnings.length > 0) {
                logger.warn(`[Safety] Pre-flight warning for ${server.name}: ${warnings[0].explanation}`);
            }

        } catch (diagErr: any) {
            if (diagErr instanceof SafetyError) throw diagErr;
            logger.debug(`[Safety] Pre-flight diagnosis skipped: ${diagErr.message}`);
        }

        logger.success(`[Safety] ${server.name} passed pre-flight checks.`);
    }


}

export const safetyService = new SafetyService();
