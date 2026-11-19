import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { Button, Divider, Field, Icon, IconButton, PickerSheet, Segment, Sheet, T, useUI } from "@/src/components/ui";
import type { CartLine } from "@/src/data/actions";
import type { Business, Contact, PayMethod, Sale } from "@/src/data/types";
import { BluetoothPrintButton } from "@/src/components/bt-print-button";
import { receiptHtml } from "@/src/lib/docs";
import { cartProfit, pct } from "@/src/lib/profit";
import { useAuth } from "@/src/auth";
import { printHtml, sharePdf } from "@/src/lib/export";
import { addDays, dayKey, fmtDate, rp, toNum } from "@/src/lib/format";
import { saveContact } from "@/src/data/actions";
import { radius, spacing, useTheme } from "@/src/theme";

type PayMode = "lunas" | "sebagian" | "utang";
const PAY_MODES: { key: PayMode; label: string }[] = [
  { key: "lunas", label: "Lunas" }, { key: "sebagian", label: "Bayar sebagian" }, { key: "utang", label: "Belum bayar" },
];
const PROMISE_PRESETS: [string, number | "eom"][] = [["Besok", 1], ["3 hari", 3], ["1 minggu", 7], ["2 minggu", 14], ["Akhir bulan", "eom"]];
const endOfMonth = () => {
  const d = new Date();
  return dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};

const METHODS: { key: PayMethod; label: string }[] = [
  { key: "tunai", label: "Tunai" }, { key: "transfer", label: "Transfer" }, { key: "qris", label: "QRIS" }, { key: "lainnya", label: "Lainnya" },
];

