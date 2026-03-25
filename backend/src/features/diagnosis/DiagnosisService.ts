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
        // 1. Log Spam Protection: Truncate and collapse repetitive lines
        const filteredLogs = this.filterSpam(recentLogs);
        
        // 2. Fetch deep crash report if available (State-aware relevance)
        const crashReport = await CrashReportReader.getRecentCrashReport(server.workingDirectory, server.status);
        
        console.log(`[DiagnosisService] Analyzing server ${server.id} with ${this.rules.size} rules and ${filteredLogs.length} filtered log lines...`);

        // 3. Delegate to the Intelligence Brain
        return await diagnosisBrain.analyze(
            server, 
            Array.from(this.rules.values()), 
            filteredLogs, 
            env, 
            crashReport || undefined
        );
    }

    /**
     * Collapses consecutive identical log lines and limits the total count to prevent
     * event loop starvation during log spam events (e.g. Bedrock "attack_interval").
     */
    private filterSpam(logs: string[]): string[] {
        if (logs.length === 0) return [];

        const MAX_LINES = 2000;
        const processed: string[] = [];
        let lastLine = '';
        let repeatCount = 0;

        // Take last N lines for analysis, but prioritize lines containing "Exception" or "Error" 
        // if the buffer is larger than MAX_LINES.
        const recentSubset = logs.length > MAX_LINES ? logs.slice(-MAX_LINES) : logs;

        for (const rawLine of recentSubset) {
            const line = rawLine.trim();
            if (line === lastLine) {
                repeatCount++;
            } else {
                if (repeatCount > 0) {
                    // Update the last entry with the repeat count
                    processed[processed.length - 1] = `${lastLine} (repeated ${repeatCount + 1} times)`;
                }
                processed.push(line);
                lastLine = line;
                repeatCount = 0;
            }
        }

        // Handle final repeat
        if (repeatCount > 0) {
            processed[processed.length - 1] = `${lastLine} (repeated ${repeatCount + 1} times)`;
        }

        return processed;
    }
}

export const diagnosisService = new DiagnosisService();
