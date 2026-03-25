import axios from 'axios';
import { logger } from '../src/utils/logger';
import chalk from 'chalk';

const API_URL = 'http://localhost:3001/api';
const TEST_NODE_SECRET = 'test-secret-123';

async function runTests() {
    console.log(chalk.blue.bold('\n=== CraftCommand Security Hardening Test (Phase 8) ===\n'));

    // 1. Test Node Enrollment Validation
    console.log(chalk.yellow('Test 1: Node Enrollment Input Sanitization...'));
    try {
        await axios.post(`${API_URL}/nodes/enroll`, {
            name: 'Invalid Node',
            host: '127.0.0.1; rm -rf /',
            port: 99999
        }, { headers: { 'x-test-bypass': 'true' } });
        console.log(chalk.red('  ✖ FAIL: Accepted invalid host/port!'));
    } catch (e: any) {
        if (e.response?.status === 400) {
            console.log(chalk.green('  ✔ PASS: Correctly rejected invalid host/port (400).'));
        } else {
            console.log(chalk.red(`  ✖ FAIL: Unexpected error: ${e.response?.status} - ${e.message}`));
        }
    }

    // 2. Test Node-Server Cross-Validation (Intake)
    console.log(chalk.yellow('\nTest 2: Node-Server Cross-Validation for Backup Intake...'));
    try {
        // Mock scenario: Node 'malicious-node' attempts to send a backup for 'local-server'
        // We assume 'local-server' is assigned to nodeId 'local'
        await axios.post(`${API_URL}/nodes/malicious-node/backups/intake`, {}, {
            headers: {
                'x-node-secret': TEST_NODE_SECRET,
                'x-server-id': 'local-server', // A server that belongs to 'local', not 'malicious-node'
                'x-backup-id': 'fake-backup-id',
                'x-test-bypass': 'true'
            }
        });
        console.log(chalk.red('  ✖ FAIL: Accepted backup for foreign server!'));
    } catch (e: any) {
        if (e.response?.status === 403) {
            console.log(chalk.green('  ✔ PASS: Correctly rejected cross-node intake (403 Forbidden).'));
        } else if (e.response?.status === 404) {
             console.log(chalk.cyan('  ? NOTE: Got 404 (Server/Node not found). Ensure test data exists.'));
        } else {
            console.log(chalk.red(`  ✖ FAIL: Unexpected error: ${e.response?.status} - ${e.message}`));
        }
    }

    // 3. Test JWT Expiration (Manual Check)
    console.log(chalk.yellow('\nTest 3: Session Expiration Verification...'));
    console.log(chalk.gray('  (Log Verification: Check backend/src/features/auth/auth.routes.ts line 62/77 for 24h limit)'));
    
    // 4. Test Audit Log IP Tracking
    console.log(chalk.yellow('\nTest 4: Audit Log IP Traceability...'));
    console.log(chalk.gray('  (Log Verification: Check audit logs in DB to ensure "ip" column is populated for recent actions)'));

    console.log(chalk.blue.bold('\n=== Security Hardening Test Complete ===\n'));
}

// Ensure the server is likely running if we use localhost
runTests().catch(err => {
    console.error(chalk.red('Test Execution Failed:'), err.message);
    process.exit(1);
});
