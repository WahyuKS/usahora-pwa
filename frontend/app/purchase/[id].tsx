import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Badge, Button, Card, Divider, EmptyState, Field, ListRow, Screen, SectionTitle, Sheet, T, useRun, useUI } from "@/src/components/ui";
import { payPurchase, receivePurchase } from "@/src/data/actions";
import { useDB } from "@/src/data/store";
import type { Purchase } from "@/src/data/types";
import { fmtDateTime, rp, toNum } from "@/src/lib/format";
import { spacing } from "@/src/theme";

export default function PurchaseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDB();
  const run = useRun();
  const { confirm } = useUI();
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const p: Purchase | undefined = db.purchases.find((x: Purchase) => x.id === id);
  if (!p) return <Screen title="Pembelian"><EmptyState icon="truck" title="Pembelian tidak ditemukan" message="Data mungkin sudah dihapus." /></Screen>;
  const due = p.total - p.paid_amount;
  const supplier = db.suppliers.find((s: any) => s.id === p.supplier_id);

  return (
    <Screen title={p.number} subtitle={fmtDateTime(p.created_at)} testID="purchase-detail-screen">
      <Card>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm }}>
          <Badge label={p.status === "diterima" ? "Diterima" : "Belum diterima"} tone={p.status === "diterima" ? "success" : "brand"} testID="purchase-status-badge" />
          <Badge label={due > 0 ? `Sisa ${rp(due)}` : "Lunas"} tone={due > 0 ? "warning" : "success"} testID="purchase-pay-badge" />
        </View>
        <T v="display">{rp(p.total)}</T>
        <T v="caption">{supplier?.name ?? "Tanpa supplier"} · dibayar {rp(p.paid_amount)}</T>
      </Card>
      <SectionTitle title="Barang" />
      <Card style={{ paddingVertical: spacing.xs }}>
        {p.items.map((it, i) => (
          <View key={i}>{i ? <Divider /> : null}<ListRow title={it.name} subtitle={`${it.qty} x ${rp(it.cost)}`} right={rp(it.qty * it.cost)} /></View>
        ))}
        {p.extra_cost ? <><Divider /><ListRow title="Biaya tambahan" right={rp(p.extra_cost)} /></> : null}
      </Card>
      {p.status !== "diterima" ? (
        <Button title="Tandai diterima & tambah stok" icon="package-plus" style={{ marginTop: spacing.lg }} testID="purchase-receive-button"
          onPress={async () => { if (await confirm({ title: "Terima barang?", message: "Stok setiap barang akan bertambah dan tercatat di riwayat stok." })) run(() => receivePurchase(p.id), "Barang diterima, stok bertambah"); }} />
      ) : <T v="caption" style={{ marginTop: spacing.md }}>Diterima {p.received_at ? fmtDateTime(p.received_at) : ""}</T>}
      {due > 0 ? <Button title="Catat pembayaran" icon="banknote" variant="secondary" style={{ marginTop: spacing.sm }} onPress={() => { setAmount(String(due)); setPayOpen(true); }} testID="purchase-pay-button" /> : null}
      {p.note ? <T v="caption" style={{ marginTop: spacing.md }}>Catatan: {p.note}</T> : null}
      <Sheet visible={payOpen} onClose={() => setPayOpen(false)} title="Pembayaran ke supplier" testID="purchase-pay-sheet"
        footer={<Button title="Simpan" icon="check" testID="purchase-pay-save" onPress={() => { if (run(() => payPurchase(p.id, toNum(amount)), "Pembayaran dicatat")) setPayOpen(false); }} />}>
        <Field money label={`Nominal (sisa ${rp(due)})`} value={amount} onChangeText={setAmount} testID="purchase-pay-amount" />
      </Sheet>
    </Screen>
  );
}
