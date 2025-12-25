import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, TextInput, Modal, ScrollView, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { UnifiedStorage } from '../../utils/storage';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

import { BACKEND_URL } from '../../constants/Config';

import { useAuth } from '../../context/AuthContext';

export default function AdminScreen() {
    const { role } = useAuth();
    const [users, setUsers] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [userSessions, setUserSessions] = useState<any[]>([]);
    const [modalLoading, setModalLoading] = useState(false);

    const fetchAllData = async (isSilent = false) => {
        try {
            if (!isSilent) setLoading(true);
            const token = await UnifiedStorage.getItem('qgate_token');
            const [usersResp, statsResp] = await Promise.all([
                axios.get(`${BACKEND_URL}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${BACKEND_URL}/api/admin/stats`, { headers: { Authorization: `Bearer ${token}` } })
            ]);
            setUsers(usersResp.data);
            setStats(statsResp.data);
        } catch (error) {
            console.error('Admin fetch error:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchAllData();
    }, []);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchAllData(true);
    }, []);

    const fetchUserSessions = async (regUserId: string) => {
        setModalLoading(true);
        try {
            const token = await UnifiedStorage.getItem('qgate_token');
            const resp = await axios.get(`${BACKEND_URL}/api/admin/users/${regUserId}/sessions`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUserSessions(resp.data);
        } catch (error) {
            console.error('Fetch sessions error:', error);
        } finally {
            setModalLoading(false);
        }
    };

    const handleSelectUser = (user: any) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSelectedUser(user);
        fetchUserSessions(user.regUserId);
    };

    const handleRevokeSession = async (tokenT: string) => {
        try {
            const token = await UnifiedStorage.getItem('qgate_token');
            await axios.delete(`${BACKEND_URL}/api/sessions/${tokenT}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            fetchUserSessions(selectedUser.regUserId);
            fetchAllData(true);
        } catch (error) {
            Alert.alert('Error', 'Failed to revoke session');
        }
    };

    const handleRevokeAll = async (regUserId: string) => {
        Alert.alert('Emergency Revoke', 'Disconnect ALL sessions for this user?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Revoke All',
                style: 'destructive',
                onPress: async () => {
                    try {
                        const token = await UnifiedStorage.getItem('qgate_token');
                        await axios.post(`${BACKEND_URL}/api/admin/users/${regUserId}/revoke-all`, {}, {
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                        fetchUserSessions(regUserId);
                        fetchAllData(true);
                    } catch (error) {
                        Alert.alert('Error', 'Failed to revoke sessions');
                    }
                }
            }
        ]);
    };

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
                            setSelectedUser(null);
                            fetchAllData(true);
                        } catch (error) {
                            Alert.alert('Error', 'Failed to delete binding');
                        }
                    }
                }
            ]
        );
    };

    const handleUpdateStatus = async (regUserId: string, newStatus: string) => {
        try {
            const token = await UnifiedStorage.getItem('qgate_token');
            await axios.patch(`${BACKEND_URL}/api/admin/users/${regUserId}/status`, { status: newStatus }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            // Update local state if user is selected
            if (selectedUser && selectedUser.regUserId === regUserId) {
                setSelectedUser({ ...selectedUser, status: newStatus });
                fetchUserSessions(regUserId);
            }
            fetchAllData(true);
        } catch (error) {
            Alert.alert('Error', 'Failed to update user status');
        }
    };

    const handleToggleRole = async (regUserId: string, currentRole: string, username: string) => {
        if (role !== 'admin') {
            Alert.alert('Restricted Access', 'Only the Root Administrator can adjust Node Privilege Levels.');
            return;
        }

        const newRole = currentRole === 'promoted_admin' ? 'user' : 'promoted_admin';
        Alert.alert(
            'Modify Privilege Level',
            `Elevate or Downgrade ${username} to ${newRole === 'promoted_admin' ? 'PROMOTED ADMIN' : 'USER'}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Execute Change',
                    onPress: async () => {
                        try {
                            const token = await UnifiedStorage.getItem('qgate_token');
                            await axios.patch(`${BACKEND_URL}/api/admin/users/${regUserId}/role`, { role: newRole }, {
                                headers: { Authorization: `Bearer ${token}` }
                            });
                            fetchAllData(true);
                            if (selectedUser) setSelectedUser({ ...selectedUser, role: newRole });
                        } catch (error: any) {
                            Alert.alert('Error', error.response?.data?.error || 'Failed to update role');
                        }
                    }
                }
            ]
        );
    };

    const filteredUsers = users
        .filter(u =>
            u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.regUserId.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .sort((a, b) => {
            // Sort by role (Root admin first, then Promoted, then User)
            const roleOrder: any = { admin: 0, promoted_admin: 1, user: 2 };
            const orderA = roleOrder[a.role] ?? 2;
            const orderB = roleOrder[b.role] ?? 2;

            if (orderA !== orderB) return orderA - orderB;
            return a.username.localeCompare(b.username);
        });

    const renderUser = ({ item }: { item: any }) => (
        <TouchableOpacity activeOpacity={0.7} onPress={() => handleSelectUser(item)}>
            <BlurView intensity={20} tint="dark" style={styles.userCard}>
                <View style={styles.userInfo}>
                    <View style={styles.nameRow}>
                        <Text style={styles.username}>{item.username}</Text>
                        {item.role === 'admin' && (
                            <View style={styles.adminBadge}>
                                <Text style={styles.adminBadgeText}>ROOT ADMIN</Text>
                            </View>
                        )}
                        {item.role === 'promoted_admin' && (
                            <View style={[styles.adminBadge, styles.promotedBadge]}>
                                <Text style={[styles.adminBadgeText, styles.promotedBadgeText]}>PROMOTED ADMIN</Text>
                            </View>
                        )}
                        <View style={[styles.statusBadge, (item.status === 'active' || !item.status) ? styles.statusActive : (item.status === 'locked' ? styles.statusLocked : styles.statusPending)]}>
                            <Text style={styles.statusBadgeText}>
                                {(item.status === 'active' || !item.status) ? 'LIVE' : (item.status === 'pending_recovery' ? 'SHIFT REQ' : 'LOCKED')}
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.regId}>{item.regUserId}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#333" />
            </BlurView>
        </TouchableOpacity>
    );

    const StatItem = ({ label, value, icon, color = "#646cff" }: any) => (
        <View style={styles.statBox}>
            <Ionicons name={icon} size={20} color={color} />
            <Text style={styles.statValue}>{value || '--'}</Text>
            <Text style={styles.statLabel}>{label}</Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    title: 'CONTROL CENTER',
                    headerStyle: { backgroundColor: '#000' },
                    headerTitleStyle: { fontWeight: '900', color: '#fff' },
                    headerTintColor: '#fff',
                }}
            />

            <FlatList
                data={filteredUsers}
                keyExtractor={(item) => item.regUserId}
                renderItem={renderUser}
                contentContainerStyle={styles.list}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#646cff" />}
                ListHeaderComponent={() => (
                    <View style={styles.listHeader}>
                        {/* Stats Panel */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll}>
                            <StatItem label="TOTAL NODES" value={stats?.totalUsers} icon="people" />
                            <StatItem label="ACTIVE SESSIONS" value={stats?.activeSessions} icon="flash" color="#eab308" />
                            <StatItem label="ENTROPY SOURCE" value={stats?.qrngStatus} icon="pulse" color="#10B981" />
                            <StatItem label="DB STATUS" value={stats?.dbStatus} icon="server" color="#646cff" />
                        </ScrollView>

                        {/* Search Bar */}
                        <View style={styles.searchContainer}>
                            <Ionicons name="search" size={20} color="#555" />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search by Username or QID..."
                                placeholderTextColor="#555"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')}>
                                    <Ionicons name="close-circle" size={20} color="#555" />
                                </TouchableOpacity>
                            )}
                        </View>

                        <Text style={styles.sectionTitle}>Network Nodes</Text>
                    </View>
                )}
                ListEmptyComponent={
                    <Text style={styles.emptyText}>{loading ? 'Loading Intelligence...' : 'No nodes matching query.'}</Text>
                }
            />

            {/* User Detail Modal */}
            <Modal visible={!!selectedUser} animationType="slide" transparent={true}>
                <BlurView intensity={100} tint="dark" style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Node Intelligence</Text>
                            <TouchableOpacity onPress={() => setSelectedUser(null)}>
                                <Ionicons name="close" size={28} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        {selectedUser && (
                            <ScrollView style={styles.modalBody}>
                                <View style={styles.detailHeader}>
                                    <Image source={require('../../assets/QGATE_Circular_Logo.png')} style={styles.detailLogo} />
                                    <View>
                                        <Text style={styles.detailName}>{selectedUser.username}</Text>
                                        <Text style={styles.detailQid}>{selectedUser.regUserId}</Text>
                                    </View>
                                </View>

                                <View style={styles.roleContainer}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.subTitle}>Account Status</Text>
                                        <TouchableOpacity
                                            style={[styles.statusBtn, (selectedUser.status === 'active' || !selectedUser.status) ? styles.statusActive : (selectedUser.status === 'locked' ? styles.statusLocked : styles.statusBtnPending)]}
                                            onPress={() => {
                                                const nextStatus = (selectedUser.status === 'active' || !selectedUser.status) ? 'locked' : 'active';
                                                handleUpdateStatus(selectedUser.regUserId, nextStatus);
                                            }}
                                        >
                                            <Ionicons name={(selectedUser.status === 'active' || !selectedUser.status) ? "checkmark-circle" : (selectedUser.status === 'locked' ? "lock-closed" : "alert-circle")} size={16} color="#fff" />
                                            <Text style={styles.roleBtnText}>
                                                {(selectedUser.status === 'active' || !selectedUser.status) ? 'LIVE' : (selectedUser.status === 'pending_recovery' ? 'PENDING SHIFT' : 'LOCKED')}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>

                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.subTitle}>Privilege Level</Text>
                                        <TouchableOpacity
                                            style={[styles.roleBtn, selectedUser.role === 'admin' ? styles.roleAdmin : (selectedUser.role === 'promoted_admin' ? styles.rolePromoted : styles.roleUser)]}
                                            onPress={() => handleToggleRole(selectedUser.regUserId, selectedUser.role, selectedUser.username)}
                                            disabled={role !== 'admin'}
                                        >
                                            <Ionicons name={selectedUser.role === 'admin' ? "shield-checkmark" : (selectedUser.role === 'promoted_admin' ? "ribbon" : "person")} size={16} color="#fff" />
                                            <Text style={styles.roleBtnText}>{(selectedUser.role || 'user').replace('_', ' ').toUpperCase()}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {selectedUser.status === 'pending_recovery' && (
                                    <BlurView intensity={20} tint="light" style={styles.recoveryAlert}>
                                        <Ionicons name="warning" size={24} color="#eab308" />
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.recoveryAlertTitle}>Recovery Verification Required</Text>
                                            <Text style={styles.recoveryAlertMeta}>A new device is requesting to bind via 24-word phrase.</Text>
                                            <TouchableOpacity
                                                style={styles.approveBtn}
                                                onPress={() => handleUpdateStatus(selectedUser.regUserId, 'active')}
                                            >
                                                <Text style={styles.approveBtnText}>Approve & Rebind Hardware</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </BlurView>
                                )}

                                <View style={styles.sessionsSection}>
                                    <View style={styles.sessionHeaderRow}>
                                        <Text style={styles.subTitle}>Live Sessions ({userSessions.length})</Text>
                                        {userSessions.length > 0 && (
                                            <TouchableOpacity onPress={() => handleRevokeAll(selectedUser.regUserId)}>
                                                <Text style={styles.revokeAllText}>REVOKE ALL</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    {modalLoading ? (
                                        <ActivityIndicator color="#646cff" style={{ margin: 20 }} />
                                    ) : (
                                        userSessions.map((s, idx) => (
                                            <View key={idx} style={styles.sessionItem}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.sessionToken}>{s.token.slice(0, 16)}...</Text>
                                                    <Text style={styles.sessionMeta}>{new Date(s.issuedAt).toLocaleString()}</Text>
                                                </View>
                                                <TouchableOpacity onPress={() => handleRevokeSession(s.token)}>
                                                    <Ionicons name="log-out-outline" size={20} color="#FF4B4B" />
                                                </TouchableOpacity>
                                            </View>
                                        ))
                                    )}
                                    {!modalLoading && userSessions.length === 0 && (
                                        <Text style={styles.noSessions}>No active sessions detected.</Text>
                                    )}
                                </View>

                                <TouchableOpacity
                                    style={[styles.deleteBtn, role !== 'admin' && { opacity: 0.5 }]}
                                    onPress={() => handleDelete(selectedUser.regUserId, selectedUser.username)}
                                    disabled={role !== 'admin'}
                                >
                                    <Ionicons name="trash-outline" size={18} color="#FF4B4B" />
                                    <Text style={styles.deleteText}>Unbind Hardware Component</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        )}
                    </View>
                </BlurView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    list: {
        paddingBottom: 40,
    },
    listHeader: {
        padding: 20,
    },
    statsScroll: {
        marginBottom: 20,
    },
    statBox: {
        backgroundColor: '#111',
        borderRadius: 16,
        padding: 15,
        marginRight: 12,
        minWidth: 120,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#222',
    },
    statValue: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '900',
        marginTop: 5,
    },
    statLabel: {
        color: '#555',
        fontSize: 10,
        fontWeight: 'bold',
        marginTop: 2,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#111',
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 50,
        borderWidth: 1,
        borderColor: '#222',
        marginBottom: 25,
    },
    searchInput: {
        flex: 1,
        color: '#fff',
        marginLeft: 10,
        fontSize: 14,
    },
    sectionTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    userCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        marginHorizontal: 15,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        backgroundColor: 'rgba(255,255,255,0.02)',
    },
    userInfo: {
        flex: 1,
    },
    username: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
    },
    regId: {
        fontSize: 11,
        color: '#646cff',
        marginTop: 2,
        fontFamily: 'monospace',
    },
    adminBadge: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 1,
        marginLeft: 8,
        borderWidth: 0.5,
        borderColor: '#10B981',
    },
    adminBadgeText: {
        color: '#10B981',
        fontSize: 9,
        fontWeight: 'bold',
    },
    promotedBadge: {
        backgroundColor: 'rgba(100, 108, 255, 0.1)',
        borderColor: '#646cff',
    },
    promotedBadgeText: {
        color: '#646cff',
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusBadge: {
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 1,
        marginLeft: 8,
        borderWidth: 0.5,
    },
    statusActive: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderColor: '#10B981',
    },
    statusLocked: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderColor: '#EF4444',
    },
    statusPending: {
        backgroundColor: 'rgba(234, 179, 8, 0.1)',
        borderColor: '#EAB308',
    },
    statusBadgeText: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#fff',
    },
    statusBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        marginTop: 10,
    },
    statusBtnPending: {
        backgroundColor: '#EAB308',
    },
    rolePromoted: {
        backgroundColor: '#646cff',
    },
    roleAdmin: {
        backgroundColor: '#10B981',
    },
    roleUser: {
        backgroundColor: '#333',
    },
    recoveryAlert: {
        flexDirection: 'row',
        padding: 16,
        borderRadius: 16,
        marginTop: 20,
        gap: 12,
        backgroundColor: 'rgba(234, 179, 8, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(234, 179, 8, 0.3)',
    },
    recoveryAlertTitle: {
        color: '#EAB308',
        fontSize: 14,
        fontWeight: 'bold',
    },
    recoveryAlertMeta: {
        color: '#888',
        fontSize: 12,
        marginTop: 4,
    },
    approveBtn: {
        backgroundColor: '#fff',
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 8,
        marginTop: 12,
        alignSelf: 'flex-start',
    },
    approveBtnText: {
        color: '#000',
        fontSize: 12,
        fontWeight: 'bold',
    },
    emptyText: {
        color: '#444',
        textAlign: 'center',
        marginTop: 40,
        fontSize: 14,
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#050505',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        height: '85%',
        padding: 24,
        borderTopWidth: 1,
        borderTopColor: '#222',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 30,
    },
    modalTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: 1,
    },
    modalBody: {
        flex: 1,
    },
    detailHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15,
        marginBottom: 30,
    },
    detailLogo: {
        width: 60,
        height: 60,
        borderRadius: 30,
        borderWidth: 2,
        borderColor: '#646cff',
    },
    detailName: {
        color: '#fff',
        fontSize: 24,
        fontWeight: 'bold',
    },
    detailQid: {
        color: '#646cff',
        fontSize: 14,
        fontFamily: 'monospace',
    },
    subTitle: {
        color: '#888',
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 10,
        letterSpacing: 1,
    },
    roleContainer: {
        marginBottom: 30,
    },
    roleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 12,
        gap: 8,
    },
    roleBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    sessionsSection: {
        marginBottom: 40,
    },
    sessionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
    },
    revokeAllText: {
        color: '#FF4B4B',
        fontSize: 12,
        fontWeight: 'bold',
    },
    sessionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#111',
        padding: 15,
        borderRadius: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#222',
    },
    sessionToken: {
        color: '#fff',
        fontSize: 13,
        fontFamily: 'monospace',
    },
    sessionMeta: {
        color: '#444',
        fontSize: 11,
        marginTop: 2,
    },
    noSessions: {
        color: '#333',
        textAlign: 'center',
        marginTop: 10,
        fontStyle: 'italic',
    },
    deleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: 'rgba(255, 75, 75, 0.2)',
        backgroundColor: 'rgba(255, 75, 75, 0.05)',
        gap: 10,
        marginBottom: 20,
    },
    deleteText: {
        color: '#FF4B4B',
        fontWeight: 'bold',
        fontSize: 14,
    }
});
