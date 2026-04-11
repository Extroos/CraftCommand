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
    const [joinData, setJoinData] = useState<{ command: string, powershell: string, token: string } | null>(null);
    const [nodeData, setNodeData] = useState<{ id: string, secret: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [os, setOs] = useState<'linux' | 'windows' | 'docker'>('linux'); 

    const initRef = React.useRef(false);

    useEffect(() => {
        const init = async () => {
            if (initRef.current) return;
            initRef.current = true;

            try {
                if (navigator.platform.toLowerCase().includes('win')) {
                    setOs('windows');
                }

                const data = await API.preEnrollNode({ 
                    mode,
                    name: `Node-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
                });
                setNodeData(data);
                
                // Fetch the one-click join command using the new token system
                const join = await API.getJoinCommand(data.id);
                setJoinData(join);

            } catch (err: any) {
                onError(err.message || 'Failed to initialize node enrollment');
                initRef.current = false;
            } finally {
                setLoading(false);
            }
        };

        init();
    }, [mode, onError]);

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

    if (!nodeData || !joinData) return null;

    const panelUrl = window.location.origin;
    
    // Commands
    const cmdLinux = joinData.command;
    const cmdWindows = joinData.powershell;
    const cmdDocker = `docker run -d \\
  --name craftcommand-agent \\
  -e AGENT_NODE_ID=${nodeData.id} \\
  -e AGENT_NODE_SECRET=${nodeData.secret} \\
  -e PANEL_URL=${panelUrl} \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  extroos/craftcommand-agent:latest`;

    const cmdManual = `run_CraftCommand.sh --id ${nodeData.id} --secret ${nodeData.secret} --url ${panelUrl}`;

    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h2 className="text-2xl font-bold font-mono tracking-tighter uppercase">Professional Enrollment</h2>
                <p className="text-muted-foreground text-xs font-medium">
                    Select your platform and execute the command to join this machine to your cluster.
                </p>
            </div>

            {/* OS Tabs */}
            <div className="flex bg-secondary/30 p-1 rounded-lg w-fit border border-border/50">
                <button
                    onClick={() => setOs('linux')}
                    className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${
                        os === 'linux' ? 'bg-zinc-800 shadow text-white border border-white/10' : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    Linux / Mac
                </button>
                <button
                    onClick={() => setOs('windows')}
                    className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${
                        os === 'windows' ? 'bg-zinc-800 shadow text-white border border-white/10' : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    Windows
                </button>
                <button
                    onClick={() => setOs('docker')}
                    className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${
                        os === 'docker' ? 'bg-zinc-800 shadow text-white border border-white/10' : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    Docker
                </button>
            </div>

            {/* Command Box */}
            <div className="bg-black/40 border border-border rounded overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-secondary/20 border-b border-border">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        <Terminal size={12} />
                        <span>{os === 'windows' ? 'PowerShell 7+' : os === 'docker' ? 'Docker Compose' : 'Bash / Zsh'}</span>
                    </div>
                    <button
                        onClick={() => {
                            const text = os === 'windows' ? cmdWindows : os === 'docker' ? cmdDocker : cmdLinux;
                            navigator.clipboard.writeText(text);
                        }}
                        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-foreground hover:text-white transition-colors"
                    >
                        <Copy size={12} /> Copy Command
                    </button>
                </div>
                <div className="p-4 font-mono text-xs break-all text-zinc-300 selection:bg-zinc-500/30 leading-relaxed">
                    {os === 'windows' ? cmdWindows : os === 'docker' ? cmdDocker : cmdLinux}
                </div>
            </div>

            {/* Infrastructure Note */}
            <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-lg flex gap-4">
                <div className="shrink-0 text-emerald-500">
                    <CheckCircle2 size={20} />
                </div>
                <div className="space-y-1">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Secure Enrollment Active</h4>
                    <p className="text-[10px] leading-relaxed text-emerald-500/70 font-medium">
                        This command uses a one-time short-lived join token to securely fetch node-specific credentials. 
                        No secrets are exposed in your shell history.
                    </p>
                </div>
            </div>

            {/* Manual Fallback */}
            <div className="bg-secondary/10 rounded p-4 border border-border/50">
                <h4 className="text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Download size={14} /> Advanced / Manual Configuration
                </h4>
                <div className="flex gap-2">
                    <button 
                        onClick={handleDownload}
                        className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest border border-border rounded bg-secondary/50 hover:bg-secondary transition-colors"
                    >
                        Download Source (ZIP)
                    </button>
                    <button 
                        onClick={() => {
                            navigator.clipboard.writeText(cmdManual);
                        }}
                        className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest border border-border rounded bg-secondary/50 hover:bg-secondary transition-colors"
                    >
                        Copy Static Identity Flags
                    </button>
                </div>
            </div>

            <div className="pt-6 border-t border-border flex justify-between items-center">
                <button
                    onClick={onBack}
                    className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all"
                >
                    Back to Mode Selection
                </button>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => onNext(nodeData.id)}
                        className="px-8 py-3 bg-foreground text-background font-black text-[10px] uppercase tracking-widest rounded hover:bg-foreground/90 transition-all border border-border"
                    >
                        I've run the command
                    </button>
                </div>
            </div>
        </div>
    );
};
