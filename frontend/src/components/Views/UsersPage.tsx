import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useUser } from '../../context/UserContext';
import { API } from '../../services/api';
import { UserProfile, UserRole } from '@shared/types';
import { Trash2, Shield, User, UserPlus, Save, X, Mail, Lock } from 'lucide-react';
import { useToast } from '../UI/Toast';

const UsersPage: React.FC = () => {
    const { user, token, theme, isLoading } = useUser();
    const { addToast } = useToast();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    // New User State
    const [newUser, setNewUser] = useState({
        email: '',
        username: '',
        password: '',
        role: 'VIEWER' as UserRole,
        customRoleName: ''
    });

    useEffect(() => {
        if (user?.role === 'OWNER' || user?.role === 'ADMIN') {
            loadUsers();
        }
    }, [user]);

    const loadUsers = async () => {
        if (!token || !user) return;
        try {
            const list = await API.getUsers(token);
            
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
        try {
            await API.createUser(newUser, token);
            addToast('success', 'User created');
            setIsCreating(false);
            setNewUser({ email: '', username: '', password: '', role: 'VIEWER', customRoleName: '' });
            loadUsers();
        } catch (err: any) {
            addToast('error', err.response?.data?.error || 'Create failed');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this user?')) return;
        if (!token) return;
        try {
            await API.deleteUser(id, token);
            addToast('success', 'User deleted');
            loadUsers();
        } catch (err: any) {
            addToast('error', 'Delete failed');
        }
    };

    const handleUpdateAlias = async (userId: string, alias: string) => {
        if (!token) return;
        try {
            await API.updateUserAdmin(userId, { customRoleName: alias }, token);
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

    if (!user || (user.role !== 'OWNER' && user.role !== 'ADMIN')) {
        return <div className="p-10 text-center text-red-500 font-mono">ACCESS DENIED</div>;
    }

    return (
        <div className="space-y-4 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-black tracking-tight text-foreground flex items-center gap-2 uppercase">
                        <User size={16} className={theme.text} /> Management
                    </h2>
                    <p className="text-muted-foreground text-[10px] font-mono uppercase tracking-wider mt-0.5 opacity-60">
                        Staff & Role Personalization {users.length > 0 && `(${users.length})`}
                    </p>
                </div>
                <button 
                    onClick={() => setIsCreating(true)}
                    className={`${theme.bg} text-foreground px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity flex items-center gap-2 shadow-lg`}
                >
                    <UserPlus size={12} /> Provision User
                </button>
            </div>

            {/* Create Modal */}
            {isCreating && (
                <div className="bg-card border border-[rgb(var(--color-border-subtle))] rounded-xl p-6 mb-4 shadow-xl ring-1 ring-primary/5">
                    <div className="flex justify-between mb-6">
                        <h3 className="text-sm font-black uppercase tracking-tighter text-foreground">Personnel Provisioning</h3>
                        <button onClick={() => setIsCreating(false)}><X size={16} className="text-muted-foreground hover:text-foreground" /></button>
                    </div>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Email Address</label>
                                <div className="relative group/input">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within/input:text-primary transition-colors">
                                        <Mail size={14} />
                                    </div>
                                    <input 
                                        placeholder="admin@craftcommands.io" 
                                        required 
                                        className="w-full bg-black/40 border border-[rgb(var(--color-border-subtle))] rounded-md py-2 pl-9 pr-3 text-xs text-foreground focus:border-primary/50 outline-none transition-all"
                                        value={newUser.email}
                                        onChange={e => setNewUser({...newUser, email: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Username</label>
                                <div className="relative group/input">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within/input:text-primary transition-colors">
                                        <User size={14} />
                                    </div>
                                    <input 
                                        placeholder="admin" 
                                        required 
                                        className="w-full bg-black/40 border border-[rgb(var(--color-border-subtle))] rounded-md py-2 pl-9 pr-3 text-xs text-foreground focus:border-primary/50 outline-none transition-all"
                                        value={newUser.username}
                                        onChange={e => setNewUser({...newUser, username: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Password Key</label>
                                <div className="relative group/input">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within/input:text-primary transition-colors">
                                        <Lock size={14} />
                                    </div>
                                    <input 
                                        type="password"
                                        placeholder="••••••••" 
                                        required 
                                        className="w-full bg-black/40 border border-[rgb(var(--color-border-subtle))] rounded-md py-2 pl-9 pr-3 text-xs text-foreground focus:border-primary/50 outline-none transition-all"
                                        value={newUser.password}
                                        onChange={e => setNewUser({...newUser, password: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Security Level (Role)</label>
                                <div className="relative group/input">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within/input:text-primary transition-colors pointer-events-none">
                                        <Shield size={14} />
                                    </div>
                                    <select 
                                        className="w-full bg-black/40 border border-[rgb(var(--color-border-subtle))] rounded-md py-2 pl-9 pr-3 text-xs text-foreground uppercase cursor-pointer focus:border-primary/50 outline-none transition-all appearance-none"
                                        value={newUser.role}
                                        onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})}
                                    >
                                        <option value="VIEWER">Viewer</option>
                                        <option value="MANAGER">Manager</option>
                                        <option value="ADMIN">Admin</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Custom Role Name (Alias)</label>
                            <div className="relative group/input">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within/input:text-primary transition-colors">
                                    <Shield size={14} />
                                </div>
                                <input 
                                    placeholder="e.g. Head Moderator, Event Specialist" 
                                    className="w-full bg-black/40 border border-[rgb(var(--color-border-subtle))] rounded-md py-2 pl-9 pr-3 text-xs text-foreground focus:border-primary/50 outline-none transition-all"
                                    value={newUser.customRoleName}
                                    onChange={e => setNewUser({...newUser, customRoleName: e.target.value})}
                                />
                            </div>
                        </div>

                        <button type="submit" className={`${theme.bg} text-foreground py-3 rounded-md w-full text-[10px] font-black uppercase tracking-widest shadow-lg hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2 mt-2`}>
                           <Save size={12} /> Confirm Provisioning
                        </button>
                    </form>
                </div>
            )}

            <div className="grid gap-3">
                {users.map(u => (
                    <motion.div 
                        layout 
                        key={u.id} 
                        className="bg-background/60 border border-[rgb(var(--color-border-subtle))] rounded-xl p-3 flex items-center justify-between hover:border-primary/20 transition-all group"
                    >
                        <div className="flex items-center gap-4">
                            <img src={u.avatarUrl || '/default-avatar.png'} alt="av" className="w-10 h-10 rounded-xl border border-[rgb(var(--color-border-default))] shadow-inner" />
                            <div>
                                <div className="text-xs font-black text-foreground relative flex items-center gap-2">
                                    {u.username}
                                    {u.id === user.id && <span className={`text-[7px] ${theme.bg} text-black px-1.5 py-0.5 rounded-full`}>YOU</span>}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    <div className={`text-[8px] font-mono border border-[rgb(var(--color-border-default))] px-2 py-0.5 rounded uppercase ${u.role === 'OWNER' ? 'text-amber-500 border-amber-500/20' : 'text-muted-foreground opacity-60'}`}>
                                        {u.customRoleName ? (
                                            <span className="flex items-center gap-1">
                                                <span className="text-primary font-bold">{u.customRoleName}</span>
                                                <span className="opacity-30 italic">({u.role})</span>
                                            </span>
                                        ) : u.role}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground leading-none opacity-40">{u.email}</div>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 h-full">
                            {user.role === 'OWNER' && u.role !== 'OWNER' && (
                                <input 
                                    defaultValue={u.customRoleName || ''}
                                    onBlur={(e) => handleUpdateAlias(u.id, e.target.value)}
                                    placeholder="Set Alias"
                                    className="bg-transparent border-none text-[9px] text-right text-muted-foreground focus:text-primary focus:outline-none opacity-0 group-hover:opacity-100 transition-opacity w-24"
                                />
                            )}
                            {u.role !== 'OWNER' && (
                                <button 
                                    onClick={() => handleDelete(u.id)}
                                    className="text-[rgb(var(--color-fg-subtle))] hover:text-red-500 transition-colors p-2"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};

export default UsersPage;
