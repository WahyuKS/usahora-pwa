// Native implementation (Android / iOS): table data in AsyncStorage, one JSON value per table version.
//
// Commit design (no journal, no replay):
// 1. Changed tables are written under NEW versioned keys (`…_<table>@<gen>`); current keys are untouched.
// 2. A single manifest key (`…__manifest`, one value = one atomic write on Android and iOS) is then
//    switched to point at the new versions. Only this step makes the transaction visible.
// 3. Old versions are deleted afterwards (best effort; leftovers are ignored and cleaned on next open).
// If anything fails before step 2, the manifest still points at the old data: nothing is applied,
// now or after a restart. A failed transaction can never "come back".
//
// Other rules: read errors / corrupted JSON throw (never treated as empty); the cache is updated only
// after a successful commit; all operations run one at a time per repo (queue). Never call the repo
// itself inside a transaction callback (use `tx`); such a call waits and fails after 15 s.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ALL_TABLES, primaryKeyOf, type Repo, type Row, type Table, type TxScope } from "./types";

export type KV = {
  get(key: string): Promise<string | null>;
  multiSet(entries: [string, string][]): Promise<void>;
  remove(key: string): Promise<void>;
  keys?(): Promise<readonly string[]>;
};

const defaultKV = (): KV => ({
  get: (k) => AsyncStorage.getItem(k), // throws on storage errors (unlike the shared storage helper)
  multiSet: (entries) => AsyncStorage.multiSet(entries),
  remove: (k) => AsyncStorage.removeItem(k),
  keys: () => AsyncStorage.getAllKeys(),
});

export class StorageReadError extends Error {}
const WAIT_LIMIT_MS = 15000;

export async function createRepo(name: string, kv?: KV): Promise<Repo> {
  const store = kv ?? defaultKV();
  const prefix = `usahora_v2_${name}_`;
  const manifestKey = `${prefix}_manifest`;
  const dataKey = (t: Table, gen: string) => `${prefix}${t}@${gen}`;
  const cache = new Map<Table, Map<string, Row>>();
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

  let manifest: Record<string, string> = (await readJson(manifestKey, "manifest")) ?? {};
  if (typeof manifest !== "object" || Array.isArray(manifest)) throw new StorageReadError("Data manifest di perangkat rusak");

  // Best-effort cleanup of versions left behind by an interrupted commit.
  if (store.keys) {
    const live = new Set(Object.entries(manifest).map(([t, g]) => dataKey(t as Table, g)));
    const all = await store.keys().catch(() => [] as readonly string[]);
    // Only keys that are exactly `<prefix><table>@<gen>` belong to THIS repo. A plain prefix match would
    // also hit another repo whose name starts with this one (owner `usahora_b1` vs staff `usahora_b1_u2`)
    // and delete that user's data.
    const ownsKey = (k: string) => {
      if (!k.startsWith(prefix)) return false;
      const rest = k.slice(prefix.length);
      const at = rest.indexOf("@");
      return at > 0 && (ALL_TABLES as string[]).includes(rest.slice(0, at));
    };
    for (const k of all) if (ownsKey(k) && !live.has(k)) await store.remove(k).catch(() => {});
  }

  const load = async (t: Table) => {
    const hit = cache.get(t);
    if (hit) return hit;
    const gen = manifest[t];
    const rows = gen ? await readJson(dataKey(t, gen), `tabel ${t}`) : [];
    if (rows === null && gen) throw new StorageReadError(`Data tabel ${t} hilang dari perangkat`);
    if (!Array.isArray(rows ?? [])) throw new StorageReadError(`Data tabel ${t} di perangkat rusak`);
    const m = new Map<string, Row>((rows ?? []).map((r: Row) => [String(r[primaryKeyOf(t)]), r]));
    cache.set(t, m);
    return m;
  };

  const commit = async (changed: Map<Table, Map<string, Row>>) => {
    if (!changed.size) return;
    // Unique per commit even across restarts or a clock change; a gen equal to the live one would
    // make step 3 delete the data just written.
    let gen: string;
    do gen = `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    while ([...changed.keys()].some((t) => manifest[t] === gen));
    await store.multiSet([...changed].map(([t, m]) => [dataKey(t, gen), JSON.stringify([...m.values()])]));
    const next = { ...manifest };
    for (const t of changed.keys()) next[t] = gen;
    await store.multiSet([[manifestKey, JSON.stringify(next)]]); // the single switch-over write
    const old = manifest;
    manifest = next;
    for (const [t, m] of changed) cache.set(t, m);
    for (const t of changed.keys()) if (old[t] && old[t] !== gen) await store.remove(dataKey(t, old[t])).catch(() => {});
  };

  const scope = (staged?: Map<Table, Map<string, Row>>): TxScope => {
    const view = async (t: Table) => staged?.get(t) ?? (await load(t));
    const write = async (t: Table, fn: (m: Map<string, Row>) => void) => {
      const next = new Map(await view(t)); // copy: committed data is never mutated in place
      fn(next);
      if (staged) staged.set(t, next);
      else await commit(new Map([[t, next]]));
    };
    return {
      getAll: async (t) => [...(await view(t)).values()],
      get: async (t, k) => (await view(t)).get(k),
      put: (t, row) => write(t, (m) => m.set(String(row[primaryKeyOf(t)]), row)),
      bulkPut: (t, rows) => write(t, (m) => rows.forEach((r) => m.set(String(r[primaryKeyOf(t)]), r))),
      delete: (t, k) => write(t, (m) => m.delete(k)),
      clear: (t) => write(t, (m) => m.clear()),
    };
  };

  // One-at-a-time queue. An operation that waits too long behind a running one fails instead of hanging.
  let chain: Promise<unknown> = Promise.resolve();
  const queued = <T>(fn: () => Promise<T>): Promise<T> => {
    let started = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = chain.then(() => { started = true; clearTimeout(timer); return fn(); });
    chain = run.catch(() => {});
    const timeout = new Promise<never>((_, rej) => {
      timer = setTimeout(() => {
        if (!started) rej(new Error("Operasi penyimpanan menunggu terlalu lama (jangan panggil repo di dalam transaction, gunakan tx)"));
      }, WAIT_LIMIT_MS);
    });
    // The timer is cleared as soon as the operation starts, so no timer outlives a finished operation.
    return Promise.race([run, timeout]).finally(() => clearTimeout(timer));
  };

  const direct = scope();
  return {
    name,
    kind: "kv",
    getAll: (t) => queued(() => direct.getAll(t)),
    get: (t, k) => queued(() => direct.get(t, k)),
    put: (t, r) => queued(() => direct.put(t, r)),
    bulkPut: (t, r) => queued(() => direct.bulkPut(t, r)),
    delete: (t, k) => queued(() => direct.delete(t, k)),
    clear: (t) => queued(() => direct.clear(t)),
    count: (t) => queued(async () => (await load(t)).size),
    transaction: (_tables, fn) =>
      queued(async () => {
        const staged = new Map<Table, Map<string, Row>>();
        const result = await fn(scope(staged)); // throws -> nothing is written
        await commit(staged);
        return result;
      }),
    refresh: () => queued(async () => {
      cache.clear();
      manifest = (await readJson(manifestKey, "manifest")) ?? {};
    }),
    close: () => cache.clear(),
  };
}
