import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, Switch, View } from "react-native";

import { useAuth } from "@/src/auth";
import { Badge, Button, Card, Divider, Field, Icon, ListRow, Screen, SectionTitle, Segment, T, useUI } from "@/src/components/ui";
import { buildBackup, clearDemo, loadDemo, mergeBackup, restoreBackup, validateBackup } from "@/src/data/actions";
import { hasDemo } from "@/src/data/selectors";
import { BusinessAvatar } from "@/src/components/media";
import { StaffSection } from "@/src/components/staff";
import { lastPersistError, setMeta, useDB } from "@/src/data/store";
import { backupMessage, exportBackupNow, NOT_A_BACKUP } from "@/src/data/backup-export";
import { storageInfo, type StorageInfo } from "@/src/data/persistence";
import { resolveConflict, syncNow, useSync } from "@/src/data/sync";
import type { Business } from "@/src/data/types";
import { api } from "@/src/lib/api";
import { fmtDateTime, toNum } from "@/src/lib/format";
import { setThemePreference, spacing, useTheme, useThemePreference, type ThemePreference } from "@/src/theme";

const THEME_OPTIONS: { key: ThemePreference; label: string }[] = [
  { key: "light", label: "Terang" }, { key: "dark", label: "Gelap" }, { key: "system", label: "Ikuti HP" },
];

function AppearanceCard() {
  const pref = useThemePreference();
  return (
    <Card testID="appearance-card">
      <T v="caption" style={{ marginBottom: spacing.sm }}>Mode gelap lebih nyaman di mata saat malam dan menghemat baterai di HP dengan layar OLED.</T>
      <Segment options={THEME_OPTIONS} value={pref} onChange={setThemePreference} testIDPrefix="theme" />
    </Card>
  );
}

const ENTITY_LABEL: Record<string, string> = { products: "Produk", customers: "Pelanggan", suppliers: "Supplier", invoices: "Invoice", bills: "Tagihan", docs: "Dokumen", purchases: "Pembelian", finance: "Keuangan" };
const STATUS_LABEL = { online: "Online", offline: "Offline — data tersimpan di perangkat", pending: "Menunggu sinkronisasi", syncing: "Sinkronisasi berlangsung", success: "Sinkronisasi berhasil", error: "Sinkronisasi gagal" };

