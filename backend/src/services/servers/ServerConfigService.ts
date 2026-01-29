import fs from 'fs-extra';
import path from 'path';
import { ServerConfig } from '../../../../shared/types';
import { logger } from '../../utils/logger';

export interface ConfigMismatch {
    setting: string;
    diskValue: string | number | boolean;
    dbValue: string | number | boolean;
    severity: 'high' | 'medium' | 'low';
}

export interface SyncReport {
    synchronized: boolean;
    mismatches: ConfigMismatch[];
    eulaAccepted: boolean;
}

export class ServerConfigService {

    /**
     * Reads server.properties and compares it against the ServerConfig from the DB.
     */
    async verifyConfig(server: ServerConfig): Promise<SyncReport> {
        const report: SyncReport = {
            synchronized: true,
            mismatches: [],
            eulaAccepted: false
        };

        if (!server.workingDirectory || !(await fs.pathExists(server.workingDirectory))) {
            return report; // Cannot verify if dir doesn't exist
        }

        const propsPath = path.join(server.workingDirectory, 'server.properties');
        const eulaPath = path.join(server.workingDirectory, 'eula.txt');

        // Check EULA
        if (await fs.pathExists(eulaPath)) {
            const eulaContent = await fs.readFile(eulaPath, 'utf-8');
            report.eulaAccepted = eulaContent.includes('eula=true');
        }

        // Check Properties
        if (await fs.pathExists(propsPath)) {
            const props = await this.parseProperties(propsPath);

            // 1. Port Check
            const diskPort = parseInt(props['server-port'] || '25565');
            if (diskPort !== server.port) {
                report.mismatches.push({
                    setting: 'port',
                    diskValue: diskPort,
                    dbValue: server.port,
                    severity: 'high'
                });
            }

            // 2. Online Mode Check
            const diskOnline = props['online-mode'] === 'true';
            // server.onlineMode might be undefined for older servers, default to true or flexible?
            // Assuming DB always has value if managed properly.
            if (server.onlineMode !== undefined && diskOnline !== server.onlineMode) {
                report.mismatches.push({
                    setting: 'onlineMode',
                    diskValue: diskOnline,
                    dbValue: server.onlineMode,
                    severity: 'medium'
                });
            }
        }

        if (report.mismatches.length > 0) {
            report.synchronized = false;
        }

        return report;
    }

    /**
     * Enforces DB state onto server.properties (Overwrite Disk with DB)
     */
    async enforceConfig(server: ServerConfig): Promise<void> {
         if (!server.workingDirectory || !(await fs.pathExists(server.workingDirectory))) {
            return;
        }
        
        const propsPath = path.join(server.workingDirectory, 'server.properties');
        if (!(await fs.pathExists(propsPath))) return; // Don't create if not exists (Wait for first run?)
        // Actually, we usually want to ensure it exists if we are enforcing. But let's stick to update logic.

        let content = await fs.readFile(propsPath, 'utf-8');
        let modified = false;

        // update port
        const portRegex = /^server-port=.*/m;
        if (content.match(portRegex)) {
            content = content.replace(portRegex, `server-port=${server.port}`);
            modified = true;
        } else {
            content += `\nserver-port=${server.port}`;
            modified = true;
        }

        // update online-mode
        if (server.onlineMode !== undefined) {
             const onlineRegex = /^online-mode=.*/m;
             if (content.match(onlineRegex)) {
                content = content.replace(onlineRegex, `online-mode=${server.onlineMode}`);
                modified = true;
            } else {
                content += `\nonline-mode=${server.onlineMode}`;
                modified = true;
            }
        }

        if (modified) {
            await fs.writeFile(propsPath, content);
            logger.info(`[ConfigService] Enforced DB settings on ${server.name}`);
        }
    }

    private async parseProperties(filePath: string): Promise<Record<string, string>> {
        const content = await fs.readFile(filePath, 'utf-8');
        const result: Record<string, string> = {};
        content.split('\n').forEach(line => {
            const clean = line.trim();
            if (clean && !clean.startsWith('#')) {
                const [key, ...rest] = clean.split('=');
                if (key) {
                    result[key.trim()] = rest.join('=').trim();
                }
            }
        });
        return result;
    }
}

export const serverConfigService = new ServerConfigService();
