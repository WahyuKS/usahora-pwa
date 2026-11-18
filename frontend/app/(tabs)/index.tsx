import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { useWindowDimensions, View } from "react-native";

import { useAuth } from "@/src/auth";
import { Badge, Button, Card, Chips, Divider, EmptyState, Icon, IconTile, ListRow, Screen, SectionTitle, SyncPill, T, useUI, type IconName } from "@/src/components/ui";
import { loadDemo, payBill } from "@/src/data/actions";
import { billsDue, hasDemo, lowStock, payables, receivables, salesSeries, summary, topProducts } from "@/src/data/selectors";
import { setMeta, useDB } from "@/src/data/store";
import { dayKey, fmtDate, fmtDateTime, monthLabel, PERIODS, rp, shortDay, type Period } from "@/src/lib/format";
import { radius, spacing, useTheme } from "@/src/theme";

function Kpi({ label, value, icon, tone, sub, testID, width }: { label: string; value: string; icon: IconName; tone?: "brand" | "success" | "warning" | "error" | "neutral"; sub?: string; testID: string; width: any }) {
  return (
    <Card style={{ width, padding: spacing.md }} testID={testID}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <T v="caption" numberOfLines={1} style={{ flex: 1 }}>{label}</T>
        <IconTile name={icon} tone={tone} size={28} />
      </View>
      <T v="h3" weight="bold" numberOfLines={1} style={{ marginTop: spacing.sm }} testID={`${testID}-value`}>{value}</T>
      {sub ? <T v="caption" numberOfLines={1} style={{ marginTop: 2 }}>{sub}</T> : null}
    </Card>
  );
}

