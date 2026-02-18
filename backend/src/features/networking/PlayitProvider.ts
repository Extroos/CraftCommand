
import { ConnectivityProvider } from './ConnectivityProvider';
import { ConnectionStatus, ConnectivityMethod } from '@shared/types';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import { logger } from '../../utils/logger';

export class PlayitProvider implements ConnectivityProvider {
    public id: ConnectivityMethod = 'proxy';
    private process: ChildProcess | null = null;
    private externalIP: string | undefined;
    private claimUrl: string | undefined;

    async connect(): Promise<ConnectionStatus> {
        return new Promise((resolve, reject) => {
            const proxyPath = path.resolve(process.cwd(), '../proxy/playit.exe');
            
            if (!fs.existsSync(proxyPath)) {
                return reject(new Error(`Playit executable not found at ${proxyPath}. Please run the setup script.`));
            }

            logger.info(`[PlayitProvider] Starting Playit agent from ${proxyPath}...`);
            
            // Playit needs a clean environment sometimes, but inheriting usually works.
            this.process = spawn(proxyPath, ['start'], {
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true
            });

            this.process.stdout?.on('data', (data) => {
                const line = data.toString();
                // logger.debug(`[Playit] ${line.trim()}`);

                // Attempt to parse claim URL
                if (line.includes('https://playit.gg/claim/')) {
                    const match = line.match(/(https:\/\/playit\.gg\/claim\/[a-zA-Z0-9-]+)/);
                    if (match) {
                        this.claimUrl = match[1];
                        logger.warn(`[Playit] CLAIM REQUIRED: ${this.claimUrl}`);
                        // In a real UI we would push this notification
                    }
                }
                
                // Attempt to parse connection success
                // "TUNXEL ONLINE" or similar? Playit output varies.
                // For now, we assume if it doesn't crash in 2 seconds, it's "running".
            });

            this.process.stderr?.on('data', (data) => {
                logger.error(`[Playit] Error: ${data.toString().trim()}`);
            });

            this.process.on('close', (code) => {
                logger.warn(`[Playit] Process exited with code ${code}`);
                this.process = null;
            });

            // Give it a moment to crash or start
            setTimeout(() => {
                if (this.process && !this.process.killed) {
                    resolve({
                        enabled: true,
                        method: 'proxy',
                        bindAddress: '127.0.0.1', // Playit forwards to localhost usually
                        details: { claimUrl: this.claimUrl } 
                    });
                } else {
                    reject(new Error('Playit agent failed to start immediately. Check logs.'));
                }
            }, 2000);
        });
    }

    async disconnect(): Promise<void> {
        if (this.process) {
            logger.info('[PlayitProvider] Stopping Playit agent...');
            this.process.kill();
            this.process = null;
        }
    }

    async getStatus(): Promise<ConnectionStatus> {
        return {
            enabled: !!this.process,
            method: 'proxy',
            bindAddress: '127.0.0.1',
            details: { claimUrl: this.claimUrl }
        };
    }
}
