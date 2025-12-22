import * as SecureStore from 'expo-secure-store';

/**
 * Unified storage interface for Mobile (SecureStore).
 * Strictly uses hardware-backed secure storage.
 */
class UnifiedStorageClass {
    /**
     * Get a item
     */
    async getItem(key: string): Promise<string | null> {
        try {
            return await SecureStore.getItemAsync(key);
        } catch (error) {
            console.error(`[Storage] Error getting item ${key}:`, error);
            return null;
        }
    }

    /**
     * Set a item
     */
    async setItem(key: string, value: string): Promise<void> {
        try {
            await SecureStore.setItemAsync(key, value);
        } catch (error) {
            console.error(`[Storage] Error setting item ${key}:`, error);
            throw error;
        }
    }

    /**
     * Set a secure item (alias for setItem as SecureStore is always secure)
     */
    async setSecureItem(key: string, value: string): Promise<void> {
        await this.setItem(key, value);
    }

    /**
     * Delete an item
     */
    async deleteItem(key: string): Promise<void> {
        try {
            await SecureStore.deleteItemAsync(key);
        } catch (error) {
            console.error(`[Storage] Error deleting item ${key}:`, error);
        }
    }
}

export const UnifiedStorage = new UnifiedStorageClass();

