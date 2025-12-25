import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, TouchableOpacity, Dimensions } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import axios from 'axios';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { signMessage } from '../utils/pqc';
import { useAuth } from '../context/AuthContext';
import { ThemedText } from './themed-text';
import { UnifiedStorage } from '../utils/storage';

const { width } = Dimensions.get('window');

// IMPORTANT: Replace with your machine's local IP address
import { BACKEND_URL } from '../constants/Config';

type BiometricAuthProps = {
  sessionData: {
    sessionId: string;
    nonce: string;
    regUserId?: string;
  };
  onReset: () => void;
};

export default function BiometricAuth({ sessionData, onReset }: BiometricAuthProps) {
  const { user: authUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [status, setStatus] = useState('Challenge Received');

  const authenticate = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        Alert.alert('Hardware Error', 'Biometric scanner not detected.');
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm Identity for Q-Gate Access',
        fallbackLabel: 'Enter Passcode',
      });

      if (result.success) {
        handleServerVerification();
      } else {
        setStatus('Verification cancelled');
      }
    } catch (error) {
      console.error(error);
      setStatus('System Error');
    }
  };

  const handleServerVerification = async () => {
    setLoading(true);
    setVerifying(true); // Start scanning effect
    setStatus('Computing PQ Signature...');

    try {
      const signature = await signMessage(sessionData.nonce);

      if (!signature) {
        throw new Error('Identity not found. Please register first.');
      }

      const useRemoteVerify = !!sessionData.sessionId && authUser?.userId;
      const verifyEndpoint = useRemoteVerify ? '/api/mobile/verify' : '/api/verify';

      const payload = {
        sessionId: sessionData.sessionId,
        signature: signature,
        regUserId: authUser?.userId || sessionData.regUserId
      };

      setStatus('Synchronizing with Gate...');
      const resp = await axios.post(`${BACKEND_URL}${verifyEndpoint}`, payload);

      const token = resp.data.token;
      if (token && !useRemoteVerify) {
        // Only save token locally if it's a local unlock, NOT for web login
        await UnifiedStorage.setItem('qgate_token', token);
      }

      setStatus('Access Granted ✅');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Auto-close after 1.5s so user sees the success
      setTimeout(() => {
        if (onReset) onReset();
      }, 1500);

    } catch (error: any) {
      console.error('Verification error:', error);
      setStatus('Verification Failed ❌');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const errorData = error.response?.data;
      let errorMsg = errorData?.error || 'Quantum signature mismatch or connection lost.';

      if (errorData?.message) {
        errorMsg = errorData.message;
      }

      Alert.alert('Access Denied', errorMsg);
    } finally {
      setLoading(false);
      setVerifying(false); // Stop scanning effect
    }
  };

  return (
    <View style={styles.outerContainer}>
      <View style={styles.qrCard}>
        <View style={styles.qrHeader}>
          <ThemedText style={styles.qrTitle}>Security Challenge</ThemedText>
          <ThemedText style={styles.qrSubtitle}>Session: {sessionData.sessionId.slice(0, 8)}</ThemedText>
        </View>

        <View style={styles.iconContainer}>
          <View style={styles.biometricFrame}>
            <Ionicons name="finger-print" size={54} color="#646cff" />
            {verifying && <View style={styles.scanningLine} />}
          </View>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.statusText}>{status}</Text>
        </View>
      </View>

      <View style={styles.actionSection}>
        {loading ? (
          <ActivityIndicator size="large" color="#646cff" />
        ) : (
          <>
            <TouchableOpacity style={styles.authButton} onPress={authenticate} activeOpacity={0.8}>
              <Text style={styles.buttonText}>Authenticate Securely</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={onReset}>
              <Text style={styles.cancelText}>DISCARD SESSION</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  iconContainer: {
    alignItems: 'center',
    marginVertical: 25,
  },
  biometricFrame: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: 'rgba(100, 108, 255, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(100, 108, 255, 0.05)',
    overflow: 'hidden',
    position: 'relative',
  },
  scanningLine: {
    position: 'absolute',
    width: '100%',
    height: 2,
    backgroundColor: '#646cff',
    top: '50%',
    shadowColor: '#646cff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 5,
  },
  qrCard: {
    backgroundColor: '#252528',
    borderRadius: 30,
    padding: 25,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3a3a3d',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 20,
  },
  qrHeader: {
    marginBottom: 20,
    alignItems: 'center',
  },
  qrTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#646cff',
    letterSpacing: 0.5,
  },
  qrSubtitle: {
    fontSize: 10,
    color: '#666',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  infoBox: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#1a1a1c',
    borderRadius: 20,
    width: '100%',
    alignItems: 'center',
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  actionSection: {
    marginTop: 40,
    width: '100%',
    alignItems: 'center',
  },
  authButton: {
    backgroundColor: '#646cff',
    height: 70,
    width: '100%',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#646cff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelButton: {
    marginTop: 20,
    padding: 10,
  },
  cancelText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
});