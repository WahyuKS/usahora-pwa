import { useEffect, useState } from "react";
import { Linking, Platform, View } from "react-native";

import { useAuth } from "@/src/auth";
import { Badge, Button, Card, Field, T, useUI } from "@/src/components/ui";
import { backupMessage, exportBackupNow } from "@/src/data/backup-export";
import { spacing, useTheme } from "@/src/theme";

import { getDeviceId } from "./device";
import { activateLicense, PURCHASE_URL, SELLER_WHATSAPP, useLicense } from "./state";

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
  const message = `Halo, saya ingin membeli / mengaktifkan lisensi USAHORA.${business?.name ? `\nNama usaha: ${business.name}` : ""}\nID perangkat: ${id}`;
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

/** Status + activation form. `wall` = shown full screen until a license is active. */
export function LicensePanel({ wall }: { wall?: boolean }) {
  const lic = useLicense();
  const { business, status } = useAuth();
  // A business is open on this device (e.g. data from an earlier install): offer a backup too.
  const hasData = status === "in";
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
      <T v="body" style={{ marginBottom: spacing.md }}>
        {hasData
          ? "Lisensi di perangkat ini belum aktif. Data Anda tetap aman. Masukkan kode lisensi untuk lanjut, atau simpan cadangan data Anda."
          : "Untuk mulai memakai USAHORA, kirim ID perangkat di bawah ke penjual bersama bukti pembayaran. Anda akan menerima kode lisensi untuk perangkat ini."}
      </T>
      <DeviceIdBox />
      <Field label="Kode lisensi" value={code} onChangeText={setCode} placeholder="USAHORA-..." autoCapitalize="none" autoCorrect={false} multiline testID="license-code-input" />
      {error ? <T v="caption" color={colors.error} style={{ marginBottom: spacing.md }} testID="license-error">{error}</T> : null}
      <Button title="Aktifkan lisensi" icon="key-round" onPress={activate} loading={busy} disabled={!code.trim()} testID="license-activate-button" />
      {PURCHASE_URL ? (
        <Button title="Beli lisensi (sekali bayar)" icon="shopping-cart" variant="outline" style={{ marginTop: spacing.sm }} onPress={() => Linking.openURL(PURCHASE_URL)} testID="license-buy-button" />
      ) : (
        <T v="caption" style={{ marginTop: spacing.sm }}>Belum punya kode? Hubungi penjual USAHORA tempat Anda membeli.</T>
      )}
      {wall && hasData ? <Button title="Simpan cadangan data" icon="download" variant="secondary" style={{ marginTop: spacing.sm }} onPress={backup} testID="license-backup-button" /> : null}
    </Card>
  );
}
