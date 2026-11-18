import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Badge, Card, Chips, Divider, EmptyState, IconButton, ListRow, Screen, SearchBar, T } from "@/src/components/ui";
import { useDB } from "@/src/data/store";
import type { Invoice } from "@/src/data/types";
import { invoiceStatusLabel } from "@/src/lib/docs";
import { dayKey, fmtDate, rp } from "@/src/lib/format";
import { spacing, useTheme } from "@/src/theme";

type F = "invoice" | "quotation" | "unpaid";
export const statusTone = (i: Invoice) => (i.status === "lunas" ? "success" : i.status === "batal" ? "neutral" : i.doc_type === "invoice" && i.due_date < dayKey() ? "error" : i.status === "draft" ? "neutral" : "warning");

export default function Invoices() {
  const db = useDB();
  const router = useRouter();
  const { colors } = useTheme();
  const [f, setF] = useState<F>("invoice");
  const [q, setQ] = useState("");
  const list = (db.invoices as Invoice[])
    .filter((i) => (f === "unpaid" ? i.doc_type === "invoice" && (i.status === "draft" || i.status === "terkirim") : i.doc_type === f))
    .filter((i) => `${i.number} ${i.customer_name}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const newDoc = (t: "invoice" | "quotation") => router.push({ pathname: "/invoice-form", params: { type: t } });

  return (
    <Screen title="Invoice & Quotation" testID="invoices-screen"
      right={<IconButton icon="plus" bg={colors.brandPrimary} color={colors.onBrandPrimary} onPress={() => newDoc(f === "quotation" ? "quotation" : "invoice")} testID="invoices-add-button" label="Buat dokumen" />}
      headerExtra={
        <View style={{ marginHorizontal: -spacing.sm }}>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}><SearchBar value={q} onChangeText={setQ} placeholder="Cari nomor atau pelanggan" testID="invoices-search-input" /></View>
          <Chips value={f} onChange={setF} testIDPrefix="invoices-filter" options={[{ key: "invoice", label: "Invoice" }, { key: "quotation", label: "Quotation" }, { key: "unpaid", label: "Belum dibayar" }]} />
        </View>
      }>
      {list.length === 0 ? (
        <EmptyState icon="file-text" title={f === "quotation" ? "Belum ada quotation" : "Belum ada invoice"} message="Buat dokumen profesional yang siap dicetak atau dibagikan ke pelanggan." action={f === "quotation" ? "Buat quotation" : "Buat invoice"} onAction={() => newDoc(f === "quotation" ? "quotation" : "invoice")} testID="invoices-empty" />
      ) : (
        <Card style={{ paddingVertical: spacing.xs }}>
          {list.map((inv, i) => (
            <View key={inv.id}>
              {i ? <Divider /> : null}
              <ListRow testID={`invoice-row-${i}`} icon="file-text" title={inv.customer_name} subtitle={`${inv.number} · ${inv.doc_type === "invoice" ? "Jatuh tempo" : "Berlaku s.d."} ${fmtDate(inv.due_date)}`} onPress={() => router.push(`/invoice/${inv.id}`)}
                rightSub={<View style={{ alignItems: "flex-end", gap: 4 }}><T v="label" weight="semibold">{rp(inv.total)}</T><Badge label={invoiceStatusLabel(inv.status, inv.doc_type)} tone={statusTone(inv) as any} /></View>} />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
