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
