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

            // Mapping for detection
            const mappings: { key: keyof ServerConfig; prop: string; type: 'int' | 'bool' | 'string'; severity: 'high' | 'medium' | 'low' }[] = [
                { key: 'port', prop: 'server-port', type: 'int', severity: 'high' },
                { key: 'onlineMode', prop: 'online-mode', type: 'bool', severity: 'medium' },
                { key: 'maxPlayers', prop: 'max-players', type: 'int', severity: 'low' },
                { key: 'motd', prop: 'motd', type: 'string', severity: 'low' },
                { key: 'difficulty', prop: 'difficulty', type: 'string', severity: 'low' },
                { key: 'gamemode', prop: 'gamemode', type: 'string', severity: 'low' },
                { key: 'viewDistance', prop: 'view-distance', type: 'int', severity: 'low' },
                { key: 'pvp', prop: 'pvp', type: 'bool', severity: 'low' },
                { key: 'hardcore', prop: 'hardcore', type: 'bool', severity: 'low' },
                { key: 'allowFlight', prop: 'allow-flight', type: 'bool', severity: 'low' },
                { key: 'spawnMonsters', prop: 'spawn-monsters', type: 'bool', severity: 'low' },
                { key: 'spawnAnimals', prop: 'spawn-animals', type: 'bool', severity: 'low' },
                { key: 'levelSeed', prop: 'level-seed', type: 'string', severity: 'low' }
            ];

            for (const m of mappings) {
                const dbValue = server[m.key];
                if (dbValue === undefined || typeof dbValue === 'object') continue;

                const rawDiskValue = props[m.prop];
                let diskValue: any = rawDiskValue;

                if (m.type === 'int') diskValue = parseInt(rawDiskValue || '0');
                if (m.type === 'bool') diskValue = rawDiskValue === 'true';

                if (diskValue !== dbValue) {
                    report.mismatches.push({
                        setting: m.key as string,
                        diskValue: (diskValue as string | number | boolean) ?? 'MISSING',
                        dbValue: dbValue as string | number | boolean,
                        severity: m.severity
                    });
                }
            }

            const isBedrock = server.software === 'Bedrock';
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

            // Bedrock Specific: PortV6 Check
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
        if (!(await fs.pathExists(propsPath))) return; 

        let content = await fs.readFile(propsPath, 'utf-8');
        let modified = false;

        const syncProperty = (key: keyof ServerConfig, propName: string) => {
            const val = server[key];
            if (val === undefined || typeof val === 'object') return;

            const regex = new RegExp(`^${propName}=.*$`, 'm');
            const stringVal = String(val);

            if (content.match(regex)) {
                content = content.replace(regex, `${propName}=${stringVal}`);
            } else {
                content += `\n${propName}=${stringVal}`;
            }
            modified = true;
        };

        // Standard Properties
        syncProperty('port', 'server-port');
        syncProperty('onlineMode', 'online-mode');
        syncProperty('maxPlayers', 'max-players');
        syncProperty('motd', 'motd');
        syncProperty('difficulty', 'difficulty');
        syncProperty('gamemode', 'gamemode');
        syncProperty('viewDistance', 'view-distance');
        syncProperty('pvp', 'pvp');
        syncProperty('hardcore', 'hardcore');
        syncProperty('allowFlight', 'allow-flight');
        syncProperty('spawnMonsters', 'spawn-monsters');
        syncProperty('spawnAnimals', 'spawn-animals');
        syncProperty('levelSeed', 'level-seed');

        // Bedrock Specifics
        if (server.software === 'Bedrock') {
            syncProperty('motd', 'server-name');
            const targetV6 = server.port + 1;
            const portV6Regex = /^server-portv6=.*/m;
            if (content.match(portV6Regex)) {
                content = content.replace(portV6Regex, `server-portv6=${targetV6}`);
            } else {
                content += `\nserver-portv6=${targetV6}`;
            }
            modified = true;
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
