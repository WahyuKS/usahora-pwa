/// <reference types="jest" />
// Migration against the EXACT on-disk format that store.ts writes today, plus rollback and
// multi-user isolation checks (Phase 1 review fixes).
import "fake-indexeddb/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { legacyKey, legacyReader } from "@/src/data/db/legacy-source";
import { canonical, MIGRATION_KEY, migrateLegacy, rollbackLegacyMigration } from "@/src/data/db/migrate-legacy";
import { createRepo as createNative, type KV } from "@/src/data/db/repo.native";
import { createRepo as createWeb } from "@/src/data/db/repo.web";
import type { Repo } from "@/src/data/db/types";
import { storage } from "@/src/utils/storage";

const memKV = (): KV & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    get: async (k) => map.get(k) ?? null,
    multiSet: async (e) => { e.forEach(([k, v]) => map.set(k, v)); },
    remove: async (k) => { map.delete(k); },
    keys: async () => [...map.keys()],
  };
};

const T = (d: number) => new Date(Date.UTC(2026, 0, d)).toISOString();
/** A legacy state shaped like store.ts DBState. */
const legacyState = () => ({
  products: [
    { id: "p1", business_id: "b1", name: "Kopi", sku: "K1", cost_price: 10, sell_price: 15, archived: false, created_at: T(1), updated_at: T(2) },
    { id: "p2", business_id: "b1", name: "Teh", sku: "T1", cost_price: 5, sell_price: 8, archived: false, created_at: T(1), updated_at: T(1) },
  ],
  categories: undefined,
  stockMovements: [
    { id: "m1", product_id: "p1", type: "awal", qty: 10, created_at: T(1), updated_at: T(1) },
    { id: "m2", product_id: "p1", type: "penjualan", qty: -3, created_at: T(2), updated_at: T(2) },
    { id: "m3", product_id: "p2", type: "masuk", qty: 7, created_at: T(2), updated_at: T(2) },
  ],
  customers: [{ id: "c1", name: "Budi", created_at: T(1), updated_at: T(1) }],
  suppliers: [], sales: [{ id: "s1", number: "TRX-1", created_at: T(2), updated_at: T(2) }],
  payments: [], purchases: [], finance: [], invoices: [], bills: [],
  docs: [{ id: "d1", title: "Template", updated_at: "2000-01-01T00:00:00.000Z" }],
  activities: [],
  outbox: [{ op_id: "op1", entity: "products", record_id: "p1", action: "upsert", attempts: 0 }],
  meta: { counters: { "TRX-260101": 1 }, lastSyncAt: null },
});
const stockTotals = (rows: any[]) => rows.reduce((m: Record<string, number>, r) => ({ ...m, [r.product_id]: (m[r.product_id] ?? 0) + r.qty }), {});

let n = 0;
const impls: [string, () => Promise<Repo>][] = [
  ["web (IndexedDB)", () => createWeb(`real_fmt_web_${++n}`)],
  ["native (key-value)", () => createNative(`real_fmt_native_${++n}`, memKV())],
];

