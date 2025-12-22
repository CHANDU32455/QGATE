import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { UnifiedStorage } from '../utils/storage';
import axios from 'axios';
import { hasIdentity, getIdentityMetadata, getPublicKey, storeIdentityMetadata } from '../utils/pqc';

import { BACKEND_URL } from '../constants/Config';

type AuthContextType = {
    isRegistered: boolean;
    isAuthenticated: boolean;
    user: any | null;
    role: string | null;
    loading: boolean;
    refreshStatus: () => Promise<void>;
    logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [isRegistered, setIsRegistered] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<any | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshStatus = async () => {
        try {
            const registered = await hasIdentity();
            setIsRegistered(registered);

            // Load local identity metadata if registered (even if not authenticated yet)
            if (registered) {
                let meta = await getIdentityMetadata();

                // --- SELF HEALING: If registered but no metadata, re-sync from server ---
                if (!meta) {
                    console.log('[Auth] Metadata missing but key found. Attempting Self-Healing Sync...');
                    try {
                        const pk = await getPublicKey();
                        if (pk) {
                            const syncResp = await axios.post(`${BACKEND_URL}/api/mobile/sync`, { publicKey: pk });
                            const { regUserId, username } = syncResp.data;
                            await storeIdentityMetadata(regUserId, username);
                            meta = { regUserId, username };
                            console.log('[Auth] Self-Healing Sync SUCCESS:', username);
                        }
                    } catch (syncErr) {
                        console.error('[Auth] Self-Healing Sync FAILED:', syncErr);
                    }
                }

                if (meta) {
                    setUser({ userId: meta.regUserId, username: meta.username });
                }
            } else {
                setUser(null);
            }

            const isReg = Platform.OS === 'web' ? false : await hasIdentity();
            setIsRegistered(isReg);

            const token = await UnifiedStorage.getItem('qgate_token');
            if (token) {
                try {
                    const resp = await axios.get(`${BACKEND_URL}/api/me`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    setUser(resp.data);
                    setRole(resp.data.role);
                    setIsAuthenticated(true);
                } catch (err: any) {
                    console.log('Token validation failed in refreshStatus:', err.message);
                    await UnifiedStorage.deleteItem('qgate_token');
                    setIsAuthenticated(false);
                    // Don't clear user here, keep metadata if registered
                    setRole(null);
                }
            } else {
                setIsAuthenticated(false);
                setRole(null);
            }
        } catch (err) {
            console.error('Auth refresh error:', err);
            // Fallback
            setIsAuthenticated(false);
            setUser(null);
            setRole(null);
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        await UnifiedStorage.deleteItem('qgate_token');
        setIsAuthenticated(false);
        setRole(null);
        // Refresh to reload metadata but clear auth session
        await refreshStatus();
    };

    useEffect(() => {
        refreshStatus();
    }, []);

    return (
        <AuthContext.Provider value={{ isRegistered, isAuthenticated, user, role, loading, refreshStatus, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};
