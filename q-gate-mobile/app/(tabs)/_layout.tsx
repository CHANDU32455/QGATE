import { Tabs } from 'expo-router';
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { NavIcons } from '../../constants/NavIcons';

export default function TabLayout() {
  const { isRegistered, role, loading } = useAuth();

  if (loading) return null;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#646cff',
        tabBarInactiveTintColor: '#888',
        headerShown: true,
        headerStyle: {
          backgroundColor: '#000',
          borderBottomWidth: 1,
          borderBottomColor: '#222',
        },
        headerTitleStyle: {
          fontWeight: '900',
          letterSpacing: 2,
          fontSize: 18,
          color: '#fff',
        },
        headerTintColor: '#fff',
        tabBarStyle: {
          height: 80,
          backgroundColor: 'rgba(10, 10, 12, 0.8)',
          borderTopWidth: 1,
          borderTopColor: 'rgba(100, 108, 255, 0.3)',
          elevation: 0,
          paddingBottom: Platform.OS === 'ios' ? 25 : 15,
          paddingTop: 10,
        },
        tabBarBackground: () => (
          <BlurView
            intensity={120} // Deeper blur
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        ),
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '900',
          letterSpacing: 1, // Refined letter spacing
          marginTop: 5, // Refined margin top
        },
        tabBarIconStyle: {
          // Standardizing icon container
        }
      }}>
      <Tabs.Screen
        name="profile"
        options={{
          title: 'VAULT',
          tabBarIcon: ({ color, focused }) => (
            <View style={{ alignItems: 'center', width: 60 }}>
              {focused && <View style={styles.activeIndicator} />}
              <NavIcons.Vault color={color} size={26} />
            </View>
          ),
          href: isRegistered ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'CONTROL',
          tabBarIcon: ({ color, focused }) => (
            <View style={{ alignItems: 'center', width: 60 }}>
              {focused && <View style={styles.activeIndicator} />}
              <NavIcons.Control color={color} size={26} />
            </View>
          ),
          href: role === 'admin' ? undefined : null,
        }}
      />
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  activeIndicator: {
    position: 'absolute',
    top: -10,
    width: 32,
    height: 3,
    backgroundColor: '#646cff',
    borderRadius: 2,
    // Universal shadow logic
    ...Platform.select({
      web: {
        boxShadow: '0 2px 6px rgba(100, 108, 255, 0.8)',
      },
      default: {
        shadowColor: '#646cff',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.8,
        shadowRadius: 6,
      }
    })
  }
});
