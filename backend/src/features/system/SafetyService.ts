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

        // 2. Check EULA (if applicable)
        // Only check if eula.txt exists or if we expect it (e.g. vanilla/paper)
        // We can't strictly enforce it if it's not generated yet, but if it IS there and false, we block.
        const eulaPath = path.join(server.workingDirectory, 'eula.txt');
        if (fs.existsSync(eulaPath)) {
            const eulaContent = await fs.readFile(eulaPath, 'utf8');
            if (!eulaContent.includes('eula=true')) {
                 throw new SafetyError(
                    'EULA not accepted. You must agree to the Minecraft EULA to run this server.',
                    'EULA_NOT_ACCEPTED',
                    { path: eulaPath }
                );
            }
        }

        // 3. Port Availability
        // MOVED TO STARTUP MANAGER: This allows "Adoption" of existing processes (e.g. zombies).
        // Strict checking here prevents the self-healing logic from working.


        // 4. Java Verification (Basic)
        // We rely on the command generation to find Java, but we can check if the basic requirement is met?
        // Actually ServerService handles "ensureJava", so we might skip strict Java path check here 
        // unless we want to validate the "javaVersion" config matches an installed version.
        // For now, let's assume ServerService's ensureJava is enough for synthesis, 
        // but we could check if restricted RAM > System Free RAM?
        
        // 5. Memory Check (Optional but cool)
        // const freeMem = os.freemem();
        // const required = server.ram * 1024 * 1024 * 1024;
        // if (freeMem < required) {
        //    logger.warn(`[Safety] Low memory warning for ${server.name}`);
        //    // We usually don't block on this generally as swap exists, but strict mode could.
        // }


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
            
            if (allocatedRAM > availableRAM) {
                logger.warn(`[Safety] WARNING: Allocating ${allocatedRAM}GB but only ${availableRAM.toFixed(1)}GB is free. Swapping may occur.`);
            }
        } catch (e: any) {
            // Ignore if SI fails, strict check only if safe
            if (e instanceof SafetyError) throw e;
        }

        // 5. Proactive Diagnosis (NEW)
        // If the server has existing logs, run a quick diagnosis to prevent starting a "known-to-be-broken" config
        try {
            const logPath = path.join(server.workingDirectory, 'logs', 'latest.log');
            if (fs.existsSync(logPath)) {
                const { diagnosisService } = require('../diagnosis/DiagnosisService');
                const logContent = await fs.readFile(logPath, 'utf8');
                const logs = logContent.split('\n').slice(-300); // Last 300 lines are enough for structural issues
                
                const diagnosis = await diagnosisService.diagnose(server, logs, { cpu: 0, ram: 0, disk: 0 });
                const criticalMismatches = diagnosis.filter(d => d.ruleId === 'incompatible_mods' && d.severity === 'CRITICAL');
                
                if (criticalMismatches.length > 0) {
                    const mismatch = criticalMismatches[0];
                    // WARN but don't block — the old logs may be stale after a fix was applied.
                    // The server will fail on its own if mods are truly still incompatible.
                    logger.warn(`[Safety] Previous crash detected incompatible mods for ${server.id}: ${mismatch.explanation}. Allowing startup attempt.`);
                }
            }
        } catch (diagErr: any) {
            if (diagErr instanceof SafetyError) throw diagErr;
            // Ignore other diagnosis errors to not block startup if diagnosis fails
            logger.debug(`[Safety] Pre-flight diagnosis skipped: ${diagErr.message}`);
        }

        logger.success(`[Safety] ${server.name} passed pre-flight checks.`);
    }


}

export const safetyService = new SafetyService();
