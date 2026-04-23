
import React, { useState } from 'react';

import { UserProfile, AccentColor } from '@shared/types';
import { useToast } from '../ui/Toast';

import { 
    User, Lock, Palette, Bell, Key, Eye, EyeOff, Save, Loader2, 
    Mail, Check, AlertTriangle, Code, RefreshCw, Copy, Gamepad2, Link,
    Terminal, Monitor, BellRing, Type, Volume2, Disc, Camera, ShieldCheck, QrCode,
    Languages, Info, Globe, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useUser } from '@features/auth/context/UserContext';
import { API } from '@core/services/api';
import { HardDrive, Trash2, Archive, Database, Image as ImageIcon } from 'lucide-react';
import BackgroundManagerModal from '../ui/BackgroundManagerModal';
import TwoFactorSetupWizard from './components/TwoFactorSetupWizard';
import { useConfirm } from '../ui/hooks/useConfirm';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { usePrompt } from '../ui/hooks/usePrompt';
import { PromptDialog } from '../ui/PromptDialog';

const SystemCacheManager = ({ theme }: { theme: any }) => {
    const { t } = useTranslation();
    const { user } = useUser();
    const [stats, setStats] = useState<{ java: { size: number, count: number }, temp: { size: number, count: number } } | null>(null);
    const [loading, setLoading] = useState(false);
    const { addToast } = useToast();
    const { isOpen: isConfirmOpen, config: confirmConfig, confirm: requestConfirm, handleConfirm, handleCancel } = useConfirm();

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
        const isConfirmed = await requestConfirm({
            title: t('diagnosis.apply_fix'),
            description: t('profile.clear_java_cache'),
            confirmText: t('profile.clear_java_cache'),
            cancelText: t('common.cancel')
        });
        if (!isConfirmed) return;
        setLoading(true);
        try {
            await API.clearSystemCache(type);
            addToast('success', t('profile.updated_success'), t('profile.cache_cleared', { type }));
            fetchStats();
        } catch (e) {
            addToast('error', t('dashboard.power_action_failed'), t('profile.cache_clear_failed'));
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

    if (!stats) return <div className="p-8 text-center text-muted-foreground"><Loader2 className="animate-spin mx-auto mb-2" /> {t('common.loading_stats')}</div>;

    return (
        <div className="cc-card p-6 mb-6">
            <div className="flex items-center gap-3 mb-6">
                <div className={`p-2 bg-rose-500/10 text-rose-500 rounded-md`}>
                    <Database size={20} />
                </div>
                <div>
                    <h2 className="text-lg font-bold">{t('profile.storage_title')}</h2>
                    <p className="text-sm text-muted-foreground">{t('profile.storage_desc')}</p>
                </div>
            </div>

            <div className="space-y-4">
                {/* Java Cache */}
                <div className="flex items-center justify-between p-4 border border-border rounded-md bg-secondary/10">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-background rounded-md border border-border">
                            <Archive size={20} className="text-muted-foreground" />
                        </div>
                        <div>
                            <h4 className="text-sm font-medium">{t('profile.java_cache_title')}</h4>
                            <p className="text-xs text-muted-foreground">{t('profile.java_cache_desc')}</p>
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
                            className="p-2 hover:bg-destructive/10 text-destructive rounded-md transition-colors border border-transparent hover:border-destructive/20"
                            title={t('profile.clear_java_cache')}
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>

                {/* Temp Files */}
                <div className="flex items-center justify-between p-4 border border-border rounded-md bg-secondary/10">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-background rounded-md border border-border">
                            <HardDrive size={20} className="text-muted-foreground" />
                        </div>
                        <div>
                            <h4 className="text-sm font-medium">{t('profile.temp_cache_title')}</h4>
                            <p className="text-xs text-muted-foreground">{t('profile.temp_cache_desc')}</p>
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
                            className="p-2 hover:bg-destructive/10 text-destructive rounded-md transition-colors border border-transparent hover:border-destructive/20"
                            title={t('profile.clear_temp_cache')}
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>
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

const SystemUpdatePreferences = ({ theme, user, onUpdate }: any) => {
    const { t } = useTranslation();
    return (
        <div className="cc-card p-6 mt-6">
            <div className="flex items-center gap-3 mb-6">
                 <div className={`p-2 bg-blue-500/10 text-blue-500 rounded-md`}>
                    <RefreshCw size={20} />
                </div>
                <div>
                    <h2 className="text-lg font-bold">{t('profile.updates_title')}</h2>
                    <p className="text-sm text-muted-foreground">{t('profile.updates_desc')}</p>
                </div>
            </div>
             <div className="flex items-center justify-between p-4 border border-border rounded-md">
                <div>
                     <h4 className="text-sm font-medium">{t('profile.check_updates_title')}</h4>
                     <p className="text-xs text-muted-foreground">{t('profile.check_updates_desc')}</p>
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

interface UserProfileViewProps {
    initialSection?: string | null;
    onSectionHandled?: () => void;
}

const UserProfileView: React.FC<UserProfileViewProps> = ({ initialSection, onSectionHandled }) => {
    const { t } = useTranslation();
    // Replace local state with global context state
    const { user, isLoading, updateUser, updatePreferences, theme } = useUser();
    const [activeTab, setActiveTab] = useState<'ACCOUNT' | 'PERSONALIZATION' | 'NOTIFICATIONS' | 'MINECRAFT' | 'API' | 'SYSTEM'>('ACCOUNT');
    const { addToast } = useToast();
    const { isOpen: isConfirmOpen, config: confirmConfig, confirm: requestConfirm, handleConfirm, handleCancel } = useConfirm();
    const { isOpen: isPromptOpen, config: promptConfig, requestPrompt, handleConfirm: handlePromptConfirm, handleCancel: handlePromptCancel } = usePrompt();
    
    // Refs for deep-linking
    const securitySectionRef = React.useRef<HTMLDivElement>(null);
    const apiSectionRef = React.useRef<HTMLDivElement>(null);

    // Deep-linking effect
    React.useEffect(() => {
        if (initialSection === '2FA' && securitySectionRef.current) {
            setActiveTab('ACCOUNT');
            setTimeout(() => {
                securitySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                onSectionHandled?.();
            }, 100);
        }
        if (initialSection === 'API' && apiSectionRef.current) {
            setActiveTab('API');
            setTimeout(() => {
                apiSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                onSectionHandled?.();
            }, 100);
        }
    }, [initialSection]);

    // Form States (Local only for inputs)
    const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [ignInput, setIgnInput] = useState(user?.minecraftIgn || '');
    const [avatarInput, setAvatarInput] = useState(user?.avatarUrl || '');
    const [isSaving, setIsSaving] = useState(false);
    const [showBackgroundModal, setShowBackgroundModal] = useState(false);
    const [show2FAWizard, setShow2FAWizard] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            addToast('error', t('common.too_large'), t('profile.avatar_limit_msg'));
            return;
        }

        setIsSaving(true);
        try {
            const result = await API.uploadAvatar(file);
            await updateUser({ avatarUrl: result.url });
            setAvatarInput(result.url);
            addToast('success', t('profile.updated_success'), t('profile.avatar_changed_msg'));
        } catch (err: any) {
            addToast('error', t('common.upload_failed'), err.message || t('common.error_occurred'));
        } finally {
            setIsSaving(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handlePasswordChange = async () => {
        if (!passwords.current || !passwords.new || !passwords.confirm) {
            addToast('error', t('common.incomplete'), t('profile.password_fields_msg'));
            return;
        }

        if (passwords.new !== passwords.confirm) {
            addToast('error', t('common.mismatch'), t('profile.password_mismatch_msg'));
            return;
        }

        if (passwords.new.length < 8) {
            addToast('error', t('common.too_short'), t('profile.password_length_msg'));
            return;
        }

        setIsSaving(true);
        try {
            await API.changePassword(passwords.current, passwords.new);
            addToast('success', t('profile.password_changed_success'), t('profile.password_updated_msg'));
            setPasswords({ current: '', new: '', confirm: '' });
        } catch (e: any) {
            addToast('error', t('dashboard.power_action_failed'), e.message || t('common.error_occurred'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleLinkMinecraft = async () => {
        if (!ignInput) return;
        setIsSaving(true);
        try {
            await updateUser({ minecraftIgn: ignInput });
            addToast('success', t('profile.account_linked_success'), t('profile.account_linked_msg', { ign: ignInput }));
        } catch (e) {
            addToast('error', t('dashboard.power_action_failed'), t('common.error_occurred'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleAvatarUpdate = async () => {
        if (!avatarInput) return;
        setIsSaving(true);
        try {
            await updateUser({ avatarUrl: avatarInput });
            addToast('success', t('profile.avatar_updated_success'), t('profile.avatar_changed_msg'));
        } catch (e) {
            addToast('error', t('dashboard.power_action_failed'), t('common.error_occurred'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleSyncMinecraftSkin = async () => {
        if (!user?.minecraftIgn) {
            addToast('error', t('profile.not_linked'), t('profile.link_minecraft_first_msg'));
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
                addToast('info', t('profile.sync_disabled'), t('profile.reverted_avatar_msg'));
            } else {
                // Sync with high-quality face (helm included)
                const helmUrl = `https://minotar.net/helm/${user.minecraftIgn}/128.png`;
                await updateUser({ avatarUrl: helmUrl });
                setAvatarInput(helmUrl);
                addToast('success', t('profile.skin_synced_success'), t('profile.skin_synced_msg'));
            }
        } catch (e) {
            addToast('error', t('dashboard.power_action_failed'), t('common.error_occurred'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDisable2FA = async () => {
        const password = await requestPrompt({
            title: t('profile.disable_2fa_title'),
            description: t('profile.disable_2fa_step1_msg'),
            placeholder: t('profile.account_password_placeholder'),
            type: 'password',
            confirmText: t('common.continue')
        });
        if (!password) return;
        
        const code = await requestPrompt({
            title: t('profile.disable_2fa_title'),
            description: t('profile.disable_2fa_step2_msg'),
            placeholder: t('profile.2fa_code_placeholder'),
            type: 'text',
            confirmText: t('profile.disable_2fa_btn')
        });
        if (!code) return;

        setIsSaving(true);
        try {
            await API.disable2FA(password, code);
            await updateUser({}); // Trigger refresh from memory or re-fetch
            addToast('success', t('profile.2fa_disabled_success'), t('profile.2fa_disabled_msg'));
        } catch (err: any) {
            addToast('error', t('dashboard.power_action_failed'), err.message || t('common.error_occurred'));
        } finally {
            setIsSaving(false);
        }
    };



    const handleGenerateKey = async () => {
        const isConfirmed = await requestConfirm({
            title: t('profile.rotate_api_key_title'),
            description: t('profile.rotate_api_key_desc'),
            confirmText: t('profile.confirm_rotation'),
            cancelText: t('common.cancel')
        });

        if (isConfirmed) {
            setIsSaving(true);
            try {
                const { apiKey } = await API.rotateApiKey();
                await updateUser({ apiKey } as any);
                addToast('success', t('profile.key_rotated_success'), t('profile.key_rotated_msg'));
            } catch (err: any) {
                addToast('error', t('profile.key_rotation_failed'), err.message || t('common.error_occurred'));
            } finally {
                setIsSaving(false);
            }
        }
    };


    // Updated Handler using Context
    const handlePreferenceUpdate = (category: keyof UserProfile['preferences'], key: string, value: any) => {
        // Quality Mode Boost: Initialize default backgrounds if first time
        if (key === 'visualQuality' && value === true) {
            updatePreferences({ visualQuality: true, reducedMotion: false }); // Force Reduced Motion OFF
            addToast('success', t('profile.quality_mode_enabled_success'), t('profile.quality_mode_enabled_msg'));
            return;
        }

        // Reduced Motion Boost: Kill Quality Mode
        if (key === 'reducedMotion' && value === true) {
            updatePreferences({ reducedMotion: true, visualQuality: false }); // Force Quality Mode OFF
            addToast('info', t('profile.performance_mode_active'), t('profile.performance_mode_msg'));
            return;
        }

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
                        <p className="text-muted-foreground">{t('profile.loading_profile')}</p>
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
                        <p className="text-rose-500 font-semibold mb-2">{t('common.auth_required')}</p>
                        <p className="text-muted-foreground text-sm">{t('profile.login_to_view_msg')}</p>
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
                        
                        {/* Interactive overlay */}
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isSaving}
                            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all duration-300 text-white cursor-pointer "
                            title="Upload new profile picture"
                        >
                            {isSaving ? (
                                <Loader2 size={24} className="animate-spin" />
                            ) : (
                                <>
                                    <Camera size={24} />
                                    <span className="text-[8px] font-bold uppercase mt-1 tracking-widest text-white/80">{t('common.update')}</span>
                                </>
                            )}
                        </button>
                    </div>
                    
                    <input 
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleFileUpload}
                    />
                    {user.minecraftIgn && (
                        <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 text-foreground text-[10px] font-bold px-2 py-0.5 rounded-full border border-background shadow-sm whitespace-nowrap ${theme.bg}`}>
                            {t('profile.linked')}
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
                    { id: 'ACCOUNT', label: t('profile.tab_account'), icon: <Lock size={16} /> },
                    { id: 'PERSONALIZATION', label: t('profile.tab_personalization'), icon: <Palette size={16} /> },
                    { id: 'NOTIFICATIONS', label: t('profile.tab_notifications'), icon: <Bell size={16} /> },
                    { id: 'MINECRAFT', label: t('profile.tab_minecraft'), icon: <Gamepad2 size={16} /> },
                    { id: 'API', label: t('profile.tab_developer'), icon: <Code size={16} /> },
                    { id: 'SYSTEM', label: t('profile.tab_system'), icon: <HardDrive size={16} /> }
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
                            {user.email === 'admin@craftcommand.io' && (
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-4 flex gap-3 items-start">
                                    <AlertTriangle className="text-amber-500 shrink-0" size={20} />
                                    <div>
                                        <h3 className="font-bold text-amber-700 dark:text-amber-500 text-sm">{t('common.action_required')}</h3>
                                        <p className="text-xs text-amber-800 dark:text-amber-200/70 mt-1">
                                            {t('profile.default_admin_warning')}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Password Change */}
                            <div className="cc-card p-6">
                                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                    <Lock size={18} className={theme.text} /> {t('profile.change_password_title')}
                                </h2>
                                <div className="space-y-4 max-w-md">
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground uppercase">{t('profile.current_password_label')}</label>
                                        <div className="relative mt-1">
                                            <input 
                                                type={showPassword ? 'text' : 'password'}
                                                value={passwords.current}
                                                onChange={(e) => setPasswords({...passwords, current: e.target.value})}
                                                className="w-full bg-secondary border border-border text-foreground placeholder:text-muted-foreground rounded-md pl-3 pr-10 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-medium text-muted-foreground uppercase">{t('profile.new_password_label')}</label>
                                            <input 
                                                type={showPassword ? 'text' : 'password'}
                                                value={passwords.new}
                                                onChange={(e) => setPasswords({...passwords, new: e.target.value})}
                                                className="w-full bg-secondary border border-border text-foreground placeholder:text-muted-foreground rounded-md px-3 py-2.5 text-sm mt-1 focus:outline-none focus:ring-1 focus:ring-primary"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-muted-foreground uppercase">{t('profile.confirm_password_label')}</label>
                                            <input 
                                                type={showPassword ? 'text' : 'password'}
                                                value={passwords.confirm}
                                                onChange={(e) => setPasswords({...passwords, confirm: e.target.value})}
                                                className="w-full bg-secondary border border-border text-foreground placeholder:text-muted-foreground rounded-md px-3 py-2.5 text-sm mt-1 focus:outline-none focus:ring-1 focus:ring-primary"
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
                                            {showPassword ? t('profile.hide_password') : t('profile.show_password')}
                                        </button>
                                        
                                        <button 
                                            onClick={handlePasswordChange}
                                            disabled={isSaving}
                                            className="bg-foreground text-background px-4 py-2 rounded-md text-sm font-medium hover:bg-foreground/90 transition-colors flex items-center gap-2"
                                        >
                                            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                            {t('profile.update_password_btn')}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Avatar Settings */}
                            <div className="cc-card p-6">
                                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                    <Disc size={18} className={theme.text} /> {t('profile.avatar_title')}
                                </h2>
                                <div className="space-y-4 max-w-md">
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="w-16 h-16 rounded-md border border-border overflow-hidden bg-secondary flex items-center justify-center shrink-0">
                                            {user.avatarUrl ? (
                                                <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                            ) : (
                                                <User size={32} className="text-muted-foreground opacity-20" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">{t('profile.avatar_preview')}</p>
                                            <p className="text-xs text-muted-foreground">{t('profile.avatar_preview_desc')}</p>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground uppercase">{t('profile.avatar_url_label')}</label>
                                        <div className="flex gap-2 mt-1.5">
                                            <input 
                                                type="text" 
                                                placeholder="https://example.com/avatar.png"
                                                value={avatarInput}
                                                onChange={(e) => setAvatarInput(e.target.value)}
                                                className="flex-1 bg-secondary border border-border text-foreground placeholder:text-muted-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                            />
                                            <button 
                                                onClick={handleAvatarUpdate}
                                                disabled={isSaving || !avatarInput}
                                                className={`px-4 text-foreground rounded-md transition-colors disabled:opacity-50 ${theme.bg} hover:opacity-90 flex items-center justify-center`}
                                            >
                                                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground mt-2 italic">
                                            {t('profile.avatar_url_hint')}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            {/* 2FA Security */}
                            <div ref={securitySectionRef} className={`cc-card p-6 ${initialSection === '2FA' ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
                                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                    <ShieldCheck size={18} className={theme.text} /> {t('profile.2fa_title')}
                                </h2>
                                
                                <div className="flex items-start gap-6">
                                    <div className={`p-4 rounded-md ${user.twoFactorEnabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'} shrink-0`}>
                                        {user.twoFactorEnabled ? <ShieldCheck size={32} /> : <AlertTriangle size={32} />}
                                    </div>
                                    
                                    <div className="flex-1 space-y-4">
                                         <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-sm">
                                                    {t('profile.2fa_status', { status: user.twoFactorEnabled ? t('common.enabled') : t('common.disabled') })}
                                                </h3>
                                                {user.twoFactorEnabled && (
                                                    <span className="text-[10px] bg-emerald-500/20 text-emerald-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">{t('common.secure')}</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                                {user.twoFactorEnabled 
                                                    ? t('profile.2fa_desc_enabled')
                                                    : t('profile.2fa_desc_disabled')}
                                            </p>
                                        </div>

                                        <div className="flex gap-2">
                                            {user.twoFactorEnabled ? (
                                                <button 
                                                    onClick={handleDisable2FA}
                                                    className="text-xs font-bold uppercase tracking-widest text-rose-500 hover:text-rose-400 transition-colors py-2"
                                                >
                                                    {t('profile.disable_2fa_btn')}
                                                </button>
                                            ) : (
                                                <button 
                                                    onClick={() => setShow2FAWizard(true)}
                                                    className={`px-4 py-2 text-xs font-bold rounded-md border border-border transition-all shadow-sm ${theme.bg} text-foreground hover:scale-105 active:scale-95 flex items-center gap-2`}
                                                >
                                                    <QrCode size={14} /> {t('profile.enable_2fa_btn')}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* --- PERSONALIZATION TAB --- */}
                    {activeTab === 'PERSONALIZATION' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                            
                            {/* Theme Settings */}
                            <div className="cc-card p-6">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className={`p-2 bg-primary/10 rounded-md ${theme.text}`}>
                                        <Palette size={20} />
                                    </div>
                                    <div className="flex-1">
                                        <h2 className="text-lg font-bold">{t('profile.appearance_title')}</h2>
                                        <p className="text-sm text-muted-foreground">{t('profile.appearance_desc')}</p>
                                        {!user.preferences.visualQuality && (
                                            <p className="text-[10px] text-amber-500 font-medium mt-1 animate-pulse">
                                                {t('profile.quality_mode_tip')}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (user.preferences.visualQuality) {
                                                setShowBackgroundModal(true);
                                            } else {
                                                addToast('info', t('profile.quality_mode_required'), t('profile.quality_mode_req_msg'));
                                            }
                                        }}
                                        className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-md border border-border transition-all shadow-sm ${
                                            user.preferences.visualQuality 
                                            ? `${theme.bg} text-foreground hover:scale-105 active:scale-95` 
                                            : 'bg-secondary text-muted-foreground'
                                        }`}
                                    >
                                        <ImageIcon size={14} /> 
                                        {user.preferences.visualQuality ? t('profile.manage_backgrounds') : t('profile.unlock_backgrounds')}
                                    </button>
                                </div>

                                <div className="space-y-6">
                                    <div>
                                        <label className="text-sm font-medium block mb-3">{t('profile.accent_color_label')}</label>
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

                                    <div className={`flex items-center justify-between p-4 bg-secondary/20 rounded-md border border-border transition-opacity ${user.preferences.visualQuality ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                        <div className="flex gap-3">
                                            <div className="w-8 h-8 rounded-md flex items-center justify-center bg-secondary/50 text-muted-foreground">
                                                <Monitor size={18} />
                                            </div>
                                            <div className="flex flex-col justify-center">
                                                <h3 className="text-sm font-medium">{t('profile.reduced_motion_title')}</h3>
                                                <p className="text-xs text-muted-foreground">{t('profile.reduced_motion_desc')}</p>
                                            </div>
                                        </div>
                                        <label className={`relative inline-flex items-center ${user.preferences.visualQuality ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                            <input 
                                                type="checkbox" 
                                                checked={user.preferences.reducedMotion}
                                                disabled={user.preferences.visualQuality}
                                                onChange={(e) => handlePreferenceUpdate('reducedMotion', 'reducedMotion', e.target.checked)}
                                                className="sr-only peer"
                                            />
                                            <div className={`w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${user.preferences.reducedMotion ? theme.bg : ''} ${user.preferences.visualQuality ? 'opacity-50' : ''}`}></div>
                                        </label>
                                    </div>

                                    <div className={`flex items-center justify-between p-4 bg-secondary/20 rounded-md border border-border transition-opacity ${user.preferences.reducedMotion ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                        <div className="flex gap-3">
                                            <div className="w-8 h-8 rounded-md flex items-center justify-center bg-secondary/50 text-muted-foreground">
                                                <Eye size={18} />
                                            </div>
                                            <div className="flex flex-col justify-center">
                                                <h3 className="text-sm font-medium flex items-center gap-2">
                                                    {t('profile.quality_mode_title')}
                                                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20 font-bold uppercase tracking-wider">
                                                        {t('common.beta')}
                                                    </span>
                                                </h3>
                                                <p className="text-xs text-muted-foreground">{t('profile.quality_mode_desc')}</p>
                                            </div>
                                        </div>
                                        <label className={`relative inline-flex items-center ${user.preferences.reducedMotion ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                            <input 
                                                type="checkbox" 
                                                checked={user.preferences.visualQuality}
                                                disabled={user.preferences.reducedMotion}
                                                onChange={(e) => handlePreferenceUpdate('visualQuality', 'visualQuality', e.target.checked)}
                                                className="sr-only peer"
                                            />
                                            <div className={`w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${user.preferences.visualQuality ? theme.bg : ''} ${user.preferences.reducedMotion ? 'opacity-50' : ''}`}></div>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Language & Region */}
                            <div className="cc-card p-6">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 bg-secondary text-muted-foreground rounded-md`}>
                                            <Languages size={20} />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-bold">{t('profile.system_language')}</h2>
                                            <p className="text-sm text-muted-foreground">{t('profile.choose_language')}</p>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-end gap-2">
                                        <div className="relative group/select w-full md:w-3/5">
                                            <select 
                                                value={user.preferences.language || 'en'}
                                                onChange={(e) => {
                                                    handlePreferenceUpdate('language', 'language', e.target.value);
                                                    addToast('success', t('profile.lang_saved'), t('profile.lang_updated'));
                                                }}
                                                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none transition-all hover:border-primary/40 cursor-pointer"
                                            >
                                                <option value="en">{t('common.english')}</option>
                                                <option value="es">{t('common.spanish')} (60%)</option>
                                                <option value="fr">{t('common.french')} (60%)</option>
                                                <option value="de">{t('common.german')} (60%)</option>
                                                <option value="it">{t('common.italian')} (60%)</option>
                                                <option value="ja">{t('common.japanese')} (60%)</option>
                                                <option value="ko">{t('common.korean')} (60%)</option>
                                                <option value="pl">{t('common.polish')} (60%)</option>
                                                <option value="pt">{t('common.portuguese')} (60%)</option>
                                                <option value="ru">{t('common.russian')} (60%)</option>
                                                <option value="zh">{t('common.chinese')} (60%)</option>
                                            </select>
                                            <div className="absolute right-3 top-2.5 pointer-events-none text-muted-foreground/50">
                                                <ChevronDown size={14} />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500/80 uppercase tracking-tight">
                                            <Info size={12} />
                                            {t('profile.dev_note')}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Terminal Customization */}
                            <div className="bg-card border border-border p-6 rounded-md shadow-sm transition-all duration-300">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 bg-secondary text-foreground rounded-md">
                                        <Terminal size={20} />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold">{t('profile.terminal_title')}</h2>
                                        <p className="text-sm text-muted-foreground">{t('profile.terminal_desc')}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-sm font-medium mb-3 flex items-center gap-2">
                                            <Type size={16} /> {t('profile.font_size_label')}
                                        </label>
                                        <input 
                                            type="range" 
                                            min="10" max="18" step="1"
                                            value={user.preferences.terminal.fontSize}
                                            onChange={(e) => handlePreferenceUpdate('terminal', 'fontSize', parseInt(e.target.value))}
                                            className={`w-full h-2 bg-secondary rounded-md appearance-none cursor-pointer mb-2 accent-${user.preferences.accentColor}-500`}
                                        />
                                        <div className="flex justify-between text-xs text-muted-foreground font-mono">
                                            <span>10px</span>
                                            <span>{user.preferences.terminal.fontSize}px</span>
                                            <span>18px</span>
                                        </div>
                                    </div>
                                    
                                    <div className={`bg-black p-3 rounded-md border border-[rgb(var(--color-border-default))] font-mono text-muted-foreground overflow-hidden h-24 flex flex-col justify-end`} style={{ fontSize: `${user.preferences.terminal.fontSize}px` }}>
                                        <div className="opacity-50">{t('profile.terminal_preview_line1')}</div>
                                        <div>{t('profile.terminal_preview_line2')}</div>
                                        <div className={`mt-1 ${theme.text}`}>{'>'} _</div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* --- NOTIFICATIONS TAB --- */}
                    {activeTab === 'NOTIFICATIONS' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                             <div className="bg-card border border-border p-6 rounded-md shadow-sm transition-all duration-300">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className={`p-2 bg-blue-500/10 text-blue-500 rounded-md`}>
                                        <BellRing size={20} />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold">{t('profile.local_alerts_title')}</h2>
                                        <p className="text-sm text-muted-foreground">{t('profile.local_alerts_desc')}</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-4 border border-border rounded-md">
                                        <div>
                                            <h4 className="text-sm font-medium">{t('profile.browser_notif_title')}</h4>
                                            <p className="text-xs text-muted-foreground">{t('profile.browser_notif_desc')}</p>
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

                                    <div className="flex items-center justify-between p-4 border border-border rounded-md">
                                        <div className="flex items-center gap-3">
                                            <Volume2 className="text-muted-foreground" size={20} />
                                            <div>
                                                <h4 className="text-sm font-medium">{t('profile.sound_notif_title')}</h4>
                                                <p className="text-xs text-muted-foreground">{t('profile.sound_notif_desc')}</p>
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
                              <div className="bg-card border border-border p-6 rounded-md shadow-sm transition-all duration-300">
                                <div className="flex gap-6 items-start">
                                    {/* 3D Skin Preview (Simulated via Image) */}
                                    <div className="shrink-0 w-32 h-64 bg-secondary/50 rounded-md border border-border flex items-center justify-center relative overflow-hidden">
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
                                            {t('common.preview')}
                                        </div>
                                    </div>

                                    <div className="flex-1">
                                        <h2 className="text-lg font-bold mb-2">{t('profile.minecraft_link_title')}</h2>
                                        <p className="text-sm text-muted-foreground mb-4">
                                            {t('profile.minecraft_link_desc')}
                                        </p>

                                        <div className="max-w-xs">
                                            <label className="text-xs font-medium text-muted-foreground uppercase">{t('profile.minecraft_ign_label')}</label>
                                            <div className="flex gap-2 mt-1.5">
                                                <input 
                                                    type="text" 
                                                    placeholder={t('profile.minecraft_ign_placeholder')}
                                                    value={ignInput}
                                                    onChange={(e) => setIgnInput(e.target.value)}
                                                    className="flex-1 bg-secondary border border-border text-foreground placeholder:text-muted-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                                />
                                                <button 
                                                    onClick={handleLinkMinecraft}
                                                    disabled={isSaving || !ignInput}
                                                    className={`px-4 text-foreground rounded-md transition-colors disabled:opacity-50 ${theme.bg} hover:opacity-90`}
                                                >
                                                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Link size={16} />}
                                                </button>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground mt-2">
                                                {t('profile.minecraft_link_hint')}
                                            </p>
                                        </div>

                                        <div className="mt-8 border-t border-border pt-4">
                                            <h3 className="text-sm font-semibold mb-3">{t('profile.sync_settings_title')}</h3>
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <Check size={16} className={theme.text} />
                                                    <span>{t('profile.auto_op_label')}</span>
                                                </div>
                                                <button 
                                                    onClick={handleSyncMinecraftSkin}
                                                    disabled={isSaving || !user.minecraftIgn}
                                                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
                                                >
                                                    <div className={`w-4 h-4 rounded border border-border flex items-center justify-center transition-colors ${user.avatarUrl?.includes('mc-heads.net') ? theme.bg + ' border-transparent' : 'bg-transparent'}`}>
                                                        {user.avatarUrl?.includes('mc-heads.net') && <Check size={12} className="text-white" />}
                                                    </div>
                                                    <span>{t('profile.sync_skin_label')}</span>
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
                             <div className="bg-card border border-border p-6 rounded-md shadow-sm transition-all duration-300">
                                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                    <Key size={18} className={theme.text} /> {t('profile.api_title')}
                                </h2>
                                <p className="text-sm text-muted-foreground mb-6">
                                    {t('profile.api_desc')}
                                </p>

                                <div className="bg-background border border-border rounded-md p-4 flex items-center justify-between gap-4 mb-4">
                                    <code className={`font-mono text-sm break-all ${theme.text}`}>
                                        {user.apiKey || t('profile.no_api_key')}
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

                                <button 
                                    onClick={handleGenerateKey}
                                    className="bg-secondary text-foreground border border-border px-4 py-2 rounded-md text-sm font-medium hover:bg-secondary/80 transition-colors flex items-center gap-2"
                                >
                                    <RefreshCw size={14} /> {user.apiKey ? t('profile.rotate_key_btn') : t('profile.generate_key_btn')}
                                </button>
                            </div>

                             <div className="bg-blue-500/5 border border-blue-500/20 rounded-md p-6">
                                <h3 className="font-semibold text-blue-500 text-sm mb-2">{t('profile.docs_title')}</h3>
                                <p className="text-xs text-blue-400/70 mb-4">
                                    {t('profile.docs_desc')}
                                </p>
                                <button className="text-xs text-blue-400 font-medium hover:underline flex items-center gap-1">
                                    {t('profile.view_docs_btn')} <Code size={12} />
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
                    <div className="bg-card border border-border p-6 rounded-md shadow-sm transition-all duration-300 sticky top-24">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">{t('profile.strength_title')}</h3>
                        
                        <div className="space-y-4">
                             <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm">
                                    <Mail size={16} className={theme.text} />
                                    {t('profile.email_verified')}
                                </div>
                                <Check size={16} className={theme.text} />
                            </div>
                             <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm">
                                    <Lock size={16} className={user.email === 'admin@craftcommand.io' ? "text-amber-500" : theme.text} />
                                    {t('profile.password_strength')}
                                </div>
                                <span className={`text-xs font-medium ${user.email === 'admin@craftcommand.io' ? "text-amber-500" : theme.text}`}>
                                    {user.email === 'admin@craftcommand.io' ? t('profile.strength_weak') : t('profile.strength_strong')}
                                </span>
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-border">
                             <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">{t('profile.preferences_summary_title')}</h3>
                             <div className="space-y-3">
                                 <div className="flex justify-between items-center text-sm">
                                     <span>{t('profile.theme_label')}</span>
                                     <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: user.preferences.accentColor === 'emerald' ? '#10b981' : user.preferences.accentColor === 'blue' ? '#3b82f6' : user.preferences.accentColor === 'violet' ? '#8b5cf6' : user.preferences.accentColor === 'rose' ? '#f43f5e' : '#f59e0b' }}></div>
                                        <span className="capitalize text-xs text-muted-foreground">{user.preferences.accentColor}</span>
                                     </div>
                                 </div>
                                 <div className="flex justify-between items-center text-sm">
                                     <span>{t('profile.browser_alerts_label')}</span>
                                     <span className={`text-xs ${user.preferences.notifications.browser ? theme.text : 'text-muted-foreground'}`}>
                                        {user.preferences.notifications.browser ? t('common.on') : t('common.off')}
                                     </span>
                                 </div>
                                 <div className="flex justify-between items-center text-sm">
                                     <span>{t('profile.console_font_label')}</span>
                                     <span className="text-xs text-muted-foreground font-mono">{user.preferences.terminal.fontSize}px</span>
                                 </div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
            {/* Background Manager Modal */}
            <AnimatePresence>
                {showBackgroundModal && (
                    <BackgroundManagerModal
                        onClose={() => setShowBackgroundModal(false)}
                        currentBackgrounds={user.preferences.backgrounds || {}}
                        visualQuality={user.preferences.visualQuality}
                        onSave={(newBackgrounds) => {
                            updatePreferences({ backgrounds: newBackgrounds });
                            setShowBackgroundModal(false);
                            addToast('success', t('profile.backgrounds_updated_success'), t('profile.backgrounds_updated_msg'));
                        }}
                    />
                )}
                {show2FAWizard && (
                    <TwoFactorSetupWizard 
                        onClose={() => setShow2FAWizard(false)}
                        onComplete={() => {
                            setShow2FAWizard(false);
                            // Refresh logic is already handled by context if needed, 
                            // but we can trigger a re-fetch of user data here if API provides it.
                        }}
                    />
                )}
            </AnimatePresence>

            <ConfirmDialog 
                isOpen={isConfirmOpen}
                {...confirmConfig}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
            />
            <PromptDialog 
                isOpen={isPromptOpen}
                {...promptConfig}
                onConfirm={handlePromptConfirm}
                onCancel={handlePromptCancel}
            />
        </div>
    );
};

export default UserProfileView;
