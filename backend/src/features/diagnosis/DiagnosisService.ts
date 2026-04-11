import path from 'path';
import { DiagnosisRule, SystemStats, ServerConfig, DiagnosisResult } from './types';
import { getCoreRules } from './DiagnosisRules';
import { JavaRules } from './JavaDiagnosisRules';
import { VelocityRules } from './VelocityDiagnosisRules';
import { NodeRules } from './NodeDiagnosisRules';
import { FabricIntegrityRules } from './FabricIntegrityRules';
import { logger } from '../../utils/logger';
import { CrashReportReader } from './CrashReportReader';
import { issueAnalyzer } from './IssueAnalyzer';
import si from 'systeminformation';

/**
 * DiagnosisService
 * Aggregates system metrics and runs them through the analyzer rules.
 */
export class DiagnosisService {
    private rules: Map<string, DiagnosisRule> = new Map();
    private rulesInitialized = false;
    private cachedStats: SystemStats | null = null;
    private lastStatsFetch = 0;
    
    // v1.12.8: Track rules that have been "fixed" but might still appear in stale logs
    private resolvedRules: Map<string, Set<string>> = new Map();

    constructor() {
        // Rules are now lazirly initialized in getRules() to prevent circular dependency deadlocks
    }

    private initRules() {
        if (this.rulesInitialized) return;
        
        const allRules = [
            ...getCoreRules(),
            ...JavaRules,
            ...VelocityRules,
            ...NodeRules,
            ...FabricIntegrityRules
        ];
        allRules.forEach(rule => this.registerRule(rule));
        this.rulesInitialized = true;
    }

    private getRules(): DiagnosisRule[] {
        this.initRules();
        return Array.from(this.rules.values());
    }

    public registerRule(rule: DiagnosisRule) {
        this.rules.set(rule.id, rule);
    }

    /**
     * Shared System Observer: Fetches OS metrics at a throttled rate (5s)
     * to avoid CPU overhead during mass diagnosis scans.
     */
    /**
     * Shared System Observer: Fetches OS metrics at a throttled rate (5s)
     * v4.0 Context-Aware: Specifically targets the partition holding the server files.
     */
    private async getSystemContext(workingDir: string, forceRefresh = false): Promise<SystemStats> {
        const now = Date.now();
        const workingPath = workingDir || process.cwd();

        // We cache per-directory to be safe, but OS stats are shared
        if (!forceRefresh && this.cachedStats && (now - this.lastStatsFetch < 5000)) {
            return this.cachedStats;
        }

        try {
            const [mem, cpu, fs] = await Promise.all([
                si.mem(),
                si.currentLoad(),
                si.fsSize()
            ]);

            // v4.0 Resilience: Intelligent Partition Matching
            // Resolve the specific partition for the working directory
            const normalizedPath = path.resolve(workingPath).toLowerCase();
            const withTrailing = (p: string) => p.endsWith(path.sep) ? p : p + path.sep;
            const targetPath = withTrailing(normalizedPath);
            
            // Sort mounts from longest to shortest path to match most specific mount point first
            const sortedFs = fs.sort((a, b) => b.mount.length - a.mount.length);
            
            let targetFs = sortedFs.find(f => {
                const mount = f.mount.toLowerCase();
                const mountWithTrailing = withTrailing(mount);
                // Match exact mount or check if path is within mount
                return targetPath.startsWith(mountWithTrailing) || targetPath === mountWithTrailing;
            });

            // Windows Drive Match: 'c:' should match 'c:\...'
            if (!targetFs && process.platform === 'win32' && normalizedPath.includes(':')) {
                const drive = normalizedPath.split(':')[0] + ':';
                targetFs = fs.find(f => f.mount.toLowerCase() === drive.toLowerCase());
            }

            // Fallback 1: If no path match, find the disk with the MOST free space (prioritize success)
            if (!targetFs) {
                targetFs = fs.sort((a, b) => b.available - a.available)[0];
            }

            // Fallback 2: Minimal fallback
            const finalFs = targetFs || { size: 0, available: 0, mount: 'Unknown' };
            
            logger.debug(`[DiagnosisService] Target: ${normalizedPath} | Disk Selected: ${finalFs.mount} (${Math.round(finalFs.available / 1024 / 1024 / 1024)}GB free)`);

            this.cachedStats = {
                cpuUsage: cpu.currentLoad,
                memoryUsed: (mem.total - mem.available) / 1024 / 1024, // MB
                memoryTotal: mem.total / 1024 / 1024, // MB
                diskFree: finalFs.available / 1024 / 1024, // MB
                diskTotal: finalFs.size / 1024 / 1024, // MB
                timestamp: now
            };
            this.lastStatsFetch = now;
            return this.cachedStats;
        } catch (e) {
            return { timestamp: now };
        }
    }

    /**
     * Force invalidates the system stats cache.
     * Use before critical operations (like pre-flight checks).
     */
    public clearCache() {
        this.cachedStats = null;
        this.lastStatsFetch = 0;
        logger.debug('[DiagnosisService] System stats cache forced CLEAR.');
    }

    public async diagnose(server: ServerConfig, recentLogs: string[], forceRefresh = false): Promise<DiagnosisResult[]> {
        const filteredLogs = this.filterSpam(recentLogs);
        
        // 1. Get Shared Context (Force refresh if requested)
        const env = await this.getSystemContext(server.workingDirectory, forceRefresh);
        
        // 2. Fetch crash report if needed
        const crashReport = await CrashReportReader.getRecentCrashReport(server.workingDirectory, server.status);
        
        // 3. Delegate to Analysis Engine with shared context
        const resolved = this.resolvedRules.get(server.id) || new Set<string>();
        
        return await issueAnalyzer.analyze(
            server, 
            this.getRules(), 
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
        
        // --- SMART LOG CLIPPING (v4.5) ---
        // Look for the [FIX] marker appended by DiagnosisActions. 
        // If found, we only consider logs AFTER the last fix to prevent stale detections.
        let clippedLogs = logs;
        const lastFixIndex = logs.map(l => l.includes('[CraftCommand] [FIX]')).lastIndexOf(true);
        if (lastFixIndex !== -1) {
            clippedLogs = logs.slice(lastFixIndex + 1);
            logger.debug(`[DiagnosisService] Clipping ${lastFixIndex + 1} stale log lines due to recognized FIX marker.`);
        }

        const MAX_LINES = 1000;
        const processed: string[] = [];
        let lastLine = '';
        let repeatCount = 0;

        const recentSubset = clippedLogs.length > MAX_LINES ? clippedLogs.slice(-MAX_LINES) : clippedLogs;

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
