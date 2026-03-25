import { nodeRegistryService } from '../src/features/nodes/NodeRegistryService';
import { serverRepository } from '../src/storage/ServerRepository';

async function setup() {
    console.log('Setting up security test data...');

    // 1. Create a "legitimate" local node if it doesn't exist
    try {
        nodeRegistryService.enroll('local', '127.0.0.1', 3001, []);
    } catch(e) {}

    // 2. Create a "malicious" node with a fixed ID
    try {
        const node: any = {
            id: 'malicious-node',
            name: 'Malicious Node',
            host: '127.0.0.2',
            port: 3002,
            status: 'ENROLLING',
            protocolVersion: '1.12.0',
            enrolledAt: Date.now(),
            lastHeartbeat: Date.now(),
            labels: [],
            enrollmentSecret: 'test-secret-123'
        };
        nodeRegistryService.injectNode(node);
    } catch(e) {}

    // 3. Create a server that belongs to the "local" node
    try {
        serverRepository.create({
            id: 'local-server',
            name: 'Local Server',
            nodeId: 'local',
            software: 'vanilla',
            version: '1.20.1',
            status: 'OFFLINE',
            port: 25565,
            workingDirectory: '/tmp/local-server',
            createdAt: Date.now()
        } as any);
    } catch(e) {}

    console.log('Test data setup complete.');
}

setup();
