import fs from 'fs-extra';
import path from 'path';
import net from 'net';
import { ServerConfig } from '../../../../shared/types';
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

        // 1. Check Server JAR exists
        const jarPath = path.join(server.workingDirectory, server.executable || 'server.jar');
        if (!fs.existsSync(jarPath)) {
             throw new SafetyError(
                `Server executable not found: ${server.executable}`, 
                'MISSING_EXECUTABLE', 
                { path: jarPath }
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

        logger.success(`[Safety] ${server.name} passed pre-flight checks.`);
    }

    private checkPort(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const tester = net.createServer()
                .once('error', (err: any) => {
                    if (err.code === 'EADDRINUSE') return resolve(true);
                    resolve(false);
                })
                .once('listening', () => {
                    tester.once('close', () => { resolve(false); }).close();
                })
                .listen(port);
        });
    }
}

export const safetyService = new SafetyService();
