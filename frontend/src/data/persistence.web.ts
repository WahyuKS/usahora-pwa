// Web persistence: IndexedDB (through the Phase 1 repository) instead of one big localStorage value.
//
// - First open of a business on this browser: the old localStorage copy is migrated once with
//   migrateLegacy (copy, verify, roll back on failure). The old copy is NEVER modified or deleted.
// - After a successful migration the old copy is frozen: the app never writes it again and never
//   migrates it again, so records deleted later cannot come back from it.
// - Saving writes only the records that changed (and deletes removed ones) in one transaction.
// - If IndexedDB is unavailable (some private modes) or the migration fails, the app keeps using the
//   old localStorage copy exactly as before, so nothing is lost; Settings shows this.
import { legacyKey, legacyReader } from "@/src/data/db/legacy-source";
import { MIGRATION_KEY, migrateLegacy } from "@/src/data/db/migrate-legacy";
import { createRepo } from "@/src/data/db/repo.web";
import { dbNameFor, type Repo, type Table } from "@/src/data/db/types";
import { storage } from "@/src/utils/storage";

import type { StorageInfo } from "./persistence";

export type { StorageInfo };

// Same list as store.ts ENTITIES (kept here to avoid an import cycle).
const ENTITIES = ["products", "stockMovements", "customers", "suppliers", "sales", "payments", "purchases", "finance", "invoices", "bills", "docs", "activities"] as const;

type Mode = { kind: "indexeddb"; repo: Repo } | { kind: "legacy"; reason: string };
const modes = new Map<string, Mode>();
/** What was last written to IndexedDB, per database, to compute record-level changes. */
const lastSaved = new Map<string, Record<string, any>>();
let persistedFlag: boolean | null = null;
let lastNote: string | undefined;

const byNewest = (a: any, b: any) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
const byOldest = (a: any, b: any) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));

async function requestPersistentStorage() {
  try {
    const sm: any = (globalThis as any).navigator?.storage;
    if (sm?.persisted && (await sm.persisted())) persistedFlag = true;
    else if (sm?.persist) persistedFlag = await sm.persist(); // asks the browser not to evict this site's data
  } catch {
    persistedFlag = null;
  }
}

async function readLegacy(b: string, suffix: string) {
  const raw = await storage.getItem(legacyKey(b, suffix), null as string | null);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    await storage.setItem(`${legacyKey(b, suffix)}_corrupt_${Date.now()}`, raw);
    return null;
  }
}

async function readRepo(repo: Repo) {
  const out: Record<string, any> = {};
  for (const e of ENTITIES) out[e] = (await repo.getAll(e as Table)).sort(byNewest);
  out.outbox = (await repo.getAll("outbox")).sort(byOldest);
  const meta = await repo.get("kv", "meta");
  if (meta?.value) out.meta = meta.value;
  return out;
}

async function openMode(b: string, suffix: string): Promise<Mode> {
  const name = dbNameFor(b, suffix);
  const cached = modes.get(name);
  if (cached) return cached;
  let mode: Mode;
  try {
    const repo = await createRepo(name);
    const done = await repo.get("kv", MIGRATION_KEY);
    if (!done) {
      const res = await migrateLegacy({ repo, readLegacy: legacyReader(b, suffix) });
      if (res.status === "failed") throw new Error(`Migrasi data lama gagal: ${res.reason}`);
      if (res.status === "nothing") {
        // No old data: mark as migrated so an old copy written later by an outdated tab is never merged in.
        await repo.put("kv", { key: MIGRATION_KEY, value: { status: "done", at: new Date().toISOString(), sourceHash: "none", tables: {} } });
      }
    }
    mode = { kind: "indexeddb", repo };
    await requestPersistentStorage();
  } catch (e: any) {
    console.warn("[USAHORA] IndexedDB tidak dipakai, tetap memakai penyimpanan lama:", e?.message ?? e);
    mode = { kind: "legacy", reason: e?.message ?? String(e) };
  }
  modes.set(name, mode);
  return mode;
}

export async function loadState(b: string, suffix: string): Promise<Record<string, any> | null> {
  const name = dbNameFor(b, suffix);
  const mode = await openMode(b, suffix);
  if (mode.kind === "legacy") {
    lastNote = mode.reason;
    return readLegacy(b, suffix);
  }
  lastNote = undefined;
  const s = await readRepo(mode.repo);
  lastSaved.set(name, s);
  const empty = ENTITIES.every((e) => !s[e].length) && !s.meta;
  return empty ? null : s;
}

/** Record-level diff against what was last saved; one transaction; retried in full on the next save if it fails. */
export async function saveState(b: string, suffix: string, state: Record<string, any>): Promise<void> {
  const name = dbNameFor(b, suffix);
  const mode = await openMode(b, suffix);
  if (mode.kind === "legacy") {
    await storage.setItem(legacyKey(b, suffix), JSON.stringify(state));
    return;
  }
  const prev = lastSaved.get(name) ?? {};
  const touched = new Set<Table>();
  const ops: ((tx: any) => Promise<void>)[] = [];
  const diff = (table: Table, pk: string, now: any[] = [], before: any[] = []) => {
    const old = new Map(before.map((r) => [r[pk], r]));
    const cur = new Set<string>();
    const put: any[] = [];
    for (const r of now) {
      cur.add(r[pk]);
      if (old.get(r[pk]) !== r) put.push(r); // store.ts never mutates records in place
    }
    const del = before.filter((r) => !cur.has(r[pk])).map((r) => r[pk]);
    if (put.length || del.length) {
      touched.add(table);
      ops.push(async (tx) => {
        for (const id of del) await tx.delete(table, id);
        if (put.length) await tx.bulkPut(table, put);
      });
    }
  };
  for (const e of ENTITIES) diff(e as Table, "id", state[e], prev[e]);
  diff("outbox", "op_id", state.outbox, prev.outbox);
  if (state.meta !== prev.meta) {
    touched.add("kv");
    ops.push((tx) => tx.put("kv", { key: "meta", value: state.meta }));
  }
  if (!ops.length) return;
  await mode.repo.transaction([...touched], async (tx) => {
    for (const op of ops) await op(tx);
  });
  lastSaved.set(name, state);
}

export async function storageInfo(): Promise<StorageInfo> {
  const anyIdb = [...modes.values()].some((m) => m.kind === "indexeddb");
  return { engine: anyIdb ? "indexeddb" : "localstorage", persisted: persistedFlag, note: lastNote };
}

/** Test helper: forget open databases and diff snapshots. */
export function __resetPersistenceForTests() {
  for (const m of modes.values()) if (m.kind === "indexeddb") m.repo.close();
  modes.clear();
  lastSaved.clear();
}
