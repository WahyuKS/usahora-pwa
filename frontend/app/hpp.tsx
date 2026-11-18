import { useMemo, useState } from "react";
import { View } from "react-native";

import { Card, Divider, Field, Screen, SectionTitle, T } from "@/src/components/ui";
import { pct, rp, toNum } from "@/src/lib/format";
import { spacing, useTheme } from "@/src/theme";

export default function HPP() {
  const { colors } = useTheme();
  const [f, setF] = useState({ buy: "", ship: "", pack: "", ops: "", extra: "", qty: "", margin: "30" });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const r = useMemo(() => {
    const total = toNum(f.buy) + toNum(f.ship) + toNum(f.pack) + toNum(f.ops) + toNum(f.extra);
    const qty = toNum(f.qty);
    const m = toNum(f.margin);
    const marginErr = m < 0 || m >= 100 ? "Target margin harus antara 0% dan di bawah 100%" : null;
    const hpp = qty > 0 ? total / qty : 0;
    const price = qty > 0 && !marginErr ? hpp / (1 - m / 100) : 0; // margin is on selling price (not markup)
    return { total, qty, hpp, price, profit: price - hpp, markup: hpp > 0 ? ((price - hpp) / hpp) * 100 : 0, marginErr, m };
  }, [f]);
  const sims = [10, 20, 30, 40, 50].map((m) => ({ m, price: r.hpp / (1 - m / 100) }));

  return (
    <Screen title="Kalkulator HPP" subtitle="Hitung modal per unit dan harga jual" testID="hpp-screen">
      <Card>
        <Field money label="Total harga beli barang" value={f.buy} onChangeText={set("buy")} placeholder="0" testID="hpp-buy-input" />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}><Field money label="Ongkos kirim" value={f.ship} onChangeText={set("ship")} placeholder="0" testID="hpp-ship-input" /></View>
          <View style={{ flex: 1 }}><Field money label="Packaging" value={f.pack} onChangeText={set("pack")} placeholder="0" testID="hpp-pack-input" /></View>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}><Field money label="Biaya operasional" value={f.ops} onChangeText={set("ops")} placeholder="0" testID="hpp-ops-input" /></View>
          <View style={{ flex: 1 }}><Field money label="Biaya tambahan" value={f.extra} onChangeText={set("extra")} placeholder="0" testID="hpp-extra-input" /></View>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}><Field label="Jumlah barang (unit)" value={f.qty} onChangeText={set("qty")} keyboardType="decimal-pad" placeholder="0" testID="hpp-qty-input" /></View>
          <View style={{ flex: 1 }}><Field label="Target margin (%)" value={f.margin} onChangeText={set("margin")} keyboardType="decimal-pad" error={r.marginErr} testID="hpp-margin-input" /></View>
        </View>
      </Card>
      <SectionTitle title="Hasil" />
      <Card testID="hpp-result">
        {r.marginErr ? <T v="caption" color={colors.error}>{r.marginErr}</T> : [["Total modal", rp(r.total), "hpp-total"], ["HPP per unit", rp(r.hpp), "hpp-per-unit"], ["Harga jual rekomendasi", rp(Math.ceil(r.price)), "hpp-price"], ["Estimasi laba per unit", rp(r.profit), "hpp-profit"], ["Margin (dari harga jual)", pct(r.marginErr ? 0 : r.m), "hpp-margin"], ["Markup (dari HPP)", pct(r.markup), "hpp-markup"]].map(([l, v, id], i) => (
          <View key={id}>
            {i ? <Divider /> : null}
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.md }}>
              <T v="body" color={colors.muted}>{l}</T>
              <T v="label" weight={i === 2 ? "bold" : "semibold"} color={i === 2 ? colors.brandPrimary : undefined} testID={id}>{v}</T>
            </View>
          </View>
        ))}
        {r.qty <= 0 ? <T v="caption" color={colors.warningText}>Isi jumlah barang untuk menghitung HPP per unit.</T> : null}
      </Card>
      <T v="caption" style={{ marginTop: spacing.sm }}>Rumus: HPP per unit = total biaya ÷ jumlah unit. Harga jual = HPP ÷ (1 − margin). Margin dihitung dari harga jual, berbeda dengan markup yang dihitung dari HPP.</T>
      {r.hpp > 0 && !r.marginErr ? (
        <>
          <SectionTitle title="Simulasi harga jual" />
          <Card style={{ paddingVertical: spacing.xs }} testID="hpp-simulation">
            {sims.map((s, i) => (
              <View key={s.m}>
                {i ? <Divider /> : null}
                <View style={{ flexDirection: "row", paddingVertical: spacing.md }}>
                  <T v="label" style={{ width: 90 }}>Margin {s.m}%</T>
                  <T v="label" weight="semibold" style={{ flex: 1, textAlign: "right" }}>{rp(Math.ceil(s.price))}</T>
                  <T v="caption" style={{ width: 120, textAlign: "right" }}>laba {rp(s.price - r.hpp)}</T>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
