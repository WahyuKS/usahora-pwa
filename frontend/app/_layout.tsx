import { Lucide } from "@react-native-vector-icons/lucide";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { LogBox, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AuthProvider, useAuth } from "@/src/auth";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { Loading, UIProvider } from "@/src/components/ui";
import { queryClient } from "@/src/query-client";

LogBox.ignoreAllLogs(true);

// Screens a cashier may not open (server also enforces these permissions).
const OWNER_ROUTES = ["finance", "reports", "purchases", "purchase-form", "purchase", "suppliers", "invoices", "invoice-form", "invoice", "bills", "product-form"];

function Gate() {
  const { status, isOwner } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    if (status === "loading") return;
    const inAuth = segments[0] === "(auth)";
    if (status === "out" && !inAuth) router.replace("/login");
    if (status === "in" && inAuth) router.replace("/");
    if (status === "in" && !isOwner && OWNER_ROUTES.includes(String(segments[0]))) router.replace("/pos");
  }, [status, segments, router, isOwner]);
  if (status === "loading") return <Loading />;
  return <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />;
}

export default function RootLayout() {
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
            <StatusBar style="dark" />
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
