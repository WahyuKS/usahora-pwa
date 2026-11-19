export type Base = { id: string; business_id?: string; created_at: string; updated_at: string; is_demo?: boolean };

export type Product = Base & {
  name: string; sku: string; barcode: string; category: string; description: string;
  cost_price: number; sell_price: number; min_stock: number; unit: string; archived: boolean; photo_file_id?: string | null;
};
export type MovementType = "awal" | "masuk" | "keluar" | "penyesuaian" | "penjualan" | "pembelian";
export type StockMovement = Base & { product_id: string; type: MovementType; qty: number; note: string; ref_id?: string };
export type Contact = Base & { name: string; phone: string; email: string; address: string; notes: string; archived?: boolean };
export type SaleItem = { product_id: string; name: string; qty: number; price: number; cost: number; discount: number };
export type PayMethod = "tunai" | "transfer" | "qris" | "lainnya";
export type Sale = Base & {
  number: string; customer_id: string | null; items: SaleItem[]; subtotal: number; discount: number; total: number;
  cogs: number; method: PayMethod; received: number; change: number; note: string; cashier_name?: string;
  /** Date (YYYY-MM-DD) the customer promised to pay the rest. Later changes are kept in meta.promises. */
  due_date?: string | null;
};
export type Payment = Base & { sale_id: string; amount: number; method: PayMethod };
export type PurchaseItem = { product_id: string; name: string; qty: number; cost: number };
export type Purchase = Base & {
  number: string; supplier_id: string | null; items: PurchaseItem[]; extra_cost: number; total: number;
  paid_amount: number; status: "dipesan" | "diterima"; received_at: string | null; note: string;
};
export type FinanceKind = "manual" | "purchase_payment" | "bill" | "invoice";
export type FinanceEntry = Base & {
  type: "income" | "expense"; category: string; amount: number; note: string; date: string; kind: FinanceKind; ref_id?: string;
};
export type InvoiceItem = { name: string; qty: number; price: number; discount: number };
export type InvoiceStatus = "draft" | "terkirim" | "lunas" | "batal";
export type Invoice = Base & {
  doc_type: "invoice" | "quotation"; number: string; customer_id: string | null; customer_name: string; items: InvoiceItem[];
  discount: number; tax_enabled: boolean; tax_rate: number; subtotal: number; tax: number; total: number; notes: string;
  status: InvoiceStatus; issue_date: string; due_date: string;
};
export type Recurring = "none" | "weekly" | "monthly" | "yearly";
export type Bill = Base & { name: string; category: string; amount: number; due_date: string; recurring: Recurring; status: "belum" | "lunas"; paid_at: string | null };
export type Doc = Base & { title: string; category: string; content: string };
export type Activity = Base & { type: string; message: string };

export type Business = {
  id: string; name: string; address: string; phone: string; email: string; currency: string;
  invoice_footer: string; tax_enabled: boolean; tax_rate: number; bank_info: string; logo_file_id?: string | null;
};
export type Role = "owner" | "cashier";
export type User = { id: string; name: string; email: string; business_id: string; role?: Role };

export type OutboxOp = {
  op_id: string; entity: string; record_id: string; action: "upsert" | "delete";
  payload: any; base_updated_at: string | null; created_at: string; attempts: number;
};
export type Conflict = { op: OutboxOp; server: any; server_updated_at: string };
export type Meta = {
  counters: Record<string, number>; conflicts: Conflict[]; lastSyncAt: string | null; lastPullAt: string | null;
  lastBackupAt: string | null; lastCloudBackupAt: string | null; demo: boolean; onboarded: boolean; businessPending: boolean;
  /** Updated promise-to-pay dates per sale id (sales themselves are never edited). */
  promises?: Record<string, string>;
  /** Day (YYYY-MM-DD) the collection notification was last shown. */
  lastCollectionNotice?: string;
};
