import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#020707' },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="home" />
        <Stack.Screen name="face-unlock" />
        <Stack.Screen name="qr-management" />
        <Stack.Screen name="guest-qr" />
        <Stack.Screen name="history" />
        <Stack.Screen name="alert-log" />
        <Stack.Screen name="profile" />
      </Stack>
    </AuthProvider>
  );
}