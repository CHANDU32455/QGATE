const pkg = require('@asanrom/dilithium');
const { DilithiumLevel, DilithiumPublicKey, DilithiumSignature } = pkg;

const level3 = DilithiumLevel.get(3);

/**
 * Ensures an input is a Uint8Array.
 * Handles Buffer, string (base64), or already Uint8Array.
 */
function ensureUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (typeof input === 'string') return new Uint8Array(Buffer.from(input, 'base64'));
  if (Buffer.isBuffer(input)) return new Uint8Array(input);
  throw new Error('Invalid input type for conversion to Uint8Array');
}

/**
 * Verifies a Post-Quantum signature using Dilithium ML-DSA.
 * @param {Buffer|string} message The original challenge nonce
 * @param {Buffer|string} signature The signature provided by the mobile device
 * @param {Buffer|string} pubKey The stored public key for the user
 * @returns {boolean} True if verification succeeds
 */
function verifyPQ(message, signature, pubKey) {
  try {
    const pubKeyBytes = ensureUint8Array(pubKey);
    const signatureBytes = ensureUint8Array(signature);
    const messageBytes = ensureUint8Array(message);

    const pubKeyObject = DilithiumPublicKey.fromBytes(pubKeyBytes, level3);
    const signatureObject = DilithiumSignature.fromBytes(signatureBytes, level3);

    return signatureObject.verify(messageBytes, pubKeyObject);
  } catch (err) {
    console.error('[PQ-Crypto] Verification Failed:', err.message);
    return false;
  }
}

module.exports = { verifyPQ };