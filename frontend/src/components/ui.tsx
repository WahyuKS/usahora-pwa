import { Lucide } from "@react-native-vector-icons/lucide";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import {
  ActivityIndicator, Animated, Image, Modal, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from "react-native";
import { KeyboardAvoidingView, KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSync } from "@/src/data/sync";
import { hasToken } from "@/src/lib/api";
import { num, toNum } from "@/src/lib/format";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, fontSize, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export type IconName = ComponentProps<typeof Lucide>["name"];
export const Icon = ({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) => {
  const { colors } = useTheme();
  return <Lucide name={name} size={size} color={color ?? colors.onSurface} />;
};

// ---------------- Text ----------------
type Variant = "display" | "h1" | "h2" | "h3" | "body" | "label" | "caption";
const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontSize: fontSize.xxxl, fontFamily: fonts.bold, letterSpacing: -1.1 },
  h1: { fontSize: fontSize.xxl, fontFamily: fonts.bold, letterSpacing: -0.8 },
  h2: { fontSize: fontSize.xl, fontFamily: fonts.semibold, letterSpacing: -0.4 },
  h3: { fontSize: fontSize.lg, fontFamily: fonts.semibold, letterSpacing: -0.2 },
  body: { fontSize: fontSize.base, fontFamily: fonts.regular, lineHeight: 21 },
  label: { fontSize: fontSize.base, fontFamily: fonts.medium, letterSpacing: -0.1 },
  caption: { fontSize: fontSize.sm, fontFamily: fonts.regular, lineHeight: 17 },
};
export function T({ v = "body", color, style, children, numberOfLines, testID, weight, align }: {
  v?: Variant; color?: string; style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number; testID?: string;
  weight?: keyof typeof fonts; align?: "left" | "right" | "center";
}) {
  const { colors } = useTheme();
  return (
    <Text
      testID={testID}
      numberOfLines={numberOfLines}
      style={[VARIANTS[v], { color: color ?? (v === "caption" ? colors.muted : colors.onSurface) }, weight && { fontFamily: fonts[weight] }, align && { textAlign: align }, style]}
    >
      {children}
    </Text>
  );
}

// ---------------- Button ----------------
export function Button({ title, onPress, variant = "primary", icon, loading, disabled, testID, style, size = "md" }: {
  title: string; onPress: () => void; variant?: "primary" | "secondary" | "ghost" | "danger" | "outline"; icon?: IconName;
  loading?: boolean; disabled?: boolean; testID?: string; style?: StyleProp<ViewStyle>; size?: "sm" | "md" | "lg";
}) {
  const { colors } = useTheme();
  const bg = { primary: colors.brandPrimary, secondary: colors.brandTertiary, ghost: "transparent", danger: colors.error, outline: "transparent" }[variant];
  const fg = { primary: colors.onBrandPrimary, secondary: colors.onBrandTertiary, ghost: colors.brandPrimary, danger: colors.onError, outline: colors.onSurface }[variant];
  const h = { sm: 36, md: 48, lg: 56 }[size];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        { height: h, borderRadius: size === "sm" ? radius.pill : radius.md, backgroundColor: bg, paddingHorizontal: size === "sm" ? spacing.md : spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
        variant === "outline" && { borderWidth: 1, borderColor: colors.borderStrong },
        variant === "primary" && { shadowColor: colors.brandPrimary, shadowOpacity: colors.shadowOpacity ? 0.22 : 0, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: fonts.semibold, fontSize: size === "lg" ? fontSize.lg : size === "sm" ? 13 : fontSize.base, letterSpacing: -0.1 }} numberOfLines={1}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, testID, color, bg, label }: { icon: IconName; onPress: () => void; testID?: string; color?: string; bg?: string; label?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} accessibilityLabel={label} hitSlop={6} onPress={onPress}
      style={({ pressed }) => [{ width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: bg ?? "transparent" }, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={20} color={color ?? colors.onSurface} />
    </Pressable>
  );
}

// ---------------- Card / rows ----------------
export function Card({ children, style, testID, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string; onPress?: () => void }) {
  const s = useStyles();
  if (onPress)
    return (
      <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }, style]}>
        {children}
      </Pressable>
    );
  return <View testID={testID} style={[s.card, style]}>{children}</View>;
}

