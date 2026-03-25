
import { serverRepository } from '../src/storage/ServerRepository';
import { diagnosisService } from '../src/features/diagnosis/DiagnosisService';
import { autoHealingService } from '../src/features/diagnosis/AutoHealingService';
import { FileSystemManager } from '../src/features/files/FileSystemManager';
import { logger } from '../src/utils/logger';
import fs from 'fs-extra';
import path from 'path';

async function testDiagnosisFlow() {
    logger.info('[Test] Starting Diagnosis & Auto-Healing Functional Test...');
    
    // 1. Setup a test server in a temporary directory
    const testDir = path.join(process.cwd(), 'tmp', 'diag-test-server');
    await fs.ensureDir(testDir);
    await fs.writeFile(path.join(testDir, 'eula.txt'), 'eula=false');
    
    const serverId = 'test-diag-server-001';
    await serverRepository.create({
        id: serverId,
        name: 'Diagnosis Test Server',
        software: 'Paper',
        version: '1.20.1',
        workingDirectory: testDir,
        ram: 2,
        status: 'CRASHED' // Simulate a failure state
    } as any);

    logger.info('[Test] Created test server with rejected EULA.');

    // 2. Trigger Diagnosis
    const env = { totalMemory: 16000, freeMemory: 8000, javaVersion: 'Java 17', cpu: 10 };
    const results = await diagnosisService.diagnose(serverRepository.findById(serverId)!, [], env);

    logger.info(`[Test] Diagnosis complete. Found ${results.length} results.`);

    const eulaResult = results.find(r => r.ruleId === 'eula_check');
    
    if (eulaResult) {
        logger.success('[Test] ✅ EULA Rule correctly triggered!');
        logger.info(`[Test] Severity: ${eulaResult.severity}`);
        logger.info(`[Test] Recommendation: ${eulaResult.recommendation}`);

        // 3. Trigger Healing
        if (eulaResult.action) {
            logger.info('[Test] Triggering automatic fix (AGREE_EULA)...');
            await autoHealingService.executeFix(serverId, eulaResult.action.type, eulaResult.action.payload);

            // 4. Validate Result
            const finalEula = await fs.readFile(path.join(testDir, 'eula.txt'), 'utf-8');
            if (finalEula.trim() === 'eula=true') {
                logger.success('[Test] ✅ Healing SUCCESSFUL! eula.txt has been repaired.');
            } else {
                logger.error(`[Test] ❌ Healing FAILED. Content: ${finalEula}`);
            }
        } else {
             logger.error('[Test] ❌ No action suggested for EULA error.');
        }
    } else {
        logger.error('[Test] ❌ EULA Rule NOT triggered. Check rules or log triggers.');
    }

    // Cleanup
    await fs.remove(testDir);
    serverRepository.delete(serverId);
    logger.info('[Test] Cleanup complete.');
}

testDiagnosisFlow().catch(e => {
    logger.error(`[Test] FATAL ERROR: ${e.message}`);
    console.error(e);
});
