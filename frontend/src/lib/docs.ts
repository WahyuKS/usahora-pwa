import { fmtDate, fmtDateTime, rp } from "./format";
import { html as esc, tableHtml, wrapHtml } from "./export";
import type { Business, Contact, Invoice, Sale } from "@/src/data/types";

const METHOD: Record<string, string> = { tunai: "Tunai", transfer: "Transfer", qris: "QRIS", lainnya: "Lainnya" };
export const methodLabel = (m: string) => METHOD[m] ?? m;

const head = (b: Business | null) => `
  <div class="row"><div><div class="brand">${esc(b?.name ?? "USAHORA")}</div>
  <div class="muted">${esc(b?.address ?? "")}</div><div class="muted">${esc([b?.phone, b?.email].filter(Boolean).join(" · "))}</div></div>`;

export function receiptHtml(sale: Sale, b: Business | null, customer: Contact | undefined, paid: number) {
  const rows = sale.items.map((i) => [i.name, `${i.qty} x ${rp(i.price)}`, i.discount ? `-${rp(i.discount)}` : "", rp(i.qty * i.price - i.discount)]);
  return wrapHtml(sale.number, `
    ${head(b)}<div style="text-align:right"><h1>Struk</h1><div class="muted">${esc(sale.number)}</div><div class="muted">${esc(fmtDateTime(sale.created_at))}</div></div></div>
    ${customer ? `<h2>Pelanggan</h2><div>${esc(customer.name)}</div>` : ""}
    ${tableHtml(["Item", "Qty x Harga", "Diskon", "Jumlah"], rows, [1, 2, 3])}
    <table><tbody>
      <tr><td>Subtotal</td><td class="r">${rp(sale.subtotal)}</td></tr>
      ${sale.discount ? `<tr><td>Diskon transaksi</td><td class="r">-${rp(sale.discount)}</td></tr>` : ""}
      <tr class="tot"><td>Total</td><td class="r">${rp(sale.total)}</td></tr>
      <tr><td>Metode</td><td class="r">${esc(methodLabel(sale.method))}</td></tr>
      <tr><td>Diterima</td><td class="r">${rp(sale.received)}</td></tr>
      <tr><td>Kembalian</td><td class="r">${rp(sale.change)}</td></tr>
      ${paid < sale.total ? `<tr><td>Sisa piutang</td><td class="r">${rp(sale.total - paid)}</td></tr>` : ""}
    </tbody></table>
    <p class="muted" style="margin-top:24px;text-align:center">${esc(b?.invoice_footer ?? "Terima kasih")}</p>`);
}

const STATUS: Record<string, string> = { draft: "Draft", terkirim: "Belum dibayar", lunas: "Lunas", batal: "Dibatalkan" };
export const invoiceStatusLabel = (s: string, docType: string) => (docType === "quotation" && s === "terkirim" ? "Terkirim" : STATUS[s] ?? s);

export function invoiceHtml(inv: Invoice, b: Business | null) {
  const isQ = inv.doc_type === "quotation";
  const rows = inv.items.map((i, idx) => [idx + 1, i.name, i.qty, rp(i.price), i.discount ? `-${rp(i.discount)}` : "-", rp(i.qty * i.price - i.discount)]);
  return wrapHtml(inv.number, `
    ${head(b)}<div style="text-align:right"><h1>${isQ ? "QUOTATION" : "INVOICE"}</h1><div class="muted">${esc(inv.number)}</div>
    <div style="margin-top:6px"><span class="pill">${esc(invoiceStatusLabel(inv.status, inv.doc_type))}</span></div></div></div>
    <div class="row" style="margin-top:24px"><div><h2>Kepada</h2><div><b>${esc(inv.customer_name)}</b></div></div>
    <div style="text-align:right"><h2>Tanggal</h2><div>Terbit: ${esc(fmtDate(inv.issue_date))}</div><div>${isQ ? "Berlaku s.d." : "Jatuh tempo"}: ${esc(fmtDate(inv.due_date))}</div></div></div>
    ${tableHtml(["#", "Deskripsi", "Qty", "Harga", "Diskon", "Jumlah"], rows, [2, 3, 4, 5])}
    <table style="width:50%;margin-left:50%"><tbody>
      <tr><td>Subtotal</td><td class="r">${rp(inv.subtotal)}</td></tr>
      ${inv.discount ? `<tr><td>Diskon</td><td class="r">-${rp(inv.discount)}</td></tr>` : ""}
      ${inv.tax_enabled ? `<tr><td>Pajak (${inv.tax_rate}%)</td><td class="r">${rp(inv.tax)}</td></tr>` : ""}
      <tr class="tot"><td>Total</td><td class="r">${rp(inv.total)}</td></tr>
    </tbody></table>
    ${inv.notes ? `<h2>Catatan</h2><div>${esc(inv.notes).replace(/\n/g, "<br/>")}</div>` : ""}
    ${b?.bank_info && !isQ ? `<h2>Pembayaran</h2><div>${esc(b.bank_info).replace(/\n/g, "<br/>")}</div>` : ""}
    <p class="muted" style="margin-top:32px">${esc(b?.invoice_footer ?? "")}</p>`);
}
