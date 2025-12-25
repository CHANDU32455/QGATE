import React, { useState, useEffect, useCallback, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, ScrollView, RefreshControl, Dimensions, Modal, Platform } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withSequence,
} from 'react-native-reanimated';
import { Stack, useRouter } from 'expo-router';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import Scanner from '@/components/Scanner';
import BiometricAuth from '@/components/BiometricAuth';

import { useAuth } from '../../context/AuthContext';
import { signMessage, resetIdentity, generateAndStoreSeed, seedToMnemonic } from '../../utils/pqc';
import { UnifiedStorage } from '../../utils/storage';

import { BACKEND_URL } from '../../constants/Config';

export default function ProfileScreen() {
    const { isRegistered, isAuthenticated, user, refreshStatus, logout, loading: authLoading, role } = useAuth();
    const [sessions, setSessions] = useState<any[]>([]);
    const socketRef = useRef<Socket | null>(null);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all');
    const [showScanner, setShowScanner] = useState(false);
    const [sessionData, setSessionData] = useState<any>(null);
    const [unlocking, setUnlocking] = useState(false);
    const [unlockStatus, setUnlockStatus] = useState('');
    const router = useRouter();
    const { width } = Dimensions.get('window');

    // Animations
    const pulse = useSharedValue(1);
    const scanPos = useSharedValue(-100);

    useEffect(() => {
        pulse.value = withRepeat(
            withSequence(
                withTiming(1.2, { duration: 2000 }),
                withTiming(1, { duration: 2000 })
            ),
            -1,
            true
        );
    }, []);

    useEffect(() => {
        if (unlocking) {
            scanPos.value = withRepeat(
                withTiming(120, { duration: 1500 }),
                -1,
                false
            );
        } else {
            scanPos.value = -100;
        }
    }, [unlocking]);

    const animatedGlow = useAnimatedStyle(() => ({
        transform: [{ scale: pulse.value }],
        opacity: (pulse.value - 1) * 2 + 0.3,
    }));

    const animatedScanner = useAnimatedStyle(() => ({
        top: scanPos.value,
        opacity: unlocking ? 1 : 0,
    }));

    const fetchSessions = async () => {
        try {
            const token = await UnifiedStorage.getItem('qgate_token');
            if (!token) return;

            const config = { headers: { Authorization: `Bearer ${token}` } };
            const sessionResp = await axios.get(`${BACKEND_URL}/api/sessions`, config);
            setSessions(sessionResp.data);
        } catch (error: any) {
            console.error('Session fetch error:', error);
            if (error.response?.status === 401) {
                await logout();
            }
        }
    };

    const handleResetIdentity = () => {
        Alert.alert(
            'Reset Device Identity',
            'This deletes the local PQC seed. Use this if you cleared the server DB and need to re-register.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reset Identity',
                    style: 'destructive',
                    onPress: async () => {
                        await logout();
                        await resetIdentity();
                        await refreshStatus();
                        router.replace('/register');
                    }
                }
            ]
        );
    };

    useEffect(() => {
        if (isAuthenticated && user?.userId) {
            console.log('[Socket] Initializing User Global Sync for:', user.userId);
            const socket = io(BACKEND_URL);
            socketRef.current = socket;

            socket.on('connect', () => {
                console.log('[Socket] Connected, joining user room...');
                socket.emit('joinUser', user.userId);
            });

            socket.on('sessions_updated', () => {
                console.log('[Socket] Remote session change detected, refreshing list...');
                fetchSessions();
            });

            return () => {
                socket.disconnect();
                socketRef.current = null;
            };
        }
    }, [isAuthenticated, user?.userId]);

    useEffect(() => {
        if (isAuthenticated) {
            fetchSessions();
        }
    }, [isAuthenticated]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        if (isAuthenticated) {
            Promise.all([refreshStatus(), fetchSessions()]).then(() => setRefreshing(false));
        } else {
            refreshStatus().then(() => setRefreshing(false));
        }
    }, [isAuthenticated]);

    const handleUnlock = async () => {
        // Aggressive Self-Healing
        if (!user?.userId && isRegistered) {
            setUnlocking(true);
            setUnlockStatus('Restoring Identity...');
            await refreshStatus();
            setUnlocking(false);
        }

        if (!user?.userId) {
            Alert.alert('Identity Desync', 'Hardware metadata is missing. Pull to refresh or reset identity if the issue persists.');
            return;
        }

        setUnlocking(true);
        setUnlockStatus('Verifying Hardware...');
        try {
            // 1. Mandatory Biometric Check
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            if (!hasHardware) {
                Alert.alert('Hardware Error', 'Biometric scanner not found on this device.');
                return;
            }

            const auth = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Confirm Identity for Q-GATE Unlock',
                fallbackLabel: 'Enter PIN',
                disableDeviceFallback: false,
            });

            if (!auth.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                return;
            }

            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setUnlockStatus('Quantum Handshake...');

            // 2. Initiate
            const resp = await axios.post(`${BACKEND_URL}/api/initiate`, {
                regUserId: user.userId,
                clientHint: 'mobile-unlock'
            });
            const { sessionId, nonce } = resp.data;

            // 3. Sign
            setUnlockStatus('Securing Enclave...');
            const signature = await signMessage(nonce);
            if (!signature) throw new Error('Identity module failed');

            // 4. Verify
            setUnlockStatus('Authenticating...');
            const vResp = await axios.post(`${BACKEND_URL}/api/verify`, {
                sessionId,
                signature
            });

            const token = vResp.data.token;
            if (token) {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await UnifiedStorage.setItem('qgate_token', token);
                await refreshStatus();
            }
        } catch (error: any) {
            setUnlockStatus('');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            console.error('[Unlock] Handshake Error:', error);
            Alert.alert('Unlock Failed', error.response?.data?.error || 'Handshake failed.');
        } finally {
            setUnlocking(false);
            setUnlockStatus('');
        }
    };

    const handleViewMnemonic = async () => {
        try {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            if (!hasHardware) return;

            const auth = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Confirm Identity to view Recovery Phrase',
            });

            if (auth.success) {
                const seed = await generateAndStoreSeed();
                const phrase = seedToMnemonic(seed);
                Alert.alert(
                    'Recovery Phrase',
                    `Write these 24 words down:\n\n${phrase}`,
                    [
                        {
                            text: 'COPY TO CLIPBOARD',
                            onPress: async () => {
                                await Clipboard.setStringAsync(phrase);
                                Alert.alert('Copied', 'Phrase copied to clipboard.');
                            }
                        },
                        { text: 'I HAVE SAVED IT', style: 'default' }
                    ]
                );
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to retrieve recovery phrase');
        }
    };

    const handleLogout = async () => {
        Alert.alert('Logout', 'This will end your local session. You will need to re-verify biometrics to access profile.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Logout', style: 'destructive', onPress: async () => await logout() }
        ]);
    };

    const handleRevoke = async (targetToken: string, isCurrent: boolean) => {
        if (isCurrent) {
            Alert.alert('Caution', 'You are revoking your CURRENT session. You will be logged out.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Revoke & Logout', style: 'destructive', onPress: () => performRevoke(targetToken, true) }
            ]);
        } else {
            Alert.alert('Revoke Session', 'Remote device will be disconnected.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Revoke', style: 'destructive', onPress: () => performRevoke(targetToken, false) }
            ]);
        }
    };

    const performRevoke = async (targetToken: string, isCurrent: boolean) => {
        try {
            const token = await UnifiedStorage.getItem('qgate_token');
            await axios.delete(`${BACKEND_URL}/api/sessions/${targetToken}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (isCurrent) {
                await logout();
            } else {
                fetchSessions();
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to revoke session');
        }
    };

    const filteredSessions = sessions.filter(s => {
        if (statusFilter === 'all') return true;
        return s.status === statusFilter;
    });

    const handleScan = (data: string) => {
        try {
            const parsed = JSON.parse(data);
            if (parsed.sessionId && parsed.nonce) {
                setSessionData(parsed);
                setShowScanner(false);
            } else {
                Alert.alert('Invalid QR', 'This does not look like a Q-Gate login request.');
            }
        } catch (e) {
            Alert.alert('Error', 'Failed to parse QR code.');
        }
    };

    const renderSession = ({ item }: { item: any }) => (
        <BlurView intensity={20} tint="dark" style={[styles.sessionCard, item.isCurrent && styles.currentSession]}>
            <View style={styles.sessionHeader}>
                <Ionicons
                    name={item.status === 'authenticated' ? "checkmark-circle" : "time"}
                    size={20}
                    color={item.status === 'authenticated' ? "#22c55e" : "#eab308"}
                />
                <Text style={styles.sessionStatus}>{item.status.toUpperCase()}</Text>
                {item.isCurrent && <Text style={styles.currentBadge}>THIS DEVICE</Text>}
            </View>

            <Text style={styles.sessionToken}>Token: {item.token.slice(0, 12)}...</Text>
            <Text style={styles.sessionDate}>Issued: {new Date(item.issuedAt).toLocaleString()}</Text>

            <TouchableOpacity
                style={styles.revokeBtn}
                onPress={() => handleRevoke(item.token, item.isCurrent)}
            >
                <Text style={styles.revokeText}>Revoke Access</Text>
            </TouchableOpacity>
        </BlurView>
    );

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color="#646cff" style={{ marginTop: 50 }} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen
                options={{
                    title: isAuthenticated ? 'Your Q-GATE' : 'Authenticator',
                    headerRight: () => (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
                            {isAuthenticated && Platform.OS !== 'web' && (
                                <TouchableOpacity
                                    onPress={() => setShowScanner(true)}
                                    style={{ padding: 8 }}
                                >
                                    <Ionicons name="qr-code-outline" size={24} color="#646cff" />
                                </TouchableOpacity>
                            )}
                            {Platform.OS !== 'web' && (
                                <TouchableOpacity
                                    onPress={handleResetIdentity}
                                    style={{ padding: 8 }}
                                >
                                    <Ionicons name="refresh-circle-outline" size={26} color="#FF4B4B" />
                                </TouchableOpacity>
                            )}
                        </View>
                    )
                }}
            />
            {/* Scanner Modal */}
            <Modal visible={showScanner} animationType="slide" transparent={false}>
                <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setShowScanner(false)}>
                            <Ionicons name="close" size={30} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.modalTitle}>Scan for Handshake</Text>
                        <View style={{ width: 30 }} />
                    </View>
                    <Scanner onScan={handleScan} />
                </SafeAreaView>
            </Modal>

            {/* Auth Modal */}
            <Modal visible={!!sessionData} animationType="fade" transparent={true}>
                <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill}>
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <BiometricAuth
                            sessionData={sessionData}
                            onReset={() => {
                                setSessionData(null);
                                fetchSessions();
                            }}
                        />
                    </View>
                </BlurView>
            </Modal>

            {!isAuthenticated && Platform.OS !== 'web' ? (
                <View style={styles.lockedContainer}>
                    {/* Background Accents for Premium Feel */}
                    <View style={styles.bgCircle1} />
                    <View style={styles.bgCircle2} />

                    <BlurView intensity={60} tint="dark" style={styles.lockedCard}>
                        <View style={styles.logoContainer}>
                            {/* Pulsing Glow behind logo */}
                            <Animated.View style={[styles.pulseGlow, animatedGlow]} />

                            <View style={styles.biometricFrame}>
                                <Image
                                    source={require('../../assets/QGATE_Circular_Logo.png')}
                                    style={styles.lockedLogo}
                                />
                                <View style={styles.biometricOverlay}>
                                    <Ionicons name="finger-print" size={50} color="rgba(255, 255, 255, 0.9)" />
                                </View>
                            </View>

                            {/* Scanning line animation */}
                            {unlocking && (
                                <Animated.View style={[styles.scannerLine, animatedScanner]} />
                            )}
                        </View>

                        <Text style={styles.lockedTitle}>Q-GATE VAULT</Text>
                        <View style={styles.securityBadge}>
                            <Ionicons name="shield-checkmark" size={12} color="#646cff" />
                            <Text style={styles.securityText}>ESTABLISHED ENCLAVE ENCRYPTION</Text>
                        </View>

                        <Text style={styles.lockedSubtitle}>
                            Identity verified via ML-DSA. Biometric handshake required to release quantum keys.
                        </Text>


                        <TouchableOpacity
                            style={[styles.unlockBtn, unlocking && styles.unlockBtnActive]}
                            onPress={handleUnlock}
                            disabled={unlocking}
                            activeOpacity={0.8}
                        >
                            {unlocking ? (
                                <View style={styles.unlockLoading}>
                                    <ActivityIndicator color="#fff" />
                                    <Text style={styles.unlockStatusText}>{unlockStatus.toUpperCase()}</Text>
                                </View>
                            ) : (
                                <>
                                    <Ionicons name="finger-print" size={24} color="#fff" />
                                    <Text style={styles.unlockText}>UNLOCK</Text>
                                </>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.helpLink} onPress={handleResetIdentity}>
                            <Text style={styles.helpText}>Identity Desync? Reset Vault</Text>
                        </TouchableOpacity>
                    </BlurView>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#646cff" />}
                >
                    {/* User Info Section */}
                    <View style={styles.profileHeader}>
                        <View style={styles.avatarContainer}>
                            <Image
                                source={require('../../assets/QGATE_Circular_Logo.png')}
                                style={styles.profileCircleLogo}
                                contentFit="contain"
                            />
                        </View>
                        <Text style={styles.usernameText}>{user?.username || 'User'}</Text>
                        <Text style={styles.regIdText}>{user?.userId || 'QID-XXXX'}</Text>

                        <View style={styles.badgeContainer}>
                            <View style={styles.roleBadge}>
                                <Text style={styles.roleText}>
                                    {Platform.OS === 'web' ? 'WEB NODE' : (role?.toUpperCase() || 'USER')}
                                </Text>
                            </View>
                            <View style={styles.statusBadge}>
                                <View style={styles.statusDot} />
                                <Text style={styles.statusBadgeText}>ACTIVE</Text>
                            </View>
                        </View>

                        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                            <Ionicons name="log-out-outline" size={20} color="#FF4B4B" />
                            <Text style={styles.logoutText}>Sign Out</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.recoveryBtn} onPress={handleViewMnemonic}>
                            <Ionicons name="key-outline" size={20} color="#646cff" />
                            <Text style={styles.recoveryBtnText}>View Backup Phrase</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Sessions Section */}
                    <View style={styles.sessionsContainer}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Active Sessions</Text>
                            <View style={styles.filterContainer}>
                                {['all', 'authenticated', 'pending'].map(f => (
                                    <TouchableOpacity
                                        key={f}
                                        onPress={() => setStatusFilter(f)}
                                        style={[styles.filterChip, statusFilter === f && styles.activeFilter]}
                                    >
                                        <Text style={[styles.filterLabel, statusFilter === f && styles.activeFilterLabel]}>
                                            {f.charAt(0).toUpperCase() + f.slice(1)}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <FlatList
                            data={filteredSessions}
                            keyExtractor={(item) => item.token}
                            renderItem={renderSession}
                            scrollEnabled={false}
                            ListEmptyComponent={
                                <Text style={styles.emptyText}>No sessions found for this filter.</Text>
                            }
                        />
                    </View>
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    scrollContent: {
        paddingBottom: 40,
    },
    profileHeader: {
        alignItems: 'center',
        padding: 30,
        backgroundColor: '#111',
        borderBottomWidth: 1,
        borderBottomColor: '#222',
    },
    avatarContainer: {
        marginBottom: 15,
        borderRadius: 50,
        padding: 4,
        borderWidth: 2,
        borderColor: 'rgba(100, 108, 255, 0.4)',
        shadowColor: '#646cff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
    },
    usernameText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
    },
    regIdText: {
        fontSize: 14,
        color: '#646cff',
        marginTop: 5,
        fontFamily: 'monospace',
    },
    logoutBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 20,
        paddingVertical: 8,
        paddingHorizontal: 15,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 75, 75, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255, 75, 75, 0.3)',
    },
    logoutText: {
        color: '#FF4B4B',
        marginLeft: 8,
        fontWeight: '600',
    },
    recoveryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        paddingVertical: 8,
        paddingHorizontal: 15,
        borderRadius: 20,
        backgroundColor: 'rgba(100, 108, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(100, 108, 255, 0.3)',
    },
    recoveryBtnText: {
        color: '#646cff',
        marginLeft: 8,
        fontWeight: '600',
    },
    sessionsContainer: {
        padding: 20,
    },
    sectionHeader: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 15,
    },
    filterContainer: {
        flexDirection: 'row',
        gap: 10,
    },
    filterChip: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 15,
        backgroundColor: '#222',
        borderWidth: 1,
        borderColor: '#333',
    },
    activeFilter: {
        backgroundColor: '#646cff',
        borderColor: '#646cff',
    },
    filterLabel: {
        color: '#888',
        fontSize: 12,
    },
    activeFilterLabel: {
        color: '#fff',
        fontWeight: 'bold',
    },
    sessionCard: {
        padding: 15,
        borderRadius: 15,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: '#222',
        overflow: 'hidden',
    },
    currentSession: {
        borderColor: '#646cff',
        backgroundColor: 'rgba(100, 108, 255, 0.05)',
    },
    sessionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    sessionStatus: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#fff',
        marginLeft: 8,
    },
    currentBadge: {
        marginLeft: 'auto',
        fontSize: 10,
        backgroundColor: '#646cff',
        color: '#fff',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        overflow: 'hidden',
        fontWeight: 'bold',
    },
    sessionToken: {
        color: '#888',
        fontSize: 12,
        fontFamily: 'monospace',
        marginBottom: 4,
    },
    sessionDate: {
        color: '#555',
        fontSize: 10,
        marginBottom: 15,
    },
    revokeBtn: {
        paddingVertical: 10,
        alignItems: 'center',
        backgroundColor: '#1a1a1a',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#333',
    },
    revokeText: {
        color: '#FF4B4B',
        fontSize: 13,
        fontWeight: '600',
    },
    emptyText: {
        color: '#888',
        textAlign: 'center',
        marginTop: 30,
        fontStyle: 'italic',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
    },
    modalTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    lockedContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
        backgroundColor: '#000',
    },
    lockedTitle: {
        fontSize: 32,
        fontWeight: '900',
        color: '#fff',
        marginTop: 10,
        letterSpacing: 4,
        textAlign: 'center',
    },
    securityBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(100, 108, 255, 0.15)',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 20,
        marginTop: 10,
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(100, 108, 255, 0.3)',
    },
    securityText: {
        color: '#646cff',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1.5,
    },
    lockedSubtitle: {
        fontSize: 13,
        color: '#aaa',
        textAlign: 'center',
        marginTop: 20,
        marginBottom: 40,
        lineHeight: 20,
        paddingHorizontal: 10,
    },
    unlockBtn: {
        flexDirection: 'row',
        height: 70,
        width: '100%',
        backgroundColor: '#646cff',
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 15,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        ...Platform.select({
            web: {
                boxShadow: '0 8px 15px rgba(100, 108, 255, 0.3)',
            },
            default: {
                shadowColor: "#646cff",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.3,
                shadowRadius: 15,
                elevation: 10,
            }
        })
    },
    unlockBtnActive: {
        backgroundColor: '#4a51cc',
    },
    unlockText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '900',
        letterSpacing: 1,
    },
    helpLink: {
        marginTop: 35,
        paddingVertical: 10,
        paddingHorizontal: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    helpText: {
        color: '#666',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.5,
        textAlign: 'center',
    },
    lockedCard: {
        width: '100%',
        borderRadius: 32,
        padding: 40,
        alignItems: 'center',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        backgroundColor: 'rgba(20, 20, 20, 0.7)',
    },
    logoContainer: {
        position: 'relative',
        width: 120,
        height: 120,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    biometricFrame: {
        width: 110,
        height: 110,
        borderRadius: 55,
        borderWidth: 3,
        borderColor: 'rgba(100, 108, 255, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
        ...Platform.select({
            web: {
                boxShadow: '0 0 10px rgba(100, 108, 255, 0.5)',
            },
            default: {
                shadowColor: '#646cff',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.5,
                shadowRadius: 10,
            }
        })
    },
    biometricOverlay: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
    pulseGlow: {
        position: 'absolute',
        width: 130,
        height: 130,
        borderRadius: 65,
        backgroundColor: 'rgba(100, 108, 255, 0.3)',
    },
    scannerLine: {
        position: 'absolute',
        width: '140%',
        height: 3,
        backgroundColor: '#646cff',
        zIndex: 20,
        shadowColor: '#646cff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 10,
    },
    lockedLogo: {
        width: 90,
        height: 90,
        borderRadius: 45,
        opacity: 0.6,
    },
    profileCircleLogo: {
        width: 80,
        height: 80,
        borderRadius: 40,
    },
    bgCircle1: {
        position: 'absolute',
        top: -100,
        right: -100,
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: 'rgba(100, 108, 255, 0.05)',
    },
    bgCircle2: {
        position: 'absolute',
        bottom: -50,
        left: -50,
        width: 250,
        height: 250,
        borderRadius: 125,
        backgroundColor: 'rgba(100, 108, 255, 0.03)',
    },
    unlockLoading: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15,
    },
    unlockStatusText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '900',
        letterSpacing: 2,
    },
    badgeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 10,
        marginBottom: 5,
    },
    roleBadge: {
        backgroundColor: 'rgba(100, 108, 255, 0.15)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(100, 108, 255, 0.3)',
    },
    roleText: {
        color: '#646cff',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1.5,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#10B981',
        marginRight: 6,
    },
    statusBadgeText: {
        color: '#10B981',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1,
    }
});
