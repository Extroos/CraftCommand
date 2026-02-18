import {  UserProfile, Permission, UserRole  } from '@shared/types';
import { ROLE_PERMISSIONS } from '@shared/constants/roles';

class PermissionService {
    
    // Define Permission Sets per Role
    private readonly ROLE_PERMISSIONS = ROLE_PERMISSIONS;

    /**
     * Check if a user has a specific permission.
     * Logic: Role Base -> ACL Allow -> ACL Deny (Deny wins)
     * Supports per-server scope or 'global' scope.
     */
    can(user: UserProfile, action: Permission, serverId?: string): boolean {
        // 1. Owner can do anything (Hard override)
        if (user.role === 'OWNER') return true;

        let hasPermission = false;

        // 2. Base Role Permissions
        const rolePerms = this.ROLE_PERMISSIONS[user.role] || [];
        if (rolePerms.includes(action)) {
            hasPermission = true;
        }

        // 3. ACL Overrides (Global or Server-Specific)
        const targetScope = serverId || 'global';
        if (user.serverAcl && user.serverAcl[targetScope]) {
            const acl = user.serverAcl[targetScope];
            
            // Allow override
            if (acl.allow.includes(action)) {
                hasPermission = true;
            }

            // Deny override (Wins)
            if (acl.deny.includes(action)) {
                return false; 
            }
        }
        
        // Backward Compatibility (Deprecated)
        if (!hasPermission && serverId && user.permissions && user.permissions[serverId]) {
            if (user.permissions[serverId].includes(action)) {
                hasPermission = true;
            }
        }

        return hasPermission;
    }
}

export const permissionService = new PermissionService();
