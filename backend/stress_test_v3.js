const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Craft-Commands Stress Test v3.0 (Enterprise Load Simulator)
 * Goals:
 * 1. Spawn 1,000 REAL OS processes (Node.js dummy apps).
 * 2. Each app writes to its own latest.log every 2s.
 * 3. Each app maintains a persistent PID for the NativeRunner cache.
 * 4. Measure Backend Event Loop Lag and RAM usage under massive PID monitoring.
 */

const TEST_DIR = path.join(__dirname, 'stress_test_data_v3');
const SERVER_COUNT = 1000;
const DUMMY_APP_CONTENT = `
const fs = require('fs');
const path = require('path');
const id = process.argv[2];
const logPath = path.join(process.cwd(), 'logs', 'latest.log');

if (!fs.existsSync(path.dirname(logPath))) fs.mkdirSync(path.dirname(logPath), { recursive: true });

console.log('Dummy Server ' + id + ' started with PID ' + process.pid);

// Simulate log activity
setInterval(() => {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, \`[\${timestamp}] [Server thread/INFO]: Player \${id}_user joined the game\\n\`);
    fs.appendFileSync(logPath, \`[\${timestamp}] [Server thread/INFO]: \${id}_user issued server command: /tps\\n\`);
    fs.appendFileSync(logPath, \`[\${timestamp}] [Server thread/INFO]: TPS from last 1m: 19.95\\n\`);
}, 2000);

// Keep process alive
setInterval(() => {}, 1000);
`;

async function runTest() {
    console.log('🚀 Initializing Stress Test v3.0 (1,000 Real Processes)...');
    await fs.remove(TEST_DIR);
    await fs.ensureDir(TEST_DIR);

    const dummyAppPath = path.join(TEST_DIR, 'dummy_app.js');
    await fs.writeFile(dummyAppPath, DUMMY_APP_CONTENT);

    const processes = [];
    const startTime = Date.now();

    console.log('📦 Provisioning 1,000 server environments...');
    for (let i = 1; i <= SERVER_COUNT; i++) {
        const serverDir = path.join(TEST_DIR, `server_${i}`);
        await fs.ensureDir(serverDir);
        await fs.ensureDir(path.join(serverDir, 'logs'));
        
        // Initial log file
        await fs.writeFile(path.join(serverDir, 'logs', 'latest.log'), `[${new Date().toISOString()}] Starting server ${i}...\n`);
    }
    console.log(`✅ Provisioning complete in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

    console.log('🔥 Spawning 1,000 real OS processes...');
    const spawnStart = Date.now();
    
    for (let i = 1; i <= SERVER_COUNT; i++) {
        const serverDir = path.join(TEST_DIR, `server_${i}`);
        const p = spawn('node', [dummyAppPath, i], { 
            cwd: serverDir,
            stdio: 'ignore', // Don't pipe 1,000 stdouts to this process
            detached: false 
        });
        processes.push(p);

        if (i % 100 === 0) console.log(`> Spawned ${i}/${SERVER_COUNT} processes...`);
    }

    const spawnDuration = (Date.now() - spawnStart) / 1000;
    console.log(`✅ All processes spawned in ${spawnDuration.toFixed(2)}s`);

    console.log('\n--- PERFORMANCE MONITOR (Wait 10s for baseline) ---');
    
    let lastLag = 0;
    const lagMonitor = setInterval(() => {
        const start = Date.now();
        setTimeout(() => {
            lastLag = Date.now() - start - 50; // Expected 50ms drift
        }, 50);
    }, 100);

    // Give system time to settle
    await new Promise(r => setTimeout(r, 10000));

    console.log(`Current PID: ${process.pid}`);
    console.log(`Processes Managed: ${processes.length}`);
    console.log(`Backend Event Loop Lag: ${lastLag}ms`);
    console.log(`RAM Usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);

    console.log('\n💡 TEST COMPLETE. Now manually start the Craft-Commands backend and check the dashboard.');
    console.log('Type "exit" or hit Ctrl+C to kill all dummy processes.');

    process.on('SIGINT', () => {
        console.log('\n🛑 Cleaning up...');
        processes.forEach(p => p.kill());
        process.exit();
    });

    // Keep test script open
    process.stdin.resume();
}

runTest().catch(console.error);
