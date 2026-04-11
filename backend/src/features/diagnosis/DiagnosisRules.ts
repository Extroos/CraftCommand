import { DiagnosisRule } from './types';
import { UpdateRules } from './UpdateDiagnosisRules';
import { PluginRules } from './PluginDiagnosisRules';
import { BedrockRules } from './BedrockDiagnosisRules';
import { VelocityRules } from './VelocityDiagnosisRules';
import { NetworkRules } from './NetworkDiagnosisRules';
import { NodeRules } from './NodeDiagnosisRules';
import { JavaRules } from './JavaDiagnosisRules';
import { ModDiagnosisRules } from './ModDiagnosisRules';
import { CrossPlayRules } from './CrossPlayDiagnosisRules';
import { MapRules } from './MapDiagnosisRules';
import { getPredictiveRules } from './PredictiveDiagnosisRules';
import { ResourceAdvisorRules } from './ResourceAdvisorRules';
import { ConnectivityRules } from './ConnectivityDiagnosisRules';
import { HostingOSRules } from './HostingOSDiagnosisRules';
import { getPerformanceRules } from './PerformanceDiagnosisRules';

/**
 * ╔══════════════════════════════════════════════════════╗
 * ║      CORE DIAGNOSIS REGISTRY                         ║
 * ║  Aggregates all domain-specific detection rules.      ║
 * ╚══════════════════════════════════════════════════════╝
 */

export function getCoreRules(): DiagnosisRule[] {
    return [
        ...UpdateRules,
        ...PluginRules,
        ...BedrockRules,
        ...VelocityRules,
        ...NetworkRules,
        ...NodeRules,
        ...JavaRules,
        ...ModDiagnosisRules,
        ...CrossPlayRules,
        ...MapRules,
        ...getPredictiveRules(),
        ...ResourceAdvisorRules,
        ...ConnectivityRules,
        ...HostingOSRules,
        ...getPerformanceRules()
    ];
}
