import React, { useState } from 'react';
import { X, Image as ImageIcon, Settings, Eye, EyeOff, Sliders, Trash2, Globe, Monitor, Terminal as TerminalIcon, FileText, Layout, Shield, Users as UsersIcon, Clock, HardDrive, Cpu, ExternalLink, Upload, AlertCircle, Loader2, Webhook, Layers, Zap } from 'lucide-react';
import { CustomBackgrounds, BackgroundSettings } from '@shared/types';
import { motion, AnimatePresence } from 'framer-motion';
import { STAGGER_CONTAINER, STAGGER_ITEM } from '../../styles/motion';
import { API } from '@core/services/api';

interface BackgroundManagerModalProps {
    onClose: () => void;
    currentBackgrounds: CustomBackgrounds;
    onSave: (backgrounds: CustomBackgrounds) => void;
    visualQuality: boolean;
}

const VIEW_CONFIGS = [
    { key: 'global', label: 'Global / Default', icon: ImageIcon },
    { key: 'login', label: 'Login Page', icon: Globe },
    { key: 'serverSelection', label: 'Server Selection', icon: Monitor },
    { key: 'dashboard', label: 'Dashboard', icon: Layout },
    { key: 'console', label: 'Terminal / Console', icon: TerminalIcon },
    { key: 'files', label: 'File Manager', icon: FileText },
    { key: 'plugins', label: 'Plugin Manager', icon: Cpu },
    { key: 'schedules', label: 'Schedules', icon: Clock },
    { key: 'backups', label: 'Backups', icon: HardDrive },
    { key: 'players', label: 'Player Manager', icon: UsersIcon },
    { key: 'access', label: 'Access Control', icon: Shield },
    { key: 'integrations', label: 'Integrations', icon: Webhook },
    { key: 'network', label: 'Proxy Network', icon: Globe },
    { key: 'settings', label: 'Server Settings', icon: Settings },
    { key: 'architect', label: 'Architect Views', icon: Layers },
    { key: 'users', label: 'User Management', icon: UsersIcon },
    { key: 'profile', label: 'User Profile', icon: Settings },
    { key: 'globalSettings', label: 'System Configuration', icon: Shield },
    { key: 'operations', label: 'Global Operations', icon: Zap },
    { key: 'auditLog', label: 'Audit Log', icon: Shield },
    { key: 'status', label: 'Public Status', icon: Globe },
];

