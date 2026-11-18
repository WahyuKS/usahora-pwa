/// <reference types="jest" />
import "fake-indexeddb/auto";

import { canonical, migrateLegacy, MIGRATION_ERROR_KEY, MIGRATION_KEY } from "@/src/data/db/migrate-legacy";
import { createRepo as createNative, type KV } from "@/src/data/db/repo.native";
import { createRepo as createWeb } from "@/src/data/db/repo.web";
import type { Repo } from "@/src/data/db/types";

const memKV = (): KV => {
  const map = new Map<string, string>();
  return { get: async (k) => map.get(k) ?? null, multiSet: async (e) => { e.forEach(([k, v]) => map.set(k, v)); }, remove: async (k) => { map.delete(k); } };
};

/** A realistic legacy blob, shaped exactly like the current store.ts DBState. */
function legacyBlob(extra: Record<string, any> = {}) {
  return {
    products: [
      { id: "p1", name: "Kopi Susu", sku: "K1", barcode: "899", category: "Minuman", cost_price: 9000, sell_price: 18000, min_stock: 5, unit: "pcs", archived: false, created_at: "2026-01-01", updated_at: "2026-01-02" },
      { id: "p2", name: "Teh", sku: "T1", barcode: "", category: "Minuman", cost_price: 2000, sell_price: 5000, min_stock: 5, unit: "pcs", archived: true, created_at: "2026-01-01", updated_at: "2026-01-01" },
    ],
    stockMovements: [
      { id: "m1", product_id: "p1", type: "awal", qty: 40, note: "Stok awal", created_at: "2026-01-01", updated_at: "2026-01-01" },
      { id: "m2", product_id: "p1", type: "penjualan", qty: -2, note: "", ref_id: "s1", created_at: "2026-01-03", updated_at: "2026-01-03" },
    ],
    customers: [{ id: "c1", name: "Budi", phone: "0812", email: "", address: "", notes: "", created_at: "x", updated_at: "x" }],
    suppliers: [],
    sales: [{ id: "s1", number: "TRX-1", customer_id: null, items: [{ product_id: "p1", name: "Kopi Susu", qty: 2, price: 18000, cost: 9000, discount: 0 }], subtotal: 36000, discount: 0, total: 36000, cogs: 18000, method: "tunai", received: 40000, change: 4000, note: "", created_at: "2026-01-03", updated_at: "2026-01-03" }],
    payments: [{ id: "pay1", sale_id: "s1", amount: 36000, method: "tunai", created_at: "2026-01-03", updated_at: "2026-01-03" }],
    purchases: [], finance: [], invoices: [], bills: [],
    docs: [{ id: "tpl-sop-toko", title: "SOP", category: "SOP", content: "isi", created_at: "x", updated_at: "x" }],
    activities: [],
    outbox: [{ op_id: "op1", entity: "products", record_id: "p1", action: "upsert", payload: {}, base_updated_at: null, created_at: "x", attempts: 0 }],
    meta: { counters: { "TRX-260103": 1 }, conflicts: [], lastSyncAt: null, demo: false },
    ...extra,
  };
}

let n = 0;
const impls: [string, () => Promise<Repo>][] = [
  ["web", () => createWeb(`mig_web_${++n}`)],
  ["native", () => createNative(`mig_native_${++n}`, memKV())],
];

