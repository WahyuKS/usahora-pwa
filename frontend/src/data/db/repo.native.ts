// Native implementation (Android / iOS): table data in AsyncStorage, one JSON value per table version.
//
// Commit design (no journal, no replay):
// 1. Changed tables are written under NEW versioned keys (`…_<table>@<gen>`), together with a
//    "pending" marker for that gen; current keys are untouched.
// 2. A single manifest key (`…__manifest`, one value = one atomic write on Android and iOS) is then
//    switched to point at the new versions. Only this step makes the transaction visible.
// 3. Old versions and the marker are deleted afterwards (best effort).
// If anything fails before step 2, the manifest still points at the old data: nothing is applied,
// now or after a restart. A failed transaction can never "come back".
//
// Several users of the same database (Phase 1.1, finding C1):
// - createRepo() returns a handle to ONE shared instance per (storage, database name). All handles
//   share one cache and one write queue, so they cannot overwrite each other's manifest.
// - A database is only re-opened after the previous instance has finished all queued work.
// - Defence in depth, for an instance that bypasses the registry: every commit re-reads the manifest
//   from disk and refuses to write (ConcurrentModificationError) if a table changed under it, old
//   versions are deleted only when the on-disk manifest no longer uses them, and start-up cleanup
//   skips versions protected by a recent pending marker (a commit still in progress elsewhere).
//
// Other rules: read errors / corrupted JSON throw (never treated as empty); the cache is updated only
// after a successful commit; rows are copied in and out (callers never hold internal objects);
// transactions may only touch the tables they declare. Never call the repo itself inside a
// transaction callback (use `tx`): such a call waits, is NOT executed, and fails after 15 s.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { createSerialQueue } from "./serial";
import {
  ALL_TABLES, ConcurrentModificationError, primaryKeyOf, RepoClosedError, TransactionScopeError,
  type Repo, type Row, type Table, type TxScope,
} from "./types";

export type KV = {
  get(key: string): Promise<string | null>;
  multiSet(entries: [string, string][]): Promise<void>;
  remove(key: string): Promise<void>;
  keys?(): Promise<readonly string[]>;
};

// One object for the real AsyncStorage, so the registry recognises "the same storage".
let defaultKVInstance: KV | undefined;
const defaultKV = (): KV =>
  (defaultKVInstance ??= {
    get: (k) => AsyncStorage.getItem(k), // throws on storage errors (unlike the shared storage helper)
    multiSet: (entries) => AsyncStorage.multiSet(entries),
    remove: (k) => AsyncStorage.removeItem(k),
    keys: () => AsyncStorage.getAllKeys(),
  });

export class StorageReadError extends Error {}

/** A pending marker younger than this protects its versions from start-up cleanup. */
const PENDING_TTL_MS = 60_000;

/** Copy through JSON: exactly what is stored on disk, and never shared with the caller. */
const copy = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

type Core = {
  ops: Omit<Repo, "name" | "kind" | "close">;
  drained: () => Promise<void>;
  dropCache: () => void;
};

