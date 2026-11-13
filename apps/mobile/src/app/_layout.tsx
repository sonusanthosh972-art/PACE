import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display/700Bold';
import { PlayfairDisplay_600SemiBold } from '@expo-google-fonts/playfair-display/600SemiBold';
import { useFonts } from 'expo-font';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLock } from '@/components/AppLock';
import { DeviceSync } from '@/components/DeviceSync';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NetworkBanner } from '@/components/NetworkBanner';
import { SplashScreenView } from '@/components/SplashScreenView';
import { ToastContainer } from '@/components/Toast';
import { ErrorState } from '@/components/States';
import { useSplash } from '@/state/splashStore';
import { useSettings } from '@/state/queries';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { MOTION } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_600SemiBold,
  });
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary>
            <AppShell fontsReady={fontsLoaded || fontError !== null} />
            <ToastContainer />
          </ErrorBoundary>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppShell({ fontsReady }: { fontsReady: boolean }) {
  const settings = useSettings();
  const ready = fontsReady && !settings.isPending;
  const splashDismissed = useSplash((s) => s.dismissed);
  const dismissSplash = useSplash((s) => s.dismiss);

  useEffect(() => {
    // Hide OS native splash as soon as React mounts and our branded splash is rendered
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <ThemeProvider>
      {settings.isError ? (
        <StartupError onRetry={() => settings.refetch()} />
      ) : (
        <>
          <DeviceSync />
          <ThemedStack />
          {/* Mounted under the splash, so the app is never visible before the lock. */}
          {ready && (
            <AppLock
              onboardingComplete={Boolean(settings.data?.onboardingComplete)}
              canPrompt={splashDismissed}
            />
          )}
        </>
      )}
      {!splashDismissed && <SplashScreenView ready={ready} onFinish={dismissSplash} />}
    </ThemeProvider>
  );
}

function StartupError({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.flex, styles.center, { backgroundColor: colors.bg }]}>
      <ErrorState
        title="Could not open your data"
        body="The on-device database did not open. Restart the app; if it keeps happening, reinstalling resets it."
        onRetry={onRetry}
      />
    </View>
  );
}

function ThemedStack() {
  const { colors, reducedMotion } = useTheme();
  return (
    <>
      <NetworkBanner />
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          // Going deeper (a settings page, the review list) slides in from the right.
          animation: reducedMotion ? 'fade' : 'slide_from_right',
          animationDuration: MOTION.screenMs,
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: 'Inter_600SemiBold' },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="onboarding" />
        <Stack.Screen
          name="add"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.85],
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
            contentStyle: { backgroundColor: colors.surface },
          }}
        />
        <Stack.Screen
          name="transaction/[id]"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.9],
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
            contentStyle: { backgroundColor: colors.surface },
          }}
        />
        <Stack.Screen name="review" options={{ headerShown: true, title: 'To review' }} />
        <Stack.Screen
          name="settings/budget"
          options={{ headerShown: true, title: 'Salary & savings' }}
        />
        <Stack.Screen
          name="settings/fixed-expenses"
          options={{ headerShown: true, title: 'Fixed expenses' }}
        />
        <Stack.Screen
          name="settings/notifications"
          options={{ headerShown: true, title: 'Notifications' }}
        />
        <Stack.Screen
          name="settings/auth"
          options={{ headerShown: true, title: 'Account & Backup' }}
        />
        <Stack.Screen
          name="settings/delete-data"
          options={{ headerShown: true, title: 'Delete all my data' }}
        />
        <Stack.Screen
          name="settings/exit-sample"
          options={{ headerShown: true, title: 'Use my real data' }}
        />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { justifyContent: 'center' },
});
