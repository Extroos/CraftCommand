
import React, { useState, useEffect } from 'react';
import { Server, Save, Terminal, Lock, Unlock, Folder, Play, Clock, Shield, Globe, Cpu, RotateCcw, Gamepad2, Swords, Ghost, Feather, ScrollText, AlertTriangle, AlertCircle, Fingerprint, Network, ShieldAlert, Key, Zap, ArrowRightLeft, Activity, ChevronDown } from 'lucide-react';

import { API } from '../../services/api';
import { useToast } from '../UI/Toast';
import { useServers } from '../../context/ServerContext';

import { SecurityConfig } from '../../types';

interface SettingsManagerProps {
    serverId: string;
}

const SettingsManager: React.FC<SettingsManagerProps> = ({ serverId }) => {
    const [activeTab, setActiveTab] = useState<'GENERAL' | 'SECURITY' | 'ADVANCED'>('GENERAL');
    const [isDirty, setIsDirty] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const { addToast } = useToast();
    
    // Detailed Config State
    const [config, setConfig] = useState({
        serverName: '',
        workingDirectory: '',
        logLocation: './logs/latest.log',
        executable: '',
        javaVersion: 'Do Not Override',
        ram: 4,
        executionCommand: '',
        stopCommand: 'stop',
        autostartDelay: 10,
        updateUrl: '',
        ip: '127.0.0.1',
        port: 25565,
        shutdownTimeout: 60,
        crashExitCodes: '0',
        logRetention: 0,
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
            proxySupport: false,
            installSpark: false,
            debugMode: false,
            antiDdos: false
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
                    proxySupport: currentServer.advancedFlags?.proxySupport || false,
                    installSpark: currentServer.advancedFlags?.installSpark || false,
                    debugMode: currentServer.advancedFlags?.debugMode || false,
                    antiDdos: currentServer.advancedFlags?.antiDdos || false
                }
            });
        }
    }, [currentServer?.id]);


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
        const error = validate(key, value);
        setErrors(prev => {
            const newErrors = { ...prev };
            if (error) newErrors[key] = error;
            else delete newErrors[key];
            return newErrors;
        });

        setConfig(prev => ({ ...prev, [key]: value }));
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
            javaVersion: config.javaVersion,
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
            advancedFlags: config.advancedFlags
        };

        await API.updateServer(serverId, updates);
        updateServerConfig(serverId, updates);

        setIsDirty(false);
        addToast('success', 'Settings Saved', 'Configuration successfully updated.');
    };

    const InputField = ({ label, propKey, type = 'text', placeholder = '', mono = false, note = '' }: { label: string, propKey: keyof typeof config & string, type?: string, placeholder?: string, mono?: boolean, note?: string }) => (
        <div className="space-y-1.5 font-sans group">
            <label className="text-[9px] uppercase tracking-[0.2em] font-bold text-zinc-500 group-hover:text-zinc-400 transition-colors flex justify-between items-center h-4">
                {label}
                {errors[propKey] && <span className="text-rose-500 normal-case flex items-center gap-1 text-[10px]"><AlertCircle size={10} /> {errors[propKey]}</span>}
            </label>
            <div className="relative">
                <input 
                    type={type} 
                    value={config[propKey] as string | number}
                    onChange={(e) => handleChange(propKey, type === 'number' ? parseInt(e.target.value) || 0 : e.target.value)}
                    className={`w-full bg-[#09090b] border rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-offset-0 transition-all duration-200 ${
                        errors[propKey] 
                        ? 'border-rose-500/50 focus:border-rose-500 focus:ring-rose-500/20' 
                        : 'border-white/5 group-hover:border-white/10 focus:border-zinc-500 focus:ring-zinc-700/30'
                    } ${mono ? 'font-mono text-zinc-300' : 'font-medium text-zinc-200'} placeholder:text-zinc-700`}
                    placeholder={placeholder}
                />
            </div>
            {note && <p className="text-[9px] text-zinc-600 font-medium">{note}</p>}
        </div>
    );

    return (
        <div className="space-y-6 animate-fade-in pb-10 font-sans">
             {/* Header */}
             <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-white/5 pb-6">
                <div className="flex items-center gap-4">
                    <div className="flex p-1 bg-[#09090b] rounded-lg border border-white/5">
                        <button 
                            onClick={() => setActiveTab('GENERAL')}
                            className={`px-4 py-1.5 text-[10px] uppercase font-bold tracking-[0.15em] rounded-md transition-all duration-300 ${activeTab === 'GENERAL' ? 'bg-[#27272a] text-white shadow-lg shadow-black/50 border border-white/10' : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/5 border border-transparent'}`}
                        >
                            General
                        </button>
                        <button 
                            onClick={() => setActiveTab('SECURITY')}
                            className={`px-4 py-1.5 text-[10px] uppercase font-bold tracking-[0.15em] rounded-md transition-all duration-300 ${activeTab === 'SECURITY' ? 'bg-[#27272a] text-white shadow-lg shadow-black/50 border border-white/10' : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/5 border border-transparent'}`}
                        >
                            Security
                        </button>
                        <button 
                            onClick={() => setActiveTab('ADVANCED')}
                            className={`px-4 py-1.5 text-[10px] uppercase font-bold tracking-[0.15em] rounded-md transition-all duration-300 ${activeTab === 'ADVANCED' ? 'bg-[#27272a] text-white shadow-lg shadow-black/50 border border-white/10' : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/5 border border-transparent'}`}
                        >
                            Advanced
                        </button>
                    </div>
                </div>
                
                 <button 
                    onClick={handleSave}
                    disabled={!isDirty || Object.keys(errors).length > 0}
                    className={`px-5 py-2 rounded-md text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all duration-300 ${
                        isDirty && Object.keys(errors).length === 0
                        ? 'bg-white text-black hover:bg-zinc-300 shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] transform hover:-translate-y-0.5' 
                        : 'bg-[#18181b] text-zinc-600 cursor-not-allowed border border-white/5'
                    }`}
                >
                    <Save size={12} className={isDirty ? "animate-pulse" : ""} /> Save Changes
                </button>
             </div>

             <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                
                {/* GENERAL TAB */}
                {activeTab === 'GENERAL' && (
                    <>
                    <div className="space-y-4 xl:col-span-2">
                        {/* General Settings */}
                        <div className="bg-[#09090b]/40 backdrop-blur-sm border border-white/5 rounded-xl p-6 relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                            
                            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/5">
                                <div className="p-2 rounded-md bg-[#18181b] border border-white/5 shadow-inner">
                                    <Server size={14} className="text-zinc-400" />
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-200">General Information</h3>
                                    <p className="text-[9px] text-zinc-600 font-medium tracking-wide">Primary server definitions</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="md:col-span-2">
                                    <InputField label="Server Name" propKey="serverName" placeholder="My Awesome Server" />
                                </div>
                                <div>
                                    <InputField label="Server IP" propKey="ip" mono note="Use 0.0.0.0 to listen on all interfaces" />
                                </div>
                                <div>
                                    <InputField label="Server Port" propKey="port" type="number" mono />
                                </div>
                            </div>
                        </div>

                        {/* Game Mechanics (New) */}
                        <div className="bg-[#09090b]/40 backdrop-blur-sm border border-white/5 rounded-xl p-6 relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/5">
                                <div className="p-2 rounded-md bg-[#18181b] border border-white/5 shadow-inner">
                                    <Gamepad2 size={14} className="text-zinc-400" />
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-200">Game Settings</h3>
                                    <p className="text-[9px] text-zinc-600 font-medium tracking-wide">Gameplay rules and mechanics</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                                {/* Gamemode */}
                                <div className="space-y-1.5 group/select">
                                    <label className="text-[9px] uppercase tracking-[0.2em] font-bold text-zinc-500 group-hover/select:text-zinc-400 transition-colors">Default Gamemode</label>
                                    <div className="relative">
                                        <select 
                                            value={config.gamemode}
                                            onChange={(e) => handleChange('gamemode', e.target.value)}
                                            className="w-full bg-[#09090b] border border-white/5 rounded-md px-3 py-2 text-xs font-medium text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-700/50 appearance-none transition-colors hover:border-white/10"
                                        >
                                            <option value="survival">Survival</option>
                                            <option value="creative">Creative</option>
                                            <option value="adventure">Adventure</option>
                                            <option value="spectator">Spectator</option>
                                        </select>
                                        <div className="absolute right-3 top-2.5 pointer-events-none text-zinc-600 group-hover/select:text-zinc-400 transition-colors">
                                            <ChevronDown size={12} />
                                        </div>
                                    </div>
                                </div>

                                {/* Difficulty */}
                                <div className="space-y-1.5 group/select">
                                    <label className="text-[9px] uppercase tracking-[0.2em] font-bold text-zinc-500 group-hover/select:text-zinc-400 transition-colors">Difficulty</label>
                                    <div className="relative">
                                        <select 
                                            value={config.difficulty}
                                            onChange={(e) => handleChange('difficulty', e.target.value)}
                                            className="w-full bg-[#09090b] border border-white/5 rounded-md px-3 py-2 text-xs font-medium text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-700/50 appearance-none transition-colors hover:border-white/10"
                                        >
                                            <option value="peaceful">Peaceful</option>
                                            <option value="easy">Easy</option>
                                            <option value="normal">Normal</option>
                                            <option value="hard">Hard</option>
                                        </select>
                                        <div className="absolute right-3 top-2.5 pointer-events-none text-zinc-600 group-hover/select:text-zinc-400 transition-colors">
                                            <ChevronDown size={12} />
                                        </div>
                                    </div>
                                </div>

                                {/* Max Players */}
                                <div>
                                    <InputField label="Max Players" propKey="maxPlayers" type="number" />
                                </div>

                                {/* View Distance */}
                                <div className="space-y-1.5 font-sans">
                                    <label className="text-[9px] uppercase tracking-[0.2em] font-bold text-zinc-500 flex justify-between">
                                        View Distance
                                        {errors.viewDistance && <span className="text-rose-500 normal-case flex items-center gap-1"><AlertCircle size={10} /> {errors.viewDistance}</span>}
                                    </label>
                                    <div className="relative flex items-center gap-4 h-[34px] px-1">
                                        <input 
                                            type="range" 
                                            min="2" max="32" 
                                            value={config.viewDistance}
                                            onChange={(e) => handleChange('viewDistance', parseInt(e.target.value))}
                                            className="flex-1 h-1 bg-[#18181b] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-200 [&::-webkit-slider-thumb]:hover:bg-white [&::-webkit-slider-thumb]:transition-colors"
                                        />
                                        <span className="font-mono text-xs w-6 text-right text-zinc-400">{config.viewDistance}</span>
                                    </div>
                                </div>

                                {/* MOTD */}
                                <div className="md:col-span-2 space-y-1.5 group/motd">
                                    <label className="text-[9px] uppercase tracking-[0.2em] font-bold text-zinc-500 group-hover/motd:text-zinc-400 transition-colors">MOTD</label>
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            value={config.motd}
                                            onChange={(e) => handleChange('motd', e.target.value)}
                                            className="w-full bg-[#09090b] border border-white/5 rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-700/50 font-mono text-zinc-300 placeholder:text-zinc-800 transition-colors hover:border-white/10"
                                            placeholder="A Minecraft Server"
                                        />
                                        <div className="absolute right-3 top-2.5 text-zinc-700 group-hover/motd:text-zinc-500 transition-colors pointer-events-none">
                                            <ScrollText size={12} />
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Seed */}
                                <div className="md:col-span-2">
                                    <InputField label="Level Seed" propKey="levelSeed" placeholder="(Leave empty for random)" mono />
                                </div>

                                {/* Mechanics Toggles Grid */}
                                <div className="md:col-span-2 grid grid-cols-2 gap-3 pt-2">
                                    {[
                                        { label: 'PvP Enabled', key: 'pvp', icon: <Swords size={12} /> },
                                        { label: 'Allow Flight', key: 'allowFlight', icon: <Feather size={12} /> },
                                        { label: 'Spawn Monsters', key: 'spawnMonsters', icon: <Ghost size={12} /> },
                                        { label: 'Hardcore Mode', key: 'hardcore', icon: <AlertTriangle size={12} /> }
                                    ].map((item) => (
                                        <label key={item.key} className="group flex items-center justify-between p-3 rounded-md border border-white/5 bg-[#18181b]/50 hover:bg-[#18181b] hover:border-white/10 cursor-pointer transition-all duration-200">
                                            <div className="flex items-center gap-3">
                                                <div className={`text-zinc-600 group-hover:text-zinc-400 transition-colors ${config[item.key as keyof typeof config] ? 'text-zinc-200' : ''}`}>
                                                    {item.icon}
                                                </div>
                                                <span className={`text-[9px] font-bold uppercase tracking-widest transition-colors ${config[item.key as keyof typeof config] ? 'text-zinc-300' : 'text-zinc-500 group-hover:text-zinc-400'}`}>{item.label}</span>
                                            </div>
                                            <div className={`w-3 h-3 rounded-sm border flex items-center justify-center transition-all ${
                                                config[item.key as keyof typeof config] 
                                                ? 'bg-zinc-200 border-zinc-200' 
                                                : 'bg-black/40 border-zinc-800 group-hover:border-zinc-700'
                                            }`}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={config[item.key as keyof typeof config] as boolean}
                                                    onChange={(e) => handleChange(item.key, e.target.checked)}
                                                    className="sr-only"
                                                />
                                                {config[item.key as keyof typeof config] && <div className="w-1.5 h-1.5 bg-black rounded-[1px]" />}
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Sidebar for General */}
                    <div className="space-y-4 xl:col-span-1">
                        {/* Automation & Toggles */}
                        <div className="bg-[#09090b]/40 backdrop-blur-sm border border-white/5 rounded-xl p-6 relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/5">
                                <div className="p-2 rounded-md bg-[#18181b] border border-white/5 shadow-inner">
                                    <RotateCcw size={14} className="text-zinc-400" />
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-200">Automation</h3>
                                    <p className="text-[9px] text-zinc-600 font-medium tracking-wide">Lifecycle Management</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {[
                                    { label: 'Server Auto Start', key: 'autoStart', icon: <Clock size={12} /> },
                                    { label: 'Crash Detection', key: 'crashDetection', icon: <AlertTriangle size={12} /> },
                                    { label: 'Include in total players', key: 'includeInTotal', icon: <Shield size={12} /> },
                                    { label: 'Show On Public Status', key: 'publicStatus', icon: <Globe size={12} /> },
                                ].map((item) => (
                                    <label key={item.key} className="group flex items-center justify-between p-3 rounded-md border border-white/5 bg-[#18181b]/50 hover:bg-[#18181b] hover:border-white/10 cursor-pointer transition-all duration-200">
                                        <div className="flex items-center gap-3">
                                            <div className={`text-zinc-600 group-hover:text-zinc-400 transition-colors ${config[item.key as keyof typeof config] ? 'text-zinc-200' : ''}`}>
                                                {item.icon}
                                            </div>
                                            <span className={`text-[9px] font-bold uppercase tracking-widest transition-colors ${config[item.key as keyof typeof config] ? 'text-zinc-300' : 'text-zinc-500 group-hover:text-zinc-400'}`}>{item.label}</span>
                                        </div>
                                         <div className={`w-8 h-4 rounded-full border flex items-center p-0.5 transition-all ${
                                                config[item.key as keyof typeof config] 
                                                ? 'bg-zinc-200 border-zinc-200 justify-end' 
                                                : 'bg-black/40 border-zinc-800 group-hover:border-zinc-700 justify-start'
                                            }`}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={config[item.key as keyof typeof config] as boolean}
                                                    onChange={(e) => handleChange(item.key, e.target.checked)}
                                                    className="sr-only"
                                                />
                                                <div className={`w-2.5 h-2.5 rounded-full transition-all ${config[item.key as keyof typeof config] ? 'bg-black' : 'bg-zinc-600'}`} />
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
                    <div className="space-y-4 xl:col-span-2">
                        {/* Firewall Panel */}
                        <div className="bg-[#09090b]/40 backdrop-blur-sm border border-white/5 rounded-xl p-6 relative overflow-hidden group">
                           <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-md bg-[#18181b] border border-white/5 shadow-inner">
                                        <ShieldAlert size={14} className="text-zinc-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-200">Network Firewall</h3>
                                        <p className="text-[9px] text-zinc-600 font-medium tracking-wide">Control inbound traffic sources.</p>
                                    </div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer group/toggle">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only peer" 
                                        checked={config.securityConfig.firewallEnabled}
                                        onChange={(e) => handleSecurityChange('firewallEnabled', e.target.checked)}
                                    />
                                    <div className="w-10 h-5 bg-[#18181b] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-500 after:border-zinc-600 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500/20 peer-checked:after:bg-rose-500 peer-checked:after:border-rose-400 group-hover/toggle:after:scale-95 transition-all"></div>
                                </label>
                            </div>

                            <div className={`space-y-4 transition-all duration-300 ${!config.securityConfig.firewallEnabled ? 'opacity-50 pointer-events-none blur-[1px]' : 'opacity-100 blur-0'}`}>
                                <div className="bg-[#18181b]/30 border border-white/5 rounded-lg p-5">
                                    <h4 className="text-[9px] font-bold uppercase tracking-[0.2em] mb-4 flex items-center gap-2 text-zinc-500"><Network size={12} /> Whitelisted IPs</h4>
                                    <div className="flex gap-2 mb-4">
                                        <input 
                                            type="text" 
                                            value={newIp}
                                            onChange={(e) => setNewIp(e.target.value)}
                                            placeholder="192.168.1.1" 
                                            className="flex-1 bg-[#09090b] border border-white/5 rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-zinc-700/50 transition-colors hover:border-white/10 placeholder:text-zinc-800"
                                        />
                                        <button onClick={handleAddIp} className="bg-zinc-100 text-black px-4 rounded-md text-[9px] font-bold uppercase tracking-widest hover:bg-zinc-300 transition-colors shadow-[0_0_10px_-3px_rgba(255,255,255,0.2)]">Add IP</button>
                                    </div>
                                    
                                    <div className="flex flex-wrap gap-2">
                                        {config.securityConfig.allowedIps.map((ip) => (
                                            <div key={ip} className="bg-emerald-500/5 border border-emerald-500/10 text-emerald-500/80 px-2.5 py-1 rounded-md text-[10px] font-mono flex items-center gap-2 group/ip hover:bg-emerald-500/10 hover:border-emerald-500/20 transition-colors">
                                                {ip}
                                                <button onClick={() => handleRemoveIp(ip)} className="hover:text-emerald-400 opacity-50 group-hover/ip:opacity-100 transition-opacity"><RotateCcw className="rotate-45" size={10} /></button>
                                            </div>
                                        ))}
                                        {config.securityConfig.allowedIps.length === 0 && (
                                            <span className="text-[10px] text-zinc-700 italic font-mono flex items-center gap-2"><AlertTriangle size={10}/> No IPs whitelisted. All traffic allowed.</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Access Control */}
                        <div className="bg-[#09090b]/40 backdrop-blur-sm border border-white/5 rounded-xl p-6 relative overflow-hidden group">
                           <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                            
                            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/5">
                                <div className="p-2 rounded-md bg-[#18181b] border border-white/5 shadow-inner">
                                    <Key size={14} className="text-zinc-400" />
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-200">Access Control</h3>
                                    <p className="text-[9px] text-zinc-600 font-medium tracking-wide">Authentication & Permissions</p>
                                </div>
                            </div>
                            
                            <div className="space-y-3">
                                <label className="group flex items-center justify-between p-3 border border-white/5 rounded-md bg-[#18181b]/50 hover:bg-[#18181b] hover:border-white/10 cursor-pointer transition-all duration-200">
                                    <div className="flex gap-3 items-center">
                                        <div className="text-zinc-600 group-hover:text-zinc-400 transition-colors">
                                            <Fingerprint size={14} />
                                        </div>
                                        <div>
                                            <h4 className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500 group-hover:text-zinc-300 transition-colors">Require 2FA for Operators</h4>
                                        </div>
                                    </div>
                                    <div className={`w-8 h-4 rounded-full border flex items-center p-0.5 transition-all ${
                                        config.securityConfig.requireOp2fa
                                        ? 'bg-zinc-200 border-zinc-200 justify-end' 
                                        : 'bg-black/40 border-zinc-800 group-hover:border-zinc-700 justify-start'
                                    }`}>
                                        <input 
                                            type="checkbox" 
                                            checked={config.securityConfig.requireOp2fa}
                                            onChange={(e) => handleSecurityChange('requireOp2fa', e.target.checked)}
                                            className="sr-only"
                                        />
                                        <div className={`w-2.5 h-2.5 rounded-full transition-all ${config.securityConfig.requireOp2fa ? 'bg-black' : 'bg-zinc-600'}`} />
                                    </div>
                                </label>

                                <label className="group flex items-center justify-between p-3 border border-white/5 rounded-md bg-[#18181b]/50 hover:bg-[#18181b] hover:border-white/10 cursor-pointer transition-all duration-200">
                                    <div className="flex gap-3 items-center">
                                        <div className="text-zinc-600 group-hover:text-zinc-400 transition-colors">
                                            <Lock size={14} />
                                        </div>
                                        <div>
                                            <h4 className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500 group-hover:text-zinc-300 transition-colors">Force SSL / Secure Profile</h4>
                                        </div>
                                    </div>
                                    <div className={`w-8 h-4 rounded-full border flex items-center p-0.5 transition-all ${
                                        config.securityConfig.forceSsl
                                        ? 'bg-zinc-200 border-zinc-200 justify-end' 
                                        : 'bg-black/40 border-zinc-800 group-hover:border-zinc-700 justify-start'
                                    }`}>
                                         <input 
                                            type="checkbox" 
                                            checked={config.securityConfig.forceSsl}
                                            onChange={(e) => handleSecurityChange('forceSsl', e.target.checked)}
                                            className="sr-only"
                                        />
                                        <div className={`w-2.5 h-2.5 rounded-full transition-all ${config.securityConfig.forceSsl ? 'bg-black' : 'bg-zinc-600'}`} />
                                    </div>
                                </label>

                                <label className={`group flex items-center justify-between p-3 border rounded-md cursor-pointer transition-all duration-300 mt-4 ${
                                    !config.onlineMode
                                    ? 'bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/20'
                                    : 'bg-[#18181b]/30 hover:bg-[#18181b]/50 border-white/5'
                                }`}>
                                    <div className="flex gap-3 items-center">
                                        <div className={`p-1.5 rounded-md transition-colors ${!config.onlineMode ? 'bg-rose-500/10 text-rose-500' : 'bg-zinc-800 text-zinc-500'}`}>
                                            <Unlock size={14} />
                                        </div>
                                        <div>
                                            <h4 className={`text-[9px] font-bold uppercase tracking-[0.2em] transition-colors ${!config.onlineMode ? 'text-rose-400' : 'text-zinc-500 group-hover:text-zinc-400'}`}>Crack Server (Offline Mode)</h4>
                                            <p className={`text-[9px] leading-snug font-medium transition-colors ${!config.onlineMode ? 'text-rose-500/60' : 'text-zinc-700'}`}>Disable official account authentication.</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-center gap-1">
                                         <input 
                                            type="checkbox" 
                                            checked={!config.onlineMode}
                                            onChange={(e) => handleChange('onlineMode', !e.target.checked)}
                                            className={`h-4 w-4 rounded border cursor-pointer focus:ring-0 appearance-none transition-all ${
                                                !config.onlineMode 
                                                ? 'bg-rose-500 border-rose-600 shadow-[0_0_10px_-2px_rgba(244,63,94,0.5)]' 
                                                : 'bg-black border-zinc-700'
                                            }`}
                                        />
                                        <span className={`text-[8px] font-black uppercase tracking-wider ${!config.onlineMode ? 'text-rose-500' : 'text-zinc-700'}`}>Unlocked</span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 xl:col-span-1">
                        {/* Threat Mitigation */}
                        <div className="bg-[#09090b]/40 backdrop-blur-sm border border-white/5 rounded-xl p-6 relative overflow-hidden group">
                           <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/5">
                                <div className="p-2 rounded-md bg-[#18181b] border border-white/5 shadow-inner">
                                    <Shield size={14} className="text-zinc-400" />
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-200">Threat Mitigation</h3>
                                    <p className="text-[9px] text-zinc-600 font-medium tracking-wide">DDoS & Geo-blocking</p>
                                </div>
                            </div>
                            
                            <div className="space-y-5">
                                <div className={`p-4 rounded-lg border transition-all duration-300 ${
                                    config.securityConfig.ddosProtection 
                                    ? 'bg-[#18181b]/80 border-white/10 shadow-lg' 
                                    : 'bg-[#18181b]/30 border-white/5'
                                }`}>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className={`text-[9px] font-bold uppercase tracking-widest transition-colors ${
                                            config.securityConfig.ddosProtection ? 'text-zinc-300' : 'text-zinc-600'
                                        }`}>DDoS Mitigation</label>
                                        <div className={`w-8 h-4 rounded-full border flex items-center p-0.5 transition-all cursor-pointer ${
                                            config.securityConfig.ddosProtection
                                            ? 'bg-zinc-200 border-zinc-200 justify-end' 
                                            : 'bg-black/40 border-zinc-800 justify-start'
                                        }`} onClick={() => handleSecurityChange('ddosProtection', !config.securityConfig.ddosProtection)}>
                                             <div className={`w-2.5 h-2.5 rounded-full transition-all ${config.securityConfig.ddosProtection ? 'bg-black' : 'bg-zinc-600'}`} />
                                        </div>
                                    </div>
                                    <p className="text-[9px] text-zinc-600 leading-relaxed">Enables aggressive packet filtering and connection throttling.</p>
                                </div>

                                <div className="space-y-1.5 group/select">
                                    <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500 group-hover/select:text-zinc-400 transition-colors block">Region Lock</label>
                                    <div className="relative">
                                        <select className="w-full bg-[#09090b] border border-white/5 rounded-md px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-700/50 hover:border-white/10 appearance-none transition-colors">
                                            <option value="">Global (No Restrictions)</option>
                                            <option value="US">North America Only</option>
                                            <option value="EU">Europe Only</option>
                                            <option value="ASIA">Asia Only</option>
                                        </select>
                                        <div className="absolute right-3 top-2.5 pointer-events-none text-zinc-600 group-hover/select:text-zinc-400 transition-colors">
                                            <ChevronDown size={12} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Integrity */}
                        <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-6 relative overflow-hidden group">
                             <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                            <h3 className="font-bold uppercase tracking-[0.2em] text-blue-400 text-[10px] mb-3 flex items-center gap-2">
                                <Activity size={12} /> System Integrity
                            </h3>
                            <p className="text-[10px] text-blue-400/60 mb-5 leading-relaxed font-medium">Core files (server.jar, eula.txt) are automatically write-protected.</p>
                            <button className="w-full py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md text-[9px] font-bold uppercase tracking-widest hover:bg-blue-500/20 hover:text-blue-300 transition-all shadow-[0_0_15px_-5px_rgba(59,130,246,0.3)]">
                                Verify File Hash
                            </button>
                        </div>
                    </div>
                    </>
                )}

                {/* ADVANCED TAB */}
                {activeTab === 'ADVANCED' && (
                    <>
                    <div className="space-y-4 xl:col-span-2">
                        {/* Paths & Environment */}
                        <div className="bg-[#09090b]/40 backdrop-blur-sm border border-white/5 rounded-xl p-6 relative overflow-hidden group">
                           <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/5">
                                <div className="p-2 rounded-md bg-[#18181b] border border-white/5 shadow-inner">
                                    <Folder size={14} className="text-zinc-400" />
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-200">Paths & Environment</h3>
                                    <p className="text-[9px] text-zinc-600 font-medium tracking-wide">File system mapping</p>
                                </div>
                            </div>
                            
                            <div className="space-y-5">
                                <div>
                                    <div className="flex justify-between">
                                        <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-1.5 block">Server Working Directory</label>
                                        <Lock size={10} className="text-zinc-600" />
                                    </div>
                                    <div className="relative group/path">
                                        <input 
                                            type="text" 
                                            readOnly
                                            value={config.workingDirectory}
                                            className="w-full bg-[#18181b]/50 border border-white/5 rounded-md px-3 py-2 text-xs font-mono text-zinc-500 focus:outline-none cursor-not-allowed select-all transition-colors group-hover/path:bg-[#18181b] group-hover/path:text-zinc-400"
                                        />
                                    </div>
                                    <p className="text-[9px] text-zinc-600 mt-1 font-medium">Absolute host path. managed by system.</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div>
                                        <InputField label="Server Executable" propKey="executable" mono note="Relative to working directory" />
                                    </div>
                                    <div>
                                        <InputField label="Server Log Location" propKey="logLocation" mono />
                                    </div>
                                </div>
                            </div>
                        </div>

                         {/* Java & Memory */}
                        <div className="bg-[#09090b]/40 backdrop-blur-sm border border-white/5 rounded-xl p-6 relative overflow-hidden group">
                           <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/5">
                                <div className="p-2 rounded-md bg-[#18181b] border border-white/5 shadow-inner">
                                    <Cpu size={14} className="text-zinc-400" />
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-200">Java & Memory</h3>
                                    <p className="text-[9px] text-zinc-600 font-medium tracking-wide">Runtime Configuration</p>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                                    <div className="space-y-1.5 group/select">
                                        <label className="text-[9px] uppercase tracking-[0.2em] font-bold text-zinc-500 group-hover/select:text-zinc-400 transition-colors">Java Version Override</label>
                                        <div className="relative">
                                            <select 
                                                value={config.javaVersion}
                                                onChange={(e) => handleChange('javaVersion', e.target.value)}
                                                className="w-full bg-[#09090b] border border-white/5 rounded-md px-3 py-2 text-xs font-medium text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-700/50 appearance-none transition-colors hover:border-white/10"
                                            >
                                                <option value="Do Not Override">Do Not Override</option>
                                                <option value="Java 17">Java 17 (Temurin)</option>
                                                <option value="Java 21">Java 21 (Temurin)</option>
                                                <option value="Java 8">Java 8 (Legacy)</option>
                                            </select>
                                            <div className="absolute right-3 top-2.5 pointer-events-none text-zinc-600 group-hover/select:text-zinc-400 transition-colors">
                                                <ChevronDown size={12} />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 font-sans">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-[9px] uppercase tracking-[0.2em] font-bold text-zinc-500">Server RAM Allocation</label>
                                            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">{config.ram} GB</span>
                                        </div>
                                        <div className="relative flex items-center gap-3 h-[34px] px-1">
                                            <input 
                                                type="range" 
                                                min="1" 
                                                max="32" 
                                                step="1"
                                                value={config.ram}
                                                onChange={(e) => handleChange('ram', parseInt(e.target.value))}
                                                className="flex-1 h-1 bg-[#18181b] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:hover:bg-emerald-400 [&::-webkit-slider-thumb]:transition-colors"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-1.5 group/cmd">
                                    <label className="text-[9px] uppercase tracking-[0.2em] font-bold text-zinc-500 group-hover/cmd:text-zinc-400 transition-colors">Server Execution Command</label>
                                    <div className="relative">
                                        <textarea 
                                            value={config.executionCommand}
                                            onChange={(e) => handleChange('executionCommand', e.target.value)}
                                            className="w-full h-24 bg-[#09090b] border border-white/5 rounded-md px-3 py-2 text-[10px] font-mono text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-700/50 resize-none leading-relaxed transition-colors hover:border-white/10 placeholder:text-zinc-800"
                                            placeholder="java -Xmx4G -jar server.jar nogui"
                                        />
                                        <div className="absolute right-3 bottom-3 text-zinc-700 pointer-events-none group-hover/cmd:text-zinc-600 transition-colors">
                                            <Terminal size={14} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="space-y-4 xl:col-span-1">
                        {/* Process Management */}
                        <div className="bg-[#09090b]/40 backdrop-blur-sm border border-white/5 rounded-xl p-6 relative overflow-hidden group">
                           <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/5">
                                <div className="p-2 rounded-md bg-[#18181b] border border-white/5 shadow-inner">
                                    <Play size={14} className="text-zinc-400" />
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-200">Process Control</h3>
                                    <p className="text-[9px] text-zinc-600 font-medium tracking-wide">Startup & Shutdown</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <InputField label="Graceful Stop Command" propKey="stopCommand" mono placeholder="stop" />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5 group/input">
                                        <label className="text-[9px] uppercase tracking-[0.2em] font-bold text-zinc-500 group-hover/input:text-zinc-400 transition-colors">Start Delay</label>
                                        <div className="relative">
                                            <input 
                                                type="number" 
                                                value={config.autostartDelay}
                                                onChange={(e) => handleChange('autostartDelay', parseInt(e.target.value))}
                                                className="w-full bg-[#09090b] border border-white/5 rounded-md pl-3 pr-6 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-700/50 font-medium text-zinc-300 transition-colors hover:border-white/10"
                                            />
                                            <span className="absolute right-2 top-2 text-[10px] text-zinc-600 font-bold">s</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 group/input">
                                        <label className="text-[9px] uppercase tracking-[0.2em] font-bold text-zinc-500 group-hover/input:text-zinc-400 transition-colors">Kill Timeout</label>
                                        <div className="relative">
                                            <input 
                                                type="number" 
                                                value={config.shutdownTimeout}
                                                onChange={(e) => handleChange('shutdownTimeout', parseInt(e.target.value))}
                                                className="w-full bg-[#09090b] border border-white/5 rounded-md pl-3 pr-6 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-700/50 font-medium text-zinc-300 transition-colors hover:border-white/10"
                                            />
                                            <span className="absolute right-2 top-2 text-[10px] text-zinc-600 font-bold">s</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                         {/* Network & Optimization (New) */}
                         <div className="bg-[#09090b]/40 backdrop-blur-sm border border-white/5 rounded-xl p-6 relative overflow-hidden group">
                           <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/5">
                                <div className="p-2 rounded-md bg-[#18181b] border border-white/5 shadow-inner">
                                    <Network size={14} className="text-zinc-400" />
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-200">Optimization</h3>
                                    <p className="text-[9px] text-zinc-600 font-medium tracking-wide">Performance Tuning</p>
                                </div>
                            </div>
                            <div className="space-y-2">
                               {[
                                    { label: 'Aikar\'s Flags (Performance)', key: 'aikarFlags', icon: <Zap size={12} className="text-amber-500" /> },
                                    { label: 'Proxy Forwarding (Velocity)', key: 'proxySupport', icon: <ArrowRightLeft size={12} className="text-sky-500" /> },
                                    { label: 'Spark Profiler', key: 'installSpark', icon: <Activity size={12} className="text-purple-500" /> },
                                ].map((item) => (
                                    <label key={item.key} className="group flex items-center justify-between p-3 rounded-md border border-white/5 bg-[#18181b]/50 hover:bg-[#18181b] hover:border-white/10 cursor-pointer transition-all duration-200">
                                        <div className="flex items-center gap-2.5">
                                            {item.icon}
                                            <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-400 group-hover:text-zinc-300 transition-colors">{item.label}</span>
                                        </div>
                                         <div className={`w-8 h-4 rounded-full border flex items-center p-0.5 transition-all ${
                                                config.advancedFlags?.[item.key] 
                                                ? 'bg-zinc-200 border-zinc-200 justify-end' 
                                                : 'bg-black/40 border-zinc-800 group-hover:border-zinc-700 justify-start'
                                            }`}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={config.advancedFlags?.[item.key] || false}
                                                    onChange={(e) => {
                                                        const newFlags = { ...config.advancedFlags, [item.key]: e.target.checked };
                                                        setConfig({ ...config, advancedFlags: newFlags });
                                                        setIsDirty(true);
                                                    }}
                                                    className="sr-only"
                                                />
                                                <div className={`w-2.5 h-2.5 rounded-full transition-all ${config.advancedFlags?.[item.key] ? 'bg-black' : 'bg-zinc-600'}`} />
                                            </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                         {/* Danger Zone */}
                        <div className="bg-rose-950/10 border border-rose-900/20 rounded-xl p-6 relative overflow-hidden group">
                             <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-rose-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-rose-500/10 rounded-md border border-rose-500/20">
                                    <AlertTriangle className="text-rose-500" size={14} />
                                </div>
                                <h3 className="font-bold text-xs uppercase tracking-[0.2em] text-rose-500">Danger Zone</h3>
                            </div>
                            <div className="space-y-4 pl-1">
                                <div className="flex flex-col gap-3">
                                    <div>
                                        <h4 className="font-bold text-[10px] uppercase tracking-widest text-zinc-300 mb-1">Reinstall Server</h4>
                                        <p className="text-[9px] text-rose-500/60 font-medium">This action is irreversible. All data will be lost.</p>
                                    </div>
                                    <button className="w-full bg-rose-500/10 text-rose-500 border border-rose-500/20 px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-widest hover:bg-rose-500 hover:text-white hover:border-rose-500 transition-all shadow-[0_0_0_0_rgba(244,63,94,0)] hover:shadow-[0_0_15px_-3px_rgba(244,63,94,0.4)]">
                                        Reinstall Server
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default SettingsManager;