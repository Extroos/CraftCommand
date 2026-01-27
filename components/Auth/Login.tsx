
import React, { useState } from 'react';
import { Command, Mail, Lock, ArrowRight, Loader2, Info, Globe } from 'lucide-react';

import { API } from '../../services/api';
import { useToast } from '../UI/Toast';

interface LoginProps {
    onLogin: () => void;
    onViewStatus?: () => void; // Optional prop for the status page navigation
}

const Login: React.FC<LoginProps> = ({ onLogin, onViewStatus }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { addToast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        
        try {
            const success = await API.login(email, password);
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
        <div className="min-h-screen flex flex-col items-center justify-center bg-background relative overflow-hidden p-6 font-sans">
            {/* Background Decoration */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none"></div>
            <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none"></div>
            
            <div className="w-full max-w-[420px] relative z-10 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-500">
                {/* Brand Header */}
                <div className="flex flex-col items-center justify-center text-center">
                    <div className="relative mb-8 group cursor-default">
                        <div className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full opacity-20 group-hover:opacity-40 transition-opacity duration-700"></div>
                        <img 
                            src="/brand-icon.png" 
                            alt="CraftCommand" 
                            className="w-24 h-24 object-contain relative z-10 drop-shadow-2xl hover:scale-105 transition-transform duration-500 ease-out" 
                        />
                    </div>
                    
                    <h1 className="text-3xl font-black tracking-tighter text-foreground mb-2">Welcome Back</h1>
                    <p className="text-sm font-medium text-muted-foreground/80 tracking-wide">Authenticate to access your command center</p>
                </div>

                {/* Main Card */}
                <div className="bg-[#09090b]/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-8 relative overflow-hidden group/card ring-1 ring-white/5">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50"></div>
                    
                    <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] ml-1">Email Identifier</label>
                            <div className="relative group/input">
                                <div className="absolute left-4 top-3.5 text-muted-foreground group-focus-within:text-primary transition-colors duration-300">
                                    <Mail size={18} />
                                </div>
                                <input 
                                    type="email" 
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-[#18181b]/60 border border-white/5 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 focus:bg-[#18181b] transition-all duration-300 shadow-inner"
                                    placeholder="admin@craftcommand.io"
                                />
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <div className="flex items-center justify-between ml-1">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Password Key</label>
                            </div>
                            <div className="relative group/input">
                                <div className="absolute left-4 top-3.5 text-muted-foreground group-focus-within:text-primary transition-colors duration-300">
                                    <Lock size={18} />
                                </div>
                                <input 
                                    type="password" 
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-[#18181b]/60 border border-white/5 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 focus:bg-[#18181b] transition-all duration-300 shadow-inner tracking-widest"
                                    placeholder="••••••••••••"
                                />
                            </div>
                        </div>

                        <button 
                            type="submit" 
                            disabled={isLoading}
                            className="w-full bg-primary text-primary-foreground font-black uppercase text-[11px] tracking-[0.2em] py-4 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 mt-4 shadow-lg shadow-black/20 disabled:opacity-50 disabled:cursor-not-allowed group/btn"
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
                            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-500 hover:text-emerald-400 transition-colors bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 hover:border-emerald-500/20 px-6 py-2.5 rounded-full backdrop-blur-sm"
                        >
                            <Globe size={12} /> Public Status Portal
                        </button>
                    )}
                    
                    {false && <a href="#" className="text-[10px] font-medium text-muted-foreground/50 hover:text-primary transition-colors">Recover Account Access</a>}
                </div>

                {/* Credentials Info Module */}
                <div className="mt-4 bg-[#09090b]/60 border border-white/5 rounded-xl p-4 backdrop-blur-md flex gap-4 ring-1 ring-black/20">
                     <div className="bg-blue-500/10 p-2.5 rounded-lg h-fit shrink-0 border border-blue-500/10">
                        <Info size={16} className="text-blue-400" />
                     </div>
                     <div className="w-full space-y-3">
                        <div>
                            <p className="text-xs font-bold text-zinc-200 uppercase tracking-wide">Developer Preview</p>
                            <p className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed">
                                Use these default credentials to access the dashboard environment.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                            <div className="flex items-center justify-between bg-black/20 hover:bg-black/40 px-3 py-2.5 rounded-lg border border-white/5 cursor-pointer active:scale-[0.99] transition-all group/cred" onClick={() => setEmail('admin@craftcommand.io')}>
                                <span className="text-[9px] uppercase font-bold text-muted-foreground/70 tracking-widest group-hover/cred:text-primary/70 transition-colors">E-Mail</span>
                                <span className="font-mono text-[10px] text-zinc-300 font-medium">admin@craftcommand.io</span>
                            </div>
                             <div className="flex items-center justify-between bg-black/20 hover:bg-black/40 px-3 py-2.5 rounded-lg border border-white/5 cursor-pointer active:scale-[0.99] transition-all group/cred" onClick={() => setPassword('admin')}>
                                <span className="text-[9px] uppercase font-bold text-muted-foreground/70 tracking-widest group-hover/cred:text-primary/70 transition-colors">Pass</span>
                                <span className="font-mono text-[10px] text-zinc-300 font-medium">admin</span>
                            </div>
                        </div>
                     </div>
                </div>
                
                <div className="text-center opacity-20 text-[9px] font-mono tracking-[0.3em] uppercase mix-blend-screen hover:opacity-100 transition-opacity cursor-default">
                    CraftCommand &copy; 2026
                </div>
            </div>
        </div>
    );
};

export default Login;
