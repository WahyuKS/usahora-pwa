import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";

import { Badge, Button, Card, Divider, EmptyState, Field, IconButton, ListRow, Screen, SectionTitle, Segment, Sheet, T, useRun, useUI } from "@/src/components/ui";
import { adjustStock, archiveProduct, stockInOut } from "@/src/data/actions";
import { stockMap } from "@/src/data/selectors";
import { useDB } from "@/src/data/store";
import type { Product, StockMovement } from "@/src/data/types";
import { fmtDateTime, pct, rp, toNum } from "@/src/lib/format";
import { spacing, useTheme } from "@/src/theme";

const TYPE_LABEL: Record<string, string> = { awal: "Stok awal", masuk: "Stok masuk", keluar: "Stok keluar", penyesuaian: "Penyesuaian", penjualan: "Penjualan", pembelian: "Pembelian" };
type Mode = "masuk" | "keluar" | "penyesuaian";

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDB();
  const router = useRouter();
  const { colors } = useTheme();
  const { confirm } = useUI();
  const run = useRun();
  const [mode, setMode] = useState<Mode | null>(null);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const p: Product | undefined = db.products.find((x: Product) => x.id === id);
  const stock = useMemo(() => stockMap(db)[id] ?? 0, [db, id]);
  const moves: StockMovement[] = useMemo(() => db.stockMovements.filter((m: StockMovement) => m.product_id === id).sort((a: any, b: any) => b.created_at.localeCompare(a.created_at)), [db, id]);
  if (!p) return <Screen title="Produk"><EmptyState icon="package" title="Produk tidak ditemukan" message="Produk mungkin sudah dihapus." /></Screen>;
  const margin = p.sell_price > 0 ? ((p.sell_price - p.cost_price) / p.sell_price) * 100 : 0;

  const submit = () => {
    const n = toNum(qty);
    const ok = run(() => (mode === "penyesuaian" ? adjustStock(p.id, n, note) : stockInOut(p.id, mode!, n, note)), "Stok diperbarui");
    if (ok) {
      setMode(null);
      setQty("");
      setNote("");
    }
  };

  return (
    <Screen title={p.name} subtitle={p.category} testID="product-detail-screen"
      right={<IconButton icon="pencil" onPress={() => router.push({ pathname: "/product-form", params: { id: p.id } })} testID="product-edit-button" label="Edit" />}>
      {p.archived ? <View style={{ marginBottom: spacing.md }}><Badge label="Diarsipkan — tidak tampil di kasir" tone="neutral" /></View> : null}
      <Card>
        <T v="caption">Stok saat ini</T>
        <T v="display" testID="product-stock-value" color={stock <= p.min_stock ? colors.warningText : colors.onSurface}>{stock} <T v="h3" color={colors.muted}>{p.unit}</T></T>
        <T v="caption">Minimum {p.min_stock} {p.unit} · Nilai {rp(Math.max(0, stock) * p.cost_price)}</T>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
          <Button title="Masuk" variant="secondary" style={{ flex: 1 }} onPress={() => setMode("masuk")} testID="stock-in-button" />
          <Button title="Keluar" variant="secondary" style={{ flex: 1 }} onPress={() => setMode("keluar")} testID="stock-out-button" />
          <Button title="Opname" variant="secondary" style={{ flex: 1 }} onPress={() => setMode("penyesuaian")} testID="stock-adjust-button" />
        </View>
      </Card>
      <Card style={{ marginTop: spacing.md }}>
        <ListRow title="Harga jual" right={rp(p.sell_price)} />
        <Divider />
        <ListRow title="Harga modal" right={rp(p.cost_price)} />
        <Divider />
        <ListRow title="Margin" right={pct(margin)} />
        {p.sku ? <><Divider /><ListRow title="SKU" right={p.sku} /></> : null}
        {p.barcode ? <><Divider /><ListRow title="Barcode" right={p.barcode} /></> : null}
        {p.description ? <><Divider /><T v="body" style={{ paddingVertical: spacing.md }}>{p.description}</T></> : null}
      </Card>

      <SectionTitle title="Riwayat pergerakan stok" />
      <Card style={{ paddingVertical: spacing.xs }} testID="stock-movements-list">
        {moves.length === 0 ? <T v="caption" style={{ paddingVertical: spacing.md }}>Belum ada pergerakan stok.</T> : moves.slice(0, 100).map((m, i) => (
          <View key={m.id}>
            {i ? <Divider /> : null}
            <ListRow title={TYPE_LABEL[m.type] ?? m.type} subtitle={`${fmtDateTime(m.created_at)}${m.note ? ` · ${m.note}` : ""}`}
              rightSub={<T v="label" weight="bold" color={m.qty > 0 ? colors.success : colors.error}>{m.qty > 0 ? `+${m.qty}` : m.qty}</T>} />
          </View>
        ))}
      </Card>

      <Button title={p.archived ? "Aktifkan kembali" : "Arsipkan produk"} variant="ghost" icon="archive" style={{ marginTop: spacing.xl }} testID="product-archive-button"
        onPress={async () => {
          if (!p.archived && !(await confirm({ title: "Arsipkan produk?", message: "Produk tidak akan tampil di kasir. Riwayat transaksi dan stok tetap tersimpan.", confirmText: "Arsipkan", danger: true }))) return;
          run(() => archiveProduct(p.id, !p.archived), p.archived ? "Produk diaktifkan" : "Produk diarsipkan");
        }} />

      <Sheet visible={!!mode} onClose={() => setMode(null)} title={mode === "penyesuaian" ? "Penyesuaian stok (opname)" : mode === "masuk" ? "Stok masuk" : "Stok keluar"} testID="stock-sheet"
        footer={<Button title="Simpan" icon="check" onPress={submit} testID="stock-save-button" />}>
        {mode ? <Segment options={[{ key: "masuk", label: "Masuk" }, { key: "keluar", label: "Keluar" }, { key: "penyesuaian", label: "Opname" }] as { key: Mode; label: string }[]} value={mode} onChange={setMode} testIDPrefix="stock-mode" /> : null}
        <T v="caption" style={{ marginBottom: spacing.md }}>Stok sistem saat ini: {stock} {p.unit}</T>
        <Field label={mode === "penyesuaian" ? "Stok aktual hasil hitung" : "Jumlah"} value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder="0" testID="stock-qty-input" />
        <Field label="Keterangan" value={note} onChangeText={setNote} placeholder={mode === "keluar" ? "Contoh: rusak, hilang" : "Opsional"} testID="stock-note-input" />
      </Sheet>
    </Screen>
  );
}