function BarChart({ data, labelFor }: { data: { key: string; value: number }[]; labelFor: (k: string) => string }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = Math.ceil(data.length / 7);
  return (
    <View testID="sales-chart">
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 140, gap: 4 }}>
        {data.map((d) => (
          <View key={d.key} style={{ flex: 1, height: "100%", justifyContent: "flex-end" }}>
            <View style={{ height: `${Math.max(2, (d.value / max) * 100)}%`, backgroundColor: d.value ? colors.brandPrimary : colors.surfaceTertiary, borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 4, marginTop: 6 }}>
        {data.map((d, i) => (
          <T key={d.key} v="caption" align="center" numberOfLines={1} style={{ flex: 1, fontSize: 10 }}>{i % step === 0 ? labelFor(d.key) : ""}</T>
        ))}
      </View>
    </View>
  );
}

export default function Dashboard() {
  const db = useDB();
  const { business } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const { toast } = useUI();
  const { width } = useWindowDimensions();
  const [period, setPeriod] = useState<Period>("today");
  const cols = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const kw = `${(100 - (cols - 1) * 3) / cols}%`;

  const data = useMemo(() => {
    const s = summary(db, period);
    return {
      s, today: summary(db, "today"), month: summary(db, "month"), rec: receivables(db), pay: payables(db),
      top: topProducts(db, period), low: lowStock(db), series: salesSeries(db, period), bills: billsDue(db),
    };
  }, [db, period]);
  const isEmpty = db.products.length === 0 && db.sales.length === 0;

  return (
    <Screen tab back={false} title={business?.name ?? "USAHORA"} subtitle={`Ringkasan usaha · ${fmtDate(new Date())}`} right={<SyncPill />} testID="dashboard-screen"
      headerExtra={<Chips options={PERIODS.slice(0, 4)} value={period} onChange={setPeriod} testIDPrefix="dashboard-period" style={{ marginHorizontal: -spacing.sm }} />}>
      {isEmpty ? (
        <Card testID="onboarding-card">
          <EmptyState icon="sparkles" title="Selamat datang di USAHORA" message="Belum ada produk. Tambahkan produk pertama untuk mulai mengelola stok dan penjualan, atau coba dulu dengan data demo yang bisa dihapus kapan saja." />
          <View style={{ gap: spacing.sm }}>
            <Button title="Tambah produk pertama" icon="package-plus" onPress={() => { setMeta({ onboarded: true }); router.push("/product-form"); }} testID="onboarding-add-product" />
            <Button title="Coba dengan data demo" variant="secondary" icon="sparkles" onPress={() => { loadDemo(); toast("Data demo dimuat. Hapus kapan saja di Pengaturan."); }} testID="onboarding-load-demo" />
          </View>
        </Card>
      ) : null}
      {hasDemo(db) ? (
        <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warningSoft, marginBottom: spacing.md, padding: spacing.md }} onPress={() => router.push("/settings")} testID="demo-banner">
          <T v="label" color={colors.warningText}>Mode demo aktif — angka di bawah adalah data contoh. Ketuk untuk menghapus.</T>
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, rowGap: spacing.sm, justifyContent: "space-between" }}>
        <Kpi width={kw} testID="kpi-sales-today" label="Penjualan hari ini" value={rp(data.today.omzet)} icon="trending-up" sub={`${data.today.count} transaksi`} />
        <Kpi width={kw} testID="kpi-sales-month" label="Penjualan bulan ini" value={rp(data.month.omzet)} icon="chart-column" sub={`${data.month.count} transaksi`} />
        <Kpi width={kw} testID="kpi-net-profit" label="Estimasi laba bersih" value={rp(data.s.net)} icon="piggy-bank" tone={data.s.net >= 0 ? "success" : "error"} sub="Periode terpilih" />
        <Kpi width={kw} testID="kpi-expenses" label="Total pengeluaran" value={rp(data.s.opex)} icon="trending-down" tone="error" sub="Biaya operasional" />
        <Kpi width={kw} testID="kpi-transactions" label="Total transaksi" value={String(data.s.count)} icon="receipt" sub={`Omzet ${rp(data.s.omzet)}`} />
        <Kpi width={kw} testID="kpi-receivables" label="Piutang pelanggan" value={rp(data.rec.total)} icon="hand-coins" tone="warning" />
        <Kpi width={kw} testID="kpi-payables" label="Utang supplier" value={rp(data.pay.total)} icon="landmark" tone="neutral" />
        <Kpi width={kw} testID="kpi-low-stock" label="Stok menipis" value={`${data.low.length} produk`} icon="triangle-alert" tone={data.low.length ? "warning" : "success"} />
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
        <Button title="Transaksi" icon="shopping-cart" onPress={() => router.push("/pos")} style={{ flex: 1 }} testID="quick-new-sale" />
        <Button title="Pengeluaran" icon="wallet" variant="secondary" onPress={() => router.push({ pathname: "/finance", params: { add: "expense" } })} style={{ flex: 1 }} testID="quick-add-expense" />
      </View>

      <SectionTitle title="Grafik penjualan" />
      <Card>
        <BarChart data={data.series.buckets} labelFor={(k) => (data.series.byMonth ? monthLabel(Number(k.slice(5, 7)) - 1) : shortDay(k))} />
        <T v="caption" style={{ marginTop: spacing.sm }}>{data.series.byMonth ? "Penjualan per bulan" : "Penjualan per hari"}</T>
      </Card>

      {data.bills.length || data.low.length || db.meta.conflicts.length ? <SectionTitle title="Perlu perhatian" /> : null}
      {db.meta.conflicts.length ? (
        <Card style={{ marginBottom: spacing.sm }} onPress={() => router.push("/settings")} testID="alert-conflicts">
          <ListRow icon="triangle-alert" tone="error" title={`${db.meta.conflicts.length} konflik sinkronisasi`} subtitle="Ketuk untuk meninjau dan menyelesaikan" />
        </Card>
      ) : null}
      {data.bills.length ? (
        <Card style={{ marginBottom: spacing.sm }} testID="alert-bills">
          {data.bills.slice(0, 3).map((b, i) => (
            <View key={b.id}>
              {i ? <Divider /> : null}
              <ListRow icon="bell" tone={b.due_date < dayKey() ? "error" : "warning"} title={b.name} subtitle={`${b.due_date < dayKey() ? "Terlambat" : "Jatuh tempo"} ${fmtDate(b.due_date)} · ${rp(b.amount)}`}
                rightSub={<Button size="sm" title="Bayar" variant="secondary" onPress={() => { payBill(b.id); toast("Tagihan ditandai lunas"); }} testID={`alert-pay-bill-${i}`} />} />
            </View>
          ))}
        </Card>
      ) : null}
      {data.low.length ? (
        <Card testID="alert-low-stock">
          {data.low.slice(0, 4).map(({ p, stock }, i) => (
            <View key={p.id}>
              {i ? <Divider /> : null}
              <ListRow icon="package" tone="warning" title={p.name} subtitle={`Minimum ${p.min_stock} ${p.unit}`} right={`${stock} ${p.unit}`} onPress={() => router.push(`/product/${p.id}`)} />
            </View>
          ))}
        </Card>
      ) : null}

      <SectionTitle title="Produk terlaris" action="Laporan" onAction={() => router.push("/reports")} testID="top-products-see-all" />
      <Card testID="top-products-card">
        {data.top.length === 0 ? <T v="caption">Belum ada penjualan pada periode ini.</T> : data.top.map((t, i) => (
          <View key={t.product_id}>
            {i ? <Divider /> : null}
            <ListRow title={`${i + 1}. ${t.name}`} subtitle={`${t.qty} terjual`} right={rp(t.revenue)} />
          </View>
        ))}
      </Card>

      <SectionTitle title="Aktivitas terbaru" />
      <Card testID="activity-card">
        {db.activities.length === 0 ? <T v="caption">Belum ada aktivitas.</T> : db.activities.slice(0, 6).map((a: any, i: number) => (
          <View key={a.id} style={{ flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
            <Icon name="history" size={16} color={colors.muted} />
            <View style={{ flex: 1 }}>
              <T v="body" numberOfLines={2}>{a.message}</T>
              <T v="caption">{fmtDateTime(a.created_at)}</T>
            </View>
          </View>
        ))}
      </Card>
      {data.rec.total > 0 ? <View style={{ marginTop: spacing.md }}><Badge label="Omzet, kas masuk, piutang, dan laba dihitung terpisah" tone="neutral" /></View> : null}
    </Screen>
  );
}
