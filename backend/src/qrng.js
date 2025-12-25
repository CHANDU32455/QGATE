const qrngService = require('./qrngService');

/**
 * Gets random bytes from the optimized background entropy pool.
 * This ensures < 10ms latency for challenge generation.
 * @param {number} n Number of bytes
 */
async function getRandomBytes(n) {
  const entropy = qrngService.getNextEntropy(n);
  return {
    bytes: entropy.bytes,
    source: entropy.source
  };
}

module.exports = { getRandomBytes };
