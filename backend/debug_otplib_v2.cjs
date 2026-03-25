const { generateSecret, verify, totp } = require('otplib');

(async () => {
    const secret = generateSecret();
    console.log('Generated Secret:', secret);

    // Let's generate a valid token to test verification
    const token = totp.generate(secret);
    console.log('Generated Token for now:', token);

    console.log('--- Testing verify() ---');
    const result = await verify({ token, secret });
    console.log('Resolved verify() value:', JSON.stringify(result));
    
    console.log('--- Testing verify() with 1-hour offset ---');
    // Simulate a code from 1 hour ago
    const oldToken = totp.generate(secret, { epoch: Math.floor(Date.now() / 1000) - 3600 });
    const resultOld = await verify({ token: oldToken, secret, epochTolerance: 125 });
    console.log('Resolved verify(old) value:', JSON.stringify(resultOld));
    
    // Check if it's a boolean or an object
    if (typeof result === 'boolean') {
        console.log('RESULT IS BOOLEAN');
    } else if (result && typeof result === 'object') {
        console.log('RESULT IS OBJECT');
    }
})();
