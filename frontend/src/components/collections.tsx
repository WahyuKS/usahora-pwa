import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { useAuth } from "@/src/auth";
import { Button, Card, T, useUI } from "@/src/components/ui";
import { collections, type CollectionItem } from "@/src/data/selectors";
import { setMeta, useDB } from "@/src/data/store";
import type { Contact } from "@/src/data/types";
import { dayKey, fmtDate, rp } from "@/src/lib/format";
import { notifyPermission, requestNotifyPermission, showNotification } from "@/src/lib/notify";
import { collectionMessage, openWhatsApp } from "@/src/lib/whatsapp";
import { radius, spacing, useTheme } from "@/src/theme";

export function statusLabel(i: CollectionItem) {
  if (i.status === "late") return `Terlambat ${i.daysLate} hari`;
  if (i.status === "today") return "Janji bayar hari ini";
  if (i.status === "none") return "Belum ada janji bayar";
  const days = Math.round((Date.parse(`${i.promise}T00:00:00Z`) - Date.parse(`${dayKey()}T00:00:00Z`)) / 86_400_000);
  return `Janji bayar ${days === 1 ? "besok" : `${days} hari lagi`} · ${fmtDate(i.promise!)}`;
}

/**
 * Dashboard card: unpaid sales to collect, most urgent first, with a WhatsApp reminder.
 * When the app is opened on a day with late or due-today payments, a device notification is shown
 * once per day (if the owner allowed notifications).
 */
export function CollectionsCard() {
  const db = useDB();
  const router = useRouter();
  const { colors } = useTheme();
  const { toast } = useUI();
  const { business, isOwner } = useAuth();
  const [perm, setPerm] = useState(notifyPermission());
  const data = useMemo(() => collections(db), [db]);
  const contacts = useMemo(() => new Map<string, Contact>(db.customers.map((c: Contact) => [c.id, c])), [db.customers]);

  useEffect(() => {
    if (!isOwner || !data.urgent.length || perm !== "granted") return;
    const today = dayKey();
    if (db.meta.lastCollectionNotice === today) return;
    const late = data.urgent.filter((i) => i.status === "late").length;
    showNotification(
      "USAHORA · Perlu ditagih hari ini",
      `${data.urgent.length} pelanggan, total ${rp(data.urgentTotal)}${late ? ` (${late} terlambat)` : ""}. Ketuk untuk melihat.`,
      `collections-${today}`,
    ).then((shown) => shown && setMeta({ lastCollectionNotice: today }));
  }, [data.urgent, data.urgentTotal, db.meta.lastCollectionNotice, isOwner, perm]);

  if (!isOwner || !data.items.length) return null;
  const top = data.items.slice(0, 4);
  const tone = (i: CollectionItem) => (i.status === "late" ? colors.error : i.status === "today" ? colors.warningText : colors.muted);

  return (
    <Card testID="collections-card" style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <T v="h3">Perlu ditagih</T>
          <T v="caption">{data.urgent.length ? `${data.urgent.length} harus ditagih hari ini · ${rp(data.urgentTotal)}` : `${data.items.length} piutang berjalan`}</T>
        </View>
        <T v="h3" color={data.urgent.length ? colors.error : colors.onSurface} testID="collections-total">{rp(data.total)}</T>
      </View>
      {top.map((i) => {
        const c = i.customer_id ? contacts.get(i.customer_id) : undefined;
        return (
          <View key={i.sale.id} testID={`collection-${i.sale.id}`} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
            <View style={{ width: 4, alignSelf: "stretch", borderRadius: radius.pill, backgroundColor: tone(i) }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T v="label" numberOfLines={1}>{c?.name ?? "Pelanggan"} · {rp(i.due)}</T>
              <T v="caption" color={tone(i)} numberOfLines={1}>{statusLabel(i)}</T>
            </View>
            {c?.phone ? (
              <Button size="sm" variant="secondary" title="Tagih" icon="message-circle" testID={`collection-wa-${i.sale.id}`}
                onPress={() => openWhatsApp(c.phone, collectionMessage(c.name, i.sale.number, i.due, i.promise, business)).catch(() => toast("WhatsApp tidak bisa dibuka", "error"))} />
            ) : null}
            <Button size="sm" variant="outline" title="Bayar" onPress={() => router.push(`/sale/${i.sale.id}`)} testID={`collection-open-${i.sale.id}`} />
          </View>
        );
      })}
      <Button size="sm" variant="ghost" icon="arrow-right" title={data.items.length > top.length ? `Lihat semua tagihan (${data.items.length})` : "Buka halaman penagihan"} style={{ marginTop: spacing.sm }} onPress={() => router.push("/collections")} testID="collections-see-all" />
      {perm === "default" ? (
        <Button size="sm" variant="ghost" icon="bell" title="Aktifkan notifikasi tagihan" style={{ marginTop: spacing.sm }} testID="collections-enable-notify"
          onPress={async () => {
            const ok = await requestNotifyPermission();
            setPerm(notifyPermission());
            toast(ok ? "Notifikasi aktif. Pengingat muncul saat USAHORA dibuka di hari jatuh tempo." : "Notifikasi tidak diizinkan oleh browser", ok ? "success" : "info");
          }} />
      ) : null}
    </Card>
  );
}
