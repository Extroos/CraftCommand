const otplib = require('otplib');

(async () => {
    try {
        const secret = otplib.generateSecret();
        const token = '123456'; // Doesn't matter, just testing return type
        
        console.log('--- Testing verify() ---');
        const promise = otplib.verify({ token, secret });
        console.log('Type of return:', typeof promise);
        
        const resolved = await promise;
        console.log('Type of resolved:', typeof resolved);
        console.log('Value of resolved:', resolved);
        
        if (typeof resolved === 'boolean') {
            console.log('CONCLUSION: verify() returns a BOOLEAN directly!');
        } else if (resolved && typeof resolved === 'object') {
            console.log('CONCLUSION: verify() returns an OBJECT!');
        }
    } catch (e) {
        console.log('Error:', e.message);
    }
})();
