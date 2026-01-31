import React, { useState } from 'react';
import { API } from '../../services/api';
import { X } from 'lucide-react';

interface Props {
    onClose: () => void;
}

type RemoteMethod = 'vpn' | 'proxy' | 'direct' | 'cloudflare' | 'disable';

export const RemoteAccessWizard: React.FC<Props> = ({ onClose }) => {
    const [step, setStep] = useState(1);
    const [method, setMethod] = useState<RemoteMethod | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleEnable = async () => {
        if (!method) return;
        setLoading(true);
        setError(null);
        try {
            if (method === 'disable') {
                await API.disableRemoteAccess();
            } else {
                await API.enableRemoteAccess(method as any);
            }
            setStep(4);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const methods = [
        {
            id: 'vpn' as RemoteMethod,
            title: 'Mesh VPN (Recommended)',
            desc: 'Use Tailscale or ZeroTier. Safe, private, no port forwarding needed.',
            steps: [
                'Install Tailscale or ZeroTier on this computer',
                'Share your VPN IP (e.g., 100.x.x.x) with friends',
                'Friends install same VPN and join your network'
            ]
        },
        {
            id: 'proxy' as RemoteMethod,
            title: 'Playit.gg Proxy',
            desc: 'One-click tunnel. No port forwarding required.',
            steps: [
                'Playit.gg tunnel created automatically',
                'Public link appears in "Craft Commands Tunnel" window',
                'Share that link with friends'
            ]
        },
        {
            id: 'cloudflare' as RemoteMethod,
            title: 'Cloudflare Quick Share',
            desc: 'Fast dashboard link. Web only (no game access).',
            steps: [
                'Cloudflare tunnel created automatically',
                'Link appears in "Cloudflare Website Share" window',
                'Share link to access web dashboard',
                'Note: Game access requires VPN or Playit.gg'
            ]
        },
        {
            id: 'direct' as RemoteMethod,
            title: 'Direct Port Forward',
            desc: 'Open ports via router. Manual configuration required.',
            steps: [
                'Manual port forwarding on your router required',
                'Forward server ports to this PC',
                'Share external IP with friends'
            ]
        },
        {
            id: 'disable' as RemoteMethod,
            title: 'Disable Remote Access',
            desc: 'Turn off remote access and return to localhost-only mode.',
            steps: [
                'Remote access will be completely disabled',
                'Server will only be accessible from this computer',
                'All remote access settings will be cleared'
            ]
        }
    ];

    const selectedMethod = methods.find(m => m.id === method);

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-card border border-border rounded-lg w-full max-w-lg shadow-lg">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <h2 className="font-semibold">Remote Access Setup</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4">
                    {/* Step 1: Warning */}
                    {step === 1 && (
                        <div className="space-y-3">
                            <div>
                                <h3 className="font-medium mb-1">Enable Remote Access</h3>
                                <p className="text-sm text-muted-foreground">
                                    By default, your server is only accessible from this computer. Enable remote access to allow friends to connect from anywhere.
                                </p>
                            </div>

                            <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3">
                                <p className="text-sm font-medium text-amber-600 mb-1">Security Warning</p>
                                <p className="text-xs text-amber-700">
                                    Exposing your server allows internet connections. We've enabled rate limiting and lockouts for protection, but you must use a strong password.
                                </p>
                            </div>

                            <button 
                                onClick={() => setStep(2)}
                                className="w-full bg-primary text-primary-foreground py-2 rounded text-sm font-medium hover:bg-primary/90"
                            >
                                Continue
                            </button>
                        </div>
                    )}

                    {/* Step 2: Method Selection */}
                    {step === 2 && (
                        <div className="space-y-3">
                            <h3 className="font-medium">Choose a Method</h3>
                            
                            <div className="space-y-2">
                                {methods.map((m) => (
                                    <label
                                        key={m.id}
                                        className={`block p-3 rounded border cursor-pointer transition-colors ${
                                            method === m.id 
                                                ? 'border-primary bg-secondary' 
                                                : 'border-border hover:border-border/60'
                                        }`}
                                    >
                                        <div className="flex items-start gap-2">
                                            <input 
                                                type="radio" 
                                                name="method"
                                                checked={method === m.id}
                                                onChange={() => setMethod(m.id)}
                                                className="mt-0.5"
                                            />
                                            <div className="flex-1">
                                                <div className="font-medium text-sm">{m.title}</div>
                                                <div className="text-xs text-muted-foreground mt-0.5">{m.desc}</div>
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button 
                                    onClick={() => setStep(1)}
                                    className="flex-1 bg-secondary py-2 rounded text-sm font-medium hover:bg-secondary/80"
                                >
                                    Back
                                </button>
                                <button 
                                    onClick={() => setStep(3)}
                                    disabled={!method}
                                    className="flex-1 bg-primary text-primary-foreground py-2 rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Confirmation */}
                    {step === 3 && selectedMethod && (
                        <div className="space-y-3">
                            <div>
                                <h3 className="font-medium mb-1">Confirm Setup</h3>
                                <p className="text-sm text-muted-foreground">Selected: {selectedMethod.title}</p>
                            </div>
                            
                            <div className="bg-secondary/50 rounded p-3 space-y-2">
                                <p className="text-sm font-medium">Setup Steps:</p>
                                <ol className="text-xs space-y-1 text-muted-foreground list-decimal list-inside">
                                    {selectedMethod.steps.map((step, i) => (
                                        <li key={i}>{step}</li>
                                    ))}
                                </ol>
                            </div>

                            {error && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded p-2 text-xs text-red-600">
                                    {error}
                                </div>
                            )}

                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setStep(2)}
                                    className="flex-1 bg-secondary py-2 rounded text-sm font-medium hover:bg-secondary/80"
                                >
                                    Back
                                </button>
                                <button 
                                    onClick={handleEnable}
                                    disabled={loading}
                                    className="flex-1 bg-primary text-primary-foreground py-2 rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {loading ? 'Enabling...' : 'Enable'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Success */}
                    {step === 4 && (
                        <div className="space-y-3 text-center py-4">
                            <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
                                <div className="text-emerald-500 text-2xl">✓</div>
                            </div>
                            <div>
                                <h3 className="font-medium mb-1">Remote Access Enabled</h3>
                                <p className="text-sm text-muted-foreground">
                                    Your server is now listening on <code className="bg-secondary px-1 py-0.5 rounded text-xs">0.0.0.0</code>
                                </p>
                                <p className="text-xs text-muted-foreground mt-2">
                                    You may need to restart the application for all changes to take effect.
                                </p>
                            </div>
                            <button 
                                onClick={onClose}
                                className="bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:bg-primary/90"
                            >
                                Close
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
