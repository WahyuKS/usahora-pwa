// Web implementation: IndexedDB through Dexie. Used by the PWA / browser build.
import { Dexie } from "dexie";

import { DEXIE_VERSIONS } from "./schema";
import { primaryKeyOf, type Repo, type Row, type Table, type TxScope } from "./types";

export class IndexedDbUnavailableError extends Error {
  constructor() {
    super("Penyimpanan IndexedDB tidak tersedia di browser ini (mungkin mode penyamaran). Buka di mode biasa agar data aman.");
  }
}

function scopeFor(db: Dexie): TxScope {
  const t = (name: Table) => db.table(name);
  return {
    getAll: (name) => t(name).toArray(),
    get: (name, key) => t(name).get(key),
    put: async (name, row) => { await t(name).put(row); },
    bulkPut: async (name, rows) => { if (rows.length) await t(name).bulkPut(rows); },
    delete: (name, key) => t(name).delete(key),
    clear: (name) => t(name).clear(),
  };
}

export async function createRepo(name: string): Promise<Repo> {
  if (typeof indexedDB === "undefined") throw new IndexedDbUnavailableError();
  const db = new Dexie(name);
  DEXIE_VERSIONS.forEach((v) => db.version(v.version).stores(v.stores));
  try {
    await db.open();
  } catch (e: any) {
    if (e?.name === "MissingAPIError" || e?.name === "InvalidStateError") throw new IndexedDbUnavailableError();
    throw e;
  }
  const scope = scopeFor(db);
  return {
    name,
    kind: "indexeddb",
    ...scope,
    count: (table) => db.table(table).count(),
    // Dexie aborts the whole IndexedDB transaction if fn throws, so partial writes are never kept.
    transaction: (tables, fn) => db.transaction("rw", tables.map((x) => db.table(x)), () => fn(scope)),
    refresh: async () => {}, // IndexedDB reads always come from disk
    close: () => db.close(),
  };
}

export { primaryKeyOf };
export type { Row };