export default function Settings() {
  const db = useDB();
  const router = useRouter();
  const sync = useSync();
  const { business, updateBusiness, user, isOwner, isLocal } = useAuth();
  const [store, setStore] = useState<StorageInfo | null>(null);
  useEffect(() => {
    storageInfo().then(setStore).catch(() => setStore(null));
  }, []);
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
      const msg = backupMessage(await exportBackupNow(business));
      if (msg) toast(msg);
    } catch {
      toast("Gagal menyimpan cadangan. Coba lagi.", "error");
    }
  };

  const doRestore = async (obj: any, source: string) => {
    const err = validateBackup(obj);
    if (err) return toast(err, "error");
    const otherDevice = !!obj.business_id && obj.business_id !== user?.business_id;
    // Cloud accounts: never mix businesses. Local mode: another business id means another device/browser.
    if (otherDevice && !isLocal) return toast("File cadangan ini milik usaha lain dan tidak dapat dipulihkan ke akun ini", "error");
    const count = ["products", "sales", "customers", "invoices"].map((k) => `${(obj[k] ?? []).length} ${ENTITY_LABEL[k] ?? k}`).join(", ");
    const from = source === "cloud" ? "cadangan cloud" : "file cadangan";
    const ok = await confirm({ title: "Pulihkan data?", message: `${otherDevice ? `File ini dari HP/laptop lain ("${obj.business_name ?? "-"}"). ` : ""}Semua data di perangkat ini akan DIGANTI dengan isi ${from} (${count}, dibuat ${obj.exported_at ? fmtDateTime(obj.exported_at) : "-"}). Tindakan ini tidak dapat dibatalkan.`, confirmText: "Pulihkan", danger: true });
    if (!ok) return;
    restoreBackup(obj);
    toast("Data berhasil dipulihkan");
  };

  const readBackupFile = async (): Promise<any | null> => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/json", "*/*"], copyToCacheDirectory: true });
    if (res.canceled) return null;
    const uri = res.assets[0].uri;
    const text = Platform.OS === "web" ? await (await fetch(uri)).text() : await new File(uri).text();
    try {
      return JSON.parse(text);
    } catch {
      toast(NOT_A_BACKUP, "error");
      return null;
    }
  };

  const mergeFromFile = async () => {
    try {
      const obj = await readBackupFile();
      if (!obj) return;
      const err = validateBackup(obj);
      if (err) return toast(err, "error");
      if (obj.business_id && obj.business_id !== user?.business_id && !isLocal) return toast("File cadangan ini milik usaha lain dan tidak dapat digabungkan ke akun ini", "error");
      const ok = await confirm({ title: "Gabungkan data?", message: `Data dari file cadangan "${obj.business_name ?? "-"}" (dibuat ${obj.exported_at ? fmtDateTime(obj.exported_at) : "-"}) akan DITAMBAHKAN ke perangkat ini. Data yang sama digabung, versi terbaru dipakai, dan tidak ada data di perangkat ini yang dihapus.`, confirmText: "Gabungkan" });
      if (!ok) return;
      const r = mergeBackup(obj);
      toast(`Selesai: ${r.added} data baru, ${r.updated} diperbarui`);
    } catch {
      toast("Gagal membaca file cadangan", "error");
    }
  };

  const importBackup = async () => {
    try {
      const obj = await readBackupFile();
      if (obj) await doRestore(obj, "file");
    } catch {
      toast("Gagal membaca file cadangan", "error");
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
      <SectionTitle title="Tampilan" />
      <AppearanceCard />
      {isLocal ? (<>
      <SectionTitle title="Penyimpanan data" />
      <Card testID="local-mode-card">
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <T v="label">Mode lokal (tanpa akun)</T>
          <Badge label={sync.online ? "Online" : "Offline"} tone={sync.online ? "success" : "warning"} />
        </View>
        <T v="caption" style={{ marginTop: 4 }}>Semua data tersimpan di perangkat/browser ini dan bisa dipakai tanpa internet. Data tidak dikirim ke server mana pun.</T>
        {store ? <T v="caption" style={{ marginTop: spacing.sm }} testID="storage-engine-text">{store.engine === "localstorage" ? "Penyimpanan: mode darurat browser (kapasitas kecil). Segera simpan cadangan data." : "Penyimpanan: penyimpanan utama perangkat"}{store.persisted === true ? " · dilindungi dari pembersihan otomatis" : store.persisted === false ? " · pasang USAHORA ke layar utama agar lebih aman" : ""}</T> : null}
        {lastPersistError ? <T v="caption" color={colors.error} style={{ marginTop: 4 }}>Perubahan terakhir gagal tersimpan ({lastPersistError}). Segera simpan cadangan data.</T> : null}
        <T v="caption" color={colors.warningText} style={{ marginTop: spacing.sm }}>Penting: jika data browser dihapus, aplikasi di-uninstall, atau ganti HP, data ikut hilang. Simpan cadangan data secara rutin (lihat bagian Cadangan data di bawah).</T>
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
      <Card testID="settings-profile-card" onPress={() => router.push("/profile")} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <BusinessAvatar business={business} size={56} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="h3" numberOfLines={1}>{business?.name ?? "Nama usaha"}</T>
          <T v="caption" numberOfLines={2}>Logo, alamat, kontak, rekening, dan pajak untuk struk & invoice</T>
        </View>
        <Icon name="chevron-right" size={20} color={colors.muted} />
      </Card>

      {isLocal ? null : <StaffSection />}

      <SectionTitle title="Cadangan data (backup)" />
      <Card testID="backup-card">
        <T v="body">File cadangan berisi semua data usaha Anda: produk, stok, penjualan, pelanggan, dan keuangan. Simpan file ini di tempat aman, misalnya Google Drive atau kirim ke WhatsApp Anda sendiri.</T>
        <T v="caption" style={{ marginTop: spacing.sm }} testID="last-backup-text">Cadangan terakhir: {db.meta.lastBackupAt ? fmtDateTime(db.meta.lastBackupAt) : "belum pernah"}{db.meta.lastCloudBackupAt ? ` · cloud ${fmtDateTime(db.meta.lastCloudBackupAt)}` : ""}</T>
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Button title="Simpan cadangan sekarang" icon="download" onPress={exportBackup} testID="backup-export-button" />
          <Button title="Pulihkan dari file cadangan" icon="upload" variant="outline" onPress={importBackup} testID="backup-import-button" />
          <Button title="Gabungkan data dari HP/laptop lain" icon="merge" variant="outline" onPress={mergeFromFile} testID="backup-merge-button" />
          {isLocal ? null : <Button title="Simpan cadangan ke cloud" icon="cloud-upload" variant="secondary" onPress={cloudBackup} loading={busy === "cloud"} testID="backup-cloud-button" />}
          {isLocal ? null : <Button title="Pulihkan dari cloud" icon="cloud" variant="outline" onPress={cloudRestore} loading={busy === "cloudr"} testID="backup-cloud-restore-button" />}
        </View>
        <T v="caption" style={{ marginTop: spacing.md }}>HP hilang atau ganti HP? Buka USAHORA di HP baru, tekan {"\"Pulihkan dari file cadangan\""}, lalu pilih file cadangan terakhir Anda (namanya diawali usahora-cadangan).</T>
        <T v="caption" style={{ marginTop: spacing.sm }}>Pakai di HP dan laptop sekaligus? Simpan cadangan di satu perangkat, lalu di perangkat lain tekan {"\"Gabungkan data dari HP/laptop lain\""}. Data tidak tersambung otomatis, dan data yang dihapus tidak ikut terhapus di perangkat lain.</T>
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
      </>) : <T v="caption" style={{ marginTop: spacing.lg }}>Profil usaha, cadangan data, dan akun karyawan hanya dapat diatur oleh pemilik.</T>}
      <T v="caption" align="center" style={{ marginTop: spacing.xl }}>USAHORA v1.0 · Business ID {user?.business_id.slice(0, 8)}</T>
    </Screen>
  );
}
