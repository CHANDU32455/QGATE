# Outcome — Q-GATE: Web QR Login & Dev Helpers ✅

**Date:** 2025-12-20

## 1) Short summary
- Implemented server-side QR printing for login challenges (ASCII QR printed to server terminal).
- Added `/api/demo-register` for quick development registration (server-side generated placeholder keypair).
- Added `/api/initiate` to create challenge and return `{ sessionId, nonce, regUserId }` (QR payload includes regUserId).
- Added `/api/mobile/verify` development helper to validate challenge (sessionId + nonce + regUserId) and issue an opaque session token.
- Aligned socket events and names: frontend listens for `'authenticated'`. Server emits `'authenticated'` to room = `sessionId`.
- Frontend: added demo registration UI, ensured QR encodes `{ sessionId, nonce, regUserId }`, and mobile uses `regUserId` from scanned QR when calling the verification helper.

## 2) Files changed (important)
- Backend/auth.js  — QR printing, `/demo-register`, `/mobile/verify`, emit `'authenticated'`, include `regUserId` and `entropySource` in challenge payload; added registration initiate/register flow with attestation checks
- backend/attestation.js — added Play Integrity JWS verification (local JWS verification using `jose`) and DEV fallback parsing; will verify nonce/package/timestamp
- backend/server.js — socket `join` event name aligned to frontend
- backend/package.json — added `qrcode-terminal` and `jose`
- backend/qrng.js — new QRNG client, fetches from configured provider and falls back to CSPRNG
- backend/test-qrng.js — quick script to test QRNG + fallback
- backend/test-register.js — added a dev script to simulate Android registration flow
- Frontend/WebLogin.js — demo registration UI, uses `regUserId` from server
- Frontend/BiometricAuth.js — uses `sessionData.regUserId` and logs verify response

## 3) How to reproduce locally (quick)
1. Start backend: in `backend/` run:

   npm install
   node server.js

2. Registration (Android flow - dev mode):

   a) Request registration challenge (server issues a regSessionId + regNonce):

      node -e "(async()=>{const r=await fetch('http://localhost:5000/api/register/initiate',{method:'POST',headers:{'content-type':'application/json'}, body:JSON.stringify({clientHint:'com.example.qgate'})}); console.log(await r.text());})()"

   b) Simulate device: generate a keypair locally and build an attestation object that includes the returned regNonce (dev-mode testing):

      node backend/test-register.js

   c) Server will persist the `regUserId` and associated public key when attestation verifies.

3. Initiate login (server prints ASCII QR to terminal and returns challenge):

   node -e "(async()=>{const r=await fetch('http://localhost:5000/api/initiate',{method:'POST',headers:{'content-type':'application/json'}, body:JSON.stringify({regUserId:'<REG_USER_ID>'})}); console.log(await r.text());})()"

4. Scan the printed QR with mobile app (or use returned `{ sessionId, nonce, regUserId }`) and perform TEE signing on mobile; the mobile should POST signature to `/api/verify` (production) or use `/api/mobile/verify` helper in dev.

   node -e "(async()=>{const payload={sessionId:'<SESSION_ID>', nonce:'<NONCE>', regUserId:'<REG_USER_ID>'}; const r=await fetch('http://localhost:5000/api/mobile/verify',{method:'POST',headers:{'content-type':'application/json'}, body:JSON.stringify(payload)}); console.log(await r.text());})()"

5. The web client (if socket joined the `sessionId` room) receives `'authenticated'` event with token and can call `/api/me` with `Authorization: Bearer <token>`.

## 4) Observations & test results
- Demo registration succeeded and returned a `regUserId` (tested).  
- Server prints the ASCII QR on `/api/initiate`.  
- `/api/mobile/verify` returns a token when correct sessionId + nonce + regUserId are provided.  
- Socket emission and reception of `'authenticated'` was verified using a test socket client.

## 5) Security & production notes ⚠️
- The `/demo-register` endpoint returns a private key for dev only — must be removed or protected before production.
- Private keys must be generated & stored on-device (Secure Enclave / Keystore) and used to sign the nonce; never transmit private keys to the server in production.
- Limit logging of sensitive values (nonces, private keys) in production logs.
- Keep challenge TTL (currently 120s) and replay protections; monitor for edge cases.

## 6) Suggested next steps (pick one)
- Implement real PQC signing flow on mobile (use the private key stored on device to sign `nonce` and call `/verify` with signature) — recommended. ✅
- Add automated tests: unit tests for `auth.js`, integration tests for end-to-end flow (initiate → mobile sign → verify → socket event).
- Remove/secure demo helper endpoints & harden input validation and logging.

---

If you'd like, I can start on the real mobile signing flow or add the integration tests — tell me which and I'll proceed. 🔧