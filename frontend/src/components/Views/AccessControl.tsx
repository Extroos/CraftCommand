import React, { useState, useEffect } from 'react';
import { UserProfile, Permission } from '@shared/types';
import { API } from '../../services/api';
import { useUser } from '../../context/UserContext';
import { Shield, User, Save, Check, X } from 'lucide-react';
import { useToast } from '../UI/Toast';

interface AccessControlProps {
    serverId: string;
}

// Define Permission Sets per Role (Mirrors backend PermissionService)
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
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

const PERMISSIONS: { id: Permission; label: string; description: string }[] = [
    { id: 'server.view', label: 'View Server', description: 'Can see the server in the list and view status.' },
    { id: 'server.start', label: 'Start Server', description: 'Can start the server.' },
    { id: 'server.stop', label: 'Stop Server', description: 'Can stop the server.' },
    { id: 'server.restart', label: 'Restart Server', description: 'Can restart the server.' },
    { id: 'server.console.read', label: 'View Console', description: 'Can view console/logs.' },
    { id: 'server.console.write', label: 'Send Commands', description: 'Can send commands to the console.' },
    { id: 'server.files.read', label: 'View Files', description: 'Can browse file manager.' },
    { id: 'server.files.write', label: 'Edit Files', description: 'Can upload, delete, and edit files.' },
    { id: 'server.players.manage', label: 'Manage Players', description: 'Can kick/ban players.' },
    { id: 'server.backups.manage', label: 'Manage Backups', description: 'Can create/restore/delete backups.' },
    { id: 'server.settings', label: 'Manage Settings', description: 'Can change server configuration.' },
];

