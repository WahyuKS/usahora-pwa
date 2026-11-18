import { uploadForm } from "@/src/utils/upload";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

let token: string | null = null;
export const setApiToken = (t: string | null) => {
  token = t;
};
export const hasToken = () => !!token;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000);
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: opts.method ?? "GET",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError(0, "Tidak dapat terhubung ke server. Periksa koneksi internet.");
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = (json as any).detail;
    const msg = typeof d === "string" ? d : res.status === 422 ? "Data tidak valid. Periksa kembali isian Anda." : "Terjadi kesalahan pada server.";
    throw new ApiError(res.status, msg);
  }
  return json as T;
}

export const fileUrl = (id: string) => `${BASE}/files/${id}?token=${encodeURIComponent(token ?? "")}`;

export async function uploadImage(asset: { uri: string; fileName?: string | null; mimeType?: string | null }): Promise<string> {
  let res: Response;
  try {
    res = await uploadForm(`${BASE}/upload`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      files: { file: { uri: asset.uri, name: asset.fileName ?? "foto.jpg", mimeType: asset.mimeType ?? "image/jpeg" } },
    });
  } catch {
    throw new ApiError(0, "Tidak dapat mengunggah. Periksa koneksi internet.");
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, typeof json.detail === "string" ? json.detail : "Gagal mengunggah gambar");
  return json.id as string;
}
