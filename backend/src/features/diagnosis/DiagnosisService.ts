import { DiagnosisRule, SystemStats, ServerConfig, DiagnosisResult } from './types';
import { CoreRules } from './DiagnosisRules';
import { CrashReportReader, CrashReport } from './CrashReportReader';
import { diagnosisBrain } from './DiagnosisBrain';

export class DiagnosisService {
    private rules: Map<string, DiagnosisRule> = new Map();

    constructor() {
        // Automatically register all core rules
        CoreRules.forEach(rule => this.registerRule(rule));
    }

    public registerRule(rule: DiagnosisRule) {
        this.rules.set(rule.id, rule);
        console.log(`[Diagnosis] Registered rule: ${rule.name} (${rule.id})`);
    }

    /**
     * Run all applicable rules against the server state using the Intelligence Brain
     */
    public async diagnose(server: ServerConfig, recentLogs: string[], env: SystemStats): Promise<DiagnosisResult[]> {
        // 1. Fetch deep crash report if available
        const crashReport = await CrashReportReader.getRecentCrashReport(server.workingDirectory);
        
        console.log(`[DiagnosisService] Analyzing server ${server.id} with ${this.rules.size} rules...`);

        // 2. Delegate to the Intelligence Brain
        return await diagnosisBrain.analyze(
            server, 
            Array.from(this.rules.values()), 
            recentLogs, 
            env, 
            crashReport || undefined
        );
    }
}

export const diagnosisService = new DiagnosisService();
