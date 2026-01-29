import React, { useState, useEffect } from 'react';
import { UserProfile, Permission } from '@shared/types';
import { API } from '../../services/api';
import { useUser } from '../../context/UserContext';
import { Shield, User, Save, Check, X } from 'lucide-react';
import { useToast } from '../UI/Toast';

interface AccessControlProps {
    serverId: string;
}

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

    useEffect(() => {
        loadUsers();
    }, [serverId]);

    const loadUsers = async () => {
        if (!currentUser || !token) {
            setIsLoading(false);
            return;
        }
        try {
            const data = await API.getUsers(token);
            // Filter out OWNER as they have full access anyway, or show them as locked?
            // Let's show all except self if not OWNER, but realistically OWNER manages this.
            setUsers(data);
        } catch (e) {
            console.error("Failed to load users", e);
        } finally {
            setIsLoading(false);
        }
    };

    const togglePermission = async (targetUser: UserProfile, perm: Permission) => {
        // Optimistic update
        const currentPerms = targetUser.permissions?.[serverId] || [];
        const hasPerm = currentPerms.includes(perm);
        
        // Don't allow editing OWNER permissions (they have all)
        if (targetUser.role === 'OWNER') return;

        let newPerms: Permission[];
        if (hasPerm) {
            newPerms = currentPerms.filter(p => p !== perm) as Permission[];
        } else {
            newPerms = [...currentPerms, perm];
        }

        const updatedUser = {
            ...targetUser,
            permissions: {
                ...targetUser.permissions,
                [serverId]: newPerms
            }
        };

        const updatedUsers = users.map(u => u.id === targetUser.id ? updatedUser : u);
        setUsers(updatedUsers);

        // Sync to backend
        setSaving(targetUser.id);
        if (!token) return; // Should not happen if user is logged in, but good for type safety
        try {
            await API.updateUserAdmin(targetUser.id, { permissions: updatedUser.permissions }, token);
            addToast('success', 'Access Control', `Updated permissions for ${targetUser.username}.`);
        } catch (e) {
            console.error("Failed to save permission change", e);
            addToast('error', 'Permissions', 'Failed to save changes');
            // Revert optimistic update on failure
            setUsers(users);
        } finally {
            setSaving(null);
        }
    };
    

    return (
        <div className="h-full flex flex-col space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Access Control</h2>
                    <p className="text-muted-foreground">Manage user permissions for this specific server.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {users.map((u) => (
                    <div key={u.id} className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-border bg-secondary/30 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-secondary border border-border overflow-hidden flex items-center justify-center text-muted-foreground">
                                    {u.avatarUrl ? <img src={u.avatarUrl} className="w-full h-full object-cover" /> : <User size={20} />}
                                </div>
                                <div>
                                    <div className="font-semibold">{u.username}</div>
                                    <div className="text-xs text-muted-foreground">{u.role}</div>
                                </div>
                            </div>
                            {u.role === 'OWNER' && <Shield size={16} className="text-amber-500" />}
                        </div>
                        
                        <div className="p-4 flex-1 space-y-1">
                            {u.role === 'OWNER' ? (
                                <div className="text-sm text-muted-foreground italic p-2">
                                    Owner has full access to all servers.
                                </div>
                            ) : (
                                PERMISSIONS.map((perm) => {
                                    const hasPerm = u.permissions?.[serverId]?.includes(perm.id);
                                    return (
                                        <button
                                            key={perm.id}
                                            onClick={() => togglePermission(u, perm.id)}
                                            className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${
                                                hasPerm 
                                                ? 'bg-primary/10 text-primary hover:bg-primary/20' 
                                                : 'text-muted-foreground hover:bg-secondary'
                                            }`}
                                        >
                                            <span className="flex items-center gap-2">
                                                {hasPerm ? <Check size={14} /> : <X size={14} className="opacity-50" />}
                                                {perm.label}
                                            </span>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AccessControl;
