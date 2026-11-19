import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { DayHeader, groupByDay, Pagination, usePaged } from "@/src/components/pagination";
import { PeriodPicker } from "@/src/components/period-picker";
import { Button, Card, Divider, EmptyState, Field, IconButton, ListRow, Screen, SectionTitle, Segment, Sheet, T, useRun, useUI } from "@/src/components/ui";
import { addFinance, deleteFinance } from "@/src/data/actions";
import { summary } from "@/src/data/selectors";
import { useDB } from "@/src/data/store";
import type { FinanceEntry } from "@/src/data/types";
import { dateKeyToISO, dayKey, fmtDate, fmtDateTime, inRange, isValidDate, rp, toNum, type Period } from "@/src/lib/format";
import { spacing, useTheme } from "@/src/theme";

const EXP_CATS = ["Sewa Tempat", "Gaji Karyawan", "Listrik & Air", "Transportasi", "Pemasaran", "Perlengkapan", "Lainnya"];
const INC_CATS = ["Pendapatan Jasa", "Pendapatan Lain", "Modal Masuk"];

export default function Finance() {
  const { add } = useLocalSearchParams<{ add?: "income" | "expense" }>();
  const db = useDB();
  const { colors } = useTheme();
  const run = useRun();
  const { confirm, toast } = useUI();
  const [period, setPeriod] = useState<Period>("month");
  const [open, setOpen] = useState<"income" | "expense" | null>(null);
  const [f, setF] = useState({ category: "", amount: "", note: "", date: dayKey() });
  useEffect(() => { if (add) setOpen(add); }, [add]);
  const s = useMemo(() => summary(db, period), [db, period]);
  const entries = (db.finance as FinanceEntry[]).filter((e) => inRange(e.date, s.range)).sort((a, b) => b.date.localeCompare(a.date));
  const ledger = useMemo(() => {
    const pays = db.payments.filter((p: any) => inRange(p.created_at, s.range)).map((p: any) => ({ id: p.id, date: p.created_at, label: "Penerimaan penjualan", amount: p.amount }));
    return [...pays, ...entries.map((e) => ({ id: e.id, date: e.date, label: e.category, amount: e.type === "income" ? e.amount : -e.amount }))].sort((a, b) => b.date.localeCompare(a.date));
  }, [db, entries, s.range]);

  const pk = JSON.stringify(period);
  const entryPage = usePaged(entries, 10, pk);
  const ledgerPage = usePaged(ledger, 10, pk);

  const openForm = (t: "income" | "expense") => { setF({ category: "", amount: "", note: "", date: dayKey() }); setOpen(t); };
  const submit = () => {
    if (!isValidDate(f.date)) return toast("Format tanggal harus YYYY-MM-DD", "error");
    const at = f.date === dayKey() ? new Date().toISOString() : new Date(new Date(dateKeyToISO(f.date)).getTime() + 12 * 3600e3).toISOString();
    if (run(() => addFinance({ type: open!, category: f.category, amount: toNum(f.amount), note: f.note, date: at }), open === "income" ? "Pendapatan dicatat" : "Pengeluaran dicatat")) setOpen(null);
  };

  const Row = ({ label, value, bold, color }: { label: string; value: number; bold?: boolean; color?: string }) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
      <T v={bold ? "label" : "body"} color={bold ? undefined : colors.muted}>{label}</T>
      <T v="label" weight={bold ? "bold" : "medium"} color={color}>{rp(value)}</T>
    </View>
  );

  return (
    <Screen title="Keuangan" subtitle="Pendapatan, pengeluaran, dan arus kas" testID="finance-screen"
      headerExtra={<PeriodPicker value={period} onChange={setPeriod} testIDPrefix="finance-period" style={{ marginHorizontal: -spacing.sm }} />}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button title="Pengeluaran" icon="minus" variant="danger" style={{ flex: 1 }} onPress={() => openForm("expense")} testID="finance-add-expense" />
        <Button title="Pendapatan" icon="plus" style={{ flex: 1 }} onPress={() => openForm("income")} testID="finance-add-income" />
      </View>
      <SectionTitle title="Laba rugi sederhana" />
      <Card testID="finance-pl-card">
        <Row label="Penjualan bersih (omzet)" value={s.omzet} />
        <Row label="Harga pokok penjualan (HPP)" value={-s.cogs} />
        <Divider />
        <Row label="Laba kotor" value={s.gross} bold />
        <Row label="Pendapatan lain" value={s.otherIncome} />
        <Row label="Biaya operasional" value={-s.opex} />
        <Divider />
        <Row label="Laba bersih (estimasi)" value={s.net} bold color={s.net >= 0 ? colors.success : colors.error} />
      </Card>
      <SectionTitle title="Arus kas" />
      <Card testID="finance-cash-card">
        <Row label="Kas masuk" value={s.cashIn} color={colors.success} />
        <Row label="Kas keluar" value={-s.cashOut} color={colors.error} />
        <Divider />
        <Row label="Arus kas bersih" value={s.cashFlow} bold />
        <T v="caption" style={{ marginTop: spacing.sm }}>Kas masuk = pembayaran penjualan yang diterima + pendapatan lain. Penjualan yang belum dibayar dihitung sebagai piutang, bukan kas.</T>
      </Card>
      <SectionTitle title="Catatan pendapatan & pengeluaran" />
      {entries.length === 0 ? (
        <EmptyState icon="wallet" title="Belum ada catatan" message="Catat pengeluaran seperti sewa, gaji, atau listrik agar laba bersih akurat." testID="finance-empty" />
      ) : (
        <>{groupByDay(entryPage.slice, (e) => e.date).map((g) => (
        <View key={g.day}>
        <DayHeader label={g.label} />
        <Card style={{ paddingVertical: spacing.xs }}>
          {g.items.map((e, i) => (
            <View key={e.id}>
              {i ? <Divider /> : null}
              <ListRow testID={`finance-row-${e.id}`} icon={e.type === "income" ? "trending-up" : "trending-down"} tone={e.type === "income" ? "success" : "error"} title={e.category} subtitle={`${fmtDate(e.date)}${e.note ? ` · ${e.note}` : ""}`}
                rightSub={<View style={{ flexDirection: "row", alignItems: "center" }}>
                  <T v="label" weight="semibold" color={e.type === "income" ? colors.success : colors.error}>{e.type === "income" ? "+" : "-"}{rp(e.amount)}</T>
                  {e.kind === "manual" ? <IconButton icon={"trash-2" as any} color={colors.muted} testID={`finance-delete-${i}`} onPress={async () => {
                    if (await confirm({ title: "Hapus catatan?", message: `${e.category} ${rp(e.amount)} akan dihapus.`, confirmText: "Hapus", danger: true })) { deleteFinance(e.id); toast("Catatan dihapus"); }
                  }} /> : null}
                </View>} />
            </View>
          ))}
        </Card>
        </View>
        ))}
        <Pagination {...entryPage} onPage={entryPage.setPage} onSize={entryPage.setSize} sizes={[10, 20, 50]} unit="catatan" testIDPrefix="finance-page" />
        </>
      )}
      <SectionTitle title="Jurnal kas" />
      <Card style={{ paddingVertical: spacing.xs }} testID="finance-ledger">
        {ledger.length === 0 ? <T v="caption" style={{ paddingVertical: spacing.md }}>Belum ada pergerakan kas.</T> : ledgerPage.slice.map((l, i) => (
          <View key={l.id}>{i ? <Divider /> : null}<ListRow title={l.label} subtitle={fmtDateTime(l.date)} rightSub={<T v="label" color={l.amount >= 0 ? colors.success : colors.error}>{l.amount >= 0 ? "+" : ""}{rp(l.amount)}</T>} /></View>
        ))}
      </Card>
      <Pagination {...ledgerPage} onPage={ledgerPage.setPage} unit="pergerakan kas" testIDPrefix="ledger-page" />

      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open === "income" ? "Catat pendapatan" : "Catat pengeluaran"} testID="finance-sheet"
        footer={<Button title="Simpan" icon="check" onPress={submit} testID="finance-save-button" />}>
        <Field money label="Nominal *" value={f.amount} onChangeText={(v) => setF((p) => ({ ...p, amount: v }))} placeholder="0" testID="finance-amount-input" />
        <T v="label" style={{ marginBottom: 6 }}>Kategori *</T>
        <Segment options={(open === "income" ? INC_CATS : EXP_CATS).map((c) => ({ key: c, label: c }))} value={f.category} onChange={(c) => setF((p) => ({ ...p, category: c }))} testIDPrefix="finance-category" />
        <Field label="Tanggal (YYYY-MM-DD)" value={f.date} onChangeText={(v) => setF((p) => ({ ...p, date: v }))} testID="finance-date-input" />
        <Field label="Catatan" value={f.note} onChangeText={(v) => setF((p) => ({ ...p, note: v }))} placeholder="Opsional" testID="finance-note-input" />
      </Sheet>
    </Screen>
  );
}
