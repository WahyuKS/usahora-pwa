// Design tokens for USAHORA (light theme). Refreshed "fresh & elegant" palette: USAHORA blue stays the
// brand colour; softer cool-neutral canvas, midnight navy for hero surfaces, emerald for profit.
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FFFFFF",
  onSurface: "#0E1726",
  surfaceSecondary: "#F4F6FB",
  onSurfaceSecondary: "#0E1726",
  surfaceTertiary: "#EDF1F7",
  onSurfaceTertiary: "#0E1726",
  surfaceInverse: "#0B1630",
  onSurfaceInverse: "#FFFFFF",
  muted: "#667085",

  brand: "#2563EB",
  onBrand: "#FFFFFF",
  brandPrimary: "#2563EB",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#DDE7FF",
  onBrandSecondary: "#1E3A8A",
  brandTertiary: "#EEF3FF",
  onBrandTertiary: "#2563EB",

  success: "#0E9F6E",
  onSuccess: "#FFFFFF",
  successSoft: "#E3F7EE",
  warning: "#F59E0B",
  onWarning: "#FFFFFF",
  warningSoft: "#FFF3D6",
  warningText: "#B45309",
  error: "#DC2626",
  onError: "#FFFFFF",
  errorSoft: "#FDE8E8",
  info: "#3B82F6",
  onInfo: "#FFFFFF",

  border: "#E6EAF1",
  borderStrong: "#D0D7E2",
  divider: "#EDF0F5",
  overlay: "rgba(11,22,48,0.45)",
  shadow: "#0B1630",
};

export type ThemeColors = typeof light;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };
export const fonts = {
  regular: "Inter-Regular",
  medium: "Inter-Medium",
  semibold: "Inter-SemiBold",
  bold: "Inter-Bold",
};
export const fontSize = { sm: 12, base: 14, lg: 16, xl: 20, xxl: 24, xxxl: 30 };

export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}
setColorScheme?.(themes.dark ? null : defaultScheme);

export const colors = light;

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
