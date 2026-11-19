/// <reference types="jest" />
// Date filters (single day / range), pagination numbers, and the business logo on documents.
jest.mock("expo-crypto", () => ({ randomUUID: () => require("crypto").randomUUID() }));

import { pageItems } from "@/src/lib/paging";
import { businessLogoSrc, logoImg } from "@/src/lib/docs";
import { inRange, isCustomPeriod, periodDays, periodLabel, rangeOf, samePeriod } from "@/src/lib/format";

describe("custom periods", () => {
  test("single day covers exactly that Jakarta day", () => {
    const r = rangeOf({ from: "2026-03-10", to: "2026-03-10" });
    expect(inRange("2026-03-09T17:00:00.000Z", r)).toBe(true); // 10 Mar 00:00 WIB
    expect(inRange("2026-03-10T16:59:59.000Z", r)).toBe(true); // 10 Mar 23:59 WIB
    expect(inRange("2026-03-09T16:59:59.000Z", r)).toBe(false);
    expect(inRange("2026-03-10T17:00:00.000Z", r)).toBe(false);
  });
  test("range includes both ends", () => {
    const r = rangeOf({ from: "2026-03-01", to: "2026-03-31" });
    expect(inRange("2026-02-28T17:00:00.000Z", r)).toBe(true);
    expect(inRange("2026-03-31T16:00:00.000Z", r)).toBe(true);
    expect(inRange("2026-03-31T17:00:00.000Z", r)).toBe(false);
    expect(periodDays({ from: "2026-03-01", to: "2026-03-31" })).toBe(31);
  });
  test("labels and comparison", () => {
    expect(isCustomPeriod("today")).toBe(false);
    expect(isCustomPeriod({ from: "2026-03-01", to: "2026-03-02" })).toBe(true);
    expect(periodLabel({ from: "2026-03-10", to: "2026-03-10" })).toMatch(/10/);
    expect(periodLabel({ from: "2026-03-01", to: "2026-03-31" })).toMatch(/–|-/);
    expect(samePeriod({ from: "2026-03-01", to: "2026-03-02" }, { from: "2026-03-01", to: "2026-03-02" })).toBe(true);
    expect(samePeriod("today", { from: "2026-03-01", to: "2026-03-01" })).toBe(false);
  });
});

describe("pagination numbers", () => {
  test("few pages are all shown", () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  test("many pages collapse with gaps around the current page", () => {
    expect(pageItems(1, 12)).toEqual([1, 2, "gap", 12]);
    expect(pageItems(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12]);
    expect(pageItems(12, 12)).toEqual([1, "gap", 11, 12]);
  });
});

describe("business logo on documents", () => {
  const base = { id: "b", name: "Toko", address: "", phone: "", email: "", currency: "IDR", invoice_footer: "", tax_enabled: false, tax_rate: 11, bank_info: "" };
  test("uses the logo picked on the device", () => {
    const b = { ...base, logo_data_url: "data:image/png;base64,AAAA" };
    expect(businessLogoSrc(b)).toBe("data:image/png;base64,AAAA");
    expect(logoImg(b)).toContain('src="data:image/png;base64,AAAA"');
  });
  test("no logo → no image (business name is still printed)", () => {
    expect(businessLogoSrc(base)).toBe("");
    expect(logoImg(base)).toBe("");
  });
  test("logo source is escaped", () => {
    expect(logoImg({ ...base, logo_data_url: 'x" onerror="alert(1)' })).not.toContain('" onerror="');
  });
});
