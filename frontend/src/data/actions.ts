import { addDays, addMonths, dateKeyToISO, dayKey, nowISO, rp, uuid } from "@/src/lib/format";
import { ENTITIES, getState, nextNumber, remove, replaceAll, setMeta, upsert, type DBState } from "./store";
import { paidMap, stockMap } from "./selectors";
import type { Bill, Contact, FinanceEntry, Invoice, InvoiceItem, MovementType, PayMethod, Product, Purchase, PurchaseItem, Sale } from "./types";

export class ValidationError extends Error {}
const must = (cond: unknown, msg: string) => {
  if (!cond) throw new ValidationError(msg);
};

export function logActivity(type: string, message: string, is_demo?: boolean) {
  upsert("activities", { type, message, ...(is_demo ? { is_demo } : {}) }, { silent: true });
}

// ---------------- Products & stock ----------------
export function saveProduct(p: Partial<Product>, initialStock = 0, stockAt?: string) {
  must(p.name?.trim(), "Nama produk wajib diisi");
  must((p.sell_price ?? 0) >= 0 && (p.cost_price ?? 0) >= 0, "Harga tidak boleh negatif");
  const sku = p.sku?.trim();
  if (sku) must(!getState().products.some((x: Product) => x.sku === sku && x.id !== p.id), "SKU sudah dipakai produk lain");
  const isNew = !p.id;
  const rec = upsert("products", {
    barcode: "", category: "Umum", description: "", unit: "pcs", min_stock: 0, archived: false, ...p,
    name: p.name!.trim(), sku: sku ?? "",
  });
  if (isNew && initialStock > 0) addMovement(rec.id, "awal", initialStock, "Stok awal", undefined, p.is_demo, stockAt);
  logActivity("product", `${isNew ? "Menambahkan" : "Memperbarui"} produk ${rec.name}`, p.is_demo);
  return rec as Product;
}

export function archiveProduct(id: string, archived: boolean) {
  const p = getState().products.find((x: Product) => x.id === id);
  if (!p) return;
  upsert("products", { id, archived });
  logActivity("product", `${archived ? "Mengarsipkan" : "Mengaktifkan"} produk ${p.name}`);
}

export function addMovement(product_id: string, type: MovementType, qty: number, note = "", ref_id?: string, is_demo?: boolean, created_at?: string) {
  must(qty !== 0, "Jumlah tidak boleh 0");
  return upsert("stockMovements", { product_id, type, qty, note, ref_id, ...(is_demo ? { is_demo } : {}), ...(created_at ? { created_at } : {}) }, { silent: !!ref_id });
}

export function stockInOut(product_id: string, type: "masuk" | "keluar", qty: number, note: string) {
  must(qty > 0, "Jumlah harus lebih dari 0");
  if (type === "keluar") must((stockMap(getState())[product_id] ?? 0) >= qty, "Stok tidak cukup untuk dikeluarkan");
  addMovement(product_id, type, type === "masuk" ? qty : -qty, note);
  const p = getState().products.find((x: Product) => x.id === product_id);
  logActivity("stock", `Stok ${type} ${qty} ${p?.unit ?? ""} ${p?.name ?? ""}`);
}

export function adjustStock(product_id: string, actual: number, note: string) {
  must(actual >= 0, "Stok aktual tidak boleh negatif");
  const cur = stockMap(getState())[product_id] ?? 0;
  must(actual !== cur, "Stok aktual sama dengan stok sistem");
  addMovement(product_id, "penyesuaian", actual - cur, note || "Stock opname");
  logActivity("stock", `Penyesuaian stok menjadi ${actual}`);
}

