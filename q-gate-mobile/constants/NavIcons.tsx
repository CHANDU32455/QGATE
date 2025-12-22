import React from 'react';
import { Ionicons } from '@expo/vector-icons';

/**
 * Standardized icon set for the application's navigation.
 * Using Ionicons to maintain the sleek, modern aesthetic 
 * defined in your TabLayout.
 */
export const NavIcons = {
    // Represents the Secure Vault/Profile
    Vault: ({ color, size }: { color: string; size: number }) => (
        <Ionicons name="shield-checkmark" size={size} color={color} />
    ),

    // Represents the Admin Control Panel
    Control: ({ color, size }: { color: string; size: number }) => (
        <Ionicons name="stats-chart" size={size} color={color} />
    ),

    // Fallback icon just in case
    Default: ({ color, size }: { color: string; size: number }) => (
        <Ionicons name="help-circle-outline" size={size} color={color} />
    ),
};