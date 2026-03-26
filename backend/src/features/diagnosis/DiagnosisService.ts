import { DiagnosisRule, SystemStats, ServerConfig, DiagnosisResult } from './types';
import { CoreRules } from './DiagnosisRules';
import { logger } from '../../utils/logger';
import { CrashReportReader } from './CrashReportReader';
import { diagnosisBrain } from './DiagnosisBrain';
import si from 'systeminformation';

/**
 * DiagnosisService (Professional Scale)
 * Features a Shared System Observer that fetches OS-level stats once per cycle 
 * instead of letting each rule call SI independently.
 */
export class DiagnosisService {
    private rules: Map<string, DiagnosisRule> = new Map();
    private cachedStats: SystemStats | null = null;
    private lastStatsFetch = 0;
    
    // v1.12.8: Track rules that have been "fixed" but might still appear in stale logs
    private resolvedRules: Map<string, Set<string>> = new Map();

    constructor() {
        CoreRules.forEach(rule => this.registerRule(rule));
    }

    public registerRule(rule: DiagnosisRule) {
        this.rules.set(rule.id, rule);
    }

    /**
     * Shared System Observer: Fetches OS metrics at a throttled rate (5s)
     * to avoid CPU overhead during mass diagnosis scans.
     */
    private async getSystemContext(workingDir: string): Promise<SystemStats> {
        const now = Date.now();
        if (this.cachedStats && (now - this.lastStatsFetch < 5000)) {
            return this.cachedStats;
        }

        try {
            // Using systeminformation for disk instead of diskusage to avoid native dependency issues
            const [mem, cpu, fs] = await Promise.all([
                si.mem(),
                si.currentLoad(),
                si.fsSize()
            ]);

            // Find the best matching partition for the working directory
            const mainFs = fs[0] || { size: 0, available: 0 };

            this.cachedStats = {
                cpuUsage: cpu.currentLoad,
                memoryUsed: (mem.total - mem.available) / 1024 / 1024, // MB
                memoryTotal: mem.total / 1024 / 1024, // MB
                diskFree: mainFs.available / 1024 / 1024, // MB
                diskTotal: mainFs.size / 1024 / 1024, // MB
                timestamp: now
            };
            this.lastStatsFetch = now;
            return this.cachedStats;
        } catch (e) {
            // Fallback for failed SI
            return { timestamp: now };
        }
    }

    public async diagnose(server: ServerConfig, recentLogs: string[]): Promise<DiagnosisResult[]> {
        const filteredLogs = this.filterSpam(recentLogs);
        
        // 1. Get Shared Context (Single OS call instead of 80+)
        const env = await this.getSystemContext(server.workingDirectory);
        
        // 2. Fetch crash report if needed
        const crashReport = await CrashReportReader.getRecentCrashReport(server.workingDirectory, server.status);
        
        // 3. Delegate to Intelligence Brain with shared context
        const resolved = this.resolvedRules.get(server.id) || new Set<string>();
        
        return await diagnosisBrain.analyze(
            server, 
            Array.from(this.rules.values()), 
            filteredLogs, 
            env, 
            crashReport || undefined,
            resolved
        );
    }

    /**
     * v1.12.8: Marks a rule as resolved for a specific server.
     * This prevents it from re-triggering on stale logs until the next boot check.
     */
    public markResolved(serverId: string, ruleId: string) {
        if (!this.resolvedRules.has(serverId)) {
            this.resolvedRules.set(serverId, new Set());
        }
        this.resolvedRules.get(serverId)!.add(ruleId);
        logger.info(`[DiagnosisService] Rule ${ruleId} marked as RESOLVED for ${serverId}. Suppressing until next boot.`);
    }

    /**
     * v1.12.8: Clears all resolved suppression (e.g. on server start/stop)
     */
    public clearResolved(serverId: string) {
        this.resolvedRules.delete(serverId);
    }

    private filterSpam(logs: string[]): string[] {
        if (logs.length === 0) return [];
        const MAX_LINES = 1000;
        const processed: string[] = [];
        let lastLine = '';
        let repeatCount = 0;

        const recentSubset = logs.length > MAX_LINES ? logs.slice(-MAX_LINES) : logs;

        for (const rawLine of recentSubset) {
            const line = rawLine.trim();
            if (line === lastLine) {
                repeatCount++;
            } else {
                if (repeatCount > 0) {
                    processed[processed.length - 1] = `${lastLine} (repeated ${repeatCount + 1} times)`;
                }
                processed.push(line);
                lastLine = line;
                repeatCount = 0;
            }
        }

        if (repeatCount > 0) {
            processed[processed.length - 1] = `${lastLine} (repeated ${repeatCount + 1} times)`;
        }

        return processed;
    }
}

export const diagnosisService = new DiagnosisService();