// ---------------- POS ----------------
export type CartLine = { product: Product; qty: number; discount: number };
export function checkout(input: {
  lines: CartLine[]; discount: number; method: PayMethod; received: number; customer_id: string | null; note: string; is_demo?: boolean; created_at?: string;
}): Sale {
  must(input.lines.length > 0, "Keranjang masih kosong");
  const st = stockMap(getState());
  const items = input.lines.map((l) => {
    must(l.qty > 0, `Jumlah ${l.product.name} tidak valid`);
    must((st[l.product.id] ?? 0) >= l.qty, `Stok ${l.product.name} tidak cukup (tersisa ${st[l.product.id] ?? 0})`);
    must(l.discount >= 0 && l.discount <= l.qty * l.product.sell_price, `Diskon ${l.product.name} melebihi harga`);
    return { product_id: l.product.id, name: l.product.name, qty: l.qty, price: l.product.sell_price, cost: l.product.cost_price, discount: l.discount };
  });
  const subtotal = items.reduce((a, i) => a + i.qty * i.price - i.discount, 0);
  must(input.discount >= 0 && input.discount <= subtotal, "Diskon transaksi melebihi subtotal");
  const total = subtotal - input.discount;
  must(input.received >= 0, "Jumlah uang diterima tidak valid");
  if (!input.customer_id) must(input.received >= total, "Pembayaran kurang. Pilih pelanggan untuk mencatat sebagai piutang.");
  const paid = Math.min(input.received, total);
  const demo = input.is_demo ? { is_demo: true } : {};
  const at = input.created_at ? { created_at: input.created_at } : {};
  const sale = upsert("sales", {
    number: nextNumber("TRX"), customer_id: input.customer_id, items, subtotal, discount: input.discount, total,
    cogs: items.reduce((a, i) => a + i.qty * i.cost, 0), method: input.method, received: input.received,
    change: Math.max(0, input.received - total), note: input.note, ...demo, ...at,
  }) as Sale;
  items.forEach((i) => addMovement(i.product_id, "penjualan", -i.qty, `Penjualan ${sale.number}`, sale.id, input.is_demo, input.created_at));
  if (paid > 0) upsert("payments", { sale_id: sale.id, amount: paid, method: input.method, ...demo, ...at }, { silent: true });
  logActivity("sale", `Penjualan ${sale.number} sebesar ${rp(total)}`, input.is_demo);
  return sale;
}

export function addSalePayment(sale_id: string, amount: number, method: PayMethod) {
  const s = getState();
  const sale = s.sales.find((x: Sale) => x.id === sale_id);
  must(sale, "Transaksi tidak ditemukan");
  const due = sale.total - (paidMap(s)[sale_id] ?? 0);
  must(amount > 0 && amount <= due, `Nominal harus antara 1 dan ${rp(due)}`);
  upsert("payments", { sale_id, amount, method });
  logActivity("payment", `Pelunasan ${sale.number} sebesar ${rp(amount)}`);
}

// ---------------- Contacts ----------------
export function saveContact(entity: "customers" | "suppliers", c: Partial<Contact>) {
  must(c.name?.trim(), "Nama wajib diisi");
  if (c.email) must(/^\S+@\S+\.\S+$/.test(c.email), "Format email tidak valid");
  const rec = upsert(entity, { phone: "", email: "", address: "", notes: "", archived: false, ...c, name: c.name!.trim() });
  logActivity(entity, `${c.id ? "Memperbarui" : "Menambahkan"} ${entity === "customers" ? "pelanggan" : "supplier"} ${rec.name}`, c.is_demo);
  return rec as Contact;
}

// ---------------- Finance ----------------
export function addFinance(f: Partial<FinanceEntry>) {
  must(f.amount && f.amount > 0, "Nominal harus lebih dari 0");
  must(f.category?.trim(), "Kategori wajib diisi");
  const rec = upsert("finance", { note: "", kind: "manual", date: nowISO(), ...f });
  logActivity("finance", `${f.type === "income" ? "Pendapatan" : "Pengeluaran"} ${f.category} ${rp(f.amount!)}`, f.is_demo);
  return rec as FinanceEntry;
}
export const deleteFinance = (id: string) => remove("finance", id);

// ---------------- Purchases ----------------
export function savePurchase(input: { supplier_id: string | null; items: PurchaseItem[]; extra_cost: number; paid_amount: number; received: boolean; note: string; is_demo?: boolean }) {
  must(input.items.length > 0, "Tambahkan minimal satu barang");
  input.items.forEach((i) => must(i.qty > 0 && i.cost >= 0, `Jumlah/harga ${i.name} tidak valid`));
  must(input.extra_cost >= 0, "Biaya tambahan tidak valid");
  const total = input.items.reduce((a, i) => a + i.qty * i.cost, 0) + input.extra_cost;
  must(input.paid_amount >= 0 && input.paid_amount <= total, "Jumlah dibayar melebihi total");
  const p = upsert("purchases", {
    number: nextNumber("PO"), supplier_id: input.supplier_id, items: input.items, extra_cost: input.extra_cost, total,
    paid_amount: 0, status: "dipesan", received_at: null, note: input.note, ...(input.is_demo ? { is_demo: true } : {}),
  }) as Purchase;
  if (input.paid_amount > 0) payPurchase(p.id, input.paid_amount);
  if (input.received) receivePurchase(p.id);
  logActivity("purchase", `Pembelian ${p.number} sebesar ${rp(total)}`, input.is_demo);
  return p;
}

export function receivePurchase(id: string) {
  const p: Purchase | undefined = getState().purchases.find((x: Purchase) => x.id === id);
  must(p && p.status !== "diterima", "Pembelian sudah diterima");
  const qtyTotal = p!.items.reduce((a, i) => a + i.qty, 0);
  p!.items.forEach((i) => {
    addMovement(i.product_id, "pembelian", i.qty, `Pembelian ${p!.number}`, p!.id, p!.is_demo);
    const landed = Math.round(i.cost + (qtyTotal ? p!.extra_cost / qtyTotal : 0));
    upsert("products", { id: i.product_id, cost_price: landed }, { silent: true });
  });
  upsert("purchases", { id, status: "diterima", received_at: nowISO() });
}

