import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, View } from "react-native";

import { useAuth } from "@/src/auth";
import { Badge, Button, Card, Field, T, useUI } from "@/src/components/ui";
import { exportBackupNow } from "@/src/data/backup-export";
import { fmtDate } from "@/src/lib/format";
import { spacing, useTheme } from "@/src/theme";

import { activateLicense, PURCHASE_URL, TRIAL_DAYS, useLicense } from "./state";

/** Status + activation form. `wall` = shown full screen after the trial ended. */
export function LicensePanel({ wall }: { wall?: boolean }) {
  const lic = useLicense();
  const { business } = useAuth();
  const { colors } = useTheme();
  const { toast } = useUI();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activate = async () => {
    setError(null);
    setBusy(true);
    const err = await activateLicense(code);
    setBusy(false);
    if (err) return setError(err);
    setCode("");
    toast("Lisensi aktif. Terima kasih telah membeli USAHORA!");
  };
  const backup = async () => {
    try {
      await exportBackupNow(business);
      toast("Backup berhasil dibuat");
    } catch {
      toast("Gagal membuat backup", "error");
    }
  };

  if (lic.kind === "licensed") {
    return (
      <Card testID="license-active">
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <T v="label">Lisensi aktif</T>
          <Badge label="Seumur hidup" tone="success" />
        </View>
        <T v="body" style={{ marginTop: spacing.sm }}>Dilisensikan untuk <T v="label">{lic.payload.name}</T></T>
        <T v="caption" style={{ marginTop: 4 }}>ID lisensi {lic.payload.id} · terbit {lic.payload.issued}</T>
        <T v="caption" style={{ marginTop: spacing.sm }}>Bayar sekali, tanpa langganan. Lisensi dicek di perangkat ini tanpa internet.</T>
      </Card>
    );
  }

  return (
    <Card testID="license-form">
      {lic.kind === "trial" ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
          <T v="label">Masa coba gratis</T>
          <Badge label={`${lic.daysLeft} hari lagi`} tone={lic.daysLeft <= 3 ? "warning" : "brand"} testID="license-trial-badge" />
        </View>
      ) : lic.kind === "expired" ? (
        <T v="label" color={colors.error} style={{ marginBottom: spacing.sm }}>Masa coba {TRIAL_DAYS} hari sudah berakhir</T>
      ) : null}
      {lic.kind === "trial" ? <T v="caption" style={{ marginBottom: spacing.md }}>Semua fitur bisa dipakai sampai {fmtDate(lic.endsAt)}. Setelah itu masukkan kode lisensi untuk lanjut. Data Anda tetap aman.</T> : null}
      {lic.kind === "expired" ? <T v="body" style={{ marginBottom: spacing.md }}>Data Anda tetap aman di perangkat ini. Masukkan kode lisensi untuk lanjut memakai USAHORA, atau ekspor backup data Anda.</T> : null}
      <Field label="Kode lisensi" value={code} onChangeText={setCode} placeholder="USAHORA-..." autoCapitalize="none" autoCorrect={false} multiline testID="license-code-input" />
      {error ? <T v="caption" color={colors.error} style={{ marginBottom: spacing.md }} testID="license-error">{error}</T> : null}
      <Button title="Aktifkan lisensi" icon="key-round" onPress={activate} loading={busy} disabled={!code.trim()} testID="license-activate-button" />
      {PURCHASE_URL ? (
        <Button title="Beli lisensi (sekali bayar)" icon="shopping-cart" variant="outline" style={{ marginTop: spacing.sm }} onPress={() => Linking.openURL(PURCHASE_URL)} testID="license-buy-button" />
      ) : (
        <T v="caption" style={{ marginTop: spacing.sm }}>Belum punya kode? Hubungi penjual USAHORA tempat Anda membeli.</T>
      )}
      {wall ? <Button title="Ekspor backup data" icon="download" variant="secondary" style={{ marginTop: spacing.sm }} onPress={backup} testID="license-backup-button" /> : null}
    </Card>
  );
}

/** Small dashboard notice during the trial. */
export function TrialBanner() {
  const lic = useLicense();
  const router = useRouter();
  const { colors } = useTheme();
  if (lic.kind !== "trial") return null;
  return (
    <Card testID="trial-banner" style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md, borderColor: lic.daysLeft <= 3 ? colors.warning : colors.border }}>
      <View style={{ flex: 1 }}>
        <T v="label">Masa coba: {lic.daysLeft} hari lagi</T>
        <T v="caption">Aktifkan lisensi sekali bayar agar bisa terus dipakai.</T>
      </View>
      <Button size="sm" title="Aktivasi" onPress={() => router.push("/license")} testID="trial-banner-activate" />
    </Card>
  );
}
