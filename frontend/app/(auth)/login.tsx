import { Link } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Button, Card, Field, Logo, T } from "@/src/components/ui";
import { spacing, useTheme } from "@/src/theme";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceInverse }}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl, paddingHorizontal: spacing.lg }}>
        <View style={{ width: "100%", maxWidth: 440, alignSelf: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Logo size={44} />
            <T v="h2" color={colors.onSurfaceInverse} style={{ letterSpacing: 2 }}>USAHORA</T>
          </View>
          <T v="display" color={colors.onSurfaceInverse} style={{ marginTop: spacing.xxl }}>Manage smarter.{"\n"}Grow further.</T>
          <T v="body" color={colors.borderStrong} style={{ marginTop: spacing.sm, marginBottom: spacing.xl }}>Sistem manajemen usaha untuk UMKM: kasir, stok, keuangan, invoice, dan laporan dalam satu aplikasi yang tetap jalan saat offline.</T>
          <Card>
            <T v="h2">{title}</T>
            <T v="caption" style={{ marginTop: 4, marginBottom: spacing.xl }}>{subtitle}</T>
            {children}
          </Card>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

export default function Login() {
  const { login } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Masukkan email yang valid");
    if (!password) return setError("Masukkan kata sandi");
    setBusy(true);
    try {
      await login(email, password);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Masuk" subtitle="Masuk ke akun usaha Anda">
      <Field label="Email" testID="login-email-input" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="nama@usaha.com" />
      <Field label="Kata sandi" testID="login-password-input" value={password} onChangeText={setPassword} secureTextEntry placeholder="Kata sandi" onSubmitEditing={submit} />
      {error ? <T v="caption" color={colors.error} testID="login-error" style={{ marginBottom: spacing.md }}>{error}</T> : null}
      <Button title="Masuk" onPress={submit} loading={busy} testID="login-submit-button" size="lg" />
      <View style={{ flexDirection: "row", justifyContent: "center", marginTop: spacing.lg, gap: 4 }}>
        <T v="body" color={colors.muted}>Belum punya akun?</T>
        <Link href="/register" testID="go-register-link"><T v="label" color={colors.brandPrimary}>Daftar gratis</T></Link>
      </View>
    </AuthShell>
  );
}
