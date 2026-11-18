// One place that writes a backup file and records when it happened (used by Settings, the backup
// reminder and the license screen, so a user can always take their data out).
import { buildBackup } from "@/src/data/actions";
import { getState, setMeta } from "@/src/data/store";
import { shareText } from "@/src/lib/export";
import { dayKey } from "@/src/lib/format";

export const BACKUP_REMINDER_DAYS = 7;

export async function exportBackupNow(business: { id: string; name: string } | null) {
  await shareText(JSON.stringify(buildBackup(business), null, 1), `usahora-backup-${dayKey()}.json`, "application/json");
  setMeta({ lastBackupAt: new Date().toISOString() });
}

/** True when there is data worth protecting and no backup in the last BACKUP_REMINDER_DAYS days. */
export function backupOverdue(now = Date.now()) {
  const s = getState();
  const hasData = s.products.length + s.sales.length + s.customers.length + s.finance.length + s.invoices.length > 0;
  if (!hasData) return false;
  const last = s.meta.lastBackupAt ? Date.parse(s.meta.lastBackupAt) : NaN;
  return isNaN(last) || now - last > BACKUP_REMINDER_DAYS * 86_400_000;
}
