// Full-screen license activation: the first thing a buyer sees. Dark, premium, gently animated
// (moving aurora light, breathing logo, staggered device ID, shimmering button, shake on a wrong
// code, success burst). Always dark on purpose, in both light and dark theme.
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Linking, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Icon, useUI, type IconName } from "@/src/components/ui";
import { backupMessage, exportBackupNow } from "@/src/data/backup-export";
import { fonts } from "@/src/theme";

import { getDeviceId } from "./device";
import { activateLicense, PURCHASE_URL, refreshLicense, SELLER_WHATSAPP } from "./state";

const NATIVE = Platform.OS !== "web";
const INK = "#060913";
const WHITE = "#FFFFFF";
const DIM = "rgba(255,255,255,0.62)";
const FAINT = "rgba(255,255,255,0.4)";
const GLASS = "rgba(255,255,255,0.06)";
const GLASS_BORDER = "rgba(255,255,255,0.12)";
const BLUE = "#4F7DFF";
const VIOLET = "#8B5CF6";
const MINT = "#34D399";
const web = (s: object) => (Platform.OS === "web" ? (s as any) : null);

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduced).catch(() => {});
  }, []);
  return reduced;
}

/** A looping 0 → 1 → 0 value. */
function useLoop(duration: number, enabled: boolean, delay = 0) {
  const v = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    if (!enabled) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
        Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [v, duration, enabled, delay]);
  return v;
}

/** Soft moving light behind the content. */
function Aurora({ motion }: { motion: boolean }) {
  const a = useLoop(9000, motion);
  const b = useLoop(11000, motion, 1200);
  const c = useLoop(13000, motion, 600);
  const blob = (color: string, size: number, pos: object, v: Animated.Value, dx: number, dy: number) => (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: 0.55 },
        pos,
        web({ filter: "blur(90px)" }),
        Platform.OS !== "web" && { opacity: 0.18 },
        { transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }] },
      ]}
    />
  );
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
      {blob("#2563EB", 520, { top: -180, left: -160 }, a, 120, 80)}
      {blob(VIOLET, 460, { bottom: -200, right: -140 }, b, -100, -60)}
      {blob("#0EA5E9", 340, { top: "38%", left: "45%" }, c, -80, 70)}
      {/* fine grid for depth */}
      <View style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.5 }, web({ backgroundImage: "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)", backgroundSize: "44px 44px", maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)" })]} />
    </View>
  );
}

function BrandMark({ motion }: { motion: boolean }) {
  const pulse = useLoop(2200, motion);
  const size = 56;
  return (
    <View style={{ width: size + 24, height: size + 24, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ position: "absolute", width: size + 24, height: size + 24, borderRadius: (size + 24) / 2, backgroundColor: BLUE, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.32] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.12] }) }] }} />
      <LinearGradient colors={["#3B82F6", "#4F46E5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size * 0.28, alignItems: "flex-end", justifyContent: "center", flexDirection: "row", gap: 5, paddingBottom: size * 0.24 }}>
        {[0.28, 0.44, 0.6].map((h, i) => <View key={i} style={{ width: 7, height: size * h, borderRadius: 4, backgroundColor: WHITE, opacity: 0.55 + i * 0.22 }} />)}
      </LinearGradient>
    </View>
  );
}

function Steps({ active }: { active: number }) {
  const items: [IconName, string][] = [["send", "Kirim ID"], ["key-round", "Terima kode"], ["rocket", "Mulai pakai"]];
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 22 }} testID="activation-steps">
      {items.map(([icon, label], i) => {
        const done = i < active, on = i === active;
        return [
          <View key={label} style={{ width: 76, alignItems: "center", gap: 6 }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: done ? MINT : on ? BLUE : "transparent", borderWidth: 1, borderColor: done ? MINT : on ? BLUE : GLASS_BORDER }}>
              <Icon name={done ? "check" : icon} size={16} color={done || on ? WHITE : FAINT} />
            </View>
            <Text numberOfLines={1} style={{ fontFamily: on ? fonts.semibold : fonts.medium, fontSize: 11, color: on ? WHITE : DIM, textAlign: "center" }}>{label}</Text>
          </View>,
          i < items.length - 1 ? <View key={`${label}-line`} style={{ flex: 1, height: 1, marginTop: 17, marginHorizontal: -12, backgroundColor: done ? MINT : GLASS_BORDER }} /> : null,
        ];
      })}
    </View>
  );
}

