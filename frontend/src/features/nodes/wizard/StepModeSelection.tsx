import React from 'react';
import { Wifi, Globe, ShieldCheck, Zap, AlertTriangle } from 'lucide-react';
import { WizardMode } from './AddNodeWizard';

interface Props {
    onSelect: (mode: WizardMode) => void;
}

export const StepModeSelection: React.FC<Props> = ({ onSelect }) => {
    return (
        <div className="space-y-6">
            <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">Where is your new node?</h2>
                <p className="text-muted-foreground">Select the network environment for the new machine you want to add.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* LAN Option */}
                <button
                    onClick={() => onSelect('lan')}
                    className="group relative flex flex-col items-start p-6 rounded-xl border border-border bg-secondary/10 hover:bg-secondary/30 hover:border-cyan-500/50 transition-all text-left"
                >
                    <div className="absolute top-4 right-4 px-2 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-wider rounded border border-emerald-500/20">
                        Recommended
                    </div>
                    
                    <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Wifi size={24} className="text-emerald-400" />
                    </div>
                    
                    <h3 className="text-lg font-semibold mb-2">Local Network (LAN)</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        Add a spare PC, laptop, or server that is on the <strong>same Wi-Fi or Ethernet</strong> network as this panel.
                    </p>

                    <ul className="space-y-2 text-xs text-muted-foreground">
                        <li className="flex items-center gap-2">
                            <Zap size={12} className="text-emerald-400" />
                            Fastest file transfers (1Gbps+)
                        </li>
                        <li className="flex items-center gap-2">
                            <ShieldCheck size={12} className="text-emerald-400" />
                            No firewall changes needed
                        </li>
                    </ul>
                </button>

                {/* Internet Option */}
                <button
                    onClick={() => onSelect('internet')}
                    className="group relative flex flex-col items-start p-6 rounded-xl border border-border bg-secondary/10 hover:bg-secondary/30 hover:border-amber-500/50 transition-all text-left"
                >
                    <div className="w-12 h-12 rounded-lg bg-amber-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Globe size={24} className="text-amber-400" />
                    </div>
                    
                    <h3 className="text-lg font-semibold mb-2">Internet / VPS</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        Add a remote VPS or a friend's computer connecting over the internet.
                    </p>

                    <ul className="space-y-2 text-xs text-muted-foreground">
                        <li className="flex items-center gap-2">
                            <ShieldCheck size={12} className="text-amber-400" />
                            End-to-end encrypted (TLS)
                        </li>
                        <li className="flex items-center gap-2">
                            <AlertTriangle size={12} className="text-amber-400" />
                            Requires Port Forwarding or VPN
                        </li>
                    </ul>
                </button>
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 text-xs flex items-start gap-3">
                <div className="mt-0.5">
                    <ShieldCheck size={16} className="text-emerald-400" />
                </div>
                <div>
                    <p className="text-emerald-400 font-bold mb-1">Local Host Auto-Connected</p>
                    <p className="text-muted-foreground leading-relaxed">
                        The machine running this panel is already automatically managed as the <strong>"Local Node"</strong>. 
                        Use this wizard only if you want to add <strong>additional</strong> computers or remote servers.
                    </p>
                </div>
            </div>

            <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-4 text-xs text-muted-foreground flex items-start gap-3">
                <div className="mt-0.5 min-w-[16px]">
                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 font-bold">i</span>
                </div>
                <p>
                    Note: Adding nodes requires running a small "Agent" program on the target machine. 
                    The next step will provide the installation command.
                </p>
            </div>
        </div>
    );
};
