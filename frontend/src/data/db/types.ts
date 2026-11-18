// Shared contract for the local inventory database (web: IndexedDB via Dexie, native: key-value storage).
// UI code does not use this yet in Phase 1; store.ts is connected in Phase 2.

/** Version of the table layout. Bump only together with an upgrade step in schema.ts. */
export const SCHEMA_VERSION = 1;

/** Tables holding business records. Every row has a string `id`. */
export const RECORD_TABLES = [
  "products", "categories", "stockMovements", "customers", "suppliers", "sales", "payments", "purchases",
  "finance", "invoices", "bills", "docs", "activities",
] as const;
export type RecordTable = (typeof RECORD_TABLES)[number];

/** Internal tables. outbox rows are keyed by `op_id`, kv rows by `key`, snapshots by `id`. */
export const SYSTEM_TABLES = ["outbox", "kv", "snapshots"] as const;
export type SystemTable = (typeof SYSTEM_TABLES)[number];
export type Table = RecordTable | SystemTable;
export const ALL_TABLES: Table[] = [...RECORD_TABLES, ...SYSTEM_TABLES];

export const primaryKeyOf = (t: Table) => (t === "outbox" ? "op_id" : t === "kv" ? "key" : "id");

export type Row = Record<string, any>;

/** A transaction scope: reads see writes made earlier in the same scope. */
export interface TxScope {
  getAll(table: Table): Promise<Row[]>;
  get(table: Table, key: string): Promise<Row | undefined>;
  put(table: Table, row: Row): Promise<void>;
  bulkPut(table: Table, rows: Row[]): Promise<void>;
  delete(table: Table, key: string): Promise<void>;
  clear(table: Table): Promise<void>;
}

export interface Repo extends TxScope {
  readonly name: string;
  readonly kind: "indexeddb" | "kv";
  count(table: Table): Promise<number>;
  /** All-or-nothing: if `fn` throws, none of its writes are kept. */
  transaction<T>(tables: Table[], fn: (tx: TxScope) => Promise<T>): Promise<T>;
  /** Drop any in-memory cache so the next read comes from disk (used to verify migrations). */
  refresh(): Promise<void>;
  close(): void;
}

/** Database name per business (and per staff user, matching the legacy key layout). */
export const dbNameFor = (businessId: string, suffix = "") => `usahora_${businessId}${suffix}`;
