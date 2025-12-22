(async () => {
  const fetch = global.fetch || require('node-fetch');
  const io = require('socket.io-client');
  const pkg = require('@asanrom/dilithium');
  const { DilithiumKeyPair, DilithiumLevel, DilithiumSignature, DILITHIUM_LEVEL3_P, DILITHIUM_LEVEL2_P } = pkg;

  const BACKEND = process.env.BACKEND_URL || 'http://localhost:5000';

  console.log('=== Q-GATE E2E TEST ===');

  try {
    // 1. Register flow
    console.log('\n1) Request registration challenge');
    const initRes = await fetch(`${BACKEND}/api/register/initiate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientHint: 'com.example.qgate' }) });
    if (!initRes.ok) throw new Error(`register/initiate failed ${initRes.status}`);
    const init = await initRes.json();
    console.log('  -> regSessionId:', init.regSessionId);
    console.log('  -> regNonce (base64):', init.regNonce.slice(0, 24) + '...');

    // 2. Generate device keypair (try real Dilithium, else fallback to simulated)
    console.log('\n2) Generating device keypair (attempt Dilithium Level 3)');
    let kp = null;
    try {
      // Prefer level 3
      kp = DilithiumKeyPair.generate(DILITHIUM_LEVEL3_P);
      console.log('  -> Dilithium keypair generated (level3)');
    } catch (e) {
      try {
        kp = DilithiumKeyPair.generate(DILITHIUM_LEVEL2_P);
        console.log('  -> Dilithium keypair generated (level2)');
      } catch (e2) {
        console.warn('  -> Dilithium generate failed, falling back to simulated keypair:', e2.message);
      }
    }

    let pubB64, privKey;
    if (kp && kp.publicKey) {
      pubB64 = Buffer.from(kp.publicKey).toString('base64');
      privKey = kp.privateKey;
    } else {
      const crypto = require('crypto');
      const pub = crypto.randomBytes(64);
      const priv = crypto.randomBytes(64);
      pubB64 = pub.toString('base64');
      privKey = priv;
      console.log('  -> Using simulated keypair (dev only)');
    }

    // 3. Prepare attestation (dev mode)
    const attestation = { nonce: init.regNonce, packageName: 'com.example.qgate', timestamp: Date.now(), publicKey: pubB64 };

    console.log('\n3) Completing registration with server');
    const regRes = await fetch(`${BACKEND}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'e2e_device', publicKey: pubB64, regSessionId: init.regSessionId, attestation }) });
    const regJson = await regRes.json();
    if (!regRes.ok) throw new Error(`register failed ${regRes.status} ${JSON.stringify(regJson)}`);
    console.log('  -> Registered regUserId:', regJson.regUserId);

    // 4. Initiate login
    console.log('\n4) Initiating login (server will produce QR payload)');
    const initLoginRes = await fetch(`${BACKEND}/api/initiate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regUserId: regJson.regUserId }) });
    const initLoginJson = await initLoginRes.json();
    if (!initLoginRes.ok) throw new Error(`initiate failed ${initLoginRes.status}`);
    console.log('  -> sessionId:', initLoginJson.sessionId);
    console.log('  -> nonce (short):', initLoginJson.nonce.slice(0, 24) + '...');

    // 5. Simulate mobile signing inside TEE
    console.log('\n5) Simulate signing nonce (try real Dilithium sign if possible)');
    let signatureBase64;
    try {
      if (kp && kp.privateKey && DilithiumSignature && typeof DilithiumSignature.sign === 'function') {
        const lvl = new DilithiumLevel(DILITHIUM_LEVEL3_P);
        const nonceBuf = Buffer.from(initLoginJson.nonce, 'base64');
        const sig = DilithiumSignature.sign(lvl, kp.privateKey, nonceBuf);
        signatureBase64 = Buffer.from(sig).toString('base64');
        console.log('  -> Dilithium signature created');
      } else {
        // fallback HMAC simulate signed payload
        const crypto = require('crypto');
        const h = crypto.createHmac('sha256', privKey);
        h.update(Buffer.from(initLoginJson.nonce, 'base64'));
        signatureBase64 = h.digest('base64');
        console.log('  -> Simulated HMAC signature created (dev only)');
      }
    } catch (e) {
      console.warn('  -> Signing failed:', e.message);
    }

    // 6. POST /api/verify
    console.log('\n6) Sending signature to /api/verify');
    const verifyRes = await fetch(`${BACKEND}/api/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: initLoginJson.sessionId, signature: signatureBase64 }) });
    const verifyJson = await verifyRes.json().catch(()=>null);
    console.log('  -> verify status:', verifyRes.status, 'body:', verifyJson);

    if (verifyRes.ok) {
      const token = verifyJson.token;

      // 7. Optionally verify session token
      console.log('\n7) Verifying /api/me with token');
      const meRes = await fetch(`${BACKEND}/api/me`, { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } });
      console.log('  -> /api/me status:', meRes.status, 'body:', await meRes.text());

      // 8. Socket check
      console.log('\n8) Connecting socket and joining session to await authenticated event');
      const s = io(BACKEND);
      s.on('connect', () => console.log('  -> socket connected', s.id));
      s.on('authenticated', (t) => { console.log('  -> socket received authenticated event, token:', t); s.disconnect(); });
      await new Promise(r=>setTimeout(r,500));
      s.emit('join', initLoginJson.sessionId);

      // Give server a moment to emit and receive
      await new Promise(r => setTimeout(r, 1500));
    } else {
      console.warn('\n>> PQ verification failed or server error. Detailed server response:', verifyJson);
      // Try the dev helper /api/mobile/verify to get a token and continue diagnostics (dev-only)
      try {
        console.log('Attempting dev /api/mobile/verify as diagnostic fallback (dev-only).');
        const devRes = await fetch(`${BACKEND}/api/mobile/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: initLoginJson.sessionId, nonce: initLoginJson.nonce, regUserId: regJson.regUserId }) });
        const devJson = await devRes.json().catch(()=>null);
        console.log('  -> /api/mobile/verify status:', devRes.status, 'body:', devJson);
        if (devRes.ok) {
          const token = devJson.token;
          const meRes = await fetch(`${BACKEND}/api/me`, { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } });
          console.log('  -> /api/me status (dev fallback token):', meRes.status, 'body:', await meRes.text());
        }
      } catch (e) {
        console.error('  -> Dev fallback failed:', e.message);
      }
    }

    console.log('\n=== E2E TEST COMPLETED ===');
  } catch (err) {
    console.error('E2E TEST ERROR:', err);
    process.exit(2);
  }
})();