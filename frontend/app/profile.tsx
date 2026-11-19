import { useState } from "react";
import { ActivityIndicator, Pressable, Switch, View } from "react-native";

import { useAuth } from "@/src/auth";
import { BusinessAvatar } from "@/src/components/media";
import { Badge, Button, Card, Field, Icon, Screen, SectionTitle, T, useUI } from "@/src/components/ui";
import type { Business } from "@/src/data/types";
import { toNum } from "@/src/lib/format";
import { LogoError, pickLogo } from "@/src/lib/logo-image";
import { radius, spacing, useTheme } from "@/src/theme";

const EMPTY = { name: "", address: "", phone: "", email: "", currency: "IDR", invoice_footer: "", tax_enabled: false, tax_rate: 11, bank_info: "", id: "" } as Business;

/** Profil usaha: logo, identity and invoice settings (shown on receipts, invoices and reports). */
export default function Profile() {
  const { business, updateBusiness, user, isOwner } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useUI();
  const [b, setB] = useState<Business>(business ?? EMPTY);
  const [busy, setBusy] = useState<"logo" | "save" | null>(null);
  const set = (k: keyof Business) => (v: any) => setB((p) => ({ ...p, [k]: v }));
  const hasLogo = !!(b.logo_data_url || b.logo_file_id);

  // The logo is saved immediately (like a profile photo); the text fields wait for "Simpan profil".
  const saveLogo = async (logo: string | null) => {
    const base = business ?? b;
    const next = { ...base, logo_data_url: logo, ...(logo === null ? { logo_file_id: null } : {}) };
    await updateBusiness(next);
    setB((p) => ({ ...p, logo_data_url: logo, ...(logo === null ? { logo_file_id: null } : {}) }));
  };
  const changeLogo = async () => {
    setBusy("logo");
    try {
      const url = await pickLogo();
      if (url) {
        await saveLogo(url);
        toast("Logo usaha diperbarui", "success");
      }
    } catch (e: any) {
      toast(e instanceof LogoError ? e.message : "Gagal memuat gambar. Coba gambar lain.", "error");
    } finally {
      setBusy(null);
    }
  };
  const removeLogo = async () => {
    const ok = await confirm({ title: "Hapus logo?", message: "Logo usaha akan diganti dengan inisial nama usaha di aplikasi dan dokumen.", confirmText: "Hapus logo", danger: true });
    if (!ok) return;
    await saveLogo(null);
    toast("Logo dihapus");
  };
  const save = async () => {
    if (!b.name.trim()) return toast("Nama usaha wajib diisi", "error");
    if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) return toast("Format email tidak valid", "error");
    setBusy("save");
    const res = await updateBusiness({ ...(business ?? EMPTY), ...b, name: b.name.trim(), tax_rate: toNum(b.tax_rate) });
    setBusy(null);
    toast(res === "online" ? "Profil usaha disimpan" : "Profil usaha disimpan di perangkat ini", "success");
  };

  if (!isOwner) return <Screen title="Profil usaha" testID="profile-screen"><T v="body">Hanya pemilik yang dapat mengubah profil usaha.</T></Screen>;

  return (
    <Screen title="Profil usaha" subtitle="Tampil di struk, invoice, dan laporan" testID="profile-screen">
      <Card testID="profile-hero" style={{ alignItems: "center", paddingVertical: spacing.xl, marginBottom: spacing.lg }}>
        <Pressable onPress={changeLogo} disabled={busy === "logo"} accessibilityRole="button" accessibilityLabel="Ubah logo usaha" testID="profile-logo"
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
          <BusinessAvatar business={b} size={104} testID="profile-logo-image" />
          <View style={{ position: "absolute", right: -6, bottom: -6, width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.chipActiveBg, borderWidth: 3, borderColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
            {busy === "logo" ? <ActivityIndicator size="small" color={colors.chipActiveText} /> : <Icon name="camera" size={16} color={colors.chipActiveText} />}
          </View>
        </Pressable>
        <T v="h2" align="center" numberOfLines={2} style={{ marginTop: spacing.lg }} testID="profile-name">{b.name || "Nama usaha"}</T>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs }}>
          <T v="caption">{user?.name}</T>
          <Badge label="Pemilik" tone="brand" />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
          <Button size="sm" variant="secondary" icon="image-plus" title={hasLogo ? "Ganti logo" : "Unggah logo"} onPress={changeLogo} loading={busy === "logo"} testID="profile-logo-pick" />
          {hasLogo ? <Button size="sm" variant="ghost" icon="trash-2" title="Hapus" onPress={removeLogo} testID="profile-logo-remove" /> : null}
        </View>
        <T v="caption" align="center" style={{ marginTop: spacing.sm }}>JPG atau PNG, sebaiknya persegi. Disimpan di perangkat ini, tanpa internet.</T>
      </Card>

      <SectionTitle title="Informasi usaha" />
      <Card>
        <Field label="Nama usaha *" value={b.name} onChangeText={set("name")} testID="business-name-input" />
        <Field label="Alamat" value={b.address} onChangeText={set("address")} multiline testID="business-address-input" />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}><Field label="Telepon / WhatsApp" value={b.phone} onChangeText={set("phone")} keyboardType="phone-pad" testID="business-phone-input" /></View>
          <View style={{ flex: 1 }}><Field label="Email" value={b.email} onChangeText={set("email")} autoCapitalize="none" keyboardType="email-address" testID="business-email-input" /></View>
        </View>
        <Field label="Mata uang" value="Rupiah (IDR) · zona waktu Asia/Jakarta" editable={false} />
      </Card>

      <SectionTitle title="Pengaturan struk & invoice" />
      <Card>
        <Field label="Info pembayaran / rekening" value={b.bank_info} onChangeText={set("bank_info")} multiline placeholder="Contoh: BCA 123456789 a.n. Toko Maju" testID="business-bank-input" />
        <Field label="Catatan kaki invoice" value={b.invoice_footer} onChangeText={set("invoice_footer")} testID="business-footer-input" />
        <Pressable onPress={() => set("tax_enabled")(!b.tax_enabled)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 48, marginBottom: spacing.md }}>
          <T v="label">Pajak aktif secara default</T>
          <Switch value={b.tax_enabled} onValueChange={set("tax_enabled")} testID="business-tax-switch" trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }} />
        </Pressable>
        {b.tax_enabled ? <Field label="Tarif pajak (%)" value={String(b.tax_rate)} onChangeText={set("tax_rate")} keyboardType="decimal-pad" testID="business-taxrate-input" /> : null}
        <Button title="Simpan profil" icon="check" onPress={save} loading={busy === "save"} testID="business-save-button" />
      </Card>
    </Screen>
  );
}
