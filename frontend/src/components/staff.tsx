import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import { Badge, Button, Card, Divider, Field, ListRow, SectionTitle, Sheet, T, useUI } from "@/src/components/ui";
import type { User } from "@/src/data/types";
import { api } from "@/src/lib/api";
import { spacing } from "@/src/theme";

type Staff = User & { is_active: boolean };

/** Owner-only: create cashier accounts that share this business, and deactivate them. */
export function StaffSection() {
  const { toast, confirm } = useUI();
  const [list, setList] = useState<Staff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", email: "", password: "" });

  const load = useCallback(async () => {
    try {
      setList(await api<Staff[]>("/staff"));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!f.name.trim()) return toast("Nama karyawan wajib diisi", "error");
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return toast("Email tidak valid", "error");
    if (f.password.length < 8) return toast("Kata sandi minimal 8 karakter", "error");
    setBusy(true);
    try {
      await api("/staff", { method: "POST", body: { ...f, email: f.email.trim() } });
      toast(`Akun kasir ${f.name} dibuat`);
      setOpen(false);
      setF({ name: "", email: "", password: "" });
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (s: Staff) => {
    if (s.is_active && !(await confirm({ title: `Nonaktifkan ${s.name}?`, message: "Karyawan tidak bisa masuk lagi sampai diaktifkan kembali. Riwayat transaksinya tetap tersimpan.", danger: true, confirmText: "Nonaktifkan" }))) return;
    try {
      await api(`/staff/${s.id}?active=${!s.is_active}`, { method: "PATCH" });
      toast(s.is_active ? "Akun dinonaktifkan" : "Akun diaktifkan");
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  return (
    <>
      <SectionTitle title="Akun karyawan" action="Tambah" onAction={() => setOpen(true)} testID="staff-add-button" />
      <Card style={{ paddingVertical: spacing.xs }} testID="staff-card">
        <T v="caption" style={{ paddingVertical: spacing.sm }}>Kasir hanya bisa memakai Kasir, melihat produk & pelanggan, dan riwayat penjualan. Keuangan, laporan, pembelian, invoice, dan pengaturan usaha hanya untuk pemilik.</T>
        {error ? <T v="caption" testID="staff-error">{error}</T> : list === null ? <T v="caption">Memuat...</T> : list.length === 0 ? <T v="caption" style={{ paddingBottom: spacing.sm }}>Belum ada akun karyawan.</T> : list.map((s, i) => (
          <View key={s.id}>
            <Divider />
            <ListRow icon="user" title={s.name} subtitle={s.email} testID={`staff-row-${i}`}
              rightSub={<View style={{ alignItems: "flex-end", gap: 4 }}>
                <Badge label={s.is_active ? "Aktif" : "Nonaktif"} tone={s.is_active ? "success" : "neutral"} />
                <Button size="sm" variant="ghost" title={s.is_active ? "Nonaktifkan" : "Aktifkan"} onPress={() => toggle(s)} testID={`staff-toggle-${i}`} />
              </View>} />
          </View>
        ))}
      </Card>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Akun kasir baru" testID="staff-sheet" footer={<Button title="Buat akun" icon="check" loading={busy} onPress={create} testID="staff-save-button" />}>
        <Field label="Nama karyawan" value={f.name} onChangeText={(v) => setF((p) => ({ ...p, name: v }))} testID="staff-name-input" />
        <Field label="Email login" value={f.email} onChangeText={(v) => setF((p) => ({ ...p, email: v }))} autoCapitalize="none" keyboardType="email-address" testID="staff-email-input" />
        <Field label="Kata sandi" value={f.password} onChangeText={(v) => setF((p) => ({ ...p, password: v }))} secureTextEntry help="Minimal 8 karakter. Berikan ke karyawan secara langsung." testID="staff-password-input" />
      </Sheet>
    </>
  );
}
