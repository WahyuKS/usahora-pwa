import { Lucide } from "@react-native-vector-icons/lucide";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { LogBox, Platform, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AuthProvider, useAuth } from "@/src/auth";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { Loading, UIProvider } from "@/src/components/ui";
import { refreshLicense, useLicense } from "@/src/license/state";
import { ActivationScreen } from "@/src/license/activation-screen";
import { queryClient } from "@/src/query-client";
import { loadThemePreference, useTheme } from "@/src/theme";

/** Keeps the status bar and (on web) the page background / browser bar colour in sync with the theme. */
function ThemeChrome() {
  const { scheme, colors } = useTheme();
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    document.documentElement.style.colorScheme = scheme;
    document.body.style.backgroundColor = colors.surfaceSecondary;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", scheme === "dark" ? colors.surfaceSecondary : "#2563EB");
  }, [scheme, colors]);
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}

LogBox.ignoreAllLogs(true);

// Screens a cashier may not open (server also enforces these permissions).
const OWNER_ROUTES = ["finance", "reports", "purchases", "purchase-form", "purchase", "suppliers", "invoices", "invoice-form", "invoice", "bills", "product-form"];

function Gate() {
  const { status, isOwner } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const license = useLicense();
  // The license is checked when the app opens (before setup) and every 30 minutes (fully offline).
  useEffect(() => {
    refreshLicense();
    const t = setInterval(() => refreshLicense(), 30 * 60 * 1000);
    return () => clearInterval(t);
  }, [status]);
  useEffect(() => {
    if (status === "loading") return;
    const inAuth = segments[0] === "(auth)";
    if (status === "out" && !inAuth) router.replace("/login");
    if (status === "in" && inAuth) router.replace("/");
    if (status === "in" && !isOwner && OWNER_ROUTES.includes(String(segments[0]))) router.replace("/pos");
  }, [status, segments, router, isOwner]);
  if (status === "loading" || license.kind === "loading") return <Loading />;
  if (license.kind === "unlicensed") {
    // No free trial: the first screen asks for a license code. Data already on the device stays safe
    // and can be backed up from this screen.
    return <ActivationScreen />;
  }
  return <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />;
}

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== "web") loadThemePreference().catch(() => {});
  }, []);
  const [loaded] = useFonts({
    "Inter-Regular": require("../assets/fonts/Inter-Regular.ttf"),
    "Inter-Medium": require("../assets/fonts/Inter-Medium.ttf"),
    "Inter-SemiBold": require("../assets/fonts/Inter-SemiBold.ttf"),
    "Inter-Bold": require("../assets/fonts/Inter-Bold.ttf"),
    ...((Lucide as any).font ?? {}),
  });
  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <ThemeChrome />
            {loaded ? (
              <UIProvider>
                <AuthProvider>
                  <Gate />
                </AuthProvider>
              </UIProvider>
            ) : (
              <Loading />
            )}
          </KeyboardProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
