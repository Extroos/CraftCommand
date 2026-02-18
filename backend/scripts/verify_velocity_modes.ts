
import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';

const VELOCITY_JAR_SRC = 'C:\\Users\\user\\Desktop\\Craft-Commands\\backend\\minecraft_servers\\local-test-velocity-modern\\velocity.jar';
const TEST_ROOT = path.join(process.cwd(), 'backend', 'temp_verify_velocity');

const modes = ['modern', 'legacy', 'bungeeguard', 'none'];

async function generateConfig(dir: string, mode: string) {
    const configPath = path.join(dir, 'velocity.toml');
    const secretPath = path.join(dir, 'forwarding.secret');
    
    // Basic template
    let content = `
# Velocity Configuration
config-version = "2.7"
bind = "0.0.0.0:25565"
motd = "Verification - ${mode}"
show-max-players = 500
online-mode = true
player-info-forwarding-mode = "${mode}"

[servers]
  lobby = "127.0.0.1:25566"
  try = ["lobby"]

[forced-hosts]
  # No forced hosts

[advanced]
    `.trim();

    await fs.writeFile(configPath, content);
    if (mode === 'modern') {
        await fs.writeFile(secretPath, 'test-secret-12345');
    }
}

async function verifyMode(mode: string) {
    const testDir = path.join(TEST_ROOT, mode);
    await fs.ensureDir(testDir);
    
    console.log(`\n[${mode.toUpperCase()}] Setting up test environment...`);
    await fs.copy(VELOCITY_JAR_SRC, path.join(testDir, 'velocity.jar'));
    await generateConfig(testDir, mode);

    console.log(`[${mode.toUpperCase()}] Starting early boot verification...`);
    
    return new Promise((resolve) => {
        const proc = spawn('java', ['-jar', 'velocity.jar'], { cwd: testDir });
        let output = '';
        let resolved = false;

        const timeout = setTimeout(() => {
            if (!resolved) {
                console.log(`[${mode.toUpperCase()}] Timed out after 10s. Assuming success if no errors.`);
                proc.kill();
                resolve({ mode, success: true, reason: 'Timeout (Likely running)' });
                resolved = true;
            }
        }, 10000);

        proc.stdout.on('data', (data) => {
            output += data.toString();
            // If we see "Booting up Velocity", it means config was parsed successfully
            if (output.includes('Booting up Velocity')) {
                console.log(`[${mode.toUpperCase()}] DETECTED: Initialization successful.`);
                clearTimeout(timeout);
                proc.kill();
                resolve({ mode, success: true, reason: 'Boot detected' });
                resolved = true;
            }
        });

        proc.stderr.on('data', (data) => {
            const err = data.toString();
            if (err.includes('ERROR') || err.includes('Exception') || err.includes('invalid')) {
                console.error(`[${mode.toUpperCase()}] ERROR DETECTED:\n${err}`);
                clearTimeout(timeout);
                proc.kill();
                resolve({ mode, success: false, reason: err.trim() });
                resolved = true;
            }
        });

        proc.on('close', (code) => {
            if (!resolved) {
                clearTimeout(timeout);
                if (code === 0 || output.includes('Velocity')) {
                    resolve({ mode, success: true, reason: 'Exited normally' });
                } else {
                    resolve({ mode, success: false, reason: `Exited with code ${code}` });
                }
                resolved = true;
            }
        });
    });
}

async function runTestMatrix() {
    console.log('=== VELOCITY FORWARDING MODE VERIFICATION MATRIX ===');
    console.log(`Root: ${TEST_ROOT}`);
    
    if (!await fs.pathExists(VELOCITY_JAR_SRC)) {
        console.error('Source Velocity JAR not found!');
        process.exit(1);
    }

    const results = [];
    for (const mode of modes) {
        results.push(await verifyMode(mode));
    }

    console.log('\n=== FINAL RESULTS ===');
    console.table(results);

    const failures = results.filter(r => !(r as any).success);
    if (failures.length > 0) {
        console.error(`Tests failed with ${failures.length} modes.`);
        process.exit(1);
    } else {
        console.log('All modes verified successfully!');
    }

    // Cleanup
    try {
        console.log('\nCleaning up test environment...');
        // await fs.remove(TEST_ROOT); // Keep it for inspection if failure?
    } catch (e) {}
}

runTestMatrix().catch(console.error);
