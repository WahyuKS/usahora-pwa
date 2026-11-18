import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

import { useAuth } from "@/src/auth";
import { Button, EmptyState, Field, Screen, useRun, useUI } from "@/src/components/ui";
import { saveContact } from "@/src/data/actions";
import { getState, upsert } from "@/src/data/store";
import type { Contact } from "@/src/data/types";
import { spacing } from "@/src/theme";

export default function ContactForm() {
  const { entity = "customers", id } = useLocalSearchParams<{ entity: "customers" | "suppliers"; id?: string }>();
  const router = useRouter();
  const run = useRun();
  const { confirm, toast } = useUI();
  const existing: Contact | undefined = id ? getState()[entity].find((c: Contact) => c.id === id) : undefined;
  const [f, setF] = useState({ name: existing?.name ?? "", phone: existing?.phone ?? "", email: existing?.email ?? "", address: existing?.address ?? "", notes: existing?.notes ?? "" });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const label = entity === "customers" ? "pelanggan" : "supplier";
  const { isOwner } = useAuth();
  if (!isOwner && entity !== "customers") return <Screen title="Tidak diizinkan"><EmptyState icon="lock" title="Hanya pemilik" message="Data supplier hanya dapat diubah oleh pemilik usaha." /></Screen>;

  const submit = () => {
    if (run(() => saveContact(entity, { ...f, id: existing?.id }), existing ? "Data diperbarui" : `${label[0].toUpperCase() + label.slice(1)} ditambahkan`)) router.back();
  };

  return (
    <Screen title={existing ? `Edit ${label}` : `Tambah ${label}`} testID="contact-form-screen" footer={<Button title="Simpan" icon="check" size="lg" onPress={submit} testID="contact-save-button" />}>
      <Field label="Nama *" value={f.name} onChangeText={set("name")} placeholder={entity === "customers" ? "Nama pelanggan" : "Nama supplier"} testID="contact-name-input" />
      <Field label="Nomor telepon" value={f.phone} onChangeText={set("phone")} keyboardType="phone-pad" placeholder="08xx" testID="contact-phone-input" />
      <Field label="Email" value={f.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" placeholder="Opsional" testID="contact-email-input" />
      <Field label="Alamat" value={f.address} onChangeText={set("address")} multiline placeholder="Opsional" testID="contact-address-input" />
      <Field label="Catatan" value={f.notes} onChangeText={set("notes")} multiline placeholder="Opsional" testID="contact-notes-input" />
      {existing && isOwner ? (
        <Button title={`Arsipkan ${label}`} variant="ghost" icon="archive" style={{ marginTop: spacing.sm }} testID="contact-archive-button" onPress={async () => {
          if (!(await confirm({ title: `Arsipkan ${label}?`, message: "Data disembunyikan dari daftar. Riwayat transaksi tetap tersimpan.", confirmText: "Arsipkan", danger: true }))) return;
          upsert(entity, { id: existing.id, archived: true });
          toast("Data diarsipkan");
          router.back();
        }} />
      ) : null}
    </Screen>
  );
}
