import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { useAuth } from "@/src/auth";
import { Badge, Button, Card, Divider, EmptyState, Field, ListRow, Screen, SectionTitle, Segment, Sheet, T, useRun, useUI } from "@/src/components/ui";
import { addSalePayment } from "@/src/data/actions";
import { useDB } from "@/src/data/store";
import type { PayMethod, Payment, Sale } from "@/src/data/types";
import { BluetoothPrintButton } from "@/src/components/bt-print-button";
import { methodLabel, receiptHtml } from "@/src/lib/docs";
import { printHtml, sharePdf } from "@/src/lib/export";
import { fmtDateTime, rp, toNum } from "@/src/lib/format";
import { spacing, useTheme } from "@/src/theme";

export default function SaleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDB();
  const { business } = useAuth();
  const { colors } = useTheme();
  const { toast } = useUI();
  const run = useRun();
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PayMethod>("tunai");
  const sale: Sale | undefined = db.sales.find((s: Sale) => s.id === id);
  if (!sale) return <Screen title="Transaksi"><EmptyState icon="receipt" title="Transaksi tidak ditemukan" message="Data mungkin belum tersinkron." /></Screen>;
  const payments: Payment[] = db.payments.filter((p: Payment) => p.sale_id === id);
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  const due = Math.max(0, sale.total - paid);
  const customer = db.customers.find((c: any) => c.id === sale.customer_id);
  const h = () => receiptHtml(sale, business, customer, paid);
  const safe = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch { toast("Gagal membuka dokumen", "error"); }
  };

  return (
    <Screen title={sale.number} subtitle={fmtDateTime(sale.created_at)} testID="sale-detail-screen">
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <T v="caption">Total</T>
          <Badge label={due ? `Piutang ${rp(due)}` : "Lunas"} tone={due ? "warning" : "success"} testID="sale-status-badge" />
        </View>
        <T v="display" testID="sale-total">{rp(sale.total)}</T>
        <T v="caption">{methodLabel(sale.method)}{customer ? ` · ${customer.name}` : ""}</T>
      </Card>
      <SectionTitle title="Item" />
      <Card style={{ paddingVertical: spacing.xs }}>
        {sale.items.map((it, i) => (
          <View key={i}>
            {i ? <Divider /> : null}
            <ListRow title={it.name} subtitle={`${it.qty} x ${rp(it.price)}${it.discount ? ` · diskon ${rp(it.discount)}` : ""}`} right={rp(it.qty * it.price - it.discount)} />
          </View>
        ))}
        <Divider />
        <ListRow title="Subtotal" right={rp(sale.subtotal)} />
        {sale.discount ? <ListRow title="Diskon transaksi" right={`-${rp(sale.discount)}`} /> : null}
        <ListRow title="Diterima" right={rp(sale.received)} />
        <ListRow title="Kembalian" right={rp(sale.change)} />
        <ListRow title="HPP (modal)" right={rp(sale.cogs)} />
      </Card>
      <SectionTitle title="Pembayaran" />
      <Card style={{ paddingVertical: spacing.xs }}>
        {payments.length === 0 ? <T v="caption" style={{ paddingVertical: spacing.md }}>Belum ada pembayaran.</T> : payments.map((p, i) => (
          <View key={p.id}>{i ? <Divider /> : null}<ListRow title={methodLabel(p.method)} subtitle={fmtDateTime(p.created_at)} right={rp(p.amount)} /></View>
        ))}
      </Card>
      {due ? <Button title="Catat pelunasan" icon="hand-coins" style={{ marginTop: spacing.md }} onPress={() => { setAmount(String(due)); setPayOpen(true); }} testID="sale-add-payment-button" /> : null}
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
        <Button title="Cetak" icon="printer" variant="outline" style={{ flex: 1 }} onPress={() => safe(() => printHtml(h()))} testID="sale-print-button" />
        <Button title="Bagikan PDF" icon="share-2" variant="outline" style={{ flex: 1 }} onPress={() => safe(() => sharePdf(h(), sale.number))} testID="sale-share-button" />
      </View>
      <BluetoothPrintButton sale={sale} business={business} customer={customer} paid={paid} testID="sale-bt-print-button" />
      {sale.note ? <T v="caption" style={{ marginTop: spacing.md }}>Catatan: {sale.note}</T> : null}
      <T v="caption" style={{ marginTop: spacing.md }} color={colors.muted}>Transaksi bersifat permanen (tidak dapat diubah) agar laporan dan stok tetap konsisten.</T>

      <Sheet visible={payOpen} onClose={() => setPayOpen(false)} title="Catat pelunasan" testID="payment-sheet"
        footer={<Button title="Simpan pembayaran" icon="check" testID="payment-save-button" onPress={() => { if (run(() => addSalePayment(sale.id, toNum(amount), method), "Pembayaran dicatat")) setPayOpen(false); }} />}>
        <T v="caption" style={{ marginBottom: spacing.md }}>Sisa piutang {rp(due)}</T>
        <Field money label="Nominal" value={amount} onChangeText={setAmount} testID="payment-amount-input" />
        <Segment options={[{ key: "tunai", label: "Tunai" }, { key: "transfer", label: "Transfer" }, { key: "qris", label: "QRIS" }, { key: "lainnya", label: "Lainnya" }] as { key: PayMethod; label: string }[]} value={method} onChange={setMethod} testIDPrefix="payment-method" />
      </Sheet>
    </Screen>
  );
}
