/**
 * Standalone verification of the filterSpam algorithm (JS version)
 */
function filterSpam(logs) {
    if (logs.length === 0) return [];

    const MAX_LINES = 2000;
    const processed = [];
    let lastLine = '';
    let repeatCount = 0;

    // Take last N lines for analysis
    const recentSubset = logs.length > MAX_LINES ? logs.slice(-MAX_LINES) : logs;

    for (const rawLine of recentSubset) {
        const line = rawLine.trim();
        if (line === lastLine) {
            repeatCount++;
        } else {
            if (repeatCount > 0) {
                // Update the last entry with the repeat count
                processed[processed.length - 1] = `${lastLine} (repeated ${repeatCount + 1} times)`;
            }
            processed.push(line);
            lastLine = line;
            repeatCount = 0;
        }
    }

    // Handle final repeat
    if (repeatCount > 0) {
        processed[processed.length - 1] = `${lastLine} (repeated ${repeatCount + 1} times)`;
    }

    return processed;
}

function runTests() {
    console.log('--- Standalone filterSpam Tests ---');

    // Test 1: Simple repeats
    const logs1 = ['A', 'Spam', 'Spam', 'Spam', 'B'];
    const res1 = filterSpam(logs1);
    console.log('Test 1 (Mixed):', res1);
    const s1 = res1.length === 3 && res1[1] === 'Spam (repeated 3 times)';
    console.log(s1 ? '✅ PASS' : '❌ FAIL');

    // Test 2: Truncation + Large Repeat
    const logs2 = [];
    for (let i = 0; i < 3000; i++) logs2.push('Flood');
    const res2 = filterSpam(logs2);
    console.log('Test 2 (3000 lines):', res2.length, 'lines, content:', res2[0]);
    const s2 = res2.length === 1 && res2[0] === 'Flood (repeated 2000 times)';
    console.log(s2 ? '✅ PASS' : '❌ FAIL');

    // Test 3: No repeats
    const logs3 = ['1', '2', '3'];
    const res3 = filterSpam(logs3);
    console.log('Test 3 (Unique):', res3);
    const s3 = res3.length === 3 && res3[1] === '2';
    console.log(s3 ? '✅ PASS' : '❌ FAIL');

    // Test 4: Trailing repeat
    const logs4 = ['A', 'B', 'B'];
    const res4 = filterSpam(logs4);
    console.log('Test 4 (Trailing):', res4);
    const s4 = res4.length === 2 && res4[1] === 'B (repeated 2 times)';
    console.log(s4 ? '✅ PASS' : '❌ FAIL');
}

runTests();
