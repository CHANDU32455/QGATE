import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { UnifiedStorage } from '../../utils/storage';
import { Platform } from 'react-native';

import { BACKEND_URL } from '../../constants/Config';

export default function AdminScreen() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const token = await UnifiedStorage.getItem('qgate_token');
            const resp = await axios.get(`${BACKEND_URL}/api/admin/users`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUsers(resp.data);
        } catch (error) {
            console.error('Admin fetch error:', error);
            // Alert.alert('Error', 'Failed to fetch users');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleDelete = async (regUserId: string, username: string) => {
        Alert.alert(
            'Confirm Delete',
            `Are you sure you want to unbind device for ${username}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const token = await UnifiedStorage.getItem('qgate_token');
                            await axios.delete(`${BACKEND_URL}/api/admin/users/${regUserId}`, {
                                headers: { Authorization: `Bearer ${token}` }
                            });
                            Alert.alert('Success', 'Device binding removed');
                            fetchUsers();
                        } catch (error) {
                            Alert.alert('Error', 'Failed to delete binding');
                        }
                    }
                }
            ]
        );
    };

    const handleToggleRole = async (regUserId: string, currentRole: string, username: string) => {
        const newRole = currentRole === 'admin' ? 'user' : 'admin';
        Alert.alert(
            'Change Role',
            `Change role for ${username} to ${newRole}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Confirm',
                    onPress: async () => {
                        try {
                            const token = await UnifiedStorage.getItem('qgate_token');
                            await axios.patch(`${BACKEND_URL}/api/admin/users/${regUserId}/role`, { role: newRole }, {
                                headers: { Authorization: `Bearer ${token}` }
                            });
                            Alert.alert('Success', `Role updated to ${newRole}`);
                            fetchUsers();
                        } catch (error: any) {
                            Alert.alert('Error', error.response?.data?.error || 'Failed to update role');
                        }
                    }
                }
            ]
        );
    };

    const renderUser = ({ item }: { item: any }) => (
        <BlurView intensity={20} tint="dark" style={styles.userCard}>
            <View style={styles.userInfo}>
                <View style={styles.nameRow}>
                    <Text style={styles.username}>{item.username}</Text>
                    {item.role === 'admin' && (
                        <View style={styles.adminBadge}>
                            <Text style={styles.adminBadgeText}>ADMIN</Text>
                        </View>
                    )}
                </View>
                <Text style={styles.regId}>{item.regUserId}</Text>
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
            </View>
            <View style={styles.actionRow}>
                <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleToggleRole(item.regUserId, item.role, item.username)}
                >
                    <Ionicons
                        name={item.role === 'admin' ? "shield-checkmark" : "shield-outline"}
                        size={24}
                        color={item.role === 'admin' ? "#10B981" : "#646cff"}
                    />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleDelete(item.regUserId, item.username)}
                >
                    <Ionicons name="trash-outline" size={24} color="#FF4B4B" />
                </TouchableOpacity>
            </View>
        </BlurView>
    );

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    title: 'CONTROL CENTER',
                    headerStyle: { backgroundColor: '#000' },
                    headerTitleStyle: { fontWeight: '900' },
                    headerTintColor: '#fff',
                }}
            />

            <View style={styles.header}>
                <View style={styles.headerTitleRow}>
                    <Text style={styles.title}>Network Nodes</Text>
                    <View style={styles.pulseContainer}>
                        <View style={styles.pulseDot} />
                    </View>
                </View>
                <TouchableOpacity onPress={fetchUsers} style={styles.refreshBtn}>
                    <Ionicons name="refresh" size={24} color="#646cff" />
                </TouchableOpacity>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#646cff" style={{ marginTop: 50 }} />
            ) : (
                <FlatList
                    data={users}
                    keyExtractor={(item) => item.regUserId}
                    renderItem={renderUser}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={
                        <Text style={styles.emptyText}>No devices registered yet.</Text>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        marginTop: 10,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
    },
    refreshBtn: {
        padding: 5,
    },
    list: {
        padding: 15,
    },
    userCard: {
        flexDirection: 'row',
        padding: 20,
        borderRadius: 20,
        marginBottom: 15,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
    },
    userInfo: {
        flex: 1,
    },
    username: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
    },
    regId: {
        fontSize: 12,
        color: '#646cff',
        marginTop: 4,
        fontFamily: 'monospace',
    },
    date: {
        fontSize: 10,
        color: '#888',
        marginTop: 4,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    actionBtn: {
        justifyContent: 'center',
        paddingHorizontal: 8,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    adminBadge: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginLeft: 8,
        borderWidth: 1,
        borderColor: '#10B981',
    },
    adminBadgeText: {
        color: '#10B981',
        fontSize: 10,
        fontWeight: 'bold',
    },
    emptyText: {
        color: '#888',
        textAlign: 'center',
        marginTop: 50,
        fontSize: 16,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    pulseContainer: {
        marginLeft: 2,
        justifyContent: 'center',
    },
    pulseDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10B981',
        ...Platform.select({
            web: {
                boxShadow: '0 0 8px rgba(16, 185, 129, 0.8)',
            },
            default: {
                shadowColor: '#10B981',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 4,
            }
        })
    },
    adminMarquee: {
        width: 100,
        height: 30,
    }
});
