/// <reference types="jest" />
// Thermal receipt (ESC/POS) and the Web Bluetooth sender, with a fake printer.
import { printBluetooth } from "@/src/lib/bt-printer.web";
import { asciiOnly, receiptBytes, rpPlain, twoCols, wrap } from "@/src/lib/escpos";

const sale: any = {
  id: "s1", number: "TRX-261119-0001AB", created_at: "2026-11-19T03:00:00.000Z", customer_id: null, cashier_name: "Budi",
  items: [
    { product_id: "p1", name: "Kopi Susu Gula Aren Spesial Ukuran Besar Sekali", qty: 2, price: 18000, cost: 9000, discount: 1000 },
    { product_id: "p2", name: "Air Mineral", qty: 1, price: 4000, cost: 2000, discount: 0 },
  ],
  subtotal: 39000, discount: 2000, total: 37000, cogs: 20000, method: "tunai", received: 50000, change: 13000, note: "",
};
const business: any = { name: "Toko Maju Jaya Sentosa Abadi", address: "Jl. Merdeka No. 1, Bandung", phone: "0812", invoice_footer: "Terima kasih — sampai jumpa!" };

/** Printable text lines between control bytes. */
function textLines(bytes: Uint8Array) {
  const lines: string[] = [];
  let cur = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x1b && bytes[i + 1] === 0x40) { i += 1; continue; } // ESC @ (2 bytes)
    if (b === 0x1b || b === 0x1d) { i += b === 0x1d && bytes[i + 1] === 0x56 ? 3 : 2; continue; } // other ESC/GS commands (3-4 bytes)
    if (b === 0x0a) { lines.push(cur); cur = ""; } else cur += String.fromCharCode(b);
  }
  return lines;
}

describe("ESC/POS receipt", () => {
  it("formats rupiah", () => {
    expect(rpPlain(1500000)).toBe("Rp1.500.000");
    expect(rpPlain(-2000)).toBe("-Rp2.000");
  });

  it("never prints a line wider than the paper (58 mm = 32 chars, 80 mm = 48)", () => {
    for (const width of [32, 48] as const) {
      const lines = textLines(receiptBytes(sale, business, undefined, 37000, width));
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(width);
    }
  });

  it("starts with printer init, contains the numbers, ends with a cut", () => {
    const bytes = receiptBytes(sale, business, undefined, 37000);
    expect([...bytes.slice(0, 2)]).toEqual([0x1b, 0x40]);
    const text = textLines(bytes).join("\n");
    expect(text).toContain("TRX-261119-0001AB");
    expect(text).toContain("Rp37.000");
    expect(text).toContain("Rp13.000");
    expect(text).toContain("Terima kasih - sampai jumpa!");
    expect([...bytes.slice(-4)]).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it("only sends printable ASCII text", () => {
    expect(asciiOnly("Café — “Ñ”")).toBe('Cafe - "N"');
    const bytes = receiptBytes({ ...sale, items: [{ ...sale.items[1], name: "Teh 🍵 Hijau" }] }, business, undefined, 37000);
    const text = textLines(bytes).join("");
    expect(/^[\x20-\x7e]*$/.test(text)).toBe(true);
  });

  it("shows remaining receivable when not fully paid", () => {
    expect(textLines(receiptBytes(sale, business, undefined, 20000)).join("\n")).toContain("Sisa piutang");
  });

  it("helpers keep columns aligned", () => {
    expect(twoCols("Total", "Rp1.000", 20)).toEqual(["Total        Rp1.000"]);
    expect(wrap("satu dua tiga empat", 9)).toEqual(["satu dua", "tiga", "empat"]);
  });
});

describe("Web Bluetooth sender (fake printer)", () => {
  const writes: Uint8Array[] = [];
  let chooses = 0;
  beforeEach(() => {
    writes.length = 0;
    chooses = 0;
    const characteristic = {
      properties: { write: true, writeWithoutResponse: true },
      writeValueWithoutResponse: async (v: Uint8Array) => { writes.push(v); },
    };
    const device = {
      name: "RPP02N",
      gatt: {
        connected: false,
        async connect() { this.connected = true; return { getPrimaryServices: async () => [{ getCharacteristics: async () => [{ properties: { read: true } }, characteristic] }] }; },
      },
    };
    (globalThis as any).navigator = { bluetooth: { requestDevice: async () => { chooses++; return device; } } };
  });
  afterAll(() => { delete (globalThis as any).navigator; });

  it("sends the whole receipt in small chunks and remembers the printer", async () => {
    const bytes = receiptBytes(sale, business, undefined, 37000);
    expect(await printBluetooth(bytes)).toBe("RPP02N");
    expect(writes.every((w) => w.length <= 100)).toBe(true);
    expect(Buffer.concat(writes.map((w) => Buffer.from(w))).equals(Buffer.from(bytes))).toBe(true);
    await printBluetooth(bytes);
    expect(chooses).toBe(1); // second receipt uses the same printer without asking again
  });

  it("a cancelled printer choice gives a clear message", async () => {
    (globalThis as any).navigator.bluetooth.requestDevice = async () => { throw Object.assign(new Error("cancel"), { name: "NotFoundError" }); };
    await expect(printBluetooth(new Uint8Array([1]), true)).rejects.toThrow("Pemilihan printer dibatalkan.");
  });
});

declare const Buffer: any;
