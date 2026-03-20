import { diagnosisService } from '../features/diagnosis/DiagnosisService';

async function testSpam() {
    console.log('--- Diagnosis Log Resilience Test ---');

    // 1. Create a massive spammy log array
    const spamLine = '[WARNING] attack_interval (999)';
    const originalLogs: string[] = [];
    
    // Add 3000 identical lines (exceeds MAX_LINES=2000)
    for (let i = 0; i < 3000; i++) {
        originalLogs.push(spamLine);
    }

    // 2. Access private filterSpam for testing if possible, or test via public diagnose
    // Since we want to verify the logic, we'll cast to any to reach the private method
    const filtered = (diagnosisService as any).filterSpam(originalLogs);

    console.log(`Original: ${originalLogs.length} lines`);
    console.log(`Filtered: ${filtered.length} lines`);
    console.log(`First Line: ${filtered[0]}`);

    const success = filtered.length === 1 && filtered[0].includes('repeated 2000 times');
    
    if (success) {
        console.log('✅ SUCCESS: Logic correctly truncated to 2000 lines and collapsed duplicates.');
    } else {
        console.log('❌ FAILURE: Unexpected filtering results.');
        console.log('Sample:', filtered);
    }

    // 3. Test mixed logs
    const mixedLogs = [
        '--- Start ---',
        'Error A',
        'Spam',
        'Spam',
        'Spam',
        'Error B',
        'End'
    ];
    const filteredMixed = (diagnosisService as any).filterSpam(mixedLogs);
    console.log('Mixed Result:', filteredMixed);
    
    const mixedSuccess = filteredMixed.length === 5 && filteredMixed[2] === 'Spam (repeated 3 times)';
    if (mixedSuccess) {
        console.log('✅ SUCCESS: Mixed log collapsing verified.');
    } else {
        console.log('❌ FAILURE: Mixed log filter failed.');
    }
}

testSpam();
