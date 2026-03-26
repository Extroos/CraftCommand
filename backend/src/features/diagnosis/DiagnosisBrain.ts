import { DiagnosisRule, SystemStats, ServerConfig, DiagnosisResult } from './types';
import { CrashReport } from './CrashReportReader';
import { CoreRules } from './DiagnosisRules';
import { logger } from '../../utils/logger';
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
        crashReport?: CrashReport,
        resolvedRules?: Set<string>
    ): Promise<DiagnosisResult[]> {
        const rawResults: DiagnosisResult[] = [];
        
        // 1. Group rules by tier and sort
        const tier1 = rules.filter(r => r.tier === 1);
        const tier2 = rules.filter(r => r.tier === 2);
        const tier3 = rules.filter(r => r.tier === 3);

        // v1.12.8: Filter out rules that have been marked as resolved by a previous fix (Stop Spam)
        const activeTier1 = tier1.filter(r => !resolvedRules?.has(r.id));
        const activeTier2 = tier2.filter(r => !resolvedRules?.has(r.id));
        const activeTier3 = tier3.filter(r => !resolvedRules?.has(r.id));

        // 2. Execute Tiers Sequentially
        const t1Results = await this.runTier(server, activeTier1, logs, env, crashReport);
        rawResults.push(...t1Results);

        const hasCriticalT1 = t1Results.some(r => r.severity === 'CRITICAL' && r.confidence > 90);

        const t2Results = await this.runTier(server, activeTier2, logs, env, crashReport);
        rawResults.push(...t2Results);

        const t3Results = await this.runTier(server, activeTier3, logs, env, crashReport);
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
                    // console.log(`[DiagnosisBrain] Analyzing rule ${rule.id} for ${server.id} (status: ${server.status}, hasStarted: ${server.hasStarted})`);
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
            'java_version': ['mod_dependency', 'plugin_incompatible', 'mixin_conflict', 'plugin_access_denied', 'java_binary_missing', 'startup_failure', 'process_exit_immediate'],
            'java_binary_missing': ['startup_failure', 'process_exit_immediate'],
            'missing_jar': ['java_version', 'bad_config', 'startup_failure', 'process_exit_immediate'],
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
