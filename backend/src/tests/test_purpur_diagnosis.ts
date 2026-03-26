import { JavaVersionRule } from '../features/diagnosis/DiagnosisRules';
import { ServerConfig, SystemStats } from '../features/diagnosis/types';
import { ServerStatus } from '@shared/types';

async function testJavaDiagnosis() {
    console.log('[Test] Starting Java Diagnosis Test for Purpur 1.21.11...');

    const mockServer = {
        id: 'test-purpur-java',
        name: 'Discovered: test-purpur-install',
        software: 'Purpur',
        version: '1.21.11',
        javaVersion: 'Java 17', // The incorrect version
        status: ServerStatus.OFFLINE,
        workingDirectory: '/mock/path',
        executable: 'server.jar',
        port: 25565,
        ip: '127.0.0.1',
        ram: 4,
        executionEngine: 'default',
        executionCommand: ''
    } as any as ServerConfig;

    const mockLogs = [
        "INFO Downloading mojang_1.21.11.jar",
        "INFO Applying patches",
        "INFO Starting org.bukkit.craftbukkit.Main",
        "INFO Exception in thread \"ServerMain\" java.lang.UnsupportedClassVersionError: org/bukkit/craftbukkit/Main has been compiled by a more recent version of the Java Runtime (class file version 65.0), this version of the Java Runtime only recognizes class file versions up to 61.0"
    ];

    const mockStats: SystemStats = {
        totalMemory: 16000,
        freeMemory: 12000,
        javaVersion: 'Java 17',
        cpu: 10,
        memoryUsed: 4000,
        memoryTotal: 16000
    };

    console.log('[Test] Running JavaVersionRule analysis...');
    const result = await JavaVersionRule.analyze(mockServer, mockLogs, mockStats);

    if (result) {
        console.log('[Success] Diagnosis Result Found:');
        console.log(` - Title: ${result.title}`);
        console.log(` - Severity: ${result.severity}`);
        console.log(` - Explanation: ${result.explanation}`);
        console.log(` - Recommended Action: ${result.action?.type} ${JSON.stringify(result.action?.payload)}`);
        
        if (result.action?.payload.version === 'Java 21') {
            console.log('[Final Success] Correctly identified Java 21 as the requirement!');
        } else {
            console.error(`[Failure] Expected Java 21 but got ${result.action?.payload.version}`);
        }
    } else {
        console.error('[Failure] No diagnosis result returned!');
    }
}

testJavaDiagnosis();
