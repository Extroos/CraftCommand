import React, { useState, useMemo } from 'react';
import { Command, Mail, Lock, ArrowRight, Loader2, Info, Globe, Check } from 'lucide-react';
import pkg from '../../../../package.json';

import { useToast } from '../ui/Toast';
import { useUser } from '@features/auth/context/UserContext';
import TwoFactorChallenge from './components/TwoFactorChallenge';


interface LoginProps {
    onLogin: () => void;
    onViewStatus?: () => void; // Optional prop for the status page navigation
}

const Login: React.FC<LoginProps> = ({ onLogin, onViewStatus }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [email, setEmail] = useState(() => localStorage.getItem('cc_remembered_email') || '');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem('cc_remembered_email'));
    const { login, logout, user, guestPrefs, theme, twoFactorRequired } = useUser();
    const { addToast } = useToast();

    const isQuality = user ? user.preferences.visualQuality : guestPrefs.visualQuality;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // Persist or clear remembered email
        if (rememberMe) {
            localStorage.setItem('cc_remembered_email', email);
        } else {
            localStorage.removeItem('cc_remembered_email');
        }
        
        try {
            const status = await login(email, password);
            if (status === 'success') {
                addToast('success', 'Welcome', 'Access granted.');
                onLogin();
            } else if (status === 'rate-limited') {
                addToast('error', 'Too Many Attempts', 'Please wait 15 minutes before trying again or contact support.');
            } else if (status === 'failed') {
                // If login returns failed, it means credentials failed
                addToast('error', 'Access Denied', 'Invalid email or password.');
            }
            // If status is '2fa', the UI will pivot via the state change

        } catch (e) {
            addToast('error', 'Error', 'Connection failed.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleForgotPassword = () => {
        addToast('info', 'Password Recovery', 'Contact your server administrator or use the CLI to reset your password.');
    };

    const hasBg = useMemo(() => {
        const cached = localStorage.getItem('cc_backgrounds');
        if (!cached) return false;
        try {
            const parsed = JSON.parse(cached);
            return parsed.global || parsed.login;
        } catch (e) {
            return false;
        }
    }, []);

    const bgClass = hasBg ? 'bg-transparent-if-bg' : (isQuality ? 'bg-zinc-950/20' : 'bg-[#09090b]');

    return (
        <div className={`min-h-screen flex flex-col items-center justify-center relative overflow-y-auto p-6 font-sans transition-colors duration-200 ${bgClass}`}>
            
            {/* Minimalist Accents - Matching ServerSelection's subtle look */}
            <div className={`absolute top-0 left-0 w-full h-full bg-zinc-950/10 pointer-events-none ${isQuality ? 'block' : 'hidden'}`}></div>
            
            <div className="w-full max-w-[380px] relative z-10 flex flex-col gap-8">
                {/* Brand Header: Pure & Authoritative */}
                <div className="flex flex-col items-center justify-center text-center space-y-4 select-none">
                    <div className="relative">
                        <img 
                            src="/website-icon.png" 
                            alt="CraftCommand" 
                            className="w-20 h-20 object-contain" 
                        />
                    </div>
                    <div className="space-y-1 relative">
                        <h1 className="text-xl font-bold tracking-tight text-white/90">
                            CraftCommand
                        </h1>
                        <p className="text-[#71717a] text-[10px] font-black uppercase tracking-wider">v{pkg.version}</p>
                    </div>
                </div>

                {/* Main Card: Sleek Professional Surface */}
                <div 
                    className={`bg-[#0c0c0e] border border-white/[0.05] rounded-md shadow-2xl p-8 relative overflow-hidden`}
                >
                    {!twoFactorRequired ? (
                        <form 
                            onSubmit={handleSubmit} 
                            className="space-y-6 relative z-10"
                        >
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-[#52525b] uppercase tracking-widest ml-1">Email</label>
                                <div className="relative">
                                    <input 
                                        type="email" 
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className={`w-full bg-[#09090b] border border-white/[0.05] rounded-md py-2.5 px-4 text-xs text-white placeholder:text-[#3f3f46] focus:outline-none focus:border-white/10 transition-all duration-200`}
                                        placeholder="user@localhost"
                                    />
                                </div>
                            </div>
                            
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between ml-1">
                                    <label className="text-[10px] font-bold text-[#52525b] uppercase tracking-widest">Password</label>
                                </div>
                                <div className="relative">
                                    <input 
                                        type="password" 
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className={`w-full bg-[#09090b] border border-white/[0.05] rounded-md py-2.5 px-4 text-xs text-white placeholder:text-[#3f3f46] focus:outline-none focus:border-white/10 transition-all duration-200`}
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>

                            {/* Remember Me & Forgot Password */}
                            <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2 cursor-pointer group/remember select-none">
                                    <div 
                                        className={`w-3.5 h-3.5 rounded-sm border transition-all flex items-center justify-center ${
                                            rememberMe 
                                                ? 'bg-white border-white/20' 
                                                : 'border-white/10 bg-transparent group-hover/remember:border-white/20'
                                        }`}
                                        onClick={(e) => { e.preventDefault(); setRememberMe(!rememberMe); }}
                                    >
                                        {rememberMe && <Check size={8} className="text-black" strokeWidth={4} />}
                                    </div>
                                    <span className="text-[10px] font-medium text-[#52525b] group-hover/remember:text-[#71717a] transition-colors" onClick={() => setRememberMe(!rememberMe)}>Remember me</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={handleForgotPassword}
                                    className="text-[10px] font-medium text-[#52525b] hover:text-[#71717a] transition-colors"
                                >
                                    Forgot password?
                                </button>
                            </div>

                            <button 
                                type="submit" 
                                disabled={isLoading}
                                className={`w-full bg-white text-black font-black uppercase text-[10px] tracking-[0.2em] py-3.5 rounded-md hover:bg-zinc-200 active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2 mt-4 disabled:opacity-50`}
                            >
                                {isLoading ? (
                                    <Loader2 className="animate-spin h-4 w-4" />
                                ) : (
                                    <>
                                        Sign In <ArrowRight size={12} />
                                    </>
                                )}
                            </button>
                        </form>
                    ) : (
                        <div>
                            <TwoFactorChallenge 
                                onSuccess={onLogin}
                                onCancel={() => logout()}
                            />
                        </div>
                    )}
                </div>

                {/* Footer: Subtle & Clean */}
                <div className="flex flex-col items-center gap-6">
                    {onViewStatus && (
                        <button 
                            onClick={onViewStatus}
                            className="text-[9px] font-black uppercase tracking-[0.2em] text-[#3f3f46] hover:text-[#71717a] transition-colors py-1"
                        >
                            View Server Status
                        </button>
                    )}
                    
                    <div className="flex items-center gap-3 opacity-5">
                        <div className="h-[1px] w-6 bg-white"></div>
                        <span className="text-[8px] font-bold uppercase tracking-[0.4em] text-white">READY</span>
                        <div className="h-[1px] w-6 bg-white"></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
