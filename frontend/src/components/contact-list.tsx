import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";

import { Card, Chips, Divider, EmptyState, IconButton, ListRow, Screen, SearchBar, T } from "@/src/components/ui";
import { paidMap } from "@/src/data/selectors";
import { useDB } from "@/src/data/store";
import type { Contact, Sale } from "@/src/data/types";
import { rp } from "@/src/lib/format";
import { spacing, useTheme } from "@/src/theme";

export function ContactList({ entity }: { entity: "customers" | "suppliers" }) {
  const db = useDB();
  const router = useRouter();
  const { colors } = useTheme();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "debt">("all");
  const isCust = entity === "customers";
  const stats = useMemo(() => {
    const m: Record<string, { total: number; due: number; count: number }> = {};
    if (isCust) {
      const paid = paidMap(db);
      for (const s of db.sales as Sale[]) {
        if (!s.customer_id) continue;
        const r = (m[s.customer_id] ??= { total: 0, due: 0, count: 0 });
        r.total += s.total;
        r.count += 1;
        r.due += Math.max(0, s.total - (paid[s.id] ?? 0));
      }
      for (const i of db.invoices) if (i.customer_id && i.doc_type === "invoice" && (i.status === "draft" || i.status === "terkirim")) (m[i.customer_id] ??= { total: 0, due: 0, count: 0 }).due += i.total;
    } else {
      for (const p of db.purchases) {
        if (!p.supplier_id) continue;
        const r = (m[p.supplier_id] ??= { total: 0, due: 0, count: 0 });
        r.total += p.total;
        r.count += 1;
        r.due += Math.max(0, p.total - p.paid_amount);
      }
    }
    return m;
  }, [db, isCust]);
  const all: Contact[] = db[entity];
  const list = all
    .filter((c) => !c.archived && `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q.toLowerCase()))
    .filter((c) => filter === "all" || (stats[c.id]?.due ?? 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  const label = isCust ? "pelanggan" : "supplier";

  return (
    <Screen title={isCust ? "Pelanggan" : "Supplier"} subtitle={`${all.filter((c) => !c.archived).length} ${label}`} testID={`${entity}-screen`}
      right={<IconButton icon="plus" bg={colors.brandPrimary} color={colors.onBrandPrimary} onPress={() => router.push({ pathname: "/contact-form", params: { entity } })} testID={`${entity}-add-button`} label={`Tambah ${label}`} />}
      headerExtra={
        <View style={{ marginHorizontal: -spacing.sm }}>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}><SearchBar value={q} onChangeText={setQ} placeholder={`Cari ${label}`} testID={`${entity}-search-input`} /></View>
          <Chips value={filter} onChange={setFilter} testIDPrefix={`${entity}-filter`} options={[{ key: "all", label: "Semua" }, { key: "debt", label: isCust ? "Punya piutang" : "Ada utang" }]} />
        </View>
      }>
      {all.length === 0 ? (
        <EmptyState icon={isCust ? "users" : "store"} title={`Belum ada ${label}`} message={isCust ? "Tambahkan pelanggan untuk mencatat riwayat belanja dan piutang." : "Tambahkan supplier untuk mencatat pembelian barang."} action={`Tambah ${label}`} onAction={() => router.push({ pathname: "/contact-form", params: { entity } })} testID={`${entity}-empty`} />
      ) : list.length === 0 ? <T v="caption" align="center">Tidak ada data yang cocok.</T> : (
        <Card style={{ paddingVertical: spacing.xs }}>
          {list.map((c, i) => {
            const s = stats[c.id];
            return (
              <View key={c.id}>
                {i ? <Divider /> : null}
                <ListRow testID={`${entity}-row-${i}`} icon={isCust ? "user" : "store"} title={c.name} subtitle={[c.phone, s ? `${s.count} transaksi · ${rp(s.total)}` : "Belum ada transaksi"].filter(Boolean).join(" · ")}
                  onPress={() => router.push(isCust ? `/customer/${c.id}` : { pathname: "/contact-form", params: { entity, id: c.id } })}
                  rightSub={s?.due ? <T v="caption" weight="semibold" color={colors.warningText}>{isCust ? "Piutang" : "Utang"} {rp(s.due)}</T> : undefined} />
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

export default function Customers() {
  return <ContactList entity="customers" />;
}
