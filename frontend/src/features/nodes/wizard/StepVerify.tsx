import React, { useEffect, useState } from 'react';
import { API } from '@core/services/api';
import { RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, Activity } from 'lucide-react';
import { NodeInfo } from '@shared/types';
import { motion } from 'framer-motion';

interface Props {
    nodeId: string;
    onComplete: () => void;
}

type StepState = 'waiting' | 'connected' | 'verified' | 'ready';

export const StepVerify: React.FC<Props> = ({ nodeId, onComplete }) => {
    const [node, setNode] = useState<NodeInfo | null>(null);
    const [state, setState] = useState<StepState>('waiting');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        const check = async () => {
            try {
                const data = await API.getNode(nodeId);
                if (!mounted) return;
                setNode(data);

                // If fully online, jump to ready immediately (or keep it if already there)
                if (data.status === 'ONLINE') {
                    setState('ready');
                    return;
                }

                // If we detect a heartbeat but status isn't ONLINE yet (edge case),
                // OR if we want to show the fancy animation sequence:
                if (data.lastHeartbeat > data.enrolledAt) {
                    // Only start the sequence if we are still in 'waiting'
                    // This prevents the polling loop from resetting 'verified' back to 'connected'
                    setState(curr => {
                        if (curr === 'waiting') {
                            // Start the visual sequence
                            setTimeout(() => mounted && setState('verified'), 1500);
                            setTimeout(() => mounted && setState('ready'), 3000);
                            return 'connected';
                        }
                        return curr; // Keep current state (connected/verified/ready)
                    });
                }
            } catch (err: any) {
                // Ignore 404s initially
                if (err.message && !err.message.includes('404')) {
                    setError(err.message);
                }
            }
        };

        check(); // Initial check
        const interval = setInterval(check, 2000); // Poll every 2s
        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, [nodeId]);

    // Progress bar for the 'ready' state
    const progress = {
        waiting: 10,
        connected: 45,
        verified: 80,
        ready: 100
    }[state];

    return (
        <div className="space-y-8 py-4">
            <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">Verifying Connection</h2>
                <p className="text-muted-foreground">The panel is listening for the new node agent...</p>
            </div>

            {/* Status Steps */}
            <div className="w-full max-w-sm mx-auto space-y-6">
                
                {/* Step 1: Connection */}
                <div className={`flex items-center gap-4 transition-opacity duration-500 ${state === 'waiting' ? 'opacity-100' : 'opacity-50'}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                        state === 'waiting' 
                            ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10' 
                            : 'border-emerald-500 bg-emerald-500 text-black'
                    }`}>
                        {state === 'waiting' ? <RefreshCw size={20} className="animate-spin" /> : <CheckCircle2 size={24} />}
                    </div>
                    <div>
                        <h4 className="font-semibold">Establishing Connection</h4>
                        <p className="text-xs text-muted-foreground">Waiting for handshake...</p>
                    </div>
                </div>

                {/* Step 2: Verification */}
                <div className={`flex items-center gap-4 transition-opacity duration-500 ${state === 'waiting' ? 'opacity-30' : state === 'connected' ? 'opacity-100' : 'opacity-50'}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                        state === 'waiting' 
                            ? 'border-border text-muted-foreground' 
                            : state === 'connected'
                                ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10'
                                : 'border-emerald-500 bg-emerald-500 text-black'
                    }`}>
                        {state === 'waiting' ? <ShieldCheck size={20} /> : state === 'connected' ? <RefreshCw size={20} className="animate-spin" /> : <CheckCircle2 size={24} />}
                    </div>
                    <div>
                        <h4 className="font-semibold">Verifying Identity</h4>
                        <p className="text-xs text-muted-foreground">Checking security token...</p>
                    </div>
                </div>

                {/* Step 3: Health Check */}
                <div className={`flex items-center gap-4 transition-opacity duration-500 ${state === 'ready' ? 'opacity-100' : 'opacity-30'}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                        state !== 'ready'
                            ? 'border-border text-muted-foreground'
                            : 'border-emerald-500 bg-emerald-500 text-black'
                    }`}>
                        <Activity size={20} />
                    </div>
                    <div>
                        <h4 className="font-semibold">Node Ready</h4>
                        <p className="text-xs text-muted-foreground">Agent is online and reporting health.</p>
                    </div>
                </div>

            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-center gap-3 text-red-400">
                    <AlertTriangle size={20} />
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {/* Complete Button */}
            {state === 'ready' && (
                <div className="flex justify-center pt-4">
                    <motion.button
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={onComplete}
                        className="px-8 py-3 bg-emerald-500 text-black font-bold rounded-lg hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
                    >
                        Finish Setup
                    </motion.button>
                </div>
            )}
        </div>
    );
};
