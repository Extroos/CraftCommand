
import { serverRepository } from '../src/storage/ServerRepository';
import { databaseService } from '../src/features/servers/DatabaseService';
import { ServerConfig, DatabaseInstance } from '@shared/types';
import crypto from 'crypto';

async function testDelete() {
    console.log('--- Starting Database Deletion Test ---');

    // 1. Create a mock server
    const serverId = `test-server-${Date.now()}`;
    const mockServer: ServerConfig = {
        id: serverId,
        name: 'Test Server',
        software: 'Vanilla',
        version: '1.20',
        port: 25565,
        ram: 4,
        nodeId: 'local',
        status: 'OFFLINE',
        databases: []
    } as any;

    serverRepository.create(mockServer);
    console.log(`[Test] Created mock server: ${serverId}`);

    // 2. Provision a database
    const dbData = { name: 'test_db', type: 'MySQL', host: 'localhost' };
    const db = await databaseService.createDatabase(serverId, dbData);
    console.log(`[Test] Provisioned database: ${db.id} (${db.name})`);

    // 3. Verify it exists
    let server = serverRepository.findById(serverId);
    if (!server || !server.databases || server.databases.length !== 1) {
        throw new Error('Database was not provisioned correctly in repository');
    }
    console.log('[Test] Confirmed database exists in repository');

    // 4. Delete the database
    console.log(`[Test] Attempting to delete database: ${db.id}`);
    await databaseService.deleteDatabase(serverId, db.id);
    console.log('[Test] Delete call completed');

    // 5. Verify it's gone
    server = serverRepository.findById(serverId);
    if (!server || (server.databases && server.databases.length !== 0)) {
        throw new Error('Database was NOT deleted from repository');
    }
    console.log('[Test] SUCCESS: Database is gone from repository');

    // 6. Cleanup
    // (Optional: remove the test server from the provider if needed)
    
    console.log('--- Test Completed Successfully ---');
}

testDelete().catch(err => {
    console.error('--- Test FAILED ---');
    console.error(err);
    process.exit(1);
});
