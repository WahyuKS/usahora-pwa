import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useState } from "react";
import { Platform, Pressable, Switch, View } from "react-native";

import { useAuth } from "@/src/auth";
import { Badge, Button, Card, Divider, Field, ListRow, Screen, SectionTitle, T, useUI } from "@/src/components/ui";
import { buildBackup, clearDemo, loadDemo, restoreBackup, validateBackup } from "@/src/data/actions";
import { hasDemo } from "@/src/data/selectors";
import { PhotoPicker } from "@/src/components/media";
import { StaffSection } from "@/src/components/staff";
import { setMeta, useDB } from "@/src/data/store";
import { resolveConflict, syncNow, useSync } from "@/src/data/sync";
import type { Business } from "@/src/data/types";
import { api } from "@/src/lib/api";
import { shareText } from "@/src/lib/export";
import { dayKey, fmtDateTime, toNum } from "@/src/lib/format";
import { spacing, useTheme } from "@/src/theme";

const ENTITY_LABEL: Record<string, string> = { products: "Produk", customers: "Pelanggan", suppliers: "Supplier", invoices: "Invoice", bills: "Tagihan", docs: "Dokumen", purchases: "Pembelian", finance: "Keuangan" };
const STATUS_LABEL = { online: "Online", offline: "Offline — data tersimpan di perangkat", pending: "Menunggu sinkronisasi", syncing: "Sinkronisasi berlangsung", success: "Sinkronisasi berhasil", error: "Sinkronisasi gagal" };