describe.each(impls)("legacy migration (%s)", (_l, make) => {
  let repo: Repo;
  beforeEach(async () => { repo = await make(); });
  afterEach(() => repo.close());

  it("does nothing when there is no legacy data", async () => {
    expect(await migrateLegacy({ repo, readLegacy: async () => null })).toEqual({ status: "nothing" });
  });

  it("copies every record with identical content and verifies counts", async () => {
    const blob = legacyBlob();
    const raw = JSON.stringify(blob);
    const res = await migrateLegacy({ repo, readLegacy: async () => raw });
    expect(res.status).toBe("done");
    if (res.status !== "done") return;
    for (const t of ["products", "stockMovements", "customers", "sales", "payments", "docs", "outbox"] as const) {
      expect(await repo.count(t)).toBe((blob as any)[t].length);
      expect(res.tables[t].verified).toBe(true);
    }
    expect(canonical(await repo.get("products", "p1"))).toBe(canonical(blob.products[0]));
    expect((await repo.get("kv", "meta"))!.value).toEqual(blob.meta);
    // stock integrity: sum of movements unchanged (40 - 2 = 38)
    const moves = await repo.getAll("stockMovements");
    expect(moves.reduce((a, m) => a + m.qty, 0)).toBe(38);
  });

  it("leaves the legacy source untouched", async () => {
    const raw = JSON.stringify(legacyBlob());
    let source = raw;
    await migrateLegacy({ repo, readLegacy: async () => source });
    expect(source).toBe(raw);
  });

  it("is idempotent: running again creates no duplicates", async () => {
    const raw = JSON.stringify(legacyBlob());
    await migrateLegacy({ repo, readLegacy: async () => raw });
    const second = await migrateLegacy({ repo, readLegacy: async () => raw });
    expect(second.status).toBe("already");
    expect(await repo.count("products")).toBe(2);
    expect(await repo.count("stockMovements")).toBe(2);
  });

  it("re-running with changed legacy data still creates no duplicates", async () => {
    await migrateLegacy({ repo, readLegacy: async () => JSON.stringify(legacyBlob()) });
    const changed = legacyBlob();
    changed.products.push({ ...changed.products[0], id: "p3", sku: "K3" });
    const res = await migrateLegacy({ repo, readLegacy: async () => JSON.stringify(changed) });
    expect(res.status).toBe("done");
    expect(await repo.count("products")).toBe(3);
  });

  it("removes duplicate ids inside the legacy data, keeping the newest", async () => {
    const blob = legacyBlob();
    blob.products.push({ ...blob.products[0], name: "Versi Baru", updated_at: "2026-02-01" });
    blob.products.push({ ...blob.products[0], name: "Versi Lama", updated_at: "2025-12-01" });
    const res = await migrateLegacy({ repo, readLegacy: async () => JSON.stringify(blob) });
    expect(res.status).toBe("done");
    if (res.status === "done") expect(res.tables.products.duplicatesInSource).toBe(2);
    expect(await repo.count("products")).toBe(2);
    expect((await repo.get("products", "p1"))!.name).toBe("Versi Baru");
  });

  it("never overwrites a newer record already in the new database", async () => {
    await repo.put("products", { id: "p1", name: "Sudah diedit", updated_at: "2099-01-01" });
    const res = await migrateLegacy({ repo, readLegacy: async () => JSON.stringify(legacyBlob()) });
    expect(res.status).toBe("done");
    if (res.status === "done") expect(res.tables.products.keptNewer).toBe(1);
    expect((await repo.get("products", "p1"))!.name).toBe("Sudah diedit");
  });

  it("fails safely on corrupted JSON and writes no records", async () => {
    const res = await migrateLegacy({ repo, readLegacy: async () => "{rusak" });
    expect(res.status).toBe("failed");
    expect(await repo.count("products")).toBe(0);
    expect((await repo.get("kv", MIGRATION_ERROR_KEY))!.value.status).toBe("failed");
  });

  it("fails safely when a table is not a list or a row has no id", async () => {
    expect((await migrateLegacy({ repo, readLegacy: async () => JSON.stringify(legacyBlob({ products: "x" })) })).status).toBe("failed");
    expect((await migrateLegacy({ repo, readLegacy: async () => JSON.stringify(legacyBlob({ customers: [{ name: "tanpa id" }] })) })).status).toBe("failed");
    expect(await repo.count("products")).toBe(0);
  });

  it("rolls back to the previous state when verification fails", async () => {
    await repo.put("products", { id: "existing", name: "Data sebelum migrasi", updated_at: "1" });
    const res = await migrateLegacy({
      repo,
      readLegacy: async () => JSON.stringify(legacyBlob()),
      afterWrite: async (r) => { await r.delete("stockMovements", "m1"); }, // simulate a lost write
    });
    expect(res.status).toBe("failed");
    if (res.status === "failed") expect(res.rolledBack).toBe(true);
    expect(await repo.count("products")).toBe(1);
    expect((await repo.get("products", "existing"))!.name).toBe("Data sebelum migrasi");
    expect(await repo.count("stockMovements")).toBe(0);
  });

  it("can succeed on a later attempt after a failed one", async () => {
    await migrateLegacy({ repo, readLegacy: async () => "{rusak" });
    const res = await migrateLegacy({ repo, readLegacy: async () => JSON.stringify(legacyBlob()) });
    expect(res.status).toBe("done");
    expect(await repo.count("products")).toBe(2);
  });
});
