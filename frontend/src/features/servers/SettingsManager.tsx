
import React, { useState, useEffect } from 'react';
import { Server, Save, Terminal, Lock, Unlock, Folder, Play, Clock, Shield, Globe, Cpu, RotateCcw, Gamepad2, Swords, Ghost, Feather, ScrollText, AlertTriangle, AlertCircle, Fingerprint, Network, ShieldAlert, Key, Zap, ArrowRightLeft, Activity, ChevronDown, Check, Download, ExternalLink, Bot, X, Info, Plus, Minus, Database, Image, Upload, MonitorPlay, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { STAGGER_CONTAINER, STAGGER_ITEM, MOTION_SPRINGS } from '../../styles/motion';
import { ServerStatus } from '@shared/types';

import { API } from '@core/services/api';
import { useToast } from '../ui/Toast';
import { useServers } from '@features/servers/context/ServerContext';
import { useUser } from '@features/auth/context/UserContext';
import { usePermissions } from '@features/auth/hooks/usePermissions';
import { getServerCapabilities } from '@shared/utils/CapabilityUtils';
import { NetworkSettings } from '../system/NetworkSettings';
import AccessDenied from '@features/auth/components/AccessDenied';
import { useConfirm } from '@features/ui/hooks/useConfirm';
import { ConfirmDialog } from '@features/ui/ConfirmDialog';

import { SecurityConfig } from '@shared/types';

import { GeneralSettings } from './Settings/GeneralSettings';
import { SecuritySettings } from './Settings/SecuritySettings';
import { AdvancedSettings } from './Settings/AdvancedSettings';
import { NetworkingSettings } from './Settings/NetworkingSettings';
import { DangerZone } from './Settings/DangerZone';
import { ConnectivitySettings } from './Settings/ConnectivitySettings';
import { ResourceSettings } from './Settings/ResourceSettings';
import { ProfileManager } from './Settings/ProfileManager';

interface SettingsManagerProps {
    serverId: string;
}

const SettingsManager: React.FC<SettingsManagerProps> = ({ serverId }) => {
    const [activeTab, setActiveTab] = useState<'GENERAL' | 'SECURITY' | 'ADVANCED' | 'NETWORKING' | 'CONNECTIVITY' | 'RESOURCES' | 'PROFILES'>('GENERAL');
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const { servers, stats, currentServer, updateServerConfig, refreshServers } = useServers();
    const { user } = useUser();
    const { can } = usePermissions();
    const { addToast } = useToast();
    const isOffline = currentServer?.status === 'OFFLINE' || currentServer?.status === 'CRASHED';
    const { isOpen: isConfirmOpen, config: confirmConfig, confirm: requestConfirm, handleConfirm, handleCancel } = useConfirm();
    const [wanConfirmed, setWanConfirmed] = useState(false);
    const [isUploadingIcon, setIsUploadingIcon] = useState(false);
    const iconInputRef = React.useRef<HTMLInputElement>(null);
    const [isUnlinking, setIsUnlinking] = useState(false);

    // Settings Quick-Search
    const [settingsSearch, setSettingsSearch] = useState('');

    const SETTINGS_MAP: Record<TabType, { keywords: string[] }[]> = {
        'GENERAL': [
            { keywords: ['name', 'server name', 'directory', 'path', 'jar', 'executable', 'java', 'ram', 'memory', 'port', 'ip', 'address', 'motd', 'gamemode', 'difficulty', 'players', 'max players', 'pvp', 'hardcore', 'flight', 'monsters', 'animals', 'seed', 'view distance', 'online mode', 'autostart', 'crash', 'icon', 'velocity', 'proxy', 'forwarding', 'stop command', 'shutdown', 'update url', 'docker', 'engine', 'cpu priority', 'autorestart', 'log retention', 'crash exit codes', 'status page'] },
        ],
        'SECURITY': [
            { keywords: ['firewall', 'allowed ip', 'whitelist', 'ddos', 'protection', '2fa', 'op', 'ssl', 'tls', 'https', 'region lock', 'security', 'encryption', 'vault', 'privacy', 'audit', 'logs'] },
        ],
        'ADVANCED': [
            { keywords: ['aikar', 'flags', 'spark', 'debug', 'gc', 'garbage collection', 'g1gc', 'zgc', 'shenandoah', 'socket buffer', 'compression', 'auto healing', 'health check', 'retry', 'thread priority', 'tick distance', 'content log', 'cross-play', 'geyser', 'bedrock', 'optimization', 'performance', 'jit', 'flags'] },
        ],
        'NETWORKING': [
            { keywords: ['network', 'port', 'firewall', 'dns', 'domain', 'ssl', 'certificate', 'proxy', 'reverse proxy', 'tunnel', 'cloudflare', 'ngrok', 'remote access', 'connectivity', 'wan', 'lan', 'port mapping', 'cname'] },
        ],
        'CONNECTIVITY': [
            { keywords: ['sftp', 'ftp', 'ssh', 'transfer', 'port', 'hostname', 'username', 'password', 'reset', 'allocation', 'winscp', 'filezilla', 'upload', 'credentials'] },
        ],
        'RESOURCES': [
            { keywords: ['database', 'db', 'mysql', 'mariadb', 'postgres', 'subuser', 'access', 'api', 'token', 'key', 'rotation', 'secret', 'invite', 'member', 'permission', 'rbac'] },
        ],
        'PROFILES': [
            { keywords: ['export', 'import', 'profile', 'configuration', 'backup', 'restore', 'json'] },
        ],
    };

    const searchMatchTab = settingsSearch.trim() ? (() => {
        const q = settingsSearch.toLowerCase();
        for (const [tab, entries] of Object.entries(SETTINGS_MAP)) {
            for (const entry of entries) {
                if (entry.keywords.some(k => k.includes(q))) return tab as TabType;
            }
        }
        return null;
    })() : null;
    
    // Cross-Play State
    const [crossPlayStatus, setCrossPlayStatus] = useState<any>(null);
    const [isCrossPlayLoading, setIsCrossPlayLoading] = useState(false);

    useEffect(() => {
        if (!serverId || !currentServer) return;
        // Only fetch for compatible software to save requests
        const compatible = ['Paper', 'Spigot', 'Purpur', 'Fabric', 'Velocity', 'Folia'].includes(currentServer.software);
        if (!compatible && currentServer.software !== 'Velocity') return;

        const fetchStatus = async () => {
             try {
                 const status = await API.get(`/crossplay/${serverId}/status`);
                 setCrossPlayStatus(status);
             } catch (e) {
                 console.warn('[Settings] CrossPlay status fetch failed, using default', e);
                 // Fallback to allow interaction
                 setCrossPlayStatus({
                     enabled: false,
                     bedrockPort: 19132,
                     compatible: true,
                     topology: 'standalone'
                 });
             }
        };
        fetchStatus();
    }, [serverId, currentServer?.software]);

    const handleToggleCrossPlay = async (enable: boolean) => {
        // Fallback to defaults if status is missing
        const currentStatus = crossPlayStatus || { bedrockPort: 19132 };
        
        setIsCrossPlayLoading(true);
        try {
            if (enable) {
                const res = await API.post(`/crossplay/${serverId}/enable`, { 
                    bedrockPort: currentStatus.bedrockPort || 19132 
                });
                if (res.success) {
                    addToast('success', 'Cross-Play Enabled', res.message);
                    if (res.needsRestart) updateServerConfig(serverId, { needsRestart: true });
                } else {
                    addToast('error', 'Activation Failed', res.message);
                }
            } else {
                const res = await API.post(`/crossplay/${serverId}/disable`, {});
                if (res.success) {
                    addToast('success', 'Cross-Play Disabled', res.message);
                    if (res.needsRestart) updateServerConfig(serverId, { needsRestart: true });
                }
            }
            // Refresh status
            const status = await API.get(`/crossplay/${serverId}/status`);
            setCrossPlayStatus(status);
        } catch (e: any) {
            addToast('error', 'Error', e.message || 'Cross-Play action failed');
        } finally {
            setIsCrossPlayLoading(false);
        }
    };

    const linkedProxy = React.useMemo(() => {
        return servers.find(s => 
            s.software === 'Velocity' && 
            s.network?.proxyConfig?.links?.some((l: any) => l.serverId === serverId)
        );
    }, [servers, serverId]);

    const handleUnlink = async () => {
        const isConfirmed = await requestConfirm({
            title: 'Unlink Proxy',
            description: 'Are you sure you want to decouple this server from the Velocity proxy? This will restore online-mode=true.',
            confirmText: 'Unlink',
            cancelText: 'Cancel'
        });
        if (!isConfirmed) return;
        
        setIsUnlinking(true);
        try {
            await API.unlinkProxyByServer(serverId);
            await refreshServers();
            addToast('success', 'Unlinked Successfully', 'Server decoupled. A restart is required to apply the new configuration.');
        } catch (e: any) {
            addToast('error', 'Unlink Failed', e.message);
        } finally {
            setIsUnlinking(false);
        }
    };
    
    const capabilities = React.useMemo(() => 
        getServerCapabilities(currentServer?.software || 'Java'), 
        [currentServer?.software]
    );

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
        executionEngine: 'native' as 'native' | 'docker' | 'remote',
        dockerImage: '',
        // Proxy Settings
        forwardingMode: 'modern' as 'none' | 'legacy' | 'bungeeguard' | 'modern',
        proxySecret: '',
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
            threadPriority: 'normal',
            // Bedrock Specific Native
            tickDistance: 4,
            contentLog: false,
            compressionLimit: 1
        }
    });

    const [newIp, setNewIp] = useState('');




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
                    threadPriority: currentServer.advancedFlags?.threadPriority || 'normal',
                    tickDistance: currentServer.advancedFlags?.tickDistance || 4,
                    contentLog: currentServer.advancedFlags?.contentLog || false,
                    compressionLimit: currentServer.advancedFlags?.compressionLimit || 1
                },
                cpuPriority: currentServer.cpuPriority || 'normal',
                executionEngine: (currentServer.executionEngine === 'default' ? 'native' : currentServer.executionEngine) || 'native',
                dockerImage: currentServer.dockerImage || '',
                forwardingMode: currentServer.network?.proxyConfig?.forwardingMode || 'modern',
                proxySecret: currentServer.network?.proxyConfig?.secret || ''
            });
        }
    }, [currentServer?.id]);

    useEffect(() => {
        API.getGlobalSettings().then(setGlobalSettings).catch(() => {});
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
        if (key === 'advancedFlags.tickDistance') {
            if (value < 4 || value > 12) return 'Tick distance must be 4-12';
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

    const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validation: Must be an image
        if (!file.type.startsWith('image/')) {
            addToast('error', 'Invalid Format', 'Please upload a valid image file.');
            return;
        }

        // Limit size: 10MB sanity check
        if (file.size > 10 * 1024 * 1024) {
            addToast('error', 'File Too Large', 'Image must be less than 10MB.');
            return;
        }

        if (!can('server.settings.manage', serverId)) {
            addToast('error', 'Permissions', 'Insufficient permissions to update server icon');
            return;
        }

        setIsUploadingIcon(true);
        const optimizationToast = addToast('info', 'Stabilizing Icon', 'Optimizing photo for Minecraft compatibility...');
        
        try {
            await API.uploadServerIcon(serverId, file);
            addToast('success', 'Icon Optimized', 'Your server icon was successfully stabilized and updated.');
            refreshServers(); // Reload to update iconUrl if stored, or just refresh context
        } catch (err: any) {
            addToast('error', 'Optimization Failed', err.message || 'Failed to process icon');
        } finally {
            setIsUploadingIcon(false);
            if (iconInputRef.current) iconInputRef.current.value = '';
        }
    };


    // Keyboard shortcut for saving configurations
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (isDirty && !isSaving && !isOffline && can('server.settings.manage', serverId)) {
                    handleSave();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    });

    const handleSave = async () => {
        if (!can('server.settings.manage', serverId)) {
            addToast('error', 'Permissions', 'Insufficient permissions to modify server settings');
            return;
        }

        if (Object.keys(errors).length > 0) {
            addToast('error', 'Invalid Configuration', 'Please fix the errors before saving.');
            return;
        }

        if (config.ip === '0.0.0.0' && currentServer?.software === 'Bedrock' && !wanConfirmed) {
            addToast('warning', 'Wan Exposure Risk', 'You must explicitly confirm you have configured UDP firewall rules for 0.0.0.0.');
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
                threadPriority: config.advancedFlags.threadPriority as any,
                tickDistance: config.advancedFlags.tickDistance,
                contentLog: config.advancedFlags.contentLog,
                compressionLimit: config.advancedFlags.compressionLimit
            },
            cpuPriority: config.cpuPriority as 'normal' | 'high' | 'realtime',
            executionEngine: config.executionEngine,
            dockerImage: config.dockerImage,
            network: currentServer?.software === 'Velocity' ? {
                ...currentServer.network,
                proxyConfig: {
                    ...currentServer.network?.proxyConfig,
                    links: currentServer.network?.proxyConfig?.links || [],
                    forwardingMode: config.forwardingMode,
                    secret: config.proxySecret
                }
            } : currentServer?.network
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

    const handleDecommissionRequest = async () => {
        const isConfirmed = await requestConfirm({
            title: 'Decommission Instance',
            description: 'CRITICAL: This will permanently delete the server record and all associated files from the disk. This action is irreversible.',
            confirmText: 'Decommission',
            cancelText: 'Cancel'
        });
        if (isConfirmed) handleDecommission();
    };

    const handleDecommission = async () => {
        if (!can('server.delete', serverId)) {
            addToast('error', 'Permissions', 'Insufficient permissions to delete this server');
            return;
        }

        // 1. Status Check (RESTORED FEATURE: v1.7.6)
        if (currentServer && (currentServer.status === ServerStatus.ONLINE || currentServer.status === ServerStatus.STARTING)) {
            addToast('warning', 'Safety Lock', `You cannot decommission "${currentServer.name}" while it is ${currentServer.status}. Stop it first.`);
            return;
        }

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

    const handleResetRequest = async () => {
        const isConfirmed = await requestConfirm({
            title: 'Factory Reset Instance',
            description: 'This will revert all configuration settings to their default values. This action cannot be undone once committed.',
            confirmText: 'Reset',
            cancelText: 'Cancel'
        });
        if (isConfirmed) handleFactoryReset();
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

        if (!can('server.settings.manage', serverId)) {
            addToast('error', 'Permissions', 'Insufficient permissions to reset configuration');
            return;
        }

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
        }
    };

    const handleCloneRequest = async () => {
        const isConfirmed = await requestConfirm({
            title: 'Clone Server Instance',
            description: 'This will create a complete copy of this server, including all files, plugins, and configurations. It may take several minutes depending on the server size.',
            confirmText: 'Clone',
            cancelText: 'Cancel'
        });
        
        if (isConfirmed) {
            if (!can('server.create', serverId)) {
                addToast('error', 'Permissions', 'Insufficient permissions to clone server');
                return;
            }
            
            setIsSaving(true);
            try {
                const newName = `${currentServer?.name || 'Server'} (Clone)`;
                addToast('info', 'Cloning Started', 'Creating a copy of the server. This may take a while...');
                await API.cloneServer(serverId, newName);
                addToast('success', 'Clone Complete', 'Server cloned successfully. It will appear on your dashboard.');
                await refreshServers();
            } catch (err: any) {
                addToast('error', 'Clone Failed', err.message || 'Could not clone server instance.');
            } finally {
                setIsSaving(false);
            }
        }
    };

    type TabType = 'GENERAL' | 'SECURITY' | 'ADVANCED' | 'NETWORKING' | 'CONNECTIVITY' | 'RESOURCES' | 'PROFILES';

    if (!can('server.settings.manage', serverId)) {
        return (
            <AccessDenied 
                title="Configuration Restricted"
                description="You do not have permission to modify settings for this server. Please contact an administrator for elevated access."
            />
        );
    }

    return (
        <motion.div 
            variants={STAGGER_CONTAINER}
            initial="hidden"
            animate="show"
            className="max-w-[1600px] mx-auto space-y-4 pb-12 relative"
        >
            {/* --- TOP HEADER BAR --- */}
            <motion.div variants={STAGGER_ITEM} className={`border border-border/80 p-4 transition-all duration-300 ${globalSettings?.app?.visualQuality ? 'glass-morphism quality-shadow rounded-2xl' : 'bg-card rounded-md shadow-sm'}`}>
                <div className="h-10 bg-muted/20 border-b border-border/60 flex items-center justify-between px-4">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/40"></div>
                        <span className="text-[11px] font-semibold text-muted-foreground tracking-tight">Configuration Settings</span>
                    </div>
                </div>

                <div className="px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-4">
                    <nav className="flex items-center gap-1 bg-muted/10 p-0.5 rounded-md border border-border/40 overflow-x-auto scrollbar-none">
                        {(['GENERAL', 'SECURITY', 'ADVANCED', 'NETWORKING', 'CONNECTIVITY', 'RESOURCES', 'PROFILES'] as TabType[]).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-1.5 rounded-[4px] text-[10px] font-bold tracking-tight transition-all whitespace-nowrap ${
                                    activeTab === tab 
                                    ? 'bg-primary text-primary-foreground shadow-sm' 
                                    : 'text-muted-foreground/60 hover:text-foreground/80 hover:bg-muted/30'
                                }`}
                            >
                                {tab === 'NETWORKING' ? 'Networking' : 
                                 tab === 'CONNECTIVITY' ? 'Connectivity' :
                                 tab === 'RESOURCES' ? 'Resources' :
                                 tab === 'PROFILES' ? 'Profiles' :
                                 tab.charAt(0) + tab.slice(1).toLowerCase()}
                            </button>
                        ))}
                    </nav>

                    <div className="flex items-center gap-2">
                        {/* Settings Quick-Search */}
                        <div className="relative hidden sm:block">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                            <input
                                type="text"
                                value={settingsSearch}
                                onChange={(e) => {
                                    setSettingsSearch(e.target.value);
                                    // Auto-navigate to matching tab
                                    const q = e.target.value.toLowerCase().trim();
                                    if (q) {
                                        for (const [tab, entries] of Object.entries(SETTINGS_MAP)) {
                                            for (const entry of entries) {
                                                if (entry.keywords.some(k => k.includes(q))) {
                                                    setActiveTab(tab as TabType);
                                                    return;
                                                }
                                            }
                                        }
                                    }
                                }}
                                placeholder="Search settings..."
                                className="bg-background border border-border/50 rounded-md pl-7 pr-3 py-1.5 text-[10px] font-medium text-foreground placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-primary/30 outline-none transition-all w-40 focus:w-52"
                            />
                            {settingsSearch && searchMatchTab && (
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-bold text-primary uppercase tracking-wider">
                                    {searchMatchTab}
                                </span>
                            )}
                            {settingsSearch && !searchMatchTab && (
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-bold text-muted-foreground/40 uppercase tracking-wider">
                                    No match
                                </span>
                            )}
                        </div>
                        <button 
                            onClick={handleSave} 
                            disabled={isSaving || !isDirty || !can('server.settings.manage', serverId)}
                            className={`px-5 py-1.5 rounded-md text-[10px] font-bold tracking-tight disabled:opacity-30 disabled:grayscale transition-all shadow-sm flex items-center gap-2 disabled:cursor-not-allowed ${isDirty ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]' : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'}`}
                            title={!can('server.settings.manage', serverId) ? 'Insufficient Permissions' : 'Save Settings (Ctrl+S)'}
                        >
                            {isSaving ? <RotateCcw size={12} className="animate-spin" /> : <Save size={12} />}
                            {isSaving ? 'Saving Changes...' : (isDirty ? 'Save Settings *' : 'Save Settings')}

                        </button>
                    </div>
                </div>
            </motion.div>

            <div className="mt-6 relative">
                {/* Search Overlay / No Results */}
                <AnimatePresence>
                    {settingsSearch && !searchMatchTab && (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm rounded-xl py-20 min-h-[400px]"
                        >
                            <div className="w-16 h-16 rounded-full bg-secondary/30 flex items-center justify-center mb-4">
                                <Search size={32} className="text-muted-foreground/20" />
                            </div>
                            <h3 className="text-sm font-bold text-foreground/70 uppercase tracking-widest">No matching settings</h3>
                            <p className="text-[10px] text-muted-foreground/40 font-medium mt-1">We couldn't find any configuration items for "{settingsSearch}"</p>
                            <button 
                                onClick={() => setSettingsSearch('')}
                                className="mt-6 px-4 py-1.5 bg-secondary hover:bg-muted text-[10px] font-bold text-muted-foreground rounded transition-all border border-border/40"
                            >
                                Clear Search
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* GENERAL TAB */}
                {activeTab === 'GENERAL' && (
                    <GeneralSettings
                        config={config}
                        errors={errors}
                        handleChange={handleChange}
                        linkedProxy={linkedProxy}
                        handleUnlink={handleUnlink}
                        isUnlinking={isUnlinking}
                        currentServer={currentServer}
                        globalSettings={globalSettings}
                        wanConfirmed={wanConfirmed}
                        setWanConfirmed={setWanConfirmed}
                        capabilities={capabilities}
                        isUploadingIcon={isUploadingIcon}
                        handleIconUpload={handleIconUpload}
                        iconInputRef={iconInputRef}
                    />
                )}
                {activeTab === 'SECURITY' && (
                    <SecuritySettings
                        config={config}
                        handleChange={handleChange}
                        handleSecurityChange={handleSecurityChange}
                        globalSettings={globalSettings}
                        currentServer={currentServer}
                    />
                )}
                {activeTab === 'ADVANCED' && (
                    <div className="space-y-4 xl:col-span-3">
                        <AdvancedSettings
                            config={config}
                            setConfig={setConfig}
                            errors={errors}
                            handleChange={handleChange}
                            serverId={serverId}
                            servers={servers}
                            globalSettings={globalSettings}
                            capabilities={capabilities}
                            user={user}
                            dockerStatus={dockerStatus}
                            checkDocker={checkDocker}
                            setIsDirty={setIsDirty}
                        />
                        <div className="mt-8">
                            <DangerZone
                                isOffline={isOffline}
                                onReset={handleResetRequest}
                                onDecommission={handleDecommissionRequest}
                                onClone={handleCloneRequest}
                            />
                        </div>
                    </div>
                )}
                {activeTab === 'NETWORKING' && (
                    <NetworkingSettings
                        currentServer={currentServer}
                        serverId={serverId}
                        globalSettings={globalSettings}
                        crossPlayStatus={crossPlayStatus}
                        handleToggleCrossPlay={handleToggleCrossPlay}
                        isCrossPlayLoading={isCrossPlayLoading}
                        capabilities={capabilities}
                        config={config}
                        errors={errors}
                        handleChange={handleChange}
                        servers={servers}
                        stats={stats}
                        setConfig={setConfig}
                        setIsDirty={setIsDirty}
                        user={user}
                    />
                )}
                {activeTab === 'CONNECTIVITY' && (
                    <ConnectivitySettings
                        currentServer={currentServer}
                        serverId={serverId}
                    />
                )}
                {activeTab === 'RESOURCES' && (
                    <ResourceSettings
                        serverId={serverId}
                    />
                )}
                {activeTab === 'PROFILES' && (
                    <ProfileManager
                        serverId={serverId}
                    />
                )}
            </div>
            
            <ConfirmDialog 
                isOpen={isConfirmOpen}
                title={confirmConfig?.title || 'Confirm Action'}
                description={confirmConfig?.description || 'Are you sure you want to proceed?'}
                confirmText={confirmConfig?.confirmText}
                cancelText={confirmConfig?.cancelText}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
                isDestructive={true}
            />
        </motion.div>
    );
};

export default SettingsManager;