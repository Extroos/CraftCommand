
import path from 'path';
import fs from 'fs-extra';

const ROOT = 'C:\\Users\\user\\Desktop\\Craft-Commands\\backend';
const SERVERS_JSON = path.join(ROOT, 'data', 'servers.json');
const SERVERS_ROOT = path.join(ROOT, 'minecraft_servers');
// Using a verified JAR found by find-by-name
const JAR_SRC = path.join(ROOT, 'temp_verify_velocity', 'modern', 'velocity.jar');

async function setup() {
    console.log('--- RE-FORCING REAL VELOCITY SETUP (v2) ---');
    console.log(`Source JAR: ${JAR_SRC}`);
    
    if (!await fs.pathExists(JAR_SRC)) {
        throw new Error('Source JAR still missing!');
    }

    const modes = ['modern', 'legacy', 'bungeeguard', 'none'];
    // Reading canonical JSON
    const servers = await fs.readJson(SERVERS_JSON);

    for (const mode of modes) {
        const id = `local-test-velocity-${mode}`;
        const workDir = path.join(SERVERS_ROOT, id);

        console.log(`Setting up ${id} in ${workDir}...`);
        
        // Clean and recreate
        await fs.remove(workDir);
        await fs.ensureDir(workDir);
        
        console.log(`Copying JAR...`);
        await fs.copy(JAR_SRC, path.join(workDir, 'velocity.jar'));

        console.log(`Writing initial bad config...`);
        const configText = `
bind = "0.0.0.0:25565"
online-mode = true
# DANGEROUS DEPRECATED KEY
forwarding-secret = "old-secret-crash"
# INLINE BLOCK CAUSING SWALLOWING
servers = { lobby = "127.0.0.1:25566" }
forced-hosts = { "lobby.example.com" = ["lobby"] }
        `.trim();
        await fs.writeFile(path.join(workDir, 'velocity.toml'), configText);

        // Update Registry
        const existingIdx = servers.findIndex((s: any) => s.id === id);
        const serverConfig = {
            id,
            name: `VELOCITY-${mode.toUpperCase()}`,
            software: 'Velocity',
            version: '3.3.0-SNAPSHOT',
            port: 25570 + modes.indexOf(mode),
            ram: 1,
            nodeId: 'local',
            cpuPriority: 'normal',
            motd: `HARDENED TEST: ${mode}`,
            maxPlayers: 100,
            javaVersion: 'Java 21',
            onlineMode: true,
            workingDirectory: workDir,
            executable: 'velocity.jar',
            executionCommand: 'server.jar',
            status: 'OFFLINE',
            network: {
                proxyConfig: {
                    links: [],
                    forwardingMode: mode,
                    secret: 'panel-generated-secret-1234'
                }
            }
        };

        if (existingIdx >= 0) {
            servers[existingIdx] = serverConfig;
        } else {
            servers.push(serverConfig);
        }
    }

    console.log(`Saving ${SERVERS_JSON}...`);
    await fs.writeJson(SERVERS_JSON, servers, { spaces: 2 });
    
    // Also update root data as fallback
    const ROOT_JSON = 'C:\\Users\\user\\Desktop\\Craft-Commands\\data\\servers.json';
    try {
        await fs.writeJson(ROOT_JSON, servers, { spaces: 2 });
    } catch(e) {}

    console.log('Setup COMPLETE. 4 Velocity servers are now in the database.');
}

setup().catch(err => {
    console.error('FATAL ERROR DURING SETUP:');
    console.error(err);
    process.exit(1);
});