export function CheckoutSheet({ visible, onClose, cart, setCart, stock, customers, onPay }: {
  visible: boolean; onClose: () => void; cart: CartLine[]; setCart: (f: (c: CartLine[]) => CartLine[]) => void; stock: Record<string, number>;
  customers: Contact[]; onPay: (o: { discount: number; method: PayMethod; received: number; customer_id: string | null; note: string; due_date: string | null }) => void;
}) {
  const { colors } = useTheme();
  const { toast } = useUI();
  const [discount, setDiscount] = useState("");
  const [method, setMethod] = useState<PayMethod>("tunai");
  const [received, setReceived] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("lunas");
  const [paidNow, setPaidNow] = useState("");
  const [promise, setPromise] = useState(addDays(dayKey(), 7));
  const [customer, setCustomer] = useState<Contact | null>(null);
  const [newCust, setNewCust] = useState<{ name: string; phone: string } | null>(null);
  const [note, setNote] = useState("");
  const [pick, setPick] = useState(false);
  const [itemDisc, setItemDisc] = useState<string | null>(null);

  const subtotal = cart.reduce((a, l) => a + l.qty * l.product.sell_price - l.discount, 0);
  const total = Math.max(0, subtotal - toNum(discount));
  // How much the buyer pays now: full (cash counted for change), part of it, or nothing yet.
  const rec = payMode === "utang" ? 0 : payMode === "sebagian" ? Math.min(toNum(paidNow), total) : method === "tunai" ? toNum(received) : received === "" ? total : toNum(received);
  const change = payMode === "lunas" ? Math.max(0, rec - total) : 0;
  const short = Math.max(0, total - rec);
  const debt = payMode !== "lunas" && short > 0;
  const cashShort = payMode === "lunas" && short > 0;
  const { isOwner } = useAuth();
  const prof = cartProfit(cart, toNum(discount));

  useEffect(() => {
    if (!visible) return;
    setReceived("");
    setPaidNow("");
    setPayMode("lunas");
    setPromise(addDays(dayKey(), 7));
    setNewCust(null);
    setItemDisc(null);
  }, [visible]);

  const save = () => {
    if (cashShort) return toast(`Uang kurang ${rp(short)}. Pilih "Bayar sebagian" atau "Belum bayar" jika sisanya diutang.`, "error");
    let cust = customer;
    if (debt && !cust && newCust) {
      try {
        cust = saveContact("customers", { name: newCust.name, phone: newCust.phone });
        setCustomer(cust);
      } catch (e: any) {
        return toast(e.message, "error");
      }
    }
    if (debt && !cust) return toast("Pilih atau tambahkan pelanggan yang berutang", "error");
    if (debt && !/^\d{4}-\d{2}-\d{2}$/.test(promise)) return toast("Isi tanggal janji bayar (contoh 2026-12-01)", "error");
    onPay({ discount: toNum(discount), method, received: rec, customer_id: cust?.id ?? null, note, due_date: debt ? promise : null });
  };
  useEffect(() => {
    if (visible && cart.length === 0) onClose();
  }, [cart.length, visible, onClose]);

  const setQty = (id: string, qty: number) => {
    if (qty > (stock[id] ?? 0)) return toast("Stok tidak cukup", "error");
    setCart((c) => (qty <= 0 ? c.filter((l) => l.product.id !== id) : c.map((l) => (l.product.id === id ? { ...l, qty } : l))));
  };
  const quick = [total, Math.ceil(total / 50000) * 50000, Math.ceil(total / 100000) * 100000].filter((v, i, a) => v > 0 && a.indexOf(v) === i);

  return (
    <Sheet visible={visible} onClose={onClose} title={isOwner ? "Ringkasan penjualan" : "Pembayaran"} testID="checkout-sheet"
      footer={
        <View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm }}>
            <T v="label" color={colors.muted}>Total bayar</T>
            <T v="h2" testID="checkout-total">{rp(total)}</T>
          </View>
          {isOwner && total > 0 ? (
            <View testID="checkout-profit" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: prof.profit >= 0 ? colors.successSoft : colors.errorSoft, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.sm }}>
              <T v="caption" color={prof.profit >= 0 ? colors.success : colors.error} style={{ flex: 1 }}>
                {prof.profit >= 0 ? "Untung transaksi ini" : "Rugi: harga di bawah modal"}{prof.missingCost ? ` · ${prof.missingCost} produk belum ada harga modal` : ""}
              </T>
              <T v="label" color={prof.profit >= 0 ? colors.success : colors.error} testID="checkout-profit-value">{rp(prof.profit)} · {pct(prof.margin)}</T>
            </View>
          ) : null}
          <Button title={debt ? `Simpan · utang ${rp(short)}` : "Simpan penjualan"} icon="circle-check" size="lg" testID="checkout-confirm-button" onPress={save} />
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
              {isOwner ? (() => {
                const lineProfit = l.qty * (l.product.sell_price - (l.product.cost_price || 0)) - l.discount;
                const left = (stock[l.product.id] ?? 0) - l.qty;
                return (
                  <T v="caption" numberOfLines={2} testID={`cart-line-${i}-owner`}>
                    {l.product.cost_price ? <T v="caption" color={lineProfit >= 0 ? colors.success : colors.error}>{lineProfit >= 0 ? "untung" : "rugi"} {rp(Math.abs(lineProfit))}</T> : <T v="caption" color={colors.warningText}>modal belum diisi</T>}
                    {" · "}
                    <T v="caption" color={left <= 0 ? colors.error : left <= l.product.min_stock ? colors.warningText : colors.muted}>{left <= 0 ? "stok habis setelah ini" : `sisa stok ${left} ${l.product.unit}`}</T>
                  </T>
                );
              })() : null}
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
      {isOwner && total > 0 ? (
        <View testID="checkout-owner-breakdown" style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.lg }}>
          <T v="label" style={{ marginBottom: spacing.sm }}>Rincian untung</T>
          {[
            ["Penjualan (omzet)", rp(prof.revenue), colors.onSurface],
            ["Modal barang", `-${rp(prof.cost)}`, colors.muted],
            ["Untung", rp(prof.profit), prof.profit >= 0 ? colors.success : colors.error],
            ["Margin", pct(prof.margin), prof.profit >= 0 ? colors.success : colors.error],
          ].map(([label, value, color], i) => (
            <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderTopWidth: i === 2 ? 1 : 0, borderTopColor: colors.border, marginTop: i === 2 ? 4 : 0, paddingTop: i === 2 ? 7 : 3 }}>
              <T v={i >= 2 ? "label" : "body"} color={i >= 2 ? (color as string) : colors.muted}>{label}</T>
              <T v="label" color={color as string} testID={`checkout-owner-${i}`}>{value}</T>
            </View>
          ))}
          {prof.missingCost ? <T v="caption" color={colors.warningText} style={{ marginTop: spacing.xs }}>{prof.missingCost} produk belum punya harga modal, jadi untung terlihat lebih besar. Lengkapi di menu Produk.</T> : null}
        </View>
      ) : null}
      <T v="label" style={{ marginBottom: 6 }}>{isOwner ? "Pembayaran dari pembeli" : "Pembayaran"}</T>
      <Segment options={PAY_MODES} value={payMode} onChange={setPayMode} testIDPrefix="checkout-paymode" />
      {payMode !== "utang" ? (
        <>
          <T v="caption" style={{ marginBottom: 6 }}>Dibayar dengan</T>
          <Segment options={METHODS} value={method} onChange={setMethod} testIDPrefix="checkout-method" />
        </>
      ) : null}
      {payMode === "lunas" ? (
        <>
          <Field money label={method === "tunai" ? "Uang diterima" : "Jumlah dibayar"} value={received} onChangeText={setReceived} placeholder={method === "tunai" ? "0" : String(total)} testID="checkout-received-input"
            help={method !== "tunai" ? "Kosongkan bila dibayar penuh" : undefined} />
          {method === "tunai" ? (
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: -spacing.sm, marginBottom: spacing.lg, flexWrap: "wrap" }}>
              {quick.map((v, i) => <Button key={v} size="sm" variant="outline" title={i === 0 ? "Uang pas" : rp(v)} onPress={() => setReceived(String(v))} testID={`checkout-quick-${i}`} />)}
            </View>
          ) : null}
        </>
      ) : null}
      {payMode === "sebagian" ? (
        <Field money label="Dibayar sekarang" value={paidNow} onChangeText={setPaidNow} placeholder="0" testID="checkout-paid-now-input" help={`Total ${rp(total)}. Sisanya dicatat sebagai utang pelanggan.`} />
      ) : null}

      {payMode === "lunas" ? (
        <View style={{ backgroundColor: cashShort ? colors.warningSoft : colors.successSoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg, flexDirection: "row", justifyContent: "space-between" }}>
          <T v="label" color={cashShort ? colors.warningText : colors.success}>{cashShort ? "Uang kurang" : "Kembalian"}</T>
          <T v="h3" color={cashShort ? colors.warningText : colors.success} testID="checkout-change">{rp(cashShort ? short : change)}</T>
        </View>
      ) : (
        <View testID="checkout-debt" style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.warningSoft, padding: spacing.md, marginBottom: spacing.lg }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <T v="label" color={colors.warningText}>Sisa utang pelanggan</T>
            <T v="h3" color={colors.warningText} testID="checkout-debt-amount">{rp(short)}</T>
          </View>
          <T v="caption" color={colors.warningText} style={{ marginTop: 2 }}>Dibayar sekarang {rp(rec)} dari {rp(total)}</T>
          <View style={{ height: 1, backgroundColor: colors.warning, opacity: 0.3, marginVertical: spacing.md }} />
          <Field label="Janji bayar tanggal" value={promise} onChangeText={setPromise} placeholder="YYYY-MM-DD" testID="checkout-promise-input"
            help={/^\d{4}-\d{2}-\d{2}$/.test(promise) ? `${fmtDate(promise)} · pengingat tagihan muncul di Beranda` : "Format: tahun-bulan-tanggal"} />
          <View style={{ flexDirection: "row", gap: spacing.xs, flexWrap: "wrap", marginTop: -spacing.sm }}>
            {PROMISE_PRESETS.map(([label, days]) => {
              const d = days === "eom" ? endOfMonth() : addDays(dayKey(), days as number);
              return <Button key={label} size="sm" variant={promise === d ? "primary" : "outline"} title={label} onPress={() => setPromise(d)} testID={`checkout-promise-${label}`} />;
            })}
          </View>
        </View>
      )}

      <T v="label" style={{ marginBottom: 6 }}>Pelanggan {debt ? "(yang berutang)" : "(opsional)"}</T>
      {newCust && !customer ? (
        <View testID="checkout-new-customer" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg }}>
          <Field label="Nama pelanggan" value={newCust.name} onChangeText={(name) => setNewCust({ ...newCust, name })} placeholder="Contoh: Bu Sari" testID="checkout-new-customer-name" />
          <Field label="Nomor WhatsApp" value={newCust.phone} onChangeText={(phone) => setNewCust({ ...newCust, phone })} keyboardType="phone-pad" placeholder="08xxxxxxxxxx" testID="checkout-new-customer-phone" help="Dipakai untuk mengirim pengingat tagihan." />
          <Button size="sm" variant="ghost" title="Pilih dari daftar pelanggan" onPress={() => { setNewCust(null); setPick(true); }} />
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg }}>
          <Pressable onPress={() => setPick(true)} testID="checkout-customer-picker" style={{ flex: 1, height: 48, borderWidth: 1, borderColor: debt && !customer ? colors.warning : colors.border, borderRadius: radius.md, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, gap: spacing.sm }}>
            <Icon name="user" size={18} color={colors.muted} />
            <T v="body" style={{ flex: 1 }} numberOfLines={1} color={customer ? colors.onSurface : colors.muted}>{customer?.name ?? "Pilih pelanggan"}</T>
            {customer ? <IconButton icon="x" onPress={() => setCustomer(null)} testID="checkout-customer-clear" /> : null}
          </Pressable>
          {!customer ? <Button variant="outline" title="Baru" icon="user-plus" onPress={() => setNewCust({ name: "", phone: "" })} testID="checkout-new-customer-button" /> : null}
        </View>
      )}
      <Field label="Catatan" value={note} onChangeText={setNote} placeholder="Opsional" testID="checkout-note-input" />
      <PickerSheet visible={pick} onClose={() => setPick(false)} title="Pilih pelanggan" items={customers.filter((c) => !c.archived)} getLabel={(c) => c.name} getSub={(c) => c.phone}
        onPick={setCustomer} testID="customer-picker" emptyText="Belum ada pelanggan. Tekan Baru untuk menambahkan." />
    </Sheet>
  );
}

export function ReceiptSheet({ sale, onClose, business, customer, paid, onDetail }: { sale: Sale | null; onClose: () => void; business: Business | null; customer?: Contact; paid: number; onDetail: () => void }) {
  const { colors } = useTheme();
  const { isOwner } = useAuth();
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
        {isOwner ? <T v="caption" color={sale.total - sale.cogs >= 0 ? colors.success : colors.error} testID="receipt-profit">{sale.total - sale.cogs >= 0 ? "Untung" : "Rugi"} {rp(Math.abs(sale.total - sale.cogs))} dari transaksi ini</T> : null}
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
