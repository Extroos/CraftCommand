import fs from 'fs-extra';
import path from 'path';
import {  ServerConfig  } from '@shared/types';
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

            // 3. Max Players Check
            const diskMaxPlayers = parseInt(props['max-players'] || '20');
            if (server.maxPlayers !== undefined && diskMaxPlayers !== server.maxPlayers) {
                report.mismatches.push({
                    setting: 'maxPlayers',
                    diskValue: diskMaxPlayers,
                    dbValue: server.maxPlayers,
                    severity: 'low'
                });
            }

            // 4. MOTD / Server Name Check
            const diskMotd = props['motd'] || '';
            const isBedrock = server.software === 'Bedrock';
            
            if (server.motd !== undefined && diskMotd !== server.motd) {
                report.mismatches.push({
                    setting: 'motd',
                    diskValue: diskMotd,
                    dbValue: server.motd,
                    severity: 'low'
                });
            }

            // Bedrock Specific: server-name should also match motd
            if (isBedrock && server.motd !== undefined) {
                const diskServerName = props['server-name'] || '';
                if (diskServerName !== server.motd) {
                    report.mismatches.push({
                        setting: 'server-name',
                        diskValue: diskServerName,
                        dbValue: server.motd,
                        severity: 'low'
                    });
                }
            }

            // 5. Difficulty Check
            const diskDifficulty = props['difficulty'] || 'easy';
            if (server.difficulty !== undefined && diskDifficulty !== server.difficulty) {
                report.mismatches.push({
                    setting: 'difficulty',
                    diskValue: diskDifficulty,
                    dbValue: server.difficulty,
                    severity: 'low'
                });
            }

            // 6. Bedrock PortV6 Check
            if (isBedrock) {
                const diskPortV6 = parseInt(props['server-portv6'] || '0');
                const targetPortV6 = server.port + 1;
                if (diskPortV6 !== targetPortV6) {
                    report.mismatches.push({
                        setting: 'portV6',
                        diskValue: diskPortV6,
                        dbValue: targetPortV6,
                        severity: 'medium'
                    });
                }
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

        // update portv6 (Bedrock)
        if (server.software === 'Bedrock') {
            const portV6Regex = /^server-portv6=.*/m;
            const targetV6 = server.port + 1;
            if (content.match(portV6Regex)) {
                content = content.replace(portV6Regex, `server-portv6=${targetV6}`);
                modified = true;
            } else {
                content += `\nserver-portv6=${targetV6}`;
                modified = true;
            }
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

        // update max-players
        if (server.maxPlayers !== undefined) {
            const maxPlayersRegex = /^max-players=.*/m;
            if (content.match(maxPlayersRegex)) {
                content = content.replace(maxPlayersRegex, `max-players=${server.maxPlayers}`);
                modified = true;
            } else {
                content += `\nmax-players=${server.maxPlayers}`;
                modified = true;
            }
        }

        // update motd / server-name
        if (server.motd !== undefined) {
            const motdRegex = /^motd=.*/m;
            if (content.match(motdRegex)) {
                content = content.replace(motdRegex, `motd=${server.motd}`);
                modified = true;
            } else {
                content += `\nmotd=${server.motd}`;
                modified = true;
            }

            // Bedrock Specific: Also sync server-name
            if (server.software === 'Bedrock') {
                const serverNameRegex = /^server-name=.*/m;
                if (content.match(serverNameRegex)) {
                    content = content.replace(serverNameRegex, `server-name=${server.motd}`);
                    modified = true;
                } else {
                    content += `\nserver-name=${server.motd}`;
                    modified = true;
                }
            }
        }

        // update difficulty
        if (server.difficulty !== undefined) {
            const diffRegex = /^difficulty=.*/m;
            if (content.match(diffRegex)) {
                content = content.replace(diffRegex, `difficulty=${server.difficulty}`);
                modified = true;
            } else {
                content += `\ndifficulty=${server.difficulty}`;
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