export function IconTile({ name, tone = "brand", size = 40 }: { name: IconName; tone?: "brand" | "success" | "warning" | "error" | "neutral"; size?: number }) {
  const { colors } = useTheme();
  const map = {
    brand: [colors.brandTertiary, colors.brandPrimary], success: [colors.successSoft, colors.success], warning: [colors.warningSoft, colors.warningText],
    error: [colors.errorSoft, colors.error], neutral: [colors.surfaceTertiary, colors.muted],
  }[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: map[0], alignItems: "center", justifyContent: "center" }}>
      <Icon name={name} size={size * 0.48} color={map[1]} />
    </View>
  );
}

export function ListRow({ icon, tone, title, subtitle, right, rightSub, onPress, testID, titleLines = 1 }: {
  titleLines?: number; icon?: IconName; tone?: ComponentProps<typeof IconTile>["tone"]; title: string; subtitle?: string; right?: string; rightSub?: ReactNode; onPress?: () => void; testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} disabled={!onPress} onPress={onPress} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, minHeight: 56 }, pressed && { opacity: 0.7 }]}>
      {icon ? <IconTile name={icon} tone={tone} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="label" numberOfLines={titleLines}>{title}</T>
        {subtitle ? <T v="caption" numberOfLines={1} style={{ marginTop: 2 }}>{subtitle}</T> : null}
      </View>
      {right !== undefined || rightSub ? (
        <View style={{ alignItems: "flex-end", flexShrink: 0, maxWidth: "45%" }}>
          {right !== undefined ? <T v="label" weight="semibold" numberOfLines={1}>{right}</T> : null}
          {rightSub}
        </View>
      ) : onPress ? (
        <Icon name="chevron-right" size={18} color={colors.muted} />
      ) : null}
    </Pressable>
  );
}

export const Divider = () => {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.divider }} />;
};