const BackgroundManagerModal: React.FC<BackgroundManagerModalProps> = ({ onClose, currentBackgrounds, onSave, visualQuality }) => {
    const [backgrounds, setBackgrounds] = useState<CustomBackgrounds>({ ...currentBackgrounds });
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleUpdate = (key: string, updates: Partial<BackgroundSettings>) => {
        const current = backgrounds[key as keyof CustomBackgrounds] || { enabled: false, url: '', opacity: 0.2, blur: 5 };
        setBackgrounds({
            ...backgrounds,
            [key]: { ...current, ...updates }
        });
    };

    const handleUploadClick = () => {
        setUploadError(null);
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setUploadError('Please select a valid image file.');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            setUploadError('Image must be smaller than 10MB.');
            return;
        }

        setIsUploading(true);
        try {
            const result = await API.uploadBackground(file);
            if (activeKey) {
                handleUpdate(activeKey, { url: result.url, enabled: true });
            }
        } catch (err: any) {
            setUploadError(err.message || 'Failed to upload background.');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleClear = (key: string) => {
        const newBackgrounds = { ...backgrounds };
        delete newBackgrounds[key as keyof CustomBackgrounds];
        setBackgrounds(newBackgrounds);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className={`max-w-4xl w-full h-[80vh] flex flex-col overflow-hidden border border-border/50 ${visualQuality ? 'glass-morphism quality-shadow rounded-2xl' : 'bg-card rounded-xl shadow-2xl'}`}
            >
                {/* Header */}
                <div className="p-6 border-b border-border flex items-center justify-between bg-zinc-900/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                            <ImageIcon size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-foreground">Background Customization</h2>
                            <p className="text-xs text-muted-foreground">Personalize your workspace with custom imagery.</p>
                        </div>
                    </div>
                    {!visualQuality && (
                        <div className="bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2 text-[10px] font-bold text-amber-500 animate-pulse">
                            <AlertCircle size={14} />
                            <span>QUALITY MODE OFF: CHANGES WILL NOT BE VISIBLE</span>
                        </div>
                    )}
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex">
                    {/* Navigation */}
                    <div className="w-64 border-r border-border overflow-y-auto p-2 space-y-1 bg-zinc-950/20">
                        {VIEW_CONFIGS.map((view) => {
                            const settings = backgrounds[view.key as keyof CustomBackgrounds];
                            const isActive = activeKey === view.key;
                            const Icon = view.icon;

                            return (
                                <button
                                    key={view.key}
                                    onClick={() => setActiveKey(view.key)}
                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all ${
                                        isActive 
                                        ? 'bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20' 
                                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <Icon size={16} />
                                        <span>{view.label}</span>
                                    </div>
                                    {settings?.enabled && settings.url && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Editor */}
                    <div className="flex-1 overflow-y-auto p-8 bg-zinc-900/10">
                        {activeKey ? (
                            <motion.div
                                key={activeKey}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="space-y-8"
                            >
                                <div className="flex items-center justify-between">
                                    <h3 className="text-2xl font-bold flex items-center gap-3">
                                        {VIEW_CONFIGS.find(v => v.key === activeKey)?.label}
                                        <span className="text-xs font-mono text-muted-foreground uppercase bg-secondary px-2 py-0.5 rounded">
                                            {activeKey}
                                        </span>
                                    </h3>
                                    <div className="flex items-center gap-2 bg-secondary/50 p-1 rounded-lg border border-border">
                                        <button
                                            onClick={() => handleUpdate(activeKey, { enabled: true })}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${backgrounds[activeKey as keyof CustomBackgrounds]?.enabled ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                        >
                                            <Eye size={14} /> Enabled
                                        </button>
                                        <button
                                            onClick={() => handleUpdate(activeKey, { enabled: false })}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${!backgrounds[activeKey as keyof CustomBackgrounds]?.enabled ? 'bg-zinc-800 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                        >
                                            <EyeOff size={14} /> Disabled
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    {/* URL & Upload Input */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                                <ExternalLink size={12} /> Image Source
                                            </label>
                                            {uploadError && (
                                                <span className="text-[10px] text-rose-500 font-bold flex items-center gap-1">
                                                    <AlertCircle size={10} /> {uploadError}
                                                </span>
                                            )}
                                        </div>
                                        
                                        <div className="flex gap-2">
                                            <div className="relative flex-1 group">
                                                <input
                                                    type="text"
                                                    value={backgrounds[activeKey as keyof CustomBackgrounds]?.url || ''}
                                                    onChange={(e) => handleUpdate(activeKey, { url: e.target.value })}
                                                    placeholder="https://example.com/image.jpg or /uploads/..."
                                                    className="w-full bg-zinc-950 border border-border focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-4 py-2.5 text-sm transition-all pr-12"
                                                />
                                                {backgrounds[activeKey as keyof CustomBackgrounds]?.url && (
                                                    <button 
                                                        onClick={() => handleUpdate(activeKey, { url: '' })}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-rose-500"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                )}
                                            </div>
                                            
                                            <button
                                                onClick={handleUploadClick}
                                                disabled={isUploading}
                                                className="px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 transition-all flex items-center gap-2 text-sm font-bold disabled:opacity-50"
                                            >
                                                {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                                                <span>Upload</span>
                                            </button>
                                            
                                            <input 
                                                ref={fileInputRef}
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={handleFileChange}
                                            />
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">Provide a link or upload a photo from your computer (Max 10MB).</p>
                                    </div>

                                    {/* Sliders Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4 p-4 bg-zinc-950/40 rounded-xl border border-border/50">
                                            <div className="flex justify-between items-center mb-2">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                                    <Sliders size={12} /> Opacity
                                                </label>
                                                <span className="text-xs font-mono text-primary font-black">
                                                    {Math.round((backgrounds[activeKey as keyof CustomBackgrounds]?.opacity || 0.2) * 100)}%
                                                </span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0.05"
                                                max="1"
                                                step="0.01"
                                                value={backgrounds[activeKey as keyof CustomBackgrounds]?.opacity || 0.2}
                                                onChange={(e) => handleUpdate(activeKey, { opacity: parseFloat(e.target.value) })}
                                                className="w-full h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-primary"
                                            />
                                        </div>

                                        <div className="space-y-4 p-4 bg-zinc-950/40 rounded-xl border border-border/50">
                                            <div className="flex justify-between items-center mb-2">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                                    <Monitor size={12} /> Gaussian Blur
                                                </label>
                                                <span className="text-xs font-mono text-primary font-black">
                                                    {backgrounds[activeKey as keyof CustomBackgrounds]?.blur || 0}px
                                                </span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0"
                                                max="40"
                                                step="1"
                                                value={backgrounds[activeKey as keyof CustomBackgrounds]?.blur || 0}
                                                onChange={(e) => handleUpdate(activeKey, { blur: parseInt(e.target.value) })}
                                                className="w-full h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-primary"
                                            />
                                        </div>
                                    </div>

                                    {/* Preview */}
                                    <div className="space-y-2 pt-4">
                                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Real-time Preview</label>
                                        <div className="aspect-video w-full rounded-xl overflow-hidden border border-border relative bg-black/50 group">
                                            {backgrounds[activeKey as keyof CustomBackgrounds]?.url ? (
                                                <>
                                                    <div 
                                                        className="absolute inset-0 bg-cover bg-center transition-all duration-300"
                                                        style={{ 
                                                            backgroundImage: `url(${backgrounds[activeKey as keyof CustomBackgrounds]?.url})`,
                                                            filter: `blur(${backgrounds[activeKey as keyof CustomBackgrounds]?.blur}px)`,
                                                            opacity: backgrounds[activeKey as keyof CustomBackgrounds]?.opacity || 0.2
                                                        }}
                                                    />
                                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                        <div className={`p-4 rounded-lg bg-black/40 backdrop-blur-md border border-white/5 text-[11px] font-bold text-white/50 uppercase tracking-widest`}>
                                                            Content Preview Area
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/30 gap-3">
                                                    <ImageIcon size={48} />
                                                    <span className="text-xs font-medium uppercase tracking-widest">No URL Provided</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-border flex justify-end">


                                        <button
                                            onClick={() => handleClear(activeKey)}
                                            className="flex items-center gap-2 px-4 py-2 text-sm text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors font-medium"
                                        >
                                            <Trash2 size={16} /> Reset Section
                                        </button>
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                                    <div className="p-6 bg-secondary/30 rounded-full text-primary/40">
                                        <Layout size={64} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-foreground">Select a View</h3>
                                        <p className="text-sm text-muted-foreground max-w-xs mx-auto">Choose a section from the left sidebar to begin customizing its background.</p>
                                    </div>
                                </div>
                            )}
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t border-border bg-zinc-950/40 flex justify-between items-center">
                    <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-[0.2em]">CraftCommand Customization Protocol</p>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 text-sm font-bold text-foreground hover:bg-secondary rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onSave(backgrounds)}
                            className="px-8 py-2.5 bg-primary text-primary-foreground text-sm font-black rounded-lg hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 uppercase tracking-widest"
                        >
                            Commit Changes
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default BackgroundManagerModal;
