// Read-only access to the legacy single-JSON database written by store.ts.
// Key layout and encoding must match store.ts exactly:
//   key   = `usahora_db_<businessId><suffix>`
//   value = storage.setItem(key, JSON.stringify(state))  -> JSON string inside a JSON string.
// This module never writes or removes the legacy key.
import AsyncStorage from "@react-native-async-storage/async-storage";

export const legacyKey = (businessId: string, suffix = "") => `usahora_db_${businessId}${suffix}`;

/**
 * Returns a `readLegacy` function for migrateLegacy(). It returns the raw value stored on disk
 * (null when there is none). Storage read errors are thrown, never treated as "no data".
 */
export function legacyReader(
  businessId: string,
  suffix = "",
  get: (key: string) => Promise<string | null> = (k) => AsyncStorage.getItem(k),
): () => Promise<string | null> {
  return () => get(legacyKey(businessId, suffix));
}
