
import { ServerConfig } from '../types';
import fs from 'fs-extra';
import path from 'path';
import { CoreRules } from './DiagnosisRules';

export interface SystemStats {
    totalMemory: number;
    freeMemory: number;
    javaVersion: string;
}

export interface DiagnosisResult {
    id: string; // Unique ID for this specific diagnosis instance
    ruleId: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    title: string;
    explanation: string;
    recommendation: string;
    action?: {
        type: 'UPDATE_CONFIG' | 'SWITCH_JAVA' | 'AGREE_EULA' | 'INSTALL_DEPENDENCY';
        payload: any;
    };
    timestamp: number;
}

export interface DiagnosisRule {
    id: string;
    name: string;
    description: string;
    // Log patterns to quickly identify if this rule *might* apply (optimization)
    triggers: RegExp[]; 
    // The core logic
    analyze: (server: ServerConfig, logs: string[], env: SystemStats) => Promise<DiagnosisResult | null>;
}

export class DiagnosisService {
    private rules: DiagnosisRule[] = [];

    constructor() {
        this.registerDefaultRules();
    }

    public registerRule(rule: DiagnosisRule) {
        this.rules.push(rule);
        console.log(`[Diagnosis] Registered rule: ${rule.name} (${rule.id})`);
    }

    private registerDefaultRules() {
        CoreRules.forEach(rule => this.registerRule(rule));
        console.log(`[Diagnosis] Initialized with ${this.rules.length} default rules.`);
    }

    /**
     * Run all applicable rules against the server state
     */
    public async diagnose(server: ServerConfig, recentLogs: string[], env: SystemStats): Promise<DiagnosisResult[]> {
        const results: DiagnosisResult[] = [];
        
        console.log(`[Diagnosis] Analyzing server ${server.id} with ${this.rules.length} rules...`);

        for (const rule of this.rules) {
            try {
                // Optimization: Only run analyze if logs match triggers (if triggers exist)
                const shouldRun = rule.triggers.length === 0 || rule.triggers.some(t => recentLogs.some(l => t.test(l)));
                
                if (shouldRun) {
                    const result = await rule.analyze(server, recentLogs, env);
                    if (result) {
                        results.push(result);
                    }
                }
            } catch (error) {
                console.error(`[Diagnosis] Rule ${rule.id} failed to execute:`, error);
            }
        }

        return results;
    }
}

export const diagnosisService = new DiagnosisService();
