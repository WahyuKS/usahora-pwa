import { useState } from "react";
import { View } from "react-native";

import { Badge, Button, Card, Chips, Divider, EmptyState, Field, IconButton, ListRow, Screen, Segment, Sheet, T, useRun, useUI } from "@/src/components/ui";
import { payBill, saveBill } from "@/src/data/actions";
import { remove, useDB } from "@/src/data/store";
import type { Bill, Recurring } from "@/src/data/types";
import { addDays, dayKey, fmtDate, isValidDate, rp, toNum } from "@/src/lib/format";
import { spacing, useTheme } from "@/src/theme";

const REC: { key: Recurring; label: string }[] = [{ key: "none", label: "Sekali" }, { key: "weekly", label: "Mingguan" }, { key: "monthly", label: "Bulanan" }, { key: "yearly", label: "Tahunan" }];
const CATS = ["Utilitas", "Sewa", "Cicilan", "Gaji", "Pajak", "Operasional", "Lainnya"];

export default function Bills() {
  const db = useDB();
  const { colors } = useTheme();
  const run = useRun();
  const { confirm, toast } = useUI();
  const [f, setF] = useState<"belum" | "lunas">("belum");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: "Utilitas", amount: "", due_date: addDays(dayKey(), 7), recurring: "monthly" as Recurring });
  const today = dayKey();
  const list = (db.bills as Bill[]).filter((b) => b.status === f).sort((a, b) => (f === "belum" ? a.due_date.localeCompare(b.due_date) : (b.paid_at ?? "").localeCompare(a.paid_at ?? "")));
  const totalDue = (db.bills as Bill[]).filter((b) => b.status === "belum").reduce((a, b) => a + b.amount, 0);

  const submit = () => {
    if (!isValidDate(form.due_date)) return toast("Format tanggal harus YYYY-MM-DD", "error");
    if (run(() => saveBill({ ...form, amount: toNum(form.amount) }), "Tagihan disimpan")) setOpen(false);
  };

  return (
    <Screen title="Tagihan & Pengingat" subtitle={`Belum dibayar ${rp(totalDue)}`} testID="bills-screen"
      right={<IconButton icon="plus" bg={colors.brandPrimary} color={colors.onBrandPrimary} onPress={() => { setForm({ name: "", category: "Utilitas", amount: "", due_date: addDays(dayKey(), 7), recurring: "monthly" }); setOpen(true); }} testID="bills-add-button" label="Tambah tagihan" />}
      headerExtra={<Chips value={f} onChange={setF} testIDPrefix="bills-filter" style={{ marginHorizontal: -spacing.sm }} options={[{ key: "belum", label: "Belum lunas" }, { key: "lunas", label: "Lunas" }]} />}>
      <T v="caption" style={{ marginBottom: spacing.md }}>Pengingat tampil di dalam aplikasi (Beranda) untuk tagihan yang jatuh tempo dalam 3 hari atau terlambat.</T>
      {list.length === 0 ? (
        <EmptyState icon="bell" title={f === "belum" ? "Tidak ada tagihan tertunda" : "Belum ada tagihan lunas"} message="Catat tagihan rutin seperti listrik, internet, atau sewa agar tidak terlewat." action={f === "belum" ? "Tambah tagihan" : undefined} onAction={() => setOpen(true)} testID="bills-empty" />
      ) : (
        <Card style={{ paddingVertical: spacing.xs }}>
          {list.map((b, i) => {
            const late = b.status === "belum" && b.due_date < today;
            const soon = b.status === "belum" && !late && b.due_date <= addDays(today, 3);
            return (
              <View key={b.id}>
                {i ? <Divider /> : null}
                <ListRow testID={`bill-row-${i}`} icon="bell" tone={late ? "error" : soon ? "warning" : b.status === "lunas" ? "success" : "brand"} title={b.name}
                  subtitle={`${b.category} · ${b.status === "lunas" ? `Dibayar ${fmtDate(b.paid_at!)}` : `Jatuh tempo ${fmtDate(b.due_date)}`}${b.recurring !== "none" ? ` · ${REC.find((r) => r.key === b.recurring)?.label}` : ""}`}
                  rightSub={<View style={{ alignItems: "flex-end", gap: 4 }}>
                    <T v="label" weight="semibold">{rp(b.amount)}</T>
                    {b.status === "belum" ? (
                      <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
                        {late ? <Badge label="Terlambat" tone="error" /> : soon ? <Badge label="Segera" tone="warning" /> : null}
                        <Button size="sm" title="Bayar" onPress={async () => { if (await confirm({ title: "Tandai lunas?", message: `${b.name} ${rp(b.amount)} akan dicatat sebagai pengeluaran.${b.recurring !== "none" ? " Tagihan berikutnya dibuat otomatis." : ""}` })) { payBill(b.id); toast("Tagihan lunas"); } }} testID={`bill-pay-${i}`} />
                      </View>
                    ) : null}
                  </View>} />
                {b.status === "belum" ? (
                  <Button size="sm" variant="ghost" title="Hapus" style={{ alignSelf: "flex-start", marginTop: -spacing.sm }} testID={`bill-delete-${i}`}
                    onPress={async () => { if (await confirm({ title: "Hapus tagihan?", message: b.name, danger: true, confirmText: "Hapus" })) { remove("bills", b.id); toast("Tagihan dihapus"); } }} />
                ) : null}
              </View>
            );
          })}
        </Card>
      )}
      <Sheet visible={open} onClose={() => setOpen(false)} title="Tagihan baru" testID="bill-sheet" footer={<Button title="Simpan" icon="check" onPress={submit} testID="bill-save-button" />}>
        <Field label="Nama tagihan *" value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))} placeholder="Contoh: Listrik PLN" testID="bill-name-input" />
        <Field money label="Nominal *" value={form.amount} onChangeText={(v) => setForm((p) => ({ ...p, amount: v }))} testID="bill-amount-input" />
        <Field label="Jatuh tempo (YYYY-MM-DD)" value={form.due_date} onChangeText={(v) => setForm((p) => ({ ...p, due_date: v }))} testID="bill-due-input" />
        <T v="label" style={{ marginBottom: 6 }}>Kategori</T>
        <Segment options={CATS.map((c) => ({ key: c, label: c }))} value={form.category} onChange={(c) => setForm((p) => ({ ...p, category: c }))} testIDPrefix="bill-category" />
        <T v="label" style={{ marginBottom: 6 }}>Berulang</T>
        <Segment options={REC} value={form.recurring} onChange={(r) => setForm((p) => ({ ...p, recurring: r }))} testIDPrefix="bill-recurring" />
      </Sheet>
    </Screen>
  );
}
