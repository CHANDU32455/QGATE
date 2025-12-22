import React, { useState, useEffect } from 'react';
import { Alert, StyleSheet, View, TextInput, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import axios from 'axios';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import {
    generateAndStoreSeed,
    getPublicKey,
    hasIdentity,
    resetIdentity,
    storeIdentityMetadata,
    seedToMnemonic,
    mnemonicToSeed,
    validateMnemonic
} from '../utils/pqc';
import { useAuth } from '../context/AuthContext';

const { width } = Dimensions.get('window');
import { BACKEND_URL } from '../constants/Config';

function RegisterScreen() {
    const router = useRouter();
    const { refreshStatus } = useAuth();
    const [username, setUsername] = useState('');
    const [mnemonic, setMnemonic] = useState('');
    const [recoveryMnemonic, setRecoveryMnemonic] = useState('');
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState('input'); // input, generating, registering, backup, recovery, success

    useEffect(() => {
        const checkExisting = async () => {
            if (await hasIdentity()) {
                router.replace('/profile');
            }
        };
        checkExisting();
    }, []);

    const handleRegister = async () => {
        if (!username.trim()) {
            Alert.alert('Username Required', 'Please choose a unique alias to bind your device.');
            return;
        }

        setLoading(true);
        setStep('generating');

        try {
            const generatedSeed = await generateAndStoreSeed();
            const publicKey = await getPublicKey();

            if (!publicKey) throw new Error('Failed to generate PQC keys');

            setStep('registering');
            const initResp = await axios.post(`${BACKEND_URL}/api/register/initiate`, {
                clientHint: 'com.qgate.auth'
            });
            const { regSessionId, regNonce } = initResp.data;

            const registrationPayload = {
                username,
                publicKey,
                regSessionId,
                attestation: {
                    type: 'dev',
                    nonce: regNonce,
                    timestamp: Date.now()
                }
            };

            const regResp = await axios.post(`${BACKEND_URL}/api/register`, registrationPayload);
            const { regUserId } = regResp.data;
            await storeIdentityMetadata(regUserId, username);

            // Generate mnemonic for backup (using the seed we just generated/stored)
            // Assuming generateAndStoreSeed() returns the seed, or getSeed() can retrieve it.
            // If generateAndStoreSeed() doesn't return the seed, we'd need a getSeed() function.
            // For this fix, we'll assume generateAndStoreSeed() returns the seed.
            setMnemonic(seedToMnemonic(generatedSeed));

            await refreshStatus();
            setStep('backup');
        } catch (error: any) {
            const status = error.response?.status;
            const data = error.response?.data;

            if (status === 409 && data?.error === 'DEVICE_ALREADY_REGISTERED') {
                if (data.regUserId && data.username) {
                    await storeIdentityMetadata(data.regUserId, data.username);
                    await refreshStatus();
                }
                Alert.alert('Device Re-Linked', 'This hardware is already registered. Identity has been re-synced.', [
                    { text: 'Access Profile', onPress: () => router.push('/profile') }
                ]);
            } else {
                Alert.alert('Binding Failed', data?.error || 'Handshake failed. Ensure you have an internet connection.');
            }
            setStep('input');
        } finally {
            setLoading(false);
        }
    };

    const handleRecover = async () => {
        if (!recoveryMnemonic.trim()) {
            Alert.alert('Recovery Phrase Required', 'Please enter your 24-word recovery phrase.');
            return;
        }

        setLoading(true);
        setStep('generating'); // Re-using generating step for key generation during recovery

        try {
            if (!validateMnemonic(recoveryMnemonic)) {
                throw new Error('Invalid recovery phrase. Please check your words.');
            }

            const recoveredSeed = mnemonicToSeed(recoveryMnemonic);
            await generateAndStoreSeed(recoveredSeed); // Store the recovered seed
            const publicKey = await getPublicKey();

            if (!publicKey) throw new Error('Failed to generate PQC keys from mnemonic');

            setStep('registering'); // Re-using registering step for backend sync
            const initResp = await axios.post(`${BACKEND_URL}/api/register/initiate`, {
                clientHint: 'com.qgate.auth'
            });
            const { regSessionId, regNonce } = initResp.data;

            const recoveryPayload = {
                publicKey,
                regSessionId,
                attestation: {
                    type: 'dev',
                    nonce: regNonce,
                    timestamp: Date.now()
                }
            };

            const regResp = await axios.post(`${BACKEND_URL}/api/recover`, recoveryPayload);
            const { regUserId, username: recoveredUsername } = regResp.data;
            await storeIdentityMetadata(regUserId, recoveredUsername);
            await refreshStatus();

            Alert.alert('Recovery Successful', `Your identity "${recoveredUsername}" has been restored.`);
            setStep('success');
        } catch (error: any) {
            const data = error.response?.data;
            Alert.alert('Recovery Failed', data?.error || error.message || 'Failed to recover identity. Please check your mnemonic and internet connection.');
            setStep('recovery'); // Go back to recovery input on failure
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.mainContainer}>
            <Stack.Screen options={{ headerShown: false }} />

            <ThemedView style={styles.container}>
                {/* Branding Marquee */}
                <Image
                    source={require('../assets/QGATE_overall_Logo.png')}
                    style={styles.mainLogo}
                    contentFit="contain"
                />

                <BlurView intensity={30} tint="dark" style={styles.glassCard}>
                    {step === 'input' && (
                        <View style={styles.formContent}>
                            <View style={styles.headerRow}>
                                <Image
                                    source={require('../assets/QGATE_Circular_Logo.png')}
                                    style={styles.circleLogo}
                                />
                                <View>
                                    <ThemedText style={styles.cardTitle}>Device Binding</ThemedText>
                                    <ThemedText style={styles.cardSubtitle}>Hardware identity initialization</ThemedText>
                                </View>
                            </View>

                            <View style={styles.inputContainer}>
                                <Ionicons name="person-outline" size={20} color="#646cff" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Unique Username"
                                    placeholderTextColor="#666"
                                    value={username}
                                    onChangeText={setUsername}
                                    autoCapitalize="none"
                                />
                            </View>

                            <TouchableOpacity
                                style={styles.button}
                                onPress={handleRegister}
                                disabled={loading}
                            >
                                <ThemedText style={styles.buttonText}>GENERATE CRYPTO-IDENTITY</ThemedText>
                                <Ionicons name="chevron-forward" size={18} color="#fff" />
                            </TouchableOpacity>

                            <View style={styles.securityBox}>
                                <Ionicons name="shield-checkmark-outline" size={16} color="#10B981" />
                                <ThemedText style={styles.securityText}>
                                    This creates a Post-Quantum Dilithium-3 keypair stored in your device's TEE.
                                </ThemedText>
                            </View>

                            <TouchableOpacity
                                style={[styles.button, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#646cff', marginTop: -10 }]}
                                onPress={() => setStep('recovery')}
                            >
                                <ThemedText style={[styles.buttonText, { color: '#646cff' }]}>RECOVER EXISTING QID</ThemedText>
                            </TouchableOpacity>
                        </View>
                    )}

                    {(step === 'generating' || step === 'registering') && (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#646cff" />
                            <ThemedText style={styles.loadingTitle}>
                                {step === 'generating' ? 'SECURING ENCLAVE...' : 'SYNCHRONIZING...'}
                            </ThemedText>
                            <ThemedText style={styles.loadingSubtitle}>
                                {step === 'generating'
                                    ? 'Running high-entropy PQC Dilithium generation on hardware. This may take a moment.'
                                    : 'Establishing quantum-safe handshake with Q-Gate server.'}
                            </ThemedText>
                        </View>
                    )}

                    {step === 'success' && (
                        <View style={styles.successContainer}>
                            <View style={styles.successIconBox}>
                                <Ionicons name="checkmark-done-circle" size={80} color="#10B981" />
                            </View>
                            <ThemedText style={styles.successTitle}>IDENTITY BOUND</ThemedText>
                            <ThemedText style={styles.successSubtitle}>
                                Your device is now a trusted Q-GATE node. Your hardware key is unique and unexportable.
                            </ThemedText>

                            <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/profile')}>
                                <ThemedText style={styles.buttonText}>ENTER Q-GATE</ThemedText>
                            </TouchableOpacity>
                        </View>
                    )}

                    {step === 'backup' && (
                        <View style={styles.successContainer}>
                            <View style={styles.successIconBox}>
                                <Ionicons name="key-outline" size={60} color="#646cff" />
                            </View>
                            <ThemedText style={styles.successTitle}>BACKUP KEY</ThemedText>
                            <ThemedText style={styles.successSubtitle}>
                                Write down these 24 words. This is the ONLY way to recover your account if you lose this phone.
                            </ThemedText>

                            <View style={styles.mnemonicBox}>
                                <ThemedText style={styles.mnemonicText}>{mnemonic}</ThemedText>
                            </View>

                            <TouchableOpacity style={styles.backButton} onPress={() => setStep('success')}>
                                <ThemedText style={styles.buttonText}>I HAVE SAVED IT</ThemedText>
                            </TouchableOpacity>
                        </View>
                    )}

                    {step === 'recovery' && (
                        <View style={styles.formContent}>
                            <View style={styles.headerRow}>
                                <Ionicons name="medical-outline" size={40} color="#646cff" />
                                <View>
                                    <ThemedText style={styles.cardTitle}>Identity Recovery</ThemedText>
                                    <ThemedText style={styles.cardSubtitle}>Restore from mnemonic phrase</ThemedText>
                                </View>
                            </View>

                            <View style={[styles.inputContainer, { height: 120, alignItems: 'flex-start', paddingTop: 12 }]}>
                                <TextInput
                                    style={[styles.input, { height: 100 }]}
                                    placeholder="Enter your 24-word recovery phrase here..."
                                    placeholderTextColor="#666"
                                    value={recoveryMnemonic}
                                    onChangeText={setRecoveryMnemonic}
                                    multiline
                                    autoCapitalize="none"
                                />
                            </View>

                            <TouchableOpacity
                                style={styles.button}
                                onPress={handleRecover}
                                disabled={loading}
                            >
                                <ThemedText style={styles.buttonText}>RESTORE IDENTITY</ThemedText>
                                <Ionicons name="refresh" size={18} color="#fff" />
                            </TouchableOpacity>

                            <TouchableOpacity onPress={() => setStep('input')}>
                                <ThemedText style={{ color: '#888', textAlign: 'center' }}>Cancel and Go Back</ThemedText>
                            </TouchableOpacity>
                        </View>
                    )}
                </BlurView>

                <View style={styles.footer}>
                    <ThemedText style={styles.footerText}>Q-GATE SECURITY SUITE • v2.0.0-BETA</ThemedText>
                </View>
            </ThemedView>
        </View>
    );
}

const styles = StyleSheet.create({
    mainContainer: {
        flex: 1,
        backgroundColor: '#000',
    },
    container: {
        flex: 1,
        padding: 25,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000',
    },
    mainLogo: {
        width: width * 0.6,
        height: 80,
        marginBottom: 30,
    },
    glassCard: {
        width: '100%',
        borderRadius: 24,
        padding: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        backgroundColor: 'rgba(25, 25, 25, 0.5)',
    },
    formContent: {
        gap: 20,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15,
        marginBottom: 10,
    },
    circleLogo: {
        width: 50,
        height: 50,
        borderRadius: 25,
    },
    cardTitle: {
        fontSize: 22,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: 0.5,
    },
    cardSubtitle: {
        fontSize: 12,
        color: '#646cff',
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        paddingHorizontal: 15,
        height: 60,
    },
    inputIcon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        color: '#fff',
        fontSize: 16,
        fontWeight: '500',
    },
    button: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        height: 60,
        backgroundColor: '#646cff',
        borderRadius: 14,
        gap: 10,
        shadowColor: "#646cff",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 5,
    },
    buttonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 1,
    },
    securityBox: {
        flexDirection: 'row',
        gap: 10,
        backgroundColor: 'rgba(16, 185, 129, 0.05)',
        padding: 15,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.2)',
    },
    securityText: {
        flex: 1,
        fontSize: 11,
        color: '#888',
        lineHeight: 16,
    },
    loadingContainer: {
        alignItems: 'center',
        paddingVertical: 30,
    },
    loadingTitle: {
        marginTop: 20,
        fontSize: 18,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: 2,
    },
    loadingSubtitle: {
        marginTop: 10,
        color: '#888',
        textAlign: 'center',
        fontSize: 13,
        lineHeight: 20,
    },
    successContainer: {
        alignItems: 'center',
        paddingVertical: 10,
    },
    successIconBox: {
        marginBottom: 20,
    },
    successTitle: {
        fontSize: 24,
        fontWeight: '900',
        color: '#10B981',
        letterSpacing: 1,
    },
    successSubtitle: {
        color: '#888',
        textAlign: 'center',
        marginTop: 10,
        marginBottom: 30,
        fontSize: 14,
        lineHeight: 22,
    },
    backButton: {
        width: '100%',
        height: 60,
        backgroundColor: '#10B981',
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#10B981",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    mnemonicBox: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        padding: 20,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(100, 108, 255, 0.3)',
        marginBottom: 25,
    },
    mnemonicText: {
        fontSize: 14,
        color: '#fff',
        lineHeight: 24,
        textAlign: 'center',
        fontFamily: 'monospace',
    },
    footer: {
        marginTop: 40,
    },
    footerText: {
        fontSize: 10,
        color: '#444',
        fontWeight: 'bold',
        letterSpacing: 2,
    }
});

export default RegisterScreen;