export function Badge({ label, tone = "brand", testID }: { label: string; tone?: "brand" | "success" | "warning" | "error" | "neutral"; testID?: string }) {
  const { colors } = useTheme();
  const map = {
    brand: [colors.brandTertiary, colors.brandPrimary], success: [colors.successSoft, colors.success], warning: [colors.warningSoft, colors.warningText],
    error: [colors.errorSoft, colors.error], neutral: [colors.surfaceTertiary, colors.muted],
  }[tone];
  return (
    <View testID={testID} style={{ backgroundColor: map[0], borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" }}>
      <Text style={{ color: map[1], fontFamily: fonts.semibold, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

export function SectionTitle({ title, action, onAction, testID }: { title: string; action?: string; onAction?: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.sm }}>
      <T v="h3">{title}</T>
      {action ? (
        <Pressable testID={testID} onPress={onAction} hitSlop={8}>
          <T v="label" color={colors.brandPrimary}>{action}</T>
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------- Inputs ----------------
export function Field({ label, help, error, money, style, testID, ...props }: ComponentProps<typeof TextInput> & {
  label?: string; help?: string; error?: string | null; money?: boolean; testID?: string;
}) {
  const { colors } = useTheme();
  const s = useStyles();
  const [focus, setFocus] = useState(false);
  const value = money && props.value !== undefined && props.value !== "" ? num(toNum(props.value)) : props.value;
  return (
    <View style={{ marginBottom: spacing.lg }}>
      {label ? <T v="label" style={{ marginBottom: 6 }}>{label}</T> : null}
      <View style={[s.inputWrap, focus && { borderColor: colors.brandPrimary }, !!error && { borderColor: colors.error }, props.multiline && { height: "auto", minHeight: 96, alignItems: "flex-start", paddingVertical: spacing.sm }]}>
        {money ? <T v="label" color={colors.muted} style={{ marginRight: 6 }}>Rp</T> : null}
        <TextInput
          testID={testID}
          placeholderTextColor={colors.muted}
          {...props}
          value={value}
          keyboardType={money ? "number-pad" : props.keyboardType}
          onChangeText={(t) => props.onChangeText?.(money ? t.replace(/[^0-9]/g, "") : t)}
          onFocus={(e) => { setFocus(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
          style={[s.input, props.multiline ? { textAlignVertical: "top", minHeight: 80 } : { height: 46 }, style]}
        />
      </View>
      {error ? <T v="caption" color={colors.error} style={{ marginTop: 4 }}>{error}</T> : help ? <T v="caption" style={{ marginTop: 4 }}>{help}</T> : null}
    </View>
  );
}

export function SearchBar({ value, onChangeText, placeholder, testID }: { value: string; onChangeText: (s: string) => void; placeholder: string; testID?: string }) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <View style={[s.inputWrap, { height: 44, backgroundColor: colors.surface }]}>
      <Icon name="search" size={18} color={colors.muted} />
      <TextInput testID={testID} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} style={[s.input, { marginLeft: spacing.sm, height: 42 }]} returnKeyType="search" />
      {value ? <IconButton icon="x" onPress={() => onChangeText("")} label="Hapus pencarian" /> : null}
    </View>
  );
}

export function Chips<K extends string>({ options, value, onChange, testIDPrefix, style }: {
  options: { key: K; label: string }[]; value: K; onChange: (k: K) => void; testIDPrefix: string; style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ height: 56, flexGrow: 0 }, style]} contentContainerStyle={{ gap: spacing.sm, alignItems: "center", paddingHorizontal: spacing.lg }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable key={o.key} testID={`${testIDPrefix}-${o.key}`} onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(o.key); }}
            style={{ height: 36, flexShrink: 0, paddingHorizontal: 15, borderRadius: radius.pill, justifyContent: "center", borderWidth: 1, borderColor: active ? colors.chipActiveBg : colors.border, backgroundColor: active ? colors.chipActiveBg : colors.surface }}>
            <Text style={{ fontFamily: active ? fonts.semibold : fonts.medium, fontSize: 13, color: active ? colors.chipActiveText : colors.onSurface }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Small wrapping segmented options used inside forms (not filter rows). */
export function Segment<K extends string>({ options, value, onChange, testIDPrefix }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void; testIDPrefix: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable key={o.key} testID={`${testIDPrefix}-${o.key}`} onPress={() => onChange(o.key)}
            style={{ minHeight: 42, paddingHorizontal: spacing.lg, borderRadius: radius.pill, justifyContent: "center", borderWidth: 1, borderColor: active ? colors.chipActiveBg : colors.border, backgroundColor: active ? colors.chipActiveBg : colors.surface }}>
            <Text style={{ fontFamily: active ? fonts.semibold : fonts.medium, fontSize: 14, color: active ? colors.chipActiveText : colors.onSurface }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------- States ----------------
export function EmptyState({ icon, title, message, action, onAction, testID }: { icon: IconName; title: string; message: string; action?: string; onAction?: () => void; testID?: string }) {
  return (
    <View testID={testID} style={{ alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, gap: spacing.sm }}>
      <IconTile name={icon} size={64} />
      <T v="h3" align="center" style={{ marginTop: spacing.sm }}>{title}</T>
      <T v="body" align="center" color={useTheme().colors.muted}>{message}</T>
      {action && onAction ? <Button title={action} icon="plus" onPress={onAction} style={{ marginTop: spacing.md }} testID={testID ? `${testID}-action` : undefined} /> : null}
    </View>
  );
}

export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary }}>
      <ActivityIndicator color={colors.brandPrimary} size="large" />
    </View>
  );
}

// ---------------- Logo ----------------
// Official USAHORA logo (generated from assets/brand/usahora-logo-source.png by scripts/generate-pwa-icons.js).
const LOGO_MARK = require("../../assets/brand/usahora-mark.png");
const LOGO_FULL = require("../../assets/brand/usahora-logo.png");
const LOGO_FULL_RATIO = 406 / 148;

/** USAHORA shield mark on a white tile: readable on light and dark backgrounds. */
export function Logo({ size = 40 }: { size?: number; inverse?: boolean }) {
  return (
    <View accessibilityLabel="USAHORA" style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(10,15,30,0.06)" }}>
      <Image source={LOGO_MARK} style={{ width: size * 0.74, height: size * 0.74 }} resizeMode="contain" />
    </View>
  );
}

/** Full USAHORA logo (mark + wordmark). The wordmark is navy, so on dark backgrounds use plate. */
export function BrandLogo({ height = 32, plate }: { height?: number; plate?: boolean }) {
  const img = <Image accessibilityLabel="USAHORA Business Management System" source={LOGO_FULL} style={{ height, width: height * LOGO_FULL_RATIO }} resizeMode="contain" />;
  if (!plate) return img;
  return <View style={{ alignSelf: "flex-start", backgroundColor: "#FFFFFF", borderRadius: height * 0.4, paddingHorizontal: height * 0.45, paddingVertical: height * 0.3 }}>{img}</View>;
}

// ---------------- Sync pill ----------------
const SYNC_LABEL = { online: ["Online", "cloud"], offline: ["Offline", "wifi-off"], pending: ["Menunggu sinkron", "cloud-upload"], syncing: ["Sinkronisasi...", "refresh-cw"], success: ["Tersinkron", "cloud-check"], error: ["Sinkron gagal", "triangle-alert"] } as const;
export function SyncPill() {
  const { status } = useSync();
  const router = useRouter();
  const { colors } = useTheme();
  // Local mode (no cloud account): nothing is synced, so show where the data lives instead.
  const local = !hasToken();
  const [label, icon] = local ? (status === "offline" ? ["Offline · lokal", "wifi-off"] : ["Data lokal", "hard-drive"]) : SYNC_LABEL[status];
  const { width } = useWindowDimensions();
  const compact = width < 420;
  const tone = local ? [colors.brandTertiary, colors.brandPrimary] : status === "offline" || status === "error" ? [colors.warningSoft, colors.warningText] : status === "success" ? [colors.successSoft, colors.success] : [colors.brandTertiary, colors.brandPrimary];
  return (
    <Pressable testID="sync-status-pill" accessibilityLabel={label} onPress={() => router.push("/settings")} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: tone[0] }}>
      <Icon name={icon as IconName} size={14} color={tone[1]} />
      {compact ? null : <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: tone[1] }}>{label}</Text>}
    </Pressable>
  );
}

// ---------------- Screen ----------------
export function Screen({ title, subtitle, back = true, right, children, footer, scroll = true, tab, testID, headerExtra, leading }: {
  title: string; subtitle?: string; back?: boolean; right?: ReactNode; children: ReactNode; footer?: ReactNode; scroll?: boolean; tab?: boolean; testID?: string; headerExtra?: ReactNode; leading?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const s = useStyles();
  const bottomChrome = tab ? (usesNativeTabs ? insets.bottom : 0) : insets.bottom;
  const content = <View style={s.maxw}>{children}</View>;
  return (
    <View style={s.screen} testID={testID}>
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={[s.maxw, s.headerRow]}>
          {back ? <IconButton icon="arrow-left" testID="header-back-button" label="Kembali" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} /> : null}
          {leading}
          <View style={{ flex: 1, minWidth: 0, marginLeft: back ? 0 : spacing.xs }}>
            <T v={back ? "h3" : "h1"} numberOfLines={1} testID="screen-title">{title}</T>
            {subtitle ? <T v="caption" numberOfLines={1}>{subtitle}</T> : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>{right}</View>
        </View>
        {headerExtra}
      </View>
      {scroll ? (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, paddingBottom: (footer ? spacing.lg : bottomChrome + spacing.xl) }}>
          {content}
        </KeyboardAwareScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}
      {footer ? (
        <View style={[s.footer, { paddingBottom: bottomChrome + spacing.md }]}>
          <View style={s.maxw}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}

// ---------------- Sheet ----------------
export function Sheet({ visible, onClose, title, children, testID, footer }: { visible: boolean; onClose: () => void; title: string; children: ReactNode; testID?: string; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={s.overlay} onPress={onClose} testID={testID ? `${testID}-backdrop` : undefined} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.md, maxHeight: "90%" }]} testID={testID}>
          <View style={s.handle} />
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
            <T v="h3" style={{ flex: 1 }}>{title}</T>
            <IconButton icon="x" onPress={onClose} testID={testID ? `${testID}-close` : "sheet-close"} label="Tutup" />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Searchable option picker in a sheet. */
export function PickerSheet<T>({ visible, onClose, title, items, getLabel, getSub, onPick, testID, emptyText, extra }: {
  visible: boolean; onClose: () => void; title: string; items: T[]; getLabel: (t: T) => string; getSub?: (t: T) => string; onPick: (t: T) => void; testID: string; emptyText: string; extra?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => items.filter((i) => getLabel(i).toLowerCase().includes(q.toLowerCase())).slice(0, 100), [items, q, getLabel]);
  return (
    <Sheet visible={visible} onClose={onClose} title={title} testID={testID}>
      <SearchBar value={q} onChangeText={setQ} placeholder="Cari..." testID={`${testID}-search`} />
      {extra}
      {filtered.length === 0 ? <T v="caption" style={{ paddingVertical: spacing.lg }}>{emptyText}</T> : null}
      {filtered.map((it, i) => (
        <View key={i}>
          <ListRow title={getLabel(it)} subtitle={getSub?.(it)} testID={`${testID}-option-${i}`} onPress={() => { onPick(it); setQ(""); onClose(); }} />
          <Divider />
        </View>
      ))}
    </Sheet>
  );
}

// ---------------- Toast + Confirm ----------------
type ConfirmOpts = { title: string; message: string; confirmText?: string; danger?: boolean };
type UI = { toast: (msg: string, type?: "success" | "error" | "info") => void; confirm: (o: ConfirmOpts) => Promise<boolean> };
const UICtx = createContext<UI>({ toast: () => {}, confirm: async () => false });
export const useUI = () => useContext(UICtx);

export function UIProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [toastState, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [dlg, setDlg] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);

  const toast = useCallback((msg: string, type: "success" | "error" | "info" = "success") => {
    clearTimeout(timer.current);
    setToast({ msg, type });
    Haptics.notificationAsync(type === "error" ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.spring(anim, { toValue: 1, useNativeDriver: Platform.OS !== "web" }).start();
    timer.current = setTimeout(() => Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== "web" }).start(() => setToast(null)), 2800);
  }, [anim]);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setDlg({ ...o, resolve })), []);
  const close = (v: boolean) => {
    dlg?.resolve(v);
    setDlg(null);
  };
  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);
  const tc = toastState?.type === "error" ? colors.error : toastState?.type === "info" ? colors.surfaceInverse : colors.success;

  return (
    <UICtx.Provider value={value}>
      {children}
      {toastState ? (
        <Animated.View pointerEvents="none" testID="toast" style={{ position: "absolute", left: spacing.lg, right: spacing.lg, bottom: insets.bottom + 80, alignItems: "center", opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
          <View style={{ backgroundColor: tc, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, flexDirection: "row", gap: spacing.sm, alignItems: "center", maxWidth: 520, shadowColor: colors.shadow, shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
            <Icon name={toastState.type === "error" ? "triangle-alert" : "circle-check"} size={18} color={colors.onSuccess} />
            <Text testID="toast-message" style={{ color: colors.onSuccess, fontFamily: fonts.medium, fontSize: 14, flexShrink: 1 }}>{toastState.msg}</Text>
          </View>
        </Animated.View>
      ) : null}
      <Modal visible={!!dlg} transparent animationType="fade" onRequestClose={() => close(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: spacing.xl }}>
          <View testID="confirm-dialog" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, maxWidth: 420, width: "100%", alignSelf: "center" }}>
            <T v="h3">{dlg?.title ?? ""}</T>
            <T v="body" color={colors.muted} style={{ marginTop: spacing.sm }}>{dlg?.message ?? ""}</T>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xl }}>
              <Button title="Batal" variant="outline" onPress={() => close(false)} style={{ flex: 1 }} testID="confirm-cancel-button" />
              <Button title={dlg?.confirmText ?? "Ya, lanjutkan"} variant={dlg?.danger ? "danger" : "primary"} onPress={() => close(true)} style={{ flex: 1 }} testID="confirm-ok-button" />
            </View>
          </View>
        </View>
      </Modal>
    </UICtx.Provider>
  );
}

