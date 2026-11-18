/// <reference types="jest" />
import "fake-indexeddb/auto";

// @ts-ignore -- Node built-in, only used by this optional Jest check
import { readFileSync } from "fs";

import { canonical, migrateLegacy } from "@/src/data/db/migrate-legacy";
import { createRepo as createWeb } from "@/src/data/db/repo.web";

// Optional check against a real legacy database exported from the running app.
// Run with: LEGACY_FILE=/path/to/legacy.json npx jest real-data
const file = process.env.LEGACY_FILE;
const maybe = file ? it : it.skip;

maybe("migrates a real legacy database with matching counts, content and stock totals", async () => {
  const raw = readFileSync(file!, "utf8");
  let blob = JSON.parse(raw);
  if (typeof blob === "string") blob = JSON.parse(blob); // value copied straight from storage is double-encoded
  const repo = await createWeb("real_data_check");
  const res = await migrateLegacy({ repo, readLegacy: async () => raw });
  expect(res.status).toBe("done");
  const summary: Record<string, string> = {};
  for (const [t, list] of Object.entries(blob)) {
    if (!Array.isArray(list)) continue;
    const pk = t === "outbox" ? "op_id" : "id";
    const unique = new Map((list as any[]).map((r) => [r[pk], r]));
    const stored = await repo.getAll(t as any);
    expect(stored.length).toBe(unique.size);
    const storedMap = new Map(stored.map((r) => [r[pk], r]));
    for (const [id, r] of unique) expect(canonical(storedMap.get(id))).toBe(canonical(r));
    summary[t] = `${list.length} -> ${stored.length}`;
  }
  const sum = (rows: any[]) => rows.reduce((m: Record<string, number>, x) => ({ ...m, [x.product_id]: (m[x.product_id] ?? 0) + x.qty }), {});
  expect(sum(await repo.getAll("stockMovements"))).toEqual(sum(blob.stockMovements ?? []));
  // second run must be a no-op
  expect((await migrateLegacy({ repo, readLegacy: async () => raw })).status).toBe("already");
  console.log("REAL DATA MIGRATION", JSON.stringify(summary));
  repo.close();
});
