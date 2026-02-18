import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Shield, QrCode, Clipboard, Check, ArrowRight, 
    X, Loader2, Download, AlertTriangle, Key, ShieldCheck 
} from 'lucide-react';
import { useToast } from '../../ui/Toast';
import { useUser } from '../context/UserContext';
import { API } from '@core/services/api';

interface TwoFactorSetupWizardProps {
    onClose: () => void;
    onComplete: () => void;
}

type Step = 'INTRO' | 'SCAN' | 'VERIFY' | 'BACKUP' | 'SUCCESS';

const TwoFactorSetupWizard: React.FC<TwoFactorSetupWizardProps> = ({ onClose, onComplete }) => {
    const [step, setStep] = useState<Step>('INTRO');
    const [isLoading, setIsLoading] = useState(false);
    const [qrData, setQrData] = useState<{ qrCode: string, secret: string } | null>(null);
    const [verificationCode, setVerificationCode] = useState('');
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [copied, setCopied] = useState(false);
    
    const { token, theme } = useUser();
    const { addToast } = useToast();

    // Fetch QR data on SCAN step
    useEffect(() => {
        if (step === 'SCAN' && !qrData) {
            handleStartSetup();
        }
    }, [step]);

    const handleStartSetup = async () => {
        setIsLoading(true);
        try {
            const data = await API.start2FASetup(token!);
            setQrData(data);
        } catch (e) {
            addToast('error', 'Error', 'Failed to initialize 2FA setup.');
            setStep('INTRO');
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyCode = async () => {
        if (verificationCode.length !== 6) return;
        setIsLoading(true);
        try {
            const data = await API.confirm2FASetup(verificationCode, token!);
            setBackupCodes(data.backupCodes);
            setStep('BACKUP');
        } catch (err: any) {
            addToast('error', 'Verification Failed', err.message || 'Invalid code.');
        } finally {
            setIsLoading(false);
        }
    };

    const copyBackupCodes = () => {
        const text = backupCodes.join('\n');
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        addToast('info', 'Copied', 'Backup codes copied to clipboard.');
    };

    const downloadBackupCodes = () => {
        const text = `CraftCommand Recovery Codes\nGenerated on: ${new Date().toLocaleString()}\n\n` + backupCodes.join('\n');
        const element = document.createElement('a');
        const file = new Blob([text], {type: 'text/plain'});
        element.href = URL.createObjectURL(file);
        element.download = 'craftcommand-recovery-codes.txt';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="w-full max-w-[480px] bg-[#0c0c0e] border border-white/[0.08] rounded-3xl overflow-hidden shadow-[0_32px_128px_-16px_rgba(0,0,0,1)] relative"
            >
                {/* Header Backdrop */}
                <div className={`absolute top-0 left-0 w-full h-32 bg-gradient-to-b ${theme.softBg} to-transparent opacity-50`} />
                
                {/* Close Button */}
                <button 
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/5 transition-colors z-20"
                >
                    <X size={20} className="text-zinc-500" />
                </button>

                <div className="relative z-10 p-8">
                    <AnimatePresence mode="wait">
                        {/* INTRO STEP */}
                        {step === 'INTRO' && (
                            <motion.div 
                                key="intro"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6 pt-4"
                            >
                                <div className="flex flex-col items-center gap-4 text-center">
                                    <div className={`p-4 rounded-2xl ${theme.softBg} ${theme.text}`}>
                                        <Shield size={40} />
                                    </div>
                                    <h2 className="text-2xl font-bold text-white tracking-tight">Protect Your Account</h2>
                                    <p className="text-sm text-zinc-400 max-w-sm">
                                        Two-factor authentication adds an extra layer of security to your account by requiring more than just a password to log in.
                                    </p>
                                </div>

                                <div className="space-y-4 bg-zinc-900/50 rounded-2xl p-5 border border-white/[0.03]">
                                    <div className="flex items-start gap-4">
                                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                                            <ShieldCheck size={18} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-white">Enhanced Identity</h4>
                                            <p className="text-[11px] text-zinc-500 mt-1">Prevents unauthorized access even if your password is compromised.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                                            <QrCode size={18} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-white">Universal Support</h4>
                                            <p className="text-[11px] text-zinc-500 mt-1">Works with Google Authenticator, Authy, or Microsoft Authenticator.</p>
                                        </div>
                                    </div>
                                </div>

                                <button 
                                    onClick={() => setStep('SCAN')}
                                    className={`w-full ${theme.bg} text-white font-bold uppercase text-[11px] tracking-[0.2em] py-4 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 shadow-xl shadow-black/40`}
                                >
                                    Begin Setup <ArrowRight size={14} />
                                </button>
                            </motion.div>
                        )}

                        {/* SCAN STEP */}
                        {step === 'SCAN' && (
                            <motion.div 
                                key="scan"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6 pt-4"
                            >
                                <div className="text-center">
                                    <h2 className="text-2xl font-bold text-white tracking-tight">Scan QR Code</h2>
                                    <p className="text-sm text-zinc-400 mt-2">Open your authenticator app and scan this code.</p>
                                </div>

                                <div className="flex flex-col items-center">
                                    <div className="w-56 h-56 bg-white p-3 rounded-[2rem] shadow-2xl relative overflow-hidden group">
                                        {isLoading ? (
                                            <div className="absolute inset-0 flex items-center justify-center bg-white">
                                                <Loader2 className="animate-spin text-zinc-800" size={32} />
                                            </div>
                                        ) : qrData && (
                                            <img src={qrData.qrCode} alt="QR Code" className="w-full h-full object-contain" />
                                        )}
                                    </div>
                                    
                                    {qrData && (
                                        <div className="mt-6 w-full">
                                            <label className="text-[10px] font-bold text-[#71717a] uppercase tracking-widest ml-1 block mb-2">Manual Entry Key</label>
                                            <div className="flex items-center gap-2 bg-zinc-900 border border-white/[0.05] rounded-xl p-3">
                                                <code className="flex-1 text-center font-mono text-zinc-400 text-sm tracking-wider">{qrData.secret}</code>
                                                <button 
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(qrData.secret);
                                                        addToast('info', 'Copied', 'Secret key copied.');
                                                    }}
                                                    className="p-2 hover:bg-white/5 rounded-lg transition-colors text-zinc-500 hover:text-white"
                                                >
                                                    <Clipboard size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <button 
                                    onClick={() => setStep('VERIFY')}
                                    disabled={isLoading || !qrData}
                                    className={`w-full ${theme.bg} text-white font-bold uppercase text-[11px] tracking-[0.2em] py-4 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 shadow-xl shadow-black/40 disabled:opacity-50`}
                                >
                                    I've Scanned It <ArrowRight size={14} />
                                </button>
                            </motion.div>
                        )}

                        {/* VERIFY STEP */}
                        {step === 'VERIFY' && (
                            <motion.div 
                                key="verify"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6 pt-4"
                            >
                                <div className="text-center">
                                    <h2 className="text-2xl font-bold text-white tracking-tight">Verify Setup</h2>
                                    <p className="text-sm text-zinc-400 mt-2">Enter the code displayed in your app to confirm.</p>
                                </div>

                                <div className="space-y-4">
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            maxLength={6}
                                            autoFocus
                                            value={verificationCode}
                                            onChange={(e) => setVerificationCode(e.target.value)}
                                            className={`w-full bg-zinc-900 border border-white/[0.05] rounded-2xl py-5 px-4 text-center text-4xl font-mono tracking-[0.5em] text-white focus:outline-none focus:ring-2 ${theme.ring} transition-all duration-300`}
                                            placeholder="000000"
                                        />
                                    </div>
                                    
                                    <div className="flex items-start gap-4 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                                        <AlertTriangle className="text-amber-500 shrink-0" size={18} />
                                        <p className="text-[10px] leading-relaxed text-amber-200/50">
                                            Make sure your device's time is synchronized. Codes change every 30 seconds.
                                        </p>
                                    </div>
                                </div>

                                <button 
                                    onClick={handleVerifyCode}
                                    disabled={isLoading || verificationCode.length !== 6}
                                    className={`w-full ${theme.bg} text-white font-bold uppercase text-[11px] tracking-[0.2em] py-4 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 shadow-xl shadow-black/40 disabled:opacity-50`}
                                >
                                    {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : <>Finish Verification <ArrowRight size={14} /></>}
                                </button>
                                
                                <button 
                                    onClick={() => setStep('SCAN')}
                                    className="w-full text-[10px] font-bold uppercase tracking-widest text-[#a1a1aa] hover:text-white transition-colors"
                                >
                                    Back to QR Code
                                </button>
                            </motion.div>
                        )}

                        {/* BACKUP STEP */}
                        {step === 'BACKUP' && (
                            <motion.div 
                                key="backup"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6 pt-4"
                            >
                                <div className="text-center">
                                    <div className="mx-auto p-2 bg-amber-500/10 rounded-full w-fit mb-4">
                                        <AlertTriangle className="text-amber-500" size={24} />
                                    </div>
                                    <h2 className="text-2xl font-bold text-white tracking-tight">Recovery Codes</h2>
                                    <p className="text-sm text-zinc-400 mt-2">Save these codes. You'll need them if you lose access to your device.</p>
                                </div>

                                <div className="grid grid-cols-2 gap-2 bg-zinc-950 p-4 rounded-2xl border border-white/5 shadow-inner">
                                    {backupCodes.map((code, idx) => (
                                        <div key={idx} className="flex items-center gap-3 p-2 group">
                                            <span className="text-[10px] font-mono text-zinc-700 w-4">{idx + 1}.</span>
                                            <code className="text-sm font-mono text-zinc-300 tracking-wider group-hover:text-white transition-colors">{code}</code>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex gap-2">
                                    <button 
                                        onClick={copyBackupCodes}
                                        className="flex-1 bg-zinc-900 text-white font-bold uppercase text-[9px] tracking-widest py-3 rounded-xl border border-white/5 hover:bg-zinc-800 transition-all flex items-center justify-center gap-2"
                                    >
                                        {copied ? <Check size={14} /> : <Clipboard size={14} />} {copied ? 'Copied' : 'Copy'}
                                    </button>
                                    <button 
                                        onClick={downloadBackupCodes}
                                        className="flex-1 bg-zinc-900 text-white font-bold uppercase text-[9px] tracking-widest py-3 rounded-xl border border-white/5 hover:bg-zinc-800 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Download size={14} /> Download
                                    </button>
                                </div>

                                <button 
                                    onClick={() => setStep('SUCCESS')}
                                    className={`w-full ${theme.bg} text-white font-bold uppercase text-[11px] tracking-[0.2em] py-4 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 shadow-xl shadow-black/40`}
                                >
                                    I've Saved Them <ArrowRight size={14} />
                                </button>

                                <div className="text-center border-t border-white/5 pt-4">
                                    <p className="text-[10px] text-zinc-600 uppercase font-bold tracking-widest">Crucial Information</p>
                                    <p className="text-[9px] text-zinc-700 mt-1 italic">Each code can only be used once.</p>
                                </div>
                            </motion.div>
                        )}

                        {/* SUCCESS STEP */}
                        {step === 'SUCCESS' && (
                            <motion.div 
                                key="success"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="space-y-6 pt-4 text-center"
                            >
                                <div className="mx-auto w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center relative">
                                    <motion.div 
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: 'spring', damping: 10, stiffness: 100, delay: 0.2 }}
                                        className="bg-emerald-500 rounded-full p-4 shadow-[0_0_30px_rgba(16,185,129,0.4)]"
                                    >
                                        <Check size={40} className="text-white" />
                                    </motion.div>
                                    <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 animate-ping duration-[3000ms]" />
                                </div>

                                <div>
                                    <h2 className="text-2xl font-bold text-white tracking-tight">Setup Complete</h2>
                                    <p className="text-sm text-zinc-400 mt-2">
                                        Two-factor authentication is now active on your account.
                                    </p>
                                </div>
                                
                                <div className="p-4 rounded-xl bg-zinc-950/50 border border-white/5">
                                    <p className="text-[10px] text-zinc-500 leading-relaxed">
                                        Identity verification will now be required for every login attempt from any device.
                                    </p>
                                </div>

                                <button 
                                    onClick={() => {
                                        onComplete();
                                        onClose();
                                    }}
                                    className={`w-full ${theme.bg} text-white font-bold uppercase text-[11px] tracking-[0.2em] py-4 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 shadow-xl shadow-black/40`}
                                >
                                    Dismiss <Check size={14} />
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
};

export default TwoFactorSetupWizard;
