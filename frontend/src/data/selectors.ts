import { addDays, addMonths, dayKey, inRange, rangeOf, type Period } from "@/src/lib/format";
import type { DBState } from "./store";
import type { Bill, FinanceEntry, Invoice, Product, Purchase, Sale } from "./types";

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
    .filter((p) => !p.archived && (st[p.id] ?? 0) <= p.min_stock)
    .map((p) => ({ p, stock: st[p.id] ?? 0 }));
}

export function inventoryValue(s: DBState) {
  const st = stockMap(s);
  return (s.products as Product[]).filter((p) => !p.archived).reduce((a, p) => a + Math.max(0, st[p.id] ?? 0) * p.cost_price, 0);
}

/** Sales chart buckets: per day for short periods, per month for the year. */
export function salesSeries(s: DBState, period: Period) {
  const r = rangeOf(period);
  const byMonth = period === "year" || period === "all";
  const buckets: { key: string; value: number }[] = [];
  if (byMonth) {
    const startKey = period === "all" ? addMonths(dayKey(), -11).slice(0, 7) + "-01" : dayKey(r.start).slice(0, 4) + "-01-01";
    for (let k = startKey; k <= dayKey(); k = addMonths(k, 1)) buckets.push({ key: k.slice(0, 7), value: 0 });
  } else {
    const start = period === "today" ? addDays(dayKey(), -6) : dayKey(r.start);
    for (let k = start; k <= dayKey(); k = addDays(k, 1)) buckets.push({ key: k, value: 0 });
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
