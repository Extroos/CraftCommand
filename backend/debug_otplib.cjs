const { generateSecret, generateURI, verify } = require('otplib');

const secret = generateSecret();
console.log('Generated Secret:', secret);
console.log('Secret Length:', secret.length);

const isBase32 = /^[A-Z2-7]+=*$/.test(secret);
console.log('Is Base32 format?', isBase32);

const otpauth = generateURI({ issuer: 'Test', label: 'user@example.com', secret });
console.log('OTPAuth URI:', otpauth);

// Simulation of 2FA verification
(async () => {
    const result = verify({ token: '123456', secret });
    console.log('Verify result type:', typeof result);
    if (result instanceof Promise) {
        console.log('Verify is ASYNC');
    } else {
        console.log('Verify is SYNC');
        console.log('Verify result value:', result);
    }
    
    // Check if we can pass window or epochTolerance
    try {
        const resultWithWindow = verify({ token: '123456', secret, window: 1 });
        console.log('Verify with window worked');
    } catch (e) {
        console.log('Verify with window failed:', e.message);
    }

    try {
        const resultWithTolerance = verify({ token: '123456', secret, epochTolerance: 1 });
        console.log('Verify with epochTolerance worked');
    } catch (e) {
        console.log('Verify with epochTolerance failed:', e.message);
    }
})();
