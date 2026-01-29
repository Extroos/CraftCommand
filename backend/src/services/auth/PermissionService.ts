import { UserProfile, Permission, UserRole } from '../../../../shared/types';

class PermissionService {
    
    // Define Permission Sets per Role
    private readonly ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
        'OWNER': [
            'server.view', 'server.start', 'server.stop', 'server.restart',
            'server.console.read', 'server.console.write', 'server.files.read', 'server.files.write', 
            'server.settings', 'server.players.manage', 'server.backups.manage', 'users.manage',
            'system.remote_access.manage'
        ],
        'ADMIN': [
            'server.view', 'server.start', 'server.stop', 'server.restart',
            'server.console.read', 'server.console.write', 'server.files.read', 'server.files.write', 
            'server.settings', 'server.players.manage', 'server.backups.manage', 'users.manage'
        ],
        'MANAGER': [
            'server.view', 'server.start', 'server.stop', 'server.restart',
            'server.console.read', 'server.console.write', 'server.files.read', 'server.files.write', 
            'server.settings', 'server.players.manage', 'server.backups.manage'
        ],
        'VIEWER': [
            'server.view', 'server.console.read', 'server.files.read'
        ]
    };

    /**
     * Check if a user has a specific permission for a server
     * @param user User Profile
     * @param action Permission to check
     * @param serverId Target Server ID
     */
    /**
     * Check if a user has a specific permission for a server
     * Logic: Role Base -> ACL Allow -> ACL Deny (Deny wins)
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

        // 3. Per-Server ACL Overrides
        if (serverId && user.serverAcl && user.serverAcl[serverId]) {
            const acl = user.serverAcl[serverId];
            
            // Allow (Additive)
            if (acl.allow.includes(action)) {
                hasPermission = true;
            }

            // Deny (Subtractive - Wins)
            if (acl.deny.includes(action)) {
                hasPermission = false;
            }
        }
        
        // Backward Compatibility (Phase 5 Transition)
        // If no serverAcl but old permissions array exists (and logic didn't already enable it via Role)
        if (!hasPermission && serverId && user.permissions && user.permissions[serverId]) {
            if (user.permissions[serverId].includes(action)) {
                hasPermission = true;
            }
        }

        return hasPermission;
    }
}

export const permissionService = new PermissionService();
