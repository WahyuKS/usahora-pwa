// IndexedDB table layout (Dexie syntax: first field = primary key, the rest are indexes).
// Only string/number fields are indexed (booleans cannot be indexed in IndexedDB).
import type { Table } from "./types";

export const DEXIE_STORES_V1: Record<Table, string> = {
  products: "id, sku, barcode, category, updated_at",
  categories: "id, name",
  stockMovements: "id, product_id, [product_id+created_at], type, created_at, ref_id",
  customers: "id, name, phone",
  suppliers: "id, name",
  sales: "id, number, customer_id, created_at",
  payments: "id, sale_id, created_at",
  purchases: "id, number, supplier_id, status, created_at",
  finance: "id, type, kind, date",
  invoices: "id, number, doc_type, customer_id, status",
  bills: "id, status, due_date",
  docs: "id, category",
  activities: "id, created_at",
  outbox: "op_id, entity, record_id",
  kv: "key",
  snapshots: "id, created_at",
};

/**
 * Upgrade history. To change the layout later: add `db.version(2).stores({...}).upgrade(tx => ...)`
 * here, keep version 1 untouched, and bump SCHEMA_VERSION in types.ts.
 */
export const DEXIE_VERSIONS: { version: number; stores: Record<string, string> }[] = [{ version: 1, stores: DEXIE_STORES_V1 }];
