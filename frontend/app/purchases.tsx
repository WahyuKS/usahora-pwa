import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";

import { Badge, Card, Chips, Divider, EmptyState, IconButton, ListRow, Screen, T } from "@/src/components/ui";
import { useDB } from "@/src/data/store";
import type { Purchase } from "@/src/data/types";
import { fmtDate, rp } from "@/src/lib/format";
import { spacing, useTheme } from "@/src/theme";

type F = "all" | "dipesan" | "unpaid";

export default function Purchases() {
  const db = useDB();
  const router = useRouter();
  const { colors } = useTheme();
  const [f, setF] = useState<F>("all");
  const sup = useMemo(() => Object.fromEntries(db.suppliers.map((s: any) => [s.id, s.name])), [db]);
  const list = (db.purchases as Purchase[])
    .filter((p) => f === "all" || (f === "dipesan" ? p.status === "dipesan" : p.paid_amount < p.total))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const debt = (db.purchases as Purchase[]).reduce((a, p) => a + Math.max(0, p.total - p.paid_amount), 0);

  return (
    <Screen title="Pembelian" subtitle={`Utang supplier ${rp(debt)}`} testID="purchases-screen"
      right={<IconButton icon="plus" bg={colors.brandPrimary} color={colors.onBrandPrimary} onPress={() => router.push("/purchase-form")} testID="purchases-add-button" label="Tambah pembelian" />}
      headerExtra={<Chips value={f} onChange={setF} testIDPrefix="purchases-filter" style={{ marginHorizontal: -spacing.sm }} options={[{ key: "all", label: "Semua" }, { key: "dipesan", label: "Belum diterima" }, { key: "unpaid", label: "Belum lunas" }]} />}>
      {db.purchases.length === 0 ? (
        <EmptyState icon="truck" title="Belum ada pembelian" message="Catat pembelian barang dari supplier. Saat diterima, stok otomatis bertambah dan tercatat." action="Catat pembelian" onAction={() => router.push("/purchase-form")} testID="purchases-empty" />
      ) : list.length === 0 ? <T v="caption" align="center">Tidak ada data.</T> : (
        <Card style={{ paddingVertical: spacing.xs }}>
          {list.map((p, i) => {
            const due = p.total - p.paid_amount;
            return (
              <View key={p.id}>
                {i ? <Divider /> : null}
                <ListRow testID={`purchase-row-${i}`} icon="truck" title={p.number} subtitle={`${fmtDate(p.created_at)} · ${sup[p.supplier_id ?? ""] ?? "Tanpa supplier"}`} onPress={() => router.push(`/purchase/${p.id}`)}
                  rightSub={<View style={{ alignItems: "flex-end", gap: 4 }}><T v="label" weight="semibold">{rp(p.total)}</T>
                    <View style={{ flexDirection: "row", gap: 4 }}><Badge label={p.status === "diterima" ? "Diterima" : "Dipesan"} tone={p.status === "diterima" ? "success" : "brand"} />{due > 0 ? <Badge label="Belum lunas" tone="warning" /> : null}</View></View>} />
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
