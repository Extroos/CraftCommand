import React from 'react';
import { AlertTriangle, ShieldAlert, RotateCcw, ArrowRightLeft, Zap } from 'lucide-react';

interface DangerZoneProps {
    isOffline: boolean;
    setShowConfirm: (val: any) => void;
}

export const DangerZone: React.FC<DangerZoneProps> = ({
    isOffline, setShowConfirm
}) => {
    return (
        <div className="bg-rose-500/[0.03] border border-rose-500/30 rounded-md p-4 relative overflow-hidden group shadow-sm transition-all hover:border-rose-500/50">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-rose-500/20">
                <div className="p-1.5 rounded-md bg-rose-500/10 border border-rose-500/20 shadow-inner group-hover:bg-rose-500/20 transition-colors">
                    <AlertTriangle className="text-rose-500" size={14} />
                </div>
                <div>
                    <h3 className="text-xs font-bold text-rose-600">Danger Zone</h3>
                    <p className="text-[10px] text-rose-500/70 font-medium opacity-80">High-risk destructive operations</p>
                </div>
            </div>
            <div className="space-y-3">
                <div className="flex flex-col gap-2">
                    {/* Factory Reset */}
                    {!isOffline && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/5 border border-amber-500/20 rounded-md mb-1">
                            <ShieldAlert size={12} className="text-amber-500" />
                            <span className="text-[8px] font-bold text-amber-600 uppercase tracking-tighter">Instance must be OFFLINE for destructive tasks</span>
                        </div>
                    )}

                    <button 
                        disabled={!isOffline}
                        onClick={() => setShowConfirm({
                            open: true,
                            type: 'RESET',
                            title: 'Factory Reset Instance',
                            description: 'This will revert all configuration settings to their default values. This action cannot be undone once committed.'
                        })}
                        className={`w-full flex items-center justify-between p-3 rounded-md border transition-all group/btn ${
                            !isOffline 
                            ? 'opacity-40 grayscale cursor-not-allowed border-muted bg-muted/5' 
                            : 'border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10'
                        }`}
                    >
                        <div className="flex items-center gap-2.5">
                            <RotateCcw size={14} className={`text-rose-500/70 ${isOffline ? 'group-hover/btn:rotate-180 transition-transform duration-500' : ''}`} />
                            <span className="text-[9px] font-black uppercase tracking-widest text-rose-500/80">Factory Reset Stack</span>
                        </div>
                        <ArrowRightLeft size={12} className="text-rose-500/30" />
                    </button>

                    {/* Decommission */}
                    <button 
                        disabled={!isOffline}
                        onClick={() => setShowConfirm({
                            open: true,
                            type: 'DECOMMISSION',
                            title: 'Decommission Instance',
                            description: 'CRITICAL: This will permanently delete the server record and all associated files from the disk. This action is irreversible.'
                        })}
                        className={`w-full flex items-center justify-between p-3 rounded-md border transition-all group/btn ${
                            !isOffline 
                            ? 'opacity-40 grayscale cursor-not-allowed border-muted bg-muted/5' 
                            : 'border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20'
                         }`}
                    >
                        <div className="flex items-center gap-2.5">
                            <AlertTriangle size={14} className="text-rose-500" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-rose-500">Decommission Instance</span>
                        </div>
                        <Zap size={12} className={`text-rose-500 ${isOffline ? '' : ''}`} />
                    </button>
                </div>
            </div>
        </div>
    );
};
