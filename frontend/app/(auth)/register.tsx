import { Link } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { useAuth } from "@/src/auth";
import { Button, Field, T } from "@/src/components/ui";
import { spacing, useTheme } from "@/src/theme";
import { AuthShell } from "./login";

export default function Register() {
  const { register } = useAuth();
  const { colors } = useTheme();
  const [f, setF] = useState({ name: "", business_name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setError(null);
    if (!f.name.trim()) return setError("Nama wajib diisi");
    if (!f.business_name.trim()) return setError("Nama usaha wajib diisi");
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return setError("Masukkan email yang valid");
    if (f.password.length < 8) return setError("Kata sandi minimal 8 karakter");
    setBusy(true);
    try {
      await register(f);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Buat akun" subtitle="Mulai kelola usaha Anda dalam 1 menit">
      <Field label="Nama Anda" testID="register-name-input" value={f.name} onChangeText={set("name")} placeholder="Contoh: Budi" />
      <Field label="Nama usaha" testID="register-business-input" value={f.business_name} onChangeText={set("business_name")} placeholder="Contoh: Toko Maju Jaya" />
      <Field label="Email" testID="register-email-input" value={f.email} onChangeText={set("email")} autoCapitalize="none" keyboardType="email-address" placeholder="nama@usaha.com" />
      <Field label="Kata sandi" testID="register-password-input" value={f.password} onChangeText={set("password")} secureTextEntry placeholder="Minimal 8 karakter" help="Kata sandi disimpan terenkripsi (hash), tidak pernah dalam bentuk asli." />
      {error ? <T v="caption" color={colors.error} testID="register-error" style={{ marginBottom: spacing.md }}>{error}</T> : null}
      <Button title="Daftar" onPress={submit} loading={busy} testID="register-submit-button" size="lg" />
      <View style={{ flexDirection: "row", justifyContent: "center", marginTop: spacing.lg, gap: 4 }}>
        <T v="body" color={colors.muted}>Sudah punya akun?</T>
        <Link href="/login" testID="go-login-link"><T v="label" color={colors.brandPrimary}>Masuk</T></Link>
      </View>
    </AuthShell>
  );
}
