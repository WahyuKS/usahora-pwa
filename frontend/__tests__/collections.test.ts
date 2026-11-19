/// <reference types="jest" />
// Piutang: partial payment, promise-to-pay date, what to collect today, updated promises.
jest.mock("expo-crypto", () => ({ randomUUID: () => require("crypto").randomUUID() }));

import { addSalePayment, checkout, saveContact, saveProduct, setPromiseDate } from "@/src/data/actions";
import { collections } from "@/src/data/selectors";
import { getState, loadDB, setSyncQueueEnabled, unloadDB } from "@/src/data/store";
import { addDays, dayKey } from "@/src/lib/format";

let n = 0;
beforeEach(async () => {
  await loadDB(`coll-${++n}`);
  setSyncQueueEnabled(false);
});
afterEach(() => {
  setSyncQueueEnabled(true);
  unloadDB();
});

const setup = () => {
  const p = saveProduct({ name: "Kopi", category: "Minuman", cost_price: 10000, sell_price: 20000, min_stock: 1, unit: "pcs" } as any, 50);
  const c = saveContact("customers", { name: "Bu Sari", phone: "081234567890" });
  return { p, c };
};
const sell = (p: any, qty: number, received: number, customer_id: string | null, due_date: string | null) =>
  checkout({ lines: [{ product: p, qty, discount: 0 }], discount: 0, method: "tunai", received, customer_id, note: "", due_date });

describe("piutang with promise to pay", () => {
  it("partial payment records what was paid and the promised date", () => {
    const { p, c } = setup();
    const promise = addDays(dayKey(), 7);
    const sale = sell(p, 3, 20000, c.id, promise); // total 60.000, paid 20.000
    expect(sale.due_date).toBe(promise);
    const col = collections(getState());
    expect(col.items).toHaveLength(1);
    expect(col.items[0]).toMatchObject({ due: 40000, promise, status: "later" });
    expect(col.total).toBe(40000);
  });

  it("'belum bayar' (nothing paid) is a full receivable", () => {
    const { p, c } = setup();
    sell(p, 2, 0, c.id, addDays(dayKey(), 1));
    expect(collections(getState()).items[0]).toMatchObject({ due: 40000, status: "soon" });
  });

  it("debt without a customer is refused", () => {
    const { p } = setup();
    expect(() => sell(p, 1, 0, null, addDays(dayKey(), 1))).toThrow("Pilih pelanggan");
  });

  it("a fully paid sale keeps no promise date and is not in collections", () => {
    const { p, c } = setup();
    const s = sell(p, 1, 20000, c.id, addDays(dayKey(), 3));
    expect(s.due_date).toBeNull();
    expect(collections(getState()).items).toHaveLength(0);
  });

  it("sorts late first, then today, and totals what must be collected today", () => {
    const { p, c } = setup();
    const today = dayKey();
    sell(p, 1, 0, c.id, addDays(today, 10)); // later
    sell(p, 1, 0, c.id, today); // today
    sell(p, 1, 0, c.id, addDays(today, -4)); // 4 days late
    sell(p, 1, 0, c.id, null); // no promise
    const col = collections(getState(), today);
    expect(col.items.map((i) => i.status)).toEqual(["late", "today", "none", "later"]);
    expect(col.items[0].daysLate).toBe(4);
    expect(col.urgent).toHaveLength(2);
    expect(col.urgentTotal).toBe(40000);
  });

  it("changing the promise date updates collections without editing the sale", () => {
    const { p, c } = setup();
    const today = dayKey();
    const s = sell(p, 1, 0, c.id, addDays(today, -2));
    expect(collections(getState()).items[0].status).toBe("late");
    setPromiseDate(s.id, addDays(today, 5));
    expect(collections(getState()).items[0]).toMatchObject({ status: "later", promise: addDays(today, 5) });
    expect(getState().sales.find((x: any) => x.id === s.id).due_date).toBe(addDays(today, -2)); // sale unchanged
    expect(() => setPromiseDate(s.id, "besok")).toThrow("tidak valid");
  });

  it("paying the rest removes it from collections", () => {
    const { p, c } = setup();
    const s = sell(p, 2, 10000, c.id, dayKey());
    addSalePayment(s.id, 30000, "transfer");
    expect(collections(getState()).items).toHaveLength(0);
  });
});
