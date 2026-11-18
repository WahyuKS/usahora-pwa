import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { Button, Divider, Field, Icon, IconButton, PickerSheet, Segment, Sheet, T, useUI } from "@/src/components/ui";
import type { CartLine } from "@/src/data/actions";
import type { Business, Contact, PayMethod, Sale } from "@/src/data/types";
import { BluetoothPrintButton } from "@/src/components/bt-print-button";
import { receiptHtml } from "@/src/lib/docs";
import { printHtml, sharePdf } from "@/src/lib/export";
import { rp, toNum } from "@/src/lib/format";
import { radius, spacing, useTheme } from "@/src/theme";

const METHODS: { key: PayMethod; label: string }[] = [
  { key: "tunai", label: "Tunai" }, { key: "transfer", label: "Transfer" }, { key: "qris", label: "QRIS" }, { key: "lainnya", label: "Lainnya" },
];

export function CheckoutSheet({ visible, onClose, cart, setCart, stock, customers, onPay }: {
  visible: boolean; onClose: () => void; cart: CartLine[]; setCart: (f: (c: CartLine[]) => CartLine[]) => void; stock: Record<string, number>;
  customers: Contact[]; onPay: (o: { discount: number; method: PayMethod; received: number; customer_id: string | null; note: string }) => void;
}) {
  const { colors } = useTheme();
  const { toast } = useUI();
  const [discount, setDiscount] = useState("");
  const [method, setMethod] = useState<PayMethod>("tunai");
  const [received, setReceived] = useState("");
  const [customer, setCustomer] = useState<Contact | null>(null);
  const [note, setNote] = useState("");
  const [pick, setPick] = useState(false);
  const [itemDisc, setItemDisc] = useState<string | null>(null);

  const subtotal = cart.reduce((a, l) => a + l.qty * l.product.sell_price - l.discount, 0);
  const total = Math.max(0, subtotal - toNum(discount));
  const rec = method === "tunai" ? toNum(received) : received === "" ? total : toNum(received);
  const change = Math.max(0, rec - total);
  const short = Math.max(0, total - rec);

  useEffect(() => {
    if (!visible) return;
    setReceived("");
    setItemDisc(null);
  }, [visible]);
  useEffect(() => {
    if (visible && cart.length === 0) onClose();
  }, [cart.length, visible, onClose]);

  const setQty = (id: string, qty: number) => {
    if (qty > (stock[id] ?? 0)) return toast("Stok tidak cukup", "error");
    setCart((c) => (qty <= 0 ? c.filter((l) => l.product.id !== id) : c.map((l) => (l.product.id === id ? { ...l, qty } : l))));
  };
  const quick = [total, Math.ceil(total / 50000) * 50000, Math.ceil(total / 100000) * 100000].filter((v, i, a) => v > 0 && a.indexOf(v) === i);

  return (
    <Sheet visible={visible} onClose={onClose} title="Pembayaran" testID="checkout-sheet"
      footer={
        <View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm }}>
            <T v="label" color={colors.muted}>Total bayar</T>
            <T v="h2" testID="checkout-total">{rp(total)}</T>
          </View>
          <Button title={short > 0 && customer ? `Simpan (piutang ${rp(short)})` : "Simpan transaksi"} icon="circle-check" size="lg" testID="checkout-confirm-button"
            onPress={() => onPay({ discount: toNum(discount), method, received: rec, customer_id: customer?.id ?? null, note })} />
        </View>
      }>
      {cart.map((l, i) => (
        <View key={l.product.id} testID={`cart-line-${i}`}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T v="label" numberOfLines={1}>{l.product.name}</T>
              <Pressable onPress={() => setItemDisc(itemDisc === l.product.id ? null : l.product.id)} testID={`cart-line-${i}-discount-toggle`}>
                <T v="caption" color={l.discount ? colors.success : colors.brandPrimary}>{rp(l.product.sell_price)} · {l.discount ? `diskon ${rp(l.discount)}` : "+ diskon item"}</T>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }}>
              <IconButton icon={l.qty === 1 ? "trash-2" as any : "minus"} onPress={() => setQty(l.product.id, l.qty - 1)} testID={`cart-line-${i}-minus`} color={l.qty === 1 ? colors.error : undefined} />
              <T v="label" weight="bold" style={{ minWidth: 24, textAlign: "center" }} testID={`cart-line-${i}-qty`}>{l.qty}</T>
              <IconButton icon="plus" onPress={() => setQty(l.product.id, l.qty + 1)} testID={`cart-line-${i}-plus`} />
            </View>
            <T v="label" weight="semibold" style={{ width: 92, textAlign: "right" }}>{rp(l.qty * l.product.sell_price - l.discount)}</T>
          </View>
          {itemDisc === l.product.id ? (
            <Field money label="Diskon item (Rp)" value={l.discount ? String(l.discount) : ""} testID={`cart-line-${i}-discount-input`}
              onChangeText={(t) => setCart((c) => c.map((x) => (x.product.id === l.product.id ? { ...x, discount: Math.min(toNum(t), x.qty * x.product.sell_price) } : x)))} />
          ) : null}
          <Divider />
        </View>
      ))}
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginVertical: spacing.md }}>
        <T v="body" color={colors.muted}>Subtotal</T>
        <T v="label" testID="checkout-subtotal">{rp(subtotal)}</T>
      </View>
      <Field money label="Diskon transaksi" value={discount} onChangeText={setDiscount} placeholder="0" testID="checkout-discount-input" />
      <T v="label" style={{ marginBottom: 6 }}>Metode pembayaran</T>
      <Segment options={METHODS} value={method} onChange={setMethod} testIDPrefix="checkout-method" />
      <Field money label={method === "tunai" ? "Uang diterima" : "Jumlah dibayar"} value={received} onChangeText={setReceived} placeholder={method === "tunai" ? "0" : String(total)} testID="checkout-received-input"
        help={method !== "tunai" ? "Kosongkan bila dibayar penuh" : undefined} />
      {method === "tunai" ? (
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: -spacing.sm, marginBottom: spacing.lg, flexWrap: "wrap" }}>
          {quick.map((v, i) => <Button key={v} size="sm" variant="outline" title={i === 0 ? "Uang pas" : rp(v)} onPress={() => setReceived(String(v))} testID={`checkout-quick-${i}`} />)}
        </View>
      ) : null}
      <View style={{ backgroundColor: short > 0 ? colors.warningSoft : colors.successSoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg, flexDirection: "row", justifyContent: "space-between" }}>
        <T v="label" color={short > 0 ? colors.warningText : colors.success}>{short > 0 ? "Kurang bayar" : "Kembalian"}</T>
        <T v="h3" color={short > 0 ? colors.warningText : colors.success} testID="checkout-change">{rp(short > 0 ? short : change)}</T>
      </View>
      <T v="label" style={{ marginBottom: 6 }}>Pelanggan {short > 0 ? "(wajib untuk piutang)" : "(opsional)"}</T>
      <Pressable onPress={() => setPick(true)} testID="checkout-customer-picker" style={{ height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, gap: spacing.sm, marginBottom: spacing.lg }}>
        <Icon name="user" size={18} color={colors.muted} />
        <T v="body" style={{ flex: 1 }} color={customer ? colors.onSurface : colors.muted}>{customer?.name ?? "Pilih pelanggan"}</T>
        {customer ? <IconButton icon="x" onPress={() => setCustomer(null)} testID="checkout-customer-clear" /> : null}
      </Pressable>
      <Field label="Catatan" value={note} onChangeText={setNote} placeholder="Opsional" testID="checkout-note-input" />
      <PickerSheet visible={pick} onClose={() => setPick(false)} title="Pilih pelanggan" items={customers.filter((c) => !c.archived)} getLabel={(c) => c.name} getSub={(c) => c.phone}
        onPick={setCustomer} testID="customer-picker" emptyText="Belum ada pelanggan. Tambahkan di menu Pelanggan." />
    </Sheet>
  );
}

