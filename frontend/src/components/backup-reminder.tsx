import { useState } from "react";
import { View } from "react-native";

import { useAuth } from "@/src/auth";
import { Button, Card, T, useUI } from "@/src/components/ui";
import { BACKUP_REMINDER_DAYS, backupMessage, backupOverdue, exportBackupNow } from "@/src/data/backup-export";
import { useDB } from "@/src/data/store";
import { fmtDate } from "@/src/lib/format";
import { spacing, useTheme } from "@/src/theme";

/**
 * Local mode keeps data only on this device, so remind the owner to export a backup when there is
 * data and no backup in the last BACKUP_REMINDER_DAYS days.
 */
export function BackupReminder() {
  const db = useDB();
  const { business, isLocal, isOwner } = useAuth();
  const { colors } = useTheme();
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);
  if (!isLocal || !isOwner || !backupOverdue()) return null;
  const last = db.meta.lastBackupAt;
  const run = async () => {
    setBusy(true);
    try {
      const msg = backupMessage(await exportBackupNow(business));
      if (msg) toast(msg);
    } catch {
      toast("Gagal menyimpan cadangan. Coba lagi.", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card testID="backup-reminder" style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md, borderColor: colors.warning }}>
      <View style={{ flex: 1 }}>
        <T v="label">{last ? `Cadangan terakhir ${fmtDate(last)}` : "Data Anda belum punya cadangan"}</T>
        <T v="caption">Simpan cadangan minimal tiap {BACKUP_REMINDER_DAYS} hari ke Google Drive atau WhatsApp Anda, supaya data aman jika HP hilang atau rusak.</T>
      </View>
      <Button size="sm" title="Simpan" icon="download" onPress={run} loading={busy} testID="backup-reminder-button" />
    </Card>
  );
}
