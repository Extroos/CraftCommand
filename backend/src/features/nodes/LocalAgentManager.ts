import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { logger } from '../../utils/logger';
import { nodeRegistryService } from './NodeRegistryService';
import { systemSettingsService } from '../system/SystemSettingsService';

class LocalAgentManager {
    private agentProcess: ChildProcess | null = null;
    private restartTimer: NodeJS.Timeout | null = null;
    private intentionalStop: boolean = false;

    // Phase 1 Fix: Crash loop prevention
    private consecutiveFailures: number = 0;
    private readonly MAX_CONSECUTIVE_RESTARTS = 5;
    private readonly BASE_RESTART_DELAY_MS = 1000;
    private readonly MAX_RESTART_DELAY_MS = 30000;
    private stabilityTimer: NodeJS.Timeout | null = null;
    private agentSafeMode: boolean = false;

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
        this.agentSafeMode = false;
        this.consecutiveFailures = 0;

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

    private getRestartDelay(): number {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
        const delay = Math.min(
            this.BASE_RESTART_DELAY_MS * Math.pow(2, this.consecutiveFailures),
            this.MAX_RESTART_DELAY_MS
        );
        return delay;
    }

    private startAgent(secret: string) {
        if (this.agentProcess) return;

        if (this.agentSafeMode) {
            logger.error('[LocalAgent] Agent is in Safe Mode after repeated failures. Re-enable Distributed Nodes in settings to retry.');
            return;
        }

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

        // Spawn as a true background daemon
        this.agentProcess = spawn(cmd, scriptArgs, {
            cwd: agentDir,
            shell: false, 
            detached: true,
            windowsHide: true, 
            stdio: ['ignore', 'pipe', 'pipe'], // Capture output for first few failures
            env: { ...process.env, FORCE_COLOR: '1' }
        });

        // Diagnostic piping: only if we have failures or for initial debug
        if (this.agentProcess.stdout) {
            this.agentProcess.stdout.on('data', (data) => {
                logger.debug(`[LocalAgent Out] ${data.toString().trim()}`);
            });
        }
        if (this.agentProcess.stderr) {
            this.agentProcess.stderr.on('data', (data) => {
                logger.error(`[LocalAgent Err] ${data.toString().trim()}`);
            });
        }

        // Fully unref the process so the Panel doesn't wait for it on exit
        if (this.agentProcess) {
            this.agentProcess.unref();
        }

        this.agentProcess.on('close', (code) => {
            this.agentProcess = null;

            // Clear stability timer since agent is no longer running
            if (this.stabilityTimer) {
                clearTimeout(this.stabilityTimer);
                this.stabilityTimer = null;
            }

            if (!this.intentionalStop) {
                this.consecutiveFailures++;

                if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_RESTARTS) {
                    logger.error(`[LocalAgent] Agent crashed ${this.consecutiveFailures} times consecutively. Entering Agent Safe Mode.`);
                    logger.error('[LocalAgent] To retry: Toggle "Distributed Nodes" off and on in Settings.');
                    this.agentSafeMode = true;
                    return;
                }

                const delay = this.getRestartDelay();
                logger.warn(`[LocalAgent] Process exited with code ${code}. Restart ${this.consecutiveFailures}/${this.MAX_CONSECUTIVE_RESTARTS} in ${Math.round(delay / 1000)}s...`);
                this.restartTimer = setTimeout(() => this.startAgent(secret), delay);
            } else {
                logger.info('[LocalAgent] Process shut down gracefully (Feature Disabled).');
            }
        });

        // Stability timer: if agent stays alive for 60s, reset failure counter
        this.stabilityTimer = setTimeout(() => {
            if (this.agentProcess && this.consecutiveFailures > 0) {
                logger.info(`[LocalAgent] Agent stable for 60s. Resetting failure counter (was ${this.consecutiveFailures}).`);
                this.consecutiveFailures = 0;
            }
        }, 60000);
    }

    stop() {
        this.intentionalStop = true;
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }
        if (this.stabilityTimer) {
            clearTimeout(this.stabilityTimer);
            this.stabilityTimer = null;
        }
        if (this.agentProcess) {
            // Force kill tree? For now standard kill
            this.agentProcess.kill(); 
            // process will emit close which respects intentionalStop
        }
    }
}

export const localAgentManager = new LocalAgentManager();