export function payPurchase(id: string, amount: number) {
  const p: Purchase | undefined = getState().purchases.find((x: Purchase) => x.id === id);
  must(p, "Pembelian tidak ditemukan");
  must(amount > 0 && amount <= p!.total - p!.paid_amount, "Nominal pembayaran tidak valid");
  upsert("purchases", { id, paid_amount: p!.paid_amount + amount });
  upsert("finance", { type: "expense", category: "Pembelian Stok", amount, note: `Bayar ${p!.number}`, date: nowISO(), kind: "purchase_payment", ref_id: id, ...(p!.is_demo ? { is_demo: true } : {}) });
}

// ---------------- Invoices ----------------
export function calcInvoice(items: InvoiceItem[], discount: number, tax_enabled: boolean, tax_rate: number) {
  const subtotal = items.reduce((a, i) => a + i.qty * i.price - i.discount, 0);
  const base = Math.max(0, subtotal - discount);
  const tax = tax_enabled ? Math.round((base * tax_rate) / 100) : 0;
  return { subtotal, tax, total: base + tax };
}

export function saveInvoice(inv: Partial<Invoice>) {
  must(inv.customer_name?.trim(), "Nama pelanggan wajib diisi");
  must(inv.items && inv.items.length > 0, "Tambahkan minimal satu item");
  inv.items!.forEach((i) => must(i.name.trim() && i.qty > 0 && i.price >= 0, "Lengkapi nama, jumlah, dan harga setiap item"));
  const t = calcInvoice(inv.items!, inv.discount ?? 0, !!inv.tax_enabled, inv.tax_rate ?? 0);
  must(t.subtotal >= (inv.discount ?? 0), "Diskon melebihi subtotal");
  const isNew = !inv.id;
  const rec = upsert("invoices", {
    status: "draft", notes: "", ...inv, ...t,
    number: inv.number ?? nextNumber(inv.doc_type === "quotation" ? "QUO" : "INV"),
  }) as Invoice;
  if (isNew) logActivity("invoice", `Membuat ${rec.doc_type === "quotation" ? "quotation" : "invoice"} ${rec.number}`, inv.is_demo);
  return rec;
}

export function setInvoiceStatus(id: string, status: Invoice["status"]) {
  const inv: Invoice | undefined = getState().invoices.find((x: Invoice) => x.id === id);
  if (!inv || inv.status === status) return;
  upsert("invoices", { id, status });
  if (status === "lunas" && inv.doc_type === "invoice") {
    upsert("finance", { type: "income", category: "Pembayaran Invoice", amount: inv.total, note: inv.number, date: nowISO(), kind: "invoice", ref_id: id });
  }
  logActivity("invoice", `${inv.number} ditandai ${status}`);
}

export function quotationToInvoice(id: string) {
  const q: Invoice = getState().invoices.find((x: Invoice) => x.id === id);
  const { id: _i, number: _n, created_at: _c, updated_at: _u, ...rest } = q;
  const inv = saveInvoice({ ...rest, doc_type: "invoice", status: "draft", issue_date: dayKey(), due_date: addDays(dayKey(), 14) });
  return inv;
}

// ---------------- Bills ----------------
export function saveBill(b: Partial<Bill>) {
  must(b.name?.trim(), "Nama tagihan wajib diisi");
  must(b.amount && b.amount > 0, "Nominal harus lebih dari 0");
  return upsert("bills", { category: "Operasional", recurring: "none", status: "belum", paid_at: null, ...b }) as Bill;
}

export function payBill(id: string) {
  const b: Bill | undefined = getState().bills.find((x: Bill) => x.id === id);
  if (!b || b.status === "lunas") return;
  upsert("bills", { id, status: "lunas", paid_at: nowISO() });
  upsert("finance", { type: "expense", category: b.category || "Tagihan", amount: b.amount, note: `Tagihan: ${b.name}`, date: nowISO(), kind: "bill", ref_id: id, ...(b.is_demo ? { is_demo: true } : {}) });
  if (b.recurring !== "none") {
    const next = b.recurring === "weekly" ? addDays(b.due_date, 7) : b.recurring === "monthly" ? addMonths(b.due_date, 1) : addMonths(b.due_date, 12);
    upsert("bills", { name: b.name, category: b.category, amount: b.amount, due_date: next, recurring: b.recurring, status: "belum", paid_at: null, ...(b.is_demo ? { is_demo: true } : {}) });
  }
  logActivity("bill", `Tagihan ${b.name} dibayar ${rp(b.amount)}`);
}

