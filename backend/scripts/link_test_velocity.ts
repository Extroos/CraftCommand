
import path from 'path';
import fs from 'fs-extra';

const ROOT = 'C:\\Users\\user\\Desktop\\Craft-Commands\\backend';
const SERVERS_JSON = path.join(ROOT, 'data', 'servers.json');

async function linkAll() {
    console.log('--- LINKING VELOCITY TESTERS TO BACKEND ---');
    
    const servers = await fs.readJson(SERVERS_JSON);
    const backend = servers.find((s: any) => s.name === 'test');
    
    if (!backend) {
        console.error('Backend "tester" not found!');
        return;
    }

    const velocityServers = servers.filter((s: any) => s.software === 'Velocity');

    velocityServers.forEach((v: any) => {
        console.log(`Linking ${v.name} to ${backend.name}...`);
        v.network.proxyConfig.links = [
            {
                serverId: backend.id,
                alias: 'lobby'
            }
        ];
    });

    await fs.writeJson(SERVERS_JSON, servers, { spaces: 2 });
    
    const ROOT_JSON = 'C:\\Users\\user\\Desktop\\Craft-Commands\\data\\servers.json';
    if (await fs.pathExists(ROOT_JSON)) {
        await fs.writeJson(ROOT_JSON, servers, { spaces: 2 });
    }

    console.log('Links updated. Run synchronization now.');
}

linkAll().catch(console.error);
