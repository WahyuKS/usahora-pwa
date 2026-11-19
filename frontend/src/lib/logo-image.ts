// Business logo picked from the device and stored offline as a small data URL (no server needed).
import * as ImagePicker from "expo-image-picker";
import { Linking, Platform } from "react-native";

export const LOGO_MAX_PX = 360;
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_DATA_URL = 1_500_000; // ~1.1 MB image — keeps the profile small enough for local storage

export class LogoError extends Error {}

/** Scales an image down so its longest side is at most `max` px (web only). PNG keeps transparency. */
export async function shrinkOnWeb(uri: string, mime: string | undefined, max = LOGO_MAX_PX): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new (globalThis as any).Image() as HTMLImageElement;
    el.onload = () => resolve(el);
    el.onerror = () => reject(new LogoError("File ini bukan gambar yang bisa dibaca. Pilih JPG atau PNG."));
    el.src = uri;
  });
  const scale = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new LogoError("Browser tidak bisa memproses gambar");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  const png = /png|webp|svg|gif/i.test(mime ?? "") || /^data:image\/(png|webp|svg|gif)/i.test(uri);
  return png ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.88);
}

/** Opens the gallery / file chooser and returns the logo as a data URL, or null when cancelled. */
export async function pickLogo(): Promise<string | null> {
  if (Platform.OS !== "web") {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      const req = perm.canAskAgain ? await ImagePicker.requestMediaLibraryPermissionsAsync() : perm;
      if (!req.granted) {
        if (!req.canAskAgain) Linking.openSettings();
        throw new LogoError("Izin galeri ditolak. Izinkan akses foto untuk memilih logo.");
      }
    }
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: Platform.OS !== "web",
    aspect: [1, 1],
    quality: 0.7,
    base64: Platform.OS !== "web",
  });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  if (a.mimeType && !a.mimeType.startsWith("image/")) throw new LogoError("File ini bukan gambar. Pilih JPG atau PNG.");
  if (a.fileSize && a.fileSize > MAX_INPUT_BYTES) throw new LogoError("Gambar terlalu besar (maks. 8 MB)");
  const url = Platform.OS === "web" ? await shrinkOnWeb(a.uri, a.mimeType) : a.base64 ? `data:${a.mimeType ?? "image/jpeg"};base64,${a.base64}` : null;
  if (!url) throw new LogoError("Gambar tidak bisa dibaca");
  if (url.length > MAX_DATA_URL) throw new LogoError("Gambar terlalu besar. Pilih gambar yang lebih kecil.");
  return url;
}