export function ReceiptSheet({ sale, onClose, business, customer, paid, onDetail }: { sale: Sale | null; onClose: () => void; business: Business | null; customer?: Contact; paid: number; onDetail: () => void }) {
  const { colors } = useTheme();
  const { toast } = useUI();
  if (!sale) return null;
  const h = () => receiptHtml(sale, business, customer, paid);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      toast("Gagal membuka dokumen", "error");
    }
  };
  return (
    <Sheet visible={!!sale} onClose={onClose} title="Transaksi berhasil" testID="receipt-sheet">
      <View style={{ alignItems: "center", paddingVertical: spacing.lg, gap: spacing.xs }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" }}>
          <Icon name="check" size={32} color={colors.success} />
        </View>
        <T v="caption" style={{ marginTop: spacing.sm }} testID="receipt-number">{sale.number}</T>
        <T v="display" testID="receipt-total">{rp(sale.total)}</T>
        <T v="label" color={colors.success} testID="receipt-change">Kembalian {rp(sale.change)}</T>
        {paid < sale.total ? <T v="label" color={colors.warningText}>Piutang {rp(sale.total - paid)}</T> : null}
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button title="Cetak" icon="printer" variant="outline" style={{ flex: 1 }} onPress={() => run(() => printHtml(h()))} testID="receipt-print-button" />
        <Button title="Bagikan PDF" icon="share-2" variant="outline" style={{ flex: 1 }} onPress={() => run(() => sharePdf(h(), sale.number))} testID="receipt-share-button" />
      </View>
      <BluetoothPrintButton sale={sale} business={business} customer={customer} paid={paid} testID="receipt-bt-print-button" />
      <Button title="Lihat detail" variant="ghost" onPress={onDetail} style={{ marginTop: spacing.sm }} testID="receipt-detail-button" />
      <Button title="Transaksi baru" icon="plus" onPress={onClose} style={{ marginTop: spacing.sm }} testID="receipt-new-sale-button" />
    </Sheet>
  );
}
