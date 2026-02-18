
import path from 'path';
import fs from 'fs-extra';

const ROOT = 'C:\\Users\\user\\Desktop\\Craft-Commands\\backend';
const SERVERS_JSON = path.join(ROOT, 'data', 'servers.json');
const SERVERS_ROOT = path.join(ROOT, 'minecraft_servers');
const JAR_SRC = 'C:\\Users\\user\\Desktop\\Craft-Commands\\backend\\minecraft_servers\\local-1771112042498\\velocity.jar';

async function setup() {
    console.log('--- FORCING REAL VELOCITY SETUP ---');
    
    const modes = ['modern', 'legacy', 'bungeeguard', 'none'];
    const servers = await fs.readJson(SERVERS_JSON);

    for (const mode of modes) {
        const id = `local-test-velocity-${mode}`;
        const workDir = path.join(SERVERS_ROOT, id);

        if (servers.find((s: any) => s.id === id)) continue;

        console.log(`Setting up ${id}...`);
        await fs.ensureDir(workDir);
        if (await fs.pathExists(JAR_SRC)) {
            await fs.copy(JAR_SRC, path.join(workDir, 'velocity.jar'));
        }

        const config = {
            id,
            name: `Velocity-${mode.toUpperCase()}`,
            software: 'Velocity',
            version: '3.3.0-SNAPSHOT',
            port: 25570 + modes.indexOf(mode),
            ram: 1,
            nodeId: 'local',
            cpuPriority: 'normal',
            motd: `Testing ${mode}`,
            maxPlayers: 100,
            javaVersion: 'Java 21',
            onlineMode: true,
            workingDirectory: workDir,
            executable: 'velocity.jar',
            executionCommand: 'server.jar', // This is what StartupManager uses
            status: 'OFFLINE',
            network: {
                proxyConfig: {
                    links: [],
                    forwardingMode: mode,
                    secret: mode === 'modern' ? 'test-secret' : undefined
                }
            }
        };

        servers.push(config);
    }

    await fs.writeJson(SERVERS_JSON, servers, { spaces: 2 });
    
    // Also update the root one just in case
    const ROOT_DATA = 'C:\\Users\\user\\Desktop\\Craft-Commands\\data\\servers.json';
    if (await fs.pathExists(ROOT_DATA)) {
        await fs.writeJson(ROOT_DATA, servers, { spaces: 2 });
    }

    console.log('Done. Total servers now:', servers.length);
}

setup().catch(console.error);
