import { auditService } from '../src/features/system/AuditService';
import { auditRepository } from '../src/storage/AuditRepository';
import { serverRepository } from '../src/storage/ServerRepository';
import fs from 'fs';
import path from 'path';

async function verify() {
    console.log('--- Phase 8 Verification: Audit Log Transparency ---');
    
    // 1. Ensure we have at least one server to log against
    const servers = serverRepository.findAll();
    if (servers.length === 0) {
        console.error('Error: No servers found in repository for testing.');
        process.exit(1);
    }
    const serverId = servers[0].id;
    const serverName = servers[0].name;

    console.log(`Using server: ${serverName} (${serverId})`);

    // 2. Simulate an Auto-Healing event
    console.log('Triggering simulated Auto-Healing log event...');
    await auditService.log(
        'SYSTEM',
        'AUTO_HEAL' as any,
        serverId,
        { 
            actionType: 'SIMULATED_FIX', 
            payload: { reason: 'Verification Test' },
            success: true 
        },
        '127.0.0.1',
        'system@craftcommand.internal'
    );

    // 3. Verify specifically in the repository
    console.log('Checking Audit Repository...');
    const result = auditRepository.getLogs({ action: 'AUTO_HEAL', limit: 5 });
    
    const lastLog = result.logs[0];
    if (lastLog && lastLog.action === 'AUTO_HEAL' && lastLog.metadata?.actionType === 'SIMULATED_FIX') {
        console.log('✓ SUCCESS: Auto-Healing event found in Audit Log.');
        console.log('Details:', JSON.stringify(lastLog, null, 2));
    } else {
        console.error('✗ FAILURE: Auto-Healing event not found or metadata mismatch.');
        console.log('Last logs found:', result.logs);
        process.exit(1);
    }

    console.log('Verification Complete.');
}

verify().catch(err => {
    console.error('Verification crashed:', err);
    process.exit(1);
});
