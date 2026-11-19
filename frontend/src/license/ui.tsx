import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Platform, View } from "react-native";

import { useAuth } from "@/src/auth";
import { Badge, Button, Card, Field, T, useUI } from "@/src/components/ui";
import { backupMessage, exportBackupNow } from "@/src/data/backup-export";
import { fmtDate } from "@/src/lib/format";
import { spacing, useTheme } from "@/src/theme";

import { getDeviceId } from "./device";
import { activateLicense, PURCHASE_URL, SELLER_WHATSAPP, TRIAL_DAYS, useLicense } from "./state";

/** Device ID the buyer sends to the seller to receive a code for this device. */
function DeviceIdBox() {
  const { colors } = useTheme();
  const { toast } = useUI();
  const { business } = useAuth();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    getDeviceId().then(setId);
  }, []);
  if (!id) return null;
  const copy = async () => {
    try {
      await (globalThis as any).navigator.clipboard.writeText(id);
      toast("ID perangkat disalin");
    } catch {
      toast("Salin manual: " + id, "info");
    }
  };
  const message = `Halo, saya ingin aktivasi USAHORA.
Nama usaha: ${business?.name ?? "-"}
ID perangkat: ${id}`;
  const wa = `https://wa.me/${SELLER_WHATSAPP}?text=${encodeURIComponent(message)}`;
  return (
    <View testID="device-id-box" style={{ backgroundColor: colors.surfaceTertiary, borderRadius: 12, padding: spacing.md, marginBottom: spacing.lg }}>
      <T v="caption">ID perangkat ini</T>
      <T v="h3" weight="bold" style={{ letterSpacing: 2, marginTop: 2 }} testID="device-id-text">{id}</T>
      <T v="caption" style={{ marginTop: 4 }}>Kirim ID ini ke penjual bersama bukti pembayaran. Kode lisensi hanya berlaku untuk perangkat ini.</T>
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
        {Platform.OS === "web" ? <Button size="sm" variant="outline" title="Salin ID" icon="copy" onPress={copy} style={{ flex: 1 }} testID="device-id-copy" /> : null}
        <Button size="sm" variant="outline" title="Kirim via WhatsApp" icon="message-circle" onPress={() => Linking.openURL(wa)} style={{ flex: 1 }} testID="device-id-whatsapp" />
      </View>
    </View>
  );
}

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
      const msg = backupMessage(await exportBackupNow(business));
      if (msg) toast(msg);
    } catch {
      toast("Gagal menyimpan cadangan. Coba lagi.", "error");
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
        <T v="caption" style={{ marginTop: 4 }}>ID lisensi {lic.payload.id} · perangkat {lic.payload.device} · terbit {lic.payload.issued}</T>
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
      {lic.kind === "expired" ? <T v="body" style={{ marginBottom: spacing.md }}>Data Anda tetap aman di perangkat ini. Masukkan kode lisensi untuk lanjut memakai USAHORA, atau simpan cadangan data Anda.</T> : null}
      <DeviceIdBox />
      <Field label="Kode lisensi" value={code} onChangeText={setCode} placeholder="USAHORA-..." autoCapitalize="none" autoCorrect={false} multiline testID="license-code-input" />
      {error ? <T v="caption" color={colors.error} style={{ marginBottom: spacing.md }} testID="license-error">{error}</T> : null}
      <Button title="Aktifkan lisensi" icon="key-round" onPress={activate} loading={busy} disabled={!code.trim()} testID="license-activate-button" />
      {PURCHASE_URL ? (
        <Button title="Beli lisensi (sekali bayar)" icon="shopping-cart" variant="outline" style={{ marginTop: spacing.sm }} onPress={() => Linking.openURL(PURCHASE_URL)} testID="license-buy-button" />
      ) : (
        <T v="caption" style={{ marginTop: spacing.sm }}>Belum punya kode? Hubungi penjual USAHORA tempat Anda membeli.</T>
      )}
      {wall ? <Button title="Simpan cadangan data" icon="download" variant="secondary" style={{ marginTop: spacing.sm }} onPress={backup} testID="license-backup-button" /> : null}
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
