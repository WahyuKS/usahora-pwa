// Native (Android / iOS app build): Bluetooth printing needs a native module that is not part of this
// app yet, so the option is hidden. The web version (bt-printer.web.ts) uses Web Bluetooth.
export const bluetoothPrintSupported = () => false;

export async function printBluetooth(_bytes: Uint8Array, _choose = false): Promise<string> {
  throw new Error("Printer Bluetooth belum tersedia di versi aplikasi ini. Gunakan Cetak atau Bagikan PDF.");
}
