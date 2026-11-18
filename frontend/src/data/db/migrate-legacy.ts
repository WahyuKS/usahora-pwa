// One-time, repeatable migration of the legacy single-JSON database (localStorage on web,
// AsyncStorage on native) into the new repository.
//
// Safety rules:
// - The legacy value is only READ. It is never modified or deleted here.
// - All writes happen in one transaction (all-or-nothing).
// - Before writing, a snapshot of the current repository content is taken; if verification
//   fails afterwards, the snapshot is restored (rollback).
// - Upsert by primary key => running it again never creates duplicates.
// - A newer record already in the repository (higher updated_at) is never overwritten by older legacy data.
import { ALL_TABLES, primaryKeyOf, RECORD_TABLES, type RecordTable, type Repo, type Row, type Table } from "./types";

// Legacy entity names that exist in the old blob (categories did not exist yet).
const LEGACY_TABLES = RECORD_TABLES.filter((t) => t !== "categories");
const MIGRATION_KEY = "migration_legacy_v1";
// Failures are recorded separately so they never erase the record of an earlier successful run.
const MIGRATION_ERROR_KEY = "migration_legacy_v1_last_error";

export type TableReport = { source: number; duplicatesInSource: number; written: number; keptNewer: number; verified: boolean };
export type MigrationResult =
  | { status: "nothing" }
  | { status: "already"; at: string }
  | { status: "done"; at: string; sourceHash: string; tables: Record<string, TableReport> }
  | { status: "failed"; reason: string; rolledBack: boolean; tables?: Record<string, TableReport> };

/** Stable JSON (sorted keys) so the same record always produces the same checksum. */
export function canonical(v: any): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
}

/** FNV-1a 32-bit hash (integrity check, not security). */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** True if `a` was updated after `b`. Uses real time when both parse, otherwise text order. */
const newer = (a: Row, b: Row) => {
  const x = Date.parse(a.updated_at ?? ""), y = Date.parse(b.updated_at ?? "");
  if (!isNaN(x) && !isNaN(y)) return x > y;
  return String(a.updated_at ?? "") > String(b.updated_at ?? "");
};

/** Normalise the legacy blob into rows per table, removing duplicate ids (keeps the newest). */
export function parseLegacy(raw: string) {
  const data = JSON.parse(raw);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Format data lama tidak dikenali");
  const tables: Partial<Record<Table, Row[]>> = {};
  const dupes: Record<string, number> = {};
  const source: Record<string, number> = {};
  const collect = (t: Table, list: unknown) => {
    if (list === undefined) list = [];
    if (!Array.isArray(list)) throw new Error(`Bagian "${t}" pada data lama rusak`);
    const pk = primaryKeyOf(t);
    const m = new Map<string, Row>();
    for (const r of list as Row[]) {
      if (!r || typeof r !== "object" || typeof r[pk] !== "string" || !r[pk]) throw new Error(`Data "${t}" berisi baris tanpa ID yang valid`);
      const prev = m.get(r[pk]);
      if (!prev || newer(r, prev) || !prev.updated_at) m.set(r[pk], r);
    }
    source[t] = (list as Row[]).length;
    dupes[t] = (list as Row[]).length - m.size;
    tables[t] = [...m.values()];
  };
  LEGACY_TABLES.forEach((t) => collect(t, data[t]));
  collect("outbox", data.outbox);
  tables.kv = [{ key: "meta", value: data.meta && typeof data.meta === "object" ? data.meta : {} }];
  return { tables, dupes, source };
}

async function snapshotAll(repo: Repo) {
  const snap: Partial<Record<Table, Row[]>> = {};
  for (const t of ALL_TABLES) if (t !== "snapshots") snap[t] = await repo.getAll(t);
  return snap;
}

async function restore(repo: Repo, snap: Partial<Record<Table, Row[]>>) {
  const tables = Object.keys(snap) as Table[];
  await repo.transaction(tables, async (tx) => {
    for (const t of tables) {
      await tx.clear(t);
      await tx.bulkPut(t, snap[t]!);
    }
  });
}

