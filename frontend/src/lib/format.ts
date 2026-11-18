import * as Crypto from "expo-crypto";

export const uuid = () => Crypto.randomUUID();

const group = (n: number) => Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const num = (n: number) => (n < 0 ? "-" : "") + group(n || 0);
export const rp = (n: number) => (n < 0 ? "-" : "") + "Rp" + group(n || 0);
export const pct = (n: number) => `${(Math.round(n * 10) / 10).toString().replace(".", ",")}%`;

/** Parse an Indonesian-formatted number input ("1.500.000" or "2,5"). */
export function toNum(s: string | number | undefined | null): number {
  if (typeof s === "number") return s;
  if (!s) return 0;
  const clean = String(s).replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const v = parseFloat(clean);
  return isNaN(v) ? 0 : v;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const JKT = 7 * 3600 * 1000; // Asia/Jakarta, UTC+7, no DST

const jd = (d: Date | string | number) => new Date(new Date(d).getTime() + JKT);
export const nowISO = () => new Date().toISOString();

export function fmtDate(d: Date | string | number) {
  const j = jd(d);
  return `${j.getUTCDate()} ${MONTHS[j.getUTCMonth()]} ${j.getUTCFullYear()}`;
}
export function fmtDateTime(d: Date | string | number) {
  const j = jd(d);
  const hh = String(j.getUTCHours()).padStart(2, "0");
  const mm = String(j.getUTCMinutes()).padStart(2, "0");
  return `${fmtDate(d)}, ${hh}:${mm}`;
}
/** YYYY-MM-DD in Jakarta time */
export function dayKey(d: Date | string | number = new Date()) {
  return jd(d).toISOString().slice(0, 10);
}
export const monthLabel = (m: number) => MONTHS[m];
export const shortDay = (key: string) => {
  const [, m, d] = key.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
};
export function isValidDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());
}
/** Convert a YYYY-MM-DD (Jakarta) to an ISO instant at 00:00 Jakarta */
export const dateKeyToISO = (k: string) => new Date(new Date(k + "T00:00:00Z").getTime() - JKT).toISOString();
export function addDays(key: string, days: number) {
  const d = new Date(key + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function addMonths(key: string, months: number) {
  const d = new Date(key + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export type Period = "today" | "7d" | "month" | "year" | "all";
export const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Hari ini" },
  { key: "7d", label: "7 hari" },
  { key: "month", label: "Bulan ini" },
  { key: "year", label: "Tahun ini" },
  { key: "all", label: "Semua" },
];
export function rangeOf(p: Period, now = new Date()): { start: number; end: number } {
  const j = jd(now);
  const y = j.getUTCFullYear(), m = j.getUTCMonth(), d = j.getUTCDate();
  const map: Record<Period, number> = {
    today: Date.UTC(y, m, d),
    "7d": Date.UTC(y, m, d - 6),
    month: Date.UTC(y, m, 1),
    year: Date.UTC(y, 0, 1),
    all: Date.UTC(2000, 0, 1) + JKT,
  };
  return { start: map[p] - JKT, end: now.getTime() + 60_000 };
}
export const inRange = (iso: string, r: { start: number; end: number }) => {
  const t = new Date(iso).getTime();
  return t >= r.start && t <= r.end;
};
