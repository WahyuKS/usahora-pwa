// Offline license verification. A code is: "USAHORA-" + base64url(JSON payload) + "." + base64url(Ed25519 signature).
// Nothing is sent anywhere; the signature is checked against the bundled public key.
import nacl from "tweetnacl";

import { LICENSE_PUBLIC_KEY } from "./public-key";

export const LICENSE_PREFIX = "USAHORA-";

export type LicensePayload = {
  p: "usahora";
  v: number;
  id: string;
  name: string;
  email?: string;
  order?: string;
  /** Device the code was issued for (required since v2). */
  device?: string;
  edition: string;
  issued: string;
};

export type VerifyResult = { ok: true; payload: LicensePayload } | { ok: false; error: string };

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
/** base64url → bytes (no dependency on atob/Buffer, works on web and native). */
export function fromB64url(s: string): Uint8Array {
  const clean = s.replace(/=+$/, "");
  if (!/^[A-Za-z0-9_-]*$/.test(clean)) throw new Error("bad base64");
  const out: number[] = [];
  let buf = 0, bits = 0;
  for (const ch of clean) {
    buf = (buf << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

const utf8 = (bytes: Uint8Array) => {
  // Small UTF-8 decoder (TextDecoder is not available on every React Native engine).
  let s = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    if (b < 0x80) s += String.fromCharCode(b);
    else if (b < 0xe0) s += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if (b < 0xf0) s += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    else {
      const cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      s += String.fromCodePoint(cp);
    }
  }
  return s;
};

/** Normalise what the user pasted (spaces, line breaks, lower-case prefix). */
export const normaliseCode = (raw: string) => {
  const s = raw.replace(/\s+/g, "");
  return s.toUpperCase().startsWith(LICENSE_PREFIX) ? LICENSE_PREFIX + s.slice(LICENSE_PREFIX.length) : s;
};

/**
 * @param deviceId this device's ID. A code is only valid on the device it was issued for.
 */
export function verifyLicense(raw: string, deviceId: string, publicKey = LICENSE_PUBLIC_KEY): VerifyResult {
  const code = normaliseCode(raw);
  if (!code.startsWith(LICENSE_PREFIX)) return { ok: false, error: "Kode lisensi harus diawali USAHORA-" };
  const parts = code.slice(LICENSE_PREFIX.length).split(".");
  if (parts.length !== 2) return { ok: false, error: "Format kode lisensi tidak lengkap. Salin seluruh kode." };
  try {
    const body = fromB64url(parts[0]);
    const sig = fromB64url(parts[1]);
    const key = fromB64url(publicKey);
    if (sig.length !== 64 || key.length !== 32) return { ok: false, error: "Kode lisensi rusak. Salin ulang seluruh kode." };
    if (!nacl.sign.detached.verify(body, sig, key)) return { ok: false, error: "Kode lisensi tidak valid." };
    const payload = JSON.parse(utf8(body)) as LicensePayload;
    if (payload.p !== "usahora" || typeof payload.name !== "string" || typeof payload.id !== "string") return { ok: false, error: "Kode ini bukan lisensi USAHORA." };
    if (!payload.device) return { ok: false, error: "Kode lisensi lama tanpa ID perangkat. Minta kode baru ke penjual dengan menyertakan ID perangkat Anda." };
    if (payload.device !== deviceId) return { ok: false, error: `Kode ini untuk perangkat ${payload.device}, bukan perangkat ini (${deviceId}). Minta kode untuk ID perangkat ini.` };
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "Kode lisensi rusak. Salin ulang seluruh kode." };
  }
}
