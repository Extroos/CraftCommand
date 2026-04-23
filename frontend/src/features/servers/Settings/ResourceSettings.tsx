
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, RotateCcw, ShieldCheck, ChevronRight, Lock, Eye, ShieldAlert, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { STAGGER_ITEM } from '../../../styles/motion';
import { useToast } from '../../ui/Toast';
import { useConfirm } from '../../ui/hooks/useConfirm';
import { API } from '@core/services/api';
import { ConfirmDialog } from '../../ui/ConfirmDialog';

interface ResourceSettingsProps {
    serverId: string;
}

const ResourceCard: React.FC<{ 
    title: string; 
    description: string; 
    icon: React.ReactNode; 
    children: React.ReactNode; 
    action?: React.ReactNode 
}> = ({ title, description, icon, children, action }) => (
    <motion.div 
        variants={STAGGER_ITEM}
        className="p-6 bg-card rounded-md border border-border/40 shadow-sm"
    >
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-border/60">
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/5 border border-primary/10">
                    {icon}
                </div>
                <div>
                    <h3 className="text-sm font-bold text-foreground/90 uppercase tracking-tight">{title}</h3>
                    <p className="text-[10px] text-muted-foreground font-medium opacity-70">{description}</p>
                </div>
            </div>
            {action}
        </div>
        {children}
    </motion.div>
);

export const ResourceSettings: React.FC<ResourceSettingsProps> = ({ serverId }) => {
    const { t } = useTranslation();
    const { addToast } = useToast();
    const { isOpen: isConfirmOpen, config: confirmConfig, confirm, handleConfirm, handleCancel } = useConfirm();
    const [isRotatingKey, setIsRotatingKey] = React.useState(false);

    const handleRotateKey = async () => {
        const isConfirmed = await confirm({
            title: t('settings.resources.rotate_title'),
            description: t('settings.resources.rotate_desc_dialog'),
            confirmText: t('settings.resources.rotate_confirm'),
            cancelText: t('common.cancel'),
            isDestructive: true
        });

        if (!isConfirmed) return;

        setIsRotatingKey(true);
        try {
            await API.rotateApiKey();
            addToast('warning', t('settings.resources.security_event'), t('settings.resources.rotate_success_desc'));
        } catch (e: any) {
            addToast('error', t('settings.connectivity.rotate_failed'), e.message || t('settings.resources.rotate_key_failed'));
        } finally {
            setIsRotatingKey(false);
        }
    };

    return (
        <div className="space-y-6">
            <motion.div 
                variants={STAGGER_ITEM}
                className="grid grid-cols-1 xl:grid-cols-3 gap-6"
            >
                <div className="xl:col-span-2 p-6 bg-card rounded-md border border-border/40 shadow-sm">
                    <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border/60">
                        <div className="p-2 rounded-md bg-rose-500/5 border border-rose-500/10">
                            <Key size={16} className="text-rose-500/70" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-foreground/90 uppercase tracking-tight">{t('settings.resources.api_title')}</h3>
                            <p className="text-[10px] text-muted-foreground font-medium opacity-70">{t('settings.resources.api_desc')}</p>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-6 items-center">
                        <div className="flex-1 space-y-4">
                             <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em]">{t('settings.resources.app_secret')}</label>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 px-3 py-2 bg-muted/20 border border-border/40 rounded-md font-mono text-xs flex items-center justify-between group">
                                        <span className="text-muted-foreground/30 select-none">••••••••••••••••••••••••••••••••</span>
                                        <button className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"><Eye size={14} /></button>
                                    </div>
                                    <button 
                                        onClick={handleRotateKey}
                                        disabled={isRotatingKey}
                                        className="h-[34px] px-4 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/20 rounded-md text-[9px] font-black text-rose-500 uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50"
                                     >
                                        {isRotatingKey ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                                        {isRotatingKey ? t('common.processing') : t('settings.resources.rotate_key')}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="w-full md:w-64 p-4 bg-muted/10 border border-border/40 rounded-md border-l-4 border-l-rose-500/40" style={{ backdropFilter: 'blur(4px)' }}>
                              <div className="flex items-center gap-2 mb-2">
                                 <ShieldAlert size={14} className="text-rose-500/70" />
                                 <h4 className="text-[9px] font-black text-rose-500/80 uppercase tracking-widest">{t('settings.resources.security_warning')}</h4>
                             </div>
                             <p className="text-[9px] text-muted-foreground leading-relaxed uppercase font-bold tracking-tight opacity-60">
                                 {t('settings.resources.rotate_warning_text')}
                             </p>
                        </div>
                    </div>
                </div>

                <div className="p-6 bg-primary/5 rounded-md border border-primary/10 flex flex-col items-center justify-center text-center">
                     <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 border border-primary/20">
                        <Lock size={20} className="text-primary/70" />
                    </div>
                    <h4 className="text-xs font-black text-foreground/80 uppercase tracking-widest mb-2">{t('settings.resources.immutable_logs')}</h4>
                    <p className="text-[10px] text-muted-foreground font-medium mb-4 leading-relaxed uppercase tracking-tighter">
                        {t('settings.resources.immutable_logs_desc')}
                    </p>
                    <button className="text-[9px] font-black text-primary/60 hover:text-primary transition-all uppercase tracking-[0.2em] flex items-center gap-2">
                        {t('settings.resources.view_audit')} <ChevronRight size={12} />
                    </button>
                </div>
            </motion.div>

            <ConfirmDialog 
                isOpen={isConfirmOpen}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
                {...confirmConfig}
            />
        </div>
    );
};
