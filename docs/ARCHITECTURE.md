# Q-GATE Architecture & Design (Android-first PQ Authentication)

**Date:** 2025-12-20

---

## 🎯 Project Goal (short)
Build a production-ready, Android-first post-quantum authentication system where:
- **Server generates high-entropy challenges** (QRNG primary, CSPRNG fallback) and prints/returns QR payloads
- **Mobile device (TEE-backed)** generates and stores Dilithium private keys and **signs nonces in TEE** after biometric unlock
- **Server verifies PQ signatures (Dilithium)**, issues opaque session tokens, and communicates success to the web client via sockets
- **Kyber KEM** is used to provide quantum-safe ephemeral encryption where appropriate (session token confidentiality, optional secure channel)

---

## 🔧 System Components
- Backend (Node/Express + MongoDB + Redis + Socket.io)
- Mobile (Android first): app + TEE (Android Keystore / Play Integrity attestation)
- Web client: displays QR (from server response) and listens on socket
- External services: QRNG provider (configurable), Play Integrity API (optional)

---

## API & Socket Contracts
### REST Endpoints (summary)
- POST /api/register/initiate
  - Request: { clientHint? }
  - Response: { regSessionId, regNonce (base64), entropySource }
- POST /api/register
  - Request: { username, publicKey (base64), regSessionId, attestation }
  - Response: { regUserId, username }
- POST /api/initiate
  - Request: { regUserId }
  - Response: { sessionId, nonce (base64), regUserId, entropySource }
- POST /api/verify
  - Request: { sessionId, signature (base64) }
  - Response: { status: 'ok', token }
- POST /api/mobile/verify (DEV helper)
  - Request: { sessionId, nonce, regUserId }
  - Response: { status: 'ok', token }
- GET /api/me
  - Header: Authorization: Bearer <token>
  - Response: { user info }

### Socket Events
- Client -> Server: `join` (sessionId)
- Server -> Room(sessionId): `authenticated` (opaqueToken)

> Always use TLS for all endpoints and WebSocket connections (wss).

---

## Data Formats
### QR Payload (encoded as QR JSON)

Example:
```
{
  "sessionId": "<uuid>",
  "nonce": "<base64>",
  "regUserId": "<uuid>",
  "entropySource": "qrng-provider-v1|fallback-csprng"
}
```

### Registration Attestation (Android - DEV vs PROD)
- DEV: JSON object including { nonce, packageName, timestamp, publicKey }
- PROD: Play Integrity token (opaque JWS / token). Server must decode/verify and check `nonce`, `appIntegrity`, `packageName`, `certificateDigest` etc.

---

## Sequence Flows (high-level)
### Registration (Android)
1. Mobile -> POST /api/register/initiate (clientHint optional)
2. Server returns { regSessionId, regNonce }
3. Mobile (TEE): generate Dilithium keypair; produce attestation binding `regNonce` and `publicKey` (Play Integrity token or DEV JSON)
4. Mobile -> POST /api/register with { username, publicKey, regSessionId, attestation }
5. Server verifies attestation (nonce match, package signing cert), stores { regUserId, publicKey, attestation metadata }

### Login (Web + Mobile)
1. Web -> POST /api/initiate { regUserId }
2. Server: generate `sessionId`, `nonce` (QRNG primary), store challenge in Redis (TTL 120s), print ASCII QR and return challenge
3. Web renders QR JSON to user
4. Mobile scans QR → verifies fields, opens biometric prompt, TEE signs `nonce` with Dilithium private key
5. Mobile -> POST /api/verify { sessionId, signature }
6. Server: fetch challenge, verify signature with stored publicKey (Dilithium verification), if OK store session and emit `authenticated` to `sessionId` room
7. Web socket receives token, uses /api/me to confirm

---

## QRNG (Entropy) Design
- Primary: configurable QRNG provider URL (ANU or other) returning base64/array bytes, or `QRNG_MODE=local` to use a local quantum generator (dev or local hardware). In `QRNG_STRICT=true` mode, server fails when provider is unreachable.
- Fallback: by default the server can fall back to a local QRNG/CSPRNG if provider fails unless `QRNG_STRICT=true` is set. For production with 'strict' requirement, set `QRNG_MODE=provider` and `QRNG_STRICT=true` or supply a reliable provider.
- Challenge includes `entropySource` (for auditing) and server logs metrics: provider latency, failure rate
- Health-check endpoint available: `/health/qrng` returns current source or 503 if QRNG provider failed in strict mode

