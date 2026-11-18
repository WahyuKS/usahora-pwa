import { useState } from "react";

import { Button, useUI } from "@/src/components/ui";
import type { Business, Contact, Sale } from "@/src/data/types";
import { bluetoothPrintSupported, printBluetooth } from "@/src/lib/bt-printer";
import { receiptBytes } from "@/src/lib/escpos";
import { spacing } from "@/src/theme";

/** "Print to Bluetooth printer" (58 mm ESC/POS). Hidden where the browser cannot do Bluetooth. */
export function BluetoothPrintButton({ sale, business, customer, paid, testID }: { sale: Sale; business: Business | null; customer?: Contact; paid: number; testID: string }) {
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);
  if (!bluetoothPrintSupported()) return null;
  const print = async () => {
    setBusy(true);
    try {
      const name = await printBluetooth(receiptBytes(sale, business, customer, paid));
      toast(`Struk dikirim ke ${name}`);
    } catch (e: any) {
      toast(e?.message ?? "Gagal mencetak", "error");
    } finally {
      setBusy(false);
    }
  };
  return <Button title="Cetak ke printer Bluetooth" icon="bluetooth" variant="secondary" onPress={print} loading={busy} style={{ marginTop: spacing.sm }} testID={testID} />;
}
