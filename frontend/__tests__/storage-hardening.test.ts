/// <reference types="jest" />
// Phase 1.1 regression tests: C1 (native concurrency), H1 (web atomicity), H2 (honest timeout),
// M1 (defensive copies), M2 (transaction table scope).
import "fake-indexeddb/auto";

import { createRepo as createNative, type KV } from "@/src/data/db/repo.native";
import { createRepo as createWeb } from "@/src/data/db/repo.web";
import { createSerialQueue, QueueTimeoutError } from "@/src/data/db/serial";
import { ConcurrentModificationError, TransactionScopeError, type Repo } from "@/src/data/db/types";

type Mem = KV & { map: Map<string, string> };
const memKV = (): Mem => {
  const map = new Map<string, string>();
  return {
    map,
    get: async (k) => map.get(k) ?? null,
    multiSet: async (e) => { e.forEach(([k, v]) => map.set(k, v)); },
    remove: async (k) => { map.delete(k); },
    keys: async () => [...map.keys()],
  };
};
/** A second KV object over the SAME storage: simulates an instance that bypasses the registry. */
const sameStorage = (kv: Mem): KV => ({ get: kv.get, multiSet: kv.multiSet, remove: kv.remove, keys: kv.keys });
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

/** Every table in the manifest points at a stored version, and no unreferenced version is left. */
function storageIntegrity(kv: Mem, name: string) {
  const prefix = `usahora_v2_${name}_`;
  const man = JSON.parse(kv.map.get(`${prefix}_manifest`) ?? "{}");
  const missing = Object.entries(man).filter(([t, g]) => !kv.map.has(`${prefix}${t}@${g}`)).map(([t]) => t);
  const live = new Set(Object.entries(man).map(([t, g]) => `${prefix}${t}@${g}`));
  const orphans = [...kv.map.keys()].filter((k) => k.startsWith(prefix) && /^[A-Za-z]+@/.test(k.slice(prefix.length)) && !live.has(k));
  return { missing, orphans };
}

let n = 0;
const platforms: [string, () => Promise<Repo>][] = [
  ["web", () => createWeb(`hard_web_${++n}`)],
  ["native", () => createNative(`hard_native_${++n}`, memKV())],
];