/** Device ID shown character by character, sized to always fit on one line. */
function DeviceId({ id, motion }: { id: string; motion: boolean }) {
  const chars = id.split("");
  const vals = useState(() => chars.map(() => new Animated.Value(motion ? 0 : 1)))[0];
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!motion) return;
    Animated.stagger(45, vals.map((v) => Animated.timing(v, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }))).start();
  }, [vals, motion]);
  const letters = chars.filter((c) => c !== "-").length;
  const dashes = chars.length - letters;
  const gap = w && w < 340 ? 3 : 5;
  const dashW = 10;
  const tile = w ? Math.max(18, Math.min(32, Math.floor((w - dashes * dashW - (chars.length - 1) * gap) / letters))) : 28;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: "row", justifyContent: "center", gap, opacity: w ? 1 : 0 }} testID="device-id-text" accessibilityLabel={`ID perangkat ${id}`}>
      {chars.map((ch, i) =>
        ch === "-" ? (
          <View key={i} style={{ width: dashW, height: 2, alignSelf: "center", backgroundColor: FAINT, borderRadius: 1 }} />
        ) : (
          <Animated.View key={i} style={{ width: tile, height: Math.round(tile * 1.32), borderRadius: Math.round(tile * 0.3), backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: GLASS_BORDER, alignItems: "center", justifyContent: "center", opacity: vals[i], transform: [{ translateY: vals[i].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: Math.max(13, Math.min(18, Math.round(tile * 0.6))), color: WHITE }}>{ch}</Text>
          </Animated.View>
        ),
      )}
    </View>
  );
}

