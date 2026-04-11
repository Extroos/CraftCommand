import { ServerConfig, ServerStatus, DiagnosisResult } from '@shared/types';
import { issueAnalyzer } from '../diagnosis/IssueAnalyzer';
import { diagnosisService } from '../diagnosis/DiagnosisService';
import { logger } from '../../utils/logger';
import { SystemError, ErrorCode } from '../../utils/ErrorCodes';

/**
 * PreFlightService
 * 
 * Central orchestrator for proactive server health checks.
 * Integrates directly with the Diagnosis engine to perform "Tier 1"
 * environment validation before any child process is spawned.
 * 
 * Target: Fulfill the "Intelligent Mod Stabilization" and "System Diagnostics" 
 * claims with proactive, synchronous validation.
 */
class PreFlightService {

    /**
     * Executes a suite of synchronous health checks.
     * Throws a SystemError if a CRITICAL issue is detected.
     */
    public async validate(server: ServerConfig): Promise<DiagnosisResult[]> {
        logger.info(`[PreFlight] Initiating validation for ${server.name} (${server.id})...`);

        // 1. Reset any previous suppression AND clear stats cache for this server
        diagnosisService.clearResolved(server.id);
        diagnosisService.clearCache();

        // 2. Perform Targeted Diagnosis (Tier 1 & 2 Proactive Rules)
        // v4.0 Resilience: forceRefresh=true ensures we don't use stale disk stats
        const results = await diagnosisService.diagnose(server, [], true);

        // 3. Evaluate results for blockers
        const blockers = results.filter(r => r.severity === 'CRITICAL' && r.isRepairable !== false);
        const warnings = results.filter(r => r.severity === 'WARNING');

        if (warnings.length > 0) {
            warnings.forEach(w => logger.warn(`[PreFlight] Advisory: ${w.title} - ${w.explanation}`));
        }

        if (blockers.length > 0) {
            const primary = blockers[0];
            logger.error(`[PreFlight] ✗ Validation FAILED: ${primary.title} - ${primary.explanation}`);
            
            // Map the diagnosis result to a user-facing system error
            throw new SystemError(
                ErrorCode.E_PROC_PREFLIGHT_FAIL, 
                `Pre-flight check failed: ${primary.title}. ${primary.explanation} Recommendation: ${primary.recommendation}`,
                { diagnosis: primary }
            );
        }

        logger.info(`[PreFlight] ✓ Validation passed for ${server.name}. Environment is stable.`);
        return results;
    }

    /**
     * Helper to check if a specific rule should be enforced during pre-flight.
     */
    public isEnforceable(ruleId: string): boolean {
        const preFlightRules = [
            'port_binding',
            'java_version',
            'eula_not_accepted',
            'missing_directory',
            'insufficient_ram',
            'missing_jar',
            'low_disk_space',
            'invalid_ip',
            'incompatible_mods'
        ];
        return preFlightRules.includes(ruleId);
    }
}

export const preFlightService = new PreFlightService();
