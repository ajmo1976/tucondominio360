import { useEffect, useRef } from 'react';
import { Stack, useSegments, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { CondoProvider } from '../contexts/CondoContext';
import { View, ActivityIndicator } from 'react-native';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const initialized = useRef(false);

  useEffect(() => {
    if (loading) return;

    SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      // Sin sesión y no está en login: redirigir a login
      router.replace('/(auth)/login');
    } else if (session && (inAuthGroup || !initialized.current)) {
      // Con sesión entrando por primera vez o estando en login: ir a tabs
      initialized.current = true;
      if (inAuthGroup) {
        router.replace('/(tabs)');
      }
    }
  }, [session, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <CondoProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </CondoProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
