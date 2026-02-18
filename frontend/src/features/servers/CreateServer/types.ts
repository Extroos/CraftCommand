export type WizardStep = 'software' | 'details' | 'review';
export type CreateMode = 'wizard' | 'pro' | 'proxy';
export type ServerCategory = 'GAME';

export interface FormData {
    name: string;
    folderName?: string; // Optional custom folder
    loaderBuild?: string; // Specific build
    software: string;
    version: string;
    javaVersion: 'Java 8' | 'Java 11' | 'Java 17' | 'Java 21' | 'Do Not Override';
    port: number;
    ram: number;
    maxPlayers: number;
    levelType: string;
    levelSeed: string;
    motd: string;
    eula: boolean;
    modpackUrl: string;
    enableSecurity: boolean;
    aikarFlags: boolean;
    installSpark: boolean;
    onlineMode: boolean;
    usePurpur: boolean;
    templateId?: string;
    cpuPriority?: 'normal' | 'high' | 'realtime';
    nodeId: string;
    forwardingMode?: 'none' | 'legacy' | 'bungeeguard' | 'modern';
    proxySecret?: string;
}

export interface CreateServerProps {
    onBack: () => void;
    onDeploy: () => void;
}