export async function migrateLegacy(opts: {
  repo: Repo;
  readLegacy: () => Promise<string | null>;
  now?: () => string;
  /** test hook: corrupt data after the write to prove rollback works */
  afterWrite?: (repo: Repo) => Promise<void>;
}): Promise<MigrationResult> {
  const { repo } = opts;
  const now = opts.now ?? (() => new Date().toISOString());
  const raw = await opts.readLegacy();
  if (!raw) return { status: "nothing" };
  const sourceHash = hash(raw);

  const prevRun = await repo.get("kv", MIGRATION_KEY);
  if (prevRun?.value?.status === "done" && prevRun.value.sourceHash === sourceHash) return { status: "already", at: prevRun.value.at };

  let parsed: ReturnType<typeof parseLegacy>;
  try {
    parsed = parseLegacy(raw);
  } catch (e: any) {
    await repo.put("kv", { key: MIGRATION_ERROR_KEY, value: { status: "failed", at: now(), reason: e.message, sourceHash } }).catch(() => {});
    return { status: "failed", reason: e.message, rolledBack: true }; // nothing was written
  }

  const before = await snapshotAll(repo);
  const reports: Record<string, TableReport> = {};
  const writeTables: Table[] = [...LEGACY_TABLES, "outbox", "kv"];
  let committed = false;
  try {
    await repo.transaction(writeTables, async (tx) => {
      for (const t of writeTables) {
        const pk = primaryKeyOf(t);
        const rows = parsed.tables[t] ?? [];
        let written = 0, keptNewer = 0;
        const toWrite: Row[] = [];
        for (const r of rows) {
          const existing = t === "kv" ? undefined : await tx.get(t, r[pk]);
          if (existing && newer(existing, r)) keptNewer++;
          else { toWrite.push(r); written++; }
        }
        if (t === "kv") {
          const cur = await tx.get("kv", "meta");
          if (!cur) await tx.bulkPut(t, toWrite);
          else {
            // keep existing meta, but never let document counters go backwards (avoids duplicate numbers)
            const legacyCounters = toWrite[0]?.value?.counters ?? {};
            const counters = { ...(cur.value?.counters ?? {}) };
            for (const [k, v] of Object.entries(legacyCounters)) counters[k] = Math.max(Number(counters[k] ?? 0), Number(v) || 0);
            await tx.put("kv", { key: "meta", value: { ...cur.value, counters } });
          }
        } else await tx.bulkPut(t, toWrite);
        reports[t] = { source: parsed.source[t] ?? rows.length, duplicatesInSource: parsed.dupes[t] ?? 0, written, keptNewer, verified: false };
      }
    });
    committed = true;
    if (opts.afterWrite) await opts.afterWrite(repo);

    // Verify against what is actually stored on disk (not an in-memory cache).
    await repo.refresh();
    // Every legacy record must exist, and be either identical or a newer version.
    for (const t of writeTables) {
      if (t === "kv") { reports[t].verified = !!(await repo.get("kv", "meta")); continue; }
      const pk = primaryKeyOf(t);
      const stored = new Map((await repo.getAll(t)).map((r) => [String(r[pk]), r]));
      const rows = parsed.tables[t] ?? [];
      const ok = rows.every((r) => {
        const s = stored.get(r[pk]);
        return !!s && (canonical(s) === canonical(r) || newer(s, r));
      });
      const countOk = stored.size >= rows.length;
      reports[t].verified = ok && countOk;
      if (!reports[t].verified) throw new Error(`Verifikasi gagal pada tabel ${t}`);
    }
  } catch (e: any) {
    // If the transaction itself failed, nothing was written (all-or-nothing): no restore needed.
    let rolledBack = !committed;
    if (committed) {
      try {
        await restore(repo, before);
        rolledBack = true;
      } catch {
        rolledBack = false;
      }
    }
    await repo.put("kv", { key: MIGRATION_ERROR_KEY, value: { status: "failed", at: now(), reason: e.message, sourceHash, rolledBack } }).catch(() => {});
    return { status: "failed", reason: e.message, rolledBack, tables: reports };
  }

  const at = now();
  await repo.put("kv", { key: MIGRATION_KEY, value: { status: "done", at, sourceHash, tables: reports } });
  return { status: "done", at, sourceHash, tables: reports };
}

export const LEGACY_RECORD_TABLES: RecordTable[] = LEGACY_TABLES;
export { MIGRATION_ERROR_KEY, MIGRATION_KEY };
