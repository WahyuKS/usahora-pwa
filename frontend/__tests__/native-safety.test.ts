/// <reference types="jest" />
// Regression tests for the Phase 1 review findings on the native (Android/iOS) repository.
import { migrateLegacy, MIGRATION_ERROR_KEY, MIGRATION_KEY } from "@/src/data/db/migrate-legacy";
import { createRepo, StorageReadError, type KV } from "@/src/data/db/repo.native";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

type Flaky = KV & { map: Map<string, string>; failReads: boolean; failWrites: boolean };
const flakyKV = (): Flaky => {
  const kv: Flaky = {
    map: new Map(), failReads: false, failWrites: false,
    get: async (k) => { if (kv.failReads) throw new Error("read error"); return kv.map.get(k) ?? null; },
    multiSet: async (e) => { if (kv.failWrites) throw new Error("disk full"); e.forEach(([k, v]) => kv.map.set(k, v)); },
    remove: async (k) => { kv.map.delete(k); },
    keys: async () => [...kv.map.keys()],
  };
  return kv;
};
/** Read a table the way the repo does: through the manifest. */
const onDisk = (kv: Flaky, name: string, t: string) => {
  const man = JSON.parse(kv.map.get(`usahora_v2_${name}__manifest`) ?? "{}");
  return man[t] ? JSON.parse(kv.map.get(`usahora_v2_${name}_${t}@${man[t]}`) ?? "[]") : [];
};
const seed = (kv: Flaky, name: string, tables: Record<string, any[] | string>) => {
  const man: Record<string, string> = {};
  for (const [t, v] of Object.entries(tables)) { man[t] = "g0"; kv.map.set(`usahora_v2_${name}_${t}@g0`, typeof v === "string" ? v : JSON.stringify(v)); }
  kv.map.set(`usahora_v2_${name}__manifest`, JSON.stringify(man));
};

