import { DiagnosisRule, SystemStats, ServerConfig, DiagnosisResult } from './types';
import { CrashReport } from './CrashReportReader';
import { getCoreRules } from './DiagnosisRules';
import { logger } from '../../utils/logger';
import { ServerStatus } from '@shared/types';

interface CooldownEntry {
    lastTriggered: number;
    ruleId: string;
}

/** Internal type that extends DiagnosisResult with tier metadata for processing */
interface InternalDiagnosisResult extends DiagnosisResult {
    _tier: number;
}

export class IssueAnalyzer {
    // serverId -> ruleId -> lastTriggered
    private cooldowns: Map<string, Map<string, number>> = new Map();
    /**
     * Executes the diagnosis pipeline with tiered analysis
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

        // Filter out rules that have been marked as resolved by a previous fix (Stop Spam)
        const activeTier1 = tier1.filter(r => !resolvedRules?.has(r.id));
        const activeTier2 = tier2.filter(r => !resolvedRules?.has(r.id));
        
        // Anti-Spam: Filter Tier 3 rules based on cooldowns
        const activeTier3 = tier3.filter(r => {
            if (resolvedRules?.has(r.id)) return false;
            
            if (r.cooldownHours) {
                const serverCooldowns = this.getCooldownMap(server.id);
                const lastRun = serverCooldowns.get(r.id) || 0;
                const hoursSinceLast = (Date.now() - lastRun) / (1000 * 60 * 60);
                
                if (hoursSinceLast < r.cooldownHours) {
                    // logger.debug(`[IssueAnalyzer] Skipping ${r.id} due to cooldown (${hoursSinceLast.toFixed(1)}h / ${r.cooldownHours}h)`);
                    return false;
                }
            }
            return true;
        });

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
                    // logger.debug(`[IssueAnalyzer] Analyzing rule ${rule.id} for ${server.id}`);
                    const result = await rule.analyze(server, logs, env, crashReport);
                    if (result) {
                        // Attach tier metadata for processing
                        const internal: InternalDiagnosisResult = { ...result, _tier: rule.tier };
                        
                        // If we have BOTH a log match and a crash report match, confidence is absolute
                        if ((hasLogMatch || isExplicitlyProactive) && hasCrashMatch) {
                            internal.confidence = 100;
                            internal.severity = 'CRITICAL';
                        } else if (internal.confidence === undefined) {
                            internal.confidence = rule.defaultConfidence;
                        }

                        results.push(internal);

                        // Record cooldown for optimization/advisory rules (Tier 3)
                        if (rule.tier === 3 && rule.cooldownHours) {
                            this.updateCooldown(server.id, rule.id);
                        }
                    }
                }
            } catch (e: any) {
                logger.error(`[IssueAnalyzer] Rule ${rule.id} failed: ${e.message}`);
            }
        }
        return results;
    }

    private getCooldownMap(serverId: string): Map<string, number> {
        if (!this.cooldowns.has(serverId)) {
            this.cooldowns.set(serverId, new Map());
        }
        return this.cooldowns.get(serverId)!;
    }

    private updateCooldown(serverId: string, ruleId: string) {
        const serverMap = this.getCooldownMap(serverId);
        serverMap.set(ruleId, Date.now());
    }

    /**
     * Identifies the primary issue and suppresses secondary symptoms
     */
    private processRootCauses(results: DiagnosisResult[], infraIssueDetected: boolean): DiagnosisResult[] {
        if (results.length <= 1) {
            if (results.length === 1) results[0].isRootCause = true;
            return results;
        }

        // Sequential causality check will be handled in performInference
        results.forEach(r => {
            r.suppressedBy = [];
            r.isRootCause = false;
        });

        // 2. Sort by tier first, then confidence
        // Tier 1 (Infrastructure) is the "highest" priority root cause
        const sorted = [...results].sort((a, b) => {
            const tierA = (a as InternalDiagnosisResult)._tier || 3;
            const tierB = (b as InternalDiagnosisResult)._tier || 3;
            
            if (tierA !== tierB) return tierA - tierB;
            return (b.confidence || 0) - (a.confidence || 0);
        });

        // 2. Perform Dynamic Inference
        this.inferCausality(sorted);

        // 3. Set primary root cause (first unsuppressed or highest confidence Tier 1)
        const primaryRoot = sorted.find(r => !r.suppressedBy || r.suppressedBy.length === 0) || sorted[0];
        primaryRoot.isRootCause = true;

        // 4. Cleanup internal metadata and apply linking explanations
        sorted.forEach(r => {
            delete (r as any)._tier;
            if (r.linkedIssueId && r !== primaryRoot) {
                const cause = sorted.find(src => src.ruleId === r.linkedIssueId);
                if (cause) {
                    r.explanation = `[Symptom] ${r.explanation}\n(Note: This likely occurred because of: ${cause.title})`;
                }
            }
        });

        return sorted;
    }

    /**
     * Dynamically links symptoms to root causes based on knowledge-weighted relationships
     */
    private inferCausality(results: DiagnosisResult[]) {
        const causalityMap: Record<string, { effects: string[], weight: number }> = {
            'insufficient_ram': { effects: ['memory_oom', 'tps_lag', 'cpu_exhaustion', 'watchdog_stunt'], weight: 0.9 },
            'memory_oom': { effects: ['tps_lag', 'watchdog_stunt'], weight: 0.95 },
            'disk_space_full': { effects: ['data_integrity', 'world_corruption', 'bad_config', 'permission_denied'], weight: 0.85 },
            'java_version': { effects: ['mod_dependency', 'plugin_incompatible', 'mixin_conflict', 'startup_failure'], weight: 0.9 },
            'java_binary_missing': { effects: ['startup_failure', 'process_exit_immediate', 'plugin_incompatible'], weight: 1.0 },
            'missing_jar': { effects: ['startup_failure', 'process_exit_immediate', 'java_version', 'bad_config'], weight: 1.0 },
            'invalid_ip': { effects: ['port_binding_failed', 'network_offline'], weight: 0.95 },
            'eula_not_accepted': { effects: ['startup_failure', 'process_exit_immediate'], weight: 1.0 }
        };

        results.forEach(root => {
            const relationship = causalityMap[root.ruleId];
            if (relationship) {
                results.forEach(symptom => {
                    if (relationship.effects.includes(symptom.ruleId)) {
                        // Suppress the symptom
                        if (!symptom.suppressedBy) symptom.suppressedBy = [];
                        if (!symptom.suppressedBy.includes(root.ruleId)) {
                            symptom.suppressedBy.push(root.ruleId);
                        }
                        
                        // Link the symptom to the root cause for UI/Explanation
                        symptom.linkedIssueId = root.ruleId;
                        symptom.causalWeight = relationship.weight;
                    }
                });
            }
        });
    }
}

export const issueAnalyzer = new IssueAnalyzer();
