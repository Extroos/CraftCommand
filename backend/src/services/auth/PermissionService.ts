import { UserProfile, Permission, UserRole } from '../../../../shared/types';

class PermissionService {
    
    // Define Permission Sets per Role
    private readonly ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
        'OWNER': [
            'server.view', 'server.start', 'server.stop', 'server.console', 
            'server.command', 'server.files.read', 'server.files.write', 
            'server.settings', 'users.manage'
        ],
        'ADMIN': [
            'server.view', 'server.start', 'server.stop', 'server.console', 
            'server.command', 'server.files.read', 'server.files.write', 
            'server.settings', 'users.manage'
        ],
        'MANAGER': [
            'server.view', 'server.start', 'server.stop', 'server.console', 
            'server.command', 'server.files.read', 'server.files.write', 
            'server.settings'
        ],
        'VIEWER': [
            'server.view', 'server.console', 'server.files.read'
        ]
    };

    /**
     * Check if a user has a specific permission for a server
     * @param user User Profile
     * @param action Permission to check
     * @param serverId Target Server ID
     */
    can(user: UserProfile, action: Permission, serverId?: string): boolean {
        // 1. Owner can do anything
        if (user.role === 'OWNER') return true;

        // 2. Check Role-based default permissions
        const rolePerms = this.ROLE_PERMISSIONS[user.role] || [];
        if (rolePerms.includes(action)) {
            // If the role has this permission globally, they generally have it.
            // BUT: Managers might be restricted to specific servers in future.
            // For now, Managers have full access to all servers.
            return true;
        }

        // 3. Per-Server Overrides (Explicit assignments)
        if (serverId && user.permissions && user.permissions[serverId]) {
            if (user.permissions[serverId].includes(action)) return true;
        }

        return false;
    }
}

export const permissionService = new PermissionService();
