import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useUser } from '../../context/UserContext';
import { API } from '../../services/api';
import { UserProfile, UserRole } from '@shared/types';
import { Trash2, Shield, User, UserPlus, Save, X } from 'lucide-react';
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
        role: 'VIEWER' as UserRole
    });

    useEffect(() => {
        if (user?.role === 'OWNER' || user?.role === 'ADMIN') {
            loadUsers();
        }
    }, [user]);

    const loadUsers = async () => {
        if (!token) return;
        try {
            const list = await API.getUsers(token);
            setUsers(list);
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
            setNewUser({ email: '', username: '', password: '', role: 'VIEWER' });
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
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
                        <User className={theme.text} /> User Management
                    </h2>
                    <p className="text-muted-foreground text-xs font-mono uppercase tracking-wider mt-1">
                        Manage backend access {users.length > 0 && `(${users.length})`}
                    </p>
                </div>
                <button 
                    onClick={() => setIsCreating(true)}
                    className={`${theme.bg} text-foreground px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-opacity flex items-center gap-2`}
                >
                    <UserPlus size={14} /> New User
                </button>
            </div>

            {/* Create Modal */}
            {isCreating && (
                <div className="bg-card border border-[rgb(var(--color-border-subtle))] rounded-xl p-6 mb-6">
                    <div className="flex justify-between mb-4">
                        <h3 className="text-sm font-bold uppercase text-[rgb(var(--color-fg-secondary))]">Create New User</h3>
                        <button onClick={() => setIsCreating(false)}><X size={16} className="text-muted-foreground hover:text-foreground" /></button>
                    </div>
                    <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input 
                            placeholder="Email" 
                            required 
                            className="bg-black/40 border border-[rgb(var(--color-border-subtle))] rounded p-2 text-sm text-foreground"
                            value={newUser.email}
                            onChange={e => setNewUser({...newUser, email: e.target.value})}
                        />
                        <input 
                            placeholder="Username" 
                            required 
                            className="bg-black/40 border border-[rgb(var(--color-border-subtle))] rounded p-2 text-sm text-foreground"
                            value={newUser.username}
                            onChange={e => setNewUser({...newUser, username: e.target.value})}
                        />
                        <input 
                            type="password"
                            placeholder="Password" 
                            required 
                            className="bg-black/40 border border-[rgb(var(--color-border-subtle))] rounded p-2 text-sm text-foreground"
                            value={newUser.password}
                            onChange={e => setNewUser({...newUser, password: e.target.value})}
                        />
                        <select 
                            className="bg-black/40 border border-[rgb(var(--color-border-subtle))] rounded p-2 text-sm text-foreground uppercase"
                            value={newUser.role}
                            onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})}
                        >
                            <option value="VIEWER">Viewer</option>
                            <option value="MANAGER">Manager</option>
                            <option value="ADMIN">Admin</option>
                        </select>
                        <button type="submit" className={`${theme.bg} text-foreground p-2 rounded col-span-2 text-xs font-bold uppercase`}>Create User</button>
                    </form>
                </div>
            )}

            <div className="grid gap-3">
                {users.map(u => (
                    <motion.div 
                        layout 
                        key={u.id} 
                        className="bg-background/60 border border-[rgb(var(--color-border-subtle))] rounded-xl p-4 flex items-center justify-between"
                    >
                        <div className="flex items-center gap-4">
                            <img src={u.avatarUrl || '/default-avatar.png'} alt="av" className="w-10 h-10 rounded-full border border-[rgb(var(--color-border-default))]" />
                            <div>
                                <div className="text-sm font-bold text-foreground relative">
                                    {u.username}
                                    {u.id === user.id && <span className={`ml-2 text-[8px] ${theme.bg} text-black px-1.5 py-0.5 rounded-full`}>YOU</span>}
                                </div>
                                <div className="text-xs text-muted-foreground">{u.email}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 h-full">
                            <span className={`text-[9px] font-mono border border-[rgb(var(--color-border-default))] px-2 py-1 rounded uppercase ${u.role === 'OWNER' ? 'text-amber-500 border-amber-500/20' : 'text-muted-foreground'}`}>
                                {u.role}
                            </span>
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
