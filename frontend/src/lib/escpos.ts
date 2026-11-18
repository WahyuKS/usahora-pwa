// ESC/POS receipt for 58 mm (32 characters) or 80 mm (48 characters) thermal printers.
// Plain bytes, no dependency. Text is reduced to printable ASCII so every cheap printer shows it.
import type { Business, Contact, Sale } from "@/src/data/types";

import { methodLabel } from "./docs";
import { fmtDateTime } from "./format";

const ESC = 0x1b, GS = 0x1d, LF = 0x0a;

/** Printer-safe text: Indonesian text is ASCII already; accents and symbols are simplified. */
export function asciiOnly(s: string) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7e]/g, "?");
}

/** Rupiah without the "Rp" spacing issues of Intl on some engines: 1500000 -> "Rp1.500.000". */
export const rpPlain = (n: number) => `${n < 0 ? "-" : ""}Rp${Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

/** Left text and right text on one line; the left part is wrapped/cut so the line never overflows. */
export function twoCols(left: string, right: string, width: number): string[] {
  const l = asciiOnly(left), r = asciiOnly(right);
  const room = Math.max(1, width - r.length - 1);
  const lines: string[] = [];
  let rest = l;
  while (rest.length > room) {
    lines.push(rest.slice(0, width));
    rest = rest.slice(width);
  }
  lines.push(rest.padEnd(width - r.length, " ") + r);
  return lines;
}

export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of asciiOnly(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if ((line + " " + word).length <= width) line += " " + word;
      else {
        out.push(line);
        line = word;
      }
      while (line.length > width) {
        out.push(line.slice(0, width));
        line = line.slice(width);
      }
    }
    out.push(line);
  }
  return out;
}

class Bytes {
  private b: number[] = [];
  raw(...x: number[]) { this.b.push(...x); return this; }
  text(s: string) { for (const ch of asciiOnly(s)) this.b.push(ch.charCodeAt(0)); return this; }
  line(s = "") { return this.text(s).raw(LF); }
  align(a: "left" | "center" | "right") { return this.raw(ESC, 0x61, a === "left" ? 0 : a === "center" ? 1 : 2); }
  bold(on: boolean) { return this.raw(ESC, 0x45, on ? 1 : 0); }
  big(on: boolean) { return this.raw(GS, 0x21, on ? 0x11 : 0x00); }
  out() { return Uint8Array.from(this.b); }
}

export function receiptBytes(sale: Sale, b: Business | null, customer: Contact | undefined, paid: number, width: 32 | 48 = 32): Uint8Array {
  const p = new Bytes().raw(ESC, 0x40); // initialise
  const rule = "-".repeat(width);
  p.align("center").bold(true).big(true);
  wrap(b?.name ?? "USAHORA", Math.floor(width / 2)).forEach((l) => p.line(l));
  p.big(false).bold(false);
  if (b?.address) wrap(b.address, width).forEach((l) => p.line(l));
  if (b?.phone) p.line(b.phone);
  p.align("left").line(rule);
  p.line(sale.number).line(fmtDateTime(sale.created_at));
  if (sale.cashier_name) p.line(`Kasir: ${sale.cashier_name}`);
  if (customer) p.line(`Pelanggan: ${customer.name}`);
  p.line(rule);
  for (const i of sale.items) {
    wrap(i.name, width).forEach((l) => p.line(l));
    twoCols(`  ${i.qty} x ${rpPlain(i.price)}`, rpPlain(i.qty * i.price - i.discount), width).forEach((l) => p.line(l));
    if (i.discount) p.line(`  diskon -${rpPlain(i.discount)}`);
  }
  p.line(rule);
  twoCols("Subtotal", rpPlain(sale.subtotal), width).forEach((l) => p.line(l));
  if (sale.discount) twoCols("Diskon", `-${rpPlain(sale.discount)}`, width).forEach((l) => p.line(l));
  p.bold(true);
  twoCols("TOTAL", rpPlain(sale.total), width).forEach((l) => p.line(l));
  p.bold(false);
  twoCols(methodLabel(sale.method), rpPlain(sale.received), width).forEach((l) => p.line(l));
  twoCols("Kembalian", rpPlain(sale.change), width).forEach((l) => p.line(l));
  if (paid < sale.total) twoCols("Sisa piutang", rpPlain(sale.total - paid), width).forEach((l) => p.line(l));
  p.line(rule).align("center");
  wrap(b?.invoice_footer || "Terima kasih", width).forEach((l) => p.line(l));
  p.line().line().line(); // feed so the receipt can be torn off
  p.raw(GS, 0x56, 0x42, 0x00); // partial cut (ignored by printers without a cutter)
  return p.out();
}
