// Device ID for license activation: random, created once per browser/app install, stored locally.
// Format XXXX-XXXX-XXXX with unambiguous characters (no 0/O, 1/I/L, U) so it is easy to read over WhatsApp.
// It changes if the browser data is wiped or the app is reinstalled; the buyer then requests a new code.
import { uuid } from "@/src/lib/format";
import { storage } from "@/src/utils/storage";

const KEY = "usahora_device_id";
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"; // 30 symbols

export const normaliseDeviceId = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/(.{4})(?=.)/g, "$1-");
export const isDeviceId = (s: string) => /^[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/.test(s);

function newId() {
  const hex = uuid().replace(/-/g, "");
  let out = "";
  for (let i = 0; i < 12; i++) out += ALPHABET[parseInt(hex.slice(i * 2, i * 2 + 2), 16) % ALPHABET.length];
  return normaliseDeviceId(out);
}

let cached: string | null = null;
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  const saved = await storage.getItem(KEY, null as string | null);
  if (saved && isDeviceId(saved)) return (cached = saved);
  const id = newId();
  await storage.setItem(KEY, id);
  return (cached = id);
}

/** Test helper. */
export const __resetDeviceIdCache = () => {
  cached = null;
};