/** Run an action and surface validation errors as a toast. Returns true on success. */
export function useRun() {
  const { toast } = useUI();
  return useCallback((fn: () => void, success?: string) => {
    try {
      fn();
      if (success) toast(success);
      return true;
    } catch (e: any) {
      toast(e?.message ?? "Terjadi kesalahan", "error");
      return false;
    }
  }, [toast]);
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: { backgroundColor: c.surfaceSecondary, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 48, paddingHorizontal: spacing.xs },
  maxw: { width: "100%", maxWidth: 1040, alignSelf: "center" },
  footer: { backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.divider, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  card: {
    backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg,
    shadowColor: c.shadow, shadowOpacity: c.shadowOpacity, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: c.shadowOpacity ? 2 : 0,
  },
  inputWrap: { flexDirection: "row", alignItems: "center", height: 48, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, backgroundColor: c.surface, paddingHorizontal: spacing.md },
  // minWidth 0: on web an <input> has an intrinsic width (about 20 characters) and would otherwise
  // overflow its box in half-width fields on small phones.
  input: { flex: 1, minWidth: 0, fontFamily: fonts.regular, fontSize: 15, color: c.onSurface, ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}) },
  overlay: { flex: 1, backgroundColor: c.overlay },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: spacing.sm, width: "100%", maxWidth: 640, alignSelf: "center" },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, alignSelf: "center", marginBottom: spacing.sm },
}));