describe("native repository safety", () => {
  it("a failed read throws and never wipes the table on the next write", async () => {
    const kv = flakyKV();
    seed(kv, "n1", { products: [{ id: "a" }, { id: "b" }] });
    const repo = await createRepo("n1", kv);
    kv.failReads = true;
    await expect(repo.put("products", { id: "c" })).rejects.toBeInstanceOf(StorageReadError);
    kv.failReads = false;
    await repo.put("products", { id: "c" });
    expect(onDisk(kv, "n1", "products").map((r: any) => r.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("corrupted JSON on disk throws instead of being treated as empty", async () => {
    const kv = flakyKV();
    seed(kv, "n2", { products: "{rusak" });
    const repo = await createRepo("n2", kv);
    await expect(repo.getAll("products")).rejects.toBeInstanceOf(StorageReadError);
    expect(kv.map.get("usahora_v2_n2_products@g0")).toBe("{rusak"); // untouched
  });

  it("a multi-table transaction is all-or-nothing when the commit fails", async () => {
    const kv = flakyKV();
    const repo = await createRepo("n3", kv);
    await repo.put("products", { id: "p1", name: "lama" });
    kv.failWrites = true;
    await expect(repo.transaction(["products", "stockMovements"], async (tx) => {
      await tx.put("products", { id: "p1", name: "baru" });
      await tx.put("stockMovements", { id: "m1", product_id: "p1", qty: 3 });
    })).rejects.toThrow("disk full");
    expect(onDisk(kv, "n3", "products")[0].name).toBe("lama");
    expect(onDisk(kv, "n3", "stockMovements")).toHaveLength(0);
  });

  it("a failed write is not visible in later reads (cache updated only after disk)", async () => {
    const kv = flakyKV();
    const repo = await createRepo("n4", kv);
    await repo.put("products", { id: "p1", name: "lama" });
    kv.failWrites = true;
    await expect(repo.put("products", { id: "p1", name: "baru" })).rejects.toThrow();
    await expect(repo.put("products", { id: "p2" })).rejects.toThrow();
    expect((await repo.get("products", "p1"))!.name).toBe("lama");
    expect(await repo.count("products")).toBe(1);
  });

  it("works through the real AsyncStorage code path (default KV)", async () => {
    const repo = await createRepo("n5");
    await repo.transaction(["products", "stockMovements"], async (tx) => {
      await tx.put("products", { id: "p1" });
      await tx.put("stockMovements", { id: "m1", product_id: "p1", qty: 1 });
    });
    repo.refresh();
    expect(await repo.count("products")).toBe(1);
    expect(await repo.count("stockMovements")).toBe(1);
  });
});

describe("native migration safety", () => {
  const blob = (counter: number) => JSON.stringify({
    products: [{ id: "p1", name: "A", updated_at: "2026-01-01T00:00:00.000Z" }],
    stockMovements: [{ id: "m1", product_id: "p1", qty: 4, created_at: "x" }],
    meta: { counters: { "TRX-260101": counter } },
  });

  it("commit failure leaves the new store unchanged and the legacy data untouched", async () => {
    const kv = flakyKV();
    const legacy = blob(1);
    const repo = await createRepo("m1", kv);
    kv.failWrites = true;
    const res = await migrateLegacy({ repo, readLegacy: async () => legacy });
    expect(res.status).toBe("failed");
    expect(onDisk(kv, "m1", "products")).toHaveLength(0);
    kv.failWrites = false;
    expect((await migrateLegacy({ repo, readLegacy: async () => legacy })).status).toBe("done");
    expect(onDisk(kv, "m1", "products")).toHaveLength(1);
  });

  it("verification reads from disk, not from memory", async () => {
    const kv = flakyKV();
    const repo = await createRepo("m2", kv);
    const res = await migrateLegacy({
      repo, readLegacy: async () => blob(1),
      afterWrite: async () => { const man = JSON.parse(kv.map.get("usahora_v2_m2__manifest")!); kv.map.set(`usahora_v2_m2_stockMovements@${man.stockMovements}`, "[]"); }, // disk lost the write
    });
    expect(res.status).toBe("failed");
  });

  it("re-run with newer legacy counters never moves counters backwards", async () => {
    const kv = flakyKV();
    const repo = await createRepo("m3", kv);
    await migrateLegacy({ repo, readLegacy: async () => blob(5) });
    await migrateLegacy({ repo, readLegacy: async () => blob(9) });
    expect((await repo.get("kv", "meta"))!.value.counters["TRX-260101"]).toBe(9);
    await migrateLegacy({ repo, readLegacy: async () => blob(2) });
    expect((await repo.get("kv", "meta"))!.value.counters["TRX-260101"]).toBe(9);
  });

  it("a later failure does not erase the record of an earlier successful migration", async () => {
    const kv = flakyKV();
    const repo = await createRepo("m4", kv);
    await migrateLegacy({ repo, readLegacy: async () => blob(1) });
    await migrateLegacy({ repo, readLegacy: async () => "{rusak" });
    expect((await repo.get("kv", MIGRATION_KEY))!.value.status).toBe("done");
    expect((await repo.get("kv", MIGRATION_ERROR_KEY))!.value.status).toBe("failed");
  });
});

describe("native concurrency and crash recovery", () => {
  it("overlapping saves to the same table are all kept", async () => {
    const kv = flakyKV();
    const repo = await createRepo("c1", kv);
    await Promise.all([repo.put("products", { id: "a" }), repo.put("products", { id: "b" }), repo.bulkPut("products", [{ id: "c" }, { id: "d" }])]);
    expect(onDisk(kv, "c1", "products")).toHaveLength(4);
  });

  it("two sales recorded at the same time both reduce stock (10 -> 8)", async () => {
    const kv = flakyKV();
    const repo = await createRepo("c2", kv);
    await repo.put("stockMovements", { id: "awal", product_id: "p1", qty: 10 });
    const sell = (id: string) => repo.transaction(["sales", "stockMovements"], async (tx) => {
      await tx.put("sales", { id });
      await tx.put("stockMovements", { id: `m-${id}`, product_id: "p1", qty: -1 });
    });
    await Promise.all([sell("s1"), sell("s2")]);
    repo.refresh();
    const moves = await repo.getAll("stockMovements");
    expect(moves.reduce((a, m) => a + m.qty, 0)).toBe(8);
    expect(await repo.count("sales")).toBe(2);
  });

  it("a save made while a transaction is open is not lost", async () => {
    const kv = flakyKV();
    const repo = await createRepo("c3", kv);
    const tx = repo.transaction(["products"], async (t) => { await t.put("products", { id: "fromTx" }); });
    const direct = repo.put("products", { id: "direct" });
    await Promise.all([tx, direct]);
    expect(onDisk(kv, "c3", "products").map((r: any) => r.id).sort()).toEqual(["direct", "fromTx"]);
  });

  it("a save from elsewhere that arrives while a transaction is running is queued, not rejected", async () => {
    const kv = flakyKV();
    const repo = await createRepo("c4", kv);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const tx = repo.transaction(["products"], async (t) => { await t.put("products", { id: "fromTx" }); await gate; });
    const outside = repo.put("products", { id: "outside" }); // arrives during the transaction
    release();
    await Promise.all([tx, outside]);
    expect(onDisk(kv, "c4", "products").map((r: any) => r.id).sort()).toEqual(["fromTx", "outside"]);
  });

  it("a commit interrupted before the manifest switch is never applied, even after restart", async () => {
    const kv = flakyKV();
    const repo = await createRepo("c5", kv);
    await repo.put("stockMovements", { id: "awal", product_id: "p1", qty: 10 });
    const orig = kv.multiSet;
    kv.multiSet = async (e) => { if (e[0][0].endsWith("__manifest")) throw new Error("crash"); return orig(e); };
    await expect(repo.transaction(["sales", "stockMovements"], async (t) => {
      await t.put("sales", { id: "s1" });
      await t.put("stockMovements", { id: "m-s1", product_id: "p1", qty: -1 });
    })).rejects.toThrow("crash");
    kv.multiSet = orig;
    const reopened = await createRepo("c5", kv); // simulated app restart
    expect(await reopened.count("sales")).toBe(0);
    expect((await reopened.getAll("stockMovements")).reduce((a, m) => a + m.qty, 0)).toBe(10);
    expect([...kv.map.keys()].filter((k) => k.includes("sales@"))).toHaveLength(0); // orphan cleaned
  });

  it("refresh during a transaction cannot cause data loss", async () => {
    const kv = flakyKV();
    const repo = await createRepo("c6", kv);
    await repo.put("products", { id: "p1" });
    const tx = repo.transaction(["products"], async (t) => { await t.put("products", { id: "p2" }); });
    const r = repo.refresh();
    await Promise.all([tx, r]);
    expect(await repo.count("products")).toBe(2);
  });

  it("a corrupted manifest gives a clear error", async () => {
    const kv = flakyKV();
    kv.map.set("usahora_v2_c7__manifest", "{rusak");
    await expect(createRepo("c7", kv)).rejects.toBeInstanceOf(StorageReadError);
  });
});