describe.each(impls)("legacy migration, real store.ts format, %s", (_l, make) => {
  let repo: Repo;
  const bid = () => `biz${n}`;
  beforeEach(async () => {
    repo = await make();
    // Written exactly like store.ts persist(): storage.setItem(key, JSON.stringify(state))
    await storage.setItem(legacyKey(bid()), JSON.stringify(legacyState()));
  });
  afterEach(() => repo.close());

  it("value on disk is double-encoded (documents the real format)", async () => {
    const disk = await AsyncStorage.getItem(legacyKey(bid()));
    expect(typeof JSON.parse(disk!)).toBe("string");
  });

  it("migrates with matching counts, content and stock totals; legacy value untouched", async () => {
    const before = await AsyncStorage.getItem(legacyKey(bid()));
    const res = await migrateLegacy({ repo, readLegacy: legacyReader(bid()) });
    expect(res.status).toBe("done");
    const src = legacyState() as any;
    for (const t of ["products", "stockMovements", "customers", "sales", "docs", "outbox"]) {
      const pk = t === "outbox" ? "op_id" : "id";
      const stored = await repo.getAll(t as any);
      expect(stored).toHaveLength(src[t].length);
      const byId = new Map(stored.map((r) => [r[pk], r]));
      for (const r of src[t]) expect(canonical(byId.get(r[pk]))).toBe(canonical(r));
    }
    expect(stockTotals(await repo.getAll("stockMovements"))).toEqual({ p1: 7, p2: 7 });
    expect((await repo.get("kv", "meta"))!.value.counters["TRX-260101"]).toBe(1);
    expect(await AsyncStorage.getItem(legacyKey(bid()))).toBe(before);
  });

  it("is idempotent: three runs, no duplicates", async () => {
    const r1 = await migrateLegacy({ repo, readLegacy: legacyReader(bid()) });
    const r2 = await migrateLegacy({ repo, readLegacy: legacyReader(bid()) });
    const r3 = await migrateLegacy({ repo, readLegacy: legacyReader(bid()) });
    expect([r1.status, r2.status, r3.status]).toEqual(["done", "already", "already"]);
    expect(await repo.count("products")).toBe(2);
    expect(await repo.count("stockMovements")).toBe(3);
    expect(await repo.count("outbox")).toBe(1);
  });

  it("rollbackLegacyMigration restores the pre-migration state and allows a clean re-run", async () => {
    await repo.put("customers", { id: "pre", name: "sudah ada", updated_at: T(9) });
    await migrateLegacy({ repo, readLegacy: legacyReader(bid()) });
    expect(await repo.count("customers")).toBe(2);
    const rb = await rollbackLegacyMigration(repo);
    expect(rb.status).toBe("rolledBack");
    expect(await repo.count("products")).toBe(0);
    expect((await repo.getAll("customers")).map((c) => c.id)).toEqual(["pre"]);
    expect(await repo.get("kv", MIGRATION_KEY)).toBeUndefined();
    // legacy data still there -> migration can run again
    const again = await migrateLegacy({ repo, readLegacy: legacyReader(bid()) });
    expect(again.status).toBe("done");
    expect(await repo.count("products")).toBe(2);
  });

  it("failed verification rolls back to the exact previous content", async () => {
    await repo.put("products", { id: "keep", name: "lama", updated_at: T(1) });
    const res = await migrateLegacy({
      repo, readLegacy: legacyReader(bid()),
      afterWrite: async (r) => { await r.delete("stockMovements", "m2"); }, // simulate lost write
    });
    expect(res).toMatchObject({ status: "failed", rolledBack: true });
    expect((await repo.getAll("products")).map((p) => p.id)).toEqual(["keep"]);
    expect(await repo.count("stockMovements")).toBe(0);
  });

  it("rollback with no migration done reports nothing", async () => {
    expect((await rollbackLegacyMigration(repo)).status).toBe("nothing");
  });
});

describe("native multi-user isolation", () => {
  it("opening the owner repo never deletes a staff repo whose name starts with the owner's", async () => {
    const kv = memKV();
    const staff = await createNative("usahora_b1_u2", kv);
    await staff.put("products", { id: "staff-p" });
    staff.close(); // so staffAgain below really reads from storage, not from a shared instance
    await createNative("usahora_b1", kv); // owner opens and runs its cleanup
    const staffAgain = await createNative("usahora_b1_u2", kv);
    expect(await staffAgain.get("products", "staff-p")).toBeTruthy();
  });

  it("still removes its own leftovers from an interrupted commit", async () => {
    const kv = memKV();
    const r = await createNative("usahora_b9", kv);
    await r.put("products", { id: "a" });
    kv.map.set("usahora_v2_usahora_b9_products@orphan", "[]");
    r.close(); // simulated restart: cleanup runs when the database is opened again
    const r2 = await createNative("usahora_b9", kv);
    expect(kv.map.has("usahora_v2_usahora_b9_products@orphan")).toBe(false);
    expect(await r2.get("products", "a")).toBeTruthy();
  });
});
