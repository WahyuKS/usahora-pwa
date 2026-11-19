import { useMemo, useState } from "react";
import { View } from "react-native";

import { PeriodPicker } from "@/src/components/period-picker";
import { logActivity } from "@/src/data/actions";
import { Button, Card, Chips, Divider, EmptyState, PickerSheet, Screen, T, useUI } from "@/src/components/ui";
import { inventoryValue, payables, receivables, stockMap, summary, topProducts } from "@/src/data/selectors";
import { useDB, type DBState } from "@/src/data/store";
import { tracksStock, type FinanceEntry, type Product, type Purchase, type Sale } from "@/src/data/types";
import { useAuth } from "@/src/auth";
import { logoImg, methodLabel } from "@/src/lib/docs";
import { exportCSV, sharePdf, tableHtml, wrapHtml, html as esc } from "@/src/lib/export";
import { dayKey, fmtDate, fmtDateTime, inRange, periodLabel, rangeOf, rp, type Period } from "@/src/lib/format";
import { spacing, useTheme } from "@/src/theme";

type RType = "sales" | "pl" | "expense" | "purchase" | "stock" | "top" | "customer" | "receivable" | "payable" | "cash";
const TYPES: { key: RType; label: string }[] = [
  { key: "sales", label: "Penjualan" }, { key: "pl", label: "Laba rugi" }, { key: "expense", label: "Pengeluaran" }, { key: "purchase", label: "Pembelian" },
  { key: "stock", label: "Stok" }, { key: "top", label: "Terlaris" }, { key: "customer", label: "Pelanggan" }, { key: "receivable", label: "Piutang" },
  { key: "payable", label: "Utang" }, { key: "cash", label: "Arus kas" },
];
type Report = { headers: string[]; rows: (string | number)[][]; right: number[]; total?: string; note?: string };

