// One place that writes the backup file ("file cadangan") and records when it happened (used by
// Settings, the backup reminder and the license screen, so a user can always take their data out).
//
// Plain-language flow for non-technical owners:
// - Phone (Android/iPhone browser or installed app): the share sheet opens, so the file can be sent
//   straight to Google Drive or to their own WhatsApp.
// - Laptop: the file is downloaded to the Downloads folder.
import { Platform } from "react-native";

import { buildBackup } from "@/src/data/actions";
import { getState, setMeta } from "@/src/data/store";
import { shareText } from "@/src/lib/export";
import { dayKey } from "@/src/lib/format";

export const BACKUP_REMINDER_DAYS = 7;
export const NOT_A_BACKUP = "File tidak bisa dibaca. Pilih file cadangan USAHORA (namanya diawali usahora-cadangan).";

export type BackupResult = { how: "shared" | "downloaded" | "cancelled"; filename: string };

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);

export function backupFilename(businessName: string | undefined) {
  const name = slug(businessName ?? "");
  return `usahora-cadangan${name ? `-${name}` : ""}-${dayKey()}.json`;
}

function isPhoneBrowser() {
  const nav: any = (globalThis as any).navigator;
  return !!nav && /Android|iPhone|iPad|iPod/i.test(nav.userAgent ?? "");
}

export async function exportBackupNow(business: { id: string; name: string } | null): Promise<BackupResult> {
  const filename = backupFilename(business?.name);
  const content = JSON.stringify(buildBackup(business), null, 1);
  let how: BackupResult["how"] = "shared";
  if (Platform.OS === "web") {
    const nav: any = (globalThis as any).navigator;
    const file = typeof File !== "undefined" ? new File([content], filename, { type: "application/json" }) : null;
    if (file && isPhoneBrowser() && nav?.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: "Cadangan data USAHORA", text: `Cadangan data ${business?.name ?? "USAHORA"} (${dayKey()})` });
      } catch (e: any) {
        if (e?.name === "AbortError") return { how: "cancelled", filename };
        await shareText(content, filename, "application/json"); // share failed: fall back to download
        how = "downloaded";
      }
    } else {
      await shareText(content, filename, "application/json");
      how = "downloaded";
    }
  } else {
    await shareText(content, filename, "application/json"); // native share sheet
  }
  setMeta({ lastBackupAt: new Date().toISOString() });
  return { how, filename };
}

/** Message shown after a backup, in plain language. Null when the user cancelled. */
export function backupMessage(r: BackupResult): string | null {
  if (r.how === "cancelled") return null;
  if (r.how === "downloaded") return `File cadangan tersimpan di folder Download (${r.filename}). Simpan juga di Google Drive atau kirim ke WhatsApp Anda sendiri.`;
  return "File cadangan siap. Pastikan tersimpan di Google Drive atau terkirim ke WhatsApp Anda sendiri.";
}

/** True when there is data worth protecting and no backup in the last BACKUP_REMINDER_DAYS days. */
export function backupOverdue(now = Date.now()) {
  const s = getState();
  const hasData = s.products.length + s.sales.length + s.customers.length + s.finance.length + s.invoices.length > 0;
  if (!hasData) return false;
  const last = s.meta.lastBackupAt ? Date.parse(s.meta.lastBackupAt) : NaN;
  return isNaN(last) || now - last > BACKUP_REMINDER_DAYS * 86_400_000;
}
