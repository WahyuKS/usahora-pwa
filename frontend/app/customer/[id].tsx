import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { Linking, View } from "react-native";

import { Badge, Button, Card, Divider, EmptyState, IconButton, ListRow, Screen, SectionTitle, T } from "@/src/components/ui";
import { paidMap } from "@/src/data/selectors";
import { useDB } from "@/src/data/store";
import type { Contact, Invoice, Sale } from "@/src/data/types";
import { fmtDate, fmtDateTime, rp } from "@/src/lib/format";
import { useAuth } from "@/src/auth";
import { debtReminder, openWhatsApp } from "@/src/lib/whatsapp";
import { spacing, useTheme } from "@/src/theme";

export default function CustomerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDB();
  const router = useRouter();
  const { colors } = useTheme();
  const { business, isOwner } = useAuth();
  const c: Contact | undefined = db.customers.find((x: Contact) => x.id === id);
  const data = useMemo(() => {
    const paid = paidMap(db);
    const sales = (db.sales as Sale[]).filter((s) => s.customer_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((s) => ({ s, due: Math.max(0, s.total - (paid[s.id] ?? 0)) }));
    const invoices = (db.invoices as Invoice[]).filter((i) => i.customer_id === id);
    const total = sales.reduce((a, x) => a + x.s.total, 0);
    const due = sales.reduce((a, x) => a + x.due, 0) + invoices.filter((i) => i.doc_type === "invoice" && (i.status === "draft" || i.status === "terkirim")).reduce((a, i) => a + i.total, 0);
    return { sales, invoices, total, due };
  }, [db, id]);
  if (!c) return <Screen title="Pelanggan"><EmptyState icon="user" title="Pelanggan tidak ditemukan" message="Data mungkin sudah dihapus." /></Screen>;

  return (
    <Screen title={c.name} subtitle={c.phone || c.email} testID="customer-detail-screen"
      right={isOwner && <IconButton icon="pencil" onPress={() => router.push({ pathname: "/contact-form", params: { entity: "customers", id: c.id } })} testID="customer-edit-button" label="Edit" />}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Card style={{ flex: 1 }}><T v="caption">Total pembelian</T><T v="h3" testID="customer-total">{rp(data.total)}</T></Card>
        <Card style={{ flex: 1 }}><T v="caption">Piutang</T><T v="h3" color={data.due ? colors.warningText : colors.success} testID="customer-due">{rp(data.due)}</T></Card>
      </View>
      {c.phone && data.due > 0 ? <Button title="Ingatkan piutang via WhatsApp" icon={"message-circle" as any} style={{ marginTop: spacing.md }} onPress={() => openWhatsApp(c.phone, debtReminder(c.name, data.due, business)).catch(() => {})} testID="customer-whatsapp-reminder" /> : null}
      {c.phone ? <Button title="Hubungi via telepon" icon="phone" variant="outline" style={{ marginTop: spacing.md }} onPress={() => Linking.openURL(`tel:${c.phone}`)} testID="customer-call-button" /> : null}
      {c.address || c.notes || c.email ? (
        <Card style={{ marginTop: spacing.md }}>
          {c.email ? <T v="body">Email: {c.email}</T> : null}
          {c.address ? <T v="body">Alamat: {c.address}</T> : null}
          {c.notes ? <T v="caption" style={{ marginTop: 4 }}>{c.notes}</T> : null}
        </Card>
      ) : null}
      <SectionTitle title="Riwayat transaksi" />
      <Card style={{ paddingVertical: spacing.xs }}>
        {data.sales.length === 0 ? <T v="caption" style={{ paddingVertical: spacing.md }}>Belum ada transaksi kasir.</T> : data.sales.map(({ s, due }, i) => (
          <View key={s.id}>
            {i ? <Divider /> : null}
            <ListRow title={s.number} subtitle={fmtDateTime(s.created_at)} onPress={() => router.push(`/sale/${s.id}`)} testID={`customer-sale-${i}`}
              rightSub={<View style={{ alignItems: "flex-end", gap: 4 }}><T v="label" weight="semibold">{rp(s.total)}</T><Badge label={due ? `Sisa ${rp(due)}` : "Lunas"} tone={due ? "warning" : "success"} /></View>} />
          </View>
        ))}
      </Card>
      {data.invoices.length ? (
        <>
          <SectionTitle title="Invoice & quotation" />
          <Card style={{ paddingVertical: spacing.xs }}>
            {data.invoices.map((inv, i) => (
              <View key={inv.id}>
                {i ? <Divider /> : null}
                <ListRow title={inv.number} subtitle={`Jatuh tempo ${fmtDate(inv.due_date)}`} right={rp(inv.total)} onPress={() => router.push(`/invoice/${inv.id}`)} />
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