const AccessControl: React.FC<AccessControlProps> = ({ serverId }) => {
    const { user: currentUser, token, isLoading: userLoading } = useUser();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const { addToast } = useToast();

    const ROLE_HIERARCHY: Record<string, number> = {
        'OWNER': 4,
        'ADMIN': 3,
        'MANAGER': 2,
        'VIEWER': 1
    };

    useEffect(() => {
        loadUsers();
    }, [serverId, currentUser]);

    const loadUsers = async () => {
        if (!currentUser || !token) {
            setIsLoading(false);
            return;
        }
        try {
            const data = await API.getUsers(token);
            
            // SECURITY FILTER: Only show users below the current user in hierarchy
            // Owners see everyone (except other Owners/self?) - usually Owners manage everyone.
            // Admins see Managers and Viewers.
            const filtered = data.filter(u => {
                if (currentUser.role === 'OWNER') return u.id !== currentUser.id;
                return ROLE_HIERARCHY[currentUser.role] > ROLE_HIERARCHY[u.role];
            });

            setUsers(filtered);
        } catch (e) {
            console.error("Failed to load users", e);
        } finally {
            setIsLoading(false);
        }
    };

    const togglePermission = async (targetUser: UserProfile, perm: Permission, scope: string = serverId) => {
        // Hierarchy Check
        const canManage = ROLE_HIERARCHY[currentUser?.role || ''] > ROLE_HIERARCHY[targetUser.role];
        if (!canManage && currentUser?.role !== 'OWNER') {
            addToast('error', 'Permissions', `You do not have permission to manage ${targetUser.role} accounts.`);
            return;
        }

        const isGrantedByRole = ROLE_PERMISSIONS[targetUser.role]?.includes(perm);
        const currentAcl = targetUser.serverAcl?.[scope] || { allow: [], deny: [] };
        
        let newAllow = [...currentAcl.allow];
        let newDeny = [...currentAcl.deny];

        if (isGrantedByRole) {
            const isDenied = currentAcl.deny.includes(perm);
            if (isDenied) newDeny = newDeny.filter(p => p !== perm);
            else newDeny = [...newDeny, perm];
        } else {
            const isAllowed = currentAcl.allow.includes(perm);
            if (isAllowed) newAllow = newAllow.filter(p => p !== perm);
            else newAllow = [...newAllow, perm];
        }

        const updatedUser = {
            ...targetUser,
            serverAcl: {
                ...(targetUser.serverAcl || {}),
                [scope]: { allow: newAllow, deny: newDeny }
            }
        };

        const updatedUsers = users.map(u => u.id === targetUser.id ? updatedUser : u);
        setUsers(updatedUsers);

        setSaving(targetUser.id);
        if (!token) return;
        try {
            await API.updateUserAdmin(targetUser.id, { 
                serverAcl: { 
                    [scope]: { allow: newAllow, deny: newDeny } 
                } 
            }, token);
            addToast('success', 'Access Control', `Updated ${scope === 'global' ? 'Global' : 'Server'} overrides for ${targetUser.username}.`);
        } catch (e: any) {
            console.error("Failed to save permission change", e);
            addToast('error', 'Permissions', e.message || 'Failed to save changes');
            loadUsers();
        } finally {
            setSaving(null);
        }
    };

    if (isLoading) {
        return (
            <div className="h-48 flex items-center justify-center text-muted-foreground animate-pulse">
                Loading Security Clearance...
            </div>
        );
    }

    if (users.length === 0) {
        return (
            <div className="h-64 flex flex-col items-center justify-center text-center space-y-4 bg-secondary/10 rounded-2xl border border-dashed border-border p-8">
                <div className="p-4 bg-secondary/20 rounded-full text-muted-foreground">
                    <Shield size={32} />
                </div>
                <div>
                    <h3 className="text-lg font-semibold">No Manageable Users</h3>
                    <p className="text-sm text-muted-foreground max-w-xs">
                        There are no users with a lower hierarchy than you available for management.
                    </p>
                </div>
            </div>
        );
    }

    const SYSTEM_PERMISSIONS: { id: Permission, label: string }[] = [
        { id: 'users.manage', label: 'User Management' },
        { id: 'server.create', label: 'Server Provisioning' },
        { id: 'server.delete', label: 'Server Destruction' },
        { id: 'system.remote_access.manage', label: 'Remote Access / SSL' }
    ];

    return (
        <div className="h-full flex flex-col space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">Access Control</h2>
                    <p className="text-muted-foreground">Manage hierarchical permissions for this server.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {users.map((u) => {
                    const hasAlias = !!u.customRoleName;
                    return (
                        <div key={u.id} className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
                            <div className="p-5 border-b border-border bg-secondary/10 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-xl bg-background border border-border overflow-hidden flex items-center justify-center text-muted-foreground shadow-inner ring-4 ring-secondary/20">
                                        {u.avatarUrl ? <img src={u.avatarUrl} className="w-full h-full object-cover" /> : <User size={24} />}
                                    </div>
                                    <div>
                                        <div className="font-bold text-base flex items-center gap-2">
                                            {u.username}
                                            {u.role === 'ADMIN' && <Shield size={12} className="text-primary opacity-50" />}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <div className={`text-[9px] uppercase font-black tracking-widest px-2 py-0.5 rounded-full ${hasAlias ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground/60'}`}>
                                                {u.customRoleName || u.role}
                                            </div>
                                            {hasAlias && (
                                                <span className="text-[8px] uppercase font-bold text-muted-foreground/40">({u.role})</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-5 flex-1 space-y-4 overflow-y-auto max-h-[500px] scrollbar-thin">
                                {/* Global System Permissions */}
                                <div className="space-y-1.5">
                                    <div className="text-[10px] uppercase font-bold text-primary/60 mb-2 ml-1 tracking-tighter flex items-center gap-2">
                                        <Shield size={10} /> Global System Rights
                                    </div>
                                    <div className="grid gap-1">
                                        {SYSTEM_PERMISSIONS.map((perm) => {
                                            const isGrantedByRole = ROLE_PERMISSIONS[u.role]?.includes(perm.id);
                                            const isExplicitlyAllowed = u.serverAcl?.['global']?.allow.includes(perm.id);
                                            const isExplicitlyDenied = u.serverAcl?.['global']?.deny.includes(perm.id);
                                            const hasPerm = (isGrantedByRole && !isExplicitlyDenied) || isExplicitlyAllowed;

                                            return (
                                                <button
                                                    key={perm.id}
                                                    onClick={() => togglePermission(u, perm.id, 'global')}
                                                    disabled={saving === u.id}
                                                    className={`w-full flex items-center justify-between px-3 py-1.5 text-[10px] rounded-lg transition-all border ${
                                                        hasPerm 
                                                        ? isExplicitlyAllowed ? 'bg-primary/10 text-primary border-primary/20' : 'bg-secondary/50 text-foreground border-transparent'
                                                        : isExplicitlyDenied ? 'bg-red-500/5 text-red-500/60 border-red-500/10' : 'text-muted-foreground border-transparent'
                                                    }`}
                                                >
                                                    <span className="font-semibold">{perm.label}</span>
                                                    <div className="flex items-center gap-2">
                                                        {isExplicitlyDenied && <span className="text-[7px] font-bold uppercase opacity-60">Denied</span>}
                                                        {isExplicitlyAllowed && <span className="text-[7px] font-bold uppercase opacity-60">Grant</span>}
                                                        <div className={`h-1.5 w-1.5 rounded-full ${hasPerm ? 'bg-primary' : 'bg-muted'}`} />
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Server Specific Permissions */}
                                <div className="space-y-1.5">
                                    <div className="text-[10px] uppercase font-bold text-muted-foreground/40 mb-2 ml-1 tracking-tighter flex items-center gap-2">
                                        Server Instance Rights ({serverId.split('-')[0]}...)
                                    </div>
                                    <div className="grid gap-1">
                                        {PERMISSIONS.map((perm) => {
                                            const isGrantedByRole = ROLE_PERMISSIONS[u.role]?.includes(perm.id);
                                            const isExplicitlyAllowed = u.serverAcl?.[serverId]?.allow.includes(perm.id);
                                            const isExplicitlyDenied = u.serverAcl?.[serverId]?.deny.includes(perm.id);
                                            const hasPerm = (isGrantedByRole && !isExplicitlyDenied) || isExplicitlyAllowed;

                                            return (
                                                <button
                                                    key={perm.id}
                                                    onClick={() => togglePermission(u, perm.id, serverId)}
                                                    disabled={saving === u.id}
                                                    className={`w-full flex items-center justify-between px-3.5 py-2 text-xs rounded-xl transition-all duration-200 group border ${
                                                        hasPerm 
                                                        ? isExplicitlyAllowed ? 'bg-primary/10 text-primary border-primary/20 shadow-sm shadow-primary/5' : 'bg-primary/5 text-primary/80 border-transparent' 
                                                        : isExplicitlyDenied ? 'bg-red-500/5 text-red-500/60 border-red-500/10' : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground border-transparent'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`flex items-center justify-center h-4.5 w-4.5 rounded-lg transition-all ${
                                                            hasPerm 
                                                            ? isExplicitlyAllowed ? 'bg-primary text-primary-foreground' : 'bg-primary/30 text-primary' 
                                                            : isExplicitlyDenied ? 'bg-red-500/20 text-red-500' : 'bg-secondary text-muted-foreground/30 group-hover:bg-secondary/80'
                                                        }`}>
                                                            {hasPerm ? <Check size={11} strokeWidth={3} /> : <X size={9} strokeWidth={3} />}
                                                        </div>
                                                        <div className="flex flex-col items-start leading-tight">
                                                            <span className="font-semibold">{perm.label}</span>
                                                            {isExplicitlyDenied && <span className="text-[8px] font-bold uppercase opacity-60">Restricted</span>}
                                                            {isExplicitlyAllowed && <span className="text-[8px] font-bold uppercase opacity-60">Granted</span>}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="px-5 py-3 border-t border-border bg-secondary/5 flex items-center justify-between text-[10px] text-muted-foreground/50">
                                 <span>ID: {u.id.split('-')[0]}...</span>
                                 {saving === u.id && <div className="flex items-center gap-2 text-primary animate-pulse font-bold">SYNCING...</div>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default AccessControl;
