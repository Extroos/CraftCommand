
const http = require('http');

const call = (method, path, body, token) => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: '127.0.0.1',
            port: 3001,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                let parsedBody;
                try {
                    parsedBody = JSON.parse(data);
                } catch (e) {
                    parsedBody = data;
                }
                resolve({ status: res.statusCode, body: parsedBody });
            });
        });

        req.on('error', (e) => reject(e));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
};

const run = async () => {
    console.log('--- STARTING AUTH FLOW STABILIZATION TEST ---');
    let failed = false;

    try {
        // 1. Login Default
        console.log('1. Testing Login (admin/admin)...');
        const loginRes = await call('POST', '/api/auth/login', { email: 'admin@craftcommand.io', password: 'admin' });
        
        if (loginRes.status !== 200 || !loginRes.body.token) {
            console.error('FAIL: Login failed', loginRes);
            failed = true;
        } else {
            console.log('PASS: Login successful. Token received.');
            const token = loginRes.body.token;

            // 2. Verify Token (Get Me)
            console.log('2. Verifying Session (GET /me)...');
            const meRes = await call('GET', '/api/auth/me', null, token);
            if (meRes.status !== 200 || meRes.body.role !== 'OWNER') {
                console.error('FAIL: Session verification failed', meRes);
                failed = true;
            } else {
                console.log(`PASS: Session valid. Role: ${meRes.body.role}`);
            }

            // 3. Test Invalid Login
            console.log('3. Testing Invalid Password...');
            const badRes = await call('POST', '/api/auth/login', { email: 'admin@craftcommand.io', password: 'wrong' });
            if (badRes.status !== 401) {
                console.error('FAIL: Invalid login succeeded or wrong code', badRes);
                failed = true;
            } else {
                console.log('PASS: Invalid login rejected (401).');
            }
        
             // 4. Test Update Profile
            console.log('4. Testing Profile Update (Preferences)...');
            const updateRes = await call('PATCH', '/api/auth/me', { preferences: { accentColor: 'violet' } }, token);
            // Note: Update logic merges preferences, so we check if key exists
            if (updateRes.status !== 200 || updateRes.body.preferences?.accentColor !== 'violet') {
                console.error('FAIL: Profile update failed', updateRes);
                 failed = true;
            } else {
                 console.log('PASS: Profile updated.');
            }
        }

    } catch (e) {
        console.error('CRITICAL ERROR:', e);
        failed = true;
    }

    if (failed) {
        console.log('--- TEST FAILED ---');
        process.exit(1);
    } else {
        console.log('--- TEST PASSED ---');
        process.exit(0);
    }
};

run();