---

## PQC primitives & usage
- Dilithium (signatures)
  - Device signs challenge nonce using private key stored / protected by TEE
  - Server uses `verifyPQ(nonce, signature, publicKey)` to validate
- Kyber (KEM) — recommended usage
  - Server can encapsulate an ephemeral symmetric key for mobile to decapsulate and use for session token decryption or an encrypted channel
  - Optionally used when delivering sensitive secrets to the device or when performing pairwise session encryption

---

## TEE / Key Management (Android-focused)
- Preferred: Generate dilithium keypair on-device; store private key in Android Keystore (TEE-backed) if possible
- If Dilithium is not natively supported in TEE:
  - Option A (recommended): Create keypair in secure ephemeral memory and wrap private key with a TEE-managed symmetric key; store wrapped blob in app storage; unwrapped only inside TEE for signing.
  - Option B: Use a verified WASM Dilithium implementation executed inside a TEE-like environment (requires additional validation)
- Always sign the server-provided `regNonce` in the attestation step or include `regNonce` inside attestation request so server can bind key to device identity

---

## Attestation (Play Integrity integration)
- **Production flow**:
  - Client obtains Play Integrity token including `nonce` and `appIntegrity`
  - Server decodes/validates token: verify signature (JWK from Google locally using `jose`), check `nonce` equals `regNonce`, `packageName` allowed, `certificateDigestSha256` matches your release key, and timestamp freshness. Local JWS verification is implemented so an API key is not required.
  - Persist attestation verification result and attestation token (or the minimal audit info)
- **Fallback (DEV)**: Accept a signed JSON attestation object (for local testing only)

---

## Security Hardening & Operational Considerations
- Remove or gate dev endpoints (`/demo-register`, `/mobile/verify`) for prod
- Require HTTPS, HSTS; enforce CORS on production origins
- Rate-limit registration and verification endpoints
- Persist only necessary attestation metadata; redact sensitive fields from logs
- TTLs: challenge TTL (120s), regNonce TTL (5min), session token TTL (1h) — configurable
- Provide a re-attestation policy (e.g., require re-attestation if device integrity changes or trust age > X days)

---

## Testing & CI
- Unit tests: `auth.js`, `attestation.js`, `qrng.js` (mock providers)
- Integration tests: simulate register-initiate-register, initiate-verify flow
- E2E tests: mock TEE sign or use a dev key store to simulate real device
- Play Integrity verification tests: mock decode API responses (success/failure cases)

---

## Observability & Monitoring
- Metrics: QRNG provider latency & failure rate, attestation verification success/failure rates, verification failure reasons, replay attempts
- Alerts: repeated attestation failures, high QRNG fallback rate, large unexplained increase in verification errors

---

## Rollout Plan (phased)
1. Deploy backend QRNG + attestation endpoints and keep dev helpers behind flags (QA stage)
2. Release mobile update to Android (internal testing) that implements TEE keygen & attestation
3. Canary test on a small user set; measure attestation success and QRNG health
4. Full rollout and monitor metrics, incident response runbook

---

## Short-term Implementation Tasks (next actions)
- Implement server-side Play Integrity verification (decode + JWS verify) — **now**
- Add QRNG health checks and metrics, persist `entropySource` per challenge — **now**
- Add unit & integration tests for attestation verification — **next**
- Mobile: implement Dilithium keygen + TEE signing + attestation flow (Android) — **parallel after server tests**
- Integrate Kyber KEM for session token confidentiality — **phase 2**

---

## References
- Play Integrity API: https://developers.google.com/play/integrity
- Dilithium & Kyber implementations (example libs): `@asanrom/dilithium`, `pq-crypto` (see package choices)

---

If you want, I can commit this file now (here it is added), then proceed implementing Play Integrity server verification and tests immediately. Let me know to proceed. 🔧