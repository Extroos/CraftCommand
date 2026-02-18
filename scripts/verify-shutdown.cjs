const { spawn } = require('child_process');
const path = require('path');

// Assuming server is compiled to JS or running via ts-node
// Since we are in dev, we can try running with ts-node if available, or assume build.
// Let's try running the source with ts-node via npx
const SERVER_PATH = path.join(__dirname, '../backend/src/server.ts');
const CWD = path.join(__dirname, '../backend');

console.log('Starting backend process for checking shutdown...');

const child = spawn('npx', ['ts-node', '-r', 'tsconfig-paths/register', SERVER_PATH], {
    cwd: CWD,
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, BACKEND_PORT: '3100' } // Use different port
});

let started = false;

child.stdout.on('data', (data) => {
    const line = data.toString();
    console.log('[BACKEND]', line.trim());
    if (line.includes('Listening For Connections')) {
        started = true;
        console.log('Backend started successfully. Initiating Graceful Shutdown in 2s...');
        setTimeout(() => {
            // Send SIGTERM
            // On Windows, strict signal handling is tricky, but node usually handles SIGINT/SIGTERM emulation
            // We might need to use tree-kill or similar if spawn creates a shell wrapper
            console.log('Sending SIGTERM...');
            child.kill('SIGTERM'); 
        }, 2000);
    }
});

child.stderr.on('data', (data) => {
    console.error('[BACKEND ERROR]', data.toString().trim());
});

child.on('close', (code) => {
    console.log(`Backend exited with code ${code}`);
    if (code === 0) {
        console.log('PASS: Graceful shutdown successful.');
        process.exit(0);
    } else {
        console.error('FAIL: Backend exited with non-zero code.');
        process.exit(1);
    }
});

// Timeout
setTimeout(() => {
    if (!started) {
        console.error('FAIL: Backend took too long to start.');
        child.kill();
        process.exit(1);
    }
}, 60000);
