import React from 'react';
import { motion } from 'framer-motion';
import { Terminal, Copy, Check, RotateCcw, Network, ShieldCheck, Globe, Wifi, Activity, ExternalLink, Key, Loader2 } from 'lucide-react';
import { STAGGER_ITEM } from '../../../styles/motion';
import { useToast } from '../../ui/Toast';
import { useConfirm } from '../../ui/hooks/useConfirm';
import { API } from '@core/services/api';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { useTranslation } from 'react-i18next';

interface ConnectivitySettingsProps {
    currentServer: any;
    serverId: string;
}

const CopyableField: React.FC<{ label: string; value: string; icon: React.ReactNode }> = ({ label, value, icon }) => {
    const { t } = useTranslation();
    const { addToast } = useToast();
    const [copied, setCopied] = React.useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        addToast('info', t('common.copied_to_clipboard'), t('common.copied_desc', { name: label }));
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="group space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest flex items-center gap-2">
                {icon}
                {label}
            </label>
            <div className="relative flex items-center bg-muted/20 border border-border/40 rounded-md hover:border-primary/30 transition-all p-1 pl-3">
                <code className="flex-1 text-[11px] font-mono text-primary/80 truncate pr-8 select-all">
                    {value}
                </code>
                <button 
                    onClick={handleCopy}
                    className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground/40 hover:text-primary transition-all active:scale-95"
                    title={t('common.copy_value', { name: label })}
                >
                    {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                </button>
            </div>
        </div>
    );
};

