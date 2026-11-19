import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";

import { DayHeader, groupByDay, Pagination, usePaged } from "@/src/components/pagination";
import { PeriodPicker } from "@/src/components/period-picker";
import { Badge, Card, Divider, EmptyState, ListRow, Screen, SearchBar, T } from "@/src/components/ui";
import { paidMap } from "@/src/data/selectors";
import { useDB } from "@/src/data/store";
import type { Sale } from "@/src/data/types";
import { methodLabel } from "@/src/lib/docs";
import { fmtDateTime, inRange, periodLabel, rangeOf, rp, type Period } from "@/src/lib/format";
import { spacing } from "@/src/theme";

export default function Sales() {
  const db = useDB();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const paid = useMemo(() => paidMap(db), [db]);
  const cust = useMemo(() => Object.fromEntries(db.customers.map((c: any) => [c.id, c.name])), [db]);
  const r = rangeOf(period);
  const list = (db.sales as Sale[])
    .filter((s) => inRange(s.created_at, r) && `${s.number} ${cust[s.customer_id ?? ""] ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const total = list.reduce((a, s) => a + s.total, 0);
  const paged = usePaged(list, 10, `${JSON.stringify(period)}|${q}`);
  const groups = groupByDay(paged.slice, (s) => s.created_at);

  return (
    <Screen title="Riwayat Penjualan" subtitle={`${periodLabel(period)} · ${list.length} transaksi · ${rp(total)}`} testID="sales-screen"
      headerExtra={
        <View style={{ marginHorizontal: -spacing.sm }}>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}><SearchBar value={q} onChangeText={setQ} placeholder="Cari nomor atau pelanggan" testID="sales-search-input" /></View>
          <PeriodPicker value={period} onChange={setPeriod} testIDPrefix="sales-period" />
        </View>
      }>
      {list.length === 0 ? (
        <EmptyState icon="receipt" title="Tidak ada penjualan" message={`Tidak ada penjualan pada ${periodLabel(period).toLowerCase()}. Pilih tanggal lain atau catat penjualan dari menu Jual.`} action="Catat penjualan" onAction={() => router.push("/pos")} testID="sales-empty" />
      ) : (
        <>
          {groups.map((g) => (
            <View key={g.day}>
              <DayHeader label={g.label} right={rp(g.items.reduce((a, s) => a + s.total, 0))} />
              <Card style={{ paddingVertical: spacing.xs }}>
                {g.items.map((s, i) => {
                  const due = Math.max(0, s.total - (paid[s.id] ?? 0));
                  return (
                    <View key={s.id}>
                      {i ? <Divider /> : null}
                      <ListRow testID={`sale-row-${s.number}`} icon="receipt" title={s.number} subtitle={`${fmtDateTime(s.created_at).split(", ")[1]} · ${methodLabel(s.method)}${s.customer_id ? ` · ${cust[s.customer_id] ?? ""}` : ""}`}
                        onPress={() => router.push(`/sale/${s.id}`)}
                        rightSub={<View style={{ alignItems: "flex-end", gap: 4 }}><T v="label" weight="semibold">{rp(s.total)}</T>{due ? <Badge label="Piutang" tone="warning" /> : null}</View>} />
                    </View>
                  );
                })}
              </Card>
            </View>
          ))}
          <Pagination {...paged} onPage={paged.setPage} onSize={paged.setSize} sizes={[10, 20, 50]} unit="transaksi" testIDPrefix="sales-page" />
        </>
      )}
    </Screen>
  );
}
