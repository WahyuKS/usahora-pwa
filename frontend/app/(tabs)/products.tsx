import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";

import { useAuth } from "@/src/auth";
import { Thumb } from "@/src/components/media";
import { Badge, Card, Chips, Divider, EmptyState, IconButton, ListRow, Screen, SearchBar, T } from "@/src/components/ui";
import { inventoryValue, stockMap } from "@/src/data/selectors";
import { useDB } from "@/src/data/store";
import { tracksStock, type Product } from "@/src/data/types";
import { rp } from "@/src/lib/format";
import { spacing, useTheme } from "@/src/theme";

type Filter = "active" | "low" | "archived";

export default function Products() {
  const db = useDB();
  const router = useRouter();
  const { colors } = useTheme();
  const { isOwner } = useAuth();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const stock = useMemo(() => stockMap(db), [db]);
  const value = useMemo(() => inventoryValue(db), [db]);
  const all: Product[] = db.products;
  const list = all
    .filter((p) => (filter === "archived" ? p.archived : !p.archived) && (filter !== "low" || (tracksStock(p) && (stock[p.id] ?? 0) <= p.min_stock)))
    .filter((p) => `${p.name} ${p.sku} ${p.barcode} ${p.category}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const lowCount = all.filter((p) => !p.archived && tracksStock(p) && (stock[p.id] ?? 0) <= p.min_stock).length;

  return (
    <Screen tab back={false} title="Produk & Jasa" subtitle={`Nilai persediaan ${rp(value)}`} testID="products-screen"
      right={isOwner && <IconButton icon="plus" bg={colors.brandPrimary} color={colors.onBrandPrimary} onPress={() => router.push("/product-form")} testID="products-add-button" label="Tambah produk" />}
      headerExtra={
        <View style={{ marginHorizontal: -spacing.sm }}>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}>
            <SearchBar value={q} onChangeText={setQ} placeholder="Cari produk" testID="products-search-input" />
          </View>
          <Chips value={filter} onChange={setFilter} testIDPrefix="products-filter"
            options={[{ key: "active", label: "Aktif" }, { key: "low", label: `Stok menipis (${lowCount})` }, { key: "archived", label: "Arsip" }]} />
        </View>
      }>
      {all.length === 0 ? (
        <EmptyState icon="package" title="Belum ada produk" message="Belum ada produk. Tambahkan produk pertama untuk mulai mengelola stok dan penjualan." action="Tambah produk" onAction={() => router.push("/product-form")} testID="products-empty" />
      ) : list.length === 0 ? (
        <T v="caption" align="center" style={{ marginTop: spacing.xl }}>Tidak ada produk yang cocok.</T>
      ) : (
        <Card style={{ paddingVertical: spacing.xs }}>
          {list.map((p, i) => {
            const st = stock[p.id] ?? 0;
            return (
              <View key={p.id}>
                {i ? <Divider /> : null}
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}><Thumb fileId={p.photo_file_id} label={p.name} size={44} /><View style={{ flex: 1 }}><ListRow testID={`product-row-${i}`} title={p.name} subtitle={`${p.category || "Umum"}${p.sku ? ` · ${p.sku}` : ""} · ${rp(p.sell_price)}`}
                  onPress={() => router.push(`/product/${p.id}`)}
                  rightSub={!tracksStock(p) ? <Badge label={`Jasa · per ${p.unit}`} tone="brand" /> : <View style={{ alignItems: "flex-end", gap: 4 }}><T v="label" weight="semibold">{`${st} ${p.unit}`}</T>{st <= 0 ? <Badge label="Habis" tone="error" /> : st <= p.min_stock ? <Badge label="Menipis" tone="warning" /> : null}</View>} /></View></View>
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
