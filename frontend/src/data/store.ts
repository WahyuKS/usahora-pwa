// Local-first store: the device copy is the source of truth for the UI.
// Every mutation is written locally, persisted, and queued in the outbox for cloud sync.
import { useSyncExternalStore } from "react";

import { dayKey, nowISO, uuid } from "@/src/lib/format";
import { loadState, saveState } from "./persistence";
import { DOC_TEMPLATES } from "./templates";
import type { Meta, OutboxOp } from "./types";

export const ENTITIES = [
  "products", "stockMovements", "customers", "suppliers", "sales", "payments", "purchases",
  "finance", "invoices", "bills", "docs", "activities",
] as const;
export type Entity = (typeof ENTITIES)[number];
export const IMMUTABLE: Entity[] = ["sales", "stockMovements", "payments"];

export type DBState = { [K in Entity]: any[] } & { outbox: OutboxOp[]; meta: Meta };

const emptyMeta = (): Meta => ({
  counters: {}, conflicts: [], lastSyncAt: null, lastPullAt: null, lastBackupAt: null,
  lastCloudBackupAt: null, demo: false, onboarded: false, businessPending: false,
});
export const emptyDB = (): DBState => ({
  products: [], stockMovements: [], customers: [], suppliers: [], sales: [], payments: [], purchases: [],
  finance: [], invoices: [], bills: [], docs: [], activities: [], outbox: [], meta: emptyMeta(),
});

let state: DBState = emptyDB();
let bid: string | null = null;
let ready = false;
const listeners = new Set<() => void>();
export const inflight = new Set<string>();
let mutateHook: () => void = () => {};
export const setMutateHook = (fn: () => void) => {
  mutateHook = fn;
};

export const getState = () => state;
export const isReady = () => ready;
export const businessId = () => bid;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const useDB = () => useSyncExternalStore(subscribe, getState, getState);

let timer: ReturnType<typeof setTimeout> | undefined;
function set(next: DBState) {
  state = next;
  listeners.forEach((l) => l());
  clearTimeout(timer);
  timer = setTimeout(persist, 120);
}
/** Last save error (shown in Settings). Saving is retried on the next change. */
export let lastPersistError: string | null = null;
export async function persist() {
  if (!bid) return;
  const b = bid, sfx = keySuffix, snapshot = state;
  try {
    await saveState(b, sfx, snapshot);
    lastPersistError = null;
  } catch (e: any) {
    lastPersistError = e?.message ?? String(e);
    console.warn("[USAHORA] Gagal menyimpan data:", lastPersistError);
  }
}

let keySuffix = "";
export async function loadDB(b: string, suffix = "") {
  bid = b;
  keySuffix = suffix;
  const parsed = await loadState(b, suffix); // web: IndexedDB (migrates the old copy once); native: AsyncStorage
  let s = emptyDB();
  if (parsed) s = { ...emptyDB(), ...parsed, meta: { ...emptyMeta(), ...parsed.meta } };
  state = s;
  ready = true;
  if (!s.docs.length) {
    // Seed editable templates locally only (not queued). They reach the cloud only once edited,
    // so a fresh device never overwrites the user's edited/deleted documents on the server.
    const now = nowISO();
    state = { ...state, docs: DOC_TEMPLATES.map((t) => ({ ...t, business_id: b, created_at: now, updated_at: "2000-01-01T00:00:00.000Z" })) };
  }
  listeners.forEach((l) => l());
}

export function unloadDB() {
  // Save pending changes of the business being closed before forgetting it (e.g. on logout).
  if (bid && timer) {
    clearTimeout(timer);
    timer = undefined;
    void persist();
  }
  bid = null;
  ready = false;
  state = emptyDB();
  listeners.forEach((l) => l());
}

// Local mode (no cloud account): nothing is ever sent, so changes are not queued. This keeps the
// device copy small (no second copy of every record in the outbox).
let queueEnabled = true;
export const setSyncQueueEnabled = (on: boolean) => {
  queueEnabled = on;
};

function enqueue(op: Omit<OutboxOp, "op_id" | "attempts" | "created_at">) {
  if (!queueEnabled) return state.outbox;
  let outbox = state.outbox;
  const immutable = IMMUTABLE.includes(op.entity as Entity);
  const idx = immutable ? -1 : outbox.findIndex((o) => o.entity === op.entity && o.record_id === op.record_id && !inflight.has(o.op_id));
  if (idx >= 0) {
    // compact: keep the original base version so conflicts are still detected
    const prev = outbox[idx];
    outbox = outbox.map((o, i) => (i === idx ? { ...prev, action: op.action, payload: op.payload } : o));
  } else {
    outbox = [...outbox, { ...op, op_id: uuid(), attempts: 0, created_at: nowISO() }];
  }
  return outbox;
}

export function upsert(entity: Entity, rec: Record<string, any>, opts: { silent?: boolean } = {}): any {
  const now = nowISO();
  const id = rec.id ?? uuid();
  const list = state[entity];
  const prev = list.find((r) => r.id === id);
  if (prev && IMMUTABLE.includes(entity)) return prev; // immutable records never change
  const full = { ...prev, ...rec, id, business_id: bid, created_at: prev?.created_at ?? (rec as any).created_at ?? now, updated_at: now };
  const nextList = prev ? list.map((r) => (r.id === id ? full : r)) : [full, ...list];
  const outbox = enqueue({ entity, record_id: id, action: "upsert", payload: full, base_updated_at: prev?.updated_at ?? null });
  set({ ...state, [entity]: nextList, outbox });
  if (!opts.silent) mutateHook();
  return full;
}

