import React, { useEffect, useState } from 'react';
import { WizardMode } from './AddNodeWizard';
import { API } from '@core/services/api';
import { Copy, Terminal, Download, RefreshCw, CheckCircle2 } from 'lucide-react';

interface Props {
    mode: WizardMode;
    onBack: () => void;
    onNext: (nodeId: string) => void;
    onError: (msg: string) => void;
}

export const StepGetAgent: React.FC<Props> = ({ mode, onBack, onNext, onError }) => {
    const [loading, setLoading] = useState(true);
    const [nodeData, setNodeData] = useState<{ id: string, secret: string, token: string } | null>(null);
    const [os, setOs] = useState<'linux' | 'windows'>('linux'); // Simple detection provided user can switch

    const initRef = React.useRef(false);

    useEffect(() => {
        // Pre-enroll node to get ID and Secret
        const init = async () => {
            if (initRef.current) return;
            initRef.current = true;

            try {
                // Auto-detect OS
                if (navigator.platform.toLowerCase().includes('win')) {
                    setOs('windows');
                }

                // Call new API endpoint
                const data = await API.preEnrollNode({ 
                    mode,
                    // Generate a random suffix to prevent naming collisions (409 Conflict)
                    name: `New ${mode === 'lan' ? 'Local' : 'Remote'} Node (${Math.random().toString(36).substring(2, 6).toUpperCase()})`
                });
                setNodeData(data);
                
                // BUG FIX: DO NOT automatically notify parent of the ID yet.
                // We must show the command/download first.
                // Only onNext when they click "Verify" or if we detect connection.
            } catch (err: any) {
                onError(err.message || 'Failed to initialize node enrollment');
                initRef.current = false; // Allow retry on error
            } finally {
                setLoading(false);
            }
        };

        init();
    }, [mode, onError]); // Removed onNext from deps to prevent loop

    const handleDownload = () => {
        const panelUrl = window.location.origin;
        window.open(`${panelUrl}/api/install/agent`, '_blank');
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <RefreshCw size={32} className="text-cyan-400 animate-spin" />
                <p className="text-muted-foreground animate-pulse">Generating secure identity...</p>
            </div>
        );
    }

    if (!nodeData) return null;

    const panelUrl = window.location.origin; // Assume agent can reach this
    
    // Commands
    const cmdLinux = `curl -sSL ${panelUrl}/api/install/linux | bash -s -- --id ${nodeData.id} --secret ${nodeData.secret} --url ${panelUrl}`;
    const cmdWindows = `iwr ${panelUrl}/api/install/windows | iex; Install-Agent -Id "${nodeData.id}" -Secret "${nodeData.secret}" -Url "${panelUrl}"`;
    const cmdManual = `run_agent.bat --node-id ${nodeData.id} --secret ${nodeData.secret} --panel-url ${panelUrl}`;

    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h2 className="text-2xl font-bold">Install Node Agent</h2>
                <p className="text-muted-foreground">
                    Run this command on the target machine to enroll it automatically.
                </p>
            </div>

            {/* OS Tabs */}
            <div className="flex bg-secondary/30 p-1 rounded-lg w-fit">
                <button
                    onClick={() => setOs('linux')}
                    className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${
                        os === 'linux' ? 'bg-background shadow text-cyan-400' : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    Linux / Mac
                </button>
                <button
                    onClick={() => setOs('windows')}
                    className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${
                        os === 'windows' ? 'bg-background shadow text-blue-400' : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    Windows
                </button>
            </div>

            {/* Command Box */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-inner">
                <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Terminal size={12} />
                        <span>{os === 'windows' ? 'PowerShell (Admin)' : 'Bash Terminal'}</span>
                    </div>
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(os === 'windows' ? cmdWindows : cmdLinux);
                        }}
                        className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-medium"
                    >
                        <Copy size={12} /> Copy
                    </button>
                </div>
                <div className="p-4 font-mono text-sm break-all text-zinc-300 selection:bg-cyan-500/30">
                    {os === 'windows' ? cmdWindows : cmdLinux}
                </div>
            </div>

            {/* Manual Fallback */}
            <div className="bg-secondary/10 rounded-lg p-4 border border-border/50">
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Download size={14} /> Manual / Advanced
                </h4>
                <p className="text-xs text-muted-foreground mb-3">
                    If the one-click script fails, you can run the agent manually or download the source zip.
                </p>
                <div className="flex gap-3">
                    <button 
                        onClick={handleDownload}
                        className="px-3 py-1.5 text-xs border border-border rounded bg-background hover:bg-secondary transition-colors"
                    >
                        Download agent.zip
                    </button>
                    <button 
                        onClick={() => {
                            navigator.clipboard.writeText(cmdManual);
                        }}
                        className="px-3 py-1.5 text-xs border border-border rounded bg-background hover:bg-secondary transition-colors"
                    >
                        Copy Manual Flags
                    </button>
                </div>
            </div>

            <div className="pt-6 border-t border-border flex justify-between">
                <button
                    onClick={onBack}
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                    Back
                </button>
                <button
                    onClick={() => onNext(nodeData.id)}
                    className="px-6 py-2 bg-cyan-600 text-white font-bold rounded hover:bg-cyan-500 transition-colors"
                >
                    I've run the command
                </button>
            </div>
        </div>
    );
};
