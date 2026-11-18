import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Icon, IconButton, IconTile, T, useUI, type IconName } from "@/src/components/ui";
import { fileUrl, uploadImage } from "@/src/lib/api";
import { radius, spacing, useTheme } from "@/src/theme";

/** Authenticated image from object storage, with an initial-letter / icon fallback. */
export function Thumb({ fileId, size = 40, label, icon = "package", rounded }: { fileId?: string | null; size?: number; label?: string; icon?: IconName; rounded?: boolean }) {
  const { colors } = useTheme();
  const r = rounded ? size / 2 : radius.md;
  if (fileId) return <Image source={{ uri: fileUrl(fileId) }} style={{ width: size, height: size, borderRadius: r, backgroundColor: colors.surfaceTertiary }} contentFit="cover" cachePolicy="disk" transition={150} />;
  if (label)
    return (
      <View style={{ width: size, height: size, borderRadius: r, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}>
        <T v={size > 48 ? "h2" : "label"} weight="bold" color={colors.brandPrimary}>{label.slice(0, 1).toUpperCase()}</T>
      </View>
    );
  return <IconTile name={icon} size={size} />;
}

/** Pick a photo from the gallery and upload it. Returns the stored file id. */
export function PhotoPicker({ fileId, onChange, label, testID, square = true }: { fileId?: string | null; onChange: (id: string | null) => void; label: string; testID: string; square?: boolean }) {
  const { colors } = useTheme();
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      const req = perm.canAskAgain ? await ImagePicker.requestMediaLibraryPermissionsAsync() : perm;
      if (!req.granted) {
        toast("Izin galeri ditolak. Buka Pengaturan untuk mengizinkan.", "error");
        if (!req.canAskAgain) Linking.openSettings();
        return;
      }
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: square ? [1, 1] : undefined, quality: 0.6 });
    if (res.canceled) return;
    setBusy(true);
    try {
      onChange(await uploadImage(res.assets[0]));
      toast("Foto diunggah");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg }}>
      <Pressable onPress={pick} testID={testID} style={{ width: 88, height: 88, borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: colors.surfaceTertiary }}>
        {busy ? <ActivityIndicator color={colors.brandPrimary} /> : fileId ? <Thumb fileId={fileId} size={88} /> : <Icon name={"image-plus" as IconName} size={26} color={colors.muted} />}
      </Pressable>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <T v="label">{label}</T>
        <T v="caption">JPG/PNG, maks. 5 MB. Butuh koneksi internet.</T>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button size="sm" variant="secondary" title={fileId ? "Ganti" : "Pilih foto"} onPress={pick} testID={`${testID}-pick`} />
          {fileId ? <Button size="sm" variant="ghost" title="Hapus" onPress={() => onChange(null)} testID={`${testID}-remove`} /> : null}
        </View>
      </View>
    </View>
  );
}

/** Full-screen barcode scanner with contextual permission handling. */
export function BarcodeScanner({ visible, onClose, onScan, title = "Scan barcode" }: { visible: boolean; onClose: () => void; onScan: (code: string) => void; title?: string }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [perm, requestPerm] = useCameraPermissions();
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const handle = (r: BarcodeScanningResult) => {
    const now = Date.now();
    if (r.data === last.current.code && now - last.current.at < 1800) return; // ignore repeated reads of the same code
    last.current = { code: r.data, at: now };
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onScan(r.data);
  };
  const white = "#FFFFFF";
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.surfaceInverse }} testID="barcode-scanner">
        {perm?.granted ? (
          <CameraView style={{ flex: 1 }} facing="back" onBarcodeScanned={handle}
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] }} />
        ) : (
          <View style={{ flex: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.md }}>
            <IconTile name="scan-barcode" size={64} />
            <T v="h2" color={colors.onSurfaceInverse}>Izinkan kamera</T>
            <T v="body" color={colors.borderStrong}>Kamera dipakai untuk membaca barcode produk agar kasir bisa menambah barang ke keranjang dengan sekali arahkan.</T>
            {perm && !perm.canAskAgain && perm.status === "denied" ? (
              <Button title="Buka Pengaturan" icon="settings" onPress={() => Linking.openSettings()} testID="scanner-open-settings" />
            ) : (
              <Button title="Izinkan kamera" icon="scan-barcode" onPress={requestPerm} testID="scanner-allow-camera" />
            )}
          </View>
        )}
        <View style={{ position: "absolute", top: insets.top + spacing.sm, left: spacing.lg, right: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <T v="h3" color={white}>{title}</T>
          <IconButton icon="x" color={white} bg="rgba(15,23,42,0.6)" onPress={onClose} testID="scanner-close" label="Tutup" />
        </View>
        {perm?.granted ? (
          <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 260, height: 160, borderWidth: 2, borderColor: white, borderRadius: radius.lg }} />
            <T v="label" color={white} style={{ marginTop: spacing.lg }}>Arahkan kamera ke barcode</T>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
