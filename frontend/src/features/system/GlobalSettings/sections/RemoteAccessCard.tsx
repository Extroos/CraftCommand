import React from 'react';
import { Monitor, AlertTriangle, Shield } from 'lucide-react';
import { motion } from 'framer-motion';
import { STAGGER_ITEM } from '../../../../styles/motion';
import { GlobalSettings, UserProfile } from '@shared/types';
import { API } from '@core/services/api';
import { useToast } from '../../../ui/Toast';

interface RemoteAccessCardProps {
    settings: GlobalSettings;
    loadSettings: () => Promise<void>;
    user: UserProfile | null;
    systemStatus: { protocol: string, sslStatus: string, localIP?: string } | null;
    setShowWizard: (show: boolean) => void;
}

export const RemoteAccessCard: React.FC<RemoteAccessCardProps> = ({ 
    settings, 
    loadSettings, 
    user, 
    systemStatus, 
    setShowWizard 
}) => {
    const { addToast } = useToast();

    return (
        <motion.div 
            variants={STAGGER_ITEM}
            className="border border-border p-5 bg-card rounded transition-all duration-300"
        >
            <div className="flex items-center gap-3 mb-4">
                <div className="text-foreground">
                    <Monitor size={18} />
                </div>
                <div>
                    <h3 className="text-sm font-bold tracking-tight text-foreground">Remote Access</h3>
                    <p className="text-[10px] font-medium text-muted-foreground">Share your server with friends outside your local network.</p>
                </div>
            </div>

            {!settings.app.remoteAccess?.enabled ? (
                <div className="space-y-3">
                    <div className="bg-secondary/30 rounded-lg p-3 border border-border/50">
                        <div className="flex items-start gap-4">
                            <div className="p-1.5 bg-amber-500/10 rounded-md">
                                <AlertTriangle size={16} className="text-amber-500" />
                            </div>
                            <div className="flex-1">
                                <h4 className="font-bold text-[11px] mb-1">Remote Access Not Configured</h4>
                                <p className="text-[9px] font-medium text-muted-foreground mb-3 leading-tight">
                                    Your server is currently only accessible from this computer. To allow friends to join from anywhere, you need to set up remote access.
                                </p>
                                <button
                                    onClick={() => setShowWizard(true)}
                                    className="bg-foreground text-background px-4 py-1.5 rounded border border-border text-[10px] font-extrabold uppercase tracking-widest hover:bg-foreground/90 inline-flex items-center gap-2 transition-all shadow-[0_0_10px_rgba(255,255,255,0.1)]">
                                    <Shield size={12} />
                                    Configure Remote Access
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-secondary rounded-lg p-3 border border-border/30">
                            <div className="flex items-center gap-2 mb-2">
                                <Shield size={14} className="text-emerald-500" />
                                <span className="font-bold text-[10px]">Safest: VPN</span>
                            </div>
                            <p className="text-[9px] font-medium text-muted-foreground leading-tight">Encrypted private connection via Tailscale/ZeroTier. No ports needed.</p>
                        </div>
                        <div className="bg-secondary rounded-lg p-3 border border-border/30">
                            <div className="flex items-center gap-2 mb-1">
                                <Monitor size={14} className="text-foreground" />
                                <span className="font-bold text-[10px]">Easiest: Playit.gg</span>
                            </div>
                            <p className="text-[9px] font-medium text-muted-foreground leading-tight">One-click tunnel. Game + Web dashboard access.</p>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-3">
                        <div className="flex items-start gap-4">
                            <Shield size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <h4 className="font-semibold text-emerald-600">Remote Access Active</h4>
                                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-600 rounded text-xs font-medium uppercase">
                                        {settings.app.remoteAccess.method}
                                    </span>
                                </div>
                                {settings.app.remoteAccess.method === 'vpn' && (
                                    <div className="space-y-2">
                                        <p className="text-sm text-emerald-700"><strong>VPN Mode:</strong> Friends connect using your VPN IP.</p>
                                        <div className="bg-background rounded p-3">
                                            <p className="text-xs text-muted-foreground mb-1">Share with friends:</p>
                                            <code className="text-xs bg-secondary px-2 py-1 rounded">Your VPN IP (e.g., 192.168.x.x)</code>
                                        </div>
                                        <p className="text-xs text-emerald-600">✓ Game + Web access</p>
                                    </div>
                                )}
                                {settings.app.remoteAccess.method === 'proxy' && (
                                    <div className="space-y-2">
                                        <p className="text-sm text-emerald-700"><strong>Playit.gg Proxy:</strong> Server tunneled through Playit network.</p>
                                        <div className="bg-background rounded p-3">
                                            <p className="text-xs text-muted-foreground mb-1">Find public link in:</p>
                                            <ul className="text-xs space-y-1 ml-4 list-disc text-emerald-700">
                                                <li>"CraftCommand Tunnel" window</li>
                                                <li>Backend console</li>
                                            </ul>
                                        </div>
                                        <p className="text-xs text-emerald-600">✓ Game + Web access</p>
                                    </div>
                                )}
                                {settings.app.remoteAccess.method === 'cloudflare' && (
                                    <div className="space-y-2">
                                        <p className="text-sm text-emerald-700"><strong>Cloudflare Quick Share:</strong> Fast dashboard link.</p>
                                        <div className="bg-background rounded p-3">
                                            <p className="text-xs text-muted-foreground mb-1">Find link in:</p>
                                            <ul className="text-xs space-y-1 ml-4 list-disc text-emerald-700">
                                                <li>"Cloudflare Website Share" window</li>
                                            </ul>
                                        </div>
                                        <p className="text-xs text-amber-600">⚠ Web only - Game needs VPN/Proxy</p>
                                    </div>
                                )}
                                {settings.app.remoteAccess.method === 'direct' && (
                                    <div className="space-y-2">
                                        <p className="text-sm text-emerald-700"><strong>Direct:</strong> Port forwarding via router.</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            <div className="bg-background rounded p-3 border border-emerald-500/10">
                                                <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">External IP</p>
                                                <code className="text-xs text-foreground bg-secondary px-2 py-0.5 rounded">
                                                    {settings.app.remoteAccess.externalIP || 'Detecting...'}
                                                </code>
                                            </div>
                                            <div className="bg-background rounded p-3 border border-emerald-500/10">
                                                <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Local machine IP</p>
                                                <code className="text-xs text-foreground bg-secondary px-2 py-0.5 rounded">
                                                    {systemStatus?.localIP || '127.0.0.1'}
                                                </code>
                                            </div>
                                        </div>
                                        <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded text-[10px] mt-2">
                                            <strong>Port Forwarding Tip:</strong> In your router settings, forward internal port <strong>{window.location.port || '3001'}</strong> to IP <strong>{systemStatus?.localIP}</strong>.
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={async () => {
                                try {
                                    await API.disableRemoteAccess();
                                    await loadSettings();
                                    addToast('success', 'Remote Access', 'Remote access disabled');
                                } catch (e: any) {
                                    addToast('error', 'Remote Access', e.message);
                                }
                            }}
                            className="bg-red-500/10 text-red-600 border border-red-500/30 px-4 py-2 rounded text-sm font-medium hover:bg-red-500/20"
                        >
                            Disable
                        </button>
                        <button
                            onClick={() => setShowWizard(true)}
                            className="bg-secondary text-foreground px-4 py-2 rounded text-sm font-medium hover:bg-secondary/80"
                        >
                            Change Configuration
                        </button>
                    </div>
                </div>
            )}
        </motion.div>
    );
};
