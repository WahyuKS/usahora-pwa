/// <reference types="jest" />
import { cartProfit } from "@/src/lib/profit";

const line = (qty: number, sell: number, cost: number | null, discount = 0) => ({ qty, discount, product: { sell_price: sell, cost_price: cost } });

describe("profit shown while selling (owner view)", () => {
  it("profit = revenue after discounts - cost; margin is profit / revenue (not markup)", () => {
    const r = cartProfit([line(2, 15000, 10000)], 0);
    expect(r).toMatchObject({ revenue: 30000, cost: 20000, profit: 10000, missingCost: 0 });
    expect(r.margin).toBeCloseTo(1 / 3); // markup would be 50%
  });

  it("item and transaction discounts reduce profit", () => {
    expect(cartProfit([line(2, 15000, 10000, 2000)], 3000).profit).toBe(5000);
  });

  it("selling below cost shows a loss", () => {
    expect(cartProfit([line(1, 8000, 10000)], 0).profit).toBe(-2000);
  });

  it("flags products without a cost price (profit would look too high)", () => {
    expect(cartProfit([line(1, 5000, null), line(1, 5000, 0), line(1, 5000, 3000)], 0).missingCost).toBe(2);
  });

  it("empty cart has no margin and no division by zero", () => {
    expect(cartProfit([], 0)).toMatchObject({ revenue: 0, profit: 0, margin: 0 });
  });
});

describe("services in the profit view", () => {
  it("a service without cost is not flagged as missing cost", () => {
    const r = cartProfit([{ qty: 1, discount: 0, product: { sell_price: 800000, cost_price: 0, kind: "jasa" } }], 0);
    expect(r).toMatchObject({ profit: 800000, missingCost: 0 });
  });
});
