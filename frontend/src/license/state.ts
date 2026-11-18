// License status for this device: licensed (valid code saved), trial (14 days from first use) or expired.
// Everything is stored locally; the app never needs the internet to check it.
//
// Honest limits (documented in docs/SELLING.md): a code can be typed on several devices, and a
// determined user can reset the trial by wiping the browser data (which also wipes their business data).
// The licensee's name is shown in the app, which discourages sharing.
import { useSyncExternalStore } from "react";

import { CLOUD_ENABLED } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";

import { verifyLicense, normaliseCode, type LicensePayload } from "./verify";

export const TRIAL_DAYS = 14;
const DAY = 86_400_000;
const LICENSE_KEY = "usahora_license";
const TRIAL_KEY = "usahora_trial";

export type LicenseStatus =
  | { kind: "loading" }
  | { kind: "not-required" }
  | { kind: "licensed"; payload: LicensePayload }
  | { kind: "trial"; daysLeft: number; endsAt: string }
  | { kind: "expired"; endedAt: string };

/** Where buyers can purchase a license (shown on the activation screen). Set at build time. */
export const PURCHASE_URL = (process.env.EXPO_PUBLIC_PURCHASE_URL ?? "").trim();

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

/** Pure trial calculation (exported for tests). `lastSeen` stops the trial going back when the clock is turned back. */
export function trialState(startedAt: number, lastSeen: number, now: number) {
  const effectiveNow = Math.max(now, lastSeen);
  const endsAt = startedAt + TRIAL_DAYS * DAY;
  const daysLeft = Math.ceil((endsAt - effectiveNow) / DAY);
  return { endsAt, daysLeft, expired: effectiveNow >= endsAt, effectiveNow };
}

async function readTrial(now: number) {
  const raw = await storage.getItem(TRIAL_KEY, null as string | null);
  let t: { startedAt: number; lastSeen: number } | null = null;
  try {
    t = raw ? JSON.parse(raw) : null;
  } catch {
    t = null;
  }
  if (!t || typeof t.startedAt !== "number") t = { startedAt: now, lastSeen: now };
  const s = trialState(t.startedAt, t.lastSeen ?? now, now);
  await storage.setItem(TRIAL_KEY, JSON.stringify({ startedAt: t.startedAt, lastSeen: s.effectiveNow }));
  return s;
}

/** Re-evaluate the status (on start, after activation, and periodically). */
export async function refreshLicense(now = Date.now()): Promise<LicenseStatus> {
  if (CLOUD_ENABLED) {
    set({ kind: "not-required" }); // cloud accounts are handled by the server, not by license codes
    return status;
  }
  const code = await storage.getItem(LICENSE_KEY, null as string | null);
  if (code) {
    const v = verifyLicense(code);
    if (v.ok) {
      set({ kind: "licensed", payload: v.payload });
      return status;
    }
  }
  const t = await readTrial(now);
  set(t.expired ? { kind: "expired", endedAt: new Date(t.endsAt).toISOString() } : { kind: "trial", daysLeft: t.daysLeft, endsAt: new Date(t.endsAt).toISOString() });
  return status;
}

/** Verify and save a code. Returns an error message, or null when activated. */
export async function activateLicense(raw: string): Promise<string | null> {
  const v = verifyLicense(raw);
  if (!v.ok) return v.error;
  if (!(await storage.setItem(LICENSE_KEY, normaliseCode(raw)))) return "Gagal menyimpan lisensi di perangkat ini. Coba lagi.";
  await refreshLicense();
  return null;
}
