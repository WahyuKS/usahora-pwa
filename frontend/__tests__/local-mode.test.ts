/// <reference types="jest" />
// Local mode (website / PWA without a cloud account): changes are saved but never queued for sync.
jest.mock("expo-crypto", () => ({ randomUUID: () => require("crypto").randomUUID() }));

import { getState, loadDB, remove, setSyncQueueEnabled, unloadDB, upsert } from "@/src/data/store";

describe("store sync queue switch", () => {
  afterEach(() => {
    setSyncQueueEnabled(true);
    unloadDB();
  });

  it("local mode: records are saved, nothing is queued for sync", async () => {
    await loadDB("local-test-1");
    setSyncQueueEnabled(false);
    const p = upsert("products", { name: "Kopi", sell_price: 15000 });
    upsert("products", { id: p.id, name: "Kopi Susu" });
    upsert("customers", { name: "Budi" });
    remove("customers", getState().customers[0].id);
    expect(getState().products).toHaveLength(1);
    expect(getState().products[0].name).toBe("Kopi Susu");
    expect(getState().customers).toHaveLength(0);
    expect(getState().outbox).toHaveLength(0);
  });

  it("cloud mode (default): changes are still queued with unique op ids", async () => {
    await loadDB("cloud-test-1");
    upsert("products", { name: "Teh" });
    upsert("customers", { name: "Sari" });
    const ops = getState().outbox;
    expect(ops).toHaveLength(2);
    expect(new Set(ops.map((o) => o.op_id)).size).toBe(2);
  });
});

describe("merge a backup from another device", () => {
  const T = (d: number) => new Date(Date.UTC(2026, 0, d)).toISOString();
  afterEach(() => {
    setSyncQueueEnabled(true);
    unloadDB();
  });

  it("combines records: adds new, newer edit wins, immutable history is unioned, nothing deleted", async () => {
    const { mergeAll } = require("@/src/data/store");
    await loadDB("local-merge-A");
    setSyncQueueEnabled(false);
    // Device A state
    const base = getState();
    const shared = { id: "p1", name: "Kopi", sell_price: 15000, created_at: T(1), updated_at: T(1) };
    require("@/src/data/store").replaceAll({
      ...base,
      products: [shared, { id: "onlyA", name: "Teh", created_at: T(1), updated_at: T(1) }],
      stockMovements: [{ id: "awal", product_id: "p1", qty: 10, created_at: T(1) }, { id: "saleA", product_id: "p1", qty: -2, created_at: T(2) }],
      meta: { counters: { "TRX-260102": 1 } } as any,
    });
    // Backup from device B (started from A's backup, then sold 3 and renamed the product later)
    const fromB = {
      business_id: "local-other-device",
      products: [{ ...shared, name: "Kopi Susu", updated_at: T(3) }, { id: "onlyB", name: "Roti", created_at: T(2), updated_at: T(2) }],
      stockMovements: [{ id: "awal", product_id: "p1", qty: 10, created_at: T(1) }, { id: "saleB", product_id: "p1", qty: -3, created_at: T(2) }],
      meta: { counters: { "TRX-260102": 4 } },
    };
    const r = mergeAll(fromB);
    const s = getState();
    expect(r).toEqual({ added: 2, updated: 1, unchanged: 1 });
    expect(s.products.map((p: any) => p.id).sort()).toEqual(["onlyA", "onlyB", "p1"]);
    expect(s.products.find((p: any) => p.id === "p1").name).toBe("Kopi Susu");
    const stock = s.stockMovements.filter((m: any) => m.product_id === "p1").reduce((a: number, m: any) => a + m.qty, 0);
    expect(stock).toBe(5); // 10 - 2 (A) - 3 (B), the shared opening stock counted once
    expect(s.meta.counters["TRX-260102"]).toBe(4); // never goes backwards
    expect(s.products.filter((p: any) => p.id !== "onlyA").every((p: any) => p.business_id === "local-merge-A")).toBe(true); // merged records belong to this business
    expect(s.outbox).toHaveLength(0); // local mode: nothing queued

    // Merging the same backup again changes nothing
    expect(mergeAll(fromB)).toEqual({ added: 0, updated: 0, unchanged: 4 });
    expect(getState().stockMovements).toHaveLength(3);
  });

  it("an older edit from the other device does not overwrite a newer local edit", async () => {
    const { mergeAll, replaceAll } = require("@/src/data/store");
    await loadDB("local-merge-B");
    setSyncQueueEnabled(false);
    replaceAll({ ...getState(), customers: [{ id: "c1", name: "Budi (baru)", updated_at: T(5) }] });
    mergeAll({ customers: [{ id: "c1", name: "Budi (lama)", updated_at: T(2) }] });
    expect(getState().customers[0].name).toBe("Budi (baru)");
  });
});
