import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Command, Mail, Lock, ArrowRight, Loader2, Info, Globe } from 'lucide-react';


import { useToast } from '../ui/Toast';
import { useUser } from '@features/auth/context/UserContext';
import TwoFactorChallenge from './components/TwoFactorChallenge';


interface LoginProps {
    onLogin: () => void;
    onViewStatus?: () => void; // Optional prop for the status page navigation
}

const Login: React.FC<LoginProps> = ({ onLogin, onViewStatus }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isHolding, setIsHolding] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login, logout, user, guestPrefs, theme, twoFactorRequired } = useUser();
    const { addToast } = useToast();

    const isQuality = user ? user.preferences.visualQuality : guestPrefs.visualQuality;
    const isReducedMotion = user ? user.preferences.reducedMotion : guestPrefs.reducedMotion;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        
        try {
            const success = await login(email, password);
            if (success) {
                addToast('success', 'Welcome', 'Access granted.');
                onLogin();
            } else if (!twoFactorRequired) {
                // If login returns false and 2FA is NOT required, it means credentials failed
                addToast('error', 'Access Denied', 'Invalid email or password.');
            }
            // If twoFactorRequired is true, the UI will pivot via the state change
        } catch (e) {
            addToast('error', 'Error', 'Connection failed.');
        } finally {
            setIsLoading(false);
        }
    };

    const cachedBg = localStorage.getItem('cc_backgrounds');
    const hasBg = cachedBg ? JSON.parse(cachedBg).global || JSON.parse(cachedBg).login : false;
    const bgClass = hasBg ? 'bg-transparent-if-bg' : (isQuality ? 'bg-zinc-950/40' : 'bg-[#09090b]');

    return (
        <div className={`min-h-screen flex flex-col items-center justify-center relative overflow-y-auto p-6 font-sans transition-colors duration-700 ${bgClass}`}>
            
            {/* Minimalist Accents - Matching ServerSelection's subtle look */}
            <div className={`absolute top-0 left-0 w-full h-full bg-zinc-950/20 pointer-events-none ${isQuality ? 'block' : 'hidden'}`}></div>
            
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none`} />
            
            <motion.div 
                initial="hidden"
                animate="visible"
                variants={{
                    hidden: { opacity: 0 },
                    visible: {
                        opacity: 1,
                        transition: {
                            staggerChildren: 0.05
                        }
                    }
                }}
                className="w-full max-w-[380px] relative z-10 flex flex-col gap-8"
            >
                {/* Brand Header: Pure & Authoritative */}
                <motion.div 
                    variants={{
                        hidden: { opacity: 0, scale: 0.98 },
                        visible: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }
                    }}
                    className="flex flex-col items-center justify-center text-center space-y-4 group/header cursor-crosshair select-none"
                    onMouseDown={() => setIsHolding(true)}
                    onMouseUp={() => setIsHolding(false)}
                    onMouseLeave={() => setIsHolding(false)}
                    onTouchStart={() => setIsHolding(true)}
                    onTouchEnd={() => setIsHolding(false)}
                >
                    <div className="relative">
                        <img 
                            src="/website-icon.png" 
                            alt="CraftCommand" 
                            className="w-24 h-24 object-contain transition-all duration-300" 
                        />
                    </div>
                    <div className="space-y-1 relative">
                        <div className="relative inline-block">
                            <h1 className={`text-2xl font-bold tracking-tight text-white transition-all duration-150 ${isHolding ? 'scale-[0.98] brightness-125' : ''}`}>
                                CraftCommand
                            </h1>
                            {isHolding && (
                                <>
                                    <div className="absolute inset-0 text-2xl font-bold tracking-tight text-emerald-500 opacity-70 animate-glitch-1 mix-blend-screen overflow-hidden">
                                        CraftCommand
                                    </div>
                                    <div className="absolute inset-0 text-2xl font-bold tracking-tight text-blue-500 opacity-70 animate-glitch-2 mix-blend-screen overflow-hidden">
                                        CraftCommand
                                    </div>
                                </>
                            )}
                        </div>
                        <p className="text-[#a1a1aa] text-sm font-medium">Identify yourself to access the suite.</p>
                    </div>
                </motion.div>

                {/* Main Card: Sleek Professional Surface */}
                <motion.div 
                    variants={{
                        hidden: { opacity: 0, y: 15 },
                        visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } }
                    }}
                    className={`${isQuality ? 'glass-morphism quality-shadow' : 'bg-[#111111]'} border border-white/[0.08] rounded-2xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] p-8 relative overflow-hidden`}
                >
                    <AnimatePresence mode="wait">
                        {!twoFactorRequired ? (
                            <motion.form 
                                key="login-form"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                onSubmit={handleSubmit} 
                                className="space-y-6 relative z-10"
                            >
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-[#71717a] uppercase tracking-widest ml-1">Account Identifier</label>
                                    <div className="relative group/input">
                                        <input 
                                            type="email" 
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className={`w-full bg-[#18181b] border border-white/[0.05] rounded-xl py-3 px-4 text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:border-white/20 focus:ring-1 ${theme.ring} transition-all duration-300`}
                                            placeholder="user@localhost"
                                        />
                                    </div>
                                </div>
                                
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between ml-1">
                                        <label className="text-[10px] font-bold text-[#71717a] uppercase tracking-widest">Access Key</label>
                                    </div>
                                    <div className="relative group/input">
                                        <input 
                                            type="password" 
                                            required
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className={`w-full bg-[#18181b] border border-white/[0.05] rounded-xl py-3 px-4 text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:border-white/20 focus:ring-1 ${theme.ring} transition-all duration-300`}
                                            placeholder="••••••••"
                                        />
                                    </div>
                                </div>

                                <button 
                                    type="submit" 
                                    disabled={isLoading}
                                    className={`w-full bg-foreground text-background font-bold uppercase text-[11px] tracking-[0.2em] py-4 rounded-xl hover:bg-foreground/90 active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 mt-4 shadow-xl shadow-black/40 disabled:opacity-50`}
                                >
                                    {isLoading ? (
                                        <Loader2 className="animate-spin h-4 w-4" />
                                    ) : (
                                        <>
                                            Establish Connection <ArrowRight size={14} />
                                        </>
                                    )}
                                </button>
                            </motion.form>
                        ) : (
                            <motion.div
                                key="mfa-form"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                            >
                                <TwoFactorChallenge 
                                    onSuccess={onLogin}
                                    onCancel={() => logout()}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* Footer: Subtle & Clean */}
                <motion.div 
                    variants={{
                        hidden: { opacity: 0 },
                        visible: { opacity: 1, transition: { delay: 0.5 } }
                    }}
                    className="flex flex-col items-center gap-6"
                >
                    {onViewStatus && (
                        <button 
                            onClick={onViewStatus}
                            className="text-[10px] font-bold uppercase tracking-widest text-[#a1a1aa] hover:text-white transition-colors py-1 border-b border-transparent hover:border-white/20"
                        >
                            Monitor System Node Status
                        </button>
                    )}
                    
                    <div className="flex items-center gap-3 opacity-20">
                        <div className="h-[1px] w-8 bg-white"></div>
                        <span className="text-[8px] font-bold uppercase tracking-[0.4em] text-white">v1.11.8</span>
                        <div className="h-[1px] w-8 bg-white"></div>
                    </div>
                </motion.div>
            </motion.div>

            <style>{`
                @keyframes glitch-1 {
                    0% { transform: translate(0); }
                    20% { transform: translate(-2px, 2px); clip-path: inset(10% 0 30% 0); }
                    40% { transform: translate(-2px, -2px); clip-path: inset(40% 0 10% 0); }
                    60% { transform: translate(2px, 2px); clip-path: inset(80% 0 5% 0); }
                    80% { transform: translate(2px, -2px); clip-path: inset(0% 0 70% 0); }
                    100% { transform: translate(0); }
                }

                @keyframes glitch-2 {
                    0% { transform: translate(0); }
                    20% { transform: translate(2px, -2px); clip-path: inset(20% 0 40% 0); }
                    40% { transform: translate(2px, 2px); clip-path: inset(10% 0 60% 0); }
                    60% { transform: translate(-2px, -2px); clip-path: inset(50% 0 20% 0); }
                    80% { transform: translate(-2px, 2px); clip-path: inset(30% 0 20% 0); }
                    100% { transform: translate(0); }
                }

                .animate-glitch-1 {
                    animation: glitch-1 0.2s infinite linear alternate-reverse;
                }

                .animate-glitch-2 {
                    animation: glitch-2 0.3s infinite linear alternate-reverse;
                }
            `}</style>
        </div>
    );
};

export default Login;