function GradientButton({ title, icon, onPress, disabled, loading, motion, testID }: { title: string; icon: IconName; onPress: () => void; disabled?: boolean; loading?: boolean; motion: boolean; testID: string }) {
  const shimmer = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    if (!motion || disabled) return;
    const anim = Animated.loop(Animated.sequence([Animated.timing(shimmer, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }), Animated.delay(1400), Animated.timing(shimmer, { toValue: 0, duration: 0, useNativeDriver: NATIVE })]));
    anim.start();
    return () => anim.stop();
  }, [shimmer, motion, disabled]);
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} testID={testID} accessibilityRole="button"
      style={({ pressed }) => [{ borderRadius: 16, overflow: "hidden", opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }, web({ boxShadow: disabled ? "none" : "0 10px 30px rgba(79,125,255,0.35)" })]}>
      <LinearGradient colors={[BLUE, "#6366F1", VIOLET]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <Icon name={loading ? "loader" : icon} size={19} color={WHITE} />
        <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: WHITE, letterSpacing: -0.1 }}>{loading ? "Memeriksa…" : title}</Text>
        {!disabled ? (
          <Animated.View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, width: 80, left: -80, transform: [{ translateX: shimmer.interpolate({ inputRange: [0, 1], outputRange: [0, 700] }) }, { skewX: "-20deg" }] }}>
            <LinearGradient colors={["transparent", "rgba(255,255,255,0.35)", "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
          </Animated.View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

function GlassButton({ title, icon, onPress, tint, testID, flex }: { title: string; icon: IconName; onPress: () => void; tint?: string; testID: string; flex?: boolean }) {
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button"
      style={({ pressed, hovered }: any) => [{ flex: flex ? 1 : undefined, height: 46, borderRadius: 14, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: tint ? tint : hovered ? "rgba(255,255,255,0.1)" : GLASS, borderWidth: 1, borderColor: tint ? "transparent" : GLASS_BORDER, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <Icon name={icon} size={17} color={WHITE} />
      <Text numberOfLines={1} style={{ fontFamily: fonts.semibold, fontSize: 14, color: WHITE }}>{title}</Text>
    </Pressable>
  );
}

function Feature({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(79,125,255,0.16)", borderWidth: 1, borderColor: "rgba(79,125,255,0.3)", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={18} color="#9DB8FF" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: WHITE }}>{title}</Text>
        <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: DIM, marginTop: 2, lineHeight: 19 }}>{text}</Text>
      </View>
    </View>
  );
}

export function ActivationScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const reduced = useReducedMotion();
  const motion = !reduced;
  const { toast } = useUI();
  const { business, status } = useAuth();
  const hasData = status === "in";
  const [id, setId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState(false);
  const enter = useState(() => new Animated.Value(motion ? 0 : 1))[0];
  const shake = useState(() => new Animated.Value(0))[0];
  const burst = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    getDeviceId().then(setId);
    if (motion) Animated.timing(enter, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start();
  }, [enter, motion]);

  const step = success ? 3 : code.trim() ? 1 : 0;

  const copy = async () => {
    if (!id) return;
    try {
      await (globalThis as any).navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast(`Salin manual: ${id}`, "info");
    }
  };
  const message = `Halo, saya ingin membeli / mengaktifkan lisensi USAHORA.${business?.name ? `\nNama usaha: ${business.name}` : ""}\nID perangkat: ${id ?? "-"}`;
  const whatsapp = () => Linking.openURL(`https://wa.me/${SELLER_WHATSAPP}?text=${encodeURIComponent(message)}`).catch(() => toast("WhatsApp tidak bisa dibuka", "error"));

  const activate = async () => {
    setError(null);
    setBusy(true);
    const err = await activateLicense(code, { refresh: false });
    setBusy(false);
    if (err) {
      setError(err);
      shake.setValue(0);
      Animated.sequence([10, -10, 8, -8, 4, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver: NATIVE }))).start();
      return;
    }
    setSuccess(true);
    Animated.spring(burst, { toValue: 1, friction: 5, tension: 70, useNativeDriver: NATIVE }).start();
    setTimeout(() => refreshLicense(), motion ? 1500 : 300); // then the app opens
  };
  const backup = async () => {
    try {
      const msg = backupMessage(await exportBackupNow(business));
      if (msg) toast(msg);
    } catch {
      toast("Gagal menyimpan cadangan. Coba lagi.", "error");
    }
  };

  const story = (
    <View style={{ maxWidth: 480, gap: 22, flex: wide ? 1 : undefined, flexShrink: 1, minWidth: 0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <BrandMark motion={motion} />
        <View>
          <Text style={{ fontFamily: fonts.bold, fontSize: 20, color: WHITE, letterSpacing: 3 }}>USAHORA</Text>
          <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: DIM }}>Manage smarter. Grow further.</Text>
        </View>
      </View>
      <View>
        <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(52,211,153,0.12)", borderWidth: 1, borderColor: "rgba(52,211,153,0.35)", marginBottom: 14 }}>
          <Icon name="sparkles" size={13} color={MINT} />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: MINT }}>Lisensi seumur hidup</Text>
        </View>
        <Text style={{ fontFamily: fonts.bold, fontSize: wide ? 44 : 32, lineHeight: wide ? 50 : 38, color: WHITE, letterSpacing: -1.4 }}>
          Tahu untung bersih{"\n"}usahamu, setiap hari.
        </Text>
        <Text style={{ fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, color: DIM, marginTop: 12 }}>
          Catat penjualan, stok, utang-piutang, dan keuangan dari HP. Bayar sekali, tanpa langganan, tetap jalan tanpa internet.
        </Text>
      </View>
      {wide ? (
        <View style={{ gap: 16 }}>
          <Feature icon="wifi-off" title="Jalan tanpa internet" text="Semua tersimpan di perangkat Anda sendiri." />
          <Feature icon="trending-up" title="Untung terlihat langsung" text="Margin dan untung tiap transaksi, sebelum disimpan." />
          <Feature icon="hand-coins" title="Tagihan tidak terlupa" text="Janji bayar pelanggan dan pengingat tagih lewat WhatsApp." />
        </View>
      ) : null}
    </View>
  );

  const card = (
    <View style={[{ width: "100%", maxWidth: 460, borderRadius: 28, padding: wide ? 32 : 22, backgroundColor: "rgba(15,20,35,0.62)", borderWidth: 1, borderColor: GLASS_BORDER }, web({ backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", boxShadow: "0 30px 80px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)" })]} testID="license-wall">
      {success ? (
        <View style={{ alignItems: "center", paddingVertical: 36, gap: 14 }} testID="activation-success">
          <Animated.View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: "rgba(52,211,153,0.15)", borderWidth: 1, borderColor: "rgba(52,211,153,0.5)", alignItems: "center", justifyContent: "center", transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }], opacity: burst }}>
            <Icon name="check" size={44} color={MINT} />
          </Animated.View>
          <Text style={{ fontFamily: fonts.bold, fontSize: 24, color: WHITE, letterSpacing: -0.6 }}>Lisensi aktif</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: DIM, textAlign: "center" }}>Terima kasih telah memilih USAHORA.{"\n"}Menyiapkan aplikasi Anda…</Text>
        </View>
      ) : (
        <>
          <Steps active={step} />
          <Text style={{ fontFamily: fonts.bold, fontSize: 24, color: WHITE, letterSpacing: -0.6 }}>Aktifkan USAHORA</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: DIM, marginTop: 6, marginBottom: 20 }}>
            {hasData ? "Lisensi di perangkat ini belum aktif. Data Anda tetap aman. Masukkan kode lisensi untuk lanjut." : "Kirim ID perangkat ini ke penjual bersama bukti pembayaran. Anda akan menerima kode lisensi khusus untuk perangkat ini."}
          </Text>

          <View style={{ borderRadius: 20, padding: 18, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: GLASS_BORDER, gap: 14 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: FAINT, letterSpacing: 1.5, textAlign: "center" }}>ID PERANGKAT INI</Text>
            {id ? <DeviceId id={id} motion={motion} /> : <View style={{ height: 40 }} />}
            <View style={{ flexDirection: "row", gap: 10 }}>
              {Platform.OS === "web" ? <GlassButton flex title={copied ? "Tersalin" : "Salin ID"} icon={copied ? "check" : "copy"} onPress={copy} testID="device-id-copy" tint={copied ? "rgba(52,211,153,0.25)" : undefined} /> : null}
              <GlassButton flex title={width < 520 ? "WhatsApp" : "Kirim via WhatsApp"} icon="message-circle" onPress={whatsapp} tint="#16A34A" testID="device-id-whatsapp" />
            </View>
          </View>

          <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: DIM, marginTop: 22, marginBottom: 8 }}>Kode lisensi</Text>
          <Animated.View style={{ transform: [{ translateX: shake }] }}>
            <TextInput
              value={code}
              onChangeText={(t) => { setCode(t); setError(null); }}
              placeholder="Tempel kode USAHORA-… di sini"
              placeholderTextColor={FAINT}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              testID="license-code-input"
              style={[{ minHeight: 84, borderRadius: 16, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, fontFamily: fonts.medium, fontSize: 14, color: WHITE, backgroundColor: "rgba(0,0,0,0.25)", borderWidth: 1, borderColor: error ? "#FF6B6B" : focused ? BLUE : GLASS_BORDER, textAlignVertical: "top" }, web({ outlineStyle: "none", boxShadow: focused ? "0 0 0 4px rgba(79,125,255,0.18)" : "none", wordBreak: "break-all" })]}
            />
          </Animated.View>
          {error ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10, alignItems: "flex-start" }} testID="license-error">
              <Icon name="circle-alert" size={16} color="#FF8A8A" />
              <Text style={{ flex: 1, fontFamily: fonts.regular, fontSize: 13, color: "#FF8A8A", lineHeight: 19 }}>{error}</Text>
            </View>
          ) : null}
          <View style={{ height: 18 }} />
          <GradientButton title="Aktifkan lisensi" icon="key-round" onPress={activate} disabled={!code.trim()} loading={busy} motion={motion} testID="license-activate-button" />
          {hasData ? <View style={{ marginTop: 12 }}><GlassButton title="Simpan cadangan data" icon="download" onPress={backup} testID="license-backup-button" /></View> : null}

          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14, marginTop: 22 }}>
            {[["infinity", "Seumur hidup"], ["wifi-off", "Offline"], ["shield-check", "Data di perangkat"]].map(([icon, label]) => (
              <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name={icon as IconName} size={14} color={FAINT} />
                <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: FAINT }}>{label}</Text>
              </View>
            ))}
          </View>
          {PURCHASE_URL ? (
            <Pressable onPress={() => Linking.openURL(PURCHASE_URL)} testID="license-buy-button" style={{ marginTop: 16, alignSelf: "center" }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: "#9DB8FF" }}>Belum punya lisensi? Beli sekarang →</Text>
            </Pressable>
          ) : (
            <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: FAINT, textAlign: "center", marginTop: 16 }}>Belum punya kode? Hubungi penjual USAHORA tempat Anda membeli.</Text>
          )}
        </>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: INK }}>
      <LinearGradient colors={["#05070F", "#0B1230", "#120A2E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <Aurora motion={motion} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32, paddingHorizontal: 20 }}>
        <Animated.View style={{ opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }], width: "100%", maxWidth: 1080, alignSelf: "center", flexDirection: wide ? "row" : "column", alignItems: wide ? "center" : "stretch", justifyContent: "space-between", gap: wide ? 56 : 28 }}>
          {story}
          <View style={{ alignItems: wide ? "flex-end" : "center", flexShrink: 0, width: wide ? 460 : "100%" }}>{card}</View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
