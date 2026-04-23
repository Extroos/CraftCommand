
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, ArrowLeft, ArrowRight, Shield, Globe, ExternalLink, Activity, CheckCircle2, Zap } from 'lucide-react';
import { API } from '@core/services/api';
import { useTranslation } from 'react-i18next';
import { useToast } from '../ui/Toast';

interface StepProps {
    onNext: () => void;
    onBack?: () => void;
    data: any;
    setData: (data: any) => void;
}

export const PublicAccessWizard: React.FC<{ serverId: string; onClose: () => void }> = ({ serverId, onClose }) => {
    const { t } = useTranslation();
    const [step, setStep] = useState(1);
    const [data, setData] = useState({
        publicAccess: 'none',
        tunnelToken: '',
        playitSecret: ''
    });

    const nextStep = () => setStep(s => s + 1);
    const prevStep = () => setStep(s => s - 1);

    const renderStep = () => {
        switch(step) {
            case 1: return <ProviderStep onNext={nextStep} data={data} setData={setData} />;
            case 2: return <ConfigStep onNext={nextStep} onBack={prevStep} data={data} setData={setData} />;
            case 3: return <FinalizeStep serverId={serverId} onNext={onClose} onBack={prevStep} data={data} />;
            default: return null;
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden"
            >
                <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 text-primary rounded-lg">
                            <Zap size={18} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold">{t('settings.networking.wizard.title')}</h2>
                            <p className="text-xs text-muted-foreground italic">{t('settings.networking.wizard.subtitle')}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-secondary rounded-lg text-muted-foreground transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-8">
                    {renderStep()}
                </div>
            </motion.div>
        </div>
    );
};

const ProviderStep: React.FC<StepProps> = ({ onNext, data, setData }) => {
    const { t } = useTranslation();
    const providers = [
        { id: 'cloudflare', name: 'Cloudflare', icon: <Globe size={18} />, desc: t('settings.networking.wizard.cloudflare_desc') },
        { id: 'playit', name: 'Playit.gg', icon: <Zap size={18} />, desc: t('settings.networking.wizard.playit_desc') },
        { id: 'none', name: 'None (Traditional)', icon: <Shield size={18} />, desc: 'Use manual port forwarding.' }
    ];

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h3 className="text-lg font-bold">{t('settings.networking.wizard.choose_provider')}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    {t('settings.networking.wizard.provider_desc')}
                </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {providers.map(p => (
                    <button
                        key={p.id}
                        onClick={() => setData({ ...data, publicAccess: p.id })}
                        className={`flex items-start gap-4 p-4 rounded-xl border transition-all text-left ${
                            data.publicAccess === p.id 
                                ? 'bg-primary/10 border-primary ring-1 ring-primary shadow-sm' 
                                : 'bg-secondary/20 border-border/50 hover:bg-secondary/40'
                        }`}
                    >
                        <div className={`p-2 rounded-lg ${data.publicAccess === p.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                            {p.icon}
                        </div>
                        <div className="flex-1">
                            <div className="font-bold text-sm mb-1">{p.name}</div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{p.desc}</p>
                        </div>
                    </button>
                ))}
            </div>

            <div className="pt-4 flex justify-end">
                <button 
                    onClick={onNext}
                    disabled={data.publicAccess === 'none'}
                    className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-bold text-sm disabled:opacity-50"
                >
                    Continue <ArrowRight size={16} />
                </button>
            </div>
        </div>
    );
};

const ConfigStep: React.FC<StepProps> = ({ onNext, onBack, data, setData }) => {
    const { t } = useTranslation();
    const isCloudflare = data.publicAccess === 'cloudflare';
    const providerName = isCloudflare ? 'Cloudflare' : 'Playit.gg';

    return (
        <div className="space-y-6">
            <div className="space-y-2 text-center mb-8">
                <h3 className="text-lg font-bold">{t('settings.networking.wizard.config_provider', { provider: providerName })}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    {t('settings.networking.wizard.config_desc', { provider: providerName })}
                </p>
            </div>

            <div className="space-y-4 max-w-sm mx-auto">
                {isCloudflare ? (
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-1">{t('settings.networking.wizard.cf_token_label')}</label>
                        <div className="relative">
                            <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                            <input 
                                autoFocus
                                type="password"
                                value={data.tunnelToken}
                                onChange={(e) => setData({ ...data, tunnelToken: e.target.value })}
                                placeholder={t('settings.networking.wizard.cf_token_placeholder')}
                                className="w-full bg-secondary/50 border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                            />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-1">{t('settings.networking.wizard.playit_secret_label')}</label>
                        <div className="relative">
                            <Zap className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                            <input 
                                autoFocus
                                type="password"
                                value={data.playitSecret}
                                onChange={(e) => setData({ ...data, playitSecret: e.target.value })}
                                placeholder={t('settings.networking.wizard.playit_secret_placeholder')}
                                className="w-full bg-secondary/50 border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                            />
                        </div>
                    </div>
                )}

                <div className="bg-blue-500/5 p-4 rounded-xl border border-blue-500/20">
                    <h4 className="text-xs font-bold text-blue-600 uppercase mb-2">Instructions</h4>
                    <ul className="text-[11px] text-blue-700/80 space-y-2">
                        {isCloudflare ? (
                            <>
                                <li>• Go to <a href="https://dash.cloudflare.com" target="_blank" rel="noreferrer" className="underline font-bold">Cloudflare Dashboard</a></li>
                                <li>• Navigate to <b>Zero Trust</b> → <b>Networks</b> → <b>Tunnels</b></li>
                                <li>• Create a new tunnel and copy the <b>Token</b> provided.</li>
                            </>
                        ) : (
                            <>
                                <li>• Go to <a href="https://playit.gg" target="_blank" rel="noreferrer" className="underline font-bold">Playit.gg</a></li>
                                <li>• Create an account and download the <b>Secret Key</b> for a new agent.</li>
                                <li>• This key allows CraftCommand to manage the tunnel for you.</li>
                            </>
                        )}
                    </ul>
                </div>
            </div>

            <div className="pt-8 flex justify-between border-t border-border/50">
                <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-bold text-sm px-4">
                    <ArrowLeft size={16} /> Back
                </button>
                <button 
                    onClick={onNext}
                    disabled={isCloudflare ? !data.tunnelToken : !data.playitSecret}
                    className="flex items-center gap-2 bg-primary text-primary-foreground px-8 py-2.5 rounded-lg font-bold text-sm disabled:opacity-50 shadow-sm"
                >
                    Finalize <ArrowRight size={16} />
                </button>
            </div>
        </div>
    );
};

const FinalizeStep: React.FC<{ serverId: string; onNext: () => void; onBack: () => void; data: any }> = ({ serverId, onNext, onBack, data }) => {
    const { t } = useTranslation();
    const { addToast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const handleSave = async () => {
        setIsLoading(true);
        try {
            await API.updateServer(serverId, {
                network: {
                    publicAccess: data.publicAccess,
                    tunnelToken: data.tunnelToken,
                    playitSecret: data.playitSecret
                }
            });
            addToast('success', 'Public Access', t('settings.networking.wizard.save_success'));
            onNext();
        } catch (e: any) {
            addToast('error', 'Update Failed', e.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6 flex flex-col items-center">
            <div className="flex flex-col items-center py-8 space-y-4 text-center">
                <div className="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center">
                    <CheckCircle2 size={32} />
                </div>
                <div className="space-y-2 max-w-sm">
                    <h3 className="text-xl font-bold">{t('settings.networking.wizard.verify_title')}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {t('settings.networking.wizard.verify_desc')}
                    </p>
                </div>
            </div>

            <div className="w-full pt-8 flex justify-between border-t border-border/50">
                <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-bold text-sm px-4">
                    <ArrowLeft size={16} /> Edit Credentials
                </button>
                <button 
                    onClick={handleSave}
                    disabled={isLoading}
                    className="bg-primary text-primary-foreground px-8 py-2.5 rounded-lg font-bold text-sm shadow-sm flex items-center gap-2"
                >
                    {isLoading ? <Activity size={16} className="animate-spin" /> : 'Confirm Setup'}
                </button>
            </div>
        </div>
    );
};
