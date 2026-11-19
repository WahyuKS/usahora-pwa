import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, useWindowDimensions, View } from "react-native";

import { useAuth } from "@/src/auth";
import { Button, Chips, EmptyState, IconButton, Screen, SearchBar, SyncPill, T, useUI } from "@/src/components/ui";
import { BarcodeScanner, Thumb } from "@/src/components/media";
import { CheckoutSheet, ReceiptSheet } from "@/src/components/pos-sheets";
import { checkout, type CartLine } from "@/src/data/actions";
import { paidMap, stockMap } from "@/src/data/selectors";
import { useDB } from "@/src/data/store";
import type { Product, Sale } from "@/src/data/types";
import { rp } from "@/src/lib/format";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, radius, spacing, useTheme } from "@/src/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function POS() {
  const db = useDB();
  const router = useRouter();
  const { colors } = useTheme();
  const { toast } = useUI();
  const { business } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [done, setDone] = useState<Sale | null>(null);
  const [scan, setScan] = useState(false);
  const onScan = (code: string) => {
    const p = products.find((x) => (x.barcode && x.barcode === code) || (x.sku && x.sku.toLowerCase() === code.toLowerCase()));
    if (!p) return toast(`Barcode ${code} belum terdaftar di produk`, "error");
    add(p);
    toast(`${p.name} ditambahkan`);
  };

  const stock = useMemo(() => stockMap(db), [db]);
  const products: Product[] = useMemo(() => db.products.filter((p: Product) => !p.archived), [db]);
  const cats = useMemo(() => [{ key: "all", label: "Semua" }, ...[...new Set(products.map((p) => p.category || "Umum"))].sort().map((c) => ({ key: c, label: c }))], [products]);
  const list = products.filter((p) => (cat === "all" || p.category === cat) && (`${p.name} ${p.sku} ${p.barcode}`.toLowerCase().includes(q.toLowerCase())));
  const cols = width >= 1000 ? 5 : width >= 700 ? 4 : 2;
  const qtyOf = (id: string) => cart.find((l) => l.product.id === id)?.qty ?? 0;
  const count = cart.reduce((a, l) => a + l.qty, 0);
  const total = cart.reduce((a, l) => a + l.qty * l.product.sell_price - l.discount, 0);

  const add = (p: Product) => {
    const cur = qtyOf(p.id);
    if (cur + 1 > (stock[p.id] ?? 0)) return toast(`Stok ${p.name} tidak cukup`, "error");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setCart((c) => (cur ? c.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l)) : [...c, { product: p, qty: 1, discount: 0 }]));
  };

  const onPay = (o: { discount: number; method: any; received: number; customer_id: string | null; note: string }) => {
    try {
      const sale = checkout({ lines: cart, ...o });
      setCart([]);
      setCheckoutOpen(false);
      setDone(sale);
      toast(`Transaksi ${sale.number} tersimpan`);
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  return (
    <Screen tab back={false} title="Jual" subtitle={`Catat penjualan · ${products.length} produk aktif`} scroll={false} right={<><IconButton icon="scan-barcode" bg={colors.brandTertiary} color={colors.brandPrimary} onPress={() => setScan(true)} testID="pos-scan-button" label="Scan barcode" /><SyncPill /></>} testID="pos-screen"
      headerExtra={
        <View style={{ marginHorizontal: -spacing.sm }}>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}>
            <SearchBar value={q} onChangeText={setQ} placeholder="Cari nama, SKU, atau barcode" testID="pos-search-input" />
          </View>
          <Chips options={cats} value={cat} onChange={setCat} testIDPrefix="pos-category" />
        </View>
      }>
      {products.length === 0 ? (
        <EmptyState icon="package" title="Belum ada produk" message="Tambahkan produk terlebih dahulu agar bisa dijual di kasir." action="Tambah produk" onAction={() => router.push("/product-form")} testID="pos-empty" />
      ) : (
        <FlatList
          key={cols}
          data={list}
          numColumns={cols}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl, maxWidth: 1040, width: "100%", alignSelf: "center" }}
          columnWrapperStyle={{ gap: spacing.sm }}
          ListEmptyComponent={<T v="caption" align="center" style={{ marginTop: spacing.xl }}>Produk tidak ditemukan.</T>}
          renderItem={({ item: p, index }) => {
            const st = stock[p.id] ?? 0;
            const inCart = qtyOf(p.id);
            const out = st <= 0;
            return (
              <Pressable testID={`pos-product-${index}`} onPress={() => add(p)} disabled={out}
                style={({ pressed }) => [{ flex: 1 / cols, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: inCart ? colors.brandPrimary : colors.border, padding: spacing.md, minHeight: 116, opacity: out ? 0.5 : 1 }, pressed && { transform: [{ scale: 0.97 }] }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Thumb fileId={p.photo_file_id} label={p.name} size={p.photo_file_id ? 56 : 36} />
                  {inCart ? <View style={{ minWidth: 26, height: 26, borderRadius: 13, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}><T v="caption" weight="bold" color={colors.onBrandPrimary}>{inCart}</T></View> : null}
                </View>
                <T v="label" numberOfLines={2} style={{ marginTop: spacing.sm }}>{p.name}</T>
                <T v="label" weight="bold" color={colors.brandPrimary} style={{ marginTop: 2 }}>{rp(p.sell_price)}</T>
                <T v="caption" color={out ? colors.error : st <= p.min_stock ? colors.warningText : colors.muted}>{out ? "Stok habis" : `Stok ${st} ${p.unit}`}</T>
              </Pressable>
            );
          }}
        />
      )}
      {cart.length ? (
        <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.lg, paddingBottom: bottomChrome + spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, maxWidth: 1040, width: "100%", alignSelf: "center" }}>
            <Pressable onPress={() => setCart([])} testID="pos-clear-cart" hitSlop={8} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.xs }}><T v="label" color={colors.error}>Kosongkan</T></Pressable>
            <View style={{ flex: 1 }}>
              <T v="caption">{count} item</T>
              <T v="h3" weight="bold" testID="pos-cart-total" style={{ fontFamily: fonts.bold }}>{rp(total)}</T>
            </View>
            <Button title="Bayar" icon="banknote" size="lg" onPress={() => setCheckoutOpen(true)} testID="pos-pay-button" style={{ minWidth: 150 }} />
          </View>
        </View>
      ) : null}
      <BarcodeScanner visible={scan} onClose={() => setScan(false)} onScan={onScan} title="Scan produk ke keranjang" />
      <CheckoutSheet visible={checkoutOpen} onClose={() => setCheckoutOpen(false)} cart={cart} setCart={setCart} stock={stock} customers={db.customers} onPay={onPay} />
      <ReceiptSheet sale={done} onClose={() => setDone(null)} business={business} customer={db.customers.find((c: any) => c.id === done?.customer_id)} paid={done ? paidMap(db)[done.id] ?? 0 : 0}
        onDetail={() => { const id = done!.id; setDone(null); router.push(`/sale/${id}`); }} />
    </Screen>
  );
}
