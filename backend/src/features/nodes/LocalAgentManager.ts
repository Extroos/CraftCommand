import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { logger } from '../../utils/logger';
import { nodeRegistryService } from './NodeRegistryService';
import { systemSettingsService } from '../system/SystemSettingsService';

class LocalAgentManager {
    private agentProcess: ChildProcess | null = null;
    private restartTimer: NodeJS.Timeout | null = null;
    private intentionalStop: boolean = false;

    initialize() {
        // Initial check
        this.checkAndApplyState();

        // Listen for runtime changes
        systemSettingsService.on('updated', () => {
             this.checkAndApplyState();
        });
    }

    private checkAndApplyState() {
        const settings = systemSettingsService.getSettings();
        const enabled = settings.app.distributedNodes?.enabled;

        if (!enabled) {
            // Feature disabled: stop if running and don't start
            this.intentionalStop = true;
            this.stop();
            return;
        }

        this.intentionalStop = false;

        // Auto-Enrollment for Local Node
        const secret = nodeRegistryService.getLocalNodeSecret();
        if (!secret) {
            // If missing, we can't do much without calling private enrollLocalDefault. 
            // However, NodeRegistryService ensures it on load.
            // If it's missing here, it's an edge case.
             logger.warn('[LocalAgent] Local node secret missing. Waiting for registry...');
        } else {
            // Start the local agent
            this.startAgent(secret);
        }

        // Logic for other distributed features (if any) could go here
    }

    private startAgent(secret: string) {
        if (this.agentProcess) return;

        logger.info('[LocalAgent] Spawning embedded Node Agent...');

        const isProduction = process.env.NODE_ENV === 'production';
        const projectRoot = path.resolve(__dirname, '../../../../');
        const agentDir = path.join(projectRoot, 'agent');
        
        // Command configuration
        const port = process.env.BACKEND_PORT || '3001';
        const panelUrl = `http://127.0.0.1:${port}`;
        
        // Fixed: Ensure we point to the correct flat structure in dist 
        // (tsc output is dist/index.js)
        const distPath = path.join(agentDir, 'dist', 'index.js');
        const srcPath = path.join(agentDir, 'src', 'index.ts');

        // Check if dist exists for production fallback
        const useDist = isProduction || require('fs').existsSync(distPath);

        let cmd = 'node';
        let scriptArgs = [];

        if (useDist) {
            scriptArgs = [distPath];
        } else {
             // Fallback to ts-node if no build found (Dev mode)
            cmd = 'node';
            scriptArgs = ['-r', 'ts-node/register', srcPath];
        }

        // Add common args
        scriptArgs.push('--panel-url', panelUrl);
        scriptArgs.push('--node-id', 'local');
        scriptArgs.push('--secret', secret);

        // Spawn
        this.agentProcess = spawn(cmd, scriptArgs, {
            cwd: agentDir,
            shell: true,
            stdio: 'pipe', 
            env: { ...process.env, FORCE_COLOR: '1' }
        });

        this.agentProcess.stdout?.on('data', (d) => {
            const line = d.toString().trim();
            // Filter noise
            if (line && !line.includes('debugger')) logger.debug(`[LocalAgent] ${line}`);
        });

        this.agentProcess.stderr?.on('data', (d) => {
            const line = d.toString().trim();
            if (line) logger.warn(`[LocalAgent] ${line}`);
        });

        this.agentProcess.on('close', (code) => {
            this.agentProcess = null;
            if (!this.intentionalStop) {
                logger.warn(`[LocalAgent] Process exited with code ${code}. Restarting in 5s...`);
                // Always try to restart if it crashes
                this.restartTimer = setTimeout(() => this.startAgent(secret), 5000);
            } else {
                logger.info('[LocalAgent] Process shut down gracefully (Feature Disabled).');
            }
        });
    }

    stop() {
        this.intentionalStop = true;
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }
        if (this.agentProcess) {
            // Force kill tree? For now standard kill
            this.agentProcess.kill(); 
            // process will emit close which respects intentionalStop
        }
    }
}

export const localAgentManager = new LocalAgentManager();