// ---------------------------------------------------------------- C1
describe("C1 native: several instances of the same database", () => {
  it("two instances share one database and see each other's writes", async () => {
    const kv = memKV();
    const a = await createNative("c1a", kv);
    const b = await createNative("c1a", kv);
    await a.put("products", { id: "p1" });
    await b.put("customers", { id: "c1" });
    expect(await b.get("products", "p1")).toBeTruthy();
    expect(await a.get("customers", "c1")).toBeTruthy();
    expect(storageIntegrity(kv, "c1a")).toEqual({ missing: [], orphans: [] });
  });

  it("the exact review scenario no longer loses a table (stale manifest)", async () => {
    const kv = memKV();
    const a = await createNative("c1b", kv);
    await a.put("products", { id: "p0" });
    const b = await createNative("c1b", kv);
    await a.put("products", { id: "p1" });
    await b.put("customers", { id: "c1" });
    a.close(); b.close();
    const c = await createNative("c1b", kv);
    expect((await c.getAll("products")).map((p) => p.id).sort()).toEqual(["p0", "p1"]);
    expect(await c.count("customers")).toBe(1);
    expect(storageIntegrity(kv, "c1b")).toEqual({ missing: [], orphans: [] });
  });

  it("concurrent writes from two instances: nothing lost, no table missing", async () => {
    const kv = memKV();
    const a = await createNative("c1c", kv);
    const b = await createNative("c1c", kv);
    const ops: Promise<unknown>[] = [];
    for (let i = 0; i < 20; i++) {
      ops.push(a.put("products", { id: `a${i}` }));
      ops.push(b.put("products", { id: `b${i}` }));
      ops.push(b.transaction(["stockMovements", "sales"], async (tx) => {
        await tx.put("sales", { id: `s${i}` });
        await tx.put("stockMovements", { id: `m${i}`, product_id: `a${i}`, qty: -1 });
      }));
    }
    await Promise.all(ops);
    a.close(); b.close();
    const c = await createNative("c1c", kv);
    expect(await c.count("products")).toBe(40);
    expect(await c.count("sales")).toBe(20);
    expect(await c.count("stockMovements")).toBe(20);
    expect(storageIntegrity(kv, "c1c")).toEqual({ missing: [], orphans: [] });
  });

  it("opening the database while a write is in progress does not delete that write", async () => {
    const kv = memKV();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let paused = false;
    const slow: Mem = {
      ...kv,
      multiSet: async (e) => {
        await kv.multiSet(e);
        if (!paused && !e[0][0].endsWith("__manifest")) { paused = true; await gate; } // after data, before manifest
      },
    };
    const a = await createNative("c1d", slow);
    const writing = a.put("products", { id: "x" });
    await tick();
    const b = await createNative("c1d", slow); // same storage object: shared instance
    release();
    await writing;
    expect(await b.get("products", "x")).toBeTruthy();
    a.close(); b.close();
    const c = await createNative("c1d", kv);
    expect(await c.get("products", "x")).toBeTruthy();
    expect(storageIntegrity(kv, "c1d")).toEqual({ missing: [], orphans: [] });
  });

  it("re-opening right after close waits for queued work of the old instance", async () => {
    const kv = memKV();
    const a = await createNative("c1e", kv);
    const pending = Promise.all([a.put("products", { id: "1" }), a.put("products", { id: "2" })]);
    a.close();
    const b = await createNative("c1e", kv);
    await pending;
    expect(await b.count("products")).toBe(2);
    expect(storageIntegrity(kv, "c1e")).toEqual({ missing: [], orphans: [] });
  });

  it("deleting old versions never removes an active table (many commits)", async () => {
    const kv = memKV();
    const a = await createNative("c1f", kv);
    for (let i = 0; i < 30; i++) {
      await a.put(i % 2 ? "products" : "customers", { id: `r${i}` });
      expect(storageIntegrity(kv, "c1f")).toEqual({ missing: [], orphans: [] });
    }
  });

  it("closed handle is refused; other handles keep working", async () => {
    const kv = memKV();
    const a = await createNative("c1g", kv);
    const b = await createNative("c1g", kv);
    a.close();
    await expect(a.put("products", { id: "x" })).rejects.toThrow("sudah ditutup");
    await b.put("products", { id: "y" });
    expect(await b.count("products")).toBe(1);
  });

  describe("defence in depth: an instance that bypasses the registry", () => {
    it("a stale writer is refused instead of overwriting the manifest", async () => {
      const kv = memKV();
      const a = await createNative("c1h", kv);
      await a.put("products", { id: "p0" });
      const b = await createNative("c1h", sameStorage(kv)); // separate instance
      await b.getAll("products"); // b caches products
      await a.put("products", { id: "p1" });
      await expect(b.put("products", { id: "fromB" })).rejects.toBeInstanceOf(ConcurrentModificationError);
      await b.put("products", { id: "fromB" }); // retry after refresh of its view succeeds
      a.close(); b.close();
      const c = await createNative("c1h", kv);
      expect((await c.getAll("products")).map((p) => p.id).sort()).toEqual(["fromB", "p0", "p1"]);
      expect(storageIntegrity(kv, "c1h")).toEqual({ missing: [], orphans: [] });
    });

    it("a writer on another table does not point the first table at a deleted version", async () => {
      const kv = memKV();
      const a = await createNative("c1i", kv);
      await a.put("products", { id: "p0" });
      const b = await createNative("c1i", sameStorage(kv));
      await a.put("products", { id: "p1" });
      await b.put("customers", { id: "c1" });
      const c = await createNative("c1i", sameStorage(kv));
      expect((await c.getAll("products")).map((p) => p.id).sort()).toEqual(["p0", "p1"]);
      expect(storageIntegrity(kv, "c1i").missing).toEqual([]);
    });

    it("start-up cleanup skips a commit still in progress elsewhere", async () => {
      const kv = memKV();
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      let paused = false;
      const slow: KV = {
        ...sameStorage(kv),
        multiSet: async (e) => {
          await kv.multiSet(e);
          if (!paused && !e[0][0].endsWith("__manifest")) { paused = true; await gate; }
        },
      };
      const a = await createNative("c1j", slow);
      const writing = a.put("products", { id: "x" });
      await tick();
      await createNative("c1j", sameStorage(kv)); // separate instance runs its cleanup now
      release();
      await writing;
      const c = await createNative("c1j", sameStorage(kv));
      expect(await c.get("products", "x")).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------- H1
describe.each(platforms)("H1 transaction atomicity (%s)", (_p, make) => {
  let repo: Repo;
  beforeEach(async () => { repo = await make(); });
  afterEach(() => repo.close());

  it("awaiting non-database work inside a transaction no longer breaks it", async () => {
    await repo.transaction(["products"], async (tx) => {
      await tx.put("products", { id: "a" });
      await tick();
      await tx.put("products", { id: "b" });
    });
    expect(await repo.count("products")).toBe(2);
  });

  it("no partial write when the callback fails after awaiting other work", async () => {
    await repo.put("products", { id: "keep", v: 1 });
    await expect(repo.transaction(["products", "stockMovements"], async (tx) => {
      await tx.put("products", { id: "keep", v: 2 });
      await tick();
      await tx.put("stockMovements", { id: "m1", product_id: "keep", qty: 1 });
      await tick();
      throw new Error("gagal setelah await");
    })).rejects.toThrow("gagal setelah await");
    expect((await repo.get("products", "keep"))!.v).toBe(1);
    expect(await repo.count("stockMovements")).toBe(0);
  });

  it("reads inside the transaction see staged put/delete/clear", async () => {
    await repo.bulkPut("products", [{ id: "a" }, { id: "b" }]);
    await repo.transaction(["products"], async (tx) => {
      await tx.delete("products", "a");
      expect(await tx.get("products", "a")).toBeUndefined();
      await tx.put("products", { id: "c" });
      expect((await tx.getAll("products")).map((r) => r.id).sort()).toEqual(["b", "c"]);
      await tx.clear("products");
      await tx.put("products", { id: "d" });
      expect((await tx.getAll("products")).map((r) => r.id)).toEqual(["d"]);
    });
    expect((await repo.getAll("products")).map((r) => r.id)).toEqual(["d"]);
  });
});

describe("H1 commit failure is all-or-nothing", () => {
  it("web: IndexedDB rejects one row at commit -> the other staged rows are not written either", async () => {
    const repo = await createWeb("h1_commit_fail");
    await expect(repo.transaction(["products", "customers"], async (tx) => {
      await tx.put("customers", { id: "c-ok" });
      await tx.put("products", { id: "p-ok" });
      await tx.put("products", { id: { bad: "not a valid key" } as any }); // DataError during commit
    })).rejects.toBeTruthy();
    expect(await repo.get("products", "p-ok")).toBeUndefined();
    expect(await repo.get("customers", "c-ok")).toBeUndefined();
    repo.close();
  });

  it("native: storage write fails at commit -> no table changes", async () => {
    const kv = memKV();
    const repo = await createNative("h1_commit_fail", kv);
    await repo.put("products", { id: "keep" });
    const orig = kv.multiSet;
    kv.multiSet = async () => { throw new Error("disk penuh"); };
    await expect(repo.transaction(["products", "customers"], async (tx) => {
      await tx.put("customers", { id: "c-ok" });
      await tick();
      await tx.put("products", { id: "p-ok" });
    })).rejects.toThrow("disk penuh");
    kv.multiSet = orig;
    expect(await repo.count("products")).toBe(1);
    expect(await repo.count("customers")).toBe(0);
  });
});

// ---------------------------------------------------------------- H2
describe("H2 honest timeout", () => {
  afterEach(() => jest.useRealTimers());

  it("queue: a timed-out operation is never executed, a started one is never timed out", async () => {
    jest.useFakeTimers();
    const q = createSerialQueue(1000);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const ran: string[] = [];
    const long = q.run(async () => { ran.push("long"); await gate; return "long-ok"; });
    const late = q.run(async () => { ran.push("late"); return "late-ok"; });
    const lateErr = late.catch((e) => e);
    await jest.advanceTimersByTimeAsync(5000); // long runs for 5 s: longer than the limit
    expect(await lateErr).toBeInstanceOf(QueueTimeoutError);
    release();
    expect(await long).toBe("long-ok"); // started before the limit: real result, not a timeout
    await jest.advanceTimersByTimeAsync(10);
    expect(ran).toEqual(["long"]); // "late" never ran
  });

  it("native: a write reported as timed out is not applied, and a retry writes exactly once", async () => {
    jest.useFakeTimers();
    const kv = memKV();
    const repo = await createNative("h2", kv);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    // Non-idempotent operation: appends a movement with a fresh id each time it runs.
    let seq = 0;
    const addMovement = () => repo.transaction(["stockMovements"], async (tx) => {
      await tx.put("stockMovements", { id: `mv${++seq}`, product_id: "p1", qty: -1 });
    });
    const blocker = repo.transaction(["products"], async (tx) => { await tx.put("products", { id: "p1" }); await gate; });
    const first = addMovement().catch((e) => e);
    await jest.advanceTimersByTimeAsync(16000);
    expect(await first).toBeInstanceOf(QueueTimeoutError);
    release();
    await blocker;
    await jest.advanceTimersByTimeAsync(10);
    jest.useRealTimers();
    expect(await repo.count("stockMovements")).toBe(0); // not silently applied later
    await addMovement(); // caller retries
    const moves = await repo.getAll("stockMovements");
    expect(moves).toHaveLength(1); // no duplicate
    expect(moves.reduce((a, m) => a + m.qty, 0)).toBe(-1);
  });

  it("calling the repo inside its own transaction fails fast-ish and is not executed", async () => {
    jest.useFakeTimers();
    const repo = await createNative("h2b", memKV());
    const res = repo.transaction(["products"], async (tx) => {
      await tx.put("products", { id: "inTx" });
      await repo.put("products", { id: "nested" }); // wrong usage: waits behind itself
    }).catch((e) => e);
    await jest.advanceTimersByTimeAsync(16000);
    expect(await res).toBeInstanceOf(QueueTimeoutError);
    jest.useRealTimers();
    expect(await repo.count("products")).toBe(0); // whole transaction rejected, nested never ran
  });
});

// ---------------------------------------------------------------- M1
describe.each(platforms)("M1 rows are copies (%s)", (_p, make) => {
  let repo: Repo;
  beforeEach(async () => { repo = await make(); });
  afterEach(() => repo.close());

  it("changing an object from get() without put() changes nothing", async () => {
    await repo.put("products", { id: "p", name: "asli", tags: ["a"] });
    const got = (await repo.get("products", "p"))!;
    got.name = "diubah";
    got.tags.push("b");
    expect(await repo.get("products", "p")).toEqual({ id: "p", name: "asli", tags: ["a"] });
  });

  it("changing objects from getAll() changes nothing", async () => {
    await repo.put("products", { id: "p", name: "asli" });
    (await repo.getAll("products"))[0].name = "diubah";
    expect((await repo.get("products", "p"))!.name).toBe("asli");
  });

  it("changing the input object after put() changes nothing", async () => {
    const row = { id: "p", name: "asli" };
    await repo.put("products", row);
    row.name = "diubah";
    expect((await repo.get("products", "p"))!.name).toBe("asli");
  });

  it("objects read or written inside a transaction are copies too", async () => {
    const row = { id: "p", name: "asli" };
    await repo.transaction(["products"], async (tx) => {
      await tx.put("products", row);
      row.name = "diubah-input";
      (await tx.get("products", "p"))!.name = "diubah-baca";
    });
    expect((await repo.get("products", "p"))!.name).toBe("asli");
  });
});

// ---------------------------------------------------------------- M2
describe.each(platforms)("M2 transaction table scope (%s)", (_p, make) => {
  let repo: Repo;
  beforeEach(async () => { repo = await make(); });
  afterEach(() => repo.close());

  it("writing to an undeclared table is refused and nothing is written", async () => {
    const res = repo.transaction(["products"], async (tx) => {
      await tx.put("products", { id: "p" });
      await tx.put("customers", { id: "c" });
    });
    await expect(res).rejects.toBeInstanceOf(TransactionScopeError);
    expect(await repo.count("products")).toBe(0);
    expect(await repo.count("customers")).toBe(0);
  });

  it("reading an undeclared table is refused", async () => {
    await expect(repo.transaction(["products"], (tx) => tx.getAll("customers"))).rejects.toBeInstanceOf(TransactionScopeError);
  });

  it("declared tables work normally", async () => {
    await repo.transaction(["products", "customers"], async (tx) => {
      await tx.put("products", { id: "p" });
      await tx.put("customers", { id: "c" });
    });
    expect(await repo.count("products")).toBe(1);
    expect(await repo.count("customers")).toBe(1);
  });
});
