import { useMemo } from 'react';
import { useUser } from '@features/auth/context/UserContext';
import { Permission, ROLE_PERMISSIONS } from '@shared/constants/roles';

/**
 * usePermissions Hook
 * Provides granular permission checking for the UI.
 * Rules:
 * 1. OWNER has all permissions.
 * 2. Base role permissions are applied.
 * 3. ACL Allow overrides are applied.
 * 4. ACL Deny overrides are applied (wins over allow).
 */
export const usePermissions = () => {
    const { user } = useUser();

    const can = useMemo(() => (action: Permission, serverId?: string): boolean => {
        if (!user) return false;

        // 1. Owner Hard Override
        if (user.role === 'OWNER') return true;

        let hasPermission = false;

        // 2. Base Role Permissions
        const rolePerms = ROLE_PERMISSIONS[user.role] || [];
        if (rolePerms.includes(action)) {
            hasPermission = true;
        }

        // 3. ACL Overrides
        const targetScope = serverId || 'global';
        if (user.serverAcl && user.serverAcl[targetScope]) {
            const acl = user.serverAcl[targetScope];
            
            // Allow
            if (acl.allow.includes(action)) {
                hasPermission = true;
            }

            // Deny (Wins)
            if (acl.deny.includes(action)) {
                return false;
            }
        }

        return hasPermission;
    }, [user]);

    const isRole = useMemo(() => (role: string) => user?.role === role, [user]);

    return {
        can,
        isRole,
        role: user?.role,
        permissions: user ? ROLE_PERMISSIONS[user.role] : []
    };
};
