import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";

import { Badge, Card, Chips, Divider, EmptyState, ListRow, Screen, SearchBar, T } from "@/src/components/ui";
import { paidMap } from "@/src/data/selectors";
import { useDB } from "@/src/data/store";
import type { Sale } from "@/src/data/types";
import { methodLabel } from "@/src/lib/docs";
import { fmtDateTime, inRange, PERIODS, rangeOf, rp, type Period } from "@/src/lib/format";
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

  return (
    <Screen title="Riwayat Penjualan" subtitle={`${list.length} transaksi · ${rp(total)}`} testID="sales-screen"
      headerExtra={
        <View style={{ marginHorizontal: -spacing.sm }}>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}><SearchBar value={q} onChangeText={setQ} placeholder="Cari nomor atau pelanggan" testID="sales-search-input" /></View>
          <Chips options={PERIODS} value={period} onChange={setPeriod} testIDPrefix="sales-period" />
        </View>
      }>
      {list.length === 0 ? (
        <EmptyState icon="receipt" title="Belum ada transaksi" message="Penjualan dari menu Jual akan muncul di sini." action="Catat penjualan" onAction={() => router.push("/pos")} testID="sales-empty" />
      ) : (
        <Card style={{ paddingVertical: spacing.xs }}>
          {list.slice(0, 300).map((s, i) => {
            const due = Math.max(0, s.total - (paid[s.id] ?? 0));
            return (
              <View key={s.id}>
                {i ? <Divider /> : null}
                <ListRow testID={`sale-row-${i}`} icon="receipt" title={s.number} subtitle={`${fmtDateTime(s.created_at)} · ${methodLabel(s.method)}${s.customer_id ? ` · ${cust[s.customer_id] ?? ""}` : ""}`}
                  onPress={() => router.push(`/sale/${s.id}`)}
                  rightSub={<View style={{ alignItems: "flex-end", gap: 4 }}><T v="label" weight="semibold">{rp(s.total)}</T>{due ? <Badge label="Piutang" tone="warning" /> : null}</View>} />
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