function build(db: DBState, t: RType, period: Period, cat: string, productId: string | null): Report {
  const r = rangeOf(period);
  const pm: Record<string, Product> = Object.fromEntries(db.products.map((p: Product) => [p.id, p]));
  const catOk = (pid: string) => cat === "all" || (pm[pid]?.category ?? "Umum") === cat;
  const cust = Object.fromEntries(db.customers.map((c: any) => [c.id, c.name]));
  const sup = Object.fromEntries(db.suppliers.map((c: any) => [c.id, c.name]));
  switch (t) {
    case "sales": {
      const rows: (string | number)[][] = [];
      let total = 0;
      for (const s of (db.sales as Sale[]).filter((s) => inRange(s.created_at, r)).sort((a, b) => b.created_at.localeCompare(a.created_at))) {
        const items = s.items.filter((i) => catOk(i.product_id) && (!productId || i.product_id === productId));
        if (!items.length) continue;
        const filtered = cat !== "all" || productId;
        const amount = filtered ? items.reduce((a, i) => a + i.qty * i.price - i.discount, 0) : s.total;
        total += amount;
        rows.push([fmtDateTime(s.created_at), s.number, items.map((i) => `${i.name} x${i.qty}`).join(", "), methodLabel(s.method), rp(amount)]);
      }
      return { headers: ["Tanggal", "No.", "Item", "Metode", "Jumlah"], rows, right: [4], total: `${rows.length} transaksi · ${rp(total)}`, note: cat !== "all" || productId ? "Jumlah dihitung hanya dari item yang sesuai filter (sebelum diskon transaksi)." : undefined };
    }
    case "pl": {
      const s = summary(db, period);
      return { headers: ["Pos", "Jumlah"], right: [1], rows: [["Penjualan bersih", rp(s.omzet)], ["HPP", rp(-s.cogs)], ["Laba kotor", rp(s.gross)], ["Pendapatan lain", rp(s.otherIncome)], ["Biaya operasional", rp(-s.opex)], ["Laba bersih (estimasi)", rp(s.net)]],
        note: "Laporan laba rugi sederhana berbasis transaksi (bukan pembukuan double-entry)." };
    }
    case "expense": {
      const list = (db.finance as FinanceEntry[]).filter((f) => f.type === "expense" && inRange(f.date, r)).sort((a, b) => b.date.localeCompare(a.date));
      return { headers: ["Tanggal", "Kategori", "Catatan", "Jumlah"], right: [3], rows: list.map((f) => [fmtDate(f.date), f.category, f.note, rp(f.amount)]), total: rp(list.reduce((a, f) => a + f.amount, 0)) };
    }
    case "purchase": {
      const list = (db.purchases as Purchase[]).filter((p) => inRange(p.created_at, r));
      return { headers: ["Tanggal", "No.", "Supplier", "Status", "Dibayar", "Total"], right: [4, 5], rows: list.map((p) => [fmtDate(p.created_at), p.number, sup[p.supplier_id ?? ""] ?? "-", p.status, rp(p.paid_amount), rp(p.total)]), total: rp(list.reduce((a, p) => a + p.total, 0)) };
    }
    case "stock": {
      const st = stockMap(db);
      const list = (db.products as Product[]).filter((p) => !p.archived && tracksStock(p) && catOk(p.id));
      return { headers: ["Produk", "Kategori", "Stok", "Min.", "Nilai"], right: [2, 3, 4], rows: list.map((p) => [p.name, p.category, `${st[p.id] ?? 0} ${p.unit}`, p.min_stock, rp(Math.max(0, st[p.id] ?? 0) * p.cost_price)]), total: `Nilai persediaan ${rp(inventoryValue(db))}` };
    }
    case "top": {
      const list = topProducts(db, period, 50).filter((x) => catOk(x.product_id));
      return { headers: ["Produk", "Terjual", "Omzet", "Laba kotor"], right: [1, 2, 3], rows: list.map((x) => [x.name, x.qty, rp(x.revenue), rp(x.profit)]) };
    }
    case "customer": {
      const m: Record<string, { n: number; t: number }> = {};
      for (const s of (db.sales as Sale[]).filter((s) => s.customer_id && inRange(s.created_at, r))) {
        const x = (m[s.customer_id!] ??= { n: 0, t: 0 });
        x.n += 1;
        x.t += s.total;
      }
      return { headers: ["Pelanggan", "Transaksi", "Total"], right: [1, 2], rows: Object.entries(m).sort((a, b) => b[1].t - a[1].t).map(([id, x]) => [cust[id] ?? "-", x.n, rp(x.t)]) };
    }
    case "receivable": {
      const rec = receivables(db);
      return { headers: ["Dokumen", "Pelanggan", "Tanggal", "Sisa"], right: [3], total: rp(rec.total),
        rows: [...rec.saleItems.map(({ sale, due }) => [sale.number, cust[sale.customer_id ?? ""] ?? "-", fmtDate(sale.created_at), rp(due)]), ...rec.invItems.map((i) => [i.number, i.customer_name, `Jatuh tempo ${fmtDate(i.due_date)}`, rp(i.total)])] };
    }
    case "payable": {
      const p = payables(db);
      return { headers: ["No.", "Supplier", "Tanggal", "Sisa"], right: [3], total: rp(p.total), rows: p.items.map(({ p: x, due }) => [x.number, sup[x.supplier_id ?? ""] ?? "-", fmtDate(x.created_at), rp(due)]) };
    }
    case "cash": {
      const s = summary(db, period);
      return { headers: ["Pos", "Jumlah"], right: [1], rows: [["Penerimaan penjualan", rp(s.cashIn - s.otherIncome)], ["Pendapatan lain", rp(s.otherIncome)], ["Biaya operasional", rp(-s.opex)], ["Pembayaran pembelian", rp(-s.purchasePaid)], ["Arus kas bersih", rp(s.cashFlow)]] };
    }
  }
}