export const ConnectivitySettings: React.FC<ConnectivitySettingsProps> = ({ currentServer, serverId }) => {
    const { t } = useTranslation();
    const { addToast } = useToast();
    const { isOpen: isConfirmOpen, config: confirmConfig, confirm, handleConfirm, handleCancel } = useConfirm();
    const [isResetting, setIsResetting] = React.useState(false);
    const [ports, setPorts] = React.useState<any[]>([]);
    const [isLoadingPorts, setIsLoadingPorts] = React.useState(true);

    const fetchPorts = React.useCallback(async () => {
        setIsLoadingPorts(true);
        try {
            const data = await API.getServerPorts(serverId);
            setPorts(data);
        } catch (e) {
            console.error("Failed to fetch ports", e);
            addToast('error', t('common.error'), t('settings.connectivity.fetch_ports_failed'));
        } finally {
            setIsLoadingPorts(false);
        }
    }, [serverId]);

    React.useEffect(() => {
        fetchPorts();
    }, [fetchPorts]);

    const handleAddPort = async () => {
        try {
            const newPort = await API.assignServerPort(serverId);
            setPorts([...ports, newPort]);
            addToast('success', t('settings.connectivity.port_allocated'), t('settings.connectivity.port_allocated_desc', { port: newPort.port }));
        } catch (e: any) {
            addToast('error', t('settings.connectivity.allocation_failed'), e.message || t('settings.connectivity.add_port_failed'));
        }
    };

    const handleRotatePort = async (id: string) => {
        const portObj = ports.find(p => p.id === id);
        if (!portObj || portObj.isImmutable) return;

        const isConfirmed = await confirm({
            title: t('settings.connectivity.rotate_title'),
            description: t('settings.connectivity.rotate_desc', { port: portObj.port }),
            confirmText: t('settings.connectivity.rotate_confirm'),
            cancelText: t('common.cancel')
        });

        if (!isConfirmed) return;

        try {
            const updatedPort = await API.rotateServerPort(serverId, id);
            setPorts(current => current.map(p => p.id === id ? updatedPort : p));
            addToast('success', t('settings.connectivity.rotate_success'), t('settings.connectivity.rotate_success_desc', { port: updatedPort.port }));
        } catch (e: any) {
            addToast('error', t('settings.connectivity.rotate_failed'), e.message || 'Failed to rotate port.');
        }
    };

    const handleResetSftp = async () => {
        const isConfirmed = await confirm({
            title: t('settings.connectivity.reset_title'),
            description: t('settings.connectivity.reset_desc_dialog'),
            confirmText: t('settings.connectivity.reset_confirm'),
            cancelText: t('common.cancel'),
            isDestructive: true
        });

        if (!isConfirmed) return;

        setIsResetting(true);
        try {
            await API.resetSftpPassword(serverId);
            addToast('success', t('settings.connectivity.reset_success'), t('settings.connectivity.reset_success_desc'));
        } catch (e: any) {
            addToast('error', t('settings.connectivity.reset_failed'), e.message || 'Failed to reset SFTP access.');
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
            {/* SFTP Credentials Panel */}
            <div className="xl:col-span-2 space-y-6">
                <motion.div 
                    variants={STAGGER_ITEM}
                    className="p-6 bg-card rounded-md border border-border/40 shadow-sm"
                >
                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-border/60">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-md bg-primary/5 border border-primary/10">
                                <Terminal size={16} className="text-primary/70" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-foreground/90 uppercase tracking-tight">{t('settings.connectivity.sftp_title')}</h3>
                                <p className="text-[10px] text-muted-foreground font-medium opacity-70">{t('settings.connectivity.sftp_desc')}</p>
                            </div>
                        </div>
                        <div className="px-2 py-0.5 rounded text-[8px] font-black bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase tracking-widest">
                            {t('settings.connectivity.connection_active')}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <CopyableField 
                                label={t('settings.connectivity.hostname')} 
                                value={typeof window !== 'undefined' ? window.location.hostname : 'sftp.craft-commands.com'} 
                                icon={<Globe size={10} />} 
                            />
                            <CopyableField 
                                label={t('settings.connectivity.port')} 
                                value="2022" 
                                icon={<Wifi size={10} />} 
                            />
                        </div>
                        <div className="space-y-4">
                            <CopyableField 
                                label={t('settings.connectivity.username')} 
                                value={`u${serverId?.substring(0, 8) || '00000000'}`} 
                                icon={<Key size={10} />} 
                            />
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest flex items-center gap-2">
                                    <ShieldCheck size={10} />
                                    {t('settings.connectivity.password')}
                                </label>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 px-3 py-1.5 bg-muted/10 border border-border/40 rounded-md italic text-[11px] text-muted-foreground/40 font-mono">
                                        {t('settings.connectivity.panel_password_hint')}
                                    </div>
                                    <button 
                                        onClick={handleResetSftp}
                                        disabled={isResetting}
                                        className="h-[30px] px-3 bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-md text-[9px] font-bold text-primary/80 transition-all flex items-center gap-2 uppercase tracking-tight whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isResetting ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                                        {isResetting ? t('common.processing') : t('settings.connectivity.reset_access')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 p-4 bg-muted/10 border border-border/40 rounded-md border-l-4 border-l-amber-500/40">
                        <p className="text-[10px] text-muted-foreground leading-relaxed flex items-start gap-3">
                            <Activity size={12} className="text-amber-500/60 mt-0.5 flex-shrink-0" />
                            <span>
                                <strong className="text-foreground/80 lowercase">{t('common.pro_tip')}:</strong> {t('settings.connectivity.sftp_pro_tip')}
                            </span>
                        </p>
                    </div>
                </motion.div>

                {/* Port Allocations */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className="p-6 bg-card rounded-md border border-border/40 shadow-sm"
                >
                    <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border/60">
                        <div className="p-2 rounded-md bg-primary/5 border border-primary/10">
                            <Network size={16} className="text-primary/70" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-foreground/90 uppercase tracking-tight">{t('settings.connectivity.port_allocations')}</h3>
                            <p className="text-[10px] text-muted-foreground font-medium opacity-70">{t('settings.connectivity.port_alloc_desc')}</p>
                        </div>
                    </div>

                    <div className="overflow-hidden border border-border/40 rounded-md">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-muted/30 border-b border-border/40">
                                    <th className="px-4 py-2 text-[9px] font-black text-muted-foreground uppercase tracking-wider">{t('settings.connectivity.interface')}</th>
                                    <th className="px-4 py-2 text-[9px] font-black text-muted-foreground uppercase tracking-wider">{t('settings.connectivity.port_internal')}</th>
                                    <th className="px-4 py-2 text-[9px] font-black text-muted-foreground uppercase tracking-wider">{t('common.status')}</th>
                                    <th className="px-4 py-2 text-[9px] font-black text-muted-foreground uppercase tracking-wider text-right">{t('common.actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20">
                                {isLoadingPorts ? (
                                    <tr>
                                        <td colSpan={4} className="py-12 text-center">
                                            <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
                                                <Loader2 size={20} className="animate-spin" />
                                                <span className="text-[9px] font-black uppercase tracking-widest">{t('settings.connectivity.sync_nodes')}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : ports.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="py-12 text-center text-[10px] text-muted-foreground/40 uppercase font-bold tracking-widest">
                                            {t('settings.connectivity.no_ports')}
                                        </td>
                                    </tr>
                                ) : (
                                    ports.map((p) => (
                                        <tr key={p.id} className="hover:bg-muted/10 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${
                                                        p.status === 'Listening' || p.status === 'Active' 
                                                            ? 'bg-primary animate-pulse shadow-[0_0_5px_rgba(var(--primary-rgb),0.5)]' 
                                                            : p.status === 'Rotating' || p.status === 'Provisioning'
                                                                ? 'bg-amber-500 animate-spin'
                                                                : 'bg-muted-foreground/30'
                                                    }`} />
                                                    <span className={`text-[11px] font-bold uppercase ${p.isImmutable ? 'text-foreground/80' : 'text-muted-foreground/60'}`}>
                                                        {p.name}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <code className={`text-[11px] font-mono font-bold ${p.isImmutable ? 'text-primary' : 'text-muted-foreground/60'}`}>
                                                    {p.port}
                                                </code>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-[9px] font-black uppercase tracking-widest ${
                                                    p.status === 'Listening' || p.status === 'Active' ? 'text-emerald-500' : 'text-muted-foreground/30'
                                                }`}>
                                                    {p.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {p.isImmutable ? (
                                                    <span className="text-[8px] font-bold text-muted-foreground/30 uppercase cursor-default">{t('settings.connectivity.immutable')}</span>
                                                ) : (
                                                    <button 
                                                        onClick={() => handleRotatePort(p.id)}
                                                        className="p-1 hover:bg-primary/10 rounded text-rose-500/40 hover:text-rose-500 transition-colors ml-auto"
                                                        title={t('settings.connectivity.rotate_port')}
                                                    >
                                                        <RotateCcw size={10} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                        <div className="p-3 bg-muted/5 flex justify-center border-t border-border/40">
                             <button 
                                onClick={handleAddPort}
                                className="text-[9px] font-black text-muted-foreground/40 hover:text-primary transition-all uppercase tracking-widest flex items-center gap-2 border border-dashed border-border/60 px-4 py-1.5 rounded hover:border-primary/20 hover:bg-primary/5"
                             >
                                <Check size={10} /> {t('settings.connectivity.add_port')}
                             </button>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Quick Stats Sidebar (Pro Style) */}
            <div className="space-y-6">
                <motion.div 
                    variants={STAGGER_ITEM}
                    className="p-5 bg-card rounded-md border border-border/40 shadow-sm"
                >
                    <h3 className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] mb-4">{t('settings.connectivity.traffic_stats')}</h3>
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                        <Activity size={20} className="text-muted-foreground/15 mb-2" />
                        <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-wider">{t('settings.connectivity.metrics_unavailable')}</p>
                        <p className="text-[8px] text-muted-foreground/25 mt-1 leading-relaxed max-w-[140px]">{t('settings.connectivity.metrics_desc')}</p>
                    </div>
                </motion.div>

                 <motion.div 
                    variants={STAGGER_ITEM}
                    className="p-5 bg-card rounded-md border border-border/40 shadow-sm"
                >
                    <h3 className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] mb-4">{t('common.documentation')}</h3>
                    <div className="space-y-2">
                        <a href="#" className="group flex items-center justify-between p-2 rounded border border-border/20 hover:border-primary/20 hover:bg-primary/5 transition-all">
                            <span className="text-[10px] font-bold text-muted-foreground/80 group-hover:text-primary transition-colors uppercase">{t('settings.connectivity.sftp_guide')}</span>
                            <ExternalLink size={10} className="text-muted-foreground/20 group-hover:text-primary/40" />
                        </a>
                        <a href="#" className="group flex items-center justify-between p-2 rounded border border-border/20 hover:border-primary/20 hover:bg-primary/5 transition-all">
                            <span className="text-[10px] font-bold text-muted-foreground/80 group-hover:text-primary transition-colors uppercase">{t('settings.connectivity.port_forwarding')}</span>
                            <ExternalLink size={10} className="text-muted-foreground/20 group-hover:text-primary/40" />
                        </a>
                    </div>
                </motion.div>
            </div>

            <ConfirmDialog 
                isOpen={isConfirmOpen}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
                {...confirmConfig}
            />
        </div>
    );
};
