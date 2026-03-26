
import { serverRepository } from '../src/storage/ServerRepository';
import { diagnosisService } from '../src/features/diagnosis/DiagnosisService';
import { logger } from '../src/utils/logger';
import fs from 'fs-extra';
import path from 'path';

async function testLifecycleDiagnosis() {
    logger.info('[Test] Starting Lifecycle-Aware Diagnosis Verification...');
    
    const testDir = path.join(process.cwd(), 'tmp', 'lifecycle-test-server');
    await fs.ensureDir(testDir);
    await fs.writeFile(path.join(testDir, 'eula.txt'), 'eula=false');
    
    const serverId = 'lifecycle-test-01';
    
    // 1. Create a FRESH server (hasStarted defaults to false via routes, but we set it here for test)
    await serverRepository.create({
        id: serverId,
        name: 'Lifecycle Test Server',
        software: 'Paper',
        workingDirectory: testDir,
        ram: 2,
        status: 'OFFLINE',
        hasStarted: false 
    } as any);

    logger.info('[Test] STEP 1: Fresh Server (hasStarted: false). Running diagnosis...');
    let results = await diagnosisService.diagnose(serverRepository.findById(serverId)!, []);
    
    const eulaFound = results.some(r => r.ruleId === 'eula_check');
    if (eulaFound) {
        logger.error('❌ FAIL: Diagnosis triggered for a server that NEVER started. Lifecycle guard failed.');
    } else {
        logger.success('✅ PASS: Diagnosis correctly suppressed for fresh server.');
    }

    // 2. Simulate User clicking "START"
    logger.info('[Test] STEP 2: Simulating "START" click (Setting hasStarted: true)...');
    const server = serverRepository.findById(serverId)!;
    server.hasStarted = true;
    serverRepository.update(serverId, server);

    logger.info('[Test] Running diagnosis again (hasStarted: true)...');
    results = await diagnosisService.diagnose(serverRepository.findById(serverId)!, []);
    
    const eulaTriggered = results.some(r => r.ruleId === 'eula_check');
    if (eulaTriggered) {
        logger.success('✅ PASS: Diagnosis rule (EULA) correctly triggered after first start attempt.');
    } else {
        logger.error('❌ FAIL: Diagnosis rule NOT triggered even after hasStarted set to true. Suppression is stuck.');
    }

    // Cleanup
    await fs.remove(testDir);
    serverRepository.delete(serverId);
    logger.info('[Test] Cleanup complete.');
}

testLifecycleDiagnosis().catch(e => {
    logger.error(`[Test] FATAL ERROR: ${e.message}`);
    console.error(e);
});
