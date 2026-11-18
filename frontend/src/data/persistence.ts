// Native (Android / iOS) persistence: unchanged behaviour. The whole business database is one JSON
// value in AsyncStorage under `usahora_db_<businessId><suffix>`. (Metro picks persistence.web.ts on web.)
import { storage } from "@/src/utils/storage";

export type StorageInfo = { engine: "asyncstorage" | "indexeddb" | "localstorage"; persisted: boolean | null; note?: string };

const key = (b: string, suffix: string) => `usahora_db_${b}${suffix}`;

/** Returns the saved database object, or null when there is none (or it was corrupted and set aside). */
export async function loadState(b: string, suffix: string): Promise<Record<string, any> | null> {
  const raw = await storage.getItem(key(b, suffix), null as string | null);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // corrupted local copy: keep it aside instead of deleting it
    await storage.setItem(`${key(b, suffix)}_corrupt_${Date.now()}`, raw);
    return null;
  }
}

export async function saveState(b: string, suffix: string, state: Record<string, any>): Promise<void> {
  await storage.setItem(key(b, suffix), JSON.stringify(state));
}

export const storageInfo = async (): Promise<StorageInfo> => ({ engine: "asyncstorage", persisted: null });
