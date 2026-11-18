import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Button, Card, Divider, Field, Icon, IconButton, PickerSheet, Screen, SectionTitle, Segment, T, useRun } from "@/src/components/ui";
import { savePurchase } from "@/src/data/actions";
import { useDB } from "@/src/data/store";
import type { Contact, Product } from "@/src/data/types";
import { rp, toNum } from "@/src/lib/format";
import { radius, spacing, useTheme } from "@/src/theme";

type Line = { product: Product; qty: string; cost: string };

export default function PurchaseForm() {
  const db = useDB();
  const router = useRouter();
  const run = useRun();
  const { colors } = useTheme();
  const [supplier, setSupplier] = useState<Contact | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [extra, setExtra] = useState("");
  const [payMode, setPayMode] = useState<"lunas" | "sebagian" | "belum">("lunas");
  const [paid, setPaid] = useState("");
  const [received, setReceived] = useState<"yes" | "no">("yes");
  const [note, setNote] = useState("");
  const [pickS, setPickS] = useState(false);
  const [pickP, setPickP] = useState(false);
  const total = lines.reduce((a, l) => a + toNum(l.qty) * toNum(l.cost), 0) + toNum(extra);
  const upd = (i: number, k: "qty" | "cost", v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const submit = () => {
    const paidAmount = payMode === "lunas" ? total : payMode === "belum" ? 0 : toNum(paid);
    const ok = run(() => savePurchase({
      supplier_id: supplier?.id ?? null, items: lines.map((l) => ({ product_id: l.product.id, name: l.product.name, qty: toNum(l.qty), cost: toNum(l.cost) })),
      extra_cost: toNum(extra), paid_amount: paidAmount, received: received === "yes", note,
    }), "Pembelian disimpan");
    if (ok) router.back();
  };

  const pickerBox = (label: string, onPress: () => void, testID: string, icon: any) => (
    <Pressable onPress={onPress} testID={testID} style={{ height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, gap: spacing.sm, backgroundColor: colors.surface, marginBottom: spacing.lg }}>
      <Icon name={icon} size={18} color={colors.muted} /><T v="body" style={{ flex: 1 }}>{label}</T><Icon name="chevron-right" size={18} color={colors.muted} />
    </Pressable>
  );

  return (
    <Screen title="Catat pembelian" testID="purchase-form-screen"
      footer={<View><View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm }}><T v="label" color={colors.muted}>Total pembelian</T><T v="h3" testID="purchase-total">{rp(total)}</T></View>
        <Button title="Simpan pembelian" icon="check" size="lg" onPress={submit} testID="purchase-save-button" /></View>}>
      <T v="label" style={{ marginBottom: 6 }}>Supplier</T>
      {pickerBox(supplier?.name ?? "Pilih supplier (opsional)", () => setPickS(true), "purchase-supplier-picker", "store")}
      <SectionTitle title="Barang" />
      {lines.map((l, i) => (
        <Card key={l.product.id} style={{ marginBottom: spacing.sm, padding: spacing.md }} testID={`purchase-line-${i}`}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.sm }}>
            <T v="label" style={{ flex: 1 }} numberOfLines={1}>{l.product.name}</T>
            <IconButton icon={"trash-2" as any} color={colors.error} onPress={() => setLines((ls) => ls.filter((_, j) => j !== i))} testID={`purchase-line-${i}-remove`} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}><Field label="Jumlah" value={l.qty} onChangeText={(v) => upd(i, "qty", v)} keyboardType="decimal-pad" testID={`purchase-line-${i}-qty`} /></View>
            <View style={{ flex: 1.4 }}><Field money label="Harga beli / unit" value={l.cost} onChangeText={(v) => upd(i, "cost", v)} testID={`purchase-line-${i}-cost`} /></View>
          </View>
        </Card>
      ))}
      <Button title="Tambah barang" icon="plus" variant="secondary" onPress={() => setPickP(true)} testID="purchase-add-item-button" style={{ marginBottom: spacing.lg }} />
      <Divider />
      <View style={{ height: spacing.lg }} />
      <Field money label="Biaya tambahan (ongkir, dll.)" value={extra} onChangeText={setExtra} placeholder="0" testID="purchase-extra-input" help="Dibagi rata ke harga modal per unit saat diterima" />
      <T v="label" style={{ marginBottom: 6 }}>Status pembayaran</T>
      <Segment options={[{ key: "lunas", label: "Lunas" }, { key: "sebagian", label: "Sebagian" }, { key: "belum", label: "Belum bayar" }] as const as any} value={payMode} onChange={setPayMode as any} testIDPrefix="purchase-pay" />
      {payMode === "sebagian" ? <Field money label="Jumlah dibayar" value={paid} onChangeText={setPaid} testID="purchase-paid-input" /> : null}
      <T v="label" style={{ marginBottom: 6 }}>Barang sudah diterima?</T>
      <Segment options={[{ key: "yes", label: "Ya, tambah stok sekarang" }, { key: "no", label: "Belum" }] as any} value={received} onChange={setReceived as any} testIDPrefix="purchase-received" />
      <Field label="Catatan" value={note} onChangeText={setNote} placeholder="Opsional" testID="purchase-note-input" />

      <PickerSheet visible={pickS} onClose={() => setPickS(false)} title="Pilih supplier" items={db.suppliers.filter((s: Contact) => !s.archived)} getLabel={(s: Contact) => s.name} onPick={setSupplier} testID="supplier-picker" emptyText="Belum ada supplier. Tambahkan di menu Supplier." />
      <PickerSheet visible={pickP} onClose={() => setPickP(false)} title="Pilih produk" items={db.products.filter((p: Product) => !p.archived && !lines.some((l) => l.product.id === p.id))} getLabel={(p: Product) => p.name} getSub={(p: Product) => `Modal ${rp(p.cost_price)}`}
        onPick={(p: Product) => setLines((ls) => [...ls, { product: p, qty: "1", cost: String(p.cost_price) }])} testID="purchase-product-picker" emptyText="Tidak ada produk. Tambahkan produk terlebih dahulu." />
    </Screen>
  );
}