export default function Settings() {
  const db = useDB();
  const sync = useSync();
  const { business, updateBusiness, user, isOwner, isLocal } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useUI();
  const [b, setB] = useState<Business>(business ?? ({ name: "", address: "", phone: "", email: "", currency: "IDR", invoice_footer: "", tax_enabled: false, tax_rate: 11, bank_info: "", id: "" } as Business));
  const [busy, setBusy] = useState<string | null>(null);
  const set = (k: keyof Business) => (v: any) => setB((p) => ({ ...p, [k]: v }));

  const saveProfile = async () => {
    if (!b.name.trim()) return toast("Nama usaha wajib diisi", "error");
    if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) return toast("Format email tidak valid", "error");
    setBusy("profile");
    const res = await updateBusiness({ ...b, tax_rate: toNum(b.tax_rate) });
    setBusy(null);
    toast(res === "online" ? "Profil usaha disimpan" : "Disimpan di perangkat, akan dikirim saat online", res === "online" ? "success" : "info");
  };

  const doSync = async () => {
    setBusy("sync");
    const r = await syncNow();
    setBusy(null);
    toast(r.message, r.ok ? "success" : "error");
  };

  const exportBackup = async () => {
    try {
      await shareText(JSON.stringify(buildBackup(business), null, 1), `usahora-backup-${dayKey()}.json`, "application/json");
      setMeta({ lastBackupAt: new Date().toISOString() });
      toast("Backup berhasil dibuat");
    } catch {
      toast("Gagal membuat backup", "error");
    }
  };

  const doRestore = async (obj: any, source: string) => {
    const err = validateBackup(obj);
    if (err) return toast(err, "error");
    if (obj.business_id && obj.business_id !== user?.business_id) return toast("Backup ini milik usaha lain dan tidak dapat dipulihkan ke akun ini", "error");
    const count = ["products", "sales", "customers", "invoices"].map((k) => `${(obj[k] ?? []).length} ${ENTITY_LABEL[k] ?? k}`).join(", ");
    const ok = await confirm({ title: "Pulihkan data?", message: `Data di perangkat ini akan DIGANTI dengan isi backup ${source} (${count}, dibuat ${obj.exported_at ? fmtDateTime(obj.exported_at) : "-"}). Tindakan ini tidak dapat dibatalkan.`, confirmText: "Pulihkan", danger: true });
    if (!ok) return;
    restoreBackup(obj);
    toast("Data berhasil dipulihkan");
  };

  const importBackup = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["application/json", "*/*"], copyToCacheDirectory: true });
      if (res.canceled) return;
      const uri = res.assets[0].uri;
      const text = Platform.OS === "web" ? await (await fetch(uri)).text() : await new File(uri).text();
      let obj: any;
      try { obj = JSON.parse(text); } catch { return toast("File bukan JSON yang valid", "error"); }
      await doRestore(obj, "file");
    } catch {
      toast("Gagal membaca file backup", "error");
    }
  };

  const cloudBackup = async () => {
    setBusy("cloud");
    try {
      const r = await api<{ created_at: string }>("/backup", { method: "POST", body: { data: buildBackup(business) }, timeoutMs: 60000 });
      setMeta({ lastCloudBackupAt: r.created_at, lastBackupAt: r.created_at });
      toast("Backup cloud berhasil");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };
  const cloudRestore = async () => {
    setBusy("cloudr");
    try {
      const r = await api<{ data: any }>("/backup/latest");
      await doRestore(r.data, "cloud");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title="Pengaturan" subtitle={isLocal ? "Mode lokal" : user?.email} testID="settings-screen">
      {isLocal ? (<>
      <SectionTitle title="Penyimpanan data" />
      <Card testID="local-mode-card">
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <T v="label">Mode lokal (tanpa akun)</T>
          <Badge label={sync.online ? "Online" : "Offline"} tone={sync.online ? "success" : "warning"} />
        </View>
        <T v="caption" style={{ marginTop: 4 }}>Semua data tersimpan di perangkat/browser ini dan bisa dipakai tanpa internet. Data tidak dikirim ke server mana pun.</T>
        <T v="caption" color={colors.warningText} style={{ marginTop: spacing.sm }}>Penting: menghapus data browser, uninstall, atau ganti perangkat akan menghilangkan data. Ekspor backup JSON secara rutin.</T>
      </Card>
      </>) : (<>
      <SectionTitle title="Sinkronisasi cloud" />
      <Card testID="sync-card">
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <T v="label" testID="sync-status-text">{STATUS_LABEL[sync.status]}</T>
          <Badge label={sync.online ? "Online" : "Offline"} tone={sync.online ? "success" : "warning"} />
        </View>
        <T v="caption" style={{ marginTop: 4 }} testID="sync-pending-count">{db.outbox.length} perubahan menunggu · Terakhir sinkron: {db.meta.lastSyncAt ? fmtDateTime(db.meta.lastSyncAt) : "belum pernah"}</T>
        {sync.error ? <T v="caption" color={colors.error} style={{ marginTop: 4 }}>{sync.error}</T> : null}
        {(db.meta as any).lastRejected && !sync.error ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }} testID="sync-rejected-notice">
            <T v="caption" color={colors.warningText} style={{ flex: 1 }}>{(db.meta as any).lastRejected}</T>
            <Button size="sm" variant="ghost" title="Tutup" onPress={() => setMeta({ lastRejected: null } as any)} testID="sync-rejected-dismiss" />
          </View>
        ) : null}
        <Button title="Sinkronkan sekarang" icon="refresh-cw" onPress={doSync} loading={busy === "sync"} style={{ marginTop: spacing.md }} testID="sync-now-button" />
        <T v="caption" style={{ marginTop: spacing.sm }}>Semua data disimpan dulu di perangkat (bisa dipakai offline), lalu dikirim ke cloud dengan kunci unik per perubahan sehingga transaksi tidak tergandakan.</T>
      </Card>
      </>)}
      {db.meta.conflicts.length ? (
        <>
          <SectionTitle title={`Konflik (${db.meta.conflicts.length})`} />
          <Card testID="conflicts-card">
            <T v="caption" style={{ marginBottom: spacing.sm }}>Data berikut diubah di perangkat lain sebelum perubahan Anda terkirim. Pilih versi yang dipakai.</T>
            {db.meta.conflicts.map((c, i) => (
              <View key={c.op.op_id}>
                {i ? <Divider /> : null}
                <ListRow title={`${ENTITY_LABEL[c.op.entity] ?? c.op.entity}: ${c.op.payload?.name ?? c.op.payload?.title ?? c.op.payload?.number ?? c.op.record_id.slice(0, 8)}`} subtitle={`Versi server ${fmtDateTime(c.server_updated_at)}`} />
                <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm }}>
                  <Button size="sm" title="Pakai versi saya" style={{ flex: 1 }} onPress={() => { resolveConflict(c, "local"); toast("Versi Anda dipakai"); }} testID={`conflict-local-${i}`} />
                  <Button size="sm" variant="outline" title="Pakai versi server" style={{ flex: 1 }} onPress={() => { resolveConflict(c, "server"); toast("Versi server dipakai"); }} testID={`conflict-server-${i}`} />
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {isOwner ? (<>
      <SectionTitle title="Profil usaha" />
      <Card>
        {isLocal ? null : <PhotoPicker fileId={b.logo_file_id} label="Logo usaha" testID="business-logo" onChange={async (id) => {
          const next = { ...b, logo_file_id: id };
          setB(next);
          const r = await updateBusiness(next);
          toast(r === "online" ? "Logo disimpan" : "Logo disimpan di perangkat, dikirim saat online", r === "online" ? "success" : "info");
        }} />}
        <Field label="Nama usaha *" value={b.name} onChangeText={set("name")} testID="business-name-input" />
        <Field label="Alamat" value={b.address} onChangeText={set("address")} multiline testID="business-address-input" />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}><Field label="Telepon" value={b.phone} onChangeText={set("phone")} keyboardType="phone-pad" testID="business-phone-input" /></View>
          <View style={{ flex: 1 }}><Field label="Email" value={b.email} onChangeText={set("email")} autoCapitalize="none" keyboardType="email-address" testID="business-email-input" /></View>
        </View>
        <Field label="Mata uang" value="Rupiah (IDR) · format Rp1.500.000 · zona waktu Asia/Jakarta" editable={false} />
        <SectionTitle title="Pengaturan invoice" />
        <Field label="Info pembayaran / rekening" value={b.bank_info} onChangeText={set("bank_info")} multiline placeholder="Contoh: BCA 123456789 a.n. Toko Maju" testID="business-bank-input" />
        <Field label="Catatan kaki invoice" value={b.invoice_footer} onChangeText={set("invoice_footer")} testID="business-footer-input" />
        <Pressable onPress={() => set("tax_enabled")(!b.tax_enabled)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 48, marginBottom: spacing.md }}>
          <T v="label">Pajak aktif secara default</T>
          <Switch value={b.tax_enabled} onValueChange={set("tax_enabled")} testID="business-tax-switch" trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }} />
        </Pressable>
        {b.tax_enabled ? <Field label="Tarif pajak (%)" value={String(b.tax_rate)} onChangeText={set("tax_rate")} keyboardType="decimal-pad" testID="business-taxrate-input" /> : null}
        <Button title="Simpan profil" icon="check" onPress={saveProfile} loading={busy === "profile"} testID="business-save-button" />
      </Card>

      {isLocal ? null : <StaffSection />}

      <SectionTitle title="Backup & restore" />
      <Card testID="backup-card">
        <T v="caption" testID="last-backup-text">Backup terakhir: {db.meta.lastBackupAt ? fmtDateTime(db.meta.lastBackupAt) : "belum pernah"}{db.meta.lastCloudBackupAt ? ` · cloud ${fmtDateTime(db.meta.lastCloudBackupAt)}` : ""}</T>
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Button title="Ekspor backup JSON" icon="download" variant="secondary" onPress={exportBackup} testID="backup-export-button" />
          <Button title="Impor backup JSON" icon="upload" variant="outline" onPress={importBackup} testID="backup-import-button" />
          {isLocal ? null : <Button title="Backup ke cloud" icon="cloud-upload" variant="secondary" onPress={cloudBackup} loading={busy === "cloud"} testID="backup-cloud-button" />}
          {isLocal ? null : <Button title="Pulihkan dari cloud" icon="cloud" variant="outline" onPress={cloudRestore} loading={busy === "cloudr"} testID="backup-cloud-restore-button" />}
        </View>
        <T v="caption" style={{ marginTop: spacing.sm }}>Catatan: data lokal di perangkat belum dienkripsi khusus. Lindungi perangkat Anda dengan kunci layar.</T>
      </Card>

      <SectionTitle title="Data demo" />
      <Card>
        {hasDemo(db) ? (
          <Button title="Hapus semua data demo" icon={"trash-2" as any} variant="danger" testID="demo-clear-button" onPress={async () => {
            if (await confirm({ title: "Hapus data demo?", message: "Semua data contoh (produk, transaksi, pelanggan, dll.) akan dihapus. Data yang Anda buat sendiri tetap aman.", danger: true, confirmText: "Hapus data demo" })) { clearDemo(); toast("Data demo dihapus"); }
          }} />
        ) : (
          <Button title="Isi data demo" icon="sparkles" variant="secondary" testID="demo-load-button" onPress={async () => {
            if (await confirm({ title: "Isi data demo?", message: "Data contoh akan ditambahkan dan ditandai sebagai demo. Anda bisa menghapusnya kapan saja." })) { loadDemo(); toast("Data demo dimuat"); }
          }} />
        )}
      </Card>
      </>) : <T v="caption" style={{ marginTop: spacing.lg }}>Profil usaha, backup, dan akun karyawan hanya dapat diatur oleh pemilik.</T>}
      <T v="caption" align="center" style={{ marginTop: spacing.xl }}>USAHORA v1.0 · Business ID {user?.business_id.slice(0, 8)}</T>
    </Screen>
  );
}
