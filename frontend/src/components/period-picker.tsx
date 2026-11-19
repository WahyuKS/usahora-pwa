// One date filter used everywhere (Beranda, riwayat penjualan, keuangan, laporan, aktivitas):
// preset chips + "Pilih tanggal" for a single day or a date range.
import * as Haptics from "expo-haptics";
import { createElement, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Button, Field, Icon, Segment, Sheet, T, useUI } from "@/src/components/ui";
import { addDays, dayKey, isCustomPeriod, isValidDate, PERIODS, periodLabel, samePeriod, type Period, type PresetPeriod } from "@/src/lib/format";
import { fonts, radius, spacing, useTheme } from "@/src/theme";

/** Date field: the browser's calendar on web, a YYYY-MM-DD text field on the native app. */
export function DateInput({ label, value, onChange, testID, max }: { label: string; value: string; onChange: (v: string) => void; testID: string; max?: string }) {
  const { colors, scheme } = useTheme();
  if (Platform.OS !== "web") return <Field label={label} value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" testID={testID} />;
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <T v="label" style={{ marginBottom: 6 }}>{label}</T>
      {createElement("input", {
        type: "date",
        value,
        max,
        "data-testid": testID,
        onChange: (e: any) => onChange(e.target.value),
        style: {
          height: 48, borderRadius: radius.md, border: `1px solid ${colors.border}`, padding: "0 14px", fontSize: 15,
          fontFamily: fonts.regular, color: colors.onSurface, background: colors.surface, colorScheme: scheme, outline: "none", width: "100%", boxSizing: "border-box",
        },
      })}
    </View>
  );
}

type Mode = "single" | "range";

export function PeriodPicker({ value, onChange, presets = ["today", "7d", "month", "year", "all"], testIDPrefix, style }: {
  value: Period; onChange: (p: Period) => void; presets?: PresetPeriod[]; testIDPrefix: string; style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const { toast } = useUI();
  const [open, setOpen] = useState(false);
  const today = dayKey();
  const custom = isCustomPeriod(value) ? value : null;
  const [mode, setMode] = useState<Mode>(custom && custom.from !== custom.to ? "range" : "single");
  const [from, setFrom] = useState(custom?.from ?? today);
  const [to, setTo] = useState(custom?.to ?? today);

  const openSheet = () => {
    const c = isCustomPeriod(value) ? value : null;
    setMode(c && c.from !== c.to ? "range" : "single");
    setFrom(c?.from ?? today);
    setTo(c?.to ?? today);
    setOpen(true);
  };
  const apply = (p?: Period) => {
    const next: Period = p ?? (mode === "single" ? { from, to: from } : { from, to });
    if (isCustomPeriod(next)) {
      if (!isValidDate(next.from) || !isValidDate(next.to)) return toast("Pilih tanggal yang valid", "error");
      if (next.from > next.to) return toast("Tanggal mulai harus sebelum tanggal akhir", "error");
    }
    onChange(next);
    setOpen(false);
  };
  const quick: [string, Period][] = [
    ["Kemarin", { from: addDays(today, -1), to: addDays(today, -1) }],
    ["30 hari terakhir", { from: addDays(today, -29), to: today }],
    ["Bulan lalu", (() => {
      const first = today.slice(0, 8) + "01";
      const lastPrev = addDays(first, -1);
      return { from: lastPrev.slice(0, 8) + "01", to: lastPrev };
    })()],
  ];

  const chip = (key: string, label: string, active: boolean, onPress: () => void, icon?: boolean) => (
    <Pressable key={key} testID={`${testIDPrefix}-${key}`} onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
      style={{ height: 36, flexShrink: 0, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: "center", flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: active ? colors.chipActiveBg : colors.border, backgroundColor: active ? colors.chipActiveBg : colors.surface }}>
      {icon ? <Icon name="calendar" size={14} color={active ? colors.chipActiveText : colors.brandPrimary} /> : null}
      <Text style={{ fontFamily: active ? fonts.semibold : fonts.medium, fontSize: 13, color: active ? colors.chipActiveText : colors.onSurface }}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ height: 56, flexGrow: 0 }, style]} contentContainerStyle={{ gap: spacing.sm, alignItems: "center", paddingHorizontal: spacing.lg }}>
        {chip("custom", custom ? periodLabel(custom) : "Pilih tanggal", !!custom, openSheet, true)}
        {PERIODS.filter((p) => presets.includes(p.key)).map((p) => chip(p.key, p.label, samePeriod(value, p.key), () => onChange(p.key)))}
      </ScrollView>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Pilih tanggal" testID={`${testIDPrefix}-sheet`}
        footer={<Button title="Terapkan" icon="check" onPress={() => apply()} testID={`${testIDPrefix}-apply`} />}>
        <Segment options={[{ key: "single", label: "Satu tanggal" }, { key: "range", label: "Rentang tanggal" }] as { key: Mode; label: string }[]} value={mode} onChange={setMode} testIDPrefix={`${testIDPrefix}-mode`} />
        {mode === "single" ? (
          <DateInput label="Tanggal" value={from} onChange={setFrom} max={today} testID={`${testIDPrefix}-date`} />
        ) : (
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}><DateInput label="Dari" value={from} onChange={setFrom} max={today} testID={`${testIDPrefix}-from`} /></View>
            <View style={{ flex: 1 }}><DateInput label="Sampai" value={to} onChange={setTo} max={today} testID={`${testIDPrefix}-to`} /></View>
          </View>
        )}
        <T v="caption" style={{ marginBottom: spacing.sm }}>Pilihan cepat</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {quick.map(([label, p]) => <Button key={label} size="sm" variant="outline" title={label} onPress={() => apply(p)} testID={`${testIDPrefix}-quick-${label}`} />)}
        </View>
      </Sheet>
    </>
  );
}
