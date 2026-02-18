import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Key, ArrowRight, Loader2, RotateCcw } from 'lucide-react';
import { useToast } from '../../ui/Toast';
import { useUser } from '../context/UserContext';

interface TwoFactorChallengeProps {
    onSuccess: () => void;
    onCancel: () => void;
}

const TwoFactorChallenge: React.FC<TwoFactorChallengeProps> = ({ onSuccess, onCancel }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [code, setCode] = useState('');
    const [isRecovery, setIsRecovery] = useState(false);
    const { verify2FA, theme, guestPrefs } = useUser();
    const { addToast } = useToast();

    const isQuality = guestPrefs.visualQuality;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (code.length < 6) return;

        setIsLoading(true);
        try {
            const success = await verify2FA(code, isRecovery);
            if (success) {
                addToast('success', 'Verified', 'Identity confirmed.');
                onSuccess();
            } else {
                addToast('error', 'Verification Failed', isRecovery ? 'Invalid recovery code.' : 'Invalid 2FA code.');
            }
        } catch (e) {
            addToast('error', 'Error', 'Connection failed.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6 relative z-10">
            <div className="flex flex-col items-center gap-3 text-center mb-2">
                <div className={`p-3 rounded-full ${theme.softBg} ${theme.text}`}>
                    <ShieldCheck size={32} />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Two-Factor Security</h2>
                    <p className="text-xs text-zinc-400 mt-1">
                        {isRecovery 
                            ? 'Enter one of your 8-character recovery codes.' 
                            : 'Enter the 6-digit code from your authenticator app.'}
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-[#71717a] uppercase tracking-widest ml-1">
                        {isRecovery ? 'Recovery Code' : 'Verification Code'}
                    </label>
                    <div className="relative group/input">
                        <input 
                            type="text" 
                            required
                            autoFocus
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            className={`w-full bg-[#18181b] border border-white/[0.05] rounded-xl py-4 px-4 text-center text-2xl font-mono tracking-[0.3em] text-white placeholder:text-[#333] focus:outline-none focus:border-white/20 focus:ring-1 ${theme.ring} transition-all duration-300`}
                            placeholder={isRecovery ? "XXXX-XXXX" : "000000"}
                            maxLength={isRecovery ? 9 : 6}
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <button 
                        type="submit" 
                        disabled={isLoading || (isRecovery ? code.length < 8 : code.length < 6)}
                        className={`w-full bg-foreground text-background font-bold uppercase text-[11px] tracking-[0.2em] py-4 rounded-xl hover:bg-foreground/90 active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 shadow-xl shadow-black/40 disabled:opacity-50`}
                    >
                        {isLoading ? (
                            <Loader2 className="animate-spin h-4 w-4" />
                        ) : (
                            <>
                                Verify Identity <ArrowRight size={14} />
                            </>
                        )}
                    </button>

                    <button 
                        type="button"
                        onClick={() => {
                            setIsRecovery(!isRecovery);
                            setCode('');
                        }}
                        className="text-[10px] font-bold uppercase tracking-widest text-[#a1a1aa] hover:text-white transition-colors py-2 flex items-center justify-center gap-2"
                    >
                        {isRecovery ? (
                            <>Use Authenticator App</>
                        ) : (
                            <><Key size={12} /> Use Recovery Code</>
                        )}
                    </button>

                    <button 
                        type="button"
                        onClick={onCancel}
                        className="text-[10px] font-bold uppercase tracking-widest text-rose-500/70 hover:text-rose-500 transition-colors py-1 flex items-center justify-center gap-2"
                    >
                        <RotateCcw size={12} /> Back to Login
                    </button>
                </div>
            </form>
        </div>
    );
};

export default TwoFactorChallenge;
