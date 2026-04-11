import {  ServerConfig, DiagnosisResult, NodeStatus  } from '@shared/types';
export { ServerConfig, DiagnosisResult };
import { CrashReport } from './CrashReportReader';

export interface SystemStats {
    totalMemory?: number;
    freeMemory?: number;
    javaVersion?: string;
    // Runtime performance metrics
    cpu?: number;
    cpuUsage?: number;
    memoryUsed?: number;
    memoryTotal?: number;
    diskFree?: number;
    diskTotal?: number;
    tps?: number;
    nodeStatus?: NodeStatus;
    timestamp?: number;
}

export interface DiagnosisRule {
    id: string;
    name: string;
    description: string;
    
    // Tier defines the order of execution and importance
    // Tier 1: Infrastructure (Java, RAM, Disk)
    // Tier 2: Software/Loader (Startup logic, Libraries)
    // Tier 3: Logic/Runtime (Mod conflict, Ticking entities, World corruption)
    tier: 1 | 2 | 3;
    
    // Default confidence for this rule (roughly how likely it's accurate if triggered)
    defaultConfidence: number; // 0-100

    // Log patterns to quickly identify if this rule *might* apply (optimization)
    triggers: RegExp[]; 
    
    // The core logic
    analyze: (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport) => Promise<DiagnosisResult | null>;
    
    // Proactive properties
    isRepairable?: boolean;
    repair?: (server: ServerConfig) => Promise<boolean>;

    // Anti-Spam & UI metadata
    cooldownHours?: number; // How long to wait before re-triggering this rule
    tags?: string[];        // Metadata tags like 'optimization', 'critical', 'network'
}
