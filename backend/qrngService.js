const crypto = require('crypto');

const DEFAULT_PROVIDER = process.env.QRNG_PROVIDER_URL || 'https://qrng.anu.edu.au/API/jsonI.php';
const TIMEOUT_MS = 3000;
const POOL_TARGET_SIZE = 1024; // 1KB of entropy cached
const REFILL_THRESHOLD = 256;  // Refill when pool drops below this

class QRNGService {
    constructor() {
        this.entropyPool = Buffer.alloc(0);
        this.isRefilling = false;
        this.init();
    }

    async init() {
        console.log('[QRNG-Service] Initializing Entropy Pool...');
        await this.refillPool();

        // Background check every 10 seconds
        setInterval(() => {
            if (this.entropyPool.length < REFILL_THRESHOLD && !this.isRefilling) {
                this.refillPool();
            }
        }, 10000);
    }

    async refillPool() {
        this.isRefilling = true;
        const needed = POOL_TARGET_SIZE - this.entropyPool.length;
        if (needed <= 0) {
            this.isRefilling = false;
            return;
        }

        console.log(`[QRNG-Service] Refilling pool. Current: ${this.entropyPool.length} bytes, Needed: ${needed} bytes`);

        try {
            const url = new URL(DEFAULT_PROVIDER);
            url.searchParams.set('length', Math.min(needed, 1024));
            url.searchParams.set('type', 'base64');

            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), TIMEOUT_MS);

            const res = await fetch(url.toString(), { signal: controller.signal });
            clearTimeout(id);

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const json = await res.json();
            let newEntropy = Buffer.alloc(0);

            if (json.data && typeof json.data === 'string') {
                newEntropy = Buffer.from(json.data, 'base64');
            } else if (Array.isArray(json.data)) {
                newEntropy = Buffer.from(json.data);
            }

            if (newEntropy.length > 0) {
                this.entropyPool = Buffer.concat([this.entropyPool, newEntropy]);
                console.log(`[QRNG-Service] Pool refilled. New size: ${this.entropyPool.length} bytes (Source: ANU-QRNG)`);
            }
        } catch (err) {
            console.warn(`[QRNG-Service] Remote refill failed (${err.message}). Falling back to CSPRNG.`);
            // Fallback to local CSPRNG for the pool
            const fallback = crypto.randomBytes(needed);
            this.entropyPool = Buffer.concat([this.entropyPool, fallback]);
            console.log(`[QRNG-Service] Pool refilled via local CSPRNG. New size: ${this.entropyPool.length} bytes`);
        } finally {
            this.isRefilling = false;
        }
    }

    getNextEntropy(n) {
        if (this.entropyPool.length < n) {
            console.warn(`[QRNG-Service] Pool starving! Requested ${n} but only have ${this.entropyPool.length}. Urgent refill triggered.`);
            // Direct fetch for immediate need if pool is empty
            const fallback = crypto.randomBytes(n);
            this.refillPool(); // Trigger async refill
            return { bytes: fallback, source: 'urgent-csprng' };
        }

        const bytes = this.entropyPool.subarray(0, n);
        this.entropyPool = this.entropyPool.subarray(n);

        // Trigger refill if low
        if (this.entropyPool.length < REFILL_THRESHOLD && !this.isRefilling) {
            this.refillPool();
        }

        return { bytes, source: 'quantum-pool' };
    }
}

// Singleton instance
const qrngService = new QRNGService();

module.exports = qrngService;
