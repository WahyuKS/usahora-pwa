import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Button, Field, IconButton, Screen, Segment, T, useRun } from "@/src/components/ui";
import { BarcodeScanner, PhotoPicker } from "@/src/components/media";
import { saveProduct } from "@/src/data/actions";
import { getState } from "@/src/data/store";
import type { Product, ProductKind } from "@/src/data/types";

const KINDS: { key: ProductKind; label: string }[] = [{ key: "barang", label: "Barang (pakai stok)" }, { key: "jasa", label: "Jasa / sewa" }];
const UNITS: Record<ProductKind, string[]> = { barang: ["pcs", "kg", "liter", "pak", "box", "lusin"], jasa: ["bulan", "malam", "hari", "jam", "kali", "paket"] };
import { pct, toNum } from "@/src/lib/format";
import { spacing } from "@/src/theme";

export default function ProductForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const run = useRun();
  const existing: Product | undefined = id ? getState().products.find((p: Product) => p.id === id) : undefined;
  const [f, setF] = useState({
    name: existing?.name ?? "", sku: existing?.sku ?? "", barcode: existing?.barcode ?? "", category: existing?.category ?? "",
    description: existing?.description ?? "", cost_price: existing ? String(existing.cost_price) : "", sell_price: existing ? String(existing.sell_price) : "",
    min_stock: existing ? String(existing.min_stock) : "5", unit: existing?.unit ?? "pcs", stock: "",
  });
  const [kind, setKind] = useState<ProductKind>(existing?.kind ?? "barang");
  const isJasa = kind === "jasa";
  const pickKind = (k: ProductKind) => {
    setKind(k);
    // Switch the default unit with the type, unless the owner typed their own.
    setF((p) => (UNITS.barang.includes(p.unit) || UNITS.jasa.includes(p.unit) ? { ...p, unit: UNITS[k][0] } : p));
  };
  const [photo, setPhoto] = useState<string | null>(existing?.photo_file_id ?? null);
  const [scan, setScan] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const cost = toNum(f.cost_price), sell = toNum(f.sell_price);
  const margin = sell > 0 ? ((sell - cost) / sell) * 100 : 0;

  const submit = () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "Nama produk wajib diisi";
    if (!f.sell_price) e.sell_price = "Harga jual wajib diisi";
    if (!isJasa && toNum(f.min_stock) < 0) e.min_stock = "Tidak boleh negatif";
    setErrors(e);
    if (Object.keys(e).length) return;
    const ok = run(() => saveProduct({
      id: existing?.id, name: f.name, sku: f.sku, barcode: f.barcode, category: f.category.trim() || "Umum", description: f.description,
      cost_price: cost, sell_price: sell, photo_file_id: photo, min_stock: isJasa ? 0 : toNum(f.min_stock), unit: f.unit.trim() || UNITS[kind][0], kind,
    }, isJasa ? 0 : toNum(f.stock)), existing ? "Produk diperbarui" : "Produk ditambahkan");
    if (ok) router.back();
  };

  return (
    <Screen title={existing ? (isJasa ? "Edit jasa / sewa" : "Edit produk") : isJasa ? "Tambah jasa / sewa" : "Tambah produk"} testID="product-form-screen"
      footer={<Button title="Simpan produk" icon="check" size="lg" onPress={submit} testID="product-save-button" />}>
      <PhotoPicker fileId={photo} onChange={setPhoto} label="Foto produk" testID="product-photo" />
      <T v="label" style={{ marginBottom: 6 }}>Jenis</T>
      <Segment options={KINDS} value={kind} onChange={pickKind} testIDPrefix="product-kind" />
      {isJasa ? <T v="caption" style={{ marginTop: -spacing.sm, marginBottom: spacing.lg }}>Untuk sewa kamar kost, sewa per malam, jasa per kali, langganan, dan sejenisnya. Tidak memakai stok, jadi tidak pernah habis.</T> : null}
      <Field label={isJasa ? "Nama jasa / sewa *" : "Nama produk *"} value={f.name} onChangeText={set("name")} error={errors.name} placeholder={isJasa ? "Contoh: Kamar A1 (per bulan)" : "Contoh: Kopi Susu"} testID="product-name-input" />
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}><Field label="SKU" value={f.sku} onChangeText={set("sku")} placeholder="Opsional" testID="product-sku-input" autoCapitalize="characters" /></View>
        <View style={{ flex: 1.2, flexDirection: "row", alignItems: "flex-start", gap: 4 }}><View style={{ flex: 1 }}><Field label="Barcode" value={f.barcode} onChangeText={set("barcode")} placeholder="Opsional" keyboardType="number-pad" testID="product-barcode-input" /></View><View style={{ marginTop: 26 }}><IconButton icon="scan-barcode" onPress={() => setScan(true)} testID="product-scan-barcode" label="Scan barcode" /></View></View>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}><Field label="Kategori" value={f.category} onChangeText={set("category")} placeholder="Umum" testID="product-category-input" /></View>
        <View style={{ flex: 1 }}><Field label="Satuan" value={f.unit} onChangeText={set("unit")} placeholder={UNITS[kind][0]} testID="product-unit-input" /></View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: -spacing.sm, marginBottom: spacing.lg }}>
        {UNITS[kind].map((u) => <Button key={u} size="sm" variant={f.unit === u ? "primary" : "outline"} title={u} onPress={() => set("unit")(u)} testID={`product-unit-${u}`} />)}
      </View>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}><Field money label={isJasa ? "Biaya / modal" : "Harga modal"} help={isJasa ? "Opsional, mis. listrik & kebersihan per bulan" : undefined} value={f.cost_price} onChangeText={set("cost_price")} placeholder="0" testID="product-cost-input" /></View>
        <View style={{ flex: 1 }}><Field money label="Harga jual *" value={f.sell_price} onChangeText={set("sell_price")} error={errors.sell_price} placeholder="0" testID="product-price-input"
          help={sell > 0 ? `Margin ${pct(margin)}` : undefined} /></View>
      </View>
      {isJasa ? null : <View style={{ flexDirection: "row", gap: spacing.md }}>
        {!existing ? <View style={{ flex: 1 }}><Field label="Stok awal" value={f.stock} onChangeText={set("stock")} keyboardType="decimal-pad" placeholder="0" testID="product-stock-input" help="Dicatat sebagai pergerakan stok" /></View> : null}
        <View style={{ flex: 1 }}><Field label="Stok minimum" value={f.min_stock} onChangeText={set("min_stock")} keyboardType="decimal-pad" error={errors.min_stock} testID="product-minstock-input" help="Peringatan stok menipis" /></View>
      </View>}
      <Field label="Deskripsi" value={f.description} onChangeText={set("description")} multiline placeholder="Opsional" testID="product-description-input" />
      <BarcodeScanner visible={scan} onClose={() => setScan(false)} onScan={(c) => { set("barcode")(c); setScan(false); }} title="Scan barcode produk" />
      {existing && !isJasa ? <Field label="Stok" editable={false} value="Ubah stok melalui Stok Masuk / Keluar / Penyesuaian" /> : null}
    </Screen>
  );
}
