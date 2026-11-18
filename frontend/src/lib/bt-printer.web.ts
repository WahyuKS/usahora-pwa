// Bluetooth thermal printer via Web Bluetooth (Chrome / Edge on Android, Windows, macOS, ChromeOS).
// Not available on iPhone/iPad (Safari has no Web Bluetooth) or Firefox: the button is hidden there.
// Works with BLE printers that expose a writable characteristic (most cheap 58/80 mm "BT printer"
// models do). Classic-Bluetooth-only printers cannot be reached from a browser.

// Common BLE services of thermal printers; Web Bluetooth only lets us use services listed up front.
const PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000fee7-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];
const CHUNK = 100; // small writes: many printers drop larger BLE packets

let cached: { device: any; characteristic: any } | null = null;

export const bluetoothPrintSupported = () => typeof navigator !== "undefined" && !!(navigator as any).bluetooth;

async function findWritable(server: any) {
  const services = await server.getPrimaryServices();
  for (const s of services) {
    for (const c of await s.getCharacteristics()) {
      if (c.properties.writeWithoutResponse || c.properties.write) return c;
    }
  }
  throw new Error("Printer tidak menyediakan jalur tulis yang dikenali. Coba printer lain atau cetak lewat PDF.");
}

async function connect(forceChoose: boolean) {
  if (!forceChoose && cached?.device?.gatt?.connected) return cached.characteristic;
  let device = forceChoose ? null : cached?.device;
  if (!device) {
    device = await (navigator as any).bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES });
  }
  const server = await device.gatt.connect();
  const characteristic = await findWritable(server);
  cached = { device, characteristic };
  return characteristic;
}

/** Sends the bytes to the printer. The first time (or with `choose`) the browser asks which printer to use. */
export async function printBluetooth(bytes: Uint8Array, choose = false): Promise<string> {
  if (!bluetoothPrintSupported()) throw new Error("Browser ini belum mendukung printer Bluetooth. Pakai Chrome di Android/laptop, atau cetak lewat PDF.");
  let ch: any;
  try {
    ch = await connect(choose);
  } catch (e: any) {
    if (e?.name === "NotFoundError") throw new Error("Pemilihan printer dibatalkan.");
    throw new Error(e?.message || "Gagal terhubung ke printer.");
  }
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const part = bytes.slice(i, i + CHUNK);
    if (ch.properties.writeWithoutResponse && ch.writeValueWithoutResponse) await ch.writeValueWithoutResponse(part);
    else await ch.writeValue(part);
  }
  return cached?.device?.name ?? "printer";
}
