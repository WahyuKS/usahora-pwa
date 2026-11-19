// License status for this device. There is no free trial: USAHORA asks for a license code on the
// first open, before the business is set up. Everything is checked offline (no activation server).
//
// Each code is issued for ONE device ID (see device.ts), so a shared code does not work elsewhere.
// Honest limit (documented in docs/SELLING.md): wiping the browser data creates a new device ID; the
// buyer then asks for a new code and restores their data from a backup file.
import { useSyncExternalStore } from "react";

import { CLOUD_ENABLED } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";

import { getDeviceId } from "./device";
import { verifyLicense, normaliseCode, type LicensePayload } from "./verify";

const LICENSE_KEY = "usahora_license";

export type LicenseStatus =
  | { kind: "loading" }
  | { kind: "not-required" }
  | { kind: "licensed"; payload: LicensePayload }
  | { kind: "unlicensed" };

/** Where buyers can purchase a license (shown on the activation screen). Set at build time. */
export const PURCHASE_URL = (process.env.EXPO_PUBLIC_PURCHASE_URL ?? "").trim();
/** Seller WhatsApp number in international format without "+" (e.g. 6281234567890). Empty = buyer picks the contact. */
export const SELLER_WHATSAPP = (process.env.EXPO_PUBLIC_SELLER_WHATSAPP ?? "").replace(/[^0-9]/g, "");

let status: LicenseStatus = { kind: "loading" };
const listeners = new Set<() => void>();
const set = (s: LicenseStatus) => {
  status = s;
  listeners.forEach((l) => l());
};
export const getLicenseStatus = () => status;
export const useLicense = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => status,
    () => status,
  );

/** Re-evaluate the status (on start, after activation, and periodically). */
export async function refreshLicense(): Promise<LicenseStatus> {
  if (CLOUD_ENABLED) {
    set({ kind: "not-required" }); // cloud accounts are handled by the server, not by license codes
    return status;
  }
  const code = await storage.getItem(LICENSE_KEY, null as string | null);
  if (code) {
    const v = verifyLicense(code, await getDeviceId());
    if (v.ok) {
      set({ kind: "licensed", payload: v.payload });
      return status;
    }
  }
  set({ kind: "unlicensed" });
  return status;
}

/** Verify and save a code. Returns an error message, or null when activated. */
export async function activateLicense(raw: string, opts: { refresh?: boolean } = {}): Promise<string | null> {
  const v = verifyLicense(raw, await getDeviceId());
  if (!v.ok) return v.error;
  if (!(await storage.setItem(LICENSE_KEY, normaliseCode(raw)))) return "Gagal menyimpan lisensi di perangkat ini. Coba lagi.";
  // The activation screen refreshes later itself, after its success animation.
  if (opts.refresh !== false) await refreshLicense();
  return null;
}
