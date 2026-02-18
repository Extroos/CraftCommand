
import path from 'path';
import fs from 'fs-extra';

const ROOT = 'C:\\Users\\user\\Desktop\\Craft-Commands\\backend';
const SERVERS_JSON = path.join(ROOT, 'data', 'servers.json');

async function debug() {
    const servers = await fs.readJson(SERVERS_JSON);
    console.log(`Found ${servers.length} servers.`);
    servers.forEach((s: any) => {
        console.log(`- ${s.name} (ID: ${s.id}, Software: ${s.software})`);
    });
}

debug();
