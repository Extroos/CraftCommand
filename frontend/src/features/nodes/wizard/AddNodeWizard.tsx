import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Server, X } from 'lucide-react';
import { StepModeSelection } from './StepModeSelection';
import { StepGetAgent } from './StepGetAgent';
import { StepVerify } from './StepVerify';
import { useToast } from '../../ui/Toast';

interface Props {
    onClose: () => void;
    onComplete: () => void;
}

export type WizardMode = 'lan' | 'internet';

export const AddNodeWizard: React.FC<Props> = ({ onClose, onComplete }) => {
    const { addToast } = useToast();
    const [step, setStep] = useState(1);
    const [mode, setMode] = useState<WizardMode | null>(null);
    const [nodeId, setNodeId] = useState<string | null>(null);

    const handleModeSelect = (selected: WizardMode) => {
        setMode(selected);
        setStep(2);
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-border bg-secondary/20">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                                <Server size={20} className="text-cyan-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold">Add New Node</h3>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className={step >= 1 ? 'text-cyan-400 font-medium' : ''}>1. Mode</span>
                                    <span className="opacity-30">/</span>
                                    <span className={step >= 2 ? 'text-cyan-400 font-medium' : ''}>2. Install</span>
                                    <span className="opacity-30">/</span>
                                    <span className={step >= 3 ? 'text-cyan-400 font-medium' : ''}>3. Verify</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                        <AnimatePresence mode="wait">
                            {step === 1 && (
                                <StepModeSelection 
                                    key="step1" 
                                    onSelect={handleModeSelect} 
                                />
                            )}
                            {step === 2 && mode && (
                                <StepGetAgent 
                                    key="step2" 
                                    mode={mode}
                                    onBack={() => setStep(1)}
                                    onError={(err) => addToast('error', 'Node Error', err)}
                                    onNext={(id) => {
                                        setNodeId(id);
                                        setStep(3);
                                    }}
                                />
                            )}
                            {step === 3 && nodeId && (
                                <StepVerify 
                                    key="step3" 
                                    nodeId={nodeId}
                                    onComplete={() => {
                                        onComplete();
                                        onClose();
                                    }}
                                />
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