async function openCore(name: string, store: KV): Promise<Core> {
  const prefix = `usahora_v2_${name}_`;
  const manifestKey = `${prefix}_manifest`;
  const pendingPrefix = `${prefix}_pending@`;
  const dataKey = (t: Table, gen: string) => `${prefix}${t}@${gen}`;
  /** Table name of a key that belongs to THIS database, or null. */
  const tableOfKey = (k: string): string | null => {
    // Only `<prefix><table>@<gen>` belongs here. A plain prefix match would also hit another database
    // whose name starts with this one (owner `usahora_b1` vs staff `usahora_b1_u2`).
    if (!k.startsWith(prefix)) return null;
    const rest = k.slice(prefix.length);
    const at = rest.indexOf("@");
    const t = at > 0 ? rest.slice(0, at) : "";
    return (ALL_TABLES as string[]).includes(t) ? t : null;
  };
  const genOfKey = (k: string) => k.slice(k.indexOf("@", prefix.length) + 1);
  const cache = new Map<Table, { gen: string | undefined; rows: Map<string, Row> }>();
  let seq = 0;

  const readJson = async (key: string, what: string) => {
    let raw: string | null;
    try {
      raw = await store.get(key);
    } catch (e: any) {
      throw new StorageReadError(`Gagal membaca ${what}: ${e?.message ?? e}`);
    }
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      throw new StorageReadError(`Data ${what} di perangkat rusak`);
    }
  };
  const readManifest = async (): Promise<Record<string, string>> => {
    const m = (await readJson(manifestKey, "manifest")) ?? {};
    if (typeof m !== "object" || Array.isArray(m)) throw new StorageReadError("Data manifest di perangkat rusak");
    return m;
  };

  let manifest = await readManifest();

  // Best-effort cleanup of versions left behind by an interrupted commit.
  if (store.keys) {
    const all = await store.keys().catch(() => [] as readonly string[]);
    const protectedGens = new Set<string>();
    for (const k of all) {
      if (!k.startsWith(pendingPrefix)) continue;
      const at = Number(await store.get(k).catch(() => null));
      if (Date.now() - at < PENDING_TTL_MS) protectedGens.add(k.slice(pendingPrefix.length));
      else await store.remove(k).catch(() => {}); // stale marker from a crash
    }
    const live = new Set(Object.entries(manifest).map(([t, g]) => dataKey(t as Table, g)));
    for (const k of all) {
      if (tableOfKey(k) && !live.has(k) && !protectedGens.has(genOfKey(k))) await store.remove(k).catch(() => {});
    }
  }

  const load = async (t: Table) => {
    const hit = cache.get(t);
    if (hit) return hit.rows;
    let gen = manifest[t];
    let rows = gen ? await readJson(dataKey(t, gen), `tabel ${t}`) : [];
    if (rows === null && gen) {
      // Our manifest copy may be older than the disk (another instance committed). Re-read once.
      manifest = await readManifest();
      gen = manifest[t];
      rows = gen ? await readJson(dataKey(t, gen), `tabel ${t}`) : [];
      if (rows === null) throw new StorageReadError(`Data tabel ${t} hilang dari perangkat`);
    }
    if (!Array.isArray(rows)) throw new StorageReadError(`Data tabel ${t} di perangkat rusak`);
    const m = new Map<string, Row>(rows.map((r: Row) => [String(r[primaryKeyOf(t)]), r]));
    cache.set(t, { gen, rows: m });
    return m;
  };

  const commit = async (changed: Map<Table, Map<string, Row>>) => {
    if (!changed.size) return;
    const disk = await readManifest();
    for (const t of changed.keys()) {
      if (disk[t] !== cache.get(t)?.gen) {
        // Someone else switched this table since we read it: writing would lose their change.
        for (const [ct, c] of cache) if (disk[ct] !== c.gen) cache.delete(ct);
        manifest = disk;
        throw new ConcurrentModificationError(t);
      }
    }
    // Unique per commit even across restarts, clock changes or other instances.
    let gen: string;
    do gen = `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    while (Object.values(disk).includes(gen));
    const marker = `${pendingPrefix}${gen}`;
    await store.multiSet([
      [marker, String(Date.now())],
      ...[...changed].map(([t, m]): [string, string] => [dataKey(t, gen), JSON.stringify([...m.values()])]),
    ]);
    const next = { ...disk };
    for (const t of changed.keys()) next[t] = gen;
    try {
      await store.multiSet([[manifestKey, JSON.stringify(next)]]); // the single switch-over write
    } catch (e) {
      // Not applied. Drop the marker so the orphaned versions are cleaned on the next open.
      // (Data keys are not deleted here: if the switch did land despite the error they are live.)
      await store.remove(marker).catch(() => {});
      throw e;
    }
    manifest = next;
    for (const [t, m] of changed) cache.set(t, { gen, rows: m });
    for (const t of changed.keys()) if (disk[t] && disk[t] !== gen) await store.remove(dataKey(t, disk[t])).catch(() => {});
    await store.remove(marker).catch(() => {});
  };

  const scope = (staged?: Map<Table, Map<string, Row>>, declared?: Table[]): TxScope => {
    const check = (t: Table) => {
      if (declared && !declared.includes(t)) throw new TransactionScopeError(t, declared);
    };
    const view = async (t: Table) => {
      check(t);
      return staged?.get(t) ?? (await load(t));
    };
    const write = async (t: Table, fn: (m: Map<string, Row>) => void) => {
      const next = new Map(await view(t)); // copy: committed data is never mutated in place
      fn(next);
      if (staged) staged.set(t, next);
      else await commit(new Map([[t, next]]));
    };
    return {
      getAll: async (t) => [...(await view(t)).values()].map(copy),
      get: async (t, k) => copy((await view(t)).get(String(k))),
      put: (t, row) => write(t, (m) => m.set(String(row[primaryKeyOf(t)]), copy(row))),
      bulkPut: (t, rows) => write(t, (m) => rows.forEach((r) => m.set(String(r[primaryKeyOf(t)]), copy(r)))),
      delete: (t, k) => write(t, (m) => m.delete(String(k))),
      clear: (t) => write(t, (m) => m.clear()),
    };
  };

  const queue = createSerialQueue();
  const direct = scope();
  return {
    ops: {
      getAll: (t) => queue.run(() => direct.getAll(t)),
      get: (t, k) => queue.run(() => direct.get(t, k)),
      put: (t, r) => queue.run(() => direct.put(t, r)),
      bulkPut: (t, r) => queue.run(() => direct.bulkPut(t, r)),
      delete: (t, k) => queue.run(() => direct.delete(t, k)),
      clear: (t) => queue.run(() => direct.clear(t)),
      count: (t) => queue.run(async () => (await load(t)).size),
      transaction: (tables, fn) =>
        queue.run(async () => {
          const staged = new Map<Table, Map<string, Row>>();
          const result = await fn(scope(staged, [...tables])); // throws -> nothing is written
          await commit(staged);
          return result;
        }),
      refresh: () =>
        queue.run(async () => {
          cache.clear();
          manifest = await readManifest();
        }),
    },
    drained: queue.drained,
    dropCache: () => cache.clear(),
  };
}

// ---- registry: one shared instance per (storage, database name) ----
type Shared = { core: Promise<Core>; refs: number };
const registry = new WeakMap<KV, Map<string, Shared>>();
const closing = new WeakMap<KV, Map<string, Promise<void>>>();
const mapFor = <V>(wm: WeakMap<KV, Map<string, V>>, kv: KV) => {
  let m = wm.get(kv);
  if (!m) wm.set(kv, (m = new Map()));
  return m;
};

export async function createRepo(name: string, kv?: KV): Promise<Repo> {
  const store = kv ?? defaultKV();
  const open = mapFor(registry, store);
  let shared = open.get(name);
  if (!shared) {
    const previous = mapFor(closing, store).get(name) ?? Promise.resolve();
    const s: Shared = { refs: 0, core: previous.then(() => openCore(name, store)) };
    s.core.catch(() => { if (open.get(name) === s) open.delete(name); }); // a failed open is not reused
    open.set(name, s);
    shared = s;
  }
  shared.refs++;
  let core: Core;
  try {
    core = await shared.core;
  } catch (e) {
    shared.refs--;
    throw e;
  }
  const owner = shared;
  let closed = false;
  const guard = <A extends unknown[], R>(fn: (...a: A) => Promise<R>) => (...a: A): Promise<R> =>
    closed ? Promise.reject(new RepoClosedError(name)) : fn(...a);
  const o = core.ops;
  return {
    name,
    kind: "kv",
    getAll: guard(o.getAll),
    get: guard(o.get),
    put: guard(o.put),
    bulkPut: guard(o.bulkPut),
    delete: guard(o.delete),
    clear: guard(o.clear),
    count: guard(o.count),
    transaction: guard(o.transaction) as Repo["transaction"],
    refresh: guard(o.refresh),
    close: () => {
      if (closed) return;
      closed = true;
      if (--owner.refs > 0) return;
      if (open.get(name) === owner) open.delete(name);
      // The next open of this database waits until every queued operation of this one has finished.
      const done = core.drained().then(core.dropCache);
      mapFor(closing, store).set(name, done);
    },
  };
}
