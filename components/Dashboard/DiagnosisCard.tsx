
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Stethoscope, Wrench, CheckCircle } from 'lucide-react';
import { API } from '../../services/api';

interface DiagnosisResult {
    id: string;
    ruleId: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    title: string;
    explanation: string;
    recommendation: string;
    action?: {
        type: string;
        payload: any;
    };
    timestamp: number;
}

interface DiagnosisCardProps {
    result: DiagnosisResult | null;
    serverId: string;
    onFix: () => void;
    onDismiss: () => void;
}

export const DiagnosisCard: React.FC<DiagnosisCardProps> = ({ result, serverId, onFix, onDismiss }) => {
    const [fixing, setFixing] = React.useState(false);
    const [fixed, setFixed] = React.useState(false);

    if (!result) return null;

    const handleAutoFix = async () => {
        if (!result.action) return;
        setFixing(true);
        try {
            // In Phase 4, we might just simulate or support specific actions
            // Ideally backend would have a /fix endpoint, but for now we might map actions to API calls
            if (result.action.type === 'UPDATE_CONFIG') {
                await API.updateServer(serverId, result.action.payload);
            } else if (result.action.type === 'SWITCH_JAVA') {
                 await API.updateServer(serverId, { javaVersion: result.action.payload.version });
            } else if (result.action.type === 'AGREE_EULA') {
                 // Write eula=true to eula.txt
                 await API.saveFileContent(serverId, 'eula.txt', 'eula=true');
            }

            setFixed(true);
            setTimeout(() => {
                onFix();
            }, 1500);
        } catch (e) {
            console.error('Fix failed', e);
            setFixing(false);
        }
    };

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-gradient-to-r from-red-900/40 to-orange-900/40 border border-red-500/30 rounded-xl p-6 mb-6 backdrop-blur-sm shadow-lg overflow-hidden relative"
            >
                {/* Background Decor */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-red-500/10 rounded-full blur-3xl"></div>

                <div className="flex items-start gap-5">
                    <div className="p-3 bg-red-500/20 rounded-lg text-red-400">
                        <Stethoscope size={32} />
                    </div>

                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded text-xs font-bold tracking-wider bg-red-500/20 text-red-300 border border-red-500/20 uppercase">
                                Diagnosis: {result.severity}
                            </span>
                            <span className="text-sm text-red-200/60 font-mono">CODE: {result.ruleId.toUpperCase()}</span>
                        </div>

                        <h3 className="text-xl font-bold text-white mb-2">{result.title}</h3>
                        
                        <div className="text-gray-300 space-y-4">
                            <p className="leading-relaxed">
                                <span className="text-red-300 font-semibold">Problem: </span> 
                                {result.explanation}
                            </p>
                            
                            <div className="bg-black/30 rounded-lg p-3 border border-white/5">
                                <p className="text-emerald-300 flex items-start gap-2">
                                    <span className="font-semibold shrink-0">℞ Remedy:</span> 
                                    {result.recommendation}
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 flex items-center gap-3">
                            {result.action && !fixed && (
                                <button 
                                    onClick={handleAutoFix}
                                    disabled={fixing}
                                    className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg font-bold hover:bg-gray-200 transition-colors disabled:opacity-50"
                                >
                                    {fixing ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                                            Applying Fix...
                                        </>
                                    ) : (
                                        <>
                                            <Wrench size={18} />
                                            Auto-Fix Issue
                                        </>
                                    )}
                                </button>
                            )}

                            {fixed && (
                                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg font-bold border border-emerald-500/30">
                                    <CheckCircle size={18} />
                                    Issue Resolved
                                </div>
                            )}

                            <button 
                                onClick={onDismiss}
                                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
