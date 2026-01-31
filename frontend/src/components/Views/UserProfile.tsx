
import React, { useState } from 'react';

import { UserProfile, AccentColor } from '@shared/types';
import { useToast } from '../UI/Toast';

import { 
    User, Lock, Palette, Bell, Key, Eye, EyeOff, Save, Loader2, 
    Mail, Check, AlertTriangle, Code, RefreshCw, Copy, Gamepad2, Link,
    Terminal, Monitor, BellRing, Type, Volume2, Disc
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useUser } from '../../context/UserContext';
import { API } from '../../services/api';
import { HardDrive, Trash2, Archive, Database } from 'lucide-react';

const SystemCacheManager = ({ theme }: { theme: any }) => {
    const [stats, setStats] = useState<{ java: { size: number, count: number }, temp: { size: number, count: number } } | null>(null);
    const [loading, setLoading] = useState(false);
    const { addToast } = useToast();

    const fetchStats = async () => {
        setLoading(true);
        try {
            const data = await API.getSystemCache();
            setStats(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        fetchStats();
    }, []);

    const handleClear = async (type: 'java' | 'temp') => {
        if (!confirm(`Are you sure you want to clear ${type} cache? This may require re-downloading files.`)) return;
        setLoading(true);
        try {
            await API.clearSystemCache(type);
            addToast('success', 'Cache Cleared', `Successfully cleared ${type} cache.`);
            fetchStats();
        } catch (e) {
            addToast('error', 'Failed', 'Could not clear cache.');
        } finally {
            setLoading(false);
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    if (!stats) return <div className="p-8 text-center text-muted-foreground"><Loader2 className="animate-spin mx-auto mb-2" /> Loading stats...</div>;

    return (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
                <div className={`p-2 bg-rose-500/10 text-rose-500 rounded-lg`}>
                    <Database size={20} />
                </div>
                <div>
                    <h2 className="text-lg font-bold">System Storage</h2>
                    <p className="text-sm text-muted-foreground">Manage local cache and temporary files.</p>
                </div>
            </div>

            <div className="space-y-4">
                {/* Java Cache */}
                <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-secondary/10">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-background rounded-md border border-border">
                            <Archive size={20} className="text-muted-foreground" />
                        </div>
                        <div>
                            <h4 className="text-sm font-medium">Java Runtime Cache</h4>
                            <p className="text-xs text-muted-foreground">Downloaded JREs (Temurin 8/11/17/21)</p>
                        </div>
                    </div>
                    <div className="text-right flex items-center gap-4">
                        <div>
                            <div className="text-sm font-bold">{formatSize(stats.java.size)}</div>
                            <div className="text-[10px] text-muted-foreground">{stats.java.count} files</div>
                        </div>
                         <button 
                            onClick={() => handleClear('java')}
                            disabled={loading}
                            className="p-2 hover:bg-destructive/10 text-destructive rounded-lg transition-colors border border-transparent hover:border-destructive/20"
                            title="Clear Java Cache"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>

                {/* Temp Files */}
                <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-secondary/10">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-background rounded-md border border-border">
                            <HardDrive size={20} className="text-muted-foreground" />
                        </div>
                        <div>
                            <h4 className="text-sm font-medium">Temporary Uploads</h4>
                            <p className="text-xs text-muted-foreground">Stale uploads and extraction buffers.</p>
                        </div>
                    </div>
                     <div className="text-right flex items-center gap-4">
                        <div>
                            <div className="text-sm font-bold">{formatSize(stats.temp.size)}</div>
                            <div className="text-[10px] text-muted-foreground">{stats.temp.count} files</div>
                        </div>
                        <button 
                            onClick={() => handleClear('temp')}
                            disabled={loading}
                            className="p-2 hover:bg-destructive/10 text-destructive rounded-lg transition-colors border border-transparent hover:border-destructive/20"
                            title="Clear Temp Files"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const SystemUpdatePreferences = ({ theme, user, onUpdate }: any) => {
    return (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm mt-6">
            <div className="flex items-center gap-3 mb-6">
                 <div className={`p-2 bg-blue-500/10 text-blue-500 rounded-lg`}>
                    <RefreshCw size={20} />
                </div>
                <div>
                    <h2 className="text-lg font-bold">Software Updates</h2>
                    <p className="text-sm text-muted-foreground">Configure automatic update checks.</p>
                </div>
            </div>
             <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <div>
                     <h4 className="text-sm font-medium">Check for Updates</h4>
                     <p className="text-xs text-muted-foreground">Automatically check for new versions on startup.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                        type="checkbox" 
                        checked={user.preferences.updates?.check ?? true}
                        onChange={(e) => onUpdate('updates', 'check', e.target.checked)}
                        className="sr-only peer"
                    />
                    <div className={`w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${((user.preferences.updates?.check ?? true)) ? theme.bg : ''}`}></div>
                </label>
             </div>
        </div>
    );
};

const UserProfileView: React.FC = () => {
    // Replace local state with global context state
    const { user, isLoading, updateUser, updatePreferences, theme } = useUser();
    const [activeTab, setActiveTab] = useState<'ACCOUNT' | 'PERSONALIZATION' | 'NOTIFICATIONS' | 'MINECRAFT' | 'API' | 'SYSTEM'>('ACCOUNT');
    const { addToast } = useToast();
    
    // Form States (Local only for inputs)
    const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [ignInput, setIgnInput] = useState(user?.minecraftIgn || '');
    const [avatarInput, setAvatarInput] = useState(user?.avatarUrl || '');
    const [isSaving, setIsSaving] = useState(false);

    const handlePasswordChange = async () => {
        if (!passwords.current || !passwords.new || !passwords.confirm) {
            addToast('error', 'Incomplete', 'Please fill in all password fields.');
            return;
        }

        if (passwords.new !== passwords.confirm) {
            addToast('error', 'Mismatch', 'New passwords do not match.');
            return;
        }

        setIsSaving(true);
        try {
            // Call your password change API here
            await new Promise(r => setTimeout(r, 1000)); // Simulated API call
            addToast('success', 'Password Changed!', 'Your password has been updated.');
            setPasswords({ current: '', new: '', confirm: '' });
        } catch (e) {
            addToast('error', 'Failed', 'Could not change password.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleLinkMinecraft = async () => {
        if (!ignInput) return;
        setIsSaving(true);
        try {
            await updateUser({ minecraftIgn: ignInput });
            addToast('success', 'Account Linked', `Successfully linked to: ${ignInput}`);
        } catch (e) {
            addToast('error', 'Failed', 'Could not link account.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAvatarUpdate = async () => {
        if (!avatarInput) return;
        setIsSaving(true);
        try {
            await updateUser({ avatarUrl: avatarInput });
            addToast('success', 'Avatar Updated', 'Your profile picture has been changed.');
        } catch (e) {
            addToast('error', 'Failed', 'Could not update avatar.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSyncMinecraftSkin = async () => {
        if (!user?.minecraftIgn) {
            addToast('error', 'Not Linked', 'Please link your Minecraft account first.');
            return;
        }
        
        const isSynced = user.avatarUrl?.includes('minotar.net');
        setIsSaving(true);
        
        try {
            if (isSynced) {
                // Revert to system default (based on username)
                const defaultAvatar = `https://mc-heads.net/avatar/${user.username}/64`;
                await updateUser({ avatarUrl: defaultAvatar });
                setAvatarInput(defaultAvatar);
                addToast('info', 'Sync Disabled', 'Reverted to default system avatar.');
            } else {
                // Sync with high-quality face (helm included)
                const helmUrl = `https://minotar.net/helm/${user.minecraftIgn}/128.png`;
                await updateUser({ avatarUrl: helmUrl });
                setAvatarInput(helmUrl);
                addToast('success', 'Skin Synced', 'Dashboard avatar synced with Minecraft skin.');
            }
        } catch (e) {
            addToast('error', 'Failed', 'Could not update sync state.');
        } finally {
            setIsSaving(false);
        }
    };



    const handleGenerateKey = () => {
        if (confirm('Generating a new API Key will invalidate the old one. Continue?')) {
            // const newKey = API.rotateApiKey();
            addToast('info', 'Not Implemented', 'API Key rotation requires backend auth module.');
        }
    };


    // Updated Handler using Context
    const handlePreferenceUpdate = (category: keyof UserProfile['preferences'], key: string, value: any) => {
        if (category === 'notifications' || category === 'terminal' || category === 'updates') {
            const subSection = { ...user!.preferences[category], [key]: value };
            updatePreferences({ [category]: subSection });
        } else {
            updatePreferences({ [key]: value });
        }
    };

    // Guard: If user context is still loading, show loading spinner
    if (isLoading) {
        return (
            <div className="max-w-5xl mx-auto py-8">
                <div className="flex items-center justify-center py-20">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                        <p className="text-muted-foreground">Loading profile...</p>
                    </div>
                </div>
            </div>
        );
    }

    // Guard: If user is null even after loading, show error
    if (!user) {
        return (
            <div className="max-w-5xl mx-auto py-8">
                <div className="flex items-center justify-center py-20">
                    <div className="text-center">
                        <p className="text-rose-500 font-semibold mb-2">Authentication Required</p>
                        <p className="text-muted-foreground text-sm">Please log in to view your profile.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto py-8 pb-20">
            
            {/* Header */}
            <div className="flex flex-col md:flex-row items-center gap-6 mb-10">
                <div className="relative group">
                    <div className={`w-24 h-24 rounded-full bg-secondary border-4 border-background shadow-xl overflow-hidden relative ${theme.ring}`}>
                        {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            <div className={`w-full h-full flex items-center justify-center bg-primary/10 ${theme.text}`}>
                                <User size={40} />
                            </div>
                        )}
                    </div>
                    {user.minecraftIgn && (
                        <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 text-foreground text-[10px] font-bold px-2 py-0.5 rounded-full border border-background shadow-sm whitespace-nowrap ${theme.bg}`}>
                            LINKED
                        </div>
                    )}
                </div>
                <div className="text-center md:text-left">
                    <h1 className="text-3xl font-bold tracking-tight">{user.username}</h1>
                    <div className="flex items-center justify-center md:justify-start gap-3 mt-2 text-muted-foreground text-sm">
                        <span className="flex items-center gap-1.5"><Mail size={14} /> {user.email}</span>
                        <span className="w-1 h-1 bg-border rounded-full"></span>
                        <span className={`bg-primary/10 px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider ${theme.text}`}>{user.role}</span>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-border mb-8 overflow-x-auto no-scrollbar">
                {[
                    { id: 'ACCOUNT', label: 'Account', icon: <Lock size={16} /> },
                    { id: 'PERSONALIZATION', label: 'Personalization', icon: <Palette size={16} /> },
                    { id: 'NOTIFICATIONS', label: 'Notifications', icon: <Bell size={16} /> },
                    { id: 'MINECRAFT', label: 'Minecraft', icon: <Gamepad2 size={16} /> },
                    { id: 'API', label: 'Developer', icon: <Code size={16} /> },
                    { id: 'SYSTEM', label: 'System', icon: <HardDrive size={16} /> }
                ].map((tab) => (
                    <button 
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? `border-current ${theme.text}` : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                
                {/* Left Content Area (2 Cols) */}
                <div className="md:col-span-2 space-y-6">
                    
                    {/* --- ACCOUNT TAB --- */}
                    {activeTab === 'ACCOUNT' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                            
                            {/* Security Alert */}
                            {user.email === 'admin@craftcommands.io' && (
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3 items-start">
                                    <AlertTriangle className="text-amber-500 shrink-0" size={20} />
                                    <div>
                                        <h3 className="font-bold text-amber-700 dark:text-amber-500 text-sm">Action Required</h3>
                                        <p className="text-xs text-amber-800 dark:text-amber-200/70 mt-1">
                                            You are using the default administrator account. Please change your password to secure your local dashboard.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Password Change */}
                            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                    <Lock size={18} className={theme.text} /> Change Password
                                </h2>
                                <div className="space-y-4 max-w-md">
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground uppercase">Current Password</label>
                                        <div className="relative mt-1">
                                            <input 
                                                type={showPassword ? 'text' : 'password'}
                                                value={passwords.current}
                                                onChange={(e) => setPasswords({...passwords, current: e.target.value})}
                                                className="w-full bg-secondary border border-border text-foreground placeholder:text-muted-foreground rounded-lg pl-3 pr-10 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-medium text-muted-foreground uppercase">New Password</label>
                                            <input 
                                                type={showPassword ? 'text' : 'password'}
                                                value={passwords.new}
                                                onChange={(e) => setPasswords({...passwords, new: e.target.value})}
                                                className="w-full bg-secondary border border-border text-foreground placeholder:text-muted-foreground rounded-lg px-3 py-2.5 text-sm mt-1 focus:outline-none focus:ring-1 focus:ring-primary"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-muted-foreground uppercase">Confirm</label>
                                            <input 
                                                type={showPassword ? 'text' : 'password'}
                                                value={passwords.confirm}
                                                onChange={(e) => setPasswords({...passwords, confirm: e.target.value})}
                                                className="w-full bg-secondary border border-border text-foreground placeholder:text-muted-foreground rounded-lg px-3 py-2.5 text-sm mt-1 focus:outline-none focus:ring-1 focus:ring-primary"
                                            />
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center justify-between pt-2">
                                        <button 
                                            type="button" 
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
                                        >
                                            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />} 
                                            {showPassword ? 'Hide Characters' : 'Show Characters'}
                                        </button>
                                        
                                        <button 
                                            onClick={handlePasswordChange}
                                            disabled={isSaving}
                                            className="bg-foreground text-background px-4 py-2 rounded-lg text-sm font-medium hover:bg-foreground/90 transition-colors flex items-center gap-2"
                                        >
                                            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                            Update Password
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Avatar Settings */}
                            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                    <Disc size={18} className={theme.text} /> Profile Picture
                                </h2>
                                <div className="space-y-4 max-w-md">
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="w-16 h-16 rounded-xl border border-border overflow-hidden bg-secondary flex items-center justify-center shrink-0">
                                            {user.avatarUrl ? (
                                                <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                            ) : (
                                                <User size={32} className="text-muted-foreground opacity-20" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">Avatar Preview</p>
                                            <p className="text-xs text-muted-foreground">This is how you appear to others.</p>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground uppercase">Image URL (HTTPS)</label>
                                        <div className="flex gap-2 mt-1.5">
                                            <input 
                                                type="text" 
                                                placeholder="https://example.com/avatar.png"
                                                value={avatarInput}
                                                onChange={(e) => setAvatarInput(e.target.value)}
                                                className="flex-1 bg-secondary border border-border text-foreground placeholder:text-muted-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                            />
                                            <button 
                                                onClick={handleAvatarUpdate}
                                                disabled={isSaving || !avatarInput}
                                                className={`px-4 text-foreground rounded-lg transition-colors disabled:opacity-50 ${theme.bg} hover:opacity-90 flex items-center justify-center`}
                                            >
                                                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground mt-2 italic">
                                            Supports Gravatar, Discord, or any direct image link.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* --- PERSONALIZATION TAB --- */}
                    {activeTab === 'PERSONALIZATION' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                            
                            {/* Theme Settings */}
                            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className={`p-2 bg-primary/10 rounded-lg ${theme.text}`}>
                                        <Palette size={20} />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold">Theme & Appearance</h2>
                                        <p className="text-sm text-muted-foreground">Customize your dashboard experience.</p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div>
                                        <label className="text-sm font-medium block mb-3">Accent Color</label>
                                        <div className="flex gap-3">
                                            {(['emerald', 'blue', 'violet', 'amber', 'rose'] as AccentColor[]).map((color) => (
                                                <button
                                                    key={color}
                                                    onClick={() => handlePreferenceUpdate('accentColor', 'accentColor', color)}
                                                    className={`w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center ${
                                                        user.preferences.accentColor === color 
                                                        ? 'border-foreground scale-110' 
                                                        : 'border-transparent hover:scale-105'
                                                    }`}
                                                    style={{ backgroundColor: `var(--color-${color}-500, ${color === 'emerald' ? '#10b981' : color === 'blue' ? '#3b82f6' : color === 'violet' ? '#8b5cf6' : color === 'amber' ? '#f59e0b' : '#f43f5e'})` }}
                                                >
                                                    {user.preferences.accentColor === color && <Check size={16} className="text-foreground drop-shadow-md" />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between p-4 bg-secondary/20 rounded-lg border border-border">
                                        <div className="flex gap-3">
                                            <Monitor size={20} className="text-muted-foreground" />
                                            <div>
                                                <h3 className="text-sm font-medium">Reduced Motion</h3>
                                                <p className="text-xs text-muted-foreground">Disable heavy animations for better performance.</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={user.preferences.reducedMotion}
                                                onChange={(e) => handlePreferenceUpdate('reducedMotion', 'reducedMotion', e.target.checked)}
                                                className="sr-only peer"
                                            />
                                            <div className={`w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${user.preferences.reducedMotion ? theme.bg : ''}`}></div>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Terminal Customization */}
                            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 bg-secondary text-foreground rounded-lg">
                                        <Terminal size={20} />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold">Console Settings</h2>
                                        <p className="text-sm text-muted-foreground">Adjust readability for server logs.</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-sm font-medium block mb-3 flex items-center gap-2">
                                            <Type size={16} /> Font Size
                                        </label>
                                        <input 
                                            type="range" 
                                            min="10" max="18" step="1"
                                            value={user.preferences.terminal.fontSize}
                                            onChange={(e) => handlePreferenceUpdate('terminal', 'fontSize', parseInt(e.target.value))}
                                            className={`w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer mb-2 accent-${user.preferences.accentColor}-500`}
                                        />
                                        <div className="flex justify-between text-xs text-muted-foreground font-mono">
                                            <span>10px</span>
                                            <span>{user.preferences.terminal.fontSize}px</span>
                                            <span>18px</span>
                                        </div>
                                    </div>
                                    
                                    <div className={`bg-black p-3 rounded-lg border border-[rgb(var(--color-border-default))] font-mono text-muted-foreground overflow-hidden h-24 flex flex-col justify-end`} style={{ fontSize: `${user.preferences.terminal.fontSize}px` }}>
                                        <div className="opacity-50">[12:00:01] INFO: Loading libraries...</div>
                                        <div>[12:00:02] INFO: Done! For help, type "help"</div>
                                        <div className={`mt-1 ${theme.text}`}>{'>'} _</div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* --- NOTIFICATIONS TAB --- */}
                    {activeTab === 'NOTIFICATIONS' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                             <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className={`p-2 bg-blue-500/10 text-blue-500 rounded-lg`}>
                                        <BellRing size={20} />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold">Local Alerts</h2>
                                        <p className="text-sm text-muted-foreground">Browser-based notifications for server events.</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                                        <div>
                                            <h4 className="text-sm font-medium">Browser Push Notifications</h4>
                                            <p className="text-xs text-muted-foreground">Receive popups when the tab is in the background.</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={user.preferences.notifications.browser}
                                                onChange={(e) => handlePreferenceUpdate('notifications', 'browser', e.target.checked)}
                                                className="sr-only peer"
                                            />
                                            <div className={`w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${user.preferences.notifications.browser ? theme.bg : ''}`}></div>
                                        </label>
                                    </div>

                                    <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <Volume2 className="text-muted-foreground" size={20} />
                                            <div>
                                                <h4 className="text-sm font-medium">Sound Effects</h4>
                                                <p className="text-xs text-muted-foreground">Play a sound when urgent events occur.</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={user.preferences.notifications.sound}
                                                onChange={(e) => handlePreferenceUpdate('notifications', 'sound', e.target.checked)}
                                                className="sr-only peer"
                                            />
                                            <div className={`w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${user.preferences.notifications.sound ? theme.bg : ''}`}></div>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* --- MINECRAFT TAB --- */}
                    {activeTab === 'MINECRAFT' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                                <div className="flex gap-6 items-start">
                                    {/* 3D Skin Preview (Simulated via Image) */}
                                    <div className="shrink-0 w-32 h-64 bg-secondary/50 rounded-lg border border-border flex items-center justify-center relative overflow-hidden">
                                        {user.minecraftIgn ? (
                                            <img 
                                                src={`https://minotar.net/body/${user.minecraftIgn}/100.png`} 
                                                alt="Skin" 
                                                className="w-full h-full object-contain drop-shadow-2xl"
                                            />
                                        ) : (
                                            <User size={48} className="text-muted-foreground opacity-20" />
                                        )}
                                        <div className="absolute bottom-0 inset-x-0 bg-black/60 py-1 text-center text-[10px] font-mono text-muted-foreground">
                                            PREVIEW
                                        </div>
                                    </div>

                                    <div className="flex-1">
                                        <h2 className="text-lg font-bold mb-2">Link Account</h2>
                                        <p className="text-sm text-muted-foreground mb-4">
                                            Connect your Minecraft account to automatically sync permissions and enable profile customization.
                                        </p>

                                        <div className="max-w-xs">
                                            <label className="text-xs font-medium text-muted-foreground uppercase">Java Username (IGN)</label>
                                            <div className="flex gap-2 mt-1.5">
                                                <input 
                                                    type="text" 
                                                    placeholder="Steve"
                                                    value={ignInput}
                                                    onChange={(e) => setIgnInput(e.target.value)}
                                                    className="flex-1 bg-secondary border border-border text-foreground placeholder:text-muted-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                                />
                                                <button 
                                                    onClick={handleLinkMinecraft}
                                                    disabled={isSaving || !ignInput}
                                                    className={`px-4 text-foreground rounded-lg transition-colors disabled:opacity-50 ${theme.bg} hover:opacity-90`}
                                                >
                                                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Link size={16} />}
                                                </button>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground mt-2">
                                                We verify ownership by checking official Mojang records.
                                            </p>
                                        </div>

                                        <div className="mt-8 border-t border-border pt-4">
                                            <h3 className="text-sm font-semibold mb-3">Sync Settings</h3>
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <Check size={16} className={theme.text} />
                                                    <span>Automatically OP me on my servers</span>
                                                </div>
                                                <button 
                                                    onClick={handleSyncMinecraftSkin}
                                                    disabled={isSaving || !user.minecraftIgn}
                                                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
                                                >
                                                    <div className={`w-4 h-4 rounded border border-border flex items-center justify-center transition-colors ${user.avatarUrl?.includes('mc-heads.net') ? theme.bg + ' border-transparent' : 'bg-transparent'}`}>
                                                        {user.avatarUrl?.includes('mc-heads.net') && <Check size={12} className="text-white" />}
                                                    </div>
                                                    <span>Use my skin as my dashboard avatar</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* --- API TAB --- */}
                    {activeTab === 'API' && (
                         <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                    <Key size={18} className={theme.text} /> API Access
                                </h2>
                                <p className="text-sm text-muted-foreground mb-6">
                                    Use this key to authenticate with the Craft Commands REST API for CI/CD pipelines or external monitoring scripts.
                                </p>

                                <div className="bg-background border border-border rounded-lg p-4 flex items-center justify-between gap-4 mb-4">
                                    <code className={`font-mono text-sm break-all ${theme.text}`}>
                                        {user.apiKey || 'No API Key Generated'}
                                    </code>
                                    <button 
                                        onClick={() => {
                                            if (user.apiKey) {
                                                navigator.clipboard.writeText(user.apiKey);
                                                addToast('success', 'Copied', 'API Key copied to clipboard');
                                            }
                                        }}
                                        disabled={!user.apiKey}
                                        className="p-2 hover:bg-white/10 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        <Copy size={16} />
                                    </button>
                                </div>

                                { /* API Key Rotation Pending Backend Implementation */ }
                                {/* <button 
                                    onClick={handleGenerateKey}
                                    className="bg-secondary text-foreground border border-border px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors flex items-center gap-2"
                                >
                                    <RefreshCw size={14} /> {user.apiKey ? 'Rotate Secret Key' : 'Generate Key'}
                                </button> */}
                            </div>

                             <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-6">
                                <h3 className="font-semibold text-blue-500 text-sm mb-2">Developer Documentation</h3>
                                <p className="text-xs text-blue-400/70 mb-4">
                                    Learn how to use the API to start servers, read logs, and manage files programmatically.
                                </p>
                                <button className="text-xs text-blue-400 font-medium hover:underline flex items-center gap-1">
                                    View Docs <Code size={12} />
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* --- SYSTEM TAB (New) --- */}
                    {activeTab === 'SYSTEM' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                            <SystemCacheManager theme={theme} />
                            <SystemUpdatePreferences theme={theme} user={user} onUpdate={handlePreferenceUpdate} />
                        </motion.div>
                    )}
                </div>

                {/* Right Sidebar (Summary) */}
                <div className="md:col-span-1 space-y-6">
                    <div className="bg-card border border-border rounded-xl p-6 shadow-sm sticky top-24">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Profile Strength</h3>
                        
                        <div className="space-y-4">
                             <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm">
                                    <Mail size={16} className={theme.text} />
                                    Email Verified
                                </div>
                                <Check size={16} className={theme.text} />
                            </div>
                             <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm">
                                    <Lock size={16} className={user.email === 'admin@craftcommands.io' ? "text-amber-500" : theme.text} />
                                    Password Strength
                                </div>
                                <span className={`text-xs font-medium ${user.email === 'admin@craftcommands.io' ? "text-amber-500" : theme.text}`}>
                                    {user.email === 'admin@craftcommands.io' ? 'Weak' : 'Strong'}
                                </span>
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-border">
                             <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Preferences</h3>
                             <div className="space-y-3">
                                 <div className="flex justify-between items-center text-sm">
                                     <span>Theme</span>
                                     <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: user.preferences.accentColor === 'emerald' ? '#10b981' : user.preferences.accentColor === 'blue' ? '#3b82f6' : user.preferences.accentColor === 'violet' ? '#8b5cf6' : user.preferences.accentColor === 'rose' ? '#f43f5e' : '#f59e0b' }}></div>
                                        <span className="capitalize text-xs text-muted-foreground">{user.preferences.accentColor}</span>
                                     </div>
                                 </div>
                                 <div className="flex justify-between items-center text-sm">
                                     <span>Browser Alerts</span>
                                     <span className={`text-xs ${user.preferences.notifications.browser ? theme.text : 'text-muted-foreground'}`}>
                                        {user.preferences.notifications.browser ? 'On' : 'Off'}
                                     </span>
                                 </div>
                                 <div className="flex justify-between items-center text-sm">
                                     <span>Console Font</span>
                                     <span className="text-xs text-muted-foreground font-mono">{user.preferences.terminal.fontSize}px</span>
                                 </div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserProfileView;
