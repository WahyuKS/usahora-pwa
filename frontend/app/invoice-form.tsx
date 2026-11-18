import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Switch, View } from "react-native";

import { useAuth } from "@/src/auth";
import { Button, Card, Field, Icon, IconButton, PickerSheet, Screen, SectionTitle, T, useRun, useUI } from "@/src/components/ui";
import { calcInvoice, saveInvoice } from "@/src/data/actions";
import { getState, useDB } from "@/src/data/store";
import type { Contact, Invoice, Product } from "@/src/data/types";
import { addDays, dayKey, isValidDate, rp, toNum } from "@/src/lib/format";
import { radius, spacing, useTheme } from "@/src/theme";

type Line = { name: string; qty: string; price: string; discount: string };

export default function InvoiceForm() {
  const { type = "invoice", id } = useLocalSearchParams<{ type?: "invoice" | "quotation"; id?: string }>();
  const db = useDB();
  const router = useRouter();
  const run = useRun();
  const { toast } = useUI();
  const { business } = useAuth();
  const { colors } = useTheme();
  const ex: Invoice | undefined = id ? getState().invoices.find((i: Invoice) => i.id === id) : undefined;
  const docType = ex?.doc_type ?? type;
  const [customerId, setCustomerId] = useState<string | null>(ex?.customer_id ?? null);
  const [customerName, setCustomerName] = useState(ex?.customer_name ?? "");
  const [lines, setLines] = useState<Line[]>(ex ? ex.items.map((i) => ({ name: i.name, qty: String(i.qty), price: String(i.price), discount: i.discount ? String(i.discount) : "" })) : [{ name: "", qty: "1", price: "", discount: "" }]);
  const [discount, setDiscount] = useState(ex?.discount ? String(ex.discount) : "");
  const [tax, setTax] = useState(ex?.tax_enabled ?? business?.tax_enabled ?? false);
  const [taxRate, setTaxRate] = useState(String(ex?.tax_rate ?? business?.tax_rate ?? 11));
  const [issue, setIssue] = useState(ex?.issue_date ?? dayKey());
  const [due, setDue] = useState(ex?.due_date ?? addDays(dayKey(), 14));
  const [notes, setNotes] = useState(ex?.notes ?? "");
  const [pickC, setPickC] = useState(false);
  const [pickP, setPickP] = useState(false);
  const items = lines.map((l) => ({ name: l.name, qty: toNum(l.qty), price: toNum(l.price), discount: toNum(l.discount) }));
  const t = calcInvoice(items, toNum(discount), tax, toNum(taxRate));
  const upd = (i: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const submit = () => {
    if (!isValidDate(issue) || !isValidDate(due)) return toast("Format tanggal harus YYYY-MM-DD", "error");
    if (due < issue) return toast("Jatuh tempo tidak boleh sebelum tanggal terbit", "error");
    let saved: Invoice | null = null;
    const ok = run(() => {
      saved = saveInvoice({ id: ex?.id, number: ex?.number, doc_type: docType, customer_id: customerId, customer_name: customerName, items: items.filter((i) => i.name.trim() || i.price), discount: toNum(discount), tax_enabled: tax, tax_rate: toNum(taxRate), issue_date: issue, due_date: due, notes });
    }, "Dokumen disimpan");
    if (ok && saved) router.replace(`/invoice/${(saved as Invoice).id}`);
  };

  return (
    <Screen title={`${ex ? "Edit" : "Buat"} ${docType === "quotation" ? "quotation" : "invoice"}`} subtitle={ex?.number} testID="invoice-form-screen"
      footer={<View><View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm }}><T v="label" color={colors.muted}>Total</T><T v="h3" testID="invoice-form-total">{rp(t.total)}</T></View>
        <Button title="Simpan & pratinjau" icon="eye" size="lg" onPress={submit} testID="invoice-save-button" /></View>}>
      <Field label="Nama pelanggan *" value={customerName} onChangeText={(v) => { setCustomerName(v); setCustomerId(null); }} placeholder="Ketik nama atau pilih" testID="invoice-customer-input" />
      <Button title="Pilih dari daftar pelanggan" size="sm" variant="ghost" icon="users" onPress={() => setPickC(true)} testID="invoice-pick-customer" style={{ alignSelf: "flex-start", marginTop: -spacing.md, marginBottom: spacing.md }} />
      <SectionTitle title="Item" />
      {lines.map((l, i) => (
        <Card key={i} style={{ marginBottom: spacing.sm, padding: spacing.md }} testID={`invoice-line-${i}`}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.xs }}>
            <View style={{ flex: 1 }}><Field label="Deskripsi" value={l.name} onChangeText={(v) => upd(i, "name", v)} placeholder="Nama barang/jasa" testID={`invoice-line-${i}-name`} /></View>
            {lines.length > 1 ? <View style={{ marginTop: 26 }}><IconButton icon={"trash-2" as any} color={colors.error} onPress={() => setLines((ls) => ls.filter((_, j) => j !== i))} testID={`invoice-line-${i}-remove`} /></View> : null}
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 0.7 }}><Field label="Qty" value={l.qty} onChangeText={(v) => upd(i, "qty", v)} keyboardType="decimal-pad" testID={`invoice-line-${i}-qty`} /></View>
            <View style={{ flex: 1.3 }}><Field money label="Harga" value={l.price} onChangeText={(v) => upd(i, "price", v)} testID={`invoice-line-${i}-price`} /></View>
            <View style={{ flex: 1.1 }}><Field money label="Diskon" value={l.discount} onChangeText={(v) => upd(i, "discount", v)} testID={`invoice-line-${i}-discount`} /></View>
          </View>
        </Card>
      ))}
      <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg }}>
        <Button title="Item baru" icon="plus" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => setLines((ls) => [...ls, { name: "", qty: "1", price: "", discount: "" }])} testID="invoice-add-line" />
        <Button title="Dari produk" icon="package" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => setPickP(true)} testID="invoice-add-product" />
      </View>
      <Field money label="Diskon total" value={discount} onChangeText={setDiscount} placeholder="0" testID="invoice-discount-input" />
      <Pressable onPress={() => setTax(!tax)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48, marginBottom: spacing.md }}>
        <T v="label">Kenakan pajak (PPN)</T>
        <Switch value={tax} onValueChange={setTax} testID="invoice-tax-switch" trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }} />
      </Pressable>
      {tax ? <Field label="Tarif pajak (%)" value={taxRate} onChangeText={setTaxRate} keyboardType="decimal-pad" testID="invoice-taxrate-input" /> : null}
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}><Field label="Tanggal terbit" value={issue} onChangeText={setIssue} placeholder="YYYY-MM-DD" testID="invoice-issue-input" /></View>
        <View style={{ flex: 1 }}><Field label={docType === "quotation" ? "Berlaku s.d." : "Jatuh tempo"} value={due} onChangeText={setDue} placeholder="YYYY-MM-DD" testID="invoice-due-input" /></View>
      </View>
      <Field label="Catatan" value={notes} onChangeText={setNotes} multiline placeholder="Contoh: pembayaran via transfer" testID="invoice-notes-input" />
      <Card style={{ backgroundColor: colors.surfaceTertiary, borderColor: colors.surfaceTertiary }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T v="body">Subtotal</T><T v="label">{rp(t.subtotal)}</T></View>
        {tax ? <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}><T v="body">Pajak</T><T v="label">{rp(t.tax)}</T></View> : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm }}><Icon name={"info" as any} size={14} color={colors.muted} /><T v="caption">Data usaha diambil dari Pengaturan.</T></View>
      </Card>
      <View style={{ height: radius.md }} />
      <PickerSheet visible={pickC} onClose={() => setPickC(false)} title="Pilih pelanggan" items={db.customers.filter((c: Contact) => !c.archived)} getLabel={(c: Contact) => c.name} getSub={(c: Contact) => c.phone}
        onPick={(c: Contact) => { setCustomerId(c.id); setCustomerName(c.name); }} testID="invoice-customer-picker" emptyText="Belum ada pelanggan." />
      <PickerSheet visible={pickP} onClose={() => setPickP(false)} title="Pilih produk" items={db.products.filter((p: Product) => !p.archived)} getLabel={(p: Product) => p.name} getSub={(p: Product) => rp(p.sell_price)}
        onPick={(p: Product) => setLines((ls) => [...ls.filter((l) => l.name || l.price), { name: p.name, qty: "1", price: String(p.sell_price), discount: "" }])} testID="invoice-product-picker" emptyText="Belum ada produk." />
    </Screen>
  );
}
