import { useMemo, useState } from "react";
import { View } from "react-native";

import { DayHeader, groupByDay, Pagination, usePaged } from "@/src/components/pagination";
import { PeriodPicker } from "@/src/components/period-picker";
import { Card, Chips, Divider, EmptyState, ListRow, Screen, SearchBar, type IconName } from "@/src/components/ui";
import { useDB } from "@/src/data/store";
import { fmtTime, inRange, periodLabel, rangeOf, type Period } from "@/src/lib/format";
import { spacing } from "@/src/theme";

type Group = "all" | "sale" | "money" | "stock" | "report" | "other";
const GROUPS: { key: Group; label: string }[] = [
  { key: "all", label: "Semua" }, { key: "sale", label: "Penjualan" }, { key: "money", label: "Keuangan" },
  { key: "stock", label: "Produk & stok" }, { key: "report", label: "Laporan" }, { key: "other", label: "Lainnya" },
];
const GROUP_OF: Record<string, Group> = {
  sale: "sale", payment: "sale", invoice: "sale",
  finance: "money", bill: "money", purchase: "money",
  product: "stock", stock: "stock",
  report: "report",
};
const ICON: Record<Group, IconName> = { all: "activity", sale: "receipt", money: "wallet", stock: "package", report: "chart-column", other: "history" };

export default function Activities() {
  const db = useDB();
  const [period, setPeriod] = useState<Period>("7d");
  const [group, setGroup] = useState<Group>("all");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const r = rangeOf(period);
    return (db.activities as { id: string; type: string; message: string; created_at: string }[])
      .filter((a) => inRange(a.created_at, r))
      .filter((a) => group === "all" || (GROUP_OF[a.type] ?? "other") === group)
      .filter((a) => a.message.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [db.activities, period, group, q]);
  const paged = usePaged(list, 15, `${JSON.stringify(period)}|${group}|${q}`);

  return (
    <Screen title="Riwayat Aktivitas" subtitle={`${periodLabel(period)} · ${list.length} aktivitas`} testID="activities-screen"
      headerExtra={
        <View style={{ marginHorizontal: -spacing.sm }}>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}><SearchBar value={q} onChangeText={setQ} placeholder="Cari aktivitas" testID="activities-search" /></View>
          <PeriodPicker value={period} onChange={setPeriod} testIDPrefix="activities-period" />
          <Chips options={GROUPS} value={group} onChange={setGroup} testIDPrefix="activities-group" style={{ marginTop: -spacing.sm }} />
        </View>
      }>
      {list.length === 0 ? (
        <EmptyState icon="history" title="Tidak ada aktivitas" message={`Tidak ada aktivitas pada ${periodLabel(period).toLowerCase()}. Pilih tanggal atau kategori lain.`} testID="activities-empty" />
      ) : (
        <>
          {groupByDay(paged.slice, (a) => a.created_at).map((g) => (
            <View key={g.day}>
              <DayHeader label={g.label} right={`${g.items.length} aktivitas`} />
              <Card style={{ paddingVertical: spacing.xs }}>
                {g.items.map((a, i) => {
                  const grp = GROUP_OF[a.type] ?? "other";
                  return (
                    <View key={a.id}>
                      {i ? <Divider /> : null}
                      <ListRow testID={`activity-${a.id}`} icon={ICON[grp]} tone={grp === "sale" ? "success" : grp === "money" ? "warning" : "brand"} title={a.message} titleLines={3} subtitle={`Pukul ${fmtTime(a.created_at)}`} />
                    </View>
                  );
                })}
              </Card>
            </View>
          ))}
          <Pagination {...paged} onPage={paged.setPage} onSize={paged.setSize} sizes={[15, 30, 50]} unit="aktivitas" testIDPrefix="activities-page" />
        </>
      )}
    </Screen>
  );
}
