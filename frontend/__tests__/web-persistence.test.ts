/// <reference types="jest" />
// Web persistence (store.ts ↔ IndexedDB) and the Phase 2 safety rules:
// legacy copy never modified, migrated once, deletions never resurrected, record-level writes,
// fallback to the old storage when IndexedDB is unavailable.
import "fake-indexeddb/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";

import * as repoWeb from "@/src/data/db/repo.web";
import { createRepo } from "@/src/data/db/repo.web";
import { __resetPersistenceForTests, loadState, saveState, storageInfo } from "@/src/data/persistence.web";
import { storage } from "@/src/utils/storage";

let n = 0;
const T = (d: number) => new Date(Date.UTC(2026, 0, d)).toISOString();
const legacy = () => ({
  products: [{ id: "p1", name: "Kopi", created_at: T(1), updated_at: T(1) }, { id: "p2", name: "Teh", created_at: T(2), updated_at: T(2) }],
  stockMovements: [{ id: "m1", product_id: "p1", qty: 10, type: "awal", created_at: T(1), updated_at: T(1) }],
  customers: [{ id: "c1", name: "Budi", created_at: T(1), updated_at: T(1) }],
  suppliers: [], sales: [], payments: [], purchases: [], finance: [], invoices: [], bills: [], docs: [], activities: [],
  outbox: [],
  meta: { counters: { "TRX-260101": 3 } },
});
/** Exactly how the old store.ts wrote it (double JSON encoding). */
const writeLegacy = (bid: string, data: object) => storage.setItem(`usahora_db_${bid}`, JSON.stringify(data));
const restart = () => __resetPersistenceForTests(); // simulates closing and reopening the app

afterEach(restart);

describe("web persistence", () => {
  it("migrates the old localStorage copy once and leaves it untouched", async () => {
    const bid = `b${++n}`;
    await writeLegacy(bid, legacy());
    const before = await AsyncStorage.getItem(`usahora_db_${bid}`);
    const s = (await loadState(bid, ""))!;
    expect(s.products.map((p: any) => p.id)).toEqual(["p2", "p1"]); // newest first, like the old store
    expect(s.stockMovements).toHaveLength(1);
    expect(s.meta.counters["TRX-260101"]).toBe(3);
    expect(await AsyncStorage.getItem(`usahora_db_${bid}`)).toBe(before);
    expect((await storageInfo()).engine).toBe("indexeddb");
  });

  it("saves only changes, and a deleted record never comes back from the old copy", async () => {
    const bid = `b${++n}`;
    await writeLegacy(bid, legacy());
    const s = (await loadState(bid, ""))!;
    const next = { ...s, products: s.products.map((p: any) => (p.id === "p1" ? { ...p, name: "Kopi Susu" } : p)), customers: [] };
    await saveState(bid, "", next);
    restart();
    const again = (await loadState(bid, ""))!;
    expect(again.products.find((p: any) => p.id === "p1").name).toBe("Kopi Susu");
    expect(again.customers).toHaveLength(0); // deleted customer stays deleted
    expect(again.stockMovements).toHaveLength(1);
  });

  it("an old copy changed later (e.g. by an outdated tab) is never merged in again", async () => {
    const bid = `b${++n}`;
    await writeLegacy(bid, legacy());
    const s = (await loadState(bid, ""))!;
    await saveState(bid, "", { ...s, customers: [] });
    await writeLegacy(bid, { ...legacy(), customers: [...legacy().customers, { id: "c9", name: "Baru", created_at: T(5), updated_at: T(5) }] });
    restart();
    const again = (await loadState(bid, ""))!;
    expect(again.customers).toHaveLength(0);
  });

  it("a business without old data starts empty and keeps what it saves", async () => {
    const bid = `b${++n}`;
    expect(await loadState(bid, "")).toBeNull();
    const state = { ...legacy(), products: [{ id: "x", name: "Baru", created_at: T(3) }] };
    await saveState(bid, "", state);
    restart();
    expect((await loadState(bid, ""))!.products.map((p: any) => p.id)).toEqual(["x"]);
  });

  it("writes are record-level: only changed records are written, nothing when nothing changed", async () => {
    const bid = `b${++n}`;
    await writeLegacy(bid, legacy());
    const real = repoWeb.createRepo;
    const written: { table: string; ids: string[] }[] = [];
    let transactions = 0;
    const spy = jest.spyOn(repoWeb, "createRepo").mockImplementation(async (name: string) => {
      const r = await real(name);
      const tx = r.transaction.bind(r);
      r.transaction = ((tables: any, fn: any) => {
        transactions++;
        return tx(tables, (t: any) => fn({ ...t, bulkPut: (table: string, rows: any[]) => { written.push({ table, ids: rows.map((x) => x.id) }); return t.bulkPut(table, rows); } }));
      }) as any;
      return r;
    });
    try {
      const s = (await loadState(bid, ""))!;
      transactions = 0;
      written.length = 0; // ignore the one-time migration done during load
      await saveState(bid, "", s); // nothing changed
      expect(transactions).toBe(0);
      const p1 = s.products.find((p: any) => p.id === "p1");
      await saveState(bid, "", { ...s, products: s.products.map((p: any) => (p === p1 ? { ...p, name: "X" } : p)) });
      expect(transactions).toBe(1);
      expect(written).toEqual([{ table: "products", ids: ["p1"] }]);
    } finally {
      spy.mockRestore();
    }
  });

  it("staff and owner of the same business keep separate databases", async () => {
    const bid = `b${++n}`;
    await saveState(bid, "", { ...legacy(), products: [{ id: "owner", created_at: T(1) }] });
    await saveState(bid, "_staff1", { ...legacy(), products: [{ id: "staff", created_at: T(1) }] });
    restart();
    expect((await loadState(bid, ""))!.products.map((p: any) => p.id)).toEqual(["owner"]);
    expect((await loadState(bid, "_staff1"))!.products.map((p: any) => p.id)).toEqual(["staff"]);
  });

  it("falls back to the old storage (nothing lost) when IndexedDB is unavailable", async () => {
    const bid = `b${++n}`;
    await writeLegacy(bid, legacy());
    const saved = (globalThis as any).indexedDB;
    (globalThis as any).indexedDB = undefined;
    try {
      const s = (await loadState(bid, ""))!;
      expect(s.products).toHaveLength(2);
      expect((await storageInfo()).engine).toBe("localstorage");
      await saveState(bid, "", { ...s, products: [] });
      let raw = JSON.parse((await AsyncStorage.getItem(`usahora_db_${bid}`))!);
      if (typeof raw === "string") raw = JSON.parse(raw);
      expect(raw.products).toHaveLength(0);
    } finally {
      (globalThis as any).indexedDB = saved;
    }
  });
});

describe("M7: two web instances of one database without Web Locks", () => {
  it("read-modify-write transactions do not lose updates", async () => {
    const a = await createRepo("m7_db");
    const b = await createRepo("m7_db");
    await a.put("kv", { key: "n", value: 0 });
    const inc = (r: typeof a) => r.transaction(["kv"], async (tx) => {
      const cur = (await tx.get("kv", "n"))!.value;
      await new Promise((res) => setTimeout(res, 2));
      await tx.put("kv", { key: "n", value: cur + 1 });
    });
    await Promise.all(Array.from({ length: 10 }, (_, i) => inc(i % 2 ? a : b)));
    expect((await a.get("kv", "n"))!.value).toBe(10);
    a.close();
    b.close();
  });
});
