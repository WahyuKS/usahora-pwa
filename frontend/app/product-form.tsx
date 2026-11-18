import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Button, Field, Screen, useRun } from "@/src/components/ui";
import { saveProduct } from "@/src/data/actions";
import { getState } from "@/src/data/store";
import type { Product } from "@/src/data/types";
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const cost = toNum(f.cost_price), sell = toNum(f.sell_price);
  const margin = sell > 0 ? ((sell - cost) / sell) * 100 : 0;

  const submit = () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "Nama produk wajib diisi";
    if (!f.sell_price) e.sell_price = "Harga jual wajib diisi";
    if (toNum(f.min_stock) < 0) e.min_stock = "Tidak boleh negatif";
    setErrors(e);
    if (Object.keys(e).length) return;
    const ok = run(() => saveProduct({
      id: existing?.id, name: f.name, sku: f.sku, barcode: f.barcode, category: f.category.trim() || "Umum", description: f.description,
      cost_price: cost, sell_price: sell, min_stock: toNum(f.min_stock), unit: f.unit.trim() || "pcs",
    }, toNum(f.stock)), existing ? "Produk diperbarui" : "Produk ditambahkan");
    if (ok) router.back();
  };

  return (
    <Screen title={existing ? "Edit produk" : "Tambah produk"} testID="product-form-screen"
      footer={<Button title="Simpan produk" icon="check" size="lg" onPress={submit} testID="product-save-button" />}>
      <Field label="Nama produk *" value={f.name} onChangeText={set("name")} error={errors.name} placeholder="Contoh: Kopi Susu" testID="product-name-input" />
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}><Field label="SKU" value={f.sku} onChangeText={set("sku")} placeholder="Opsional" testID="product-sku-input" autoCapitalize="characters" /></View>
        <View style={{ flex: 1 }}><Field label="Barcode" value={f.barcode} onChangeText={set("barcode")} placeholder="Opsional" keyboardType="number-pad" testID="product-barcode-input" /></View>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}><Field label="Kategori" value={f.category} onChangeText={set("category")} placeholder="Umum" testID="product-category-input" /></View>
        <View style={{ flex: 1 }}><Field label="Satuan" value={f.unit} onChangeText={set("unit")} placeholder="pcs" testID="product-unit-input" /></View>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}><Field money label="Harga modal" value={f.cost_price} onChangeText={set("cost_price")} placeholder="0" testID="product-cost-input" /></View>
        <View style={{ flex: 1 }}><Field money label="Harga jual *" value={f.sell_price} onChangeText={set("sell_price")} error={errors.sell_price} placeholder="0" testID="product-price-input"
          help={sell > 0 ? `Margin ${pct(margin)}` : undefined} /></View>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        {!existing ? <View style={{ flex: 1 }}><Field label="Stok awal" value={f.stock} onChangeText={set("stock")} keyboardType="decimal-pad" placeholder="0" testID="product-stock-input" help="Dicatat sebagai pergerakan stok" /></View> : null}
        <View style={{ flex: 1 }}><Field label="Stok minimum" value={f.min_stock} onChangeText={set("min_stock")} keyboardType="decimal-pad" error={errors.min_stock} testID="product-minstock-input" help="Peringatan stok menipis" /></View>
      </View>
      <Field label="Deskripsi" value={f.description} onChangeText={set("description")} multiline placeholder="Opsional" testID="product-description-input" />
      {existing ? <Field label="Stok" editable={false} value="Ubah stok melalui Stok Masuk / Keluar / Penyesuaian" /> : null}
    </Screen>
  );
}
