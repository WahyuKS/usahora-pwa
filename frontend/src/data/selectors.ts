import { addDays, addMonths, dayKey, inRange, isCustomPeriod, periodDays, rangeOf, type Period } from "@/src/lib/format";
import type { DBState } from "./store";
import { tracksStock, type Bill, type FinanceEntry, type Invoice, type Product, type Purchase, type Sale } from "./types";

export function stockMap(s: DBState): Record<string, number> {
  const m: Record<string, number> = {};
  for (const mv of s.stockMovements) m[mv.product_id] = (m[mv.product_id] ?? 0) + mv.qty;
  return m;
}

export function paidMap(s: DBState): Record<string, number> {
  const m: Record<string, number> = {};
  for (const p of s.payments) m[p.sale_id] = (m[p.sale_id] ?? 0) + p.amount;
  return m;
}

export const invoiceOpen = (i: Invoice) => i.doc_type === "invoice" && (i.status === "draft" || i.status === "terkirim");

export function summary(s: DBState, period: Period) {
  const r = rangeOf(period);
  const sales: Sale[] = s.sales.filter((x) => inRange(x.created_at, r));
  const fin: FinanceEntry[] = s.finance.filter((x) => inRange(x.date, r));
  const omzet = sales.reduce((a, x) => a + x.total, 0);
  const cogs = sales.reduce((a, x) => a + x.cogs, 0);
  const gross = omzet - cogs;
  const otherIncome = fin.filter((f) => f.type === "income").reduce((a, f) => a + f.amount, 0);
  const opex = fin.filter((f) => f.type === "expense" && f.kind !== "purchase_payment").reduce((a, f) => a + f.amount, 0);
  const purchasePaid = fin.filter((f) => f.type === "expense" && f.kind === "purchase_payment").reduce((a, f) => a + f.amount, 0);
  const salesCash = s.payments.filter((p) => inRange(p.created_at, r)).reduce((a, p) => a + p.amount, 0);
  const cashIn = salesCash + otherIncome;
  const cashOut = opex + purchasePaid;
  return {
    range: r, sales, omzet, cogs, gross, otherIncome, opex, purchasePaid,
    net: gross + otherIncome - opex, cashIn, cashOut, cashFlow: cashIn - cashOut, count: sales.length,
  };
}

export function receivables(s: DBState) {
  const paid = paidMap(s);
  const saleItems = s.sales
    .map((x: Sale) => ({ sale: x, due: Math.max(0, x.total - (paid[x.id] ?? 0)) }))
    .filter((x) => x.due > 0);
  const invItems = s.invoices.filter(invoiceOpen) as Invoice[];
  const total = saleItems.reduce((a, x) => a + x.due, 0) + invItems.reduce((a, i) => a + i.total, 0);
  return { saleItems, invItems, total };
}

export function payables(s: DBState) {
  const items = (s.purchases as Purchase[]).map((p) => ({ p, due: Math.max(0, p.total - p.paid_amount) })).filter((x) => x.due > 0);
  return { items, total: items.reduce((a, x) => a + x.due, 0) };
}

export function topProducts(s: DBState, period: Period, limit = 5) {
  const r = rangeOf(period);
  const m: Record<string, { product_id: string; name: string; qty: number; revenue: number; profit: number }> = {};
  for (const sale of s.sales as Sale[]) {
    if (!inRange(sale.created_at, r)) continue;
    for (const it of sale.items) {
      const row = (m[it.product_id] ??= { product_id: it.product_id, name: it.name, qty: 0, revenue: 0, profit: 0 });
      const line = it.qty * it.price - it.discount;
      row.qty += it.qty;
      row.revenue += line;
      row.profit += line - it.qty * it.cost;
    }
  }
  return Object.values(m).sort((a, b) => b.qty - a.qty).slice(0, limit);
}

export function lowStock(s: DBState) {
  const st = stockMap(s);
  return (s.products as Product[])
    .filter((p) => !p.archived && tracksStock(p) && (st[p.id] ?? 0) <= p.min_stock)
    .map((p) => ({ p, stock: st[p.id] ?? 0 }));
}

