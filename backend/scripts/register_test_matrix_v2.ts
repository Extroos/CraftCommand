
import path from 'path';
import fs from 'fs-extra';

// Manual paths to bypass constants initialization issues in script
const ROOT = 'C:\\Users\\user\\Desktop\\Craft-Commands\\backend';
const SERVERS_JSON = path.join(ROOT, 'data', 'servers.json');
const SERVERS_ROOT = path.join(ROOT, 'minecraft_servers');

async function createTestMatrix() {
    console.log('--- Velocity Test Matrix Registration ---');
    
    if (!await fs.pathExists(SERVERS_JSON)) {
        console.error(`Servers file not found at ${SERVERS_JSON}`);
        return;
    }

    const servers = await fs.readJson(SERVERS_JSON);
    const existingVelocity = servers.find((s: any) => s.software === 'Velocity');
    
    if (!existingVelocity) {
        console.error('No Velocity server found in servers.json to use as template.');
        return;
    }

    const modes = ['modern', 'legacy', 'bungeeguard', 'none'];
    const newServers = [...servers];

    for (const mode of modes) {
        const id = `test-velocity-${mode}`;
        const name = `Velocity-Test-${mode.toUpperCase()}`;
        const workDir = path.join(SERVERS_ROOT, id);

        // Check if already exists
        if (servers.find((s: any) => s.id === id)) {
            console.log(`[Matrix] Server ${id} already exists. Skipping.`);
            continue;
        }

        console.log(`[Matrix] Creating ${name}...`);

        const config = {
            ...existingVelocity,
            id,
            name,
            port: 25570 + modes.indexOf(mode),
            motd: `Testing mode: ${mode}`,
            workingDirectory: workDir,
            status: 'OFFLINE',
            network: {
                ...existingVelocity.network,
                proxyConfig: {
                    ...existingVelocity.network.proxyConfig,
                    forwardingMode: mode,
                    secret: mode === 'modern' ? 'test-secret-4321' : undefined
                }
            }
        };

        newServers.push(config);

        // Copy files
        await fs.ensureDir(workDir);
        const jarSrc = path.join(existingVelocity.workingDirectory, 'velocity.jar');
        const jarDest = path.join(workDir, 'velocity.jar');
        if (await fs.pathExists(jarSrc)) {
            await fs.copy(jarSrc, jarDest);
        }

        // Create a known bad config to test the fixer
        const badConfig = `
bind = "0.0.0.0:25565"
online-mode = true
forwarding-mode = "${mode}"
servers = {}
forced-hosts = { "lobby.example.com" = ["lobby"] }
        `.trim();
        await fs.writeFile(path.join(workDir, 'velocity.toml'), badConfig);
    }

    await fs.writeJson(SERVERS_JSON, newServers, { spaces: 2 });
    console.log('[Matrix] Successfully registered 4 new test servers.');
    console.log('[Matrix] Please restart the backend or wait for nodemon to refresh.');
}

createTestMatrix().catch(console.error);
