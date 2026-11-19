// Web implementation: IndexedDB through Dexie. Used by the PWA / browser build.
//
// Transactions (Phase 1.1, finding H1):
// An IndexedDB transaction commits by itself as soon as the code awaits anything that is not a
// database request (a timer, fetch, ...). Running the caller's callback inside a Dexie transaction
// therefore allowed PARTIAL writes. Now:
// 1. The callback runs against a staging area: writes are collected in memory, reads see the
//    database plus the staged writes.
// 2. When the callback has finished successfully, all staged writes are applied in ONE short Dexie
//    transaction that contains only database requests. IndexedDB guarantees that one is all-or-nothing.
// 3. If the callback throws, nothing is applied.
// Writes of one database run one at a time: across browser tabs through the Web Locks API, or within
// this page through one queue per database name when Web Locks is unavailable (older browsers; cross-tab ordering is then
// not guaranteed). Reads made by the callback are not locked against other tabs' direct reads,
// only against other writers.
import { Dexie } from "dexie";

import { createSerialQueue, DEFAULT_WAIT_LIMIT_MS, QueueTimeoutError } from "./serial";
import { DEXIE_VERSIONS } from "./schema";
import { primaryKeyOf, TransactionScopeError, type Repo, type Row, type Table, type TxScope } from "./types";

export class IndexedDbUnavailableError extends Error {
  constructor() {
    super("Penyimpanan IndexedDB tidak tersedia di browser ini (mungkin mode penyamaran). Buka di mode biasa agar data aman.");
  }
}

const copy = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

type Staged = { cleared: boolean; puts: Map<string, Row>; deletes: Set<string> };

/** Serialise writers: Web Locks (cross-tab) when available, otherwise an in-page queue. */
// One fallback queue per DATABASE NAME (not per instance), so two instances of the same database in
// one page are still serialised when Web Locks is unavailable (review finding M7).
const fallbackQueues = new Map<string, ReturnType<typeof createSerialQueue>>();

function createWriteLock(name: string) {
  let queue = fallbackQueues.get(name);
  if (!queue) fallbackQueues.set(name, (queue = createSerialQueue()));
  const locks: any = (globalThis as any).navigator?.locks;
  if (!locks?.request) return queue.run;
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const ctl = new AbortController();
    let started = false;
    const timer = setTimeout(() => { if (!started) ctl.abort(); }, DEFAULT_WAIT_LIMIT_MS);
    return locks
      .request(`usahora-repo:${name}`, { signal: ctl.signal }, async () => {
        started = true;
        clearTimeout(timer);
        return fn();
      })
      .catch((e: any) => {
        clearTimeout(timer);
        // Aborted while waiting: the callback never ran, same guarantee as the queue.
        throw e?.name === "AbortError" && !started ? new QueueTimeoutError() : e;
      });
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
  const t = (table: Table) => db.table(table);
  const locked = createWriteLock(name);

  /** Apply staged changes in one IndexedDB transaction containing only database requests. */
  const apply = async (staged: Map<Table, Staged>) => {
    const tables = [...staged.keys()];
    if (!tables.length) return;
    await db.transaction("rw", tables.map(t), async () => {
      for (const [table, s] of staged) {
        if (s.cleared) await t(table).clear();
        if (s.deletes.size) await t(table).bulkDelete([...s.deletes]);
        if (s.puts.size) await t(table).bulkPut([...s.puts.values()]);
      }
    });
  };

  const stagedScope = (declared: Table[], staged: Map<Table, Staged>): TxScope => {
    const check = (table: Table) => {
      if (!declared.includes(table)) throw new TransactionScopeError(table, declared);
    };
    const stage = (table: Table) => {
      let s = staged.get(table);
      if (!s) staged.set(table, (s = { cleared: false, puts: new Map(), deletes: new Set() }));
      return s;
    };
    const putOne = (table: Table, row: Row) => {
      const s = stage(table);
      const key = String(row[primaryKeyOf(table)]);
      s.deletes.delete(key);
      s.puts.set(key, copy(row));
    };
    return {
      getAll: async (table) => {
        check(table);
        const s = staged.get(table);
        const base = s?.cleared ? [] : await t(table).toArray();
        if (!s) return base;
        const pk = primaryKeyOf(table);
        const out = new Map<string, Row>();
        for (const r of base) if (!s.deletes.has(String(r[pk]))) out.set(String(r[pk]), r);
        for (const [k, r] of s.puts) out.set(k, copy(r));
        return [...out.values()];
      },
      get: async (table, key) => {
        check(table);
        const s = staged.get(table);
        const k = String(key);
        if (s?.puts.has(k)) return copy(s.puts.get(k));
        if (s?.deletes.has(k) || s?.cleared) return undefined;
        return t(table).get(key);
      },
      put: async (table, row) => { check(table); putOne(table, row); },
      bulkPut: async (table, rows) => { check(table); rows.forEach((r) => putOne(table, r)); },
      delete: async (table, key) => {
        check(table);
        const s = stage(table);
        s.puts.delete(String(key));
        s.deletes.add(String(key));
      },
      clear: async (table) => {
        check(table);
        const s = stage(table);
        s.cleared = true;
        s.puts.clear();
        s.deletes.clear();
      },
    };
  };

  const transaction = <T>(tables: Table[], fn: (tx: TxScope) => Promise<T>): Promise<T> =>
    locked(async () => {
      const staged = new Map<Table, Staged>();
      const result = await fn(stagedScope([...tables], staged)); // throws -> nothing applied
      await apply(staged);
      return result;
    });

  return {
    name,
    kind: "indexeddb",
    // Dexie returns fresh objects from IndexedDB (structured clone), so reads never expose stored data.
    getAll: (table) => t(table).toArray(),
    get: (table, key) => t(table).get(key),
    put: (table, row) => transaction([table], (tx) => tx.put(table, row)),
    bulkPut: (table, rows) => transaction([table], (tx) => tx.bulkPut(table, rows)),
    delete: (table, key) => transaction([table], (tx) => tx.delete(table, key)),
    clear: (table) => transaction([table], (tx) => tx.clear(table)),
    count: (table) => t(table).count(),
    transaction,
    refresh: async () => {}, // IndexedDB reads always come from disk
    close: () => db.close(),
  };
}

export { primaryKeyOf };
export type { Row };