export function remove(entity: Entity, id: string) {
  const prev = state[entity].find((r) => r.id === id);
  if (!prev) return;
  const outbox = enqueue({ entity, record_id: id, action: "delete", payload: null, base_updated_at: prev.updated_at });
  set({ ...state, [entity]: state[entity].filter((r) => r.id !== id), outbox });
  mutateHook();
}

export function setMeta(patch: Partial<Meta>) {
  set({ ...state, meta: { ...state.meta, ...patch } });
}
export function setOutbox(outbox: OutboxOp[]) {
  set({ ...state, outbox });
}

/** Merge records pulled from the cloud. Local records with pending outbox ops are kept as-is. */
export function applyRemote(records: { entity: string; id: string; deleted: boolean; data: any }[]) {
  if (!records.length) return;
  const next: any = { ...state };
  const pending = new Set(state.outbox.map((o) => `${o.entity}:${o.record_id}`));
  for (const r of records) {
    if (!(ENTITIES as readonly string[]).includes(r.entity) || pending.has(`${r.entity}:${r.id}`)) continue;
    const list: any[] = next[r.entity];
    if (r.deleted) next[r.entity] = list.filter((x) => x.id !== r.id);
    else if (list.some((x) => x.id === r.id)) next[r.entity] = list.map((x) => (x.id === r.id ? r.data : x));
    else next[r.entity] = [r.data, ...list];
  }
  set(next);
}

export function replaceRecord(entity: Entity, data: any) {
  const list = state[entity];
  set({ ...state, [entity]: list.some((x) => x.id === data.id) ? list.map((x) => (x.id === data.id ? data : x)) : [data, ...list] });
}

/** Restore a full backup: replace local data and queue everything for sync (server dedupes by id). */
export function replaceAll(data: Partial<DBState>) {
  const next = emptyDB();
  ENTITIES.forEach((e) => {
    (next as any)[e] = Array.isArray((data as any)[e]) ? (data as any)[e] : [];
  });
  next.meta = { ...emptyMeta(), ...state.meta, counters: { ...state.meta.counters, ...(data.meta?.counters ?? {}) }, demo: !!data.meta?.demo, onboarded: true };
  const now = nowISO();
  next.outbox = !queueEnabled ? [] : ENTITIES.flatMap((e) =>
    (next as any)[e].map((r: any) => ({ op_id: uuid(), entity: e, record_id: r.id, action: "upsert", payload: r, base_updated_at: null, created_at: now, attempts: 0 })),
  );
  set(next);
  mutateHook();
}

export type MergeReport = { added: number; updated: number; unchanged: number };
const ts = (r: any) => {
  const t = Date.parse(r?.updated_at ?? "");
  return isNaN(t) ? 0 : t;
};

/**
 * Merge a backup from another device into this one (manual multi-device use without a server).
 * - Records are matched by id. New ones are added; for editable records the newer version wins.
 * - Sales, payments and stock movements are never edited, so they are simply combined (no duplicates).
 * - Nothing on this device is deleted. Document counters never go backwards.
 */
export function mergeAll(data: Partial<DBState>): MergeReport {
  const report: MergeReport = { added: 0, updated: 0, unchanged: 0 };
  const next: any = { ...state };
  const now = nowISO();
  const ops: OutboxOp[] = [];
  for (const e of ENTITIES) {
    const incoming = Array.isArray((data as any)[e]) ? ((data as any)[e] as any[]) : [];
    if (!incoming.length) continue;
    const local = new Map(state[e].map((r: any) => [r.id, r]));
    const replaced = new Map<string, any>();
    const added: any[] = [];
    for (const raw of incoming) {
      if (!raw || typeof raw.id !== "string") continue;
      const rec = { ...raw, business_id: bid };
      const cur = local.get(rec.id);
      if (!cur) {
        if (added.some((a) => a.id === rec.id)) continue; // duplicate inside the backup
        added.push(rec);
        report.added++;
      } else if (!IMMUTABLE.includes(e) && ts(rec) > ts(cur)) {
        replaced.set(rec.id, rec);
        report.updated++;
      } else report.unchanged++;
      if (queueEnabled && (!cur || replaced.has(rec.id))) ops.push({ op_id: uuid(), entity: e, record_id: rec.id, action: "upsert", payload: rec, base_updated_at: cur?.updated_at ?? null, created_at: now, attempts: 0 });
    }
    if (added.length || replaced.size) {
      added.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
      next[e] = [...added, ...state[e].map((r: any) => replaced.get(r.id) ?? r)];
    }
  }
  const counters = { ...state.meta.counters };
  for (const [k, v] of Object.entries((data as any).meta?.counters ?? {})) counters[k] = Math.max(Number(counters[k] ?? 0), Number(v) || 0);
  next.meta = { ...state.meta, counters };
  next.outbox = ops.length ? [...state.outbox, ...ops] : state.outbox;
  set(next);
  mutateHook();
  return report;
}

/** Unique, human-readable document numbers. Device suffix prevents collisions across devices. */
const deviceTag = uuid().slice(0, 2).toUpperCase();
export function nextNumber(prefix: string) {
  const scope = prefix === "TRX" ? dayKey().replace(/-/g, "").slice(2) : dayKey().replace(/-/g, "").slice(0, 6);
  const ck = `${prefix}-${scope}`;
  const n = (state.meta.counters[ck] ?? 0) + 1;
  setMeta({ counters: { ...state.meta.counters, [ck]: n } });
  return `${prefix}-${scope}-${String(n).padStart(4, "0")}${deviceTag}`;
}
