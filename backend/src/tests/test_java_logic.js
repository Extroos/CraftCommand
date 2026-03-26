// Pure logic test for JavaVersionRule matching
const logs = [
    "INFO Starting org.bukkit.craftbukkit.Main",
    "INFO Exception in thread \"ServerMain\" java.lang.UnsupportedClassVersionError: org/bukkit/craftbukkit/Main has been compiled by a more recent version of the Java Runtime (class file version 65.0), this version of the Java Runtime only recognizes class file versions up to 61.0"
];

const hasError = /unsupportedclassversionerror|compiled by a more recent version|unsupported java version|java \d+ is required/i.test(logs.join('\n'));
let requiredJava = 'Java 17';
let minVersion = 17;

const javaLogContent = logs.join('\n').toLowerCase();
if (javaLogContent.includes('class file version 65.0')) { requiredJava = 'Java 21'; minVersion = 21; }
else if (javaLogContent.includes('class file version 66.0')) { requiredJava = 'Java 22'; minVersion = 22; }
else if (javaLogContent.includes('class file version 61.0')) { requiredJava = 'Java 17'; minVersion = 17; }
else if (javaLogContent.includes('class file version 60.0')) { requiredJava = 'Java 16'; minVersion = 16; }

console.log('[Test] Log Error Detected:', hasError);
console.log('[Test] Identified Requirement:', requiredJava);
console.log('[Test] Min Version:', minVersion);

if (hasError && requiredJava === 'Java 21' && minVersion === 21) {
    console.log('[Success] Pure logic verification PASSED for Java 21 requirement.');
} else {
    console.error('[Failure] Logic verification FAILED.');
    process.exit(1);
}
