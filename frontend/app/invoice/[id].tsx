import { useLocalSearchParams, useRouter } from "expo-router";
import { Platform, View } from "react-native";
import { WebView } from "react-native-webview";

import { useAuth } from "@/src/auth";
import { Badge, Button, Card, EmptyState, IconButton, Screen, T, useRun, useUI } from "@/src/components/ui";
import { quotationToInvoice, setInvoiceStatus } from "@/src/data/actions";
import { useDB } from "@/src/data/store";
import type { Invoice } from "@/src/data/types";
import { invoiceHtml, invoiceStatusLabel } from "@/src/lib/docs";
import { printHtml, sharePdf } from "@/src/lib/export";
import { rp } from "@/src/lib/format";
import { radius, spacing, useTheme } from "@/src/theme";
import { statusTone } from "../invoices";
import { invoiceMessage, openWhatsApp } from "@/src/lib/whatsapp";

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDB();
  const router = useRouter();
  const { business } = useAuth();
  const { colors } = useTheme();
  const { confirm, toast } = useUI();
  const run = useRun();
  const inv: Invoice | undefined = db.invoices.find((i: Invoice) => i.id === id);
  if (!inv) return <Screen title="Dokumen"><EmptyState icon="file-text" title="Dokumen tidak ditemukan" message="Data mungkin sudah dihapus." /></Screen>;
  const h = invoiceHtml(inv, business);
  const safe = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch { toast("Gagal membuka dokumen", "error"); }
  };
  const isQ = inv.doc_type === "quotation";
  const phone = db.customers.find((c: any) => c.id === inv.customer_id)?.phone ?? null;
  const locked = inv.status === "lunas" || inv.status === "batal";

  return (
    <Screen title={inv.number} subtitle={inv.customer_name} testID="invoice-detail-screen"
      right={!locked ? <IconButton icon="pencil" onPress={() => router.push({ pathname: "/invoice-form", params: { id: inv.id } })} testID="invoice-edit-button" label="Edit" /> : undefined}
      footer={
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button title="Cetak" icon="printer" variant="outline" style={{ flex: 1 }} onPress={() => safe(() => printHtml(h))} testID="invoice-print-button" />
          <Button title="PDF / Bagikan" icon="share-2" style={{ flex: 1 }} onPress={() => safe(() => sharePdf(h, inv.number))} testID="invoice-share-button" />
        </View>
      }>
      <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <T v="caption">{isQ ? "Quotation" : "Invoice"} · Total</T>
          <T v="h2" testID="invoice-total">{rp(inv.total)}</T>
        </View>
        <Badge label={invoiceStatusLabel(inv.status, inv.doc_type)} tone={statusTone(inv) as any} testID="invoice-status-badge" />
      </Card>
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
        {inv.status === "draft" ? <Button size="sm" title="Tandai terkirim" variant="secondary" onPress={() => run(() => setInvoiceStatus(inv.id, "terkirim"), "Status diperbarui")} testID="invoice-mark-sent" /> : null}
        {!isQ && !locked ? <Button size="sm" title="Tandai lunas" icon="circle-check" onPress={async () => {
          if (await confirm({ title: "Tandai lunas?", message: `Pembayaran ${rp(inv.total)} akan dicatat sebagai pendapatan.` })) run(() => setInvoiceStatus(inv.id, "lunas"), "Invoice lunas");
        }} testID="invoice-mark-paid" /> : null}
        {isQ ? <Button size="sm" title="Jadikan invoice" icon="file-check" onPress={() => { const n = quotationToInvoice(inv.id); toast(`Invoice ${n.number} dibuat`); router.replace(`/invoice/${n.id}`); }} testID="invoice-convert-button" /> : null}
        {!locked ? <Button size="sm" title="Batalkan" variant="ghost" onPress={async () => {
          if (await confirm({ title: "Batalkan dokumen?", message: "Dokumen tetap tersimpan dengan status dibatalkan.", danger: true, confirmText: "Batalkan" })) run(() => setInvoiceStatus(inv.id, "batal"), "Dokumen dibatalkan");
        }} testID="invoice-cancel-button" /> : null}
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
        <Button title="WhatsApp" icon={"message-circle" as any} style={{ flex: 1 }} testID="invoice-whatsapp-button"
          onPress={() => safe(() => openWhatsApp(phone, invoiceMessage(inv, business, false)))} />
        {!isQ && !locked ? <Button title="Ingatkan bayar" icon="bell" variant="secondary" style={{ flex: 1 }} testID="invoice-whatsapp-reminder"
          onPress={() => safe(() => openWhatsApp(phone, invoiceMessage(inv, business, true)))} /> : null}
      </View>
      {!phone ? <T v="caption" style={{ marginTop: 4 }}>Pelanggan belum punya nomor telepon — Anda akan memilih kontak di WhatsApp.</T> : null}
      <T v="caption" style={{ marginTop: 4 }}>Untuk melampirkan PDF, gunakan tombol PDF / Bagikan lalu pilih WhatsApp.</T>
      <T v="label" style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>Pratinjau</T>
      <View style={{ height: 560, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }} testID="invoice-preview">
        {Platform.OS === "web" ? (
          <iframe srcDoc={h} style={{ border: 0, width: "100%", height: "100%" }} title="preview" />
        ) : (
          <WebView originWhitelist={["*"]} source={{ html: h }} style={{ flex: 1 }} />
        )}
      </View>
    </Screen>
  );
}