export default function Reports() {
  const db = useDB();
  const { business } = useAuth();
  const { colors } = useTheme();
  const { toast } = useUI();
  const [t, setT] = useState<RType>("sales");
  const [period, setPeriod] = useState<Period>("month");
  const [cat, setCat] = useState("all");
  const [product, setProduct] = useState<Product | null>(null);
  const [pick, setPick] = useState(false);
  const rep = useMemo(() => build(db, t, period, cat, product?.id ?? null), [db, t, period, cat, product]);
  const cats = [{ key: "all", label: "Semua kategori" }, ...[...new Set(db.products.map((p: Product) => p.category || "Umum"))].map((c) => ({ key: c as string, label: c as string }))];
  const title = `Laporan ${TYPES.find((x) => x.key === t)!.label}`;
  const periodText = periodLabel(period);
  const usesCat = t === "sales" || t === "stock" || t === "top";

  const exportIt = async (kind: "csv" | "pdf") => {
    try {
      const fname = `usahora-${t}-${dayKey()}`;
      if (kind === "csv") await exportCSV(fname, rep.headers, rep.rows);
      else await sharePdf(wrapHtml(title, `${logoImg(business, 48)}<div class="brand">${esc(business?.name ?? "USAHORA")}</div><h1>${esc(title)}</h1><div class="muted">Periode: ${esc(periodText)} · dicetak ${esc(fmtDateTime(new Date()))}</div>${tableHtml(rep.headers, rep.rows, rep.right)}${rep.total ? `<h2>Total: ${esc(rep.total)}</h2>` : ""}${rep.note ? `<p class="muted">${esc(rep.note)}</p>` : ""}`), fname);
      logActivity("report", `Ekspor laporan ${title} (${periodText}) sebagai ${kind.toUpperCase()}`);
      toast(kind === "csv" ? "CSV siap (bisa dibuka di Excel)" : "PDF siap");
    } catch {
      toast("Gagal mengekspor laporan", "error");
    }
  };

  return (
    <Screen title="Laporan" subtitle={`${title} · ${periodText}`} testID="reports-screen"
      headerExtra={<View style={{ marginHorizontal: -spacing.sm }}>
        <Chips options={TYPES} value={t} onChange={setT} testIDPrefix="report-type" />
        {t !== "stock" && t !== "receivable" && t !== "payable" ? <PeriodPicker value={period} onChange={setPeriod} testIDPrefix="report-period" style={{ marginTop: -spacing.sm }} /> : null}
      </View>}>
      {usesCat ? <View style={{ marginHorizontal: -spacing.lg }}><Chips options={cats} value={cat} onChange={setCat} testIDPrefix="report-category" /></View> : null}
      {t === "sales" ? <Button size="sm" variant="outline" icon="package" title={product ? `Produk: ${product.name}` : "Filter produk"} onPress={() => (product ? setProduct(null) : setPick(true))} testID="report-product-filter" style={{ alignSelf: "flex-start", marginBottom: spacing.md }} /> : null}
      <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
        <Button title="Ekspor CSV / Excel" icon="file-spreadsheet" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => exportIt("csv")} testID="report-export-csv" />
        <Button title="Ekspor PDF" icon="download" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => exportIt("pdf")} testID="report-export-pdf" />
      </View>
      {rep.total ? <Card style={{ marginBottom: spacing.md }}><T v="caption">Total</T><T v="h2" testID="report-total">{rep.total}</T></Card> : null}
      {rep.rows.length === 0 ? <EmptyState icon="chart-column" title="Belum ada data" message="Data laporan akan muncul setelah ada transaksi pada periode ini." testID="report-empty" /> : (
        <Card style={{ paddingVertical: spacing.xs }} testID="report-table">
          {rep.rows.slice(0, 300).map((row, i) => (
            <View key={i}>
              {i ? <Divider /> : null}
              <View style={{ flexDirection: "row", paddingVertical: spacing.md, gap: spacing.md }} testID={`report-row-${i}`}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T v="label" numberOfLines={2}>{String(row[0])}</T>
                  <T v="caption" numberOfLines={2}>{row.slice(1, -1).map((c, j) => `${rep.headers[j + 1]}: ${c}`).join(" · ")}</T>
                </View>
                <T v="label" weight="semibold" color={String(row[row.length - 1]).startsWith("-") ? colors.error : undefined}>{String(row[row.length - 1])}</T>
              </View>
            </View>
          ))}
        </Card>
      )}
      {rep.note ? <T v="caption" style={{ marginTop: spacing.sm }}>{rep.note}</T> : null}
      <PickerSheet visible={pick} onClose={() => setPick(false)} title="Pilih produk" items={db.products} getLabel={(p: Product) => p.name} onPick={setProduct} testID="report-product-picker" emptyText="Belum ada produk." />
    </Screen>
  );
}
