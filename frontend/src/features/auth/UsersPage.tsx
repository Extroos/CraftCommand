import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConfirm } from '../ui/hooks/useConfirm';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useUser } from '@features/auth/context/UserContext';
import { API } from '@core/services/api';
import { UserProfile, UserRole } from '@shared/types';
import { Trash2, Shield, User, UserPlus, Save, X, Mail, Lock, Users as UsersIcon } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { usePermissions } from './hooks/usePermissions';
import AccessDenied from './components/AccessDenied';

const UsersPage: React.FC = () => {
    const { user, token, theme, isLoading } = useUser();
    const { addToast } = useToast();
    const { can } = usePermissions();
    const canManageUsers = can('users.manage');
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const { isOpen: isConfirmOpen, config: confirmConfig, confirm: requestConfirm, handleConfirm, handleCancel } = useConfirm();

    // New User State
    const [newUser, setNewUser] = useState({
        email: '',
        username: '',
        password: '',
        role: 'VIEWER' as UserRole,
        customRoleName: ''
    });

    useEffect(() => {
        if (canManageUsers) {
            loadUsers();
        }
    }, [canManageUsers]);

    const loadUsers = async () => {
        if (!token || !user) return;
        try {
            const list = await API.getUsers();
            
            const ROLE_HIERARCHY: Record<string, number> = {
                'OWNER': 3,
                'ADMIN': 2,
                'MANAGER': 1,
                'VIEWER': 0
            };

            const filtered = list.filter(u => {
                if (user.role === 'OWNER') return u.id !== user.id;
                return ROLE_HIERARCHY[user.role] > ROLE_HIERARCHY[u.role];
            });

            setUsers(filtered);
        } catch (e) {
            addToast('error', 'Failed to load users');
        } finally {
            setIsLoadingUsers(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;
        
        if (!canManageUsers) {
            addToast('error', 'Access Denied', 'You do not have permission to create users.');
            return;
        }

        try {
            await API.createUser(newUser);
            addToast('success', 'User created');
            setIsCreating(false);
            setNewUser({ email: '', username: '', password: '', role: 'VIEWER', customRoleName: '' });
            loadUsers();
        } catch (err: any) {
            addToast('error', err.response?.data?.error || 'Create failed');
        }
    };

    const handleDelete = async (id: string) => {
        const isConfirmed = await requestConfirm({
            title: 'Delete User',
            description: 'Are you sure you want to delete this user? This action cannot be undone.',
            confirmText: 'Delete User',
            cancelText: 'Cancel'
        });
        if (!isConfirmed) return;
        if (!token) return;

        if (!canManageUsers) {
            addToast('error', 'Access Denied', 'You do not have permission to delete users.');
            return;
        }

        try {
            await API.deleteUser(id);
            addToast('success', 'User deleted');
            loadUsers();
        } catch (err: any) {
            addToast('error', 'Delete failed');
        }
    };

    const handleUpdateAlias = async (userId: string, alias: string) => {
        if (!token) return;

        if (!canManageUsers) {
            addToast('error', 'Access Denied', 'You do not have permission to update users.');
            return;
        }

        try {
            await API.updateUserAdmin(userId, { customRoleName: alias });
            addToast('success', 'Alias updated');
            loadUsers();
        } catch (e) {
            addToast('error', 'Failed to update alias');
        }
    };

    // Loading guard
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading...</p>
                </div>
            </div>
        );
    }

    if (!canManageUsers) {
        return (
            <AccessDenied 
                title="Personnel Management Restricted"
                description="You do not have the required permissions to manage system users. Please contact the system owner for elevation."
            />
        );
    }

    return (
        <div className="space-y-6 max-w-[1200px] mx-auto animate-in fade-in duration-500 pb-12">
            {/* --- HEADER --- */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${user?.preferences?.visualQuality ? 'bg-primary/10 border border-primary/20' : 'bg-primary text-primary-foreground'}`}>
                            <User size={18} />
                        </div>
                        <div>
                            <h2 className="text-base font-black tracking-tight text-foreground uppercase leading-none">
                                User Management
                            </h2>
                            <p className="text-muted-foreground text-[10px] font-mono uppercase tracking-widest mt-1 opacity-60">
                                Configure system access and administrative roles
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                     {users.length > 0 && (
                        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-muted/20 border border-border/50 rounded-lg text-[10px] font-bold text-muted-foreground/60">
                             TOTAL USERS: <span className="text-foreground">{users.length}</span>
                        </div>
                     )}
                    <button 
                        onClick={() => setIsCreating(true)}
                        className={`flex-1 md:flex-none ${theme.bg} text-foreground px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/10`}
                    >
                        <UserPlus size={14} /> Add New User
                    </button>
                </div>
            </div>

            {/* --- ADD USER MODAL --- */}
            <AnimatePresence>
                {isCreating && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsCreating(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-md"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className={`relative w-full max-w-xl cc-card p-0 shadow-2xl overflow-hidden ${user?.preferences?.visualQuality ? 'glass-morphism' : ''}`}
                        >
                            <div className="px-6 py-4 border-b border-border/40 bg-muted/10 flex justify-between items-center">
                                <h3 className="text-sm font-black uppercase tracking-tight text-foreground">Add New User</h3>
                                <button onClick={() => setIsCreating(false)} className="p-1 hover:bg-white/5 rounded transition-colors">
                                    <X size={18} className="text-muted-foreground hover:text-foreground" />
                                </button>
                            </div>

                            <form onSubmit={handleCreate} className="p-6 space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    {/* Email Field */}
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Email Address</label>
                                        <input 
                                            placeholder="user@domain.com" 
                                            required 
                                            className="w-full bg-black/20 border border-border/60 rounded-lg py-2 px-4 text-xs text-foreground focus:border-primary/50 outline-none transition-all"
                                            value={newUser.email}
                                            onChange={e => setNewUser({...newUser, email: e.target.value})}
                                        />
                                    </div>

                                    {/* Username Field */}
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Username</label>
                                        <input 
                                            placeholder="admin" 
                                            required 
                                            className="w-full bg-black/20 border border-border/60 rounded-lg py-2 px-4 text-xs text-foreground focus:border-primary/50 outline-none transition-all"
                                            value={newUser.username}
                                            onChange={e => setNewUser({...newUser, username: e.target.value})}
                                        />
                                    </div>

                                    {/* Password Field */}
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Password</label>
                                        <input 
                                            type="password"
                                            placeholder="••••••••" 
                                            required 
                                            className="w-full bg-black/20 border border-border/60 rounded-lg py-2 px-4 text-xs text-foreground focus:border-primary/50 outline-none transition-all"
                                            value={newUser.password}
                                            onChange={e => setNewUser({...newUser, password: e.target.value})}
                                        />
                                    </div>

                                    {/* Role Selection */}
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Security Role</label>
                                        <div className="relative">
                                            <select 
                                                className="w-full bg-black/20 border border-border/60 rounded-lg py-2 px-4 text-xs text-foreground uppercase cursor-pointer focus:border-primary/50 outline-none transition-all appearance-none"
                                                value={newUser.role}
                                                onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})}
                                            >
                                                <option value="VIEWER">Viewer</option>
                                                <option value="MANAGER">Manager</option>
                                                <option value="ADMIN">Administrator</option>
                                            </select>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                                                <Shield size={12} />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Role Alias (Optional)</label>
                                    <input 
                                        placeholder="e.g. Lead Moderator, Staff" 
                                        className="w-full bg-black/20 border border-border/60 rounded-lg py-2 px-4 text-xs text-foreground focus:border-primary/50 outline-none transition-all"
                                        value={newUser.customRoleName}
                                        onChange={e => setNewUser({...newUser, customRoleName: e.target.value})}
                                    />
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button type="button" onClick={() => setIsCreating(false)} className="flex-1 px-4 py-2.5 rounded-lg border border-border/60 text-[10px] font-bold uppercase tracking-widest hover:bg-white/5 transition-all text-muted-foreground">
                                        Cancel
                                    </button>
                                    <button type="submit" className={`flex-[2] ${theme.bg} text-foreground py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2`}>
                                        <Save size={14} /> Create User Account
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* --- USER DIRECTORY --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {users.length === 0 && !isLoadingUsers && (
                    <div className="col-span-full cc-card p-20 flex flex-col items-center justify-center text-center opacity-40">
                        <UsersIcon size={48} className="mb-4 stroke-[1px]" />
                        <p className="text-sm font-bold uppercase tracking-tight">No Personnel Detected</p>
                        <p className="text-[10px] font-mono mt-1 uppercase">Ready for system provisioning</p>
                    </div>
                )}

                {users.map((u, i) => (
                    <motion.div 
                        layout 
                        key={u.id} 
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className={`cc-card p-4 flex flex-col gap-4 border-border/40 hover:border-primary/20 transition-all group relative ${user?.preferences?.visualQuality ? 'glass-morphism' : ''}`}
                    >
                        {/* Top: Avatar & Action */}
                        <div className="flex justify-between items-start">
                            <div className="relative">
                                <img src={u.avatarUrl || '/default-avatar.png'} alt="av" className="w-12 h-12 rounded-xl border border-border/40 object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all shadow-inner" />
                                <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-background ${u.role === 'OWNER' ? 'bg-amber-500' : 'bg-primary/40'}`}></div>
                            </div>
                            
                            {u.role !== 'OWNER' && (
                                <button 
                                    onClick={() => handleDelete(u.id)}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/5 text-muted-foreground/30 hover:text-red-500 hover:bg-red-500/10 transition-all"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>

                        {/* Middle: User Info */}
                        <div className="min-w-0">
                            <div className="text-[14px] font-black text-foreground flex items-center gap-2 truncate">
                                {u.username}
                                {u.id === user.id && <span className={`text-[7px] font-black ${theme.bg} text-black px-1.5 py-0.5 rounded-full tracking-tighter`}>ME</span>}
                            </div>
                            <div className="mt-2 space-y-1">
                                <div className="flex items-center gap-2">
                                    <div className={`text-[9px] font-bold border px-1.5 py-0.5 rounded uppercase tracking-tighter ${
                                        u.role === 'OWNER' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 
                                        u.role === 'ADMIN' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                        'bg-muted/30 text-muted-foreground/50 border-border'
                                    }`}>
                                        {u.customRoleName || u.role}
                                    </div>
                                </div>
                                <div className="text-[10px] font-medium text-muted-foreground/40 lowercase truncate font-mono">
                                    {u.email}
                                </div>
                            </div>
                        </div>

                        {/* Bottom: Admin Control */}
                        {user.role === 'OWNER' && u.role !== 'OWNER' && (
                            <div className="pt-3 border-t border-border/20 mt-auto">
                                <span className="text-[8px] font-bold text-muted-foreground/30 uppercase tracking-[0.1em] block mb-1.5">User Alias</span>
                                <input 
                                    defaultValue={u.customRoleName || ''}
                                    onBlur={(e) => handleUpdateAlias(u.id, e.target.value)}
                                    placeholder="Set custom role..."
                                    className="bg-black/20 border border-border/40 rounded-lg px-3 py-1.5 text-[10px] text-foreground focus:border-primary/50 outline-none w-full placeholder:opacity-20 transition-all font-mono"
                                />
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>

            <ConfirmDialog 
                isOpen={isConfirmOpen}
                {...confirmConfig}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
            />
        </div>
    );
};

export default UsersPage;
