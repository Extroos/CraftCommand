
import { issueAnalyzer } from './features/diagnosis/IssueAnalyzer';
import { DiagnosisResult, ServerConfig, SystemStats } from './features/diagnosis/types';

async function testCausality() {
    process.stdout.write('--- STARTING V4 CAUSALITY TEST ---\n');
    
    // Mock Results: Java is missing (Root Cause) AND a Plugin fails to load (Symptom)
    const mockResults: DiagnosisResult[] = [
        {
            id: 'rule-java-fail',
            ruleId: 'java_binary_missing',
            severity: 'CRITICAL',
            title: 'Java Runtime Missing',
            explanation: 'Java binary not found on the system.',
            recommendation: 'Install Java.',
            timestamp: Date.now(),
            confidence: 100
        },
        {
            id: 'rule-plugin-fail',
            ruleId: 'plugin_incompatible',
            severity: 'WARNING',
            title: 'Plugin Failed to Load',
            explanation: 'WorldGuard failed to initialize.',
            recommendation: 'Check plugin version.',
            timestamp: Date.now(),
            confidence: 90
        }
    ];

    process.stdout.write('Test Scenario 1: Java Binary Missing -> Plugin Failure\n');
    
    // Test the processRootCauses logic directly
    const processed = (issueAnalyzer as any).processRootCauses(mockResults, true);

    const root = processed.find((r: any) => r.ruleId === 'java_binary_missing');
    const symptom = processed.find((r: any) => r.ruleId === 'plugin_incompatible');

    process.stdout.write(`Root Cause Identified: ${root?.isRootCause ? 'PASS' : 'FAIL'}\n`);
    process.stdout.write(`Symptom Suppressed: ${symptom?.suppressedBy?.includes('java_binary_missing') ? 'PASS' : 'FAIL'}\n`);
    process.stdout.write(`Explanation Linked: ${symptom?.explanation.includes('likely occurred because of') ? 'PASS' : 'FAIL'}\n`);
    
    if (symptom?.explanation.includes('likely occurred because of')) {
        process.stdout.write(`Explanation Snippet: ${symptom.explanation.split('\n')[1]}\n`);
    }

    // Scenario 2: Disk Full -> Data Corruption
    const mockResults2: DiagnosisResult[] = [
        {
            id: 'rule-disk-full',
            ruleId: 'disk_space_full',
            severity: 'CRITICAL',
            title: 'Disk Space Exhausted',
            explanation: '0MB remaining on drive C:',
            recommendation: 'Clear space.',
            timestamp: Date.now(),
            confidence: 100
        },
        {
            id: 'rule-corrupt',
            ruleId: 'world_corruption',
            severity: 'CRITICAL',
            title: 'Corrupted Region File',
            explanation: 'Region r.0.0.mca is truncated.',
            recommendation: 'Restore backup.',
            timestamp: Date.now(),
            confidence: 95
        }
    ];

    process.stdout.write('\nTest Scenario 2: Disk Space Full -> World Corruption\n');
    const processed2 = (issueAnalyzer as any).processRootCauses(mockResults2, true);
    const root2 = processed2.find((r: any) => r.ruleId === 'disk_space_full');
    const symptom2 = processed2.find((r: any) => r.ruleId === 'world_corruption');

    process.stdout.write(`Root Cause Identified: ${root2?.isRootCause ? 'PASS' : 'FAIL'}\n`);
    process.stdout.write(`Symptom Linked: ${symptom2?.linkedIssueId === 'disk_space_full' ? 'PASS' : 'FAIL'}\n`);
}

testCausality().catch(err => {
    console.error(err);
    process.exit(1);
});
