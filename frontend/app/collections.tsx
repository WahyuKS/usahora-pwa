import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";

import { useAuth } from "@/src/auth";
import { statusLabel } from "@/src/components/collections";
import { Pagination, usePaged } from "@/src/components/pagination";
import { Button, Card, Chips, EmptyState, Screen, SearchBar, T, useUI } from "@/src/components/ui";
import { collections, type CollectionItem, type CollectionStatus } from "@/src/data/selectors";
import { useDB } from "@/src/data/store";
import type { Contact } from "@/src/data/types";
import { fmtDate, rp } from "@/src/lib/format";
import { collectionMessage, openWhatsApp } from "@/src/lib/whatsapp";
import { radius, spacing, useTheme } from "@/src/theme";

type Filter = "all" | CollectionStatus;
const LABEL: Record<Filter, string> = { all: "Semua", late: "Terlambat", today: "Hari ini", soon: "Segera (≤3 hari)", later: "Nanti", none: "Tanpa janji" };

export default function Collections() {
  const db = useDB();
  const router = useRouter();
  const { colors } = useTheme();
  const { toast } = useUI();
  const { business } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const data = useMemo(() => collections(db), [db]);
  const contacts = useMemo(() => new Map<string, Contact>(db.customers.map((c: Contact) => [c.id, c])), [db.customers]);
  const counts = useMemo(() => {
    const m: Record<Filter, number> = { all: data.items.length, late: 0, today: 0, soon: 0, later: 0, none: 0 };
    data.items.forEach((i) => m[i.status]++);
    return m;
  }, [data.items]);
  const list = data.items
    .filter((i) => filter === "all" || i.status === filter)
    .filter((i) => `${contacts.get(i.customer_id ?? "")?.name ?? ""} ${i.sale.number}`.toLowerCase().includes(q.toLowerCase()));
  const paged = usePaged(list, 5, `${filter}|${q}`);
  const tone = (i: CollectionItem) => (i.status === "late" ? colors.error : i.status === "today" ? colors.warningText : i.status === "soon" ? colors.brandPrimary : colors.muted);
  const options = (Object.keys(LABEL) as Filter[]).filter((k) => k === "all" || counts[k]).map((k) => ({ key: k, label: `${LABEL[k]} (${counts[k]})` }));
  const filteredTotal = list.reduce((a, i) => a + i.due, 0);

  return (
    <Screen title="Penagihan" subtitle={`${data.items.length} piutang · ${rp(data.total)}`} testID="collections-screen"
      headerExtra={
        <View style={{ marginHorizontal: -spacing.sm }}>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}><SearchBar value={q} onChangeText={setQ} placeholder="Cari pelanggan atau nomor transaksi" testID="collections-search" /></View>
          <Chips options={options} value={filter} onChange={setFilter} testIDPrefix="collections-filter" />
        </View>
      }>
      <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
        {[
          ["Total piutang", rp(data.total), colors.onSurface],
          ["Tagih hari ini", rp(data.urgentTotal), data.urgentTotal ? colors.error : colors.onSurface],
        ].map(([label, value, color]) => (
          <Card key={label} style={{ flex: 1, padding: spacing.md }}>
            <T v="caption">{label}</T>
            <T v="h3" weight="bold" color={color} numberOfLines={1} style={{ marginTop: 4 }}>{value}</T>
          </Card>
        ))}
      </View>

      {data.items.length === 0 ? (
        <EmptyState icon="hand-coins" title="Tidak ada piutang" message="Semua pelanggan sudah lunas. Penjualan yang dibayar sebagian atau belum dibayar akan muncul di sini." testID="collections-empty" />
      ) : list.length === 0 ? (
        <T v="caption" align="center" style={{ marginTop: spacing.xl }}>Tidak ada tagihan yang cocok.</T>
      ) : (
        <>
          {filter !== "all" || q ? <T v="caption" style={{ marginBottom: spacing.sm }}>{list.length} tagihan · {rp(filteredTotal)}</T> : null}
          {paged.slice.map((i) => {
            const c = i.customer_id ? contacts.get(i.customer_id) : undefined;
            const paid = i.sale.total - i.due;
            return (
              <Card key={i.sale.id} testID={`collection-item-${i.sale.number}`} style={{ marginBottom: spacing.sm, padding: spacing.md }}>
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <View style={{ width: 4, borderRadius: radius.pill, backgroundColor: tone(i) }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                      <T v="h3" numberOfLines={1} style={{ flex: 1 }}>{c?.name ?? "Pelanggan"}</T>
                      <T v="h3" weight="bold" color={tone(i)}>{rp(i.due)}</T>
                    </View>
                    <T v="caption" color={tone(i)} style={{ marginTop: 2 }}>{statusLabel(i)}</T>
                    <T v="caption" style={{ marginTop: 2 }}>{i.sale.number} · {fmtDate(i.sale.created_at)} · dibayar {rp(paid)} dari {rp(i.sale.total)}</T>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, marginTop: spacing.sm, overflow: "hidden" }}>
                      <View style={{ width: `${Math.max(0, Math.min(100, (paid / (i.sale.total || 1)) * 100))}%`, height: 6, backgroundColor: colors.success }} />
                    </View>
                    <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
                      {c?.phone ? <Button size="sm" variant="secondary" icon="message-circle" title="Tagih via WA" testID={`collection-page-wa-${i.sale.number}`}
                        onPress={() => openWhatsApp(c.phone, collectionMessage(c.name, i.sale.number, i.due, i.promise, business)).catch(() => toast("WhatsApp tidak bisa dibuka", "error"))} /> : null}
                      <Button size="sm" icon="hand-coins" title="Catat bayar" onPress={() => router.push(`/sale/${i.sale.id}`)} testID={`collection-page-pay-${i.sale.number}`} />
                      <Button size="sm" variant="outline" icon="calendar" title="Ubah janji" onPress={() => router.push(`/sale/${i.sale.id}`)} testID={`collection-page-promise-${i.sale.number}`} />
                    </View>
                  </View>
                </View>
              </Card>
            );
          })}
          <Pagination {...paged} onPage={paged.setPage} onSize={paged.setSize} unit="tagihan" testIDPrefix="collections-page" />
        </>
      )}
    </Screen>
  );
}
