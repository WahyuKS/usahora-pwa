// Design tokens for USAHORA. Two palettes (light + dark) with the same keys; components only use
// tokens, so the whole app switches between them. USAHORA blue stays the brand colour.
//
// Look: calm, premium "product" feel. Ink-black text on a cool off-white canvas in light mode; a
// soft graphite (not pure black) canvas in dark mode so it is easy on the eyes at night.
import { useMemo, useSyncExternalStore } from "react";
import { StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";
export type ThemePreference = ColorScheme | "system";

const light = {
  surface: "#FFFFFF",
  onSurface: "#0A0C10",
  surfaceSecondary: "#F6F7F9",
  onSurfaceSecondary: "#0A0C10",
  surfaceTertiary: "#EFF1F5",
  onSurfaceTertiary: "#0A0C10",
  surfaceInverse: "#0A0F1E",
  onSurfaceInverse: "#FFFFFF",
  muted: "#5D6576",

  brand: "#2563EB",
  onBrand: "#FFFFFF",
  brandPrimary: "#2563EB",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#E0E8FF",
  onBrandSecondary: "#1D3FA8",
  brandTertiary: "#EEF3FF",
  onBrandTertiary: "#2563EB",

  success: "#0E9F6E",
  onSuccess: "#FFFFFF",
  successSoft: "#E6F6EF",
  warning: "#F59E0B",
  onWarning: "#FFFFFF",
  warningSoft: "#FFF4DE",
  warningText: "#A15C07",
  error: "#E5484D",
  onError: "#FFFFFF",
  errorSoft: "#FDEBEC",
  info: "#2563EB",
  onInfo: "#FFFFFF",

  border: "#E6E8EE",
  borderStrong: "#D4D8E1",
  divider: "#ECEEF2",
  overlay: "rgba(10,12,16,0.45)",
  shadow: "#0A0F1E",
  /** Card shadow strength (0 in dark mode: elevation is shown with borders and tone instead). */
  shadowOpacity: 0.06,
  /** Selected chip: ink pill. */
  chipActiveBg: "#0A0C10",
  chipActiveText: "#FFFFFF",
};

export type ThemeColors = typeof light;

const dark: ThemeColors = {
  surface: "#141821",
  onSurface: "#E9ECF2",
  surfaceSecondary: "#0C0F15",
  onSurfaceSecondary: "#E9ECF2",
  surfaceTertiary: "#1C212D",
  onSurfaceTertiary: "#E9ECF2",
  surfaceInverse: "#1B2236",
  onSurfaceInverse: "#FFFFFF",
  muted: "#8D96A8",

  brand: "#5B8CFF",
  onBrand: "#FFFFFF",
  brandPrimary: "#4F7DFF",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#1D2A4D",
  onBrandSecondary: "#C9D7FF",
  brandTertiary: "#172039",
  onBrandTertiary: "#9DB8FF",

  success: "#3DD68C",
  onSuccess: "#06130C",
  successSoft: "#10281D",
  warning: "#F5B83D",
  onWarning: "#1A1204",
  warningSoft: "#2A2213",
  warningText: "#F5C76A",
  error: "#FF6B6B",
  onError: "#1A0606",
  errorSoft: "#2D1719",
  info: "#5B8CFF",
  onInfo: "#FFFFFF",

  border: "#242A38",
  borderStrong: "#323A4C",
  divider: "#1E2430",
  overlay: "rgba(0,0,0,0.62)",
  shadow: "#000000",
  shadowOpacity: 0,
  chipActiveBg: "#E9ECF2",
  chipActiveText: "#0C0F15",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };
export const fonts = {
  regular: "Inter-Regular",
  medium: "Inter-Medium",
  semibold: "Inter-SemiBold",
  bold: "Inter-Bold",
};
export const fontSize = { sm: 12, base: 14, lg: 16, xl: 20, xxl: 26, xxxl: 32 };

export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark: ThemeColors } = { light, dark };

/** Light palette for code that runs outside components. Components must use useTheme(). */
export const colors = light;

// ---- user preference: light / dark / follow the device ----
const PREF_KEY = "usahora_theme";
let preference: ThemePreference = readInitialPreference();
const listeners = new Set<() => void>();

function readInitialPreference(): ThemePreference {
  // Web: read synchronously so the first paint already uses the right theme (no white flash).
  try {
    const raw = (globalThis as any).localStorage?.getItem(PREF_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

export const getThemePreference = () => preference;
export function setThemePreference(p: ThemePreference) {
  preference = p;
  listeners.forEach((l) => l());
  // Persist through the shared storage helper (localStorage on web, AsyncStorage on native).
  import("@/src/utils/storage").then(({ storage }) => storage.setItem(PREF_KEY, p)).catch(() => {});
}
/** Native: load the saved preference once at start-up. */
export async function loadThemePreference() {
  const { storage } = await import("@/src/utils/storage");
  const v = await storage.getItem(PREF_KEY, null as string | null);
  if ((v === "light" || v === "dark" || v === "system") && v !== preference) {
    preference = v;
    listeners.forEach((l) => l());
  }
}
export const useThemePreference = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => preference,
    () => preference,
  );

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const pref = useThemePreference();
  const scheme: ColorScheme = pref === "system" ? (system === "dark" ? "dark" : "light") : pref;
  return { scheme, colors: themes[scheme] };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
