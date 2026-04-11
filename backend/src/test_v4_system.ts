
import { safetyService, SafetyError } from './features/system/SafetyService';
import { ServerConfig } from '@shared/types';
import fs from 'fs-extra';
import path from 'path';

async function testSystemV4() {
    process.stdout.write('--- STARTING SYSTEM V4.0 VERIFICATION ---\n');

    // 1. Setup Mock Environment for Fatal Block
    const mockDir = path.join(process.cwd(), 'temp_test_safety');
    await fs.ensureDir(mockDir);
    
    // Scenario: Server exists but eula.txt is false (Fatal)
    await fs.writeFile(path.join(mockDir, 'server.jar'), 'fake-binary');
    await fs.writeFile(path.join(mockDir, 'eula.txt'), 'eula=false');

    const mockServer: ServerConfig = {
        id: 'test-safety-1',
        name: 'Safety Test Server',
        software: 'Paper',
        version: '1.20',
        workingDirectory: mockDir,
        executable: 'server.jar',
        ram: 1,
        port: 25565,
        javaVersion: 'Java 17',
        status: 'OFFLINE' as any
    };

    process.stdout.write('Test Case 1: Safety Block (EULA False)\n');
    try {
        await safetyService.validateServer(mockServer);
        process.stdout.write('Result: FAIL (Validation should have blocked startup)\n');
    } catch (e: any) {
        if (e instanceof SafetyError || e.name === 'SafetyError') {
            process.stdout.write(`Result: PASS (Blocked with ${e.code}: ${e.message.split('.')[0]})\n`);
        } else {
            process.stdout.write(`Result: FAIL (Unexpected error: ${e.message})\n`);
        }
    }

    // 2. Test Silent Maintenance Logic (Directly)
    process.stdout.write('\nTest Case 2: Silent Maintenance Logic\n');
    const { systemService } = require('./features/system/SystemService');
    
    // We mock the inner clearCache to see if they are called
    let clearJavaCalled = false;
    let clearTempCalled = false;
    const originalClear = systemService.clearCache;
    systemService.clearCache = async (type: string) => {
        if (type === 'java') clearJavaCalled = true;
        if (type === 'temp') clearTempCalled = true;
    };

    try {
        const result = await systemService.performSilentMaintenance();
        const success = clearJavaCalled && clearTempCalled;
        process.stdout.write(`Result: ${success ? 'PASS' : 'FAIL'} (Clear Java: ${clearJavaCalled}, Clear Temp: ${clearTempCalled})\n`);
    } catch (e: any) {
        process.stdout.write(`Result: ERROR (${e.message})\n`);
    } finally {
        systemService.clearCache = originalClear;
        // Clean up
        if (fs.existsSync(mockDir)) {
             await fs.remove(mockDir);
        }
    }
}

testSystemV4().catch(console.error);
