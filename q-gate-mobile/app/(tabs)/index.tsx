import { StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { hasIdentity } from '../../utils/pqc';
import { useAuth } from '../../context/AuthContext';

export default function HomeScreen() {
  const [hasId, setHasId] = useState<boolean | null>(null);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    hasIdentity().then(setHasId);
  }, []);

  if (hasId === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator size="large" color="#646cff" />
      </View>
    );
  }

  return <Redirect href={hasId ? "/profile" : "/register"} />;
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
});
