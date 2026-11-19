// Pagination shared by every long list (tagihan, riwayat penjualan, keuangan, aktivitas).
import { useMemo, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";

import { Icon, T } from "@/src/components/ui";
import { dayKey, fmtDayLong } from "@/src/lib/format";
import { pageItems } from "@/src/lib/paging";
import { fonts, radius, spacing, useTheme } from "@/src/theme";

export { pageItems };

/** Slices a list into pages; goes back to page 1 when `resetKey` (filters) changes. */
export function usePaged<T>(items: T[], initialSize = 5, resetKey = "") {
  const [page, setPage] = useState(1);
  const [size, setSizeState] = useState(initialSize);
  // Filters changed → back to page 1 (adjusting state during render, no effect needed).
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setPage(1);
  }
  const setSize = (s: number) => {
    setSizeState(s);
    setPage(1);
  };
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, pages);
  const slice = useMemo(() => items.slice((current - 1) * size, current * size), [items, current, size]);
  return { page: current, pages, size, setSize, setPage, slice, total: items.length, from: items.length ? (current - 1) * size + 1 : 0, to: Math.min(current * size, items.length) };
}

export function Pagination({ page, pages, total, from, to, size, onPage, onSize, sizes = [5, 10, 20], testIDPrefix = "page", unit = "data" }: {
  page: number; pages: number; total: number; from: number; to: number; size: number; onPage: (p: number) => void; onSize?: (s: number) => void;
  sizes?: number[]; testIDPrefix?: string; unit?: string;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 480; // phones: arrows only so the bar stays on one line
  if (!total) return null;
  const btn = (key: string, content: React.ReactNode, onPress: () => void, opts: { active?: boolean; disabled?: boolean; wide?: boolean; label?: string } = {}) => (
    <Pressable key={key} testID={`${testIDPrefix}-${key}`} disabled={opts.disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={opts.label ?? `Halaman ${key}`} accessibilityState={{ selected: !!opts.active, disabled: !!opts.disabled }}
      style={({ pressed }) => [{ minWidth: 38, height: 38, paddingHorizontal: opts.wide ? 12 : 0, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4, backgroundColor: opts.active ? colors.chipActiveBg : colors.surface, borderWidth: 1, borderColor: opts.active ? colors.chipActiveBg : colors.border, opacity: opts.disabled ? 0.35 : pressed ? 0.7 : 1 }]}>
      {typeof content === "string" ? <Text style={{ fontFamily: opts.active ? fonts.semibold : fonts.medium, fontSize: 13, color: opts.active ? colors.chipActiveText : colors.onSurface }}>{content}</Text> : content}
    </Pressable>
  );
  return (
    <View testID={`${testIDPrefix}-bar`} style={{ marginTop: spacing.md, gap: spacing.sm, alignItems: "center" }}>
      {pages > 1 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
          {btn("prev", <><Icon name="chevron-left" size={16} color={colors.onSurface} />{compact ? null : <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.onSurface }}>Sebelumnya</Text>}</>, () => onPage(page - 1), { disabled: page <= 1, wide: !compact, label: "Halaman sebelumnya" })}
          {pageItems(page, pages).map((p, i) => (p === "gap" ? <T key={`gap-${i}`} v="caption" style={{ alignSelf: "center", paddingHorizontal: 2 }}>…</T> : btn(String(p), String(p), () => onPage(p), { active: p === page })))}
          {btn("next", <>{compact ? null : <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.onSurface }}>Berikutnya</Text>}<Icon name="chevron-right" size={16} color={colors.onSurface} /></>, () => onPage(page + 1), { disabled: page >= pages, wide: !compact, label: "Halaman berikutnya" })}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap", justifyContent: "center" }}>
        <T v="caption" testID={`${testIDPrefix}-info`}>{from}–{to} dari {total} {unit}</T>
        {onSize ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <T v="caption">· per halaman</T>
            {sizes.map((s) => (
              <Pressable key={s} testID={`${testIDPrefix}-size-${s}`} onPress={() => onSize(s)} hitSlop={6} style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: s === size ? colors.brandTertiary : "transparent" }}>
                <Text style={{ fontFamily: s === size ? fonts.semibold : fonts.regular, fontSize: 12, color: s === size ? colors.brandPrimary : colors.muted }}>{s}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Groups items by Jakarta day (newest first) for date headers in history lists. */
export function groupByDay<T>(items: T[], dateOf: (t: T) => string): { day: string; label: string; items: T[] }[] {
  const out: { day: string; label: string; items: T[] }[] = [];
  for (const it of items) {
    const day = dayKey(dateOf(it));
    const last = out[out.length - 1];
    if (last && last.day === day) last.items.push(it);
    else out.push({ day, label: fmtDayLong(dateOf(it)), items: [it] });
  }
  return out;
}

export function DayHeader({ label, right }: { label: string; right?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name="calendar" size={14} color={colors.muted} />
        <T v="label" color={colors.muted}>{label}</T>
      </View>
      {right ? <T v="label" color={colors.muted}>{right}</T> : null}
    </View>
  );
}
