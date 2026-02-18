import { permissionService } from './features/auth/PermissionService';
import { ROLE_PERMISSIONS, ROLE_HIERARCHY } from '../../shared/constants/roles';

async function verifySync() {
    console.log('--- Access Control Sync Audit ---');

    // 1. Verify PermissionService uses shared constants
    
    // Test base role permissions (VIEWER)
    const mockViewer: any = { role: 'VIEWER' };
    const canView = permissionService.can(mockViewer, 'server.view');
    const canStart = permissionService.can(mockViewer, 'server.start');
    
    console.log(`[PermissionService] VIEWER can view: ${canView} (Expected: true)`);
    console.log(`[PermissionService] VIEWER can start: ${canStart} (Expected: false)`);

    if (canView !== true || canStart !== false) {
        throw new Error('PermissionService drift detected!');
    }

    // 2. Test ACL Overrides
    const mockManager: any = { 
        role: 'MANAGER',
        serverAcl: {
            'global': { allow: [], deny: ['server.start'] }
        }
    };
    
    const managerCanStart = permissionService.can(mockManager, 'server.start');
    console.log(`[PermissionService] MANAGER denied start via ACL: ${!managerCanStart} (Expected: true)`);

    if (managerCanStart !== false) {
        throw new Error('ACL Override failing!');
    }

    // 3. Verify Hierarchy
    console.log('[Hierarchy] OWNER weight:', ROLE_HIERARCHY['OWNER']);
    console.log('[Hierarchy] VIEWER weight:', ROLE_HIERARCHY['VIEWER']);
    
    if (ROLE_HIERARCHY['OWNER'] <= ROLE_HIERARCHY['ADMIN']) {
        throw new Error('Incorrect Hierarchy weights!');
    }

    console.log('✅ Access Control Sync Verified Successfully!');
}

verifySync().catch(err => {
    console.error('❌ Verification Failed:', err.message);
    process.exit(1);
});
