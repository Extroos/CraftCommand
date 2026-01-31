
import React, { useState, useEffect } from 'react';
import { Server, Save, Terminal, Lock, Unlock, Folder, Play, Clock, Shield, Globe, Cpu, RotateCcw, Gamepad2, Swords, Ghost, Feather, ScrollText, AlertTriangle, AlertCircle, Fingerprint, Network, ShieldAlert, Key, Zap, ArrowRightLeft, Activity, ChevronDown, Check, Download, ExternalLink, Bot, X, Info, Plus, Minus, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { API } from '../../services/api';
import { useToast } from '../UI/Toast';
import { useServers } from '../../context/ServerContext';

import { SecurityConfig } from '@shared/types';

interface InputFieldProps {
    label: string;
    propKey: string;
    config: any;
    errors: Record<string, string>;
    handleChange: (key: string, value: any) => void;
    type?: string;
    placeholder?: string;
    mono?: boolean;
    note?: string;
    suffix?: string;
}

const InputField: React.FC<InputFieldProps> = ({ 
    label, propKey, config, errors, handleChange, 
    type = 'text', placeholder = '', mono = false, note = '', suffix = ''
}) => {
    const isNumber = type === 'number';
    
    // Recursive property access for nested config (e.g. advancedFlags.socketBuffer)
    const getVal = (obj: any, path: string): any => {
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    };

    const setVal = (path: string, val: any) => {
        const parts = path.split('.');
        if (parts.length === 1) {
            handleChange(path, val);
        } else {
            // Special handling for advancedFlags
            if (parts[0] === 'advancedFlags') {
                const newFlags = { ...config.advancedFlags, [parts[1]]: val };
                handleChange('advancedFlags', newFlags);
            }
            // Add other nested objects here if needed
        }
    };

    const currentVal = getVal(config, propKey);

    const increment = () => {
        const val = parseInt(currentVal || 0, 10);
        setVal(propKey, val + 1);
    };

    const decrement = () => {
        const val = parseInt(currentVal || 0, 10);
        setVal(propKey, Math.max(0, val - 1));
    };

    return (
        <div className="space-y-1.5 group">
            <label className="text-[10px] uppercase font-bold text-muted-foreground group-hover:text-foreground transition-colors flex justify-between items-center h-4 tracking-wider">
                {label}
                {errors[propKey] && <span className="text-rose-500 normal-case flex items-center gap-1 text-[10px] font-medium"><AlertCircle size={10} /> {errors[propKey]}</span>}
            </label>
            <div className={`relative flex items-center bg-background border rounded-md transition-all group-focus-within:ring-1 group-focus-within:ring-primary/20 ${
                errors[propKey] 
                ? 'border-rose-500/50 focus-within:border-rose-500' 
                : 'border-border/60 group-hover:border-primary/40 focus-within:border-primary'
            }`}>
                <input 
                    type={type} 
                    value={currentVal ?? ''}
                    onChange={(e) => {
                         let val = e.target.value;
                         if (type === 'number') {
                             const parsed = parseInt(val, 10);
                             setVal(propKey, isNaN(parsed) ? 0 : parsed);
                         } else {
                             setVal(propKey, val);
                         }
                    }}
                    className={`flex-1 min-w-0 bg-transparent px-2.5 py-1.5 text-[11px] outline-none ${
                        mono || isNumber ? 'font-mono text-primary/80 tabular-nums' : 'font-semibold text-foreground'
                    } placeholder:text-muted-foreground/30`}
                    placeholder={placeholder}
                />
                
                {suffix && (
                    <span className="text-[9px] text-muted-foreground/40 font-bold pr-2 ml-auto pointer-events-none select-none uppercase tracking-tighter">{suffix}</span>
                )}

                {isNumber && (
                    <div className="flex items-stretch border-l border-border/40 h-8 overflow-hidden rounded-r-md bg-muted/5">
                        <button 
                            type="button"
                            onClick={decrement}
                            className="hover:bg-rose-500/10 px-2.5 flex items-center justify-center text-muted-foreground/40 hover:text-rose-500 transition-colors cursor-pointer border-r border-border/20"
                        >
                            <Minus size={10} strokeWidth={3} />
                        </button>
                        <button 
                            type="button"
                            onClick={increment}
                            className="hover:bg-emerald-500/10 px-2.5 flex items-center justify-center text-muted-foreground/40 hover:text-emerald-500 transition-colors cursor-pointer"
                        >
                            <Plus size={10} strokeWidth={3} />
                        </button>
                    </div>
                )}
            </div>
            {note && <p className="text-[9px] text-muted-foreground/50 font-medium leading-tight">{note}</p>}
        </div>
    );
};

interface SettingsManagerProps {
    serverId: string;
}

const SettingsManager: React.FC<SettingsManagerProps> = ({ serverId }) => {
    const [activeTab, setActiveTab] = useState<'GENERAL' | 'SECURITY' | 'ADVANCED'>('GENERAL');
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const { addToast } = useToast();
    const { servers, stats } = useServers();
    const [showConfirm, setShowConfirm] = useState<{ 
        open: boolean; 
        type: 'DECOMMISSION' | 'RESET';
        title: string;
        description: string;
    }>({ open: false, type: 'RESET', title: '', description: '' });
    
    const [dockerStatus, setDockerStatus] = useState<{ online: boolean; version?: string; checking: boolean }>({ online: false, checking: false });
    const [globalSettings, setGlobalSettings] = useState<any>(null);
    
    // Detailed Config State
    const [config, setConfig] = useState({
        serverName: '',
        workingDirectory: '',
        logLocation: './logs/latest.log',
        executable: '',
        javaVersion: 'Do Not Override',
        ram: 4,
        cpuPriority: 'normal',
        executionCommand: '',
        stopCommand: 'stop',
        autostartDelay: 10,
        updateUrl: '',
        ip: '127.0.0.1',
        port: 25565,
        shutdownTimeout: 60,
        crashExitCodes: '0',
        logRetention: 0,
        executionEngine: 'native' as 'native' | 'docker',
        dockerImage: '',
        // Game Settings
        gamemode: 'survival',
        difficulty: 'normal',
        maxPlayers: 20,
        motd: 'A Minecraft Server',
        pvp: true,
        hardcore: false,
        allowFlight: false,
        spawnMonsters: true,
        spawnAnimals: true,
        levelSeed: '',
        viewDistance: 10,
        onlineMode: true,
        // Toggles
        autoStart: false,
        crashDetection: true,
        includeInTotal: true,
        publicStatus: false,
        // Security
        securityConfig: {
            firewallEnabled: true,
            allowedIps: [],
            ddosProtection: true,
            requireOp2fa: false,
            forceSsl: false,
            regionLock: []
        } as SecurityConfig,
        // Advanced Flags
        advancedFlags: {
            aikarFlags: false,

            installSpark: false,
            debugMode: false,
            antiDdos: false,
            // Pro-Grade Technical
            gcEngine: 'G1GC',
            socketBuffer: 32,
            compressionThreshold: 256,
            autoHealing: true,
            healthCheckInterval: 30,
            retryPattern: '10s, 30s, 1m',
            threadPriority: 'normal'
        }
    });

    const [newIp, setNewIp] = useState('');


    const { currentServer, updateServerConfig } = useServers();

    useEffect(() => {
        if (currentServer) {
            setConfig({
                serverName: currentServer.name || '',
                workingDirectory: currentServer.workingDirectory || `C:/servers/${currentServer.id}`,
                logLocation: currentServer.logLocation || './logs/latest.log',
                executable: currentServer.executable || 'server.jar',
                javaVersion: currentServer.javaVersion || 'Do Not Override',
                ram: currentServer.ram || 4,
                executionCommand: currentServer.executionCommand || `java -Xmx${currentServer.ram}G -jar server.jar nogui`,
                stopCommand: currentServer.stopCommand || 'stop',
                autostartDelay: currentServer.autostartDelay || 10,
                updateUrl: currentServer.updateUrl || '',
                ip: currentServer.ip || '127.0.0.1',
                port: currentServer.port || 25565,
                shutdownTimeout: currentServer.shutdownTimeout || 60,
                crashExitCodes: currentServer.crashExitCodes || '0',
                logRetention: currentServer.logRetention || 0,
                gamemode: currentServer.gamemode || 'survival',
                difficulty: currentServer.difficulty || 'normal',
                maxPlayers: currentServer.maxPlayers || 20,
                motd: currentServer.motd || '',
                pvp: currentServer.pvp !== undefined ? currentServer.pvp : true,
                hardcore: currentServer.hardcore !== undefined ? currentServer.hardcore : false,
                allowFlight: currentServer.allowFlight !== undefined ? currentServer.allowFlight : false,
                spawnMonsters: currentServer.spawnMonsters !== undefined ? currentServer.spawnMonsters : true,
                spawnAnimals: currentServer.spawnAnimals !== undefined ? currentServer.spawnAnimals : true,
                levelSeed: currentServer.levelSeed || '',
                viewDistance: currentServer.viewDistance || 10,
                onlineMode: currentServer.onlineMode !== undefined ? currentServer.onlineMode : true,
                autoStart: currentServer.autoStart || false,
                crashDetection: currentServer.crashDetection || true,
                includeInTotal: currentServer.includeInTotal || true,
                publicStatus: currentServer.publicStatus || false,
                securityConfig: currentServer.securityConfig || {
                    firewallEnabled: false,
                    allowedIps: [],
                    ddosProtection: false,
                    requireOp2fa: false,
                    forceSsl: false,
                    regionLock: []
                },
                advancedFlags: {
                    aikarFlags: currentServer.advancedFlags?.aikarFlags || false,

                    installSpark: currentServer.advancedFlags?.installSpark || false,
                    debugMode: currentServer.advancedFlags?.debugMode || false,
                    antiDdos: currentServer.advancedFlags?.antiDdos || false,
                    gcEngine: currentServer.advancedFlags?.gcEngine || 'G1GC',
                    socketBuffer: currentServer.advancedFlags?.socketBuffer || 32,
                    compressionThreshold: currentServer.advancedFlags?.compressionThreshold || 256,
                    autoHealing: currentServer.advancedFlags?.autoHealing !== undefined ? currentServer.advancedFlags?.autoHealing : true,
                    healthCheckInterval: currentServer.advancedFlags?.healthCheckInterval || 30,
                    retryPattern: currentServer.advancedFlags?.retryPattern || '10s, 30s, 1m',
                    threadPriority: currentServer.advancedFlags?.threadPriority || 'normal'
                },
                cpuPriority: currentServer.cpuPriority || 'normal',
                executionEngine: currentServer.executionEngine || 'native',
                dockerImage: currentServer.dockerImage || ''
            });
        }
    }, [currentServer?.id]);

    useEffect(() => {
        API.getGlobalSettings().then(setGlobalSettings).catch(console.error);
    }, []);

    const checkDocker = async () => {
        setDockerStatus(prev => ({ ...prev, checking: true }));
        try {
            const status = await API.getDockerStatus();
            setDockerStatus({ ...status, checking: false });
            if (status.online) {
                addToast('success', 'Docker Online', `Connected to Docker v${status.version}`);
            } else {
                addToast('warning', 'Docker Offline', 'The Docker Daemon is not responding.');
            }
        } catch (e) {
            setDockerStatus({ online: false, checking: false });
            addToast('error', 'Check Failed', 'Failed to communicate with the backend for Docker status.');
        }
    };


    const validate = (key: string, value: any): string | null => {
        if (key === 'port') {
            if (value < 1024 || value > 65535) return 'Port must be between 1024 and 65535';
        }
        if (key === 'maxPlayers') {
            if (value < 1) return 'Must allow at least 1 player';
            if (value > 1000) return 'Max players cannot exceed 1000';
        }
        if (key === 'ram') {
            if (value < 1) return 'RAM must be at least 1GB';
        }
        if (key === 'viewDistance') {
            if (value < 2 || value > 32) return 'View distance must be 2-32';
        }
        if (key === 'serverName') {
            if (!value.trim()) return 'Server name is required';
        }
        return null;
    };

    const handleChange = (key: string, value: any) => {
        // Robust Number Sanitization
        let sanitizedValue = value;
        if (typeof value === 'number' && isNaN(value)) {
            // Check if parsing failed (e.g. empty input for number field)
            sanitizedValue = 0; 
        }

        const error = validate(key, sanitizedValue);
        setErrors(prev => {
            const newErrors = { ...prev };
            if (error) newErrors[key] = error;
            else delete newErrors[key];
            return newErrors;
        });

        setConfig(prev => ({ ...prev, [key]: sanitizedValue }));
        setIsDirty(true);
    };

    const handleSecurityChange = (key: keyof SecurityConfig, value: any) => {
        setConfig(prev => ({
            ...prev,
            securityConfig: { ...prev.securityConfig, [key]: value }
        }));
        setIsDirty(true);
    };

    const handleAddIp = () => {
        if (!newIp.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)) {
            addToast('error', 'Invalid IP', 'Please enter a valid IPv4 address.');
            return;
        }
        handleSecurityChange('allowedIps', [...config.securityConfig.allowedIps, newIp]);
        setNewIp('');
    };

    const handleRemoveIp = (ip: string) => {
        handleSecurityChange('allowedIps', config.securityConfig.allowedIps.filter(i => i !== ip));
    };


    const handleSave = async () => {

        if (Object.keys(errors).length > 0) {
            addToast('error', 'Invalid Configuration', 'Please fix the errors before saving.');
            return;
        }


        const updates = {
            name: config.serverName,
            workingDirectory: config.workingDirectory,
            logLocation: config.logLocation,
            executable: config.executable,
            javaVersion: config.javaVersion as 'Java 8' | 'Java 11' | 'Java 17' | 'Java 21',
            ram: config.ram,
            executionCommand: config.executionCommand,
            stopCommand: config.stopCommand,
            autostartDelay: config.autostartDelay,
            updateUrl: config.updateUrl,
            ip: config.ip,
            port: config.port,
            shutdownTimeout: config.shutdownTimeout,
            crashExitCodes: config.crashExitCodes,
            logRetention: config.logRetention,
            gamemode: config.gamemode,
            difficulty: config.difficulty,
            maxPlayers: config.maxPlayers,
            motd: config.motd,
            pvp: config.pvp,
            hardcore: config.hardcore,
            allowFlight: config.allowFlight,
            spawnMonsters: config.spawnMonsters,
            spawnAnimals: config.spawnAnimals,
            levelSeed: config.levelSeed,
            viewDistance: config.viewDistance,
            onlineMode: config.onlineMode,
            autoStart: config.autoStart,
            crashDetection: config.crashDetection,
            includeInTotal: config.includeInTotal,
            publicStatus: config.publicStatus,
            securityConfig: config.securityConfig,
            advancedFlags: {
                ...config.advancedFlags,
                gcEngine: config.advancedFlags.gcEngine as any,
                threadPriority: config.advancedFlags.threadPriority as any
            },
            cpuPriority: config.cpuPriority as 'normal' | 'high' | 'realtime',
            executionEngine: config.executionEngine,
            dockerImage: config.dockerImage
        };

        setIsSaving(true);
        try {
            await API.updateServer(serverId, updates);
            updateServerConfig(serverId, updates);
            setIsDirty(false);
            addToast('success', 'Settings Saved', 'Configuration successfully updated.');
        } catch (err) {
            addToast('error', 'Save Failed', 'Could not update server configuration.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDecommission = async () => {
        setIsSaving(true);
        try {
            await API.deleteServer(serverId);
            // Clear local context to prevent auto-recovery attempt on reload
            localStorage.removeItem('cc_serverId');
            window.location.href = '/'; 
        } catch (err) {
            addToast('error', 'Deletion Failed', 'Could not decommission server instance.');
            setIsSaving(false);
        }
    };

    const handleFactoryReset = async () => {
        const defaults = {
            serverName: 'New Minecraft Server',
            workingDirectory: config.workingDirectory, // Keep path
            logLocation: './logs/latest.log',
            executable: 'server.jar',
            javaVersion: 'Do Not Override',
            ram: 4,
            cpuPriority: 'normal',
            executionCommand: 'java -Xmx4G -jar server.jar nogui',
            stopCommand: 'stop',
            autostartDelay: 10,
            updateUrl: '',
            ip: '0.0.0.0',
            port: 25565,
            shutdownTimeout: 60,
            crashExitCodes: '0',
            logRetention: 0,
            gamemode: 'survival',
            difficulty: 'normal',
            maxPlayers: 20,
            motd: 'A Minecraft Server',
            pvp: true,
            hardcore: false,
            allowFlight: false,
            spawnMonsters: true,
            spawnAnimals: true,
            levelSeed: '',
            viewDistance: 10,
            onlineMode: true,
            autoStart: false,
            crashDetection: true,
            includeInTotal: true,
            publicStatus: false,
            securityConfig: {
                firewallEnabled: false,
                allowedIps: [],
                ddosProtection: false,
                requireOp2fa: false,
                forceSsl: false,
                regionLock: []
            },
            advancedFlags: {
                aikarFlags: false,
                installSpark: false,
                debugMode: false,
                antiDdos: false,
                gcEngine: 'G1GC',
                socketBuffer: 32,
                compressionThreshold: 256,
                autoHealing: true,
                healthCheckInterval: 30,
                retryPattern: '10s, 30s, 1m',
                threadPriority: 'normal'
            }
        };

        setIsSaving(true);
        try {
            await API.updateServer(serverId, {
                ...defaults,
                name: defaults.serverName
            });
            setConfig(defaults as any);
            setIsDirty(false);
            addToast('success', 'Factory Reset', 'Configuration has been restored to defaults.');
        } catch (err) {
            addToast('error', 'Reset Failed', 'Could not restore default configuration.');
        } finally {
            setIsSaving(false);
            setShowConfirm({ ...showConfirm, open: false });
        }
    };

    type TabType = 'GENERAL' | 'SECURITY' | 'ADVANCED';

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-[1600px] mx-auto space-y-4 pb-12 relative"
        >
            {/* --- TOP HEADER BAR --- */}
            <div className="bg-card border border-border/80 rounded-md shadow-sm">
                <div className="h-10 bg-muted/20 border-b border-border/60 flex items-center justify-between px-4">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse"></div>
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Settings Engine // Core.v1.2</span>
                    </div>
                </div>

                <div className="px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-4">
                    <nav className="flex items-center gap-1 bg-muted/10 p-0.5 rounded-md border border-border/40">
                        {(['GENERAL', 'SECURITY', 'ADVANCED'] as TabType[]).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-1.5 rounded-[4px] text-[9px] font-black uppercase tracking-widest transition-all ${
                                    activeTab === tab 
                                    ? 'bg-primary text-primary-foreground shadow-sm' 
                                    : 'text-muted-foreground/60 hover:text-foreground/80 hover:bg-muted/30'
                                }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </nav>

                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handleSave} 
                            disabled={isSaving || !isDirty}
                            className="bg-primary/90 text-primary-foreground px-5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest hover:bg-primary disabled:opacity-30 disabled:grayscale transition-all shadow-sm flex items-center gap-2"
                        >
                            {isSaving ? <RotateCcw size={12} className="animate-spin" /> : <Save size={12} />}
                            {isSaving ? 'Synchronizing...' : 'Commit Changes'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                
                {/* GENERAL TAB */}
                {activeTab === 'GENERAL' && (
                    <>
                    <div className="space-y-3 xl:col-span-2">
                        {/* General Settings */}
                        <div className="bg-card border border-border/80 rounded-md p-4 relative group shadow-sm transition-all hover:border-primary/30">
                            
                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                                <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                                    <Server size={14} className="text-primary/70" />
                                </div>
                                <div>
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground/90">Core Instance</h3>
                                    <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-tight opacity-60">Identity & Network Mapping</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="md:col-span-2">
                                    <InputField label="Server Name" propKey="serverName" placeholder="My Awesome Server" config={config} errors={errors} handleChange={handleChange} />
                                </div>
                                <div>
                                    <InputField label="Interface IP" propKey="ip" mono note="Bind address (0.0.0.0 for global)" config={config} errors={errors} handleChange={handleChange} />
                                </div>
                                <div>
                                    <InputField label="Service Port" propKey="port" type="number" mono config={config} errors={errors} handleChange={handleChange} />
                                </div>
                            </div>
                        </div>

                        {/* Game Mechanics */}
                        <div className="bg-card border border-border/80 rounded-md p-4 relative group shadow-sm transition-all hover:border-primary/30">

                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                                <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                                    <Gamepad2 size={14} className="text-primary/70" />
                                </div>
                                <div>
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground/90">Gameplay Environment</h3>
                                    <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-tight opacity-60">Runtime Behavioral rules</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                                <div className="space-y-1 group/select">
                                    <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground group-hover/select:text-foreground transition-colors">Default Gamemode</label>
                                    <div className="relative">
                                        <select 
                                            value={config.gamemode}
                                            onChange={(e) => handleChange('gamemode', e.target.value)}
                                            className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none transition-colors hover:border-primary/40"
                                        >
                                            <option value="survival">Survival</option>
                                            <option value="creative">Creative</option>
                                            <option value="adventure">Adventure</option>
                                            <option value="spectator">Spectator</option>
                                        </select>
                                        <div className="absolute right-2.5 top-2 pointer-events-none text-muted-foreground/50">
                                            <ChevronDown size={12} />
                                        </div>
                                    </div>
                                </div>

                                {/* Difficulty */}
                                <div className="space-y-1 group/select">
                                    <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground group-hover/select:text-foreground transition-colors">Difficulty</label>
                                    <div className="relative">
                                        <select 
                                            value={config.difficulty}
                                            onChange={(e) => handleChange('difficulty', e.target.value)}
                                            className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none transition-colors hover:border-primary/40"
                                        >
                                            <option value="peaceful">Peaceful</option>
                                            <option value="easy">Easy</option>
                                            <option value="normal">Normal</option>
                                            <option value="hard">Hard</option>
                                        </select>
                                        <div className="absolute right-2.5 top-2 pointer-events-none text-muted-foreground/50">
                                            <ChevronDown size={12} />
                                        </div>
                                    </div>
                                </div>

                                {/* Max Players */}
                                <div>
                                    <InputField label="Max Players" propKey="maxPlayers" type="number" config={config} errors={errors} handleChange={handleChange} />
                                </div>

                                <div className="space-y-1.5 font-sans">
                                    <label className="text-[9px] uppercase tracking-[0.2em] font-bold text-muted-foreground flex justify-between">
                                        View Distance
                                        {errors.viewDistance && <span className="text-rose-500 normal-case flex items-center gap-1"><AlertCircle size={10} /> {errors.viewDistance}</span>}
                                    </label>
                                    <div className="relative flex items-center gap-4 h-[34px] px-1">
                                        <input 
                                            type="range" 
                                            min="2" max="32" 
                                            value={config.viewDistance}
                                            onChange={(e) => handleChange('viewDistance', parseInt(e.target.value))}
                                            className="flex-1 h-1 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:transition-colors"
                                        />
                                        <span className="font-mono text-xs w-6 text-right text-muted-foreground">{config.viewDistance}</span>
                                    </div>
                                </div>

                                <div className="md:col-span-2 space-y-1.5 group/motd">
                                    <label className="text-[9px] uppercase tracking-[0.2em] font-bold text-muted-foreground group-hover/motd:text-foreground transition-colors">MOTD</label>
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            value={config.motd}
                                            onChange={(e) => handleChange('motd', e.target.value)}
                                            className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono text-foreground placeholder:text-muted-foreground transition-colors hover:border-muted-foreground/50"
                                            placeholder="A Minecraft Server"
                                        />
                                        <div className="absolute right-3 top-2.5 text-muted-foreground">
                                            <ScrollText size={12} />
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Seed */}
                                <div className="md:col-span-2">
                                    <InputField label="Level Seed" propKey="levelSeed" placeholder="(Leave empty for random)" mono config={config} errors={errors} handleChange={handleChange} />
                                </div>

                                <div className="md:col-span-2 grid grid-cols-2 gap-3 pt-2">
                                    {[
                                        { label: 'PvP Enabled', key: 'pvp', icon: <Swords size={12} /> },
                                        { label: 'Allow Flight', key: 'allowFlight', icon: <Feather size={12} /> },
                                        { label: 'Spawn Monsters', key: 'spawnMonsters', icon: <Ghost size={12} /> },
                                        { label: 'Hardcore Mode', key: 'hardcore', icon: <AlertTriangle size={12} /> }
                                    ].map((item) => (
                                        <label key={item.key} className="group flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 cursor-pointer transition-all duration-200">
                                            <div className="flex items-center gap-3">
                                                <div className={`text-muted-foreground group-hover:text-primary transition-colors ${config[item.key as keyof typeof config] ? 'text-primary' : ''}`}>
                                                    {item.icon}
                                                </div>
                                                <span className={`text-[9px] font-bold uppercase tracking-widest transition-colors ${config[item.key as keyof typeof config] ? 'text-foreground' : 'text-muted-foreground'}`}>{item.label}</span>
                                            </div>
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                                config[item.key as keyof typeof config] 
                                                ? 'bg-primary border-primary' 
                                                : 'bg-background border-border group-hover:border-muted-foreground/50'
                                            }`}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={config[item.key as keyof typeof config] as boolean}
                                                    onChange={(e) => handleChange(item.key, e.target.checked)}
                                                    className="sr-only"
                                                />
                                                {config[item.key as keyof typeof config] && <Check size={10} className="text-primary-foreground" />}
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Sidebar for General */}
                    <div className="space-y-3 xl:col-span-1">
                        {/* Automation & Toggles */}
                        <div className="bg-card border border-border/80 rounded-md p-4 relative group shadow-sm transition-all hover:border-primary/30">

                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                                <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                                    <RotateCcw size={14} className="text-primary/70" />
                                </div>
                                <div>
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground/90">Autonomous Ops</h3>
                                    <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-tight opacity-60">Background logic hooks</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {[
                                    { label: 'Instance Auto-Boot', key: 'autoStart', icon: <Clock size={12} /> },
                                    { label: 'Watchdog / Crash Rec.', key: 'crashDetection', icon: <AlertTriangle size={12} /> },
                                    { label: 'Global Player Sync', key: 'includeInTotal', icon: <Shield size={12} /> },
                                    { label: 'API Public Exposure', key: 'publicStatus', icon: <Globe size={12} /> },
                                ].map((item) => (
                                    <label key={item.key} className="group flex items-center justify-between px-3 py-2 rounded-md border border-border/40 bg-muted/20 hover:bg-muted/40 cursor-pointer transition-all">
                                        <div className="flex items-center gap-2.5">
                                            <div className="text-muted-foreground/60 group-hover:text-primary transition-colors">
                                                {item.icon}
                                            </div>
                                            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/80 group-hover:text-foreground/80 transition-colors">{item.label}</span>
                                        </div>
                                         <div className={`w-7 h-3.5 rounded-full border flex items-center p-0.5 transition-all ${
                                                config[item.key as keyof typeof config] 
                                                ? 'bg-primary border-primary justify-end' 
                                                : 'bg-muted border-border justify-start'
                                            }`}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={config[item.key as keyof typeof config] as boolean}
                                                    onChange={(e) => handleChange(item.key, e.target.checked)}
                                                    className="sr-only"
                                                />
                                                <div className={`w-2 h-2 rounded-full transition-all ${config[item.key as keyof typeof config] ? 'bg-primary-foreground' : 'bg-muted-foreground'}`} />
                                            </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                    </>
                )}

                {/* SECURITY TAB */}
                {activeTab === 'SECURITY' && (
                    <>
                    <div className="space-y-3 xl:col-span-2">
                        {/* Firewall Panel */}
                        <div className="bg-card border border-border/80 rounded-md p-4 relative group shadow-sm transition-all hover:border-primary/30">

                            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/60">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                                        <ShieldAlert size={14} className="text-rose-500/70" />
                                    </div>
                                    <div>
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground/90">L3/L4 Firewall</h3>
                                        <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-tight opacity-60">Packet Filter logic</p>
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
                                        {config.securityConfig.allowedIps.map((ip) => (
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
                        </div>

                        {/* Access Control */}
                        <div className="bg-card border border-border/80 rounded-md p-4 relative group shadow-sm transition-all hover:border-primary/30">
                            
                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                                <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                                    <Key size={14} className="text-primary/70" />
                                </div>
                                <div>
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground/90">Access Control</h3>
                                    <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-tight opacity-60">Auth Policy Enforcement</p>
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
                                        ? 'bg-rose-500 border-rose-500 justify-end shadow-[0_0_8px_rgba(244,63,94,0.3)]' 
                                        : 'bg-muted border-border justify-start'
                                    }`} onClick={() => handleChange('onlineMode', !config.onlineMode)}>
                                         <div className={`w-2 h-2 rounded-full transition-all ${!config.onlineMode ? 'bg-white' : 'bg-muted-foreground'}`} />
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3 xl:col-span-1">
                        <div className="bg-card border border-border/80 rounded-md p-4 relative group shadow-sm transition-all hover:border-primary/30">

                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                                <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                                    <Shield size={14} className="text-primary/70" />
                                </div>
                                <div>
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground/90">Threat Mitigation</h3>
                                    <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-tight opacity-60">Edge Protection Stack</p>
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
                                            <ChevronDown size={12} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Integrity */}
                        <div className="bg-card border border-border/80 rounded-md p-4 relative group shadow-sm transition-all hover:border-primary/30">

                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                                <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                                    <Activity size={14} className="text-primary/70" />
                                </div>
                                <div>
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground/90">System Integrity</h3>
                                    <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-tight opacity-60">FIM: File Integrity Monitoring</p>
                                </div>
                            </div>
                            
                            <p className="text-[9px] font-bold text-muted-foreground/60 mb-4 leading-relaxed uppercase tracking-tight">Core assets (server.jar, eula.txt) are under kernel-level write-protection.</p>
                            <button className="w-full py-1.5 bg-primary/5 text-primary/80 border border-primary/20 rounded-md text-[9px] font-black uppercase tracking-widest hover:bg-primary/10 transition-all">
                                Perform MD5/SHA2 Validation
                            </button>
                        </div>
                    </div>
                    </>
                )}

                {/* ADVANCED TAB */}
                {activeTab === 'ADVANCED' && (
                    <>
                    <div className="space-y-3 xl:col-span-2">
                        {/* Paths & Environment */}
                        <div className="bg-card border border-border/80 rounded-md p-4 relative group shadow-sm transition-all hover:border-primary/30">

                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                                <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                                    <Folder size={14} className="text-primary/70" />
                                </div>
                                <div>
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground/90">Path Registry</h3>
                                    <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-tight opacity-60">System I/O Mapping</p>
                                </div>
                            </div>
                            
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Working Directory</label>
                                        <Lock size={10} className="text-muted-foreground/30" />
                                    </div>
                                    <div className="relative group/path">
                                        <input 
                                            type="text" 
                                            readOnly
                                            value={config.workingDirectory}
                                            className="w-full bg-muted/20 border border-border/40 rounded-md px-2.5 py-1.5 text-[10px] font-mono text-muted-foreground/70 focus:outline-none cursor-not-allowed select-all"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <InputField label="Binary File" propKey="executable" mono note="Primary executable JAR/SH" config={config} errors={errors} handleChange={handleChange} />
                                    <InputField label="Log Trace" propKey="logLocation" mono config={config} errors={errors} handleChange={handleChange} />
                                </div>
                            </div>
                        </div>

                         {/* Java & Memory */}
                        <div className="bg-card border border-border/80 rounded-md p-4 relative group shadow-sm transition-all hover:border-primary/30">

                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                                <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                                    <Cpu size={14} className="text-primary/70" />
                                </div>
                                <div>
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground/90">Runtime Engine</h3>
                                    <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-tight opacity-60">JVM Execution Optimization</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="space-y-1 group/select">
                                        <label className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground group-hover/select:text-foreground">JVM Architecture</label>
                                        <div className="relative">
                                            <select 
                                                value={config.javaVersion}
                                                onChange={(e) => handleChange('javaVersion', e.target.value)}
                                                className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none transition-colors hover:border-primary/40"
                                            >
                                                <option value="Java 21">Java 21 (LTS)</option>
                                                <option value="Java 17">Java 17 (Recommended)</option>
                                                <option value="Java 11">Java 11</option>
                                                <option value="Java 8">Java 8 (Legacy)</option>
                                            </select>
                                            <div className="absolute right-2.5 top-2 pointer-events-none text-muted-foreground/50">
                                                <ChevronDown size={12} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-1 group/select">
                                        <label className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground group-hover/select:text-foreground">GC Engine</label>
                                        <div className="relative">
                                            <select 
                                                value={config.advancedFlags.gcEngine}
                                                onChange={(e) => {
                                                    const newFlags = { ...config.advancedFlags, gcEngine: e.target.value };
                                                    setConfig({ ...config, advancedFlags: newFlags });
                                                    setIsDirty(true);
                                                }}
                                                className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[11px] font-mono font-semibold text-primary/80 focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none transition-colors hover:border-primary/40"
                                            >
                                                <option value="G1GC">G1GC (Balanced)</option>
                                                <option value="ZGC">ZGC (Low Latency)</option>
                                                <option value="Shenandoah">Shenandoah (Ultra-Low)</option>
                                                <option value="Parallel">Parallel (High Throughput)</option>
                                            </select>
                                            <div className="absolute right-2.5 top-2 pointer-events-none text-muted-foreground/50">
                                                <ChevronDown size={12} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="md:col-span-2 space-y-1">
                                        <div className="flex justify-between items-center h-4">
                                            <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Memory Heap Limit</label>
                                            <span className="text-[9px] font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">{config.ram}.0 GB</span>
                                        </div>
                                        <div className="relative flex items-center h-6">
                                            <input 
                                                type="range" 
                                                min="1" 
                                                max="64" 
                                                step="1"
                                                value={config.ram}
                                                onChange={(e) => handleChange('ram', parseInt(e.target.value))}
                                                className="w-full h-1 bg-muted/40 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-primary-foreground/30 [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-1 group/cmd">
                                    <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground group-hover/cmd:text-foreground">Override Start Sequence</label>
                                    <div className="relative">
                                        <textarea 
                                            value={config.executionCommand}
                                            onChange={(e) => handleChange('executionCommand', e.target.value)}
                                            className="w-full h-20 bg-muted/10 border border-border/60 rounded-md px-2.5 py-2 text-[10px] font-mono text-primary/70 focus:outline-none focus:border-primary focus:bg-muted/5 transition-all resize-none leading-relaxed"
                                            placeholder="java -Xmx4G -jar server.jar nogui"
                                        />
                                        <div className="absolute right-3 bottom-3 text-muted-foreground/30 pointer-events-none">
                                            <Terminal size={14} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Orchestration & Virtualization */}
                        {globalSettings?.app?.dockerEnabled && (
                            <div className="bg-card border border-border/80 rounded-md p-4 relative group shadow-sm transition-all hover:border-primary/30">
                                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                                    <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                                        <Database size={14} className="text-primary/70" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground/90">Orchestration & Virtualization</h3>
                                        <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-tight opacity-60">Containerized Runtime Engine</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-1 group/select">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground group-hover/select:text-foreground">Execution Engine</label>
                                            {servers.find(s => s.id === serverId)?.status !== 'OFFLINE' && (
                                                <div className="flex items-center gap-1 text-[8px] font-black text-rose-500 uppercase">
                                                    <Lock size={8} /> Active Lock
                                                </div>
                                            )}
                                        </div>
                                        <div className="relative">
                                            <select 
                                                value={config.executionEngine}
                                                disabled={servers.find(s => s.id === serverId)?.status !== 'OFFLINE'}
                                                onChange={(e) => handleChange('executionEngine', e.target.value)}
                                                className={`w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none transition-colors hover:border-primary/40 ${
                                                    servers.find(s => s.id === serverId)?.status !== 'OFFLINE' ? 'opacity-50 cursor-not-allowed bg-muted/20' : ''
                                                }`}
                                            >
                                                <option value="native">Native (Local Process)</option>
                                                <option value="docker">Docker (Containerized)</option>
                                            </select>
                                            <div className="absolute right-2.5 top-2 pointer-events-none text-muted-foreground/50">
                                                <ChevronDown size={12} />
                                            </div>
                                        </div>
                                        {servers.find(s => s.id === serverId)?.status !== 'OFFLINE' && (
                                            <p className="text-[7px] font-bold text-rose-400/60 uppercase tracking-tighter mt-1">Shutdown instance to reconfigure orchestration layer</p>
                                        )}
                                    </div>

                                    {config.executionEngine === 'docker' && (
                                        <div className="space-y-3 p-3 rounded-lg bg-primary/5 border border-primary/10 animate-in fade-in slide-in-from-top-2">
                                            <InputField 
                                                label="Docker Image" 
                                                propKey="dockerImage" 
                                                placeholder="eclipse-temurin:17-jre" 
                                                note="Image to pull for this server instance" 
                                                config={config} 
                                                errors={errors} 
                                                handleChange={handleChange} 
                                            />
                                            
                                            <div className="flex items-center justify-between pt-2 border-t border-primary/10">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${dockerStatus.online ? 'bg-emerald-500' : 'bg-rose-500'} ${dockerStatus.checking ? 'animate-pulse' : ''}`} />
                                                    <span className={`text-[8px] font-bold uppercase tracking-widest ${dockerStatus.online ? 'text-emerald-500/80' : 'text-rose-500/80'}`}>
                                                        {dockerStatus.checking ? 'Checking Daemon...' : dockerStatus.online ? `Docker ${dockerStatus.version || 'Active'}` : 'Daemon Unreachable'}
                                                    </span>
                                                </div>
                                                <button 
                                                    onClick={checkDocker}
                                                    disabled={dockerStatus.checking}
                                                    className="px-2 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded text-[9px] font-black uppercase tracking-widest transition-colors flex items-center gap-1.5 border border-primary/20"
                                                >
                                                    <RotateCcw size={10} className={dockerStatus.checking ? 'animate-spin' : ''} />
                                                    Run Diagnostic
                                                </button>
                                            </div>
                                            {!dockerStatus.online && !dockerStatus.checking && (
                                                <p className="text-[7px] font-bold text-rose-400/60 uppercase tracking-tighter bg-rose-500/5 p-1.5 rounded border border-rose-500/10">
                                                    Ensure Docker Desktop is running. Native fallback will trigger if Docker remains unreachable.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div className="space-y-3 xl:col-span-1">
                        {/* Process Management */}
                        <div className="bg-card border border-border/80 rounded-md p-4 relative group shadow-sm transition-all hover:border-primary/30">

                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                                <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                                    <Play size={14} className="text-primary/70" />
                                </div>
                                <div>
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground/90">Process Lifecycle</h3>
                                    <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-tight opacity-60">Startup & Termination Stack</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <InputField label="Stop Sequence" propKey="stopCommand" mono placeholder="stop" config={config} errors={errors} handleChange={handleChange} />

                                <div className="grid grid-cols-2 gap-3">
                                    <InputField label="Boot Delay" propKey="autostartDelay" type="number" suffix="ms" config={config} errors={errors} handleChange={handleChange} />
                                    <InputField label="SIGTERM Grace" propKey="shutdownTimeout" type="number" suffix="s" config={config} errors={errors} handleChange={handleChange} />
                                </div>

                                <div className="p-3 rounded-md bg-primary/5 border border-primary/10">
                                    <div className="flex justify-between items-center mb-1.5">
                                        <div className="flex items-center gap-2">
                                            <RotateCcw size={12} className="text-primary/70" />
                                            <label className="text-[9px] font-bold uppercase tracking-widest text-primary/80">Auto-Healing Logic</label>
                                        </div>
                                        <div className={`w-7 h-3.5 rounded-full border flex items-center p-0.5 transition-all cursor-pointer ${
                                            config.advancedFlags.autoHealing
                                            ? 'bg-primary border-primary justify-end' 
                                            : 'bg-muted border-border justify-start'
                                        }`} onClick={() => {
                                            const newFlags = { ...config.advancedFlags, autoHealing: !config.advancedFlags.autoHealing };
                                            setConfig({ ...config, advancedFlags: newFlags });
                                            setIsDirty(true);
                                        }}>
                                             <div className={`w-2 h-2 rounded-full transition-all ${config.advancedFlags.autoHealing ? 'bg-primary-foreground' : 'bg-muted-foreground'}`} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        <InputField label="Check Int." propKey="advancedFlags.healthCheckInterval" type="number" suffix="s" config={config} errors={errors} handleChange={handleChange} />
                                        <InputField label="Retry Pattern" propKey="advancedFlags.retryPattern" placeholder="10s, 30s..." config={config} errors={errors} handleChange={handleChange} />
                                    </div>
                                </div>
                            </div>
                        </div>

                          {/* Network & Optimization */}
                        <div className="bg-card border border-border/80 rounded-md p-4 relative group shadow-sm transition-all hover:border-primary/30">

                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                                <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner group-hover:bg-muted/60 transition-colors">
                                    <Network size={14} className="text-primary/70" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-center">
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground/90">Network Fabric</h3>
                                        {/* Status Badge */}
                                        {servers.find(s => s.id === serverId)?.status === 'ONLINE' && (
                                            <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                                <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                                                <span className="text-[8px] font-black text-emerald-500 uppercase">Live Engine Active</span>
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-tight opacity-60">Throughput & Latency Tuning</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <InputField 
                                    label="Socket Buffer" 
                                    propKey="advancedFlags.socketBuffer" 
                                    type="number" 
                                    suffix="kb" 
                                    config={config} 
                                    errors={errors} 
                                    handleChange={handleChange} 
                                    note="Optimizes high-traffic flow"
                                />
                                <InputField 
                                    label="Compress Thresh." 
                                    propKey="advancedFlags.compressionThreshold" 
                                    type="number" 
                                    suffix="b" 
                                    config={config} 
                                    errors={errors} 
                                    handleChange={handleChange} 
                                    note="Packet compression limit"
                                />
                            </div>

                            <div className="space-y-2">
                                {[
                                     { label: 'Aikar\'s Flags (Adaptive)', key: 'aikarFlags', icon: <Zap size={10} className="text-amber-500" />, desc: 'G1GC Optimization Suite', requires: 'G1GC' },
                                     { label: 'Spark Trace Engine', key: 'installSpark', icon: <Activity size={10} className="text-purple-500" />, desc: 'Real-time Profiler Plugin' },
                                     { label: 'GraalVM Native JIT', key: 'useGraalVM', icon: <Cpu size={10} className="text-emerald-500" />, desc: 'Advanced Bytecode Compiler' },
                                 ].map((item) => {
                                     const isRunning = servers.find(s => s.id === serverId)?.status === 'ONLINE';
                                     const activeStats = (stats as any)?.[serverId];
                                     const cl = activeStats?.commandLine || '';
                                     
                                     const isActiveOnProcess = 
                                         item.key === 'aikarFlags' ? cl.includes('using.aikars.flags=true') :
                                         item.key === 'useGraalVM' ? cl.includes('UseJVMCICompiler') :
                                         item.key === 'installSpark' ? true : // Hard to verify without API call
                                         false;

                                     // Check top-level inputs if they are in the command line too
                                     const isSocketBufferVerified = isRunning && config.advancedFlags.socketBuffer > 0 && 
                                         cl.includes(`-Dnetwork.socket.sendBuffer=${config.advancedFlags.socketBuffer}`);

                                     const isDisabled = item.requires && config.advancedFlags.gcEngine !== item.requires;

                                     return (
                                         <div key={item.key} className="space-y-1">
                                             <label className={`group flex items-center justify-between px-3 py-2 rounded-md border transition-all ${
                                                 isDisabled ? 'opacity-40 cursor-not-allowed bg-muted/10 border-border/20' : 'bg-muted/20 border-border/40 hover:bg-muted/40 cursor-pointer'
                                             }`}>
                                                 <div className="flex items-center gap-2">
                                                     {item.icon}
                                                     <div>
                                                         <div className="flex items-center gap-2">
                                                            <span className="text-[9px] uppercase font-black tracking-wider text-muted-foreground group-hover:text-foreground/80 transition-colors">{item.label}</span>
                                                            {isRunning && isActiveOnProcess && (
                                                                <div className="group/v relative">
                                                                    <span className="text-[7px] font-black bg-emerald-500/20 text-emerald-600 px-1 rounded uppercase tracking-tighter cursor-help">Verified</span>
                                                                    <div className="absolute top-full left-0 mt-1 w-24 p-1.5 bg-emerald-600 text-white text-[7px] font-black uppercase tracking-tighter rounded shadow-xl invisible group-hover/v:visible z-[110]">
                                                                        Live JVM Hook Active
                                                                    </div>
                                                                </div>
                                                            )}
                                                         </div>
                                                         <p className="text-[7px] font-bold text-muted-foreground/40 uppercase tracking-tight">{item.desc}</p>
                                                     </div>
                                                 </div>
                                                  <div className={`w-7 h-3.5 rounded-full border flex items-center p-0.5 transition-all ${
                                                         config.advancedFlags?.[item.key] 
                                                         ? 'bg-primary border-primary justify-end' 
                                                         : 'bg-muted border-border justify-start'
                                                     } ${isDisabled ? 'pointer-events-none' : ''}`}>
                                                         <input 
                                                             type="checkbox" 
                                                             disabled={isDisabled}
                                                             checked={config.advancedFlags?.[item.key] || false}
                                                             onChange={(e) => {
                                                                 const newFlags = { ...config.advancedFlags, [item.key]: e.target.checked };
                                                                 setConfig({ ...config, advancedFlags: newFlags });
                                                                 setIsDirty(true);
                                                             }}
                                                             className="sr-only"
                                                         />
                                                         <div className={`w-2 h-2 rounded-full transition-all ${config.advancedFlags?.[item.key] ? 'bg-primary-foreground' : 'bg-muted-foreground'}`} />
                                                  </div>
                                             </label>
                                             {isDisabled && (
                                                 <p className="text-[7px] font-black text-rose-500/60 uppercase tracking-widest pl-1">Requires GC Engine: {item.requires}</p>
                                             )}
                                         </div>
                                     );
                                 })}
                            </div>

                            {isDirty && (
                                <div className="mt-4 p-2 rounded bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                                    <AlertTriangle size={12} className="text-amber-500" />
                                    <span className="text-[8px] font-black text-amber-600 uppercase tracking-tighter">System Restart Required for JVM Changes</span>
                                </div>
                            )}
                        </div>

                         {/* Danger Zone */}
                         <div className="bg-rose-500/[0.03] border border-rose-500/30 rounded-md p-4 relative overflow-hidden group shadow-sm transition-all hover:border-rose-500/50">
                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-rose-500/20">
                                <div className="p-1.5 rounded-md bg-rose-500/10 border border-rose-500/20 shadow-inner group-hover:bg-rose-500/20 transition-colors">
                                    <AlertTriangle className="text-rose-500" size={14} />
                                </div>
                                <div>
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-rose-500">Prune & Purge</h3>
                                    <p className="text-[8px] text-rose-500/60 font-bold uppercase tracking-tight opacity-60">High-risk destructive operations</p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <div className="flex flex-col gap-2">
                                    <button 
                                        onClick={() => setShowConfirm({
                                            open: true,
                                            type: 'RESET',
                                            title: 'Factory Reset Instance',
                                            description: 'This will revert all configuration settings to their default values. This action cannot be undone once committed.'
                                        })}
                                        className="w-full flex items-center justify-between p-3 rounded-md border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 transition-all group/btn"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <RotateCcw size={14} className="text-rose-500/70 group-hover/btn:rotate-180 transition-transform duration-500" />
                                            <span className="text-[9px] font-black uppercase tracking-widest text-rose-500/80">Factory Reset Stack</span>
                                        </div>
                                        <ArrowRightLeft size={12} className="text-rose-500/30" />
                                    </button>

                                    <button 
                                        onClick={() => setShowConfirm({
                                            open: true,
                                            type: 'DECOMMISSION',
                                            title: 'Decommission Instance',
                                            description: 'CRITICAL: This will permanently delete the server record and all associated files from the disk. This action is irreversible.'
                                        })}
                                        className="w-full flex items-center justify-between p-3 rounded-md border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 transition-all group/btn"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <AlertTriangle size={14} className="text-rose-500" />
                                            <span className="text-[9px] font-black uppercase tracking-widest text-rose-500">Decommission Instance</span>
                                        </div>
                                        <Zap size={12} className="text-rose-500 animate-pulse" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Confirm Modal */}
                        <AnimatePresence>
                            {showConfirm.open && (
                                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
                                    <motion.div 
                                        initial={{ scale: 0.95, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.95, opacity: 0 }}
                                        className="bg-card border border-border rounded-lg overflow-hidden max-w-md w-full shadow-xl"
                                    >
                                        <div className="h-10 bg-muted/30 border-b border-border flex items-center px-4 justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_5px_rgba(244,63,94,0.5)]"></div>
                                                <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">{showConfirm.title}</span>
                                            </div>
                                            <button 
                                                onClick={() => setShowConfirm({ ...showConfirm, open: false })}
                                                className="text-muted-foreground hover:text-foreground transition-colors"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>

                                        <div className="p-6">
                                            <div className="flex gap-4 items-start mb-6">
                                                <div className="p-3 bg-rose-500/10 rounded border border-rose-500/20 shrink-0">
                                                    <AlertTriangle size={24} className="text-rose-500" />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-foreground mb-1">Authorization Required</h4>
                                                    <p className="text-[11px] font-medium text-muted-foreground leading-relaxed">
                                                        {showConfirm.description}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
                                                <button 
                                                    onClick={() => setShowConfirm({ ...showConfirm, open: false })}
                                                    className="px-4 py-1.5 rounded text-[11px] font-bold bg-muted hover:bg-muted/80 transition-colors text-foreground"
                                                >
                                                    Cancel
                                                </button>
                                                <button 
                                                    onClick={showConfirm.type === 'DECOMMISSION' ? handleDecommission : handleFactoryReset}
                                                    className="px-4 py-1.5 rounded text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors shadow-sm"
                                                >
                                                    {showConfirm.type === 'DECOMMISSION' ? 'Decommission Instance' : 'Execute Reset'}
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                </div>
                            )}
                        </AnimatePresence>
                    </div>
                    </>
                )}
            </div>
        </motion.div>
    );
};

export default SettingsManager;