// ---------------- Demo data ----------------
export function loadDemo() {
  const d = { is_demo: true };
  const prods = [
    ["Kopi Susu Gula Aren", "Minuman", 9000, 18000, 40], ["Es Teh Manis", "Minuman", 2500, 6000, 60],
    ["Roti Bakar Coklat", "Makanan", 7000, 15000, 25], ["Mie Goreng Spesial", "Makanan", 8000, 17000, 30],
    ["Air Mineral 600ml", "Minuman", 2000, 4000, 48], ["Keripik Singkong", "Snack", 5000, 10000, 4],
    ["Kopi Bubuk 250g", "Retail", 32000, 55000, 12], ["Tumbler USAHORA", "Merchandise", 45000, 85000, 3],
  ] as const;
  const stockAt = dateKeyToISO(addDays(dayKey(), -8));
  const products = prods.map(([name, category, cost, sell, stock], i) =>
    saveProduct({ name, category, cost_price: cost, sell_price: sell, min_stock: 5, unit: "pcs", sku: `DEMO-${100 + i}`, ...d }, stock, stockAt),
  );
  const custs = [["Budi Santoso", "081234567890"], ["Siti Rahma", "081298765432"], ["CV Maju Jaya", "0215550123"]].map(([name, phone]) =>
    saveContact("customers", { name, phone, ...d }),
  );
  saveContact("suppliers", { name: "PT Sumber Kopi Nusantara", phone: "0227771234", ...d });
  const methods: PayMethod[] = ["tunai", "qris", "transfer", "tunai"];
  for (let day = 6; day >= 0; day--) {
    for (let k = 0; k < 2; k++) {
      const ai = (day + k) % 5;
      const bi = (ai + 1 + ((day + k) % 3)) % 5;
      const a = products[ai], b = products[bi];
      const at = dateKeyToISO(addDays(dayKey(), -day));
      const created_at = new Date(new Date(at).getTime() + (9 + k * 4) * 3600e3).toISOString();
      const lines = [{ product: a, qty: 1 + (k % 2), discount: 0 }, { product: b, qty: 1, discount: 0 }];
      const total = lines.reduce((s, l) => s + l.qty * l.product.sell_price, 0);
      checkout({ lines, discount: 0, method: methods[(day + k) % 4], received: total, customer_id: null, note: "", is_demo: true, created_at });
    }
  }
  const credit = [{ product: products[6], qty: 2, discount: 0 }];
  checkout({ lines: credit, discount: 0, method: "transfer", received: 50000, customer_id: custs[2].id, note: "Tempo 7 hari", is_demo: true });
  addFinance({ type: "expense", category: "Sewa Tempat", amount: 1500000, note: "Sewa bulan ini", date: nowISO(), ...d });
  addFinance({ type: "expense", category: "Listrik & Air", amount: 350000, note: "", date: nowISO(), ...d });
  saveBill({ name: "Internet Toko", category: "Utilitas", amount: 300000, due_date: addDays(dayKey(), 2), recurring: "monthly", ...d });
  saveInvoice({
    doc_type: "invoice", customer_id: custs[2].id, customer_name: custs[2].name, discount: 0, tax_enabled: false, tax_rate: 11,
    items: [{ name: "Paket Kopi Kantor (20 cup)", qty: 1, price: 350000, discount: 0 }], status: "terkirim",
    issue_date: dayKey(), due_date: addDays(dayKey(), 14), notes: "", ...d,
  });
  setMeta({ demo: true, onboarded: true });
}

export function clearDemo() {
  const s = getState();
  ENTITIES.forEach((e) => s[e].filter((r: any) => r.is_demo).forEach((r: any) => remove(e, r.id)));
  setMeta({ demo: false });
}

// ---------------- Backup ----------------
export function buildBackup(business: { id: string; name: string } | null) {
  const s = getState();
  const data: any = { app: "usahora", version: 1, exported_at: nowISO(), business_id: business?.id, business_name: business?.name, meta: { counters: s.meta.counters, demo: s.meta.demo } };
  ENTITIES.forEach((e) => (data[e] = s[e]));
  return data;
}

export function validateBackup(obj: any): string | null {
  if (!obj || typeof obj !== "object") return "File bukan JSON yang valid";
  if (obj.app !== "usahora") return "File ini bukan backup USAHORA";
  for (const e of ENTITIES) {
    if (obj[e] !== undefined && !Array.isArray(obj[e])) return `Bagian "${e}" rusak`;
    if (Array.isArray(obj[e]) && obj[e].some((r: any) => !r || typeof r.id !== "string")) return `Data "${e}" tidak memiliki ID yang valid`;
  }
  return null;
}

export function restoreBackup(obj: Partial<DBState>) {
  replaceAll(obj);
  logActivity("backup", "Data dipulihkan dari backup");
}

export const newId = uuid;
