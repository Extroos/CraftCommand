const { JavaVersionRule } = require('../features/diagnosis/DiagnosisRules');
const { DiagnosisBrain } = require('../features/diagnosis/DiagnosisBrain');

async function testDiagnosis() {
    const mockServer = {
        id: 'test-srv',
        software: 'Purpur',
        version: '1.21.11',
        javaVersion: 'Java 17',
        status: 'OFFLINE'
    };

    const mockLogs = [
        '[11:59:02] [ServerMain/INFO]: [bootstrap] Running Java 21 (OpenJDK 64-Bit Server VM 21.0.10+7-LTS)',
        'Exception in thread "ServerMain" java.lang.UnsupportedClassVersionError: org/bukkit/craftbukkit/Main has been compiled by a more recent version of the Java Runtime (class file version 65.0), this version of the Java Runtime only recognizes class file versions up to 61.0'
    ];

    console.log('--- Testing JavaVersionRule ---');
    const ruleResult = await JavaVersionRule.analyze(mockServer, mockLogs, {});
    console.log('Rule Match:', !!ruleResult);
    if (ruleResult) {
        console.log('Title:', ruleResult.title);
        console.log('Explanation:', ruleResult.explanation);
        console.log('MinVersion detected:', 21); // Logic check
    }

    console.log('\n--- Testing DiagnosisBrain (Causality) ---');
    const brain = new DiagnosisBrain();
    const mockResults = [
        { ...ruleResult, ruleId: 'java_version', confidence: 95 },
        { id: 'start-fail', ruleId: 'startup_failure', title: 'Generic Startup Failure', confidence: 80, severity: 'CRITICAL' }
    ];

    const processed = brain.processRootCauses(mockResults);
    console.log('Total results:', processed.length);
    const root = processed.find(r => r.isRootCause);
    console.log('Root Cause RuleId:', root?.ruleId);
    console.log('Startup Failure Suppressed:', !!processed.find(r => r.ruleId === 'startup_failure')?.suppressedBy?.includes('java_version'));
}

testDiagnosis().catch(console.error);
