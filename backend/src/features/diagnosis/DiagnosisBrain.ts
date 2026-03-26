import { DiagnosisRule, SystemStats, ServerConfig, DiagnosisResult } from './types';
import { CrashReport } from './CrashReportReader';
import { ServerStatus } from '@shared/types';

/** Internal type that extends DiagnosisResult with tier metadata for brain processing */
interface InternalDiagnosisResult extends DiagnosisResult {
    _tier: number;
}

export class DiagnosisBrain {
    /**
     * Executes the diagnosis pipeline with tiered inference
     */
    public async analyze(
        server: ServerConfig,
        rules: DiagnosisRule[],
        logs: string[],
        env: SystemStats,
        crashReport?: CrashReport
    ): Promise<DiagnosisResult[]> {
        const rawResults: DiagnosisResult[] = [];
        
        // 1. Group rules by tier and sort
        const tier1 = rules.filter(r => r.tier === 1);
        const tier2 = rules.filter(r => r.tier === 2);
        const tier3 = rules.filter(r => r.tier === 3);

        console.log(`[DiagnosisBrain] Starting pipeline: T1(${tier1.length}), T2(${tier2.length}), T3(${tier3.length})`);

        // 2. Execute Tiers Sequentially
        // Logic: If Tier 1 (Infrastructure) find a critical issue, 
        // it likely causes Tier 2/3 issues.
        
        const t1Results = await this.runTier(server, tier1, logs, env, crashReport);
        rawResults.push(...t1Results);

        // If we have a very high confidence Tier 1 issue (e.g. Java missing or No Disk Space),
        // we might skip or de-prioritize later tiers because they are symptoms.
        const hasCriticalT1 = t1Results.some(r => r.severity === 'CRITICAL' && r.confidence > 90);

        const t2Results = await this.runTier(server, tier2, logs, env, crashReport);
        rawResults.push(...t2Results);

        const t3Results = await this.runTier(server, tier3, logs, env, crashReport);
        rawResults.push(...t3Results);

        // 3. Post-Process: Root Cause Analysis (RCA)
        return this.processRootCauses(rawResults, hasCriticalT1);
    }

    private async runTier(
        server: ServerConfig,
        rules: DiagnosisRule[],
        logs: string[],
        env: SystemStats,
        crashReport?: CrashReport
    ): Promise<DiagnosisResult[]> {
        const results: InternalDiagnosisResult[] = [];
        const logContent = logs.join('\n');
        const crashContent = crashReport?.content || '';

        for (const rule of rules) {
            try {
                // Quick trigger check
                const hasLogMatch = rule.triggers.some(t => t.test(logContent));
                const hasCrashMatch = crashReport && rule.triggers.some(t => t.test(crashContent));
                
                // Tier 1 & 2 logic: Allow proactive check if server is NOT online (pre-flight, configuration check, or filesystem monitor)
                const isProactiveNeeded = (rule.tier <= 2) && (server.status !== ServerStatus.ONLINE);
                const isExplicitlyProactive = rule.triggers.length === 0;

                if (hasLogMatch || hasCrashMatch || isExplicitlyProactive || isProactiveNeeded) {
                    const result = await rule.analyze(server, logs, env, crashReport);
                    if (result) {
                        // Attach tier metadata for brain processing
                        const internal: InternalDiagnosisResult = { ...result, _tier: rule.tier };
                        
                        // BRAIN BOOST: If we have BOTH a log match and a crash report match, confidence is absolute
                        if ((hasLogMatch || isExplicitlyProactive) && hasCrashMatch) {
                            internal.confidence = 100;
                            internal.severity = 'CRITICAL';
                        } else if (internal.confidence === undefined) {
                            internal.confidence = rule.defaultConfidence;
                        }

                        results.push(internal);
                    }
                }
            } catch (e) {
                console.error(`[DiagnosisBrain] Rule ${rule.id} failed:`, e);
            }
        }
        return results;
    }

    /**
     * Identifies the primary issue and suppresses secondary symptoms
     */
    private processRootCauses(results: DiagnosisResult[], infraIssueDetected: boolean): DiagnosisResult[] {
        if (results.length <= 1) {
            if (results.length === 1) results[0].isRootCause = true;
            return results;
        }

        // 1. Causality-Based Suppression (Knowledge-Driven)
        // Rule A -> causes Rule B
        const causalityMap: Record<string, string[]> = {
            'insufficient_ram': ['memory_oom', 'tps_lag', 'cpu_exhaustion', 'watchdog_stunt', 'node_resource_starvation'],
            'memory_oom': ['tps_lag', 'watchdog_stunt'],
            'disk_space_full': ['data_integrity', 'world_corruption', 'telemetry_cleanup', 'bad_config', 'permission_denied', 'dynmap_storage_full'],
            'java_version': ['mod_dependency', 'plugin_incompatible', 'mixin_conflict', 'plugin_access_denied', 'java_binary_missing'],
            'java_binary_missing': ['startup_failure', 'process_exit_immediate'],
            'missing_jar': ['java_version', 'bad_config', 'startup_failure'],
            'invalid_ip': ['network_offline', 'port_binding_failed'],
            'eula_not_accepted': ['startup_failure', 'process_exit_immediate'],
            'node_resource_starvation': ['tps_lag', 'network_latency', 'heartbeat_missed']
        };

        // Suppress known effects
        results.forEach(root => {
            const effects = causalityMap[root.ruleId];
            if (effects) {
                results.forEach(other => {
                    if (effects.includes(other.ruleId)) {
                        if (!other.suppressedBy) other.suppressedBy = [];
                        if (!other.suppressedBy.includes(root.ruleId)) {
                            other.suppressedBy.push(root.ruleId);
                        }
                    }
                });
            }
        });

        // 2. Sort by tier first, then confidence
        // Tier 1 (Infrastructure) is the "highest" priority root cause
        const sorted = [...results].sort((a, b) => {
            const tierA = (a as InternalDiagnosisResult)._tier || 3;
            const tierB = (b as InternalDiagnosisResult)._tier || 3;
            
            // If one is already suppressed by the other, they are ranked accordingly
            if (a.suppressedBy?.includes(b.ruleId)) return 1;
            if (b.suppressedBy?.includes(a.ruleId)) return -1;

            if (tierA !== tierB) return tierA - tierB;
            return (b.confidence || 0) - (a.confidence || 0);
        });

        const rootCause = sorted[0];
        rootCause.isRootCause = true;

        // Cleanup internal metadata before returning to callers
        sorted.forEach(r => delete (r as any)._tier);

        // 3. Infrastructure Suppression (Logic-Driven fallback)
        // If an infrastructure issue (Tier 1) exists, it suppresses related Tier 2/3 warnings
        if (infraIssueDetected && rootCause.confidence > 80) {
            results.forEach(r => {
                if (r !== rootCause && !r.isRootCause) {
                    if (!r.suppressedBy) r.suppressedBy = [];
                    if (!r.suppressedBy.includes(rootCause.ruleId)) {
                        r.suppressedBy.push(rootCause.ruleId);
                    }
                }
            });
        }

        return sorted;
    }
}

export const diagnosisBrain = new DiagnosisBrain();
