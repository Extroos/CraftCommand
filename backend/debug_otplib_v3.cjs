const { generateSecret, verify, totp } = require('otplib');

(async () => {
    const secret = generateSecret();
    const token = totp.generate(secret);

    const promise = verify({ token, secret });
    console.log('Type of raw return:', typeof promise);
    
    const resolved = await promise;
    console.log('Type of resolved return:', typeof resolved);
    console.log('Value of resolved return:', resolved);
})();
