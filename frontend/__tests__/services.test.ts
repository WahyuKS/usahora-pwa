/// <reference types="jest" />
// Services and rentals (kost room per month, per night, per job): sold without stock.
jest.mock("expo-crypto", () => ({ randomUUID: () => require("crypto").randomUUID() }));

import { checkout, saveContact, saveProduct } from "@/src/data/actions";
import { collections, inventoryValue, lowStock, stockMap } from "@/src/data/selectors";
import { getState, loadDB, setSyncQueueEnabled, unloadDB } from "@/src/data/store";
import { addDays, dayKey } from "@/src/lib/format";

let n = 0;
beforeEach(async () => {
  await loadDB(`svc-${++n}`);
  setSyncQueueEnabled(false);
});
afterEach(() => {
  setSyncQueueEnabled(true);
  unloadDB();
});

const room = () => saveProduct({ name: "Kamar A1", kind: "jasa", unit: "bulan", sell_price: 800000, cost_price: 100000, category: "Kost" } as any, 5);

describe("jasa / sewa (no stock)", () => {
  it("can be sold any number of times and creates no stock movement", () => {
    const p = room();
    expect(getState().stockMovements).toHaveLength(0); // initial stock ignored for services
    const sale = checkout({ lines: [{ product: p, qty: 3, discount: 0 }], discount: 0, method: "transfer", received: 2400000, customer_id: null, note: "" });
    expect(sale.total).toBe(2400000);
    expect(sale.cogs).toBe(300000);
    expect(getState().stockMovements).toHaveLength(0);
    expect((sale.items[0] as any).stocked).toBeUndefined(); // internal flag not stored
  });

  it("never shows as low stock and is not part of inventory value", () => {
    room();
    saveProduct({ name: "Sabun", sell_price: 5000, cost_price: 3000, min_stock: 5 } as any, 2);
    expect(lowStock(getState()).map((x) => x.p.name)).toEqual(["Sabun"]);
    expect(inventoryValue(getState())).toBe(6000);
  });

  it("goods still need stock in the same sale", () => {
    const p = room();
    const soap = saveProduct({ name: "Sabun", sell_price: 5000, cost_price: 3000 } as any, 1);
    expect(() => checkout({ lines: [{ product: p, qty: 1, discount: 0 }, { product: soap, qty: 2, discount: 0 }], discount: 0, method: "tunai", received: 900000, customer_id: null, note: "" })).toThrow("Stok Sabun tidak cukup");
    checkout({ lines: [{ product: p, qty: 1, discount: 0 }, { product: soap, qty: 1, discount: 0 }], discount: 0, method: "tunai", received: 805000, customer_id: null, note: "" });
    expect(stockMap(getState())[soap.id]).toBe(0);
  });

  it("kost rent paid later shows up in collections with the promised date", () => {
    const p = room();
    const tenant = saveContact("customers", { name: "Andi (A1)", phone: "081200000001" });
    const promise = addDays(dayKey(), 5);
    checkout({ lines: [{ product: p, qty: 1, discount: 0 }], discount: 0, method: "transfer", received: 300000, customer_id: tenant.id, note: "Sewa Desember", due_date: promise });
    expect(collections(getState()).items[0]).toMatchObject({ due: 500000, promise, status: "later" });
  });
});
