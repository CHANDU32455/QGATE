const pkg = require('@asanrom/dilithium');
const { DilithiumLevel, DILITHIUM_LEVEL3_P, DilithiumKeyPair, DilithiumSignature } = pkg;

if (!DilithiumLevel || !DILITHIUM_LEVEL3_P || !DilithiumKeyPair || !DilithiumSignature) {
  console.error("❌ Error: Could not load Dilithium classes. Library exports:", Object.keys(pkg));
  process.exit(1);
}

const level3 = new DilithiumLevel(DILITHIUM_LEVEL3_P);

// --- 📝 TEST DATA (Simulating Frontend Inputs) ---
const TEST_SCENARIO = {
  user: {
    username: 'student_demo_user',
    deviceModel: 'Realme Narzo 20A'
  }
};

// Helper to handle HTTP requests
async function request(actor, method, url, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const options = {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  };

  console.log(`   --> [${actor}] Request: ${method} ${url}`);
  if (body) {
    // Log payload but truncate long strings for readability
    const logBody = JSON.stringify(body, (k, v) => (typeof v === 'string' && v.length > 50) ? v.substring(0, 20) + '...' : v);
    console.log(`       Payload: ${logBody}`);
  }

  const res = await fetch(`http://localhost:5000/api${url}`, options);
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(`API Error (${res.status}): ${data.error || JSON.stringify(data)}`);
  }

  console.log(`   <-- [SERVER] Response: ${res.status} OK`);
  // console.log(`       Data: ${JSON.stringify(data).substring(0, 100)}...`);
  return data;
}

// --- 🔑 CLIENT-SIDE KEY GENERATION FUNCTION ---
// In the real app, this runs inside the React Native mobile app.
// The Backend NEVER sees the Private Key.
function generateDeviceKeys() {
  // Generate Dilithium Level 3 Keypair (Post-Quantum Secure)
  return DilithiumKeyPair.generate(DILITHIUM_LEVEL3_P);
}

async function runTest() {
  try {
    console.log('\n==================================================');
    console.log('      Q-GATE AUTHENTICATION FLOW TEST');
    console.log('==================================================\n');

    // 1. SIMULATE DEVICE SETUP
    console.log('--- STEP 1: DEVICE INITIALIZATION ---');
    console.log('   [MOBILE] Generating Post-Quantum Keypair (Dilithium Level 3)...');
    const keyPair = generateDeviceKeys();
    const pubKeyBase64 = Buffer.from(keyPair.publicKey).toString('base64');
    console.log('   [MOBILE] ✅ Keys Generated securely on device.');

    // 2. REGISTER
    console.log('\n--- STEP 2: REGISTRATION (One-time Setup) ---');
    const regData = await request('MOBILE', 'POST', '/register', {
      username: TEST_SCENARIO.user.username,
      publicKey: pubKeyBase64
    });
    const { regUserId } = regData;
    console.log(`   [RESULT] User Registered. Permanent ID: ${regUserId}`);

    // 3. INITIATE LOGIN (Web Client)
    console.log('\n--- STEP 3: LOGIN INITIATION (Web) ---');
    const initData = await request('WEB_CLIENT', 'POST', '/initiate', { regUserId });
    const { sessionId, challengeNonce } = initData;
    console.log(`   [RESULT] Challenge Received. QR Code would be displayed now.`);
    console.log(`       Session ID: ${sessionId}`);

    // 4. SIGN CHALLENGE (Mobile Device)
    console.log('\n--- STEP 4: CHALLENGE RESPONSE (Mobile) ---');
    console.log('   [MOBILE] Scanning QR Code...');
    console.log('   [MOBILE] Signing Nonce with Private Key (Biometric Auth simulated)...');
    
    // Convert nonce from Base64 to Uint8Array for signing
    const nonceBuffer = Buffer.from(challengeNonce, 'base64');
    const signature = DilithiumSignature.sign(level3, keyPair.privateKey, nonceBuffer);
    const signatureBase64 = Buffer.from(signature).toString('base64');
    
    console.log('   [MOBILE] ✅ Signature created.');

    // 5. VERIFY LOGIN (Mobile Device sends signature)
    console.log('\n--- STEP 5: VERIFICATION (Server) ---');
    const verifyData = await request('MOBILE', 'POST', '/verify', {
      sessionId,
      signature: signatureBase64
    });
    const { token } = verifyData;
    console.log('   [RESULT] Login Verified! Session Token issued.');
    console.log(`       Token: ${token}`);

    // 6. ACCESS PROTECTED ROUTE
    console.log('\n--- STEP 6: SESSION TEST (Persistence) ---');
    const meData = await request('WEB_CLIENT', 'GET', '/me', null, token);
    console.log(`   [RESULT] Authenticated as: ${meData.username} (${meData.userId})`);

    console.log('\n==================================================');
    console.log('      🎉 TEST COMPLETED SUCCESSFULLY');
    console.log('==================================================');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
  }
}

runTest();