import React, { useState } from 'react';
import { Command, Mail, Lock, ArrowRight, Loader2, Info, Globe } from 'lucide-react';


import { useToast } from '../UI/Toast';
import { useUser } from '../../context/UserContext';

interface LoginProps {
    onLogin: () => void;
    onViewStatus?: () => void; // Optional prop for the status page navigation
}

const Login: React.FC<LoginProps> = ({ onLogin, onViewStatus }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login } = useUser();
    const { addToast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        
        try {
            const success = await login(email, password);
            if (success) {
                addToast('success', 'Welcome', 'Access granted.');
                onLogin();
            } else {
                addToast('error', 'Access Denied', 'Invalid email or password.');
            }
        } catch (e) {
            addToast('error', 'Error', 'Connection failed.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[rgb(var(--color-bg-app))] relative overflow-hidden p-6 font-sans">
            {/* Background Decoration */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-[rgb(var(--color-bg-app))] to-[rgb(var(--color-bg-app))] pointer-events-none"></div>
            <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none"></div>
            
            <div className="w-full max-w-[400px] relative z-10 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-500">
                {/* Brand Header */}
                <div className="flex flex-col items-center justify-center text-center">
                    <div className="relative mb-4 group cursor-default">
                        <div className="absolute inset-0 bg-emerald-500/10 rounded-full opacity-0 group-hover:opacity-20 transition-opacity duration-700"></div>
                        <img 
                            src="/website-icon.png" 
                            alt="CraftCommand" 
                            className="w-40 h-40 object-contain relative z-10 drop-shadow-2xl hover:scale-105 transition-transform duration-500 ease-out" 
                        />
                    </div>
                    
                    <h1 className="text-xl font-black tracking-tighter text-[rgb(var(--color-fg-primary))] mb-1 uppercase">Welcome Back</h1>
                    <p className="text-[10px] font-bold text-[rgb(var(--color-fg-muted))] tracking-[0.2em] uppercase opacity-60">System Authentication Protocol</p>
                </div>

                {/* Main Card */}
                <div className="bg-card border border-border rounded-lg shadow-2xl p-5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[rgb(var(--color-border-strong))] to-transparent opacity-50"></div>
                    
                    <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-[rgb(var(--color-fg-muted))] uppercase tracking-[0.2em] ml-1">Email Identifier</label>
                            <div className="relative group/input">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[rgb(var(--color-fg-muted))] group-focus-within:text-primary transition-colors duration-300">
                                    <Mail size={18} />
                                </div>
                                <input 
                                    type="email" 
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-[rgb(var(--color-bg-input))] border border-[rgb(var(--color-border-default))] rounded-lg py-2 pl-11 pr-4 text-sm font-bold text-[rgb(var(--color-fg-primary))] placeholder:text-[rgb(var(--color-fg-subtle))] focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all duration-300 shadow-inner"
                                    placeholder="admin@craftcommand.io"
                                />
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <div className="flex items-center justify-between ml-1">
                                <label className="text-[10px] font-bold text-[rgb(var(--color-fg-muted))] uppercase tracking-[0.2em]">Password Key</label>
                            </div>
                            <div className="relative group/input">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[rgb(var(--color-fg-muted))] group-focus-within:text-primary transition-colors duration-300">
                                    <Lock size={18} />
                                </div>
                                <input 
                                    type="password" 
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-[rgb(var(--color-bg-input))] border border-[rgb(var(--color-border-default))] rounded-lg py-2 pl-11 pr-4 text-sm font-bold text-[rgb(var(--color-fg-primary))] placeholder:text-[rgb(var(--color-fg-subtle))] focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all duration-300 shadow-inner tracking-widest"
                                    placeholder="••••••••••••"
                                />
                            </div>
                        </div>

                             <button 
                                type="submit" 
                                disabled={isLoading}
                                className="w-full bg-primary text-primary-foreground font-black uppercase text-[10px] tracking-[0.2em] py-3 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 mt-2 shadow-lg shadow-black/20 disabled:opacity-50 disabled:cursor-not-allowed group/btn"
                            >
                            {isLoading ? (
                                <Loader2 className="animate-spin h-4 w-4" />
                            ) : (
                                <>
                                    Secure Login <ArrowRight size={14} className="group-hover/btn:translate-x-0.5 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer Actions */}
                <div className="flex flex-col items-center gap-4 animate-in slide-in-from-bottom-2 fade-in duration-700 delay-100">
                    {false && onViewStatus && (
                        <button 
                            onClick={onViewStatus}
                            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-500 hover:text-emerald-500 transition-colors bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 hover:border-emerald-500/20 px-6 py-2.5 rounded-full"
                        >
                            <Globe size={12} /> Public Status Portal
                        </button>
                    )}
                    
                    {false && <a href="#" className="text-[10px] font-medium text-[rgb(var(--color-fg-subtle))] hover:text-primary transition-colors">Recover Account Access</a>}
                </div>

                {/* Credentials Info Module */}
                <div className="mt-2 bg-card border border-border rounded-lg p-3 flex gap-4 shadow-sm">
                     <div className="bg-blue-500/10 p-2.5 rounded-lg h-fit shrink-0 border border-blue-500/10">
                        <Info size={16} className="text-blue-400" />
                     </div>
                     <div className="w-full space-y-3">
                        <div>
                            <p className="text-xs font-bold text-[rgb(var(--color-fg-primary))] uppercase tracking-wide">Developer Preview</p>
                            <p className="text-[10px] text-[rgb(var(--color-fg-muted))] mt-0.5 leading-relaxed">
                                See README.md for default credentials or check your <code>.env</code> file configuration.
                            </p>
                        </div>
                     </div>
                </div>
                
                <a 
                    href="https://github.com/Extroos/craftCommand" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-center opacity-20 text-[9px] font-mono tracking-[0.3em] uppercase mix-blend-screen hover:opacity-100 hover:text-primary transition-all cursor-pointer"
                >
                    CraftCommand &copy; 2026
                </a>
            </div>
        </div>
    );
};

export default Login;
