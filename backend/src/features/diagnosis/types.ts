import {  ServerConfig, DiagnosisResult, NodeStatus  } from '@shared/types';
export { ServerConfig, DiagnosisResult };
import { CrashReport } from './CrashReportReader';

export interface SystemStats {
    totalMemory: number;
    freeMemory: number;
    javaVersion: string;
    // Runtime performance metrics
    cpu?: number;
    memoryUsed?: number;
    memoryTotal?: number;
    tps?: number;
    nodeStatus?: NodeStatus;
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
    isHealable?: boolean;
    heal?: (server: ServerConfig) => Promise<boolean>;
}
