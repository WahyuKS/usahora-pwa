/// <reference types="jest" />
import "fake-indexeddb/auto";

import { createRepo as createNative, type KV } from "@/src/data/db/repo.native";
import { createRepo as createWeb } from "@/src/data/db/repo.web";
import type { Repo } from "@/src/data/db/types";

const memKV = (): KV & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, get: async (k) => map.get(k) ?? null, multiSet: async (e) => { e.forEach(([k, v]) => map.set(k, v)); }, remove: async (k) => { map.delete(k); } };
};

let n = 0;
const impls: [string, () => Promise<Repo>][] = [
  ["web (IndexedDB)", () => createWeb(`test_web_${++n}`)],
  ["native (key-value)", () => createNative(`test_native_${++n}`, memKV())],
];

describe.each(impls)("repository %s", (_label, make) => {
  let repo: Repo;
  beforeEach(async () => { repo = await make(); });
  afterEach(() => repo.close());

  it("create, read, update, delete", async () => {
    await repo.put("products", { id: "p1", name: "Kopi", sku: "K1", updated_at: "1" });
    expect(await repo.get("products", "p1")).toMatchObject({ name: "Kopi" });
    await repo.put("products", { id: "p1", name: "Kopi Susu", sku: "K1", updated_at: "2" });
    expect(await repo.count("products")).toBe(1); // update, not duplicate
    expect((await repo.get("products", "p1"))!.name).toBe("Kopi Susu");
    await repo.delete("products", "p1");
    expect(await repo.get("products", "p1")).toBeUndefined();
    expect(await repo.count("products")).toBe(0);
  });

  it("bulkPut is idempotent (no duplicates when repeated)", async () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    await repo.bulkPut("customers", rows);
    await repo.bulkPut("customers", rows);
    expect(await repo.count("customers")).toBe(3);
  });

  it("system tables use their own primary keys", async () => {
    await repo.put("outbox", { op_id: "op1", entity: "products", record_id: "p1" });
    await repo.put("kv", { key: "meta", value: { a: 1 } });
    expect(await repo.get("outbox", "op1")).toBeTruthy();
    expect((await repo.get("kv", "meta"))!.value).toEqual({ a: 1 });
  });

  it("transaction commits all writes together", async () => {
    await repo.transaction(["products", "stockMovements"], async (tx) => {
      await tx.put("products", { id: "p1" });
      await tx.put("stockMovements", { id: "m1", product_id: "p1", qty: 5, created_at: "x" });
    });
    expect(await repo.count("products")).toBe(1);
    expect(await repo.count("stockMovements")).toBe(1);
  });

  it("transaction rolls back everything when it fails halfway", async () => {
    await repo.put("products", { id: "keep", name: "lama" });
    await expect(
      repo.transaction(["products", "stockMovements"], async (tx) => {
        await tx.put("products", { id: "keep", name: "baru" });
        await tx.put("stockMovements", { id: "m1", product_id: "keep", qty: 1, created_at: "x" });
        throw new Error("gagal di tengah");
      }),
    ).rejects.toThrow("gagal di tengah");
    expect((await repo.get("products", "keep"))!.name).toBe("lama");
    expect(await repo.count("stockMovements")).toBe(0);
  });

  it("reads inside a transaction see earlier writes of the same transaction", async () => {
    await repo.transaction(["products"], async (tx) => {
      await tx.put("products", { id: "p9", v: 1 });
      expect(await tx.get("products", "p9")).toMatchObject({ v: 1 });
    });
  });
});

describe("repository persistence", () => {
  it("web: data survives closing and reopening the database", async () => {
    const r1 = await createWeb("persist_web");
    await r1.put("products", { id: "p1", name: "Tetap" });
    r1.close();
    const r2 = await createWeb("persist_web");
    expect((await r2.get("products", "p1"))!.name).toBe("Tetap");
    r2.close();
  });

  it("native: data survives a new repo instance and never touches the legacy key", async () => {
    const kv = memKV();
    kv.map.set("usahora_db_biz1", '{"products":[{"id":"legacy"}]}');
    const r1 = await createNative("usahora_biz1", kv);
    await r1.put("products", { id: "p1", name: "Tetap" });
    const r2 = await createNative("usahora_biz1", kv);
    expect((await r2.get("products", "p1"))!.name).toBe("Tetap");
    expect(kv.map.get("usahora_db_biz1")).toBe('{"products":[{"id":"legacy"}]}');
  });
});

