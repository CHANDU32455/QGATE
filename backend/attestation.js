const fetch = global.fetch || require('node-fetch');
const crypto = require('crypto');
const { createRemoteJWKSet, jwtVerify, errors: JoseErrors } = require('jose');

const PLAY_INTEGRITY_API_KEY = process.env.PLAY_INTEGRITY_API_KEY || null;
const PLAY_INTEGRITY_JWKS_URL = process.env.PLAY_INTEGRITY_JWKS_URL || 'https://www.googleapis.com/oauth2/v3/certs';
const ALLOWED_ANDROID_PACKAGES = (process.env.ALLOWED_ANDROID_PACKAGES || '').split(',').map(s=>s.trim()).filter(Boolean);

// Remote JWKS loader (caches and refreshes automatically)
const remoteJwks = createRemoteJWKSet(new URL(PLAY_INTEGRITY_JWKS_URL));

async function verifyPlayIntegrityToken(jwsToken, expectedNonceBase64) {
  try {
    // Verify signature and decode payload
    const { payload } = await jwtVerify(jwsToken, remoteJwks, {
      // No audience or issuer enforced here since Play Integrity tokens come as signed envelope; further checks below
    });

    // The payload may include `nonce` or nested requestDetails
    const decodedNonce = payload.nonce || (payload.requestDetails && payload.requestDetails.nonce) || payload.tokenPayloadExternalData;
    // Some Play Integrity tokens include payload as base64-encoded JSON in `tokenPayloadExternalData`
    let finalPayload = payload;

    if (typeof payload.tokenPayloadExternalData === 'string') {
      try {
        const parsed = JSON.parse(Buffer.from(payload.tokenPayloadExternalData, 'base64').toString('utf8'));
        finalPayload = { ...payload, ...parsed };
      } catch (e) {
        // ignore parse error
      }
    }

    const finalNonce = decodedNonce || finalPayload.nonce;
    if (!finalNonce) return { ok: false, error: 'Play Integrity token missing nonce' };
    if (finalNonce !== expectedNonceBase64) return { ok: false, error: 'Nonce mismatch in Play Integrity token' };

    // Validate packageName if provided
    if (ALLOWED_ANDROID_PACKAGES.length > 0) {
      const pkg = finalPayload.packageName || (finalPayload.appIntegrity && finalPayload.appIntegrity.packageName) || (finalPayload.requestDetails && finalPayload.requestDetails.packageName);
      if (!ALLOWED_ANDROID_PACKAGES.includes(pkg)) return { ok: false, error: 'Package name not allowed' };
    }

    // Validate timestamp freshness if available
    const timestampMs = finalPayload.timestampMillis || (finalPayload.requestDetails && finalPayload.requestDetails.timestampMillis) || finalPayload.timestamp;
    if (timestampMs) {
      const age = Date.now() - Number(timestampMs);
      if (age > 5 * 60 * 1000) return { ok: false, error: 'Play Integrity token too old' };
    }

    return { ok: true, payload: finalPayload };
  } catch (err) {
    if (err instanceof JoseErrors.JWTExpired) return { ok: false, error: 'Play Integrity token expired' };
    return { ok: false, error: `Play Integrity verification failed: ${err.message}` };
  }
}

async function verifyAndroidAttestation(integrityToken, expectedNonceBase64) {
  // First, if it looks like a JWS (three parts), attempt local JWS verification
  if (typeof integrityToken === 'string' && integrityToken.split('.').length === 3) {
    const res = await verifyPlayIntegrityToken(integrityToken, expectedNonceBase64);
    if (res.ok) return res;
    // If JWS verification failed, fall through to API-key decode if available or to dev fallback
    if (PLAY_INTEGRITY_API_KEY) {
      // Try decode API as a fallback
      try {
        const url = `https://playintegrity.googleapis.com/v1:decodeIntegrityToken?key=${PLAY_INTEGRITY_API_KEY}`;
        const r = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ integrityToken })
        });
        if (r.ok) {
          const json = await r.json();
          const payload = json.tokenPayloadExternalData || json.tokenPayload || json;
          const decodedNonce = payload.nonce || (payload.requestDetails && payload.requestDetails.nonce);
          if (!decodedNonce) return { ok: false, error: 'Decoded Play Integrity response missing nonce' };
          if (decodedNonce !== expectedNonceBase64) return { ok: false, error: 'Nonce mismatch in decoded Play Integrity response' };
          return { ok: true, payload };
        }
      } catch (e) {
        // fallthrough
      }
    }
    return { ok: false, error: `Play Integrity JWS verification failed` };
  }

  // If not JWS, attempt to parse as JSON attestation (DEV and some clients)
  try {
    const att = typeof integrityToken === 'string' ? JSON.parse(integrityToken) : integrityToken;
    if (!att.nonce) return { ok: false, error: 'Attestation missing nonce' };
    if (att.nonce !== expectedNonceBase64) return { ok: false, error: 'Nonce mismatch' };
    const ts = att.timestamp || att.timestampMillis || 0;
    if (ts && (Date.now() - ts) > 5 * 60 * 1000) return { ok: false, error: 'Attestation too old' };
    if (ALLOWED_ANDROID_PACKAGES.length > 0 && att.packageName && !ALLOWED_ANDROID_PACKAGES.includes(att.packageName)) return { ok: false, error: 'Package name not allowed' };

    return { ok: true, payload: att };
  } catch (err) {
    return { ok: false, error: `Malformed attestation: ${err.message}` };
  }
}

module.exports = { verifyAndroidAttestation, verifyPlayIntegrityToken };
