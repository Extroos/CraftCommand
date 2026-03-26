import { JavaVersionRule } from '../features/diagnosis/DiagnosisRules';
import { ServerStatus } from '@shared/types';

async function testIsolated() {
    console.log('[Test] Starting Isolated Java Diagnosis Test...');

    const mockServer: any = {
        id: 'test-purpur-java',
        software: 'Purpur',
        version: '1.21.11',
        javaVersion: 'Java 17',
        status: ServerStatus.OFFLINE
    };

    const mockLogs = [
        "Exception in thread \"ServerMain\" java.lang.UnsupportedClassVersionError: org/bukkit/craftbukkit/Main has been compiled by a more recent version of the Java Runtime (class file version 65.0), this version of the Java Runtime only recognizes class file versions up to 61.0"
    ];

    const mockStats: any = {
        javaVersion: 'Java 17'
    };

    const result = await JavaVersionRule.analyze(mockServer, mockLogs, mockStats);

    if (result && result.action?.payload.version === 'Java 21') {
        console.log('[Success] Correctly identified Java 21 requirement from logs!');
        console.log(`Title: ${result.title}`);
        console.log(`Explanation: ${result.explanation}`);
    } else {
        console.error('[Failure] Isolation test failed to identify Java 21');
        console.log('Result:', JSON.stringify(result, null, 2));
    }
}

testIsolated();
