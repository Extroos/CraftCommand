import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ShieldAlert, Network, RotateCcw, AlertTriangle, Key, Fingerprint, Lock, Unlock, Info, Shield, Activity } from 'lucide-react';
import { STAGGER_ITEM } from '../../../styles/motion';

interface SecuritySettingsProps {
    config: any;
    handleChange: (key: string, value: any) => void;
    handleSecurityChange: (key: string, value: any) => void;
    globalSettings: any;
    currentServer: any;
}

export const SecuritySettings: React.FC<SecuritySettingsProps> = ({
    config, handleChange, handleSecurityChange, globalSettings, currentServer
}) => {
    const [newIp, setNewIp] = useState('');

    const handleAddIp = () => {
        if (newIp && !config.securityConfig.allowedIps.includes(newIp)) {
            handleSecurityChange('allowedIps', [...config.securityConfig.allowedIps, newIp]);
            setNewIp('');
        }
    };

    const handleRemoveIp = (ipToRemove: string) => {
        handleSecurityChange('allowedIps', config.securityConfig.allowedIps.filter((ip: string) => ip !== ipToRemove));
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
            <div className="space-y-3 xl:col-span-2">
                {/* Firewall Panel */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className={`p-6 transition-all duration-300 bg-card rounded-md border border-border/40 shadow-sm`}
                >

                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/60">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                                <ShieldAlert size={14} className="text-rose-500/70" />
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-foreground/90">L3/L4 Firewall</h3>
                                <p className="text-[10px] text-muted-foreground font-medium opacity-70">Packet Filter logic</p>
                            </div>
                        </div>
                        <div className={`w-7 h-3.5 rounded-full border flex items-center p-0.5 transition-all cursor-pointer ${
                            config.securityConfig.firewallEnabled
                            ? 'bg-rose-500 border-rose-500 justify-end' 
                            : 'bg-muted border-border justify-start'
                        }`} onClick={() => handleSecurityChange('firewallEnabled', !config.securityConfig.firewallEnabled)}>
                             <div className={`w-2 h-2 rounded-full transition-all ${config.securityConfig.firewallEnabled ? 'bg-white' : 'bg-muted-foreground'}`} />
                        </div>
                    </div>
                    
                    <div className={`space-y-4 transition-all duration-300 ${!config.securityConfig.firewallEnabled ? 'opacity-40 grayscale pointer-events-none' : 'opacity-100'}`}>
                        <div className="bg-muted/10 border border-border/40 rounded-md p-3">
                            <h4 className="text-[9px] font-black uppercase tracking-widest mb-3 flex items-center gap-2 text-foreground/70"><Network size={12} className="text-primary/70" /> ACL: Source Address Whitelist</h4>
                            <div className="flex gap-2 mb-3">
                                <input 
                                    type="text" 
                                    value={newIp}
                                    onChange={(e) => setNewIp(e.target.value)}
                                    placeholder="0.0.0.0" 
                                    className="flex-1 bg-background border border-border/60 rounded-md px-2.5 py-1.5 text-[11px] font-mono text-primary/80 focus:outline-none focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/20"
                                />
                                <button onClick={handleAddIp} className="bg-primary/90 text-primary-foreground px-3 rounded-md text-[9px] font-black uppercase tracking-widest hover:bg-primary transition-all">Add Hook</button>
                            </div>
                            
                            <div className="flex flex-wrap gap-1.5">
                                {config.securityConfig.allowedIps.map((ip: string) => (
                                    <div key={ip} className="bg-primary/5 border border-primary/20 text-primary/80 px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-2 group/ip hover:bg-primary/10 transition-colors">
                                        {ip}
                                        <button onClick={() => handleRemoveIp(ip)} className="hover:text-primary transition-opacity"><RotateCcw className="rotate-45" size={10} /></button>
                                    </div>
                                ))}
                                {config.securityConfig.allowedIps.length === 0 && (
                                    <span className="text-[9px] text-muted-foreground/40 font-mono flex items-center gap-2 uppercase font-bold tracking-tighter"><AlertTriangle size={10}/> No Policy defined (ANY/ANY)</span>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Access Control */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className={`p-6 transition-all duration-300 bg-card rounded-md border border-border/40 shadow-sm`}
                >
                    
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                        <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                            <Key size={14} className="text-primary/70" />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-foreground/90">Access Control</h3>
                            <p className="text-[10px] text-muted-foreground font-medium opacity-70">Auth Policy Enforcement</p>
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        {[
                            { label: 'Multifactor Auth (2FA)', key: 'requireOp2fa', icon: <Fingerprint size={12} /> },
                            { label: 'Enforce SSL/TLS Layer', key: 'forceSsl', icon: <Lock size={12} /> },
                        ].map((item) => (
                            <label key={item.key} className="group flex items-center justify-between px-3 py-2 rounded-md border border-border/40 bg-muted/20 hover:bg-muted/40 cursor-pointer transition-all">
                                <div className="flex items-center gap-2.5">
                                    <div className="text-muted-foreground/60 group-hover:text-primary transition-colors">
                                        {item.icon}
                                    </div>
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/80 group-hover:text-foreground/80 transition-colors">{item.label}</span>
                                </div>
                                 <div className={`w-7 h-3.5 rounded-full border flex items-center p-0.5 transition-all ${
                                        config.securityConfig[item.key as keyof typeof config.securityConfig] 
                                        ? 'bg-primary border-primary justify-end' 
                                        : 'bg-muted border-border justify-start'
                                    }`}>
                                        <input 
                                            type="checkbox" 
                                            checked={config.securityConfig[item.key as keyof typeof config.securityConfig] as boolean}
                                            onChange={(e) => handleSecurityChange(item.key as any, e.target.checked)}
                                            className="sr-only"
                                        />
                                        <div className={`w-2 h-2 rounded-full transition-all ${config.securityConfig[item.key as keyof typeof config.securityConfig] ? 'bg-primary-foreground' : 'bg-muted-foreground'}`} />
                                    </div>
                            </label>
                        ))}

                        <label className={`group flex items-center justify-between px-3 py-2 rounded-md border transition-all mt-2 ${
                            !config.onlineMode
                            ? 'bg-rose-500/5 border-rose-500/20'
                            : 'bg-muted/20 border-border/40'
                        }`}>
                            <div className="flex gap-2.5 items-center">
                                <div className={`p-1 rounded-md transition-colors ${!config.onlineMode ? 'bg-rose-500/10 text-rose-500' : 'bg-muted/40 text-muted-foreground/60'}`}>
                                    <Unlock size={12} />
                                </div>
                                <div>
                                    <h4 className={`text-[9px] font-black uppercase tracking-wider ${!config.onlineMode ? 'text-rose-400' : 'text-muted-foreground/80'}`}>Bypass MD5 Auth</h4>
                                    <p className="text-[7px] font-bold text-muted-foreground/40 uppercase tracking-tighter">OFFLINE_MODE_UNSECURE</p>
                                </div>
                            </div>
                            <div className={`w-7 h-3.5 rounded-full border flex items-center p-0.5 transition-all cursor-pointer ${
                                !config.onlineMode
                                ? 'bg-rose-500 border-rose-500 justify-end ' 
                                : 'bg-muted border-border justify-start'
                            }`} onClick={() => handleChange('onlineMode', !config.onlineMode)}>
                                 <div className={`w-2 h-2 rounded-full transition-all ${!config.onlineMode ? 'bg-white' : 'bg-muted-foreground'}`} />
                            </div>
                        </label>

                        {currentServer?.software === 'Velocity' && (
                            <div className="mt-2 p-3 bg-primary/5 border border-primary/10 rounded-lg">
                                <p className="text-[9px] font-bold text-primary/70 uppercase tracking-tight flex items-center gap-1.5">
                                    <Info size={10} /> Proxy Auth Layer
                                </p>
                                <p className="text-[9px] text-muted-foreground leading-relaxed mt-1">
                                    This affects the Proxy's internal authentication. For public use, 
                                    <span className="text-primary/70 font-bold ml-1 uppercase underline decoration-primary/20">Online Mode: ON</span> is highly recommended to protect downstream backends.
                                </p>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>

            <div className="space-y-3 xl:col-span-1">
                {/* Threat Mitigation */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className={`p-6 transition-all duration-300 bg-card rounded-md border border-border/40 shadow-sm`}
                >

                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                        <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                            <Shield size={14} className="text-primary/70" />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-foreground/90">Threat Mitigation</h3>
                            <p className="text-[10px] text-muted-foreground font-medium opacity-70">Edge Protection Stack</p>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        <div className={`p-3 rounded-md border transition-all duration-300 ${
                            config.securityConfig.ddosProtection 
                            ? 'bg-primary/5 border-primary/20' 
                            : 'bg-muted/20 border-border/40'
                        }`}>
                            <div className="flex justify-between items-center mb-1.5">
                                <label className={`text-[9px] font-black uppercase tracking-widest ${
                                    config.securityConfig.ddosProtection ? 'text-primary' : 'text-muted-foreground/60'
                                }`}>DDoS Mitigation</label>
                                <div className={`w-7 h-3.5 rounded-full border flex items-center p-0.5 transition-all cursor-pointer ${
                                    config.securityConfig.ddosProtection
                                    ? 'bg-primary border-primary justify-end' 
                                    : 'bg-muted border-border justify-start'
                                }`} onClick={() => handleSecurityChange('ddosProtection', !config.securityConfig.ddosProtection)}>
                                     <div className={`w-2 h-2 rounded-full transition-all ${config.securityConfig.ddosProtection ? 'bg-primary-foreground' : 'bg-muted-foreground'}`} />
                                </div>
                            </div>
                            <p className="text-[8px] font-bold text-muted-foreground/40 uppercase tracking-tighter leading-tight">Stateful Packet Inspection (SPI) & Throttling</p>
                        </div>

                        {/* Geographic Lock Placeholder */}
                        <div className="space-y-1 group/select">
                            <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground group-hover/select:text-foreground">Geographic Lock</label>
                            <div className="relative">
                                <select className="w-full bg-background border border-border/60 rounded-md px-2.5 py-1.5 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none transition-colors">
                                    <option value="">Status: Global (OPEN)</option>
                                    <option value="US">Region: North America</option>
                                    <option value="EU">Region: Europe</option>
                                    <option value="ASIA">Region: Asia</option>
                                </select>
                                <div className="absolute right-2.5 top-2 pointer-events-none text-muted-foreground/40">
                                    <ChevronDown size={12} /> {/* Assuming ChevronDown is imported, wait I didn't import ChevronDown in SecuritySettings, I will add it */}
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Integrity */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className={`p-6 transition-all duration-300 bg-card rounded-md border border-border/40 shadow-sm`}
                >

                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                        <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                            <Activity size={14} className="text-primary/70" />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-foreground/90">System Integrity</h3>
                            <p className="text-[10px] text-muted-foreground font-medium opacity-70">FIM: File Integrity Monitoring</p>
                        </div>
                    </div>
                    
                    <p className="text-[9px] font-bold text-muted-foreground/60 mb-4 leading-relaxed uppercase tracking-tight">Core assets (server.jar, eula.txt) are under kernel-level write-protection.</p>
                    <button className="w-full py-1.5 bg-primary/5 text-primary/80 border border-primary/20 rounded-md text-[9px] font-black uppercase tracking-widest hover:bg-primary/10 transition-all">
                        Perform MD5/SHA2 Validation
                    </button>
                </motion.div>
            </div>
        </div>
    );
};