export function inventoryValue(s: DBState) {
  const st = stockMap(s);
  return (s.products as Product[]).filter((p) => !p.archived && tracksStock(p)).reduce((a, p) => a + Math.max(0, st[p.id] ?? 0) * p.cost_price, 0);
}

/** Sales chart buckets: per day for short periods, per month for the year. */
export function salesSeries(s: DBState, period: Period) {
  const r = rangeOf(period);
  const custom = isCustomPeriod(period);
  const byMonth = period === "year" || period === "all" || (custom && periodDays(period) > 62);
  const lastKey = custom ? (period.to < dayKey() ? period.to : dayKey()) : dayKey();
  const buckets: { key: string; value: number }[] = [];
  if (byMonth) {
    const startKey = custom ? period.from.slice(0, 7) + "-01" : period === "all" ? addMonths(dayKey(), -11).slice(0, 7) + "-01" : dayKey(r.start).slice(0, 4) + "-01-01";
    for (let k = startKey; k <= lastKey; k = addMonths(k, 1)) buckets.push({ key: k.slice(0, 7), value: 0 });
  } else {
    // A single day still shows the week up to it, so the chart has context.
    const start = period === "today" ? addDays(dayKey(), -6) : custom && period.from === period.to ? addDays(period.from, -6) : dayKey(r.start);
    for (let k = start; k <= (custom ? period.to : lastKey); k = addDays(k, 1)) buckets.push({ key: k, value: 0 });
  }
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const sale of s.sales as Sale[]) {
    const k = byMonth ? dayKey(sale.created_at).slice(0, 7) : dayKey(sale.created_at);
    const i = idx.get(k);
    if (i !== undefined) buckets[i].value += sale.total;
  }
  return { buckets, byMonth };
}

export function billsDue(s: DBState, withinDays = 3) {
  const limit = addDays(dayKey(), withinDays);
  return (s.bills as Bill[]).filter((b) => b.status === "belum" && b.due_date <= limit).sort((a, b) => a.due_date.localeCompare(b.due_date));
}

/** Demo mode is derived from the records themselves so it survives sync to other devices. */
export const hasDemo = (s: DBState) => (["products", "sales", "customers", "finance", "invoices", "bills"] as const).some((e) => s[e].some((r: any) => r.is_demo));

// ---------------- Collections (piutang to chase) ----------------
export type CollectionStatus = "late" | "today" | "soon" | "later" | "none";
export type CollectionItem = { sale: Sale; customer_id: string | null; due: number; promise: string | null; status: CollectionStatus; daysLate: number };

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

/** Unpaid sales with their promise-to-pay date. "soon" = within 3 days. Late ones first (oldest first). */
export function collections(s: DBState, today = dayKey()) {
  const paid = paidMap(s);
  const promises = s.meta.promises ?? {};
  const items: CollectionItem[] = (s.sales as Sale[])
    .map((sale) => ({ sale, due: Math.max(0, sale.total - (paid[sale.id] ?? 0)) }))
    .filter((x) => x.due > 0)
    .map(({ sale, due }) => {
      const promise = promises[sale.id] ?? sale.due_date ?? null;
      const diff = promise ? dayDiff(promise, today) : NaN;
      const status: CollectionStatus = !promise ? "none" : diff < 0 ? "late" : diff === 0 ? "today" : diff <= 3 ? "soon" : "later";
      return { sale, customer_id: sale.customer_id, due, promise, status, daysLate: diff < 0 ? -diff : 0 };
    });
  const rank: Record<CollectionStatus, number> = { late: 0, today: 1, soon: 2, none: 3, later: 4 };
  items.sort((a, b) => rank[a.status] - rank[b.status] || String(a.promise ?? "9").localeCompare(String(b.promise ?? "9")));
  const urgent = items.filter((i) => i.status === "late" || i.status === "today");
  return {
    items,
    urgent,
    urgentTotal: urgent.reduce((a, i) => a + i.due, 0),
    total: items.reduce((a, i) => a + i.due, 0),
  };
}
