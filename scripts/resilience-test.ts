import { spawn } from 'child_process';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const PANEL_PORT = 3001;
const NODE_SECRET = "LOCAL_SECRET_HACK123";

async function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log('--- STARTING RESILIENCE TEST ---');

    // 1. Override settings to register "local" node secret
    const settingsPath = path.resolve(process.cwd(), 'backend/data/settings.json');
    let settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    // Disable built-in manager so it doesn't kill our manual agent
    if (!settings.app.distributedNodes) settings.app.distributedNodes = {};
    settings.app.distributedNodes.enabled = false;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));

    // Force register the local node into registry
    const registryPath = path.resolve(process.cwd(), 'backend/data/nodes.json');
    if (fs.existsSync(registryPath)) {
        let registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        const local = registry.find((n: any) => n.id === 'local');
        if (local) {
            local.enrollmentSecret = NODE_SECRET;
        } else {
            registry.push({ id: 'local', name: 'Internal Edge Node', status: 'OFFLINE', enrollmentSecret: NODE_SECRET, resources: {} });
        }
        fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    }

    // 2. Spawn Backend (Process 1)
    console.log('[Test] Spawning Backend Server...');
    let backendProcess = spawn('npx', ['ts-node', 'src/index.ts'], { 
        cwd: path.resolve(process.cwd(), 'backend'),
        env: { ...process.env, FRONTEND_URL: '*', NODE_ENV: 'development' },
        shell: true
    });
    
    backendProcess.stdout?.on('data', d => {
        const out = d.toString().trim();
        if (out.includes('sync-recover') || out.includes('Recovering ONLINE state')) {
            console.log(`\x1b[32m[BACKEND MAGIC FIX] ${out}\x1b[0m`);
        }
    });

    await wait(8000); // Give backend time to spin up DB
    
    // Create Dummy Server Assigned to Node "local"
    const serverId = 'test-server-' + Math.floor(Math.random() * 100000);
    console.log(`[Test] Creating test server ${serverId} on node 'local'...`);
    await axios.post(`http://localhost:${PANEL_PORT}/api/servers`, {
        id: serverId,
        name: "Resilience Dummy",
        nodeId: "local",
        software: "Vanilla",
        version: "1.20",
        ram: 1,
        port: 25575
    }, { headers: { 'Authorization': 'Bearer test' } }).catch(() => {});

    // 3. Spawn Independent Agent (Process 2)
    console.log('[Test] Spawning Independent Remote Node Agent...');
    const agentProcess = spawn('npm', ['run', 'start', '--', '--panel-url', `http://localhost:${PANEL_PORT}`, '--node-id', 'local', '--secret', NODE_SECRET, '--max-servers', '5'], {
        cwd: path.resolve(process.cwd(), 'agent'),
        shell: true
    });

    let isAgentConnected = false;
    agentProcess.stdout?.on('data', d => {
        const l = d.toString();
        // console.log('[AGENT] ' + l.trim());
        if (l.includes('Connected to panel')) isAgentConnected = true;
    });

    await wait(3000);

    // 4. Send Start Command to Server
    console.log(`[Test] Starting Server ${serverId} remotely...`);
    await axios.post(`http://localhost:${PANEL_PORT}/api/servers/${serverId}/power`, { action: 'start' }, 
        { headers: { 'Authorization': 'Bearer test' } }
    ).catch(e => console.error(e.response?.data || e.message));

    await wait(5000); // Wait for Agent to log "Starting server"

    // 5. Brutally Kill the Backend
    console.log('\n[Test] \x1b[31mSIMULATING CATASTROPHIC PANEL FAILURE (KILLING BACKEND)\x1b[0m');
    backendProcess.kill('SIGKILL');
    
    await wait(4000); // Downtime simulation

    // 6. Restart the Backend
    console.log('\n[Test] \x1b[33mRESTARTING PANEL BACKEND...\x1b[0m');
    backendProcess = spawn('npx', ['ts-node', 'src/index.ts'], { 
        cwd: path.resolve(process.cwd(), 'backend'),
        env: { ...process.env, FRONTEND_URL: '*', NODE_ENV: 'development' },
        shell: true
    });

    let success = false;
    backendProcess.stdout?.on('data', d => {
        const out = d.toString().trim();
        // console.log('[BACKEND] ' + out);
        if (out.includes('sync-recover') || out.includes('Recovering ONLINE state')) {
             console.log(`\n\x1b[32m[SUCCESS] Orphaned server state was instantly recovered by the backend via sync!\x1b[0m`);
             success = true;
        }
    });

    await wait(10000); // Wait for panel to start and agent to reconnect + send agent:sync

    if (!success) {
        console.log('\n\x1b[31m[FAIL] The backend did not log a sync-recover event.\x1b[0m');
    }

    console.log('\n[Test] Cleaning up processes...');
    agentProcess.kill();
    backendProcess.kill();
    process.exit(success ? 0 : 1);
}

run();
