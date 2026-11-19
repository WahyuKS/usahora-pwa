// Owner view: profit of a sale while it is being made. Margin = profit / selling price (not markup).
export type ProfitLine = { qty: number; discount: number; product: { sell_price: number; cost_price?: number | null } };

export function cartProfit(lines: ProfitLine[], transactionDiscount: number) {
  const revenue = Math.max(0, lines.reduce((a, l) => a + l.qty * l.product.sell_price - l.discount, 0) - transactionDiscount);
  const cost = lines.reduce((a, l) => a + l.qty * (Number(l.product.cost_price) || 0), 0);
  const profit = revenue - cost;
  const missingCost = lines.filter((l) => !(Number(l.product.cost_price) > 0)).length;
  return { revenue, cost, profit, margin: revenue > 0 ? profit / revenue : 0, missingCost };
}

export const pct = (x: number) => `${(Math.round(x * 1000) / 10).toLocaleString("id-ID")}%`;
