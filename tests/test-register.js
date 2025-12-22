(async () => {
  const fetch = global.fetch || require('node-fetch');
  const { v4: uuidv4 } = require('uuid');
  const pkg = require('@asanrom/dilithium');
  const { DilithiumKeyPair, DilithiumLevel, DILITHIUM_LEVEL3_P } = pkg;

  // 1. Initiate registration
  console.log('--- INIT: Request registration challenge ---');
  const initRes = await fetch('http://localhost:5000/api/register/initiate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientHint: 'com.example.qgate' }) });
  const initJson = await initRes.json();
  console.log('init', initJson);

  // 2. Generate device keypair (simulated for dev tests)
  // In production this must be generated and stored in the device TEE/Keystore.
  console.log('\n--- DEVICE: Generate simulated keypair (dev only) ---');
  const crypto = require('crypto');
  const pubBuf = crypto.randomBytes(64);
  const privBuf = crypto.randomBytes(64);
  const pubB64 = pubBuf.toString('base64');
  const privB64 = privBuf.toString('base64');

  // 3. Build attestation object (DEV mode): include the regNonce and packageName
  const attestation = {
    nonce: initJson.regNonce,
    packageName: 'com.example.qgate',
    timestamp: Date.now(),
    publicKey: pubB64
  };

  // 4. POST /api/register
  console.log('\n--- POST: Complete registration ---');
  const regPayload = {
    username: 'android_device_1',
    publicKey: pubB64,
    regSessionId: initJson.regSessionId,
    attestation: attestation
  };

  const regRes = await fetch('http://localhost:5000/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(regPayload) });
  const regJson = await regRes.json();
  console.log('register:', regRes.status, regJson);

})();