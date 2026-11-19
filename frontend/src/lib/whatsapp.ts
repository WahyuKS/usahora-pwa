import { Linking } from "react-native";

import { dayKey, fmtDate, rp } from "./format";
import type { Business, Invoice } from "@/src/data/types";

/** Normalise an Indonesian phone number to WhatsApp international format (08xx -> 628xx). */
export function waNumber(phone?: string | null) {
  const d = (phone ?? "").replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.startsWith("0")) return "62" + d.slice(1);
  if (d.startsWith("8")) return "62" + d;
  return d;
}

export async function openWhatsApp(phone: string | null | undefined, text: string) {
  const n = waNumber(phone);
  const url = `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
  await Linking.openURL(url);
}

export function invoiceMessage(inv: Invoice, b: Business | null, reminder: boolean) {
  const isQ = inv.doc_type === "quotation";
  const items = inv.items.map((i) => `• ${i.name} x${i.qty} = ${rp(i.qty * i.price - i.discount)}`).join("\n");
  const late = inv.due_date < dayKey();
  const head = reminder
    ? `Halo ${inv.customer_name}, kami ingin mengingatkan invoice *${inv.number}* sebesar *${rp(inv.total)}* ${late ? `telah melewati jatuh tempo (${fmtDate(inv.due_date)})` : `akan jatuh tempo pada ${fmtDate(inv.due_date)}`}.`
    : `Halo ${inv.customer_name}, berikut ${isQ ? "penawaran harga" : "invoice"} *${inv.number}* dari ${b?.name ?? "kami"}.`;
  return [
    head,
    "",
    items,
    `Total: *${rp(inv.total)}*`,
    isQ ? `Berlaku s.d. ${fmtDate(inv.due_date)}` : `Jatuh tempo: ${fmtDate(inv.due_date)}`,
    !isQ && b?.bank_info ? `\nPembayaran:\n${b.bank_info}` : "",
    "",
    `Terima kasih.\n${b?.name ?? ""}`,
  ].filter((x) => x !== undefined).join("\n").trim();
}

export function debtReminder(name: string, amount: number, b: Business | null) {
  return `Halo ${name}, kami dari ${b?.name ?? "toko kami"} ingin mengingatkan sisa tagihan belanja Anda sebesar *${rp(amount)}*.${b?.bank_info ? `\n\nPembayaran:\n${b.bank_info}` : ""}\n\nTerima kasih.`;
}

/** Reminder for one unpaid sale, mentioning the promised date. */
export function collectionMessage(name: string, saleNumber: string, amount: number, promise: string | null, b: Business | null) {
  const when = promise ? (promise < dayKey() ? `yang dijanjikan pada ${fmtDate(promise)}` : promise === dayKey() ? "yang dijanjikan hari ini" : `yang dijanjikan pada ${fmtDate(promise)}`) : "";
  return `Halo ${name}, kami dari ${b?.name ?? "toko kami"} ingin mengingatkan sisa pembayaran belanja *${saleNumber}* sebesar *${rp(amount)}*${when ? ` ${when}` : ""}.${b?.bank_info ? `\n\nPembayaran bisa ke:\n${b.bank_info}` : ""}\n\nTerima kasih.`;
}
