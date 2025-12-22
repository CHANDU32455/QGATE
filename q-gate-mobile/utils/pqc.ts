import { UnifiedStorage } from './storage';
import { Buffer } from 'buffer';
import { DilithiumLevel, DilithiumKeyPair } from '@asanrom/dilithium';
import * as bip39 from 'bip39';
import 'react-native-get-random-values'; // Polyfill for crypto.getRandomValues

const SEED_KEY = 'qgate_pqc_seed';
const META_KEY = 'qgate_identity_meta';
const level3 = DilithiumLevel.get(3);

/**
 * Generates a new 32-byte seed for Dilithium key generation if one doesn't exist.
 * Uses cryptographically secure random values.
 */
export async function generateAndStoreSeed(inputSeed?: string): Promise<string> {
    const existing = await UnifiedStorage.getItem(SEED_KEY);
    if (existing && !inputSeed) {
        console.log('[PQC] Seed already exists, skipping generation.');
        return existing;
    }

    let seedBase64 = inputSeed;

    if (!seedBase64) {
        // Generate 32 bytes of secure random data
        const seedBytes = new Uint8Array(32);
        crypto.getRandomValues(seedBytes);
        seedBase64 = Buffer.from(seedBytes).toString('base64');
    }

    // Store in SecureStore (TEE-backed on Android/iOS)
    await UnifiedStorage.setSecureItem(SEED_KEY, seedBase64);

    console.log('[PQC] Generated and stored new secure seed.');
    return seedBase64;
}

/**
 * Gets the public key derived from the stored seed.
 */
export async function getPublicKey(): Promise<string | null> {
    const seedBase64 = await UnifiedStorage.getItem(SEED_KEY);
    if (!seedBase64) return null;

    const seed = new Uint8Array(Buffer.from(seedBase64, 'base64'));
    const keyPair = DilithiumKeyPair.generate(level3, seed);
    return keyPair.getPublicKey().toBase64();
}

/**
 * Signs a message (nonce) using the private key derived from the stored seed.
 */
export async function signMessage(nonceBase64: string): Promise<string | null> {
    const seedBase64 = await UnifiedStorage.getItem(SEED_KEY);
    if (!seedBase64) return null;

    const seed = new Uint8Array(Buffer.from(seedBase64, 'base64'));
    const nonce = new Uint8Array(Buffer.from(nonceBase64, 'base64'));

    // Derive keypair (private key exists only in memory during this operation)
    const keyPair = DilithiumKeyPair.generate(level3, seed);

    // Sign the nonce
    const signature = keyPair.sign(nonce);

    return signature.toBase64();
}

/**
 * Checks if a PQC identity already exists on this device.
 */
export async function hasIdentity(): Promise<boolean> {
    const seed = await UnifiedStorage.getItem(SEED_KEY);
    return !!seed;
}

/**
 * Deletes the local PQC identity and metadata.
 */
export async function resetIdentity(): Promise<void> {
    await UnifiedStorage.deleteItem(SEED_KEY);
    await UnifiedStorage.deleteItem(META_KEY);
}

/**
 * Stores non-sensitive identity metadata for session initiation.
 */
export async function storeIdentityMetadata(regUserId: string, username: string): Promise<void> {
    // Non-sensitive metadata can be stored with more lenient availability for re-syncing
    await UnifiedStorage.setItem(META_KEY, JSON.stringify({ regUserId, username }));
}

/**
 * Retrieves stored identity metadata.
 */
export async function getIdentityMetadata(): Promise<{ regUserId: string; username: string } | null> {
    const raw = await UnifiedStorage.getItem(META_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}
/**
 * Converts a base64 seed to a 24-word mnemonic phrase.
 */
export function seedToMnemonic(seedBase64: string): string {
    const seed = Buffer.from(seedBase64, 'base64');
    return bip39.entropyToMnemonic(seed);
}

/**
 * Converts a mnemonic phrase back to a base64 seed.
 */
export function mnemonicToSeed(mnemonic: string): string {
    const entropy = bip39.mnemonicToEntropy(mnemonic);
    return Buffer.from(entropy, 'hex').toString('base64');
}

/**
 * Validates a mnemonic phrase.
 */
export function validateMnemonic(mnemonic: string): boolean {
    return bip39.validateMnemonic(mnemonic);
}
