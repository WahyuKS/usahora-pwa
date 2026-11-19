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
/** HH:MM in Jakarta time */
export function fmtTime(d: Date | string | number) {
  const j = jd(d);
  return `${String(j.getUTCHours()).padStart(2, "0")}:${String(j.getUTCMinutes()).padStart(2, "0")}`;
}
export function fmtDateTime(d: Date | string | number) {
  return `${fmtDate(d)}, ${fmtTime(d)}`;
}
/** YYYY-MM-DD in Jakarta time */
export function dayKey(d: Date | string | number = new Date()) {
  return jd(d).toISOString().slice(0, 10);
}
export const monthLabel = (m: number) => MONTHS[m];
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
/** "Kamis, 19 Nov 2026" (Jakarta). */
export const fmtDayLong = (d: Date | string | number = new Date()) => `${DAYS[jd(d).getUTCDay()]}, ${fmtDate(d)}`;
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

/** Preset periods, or a custom date / date range chosen by the user (YYYY-MM-DD, Jakarta days, inclusive). */
export type PresetPeriod = "today" | "7d" | "month" | "year" | "all";
export type CustomPeriod = { from: string; to: string };
export type Period = PresetPeriod | CustomPeriod;
export const isCustomPeriod = (p: Period): p is CustomPeriod => typeof p === "object" && p !== null;
export const samePeriod = (a: Period, b: Period) => (isCustomPeriod(a) && isCustomPeriod(b) ? a.from === b.from && a.to === b.to : a === b);
export const PERIODS: { key: PresetPeriod; label: string }[] = [
  { key: "today", label: "Hari ini" },
  { key: "7d", label: "7 hari" },
  { key: "month", label: "Bulan ini" },
  { key: "year", label: "Tahun ini" },
  { key: "all", label: "Semua" },
];
/** Human label: "Bulan ini", "19 Nov 2026", or "1 Nov 2026 – 19 Nov 2026". */
export function periodLabel(p: Period) {
  if (!isCustomPeriod(p)) return PERIODS.find((x) => x.key === p)?.label ?? "";
  return p.from === p.to ? fmtDate(p.from) : `${fmtDate(p.from)} – ${fmtDate(p.to)}`;
}
/** Number of days a period covers (custom periods: inclusive). */
export const periodDays = (p: Period) => (isCustomPeriod(p) ? Math.round((Date.parse(p.to) - Date.parse(p.from)) / 86_400_000) + 1 : { today: 1, "7d": 7, month: 31, year: 366, all: 9999 }[p]);

export function rangeOf(p: Period, now = new Date()): { start: number; end: number } {
  if (isCustomPeriod(p)) {
    const [from, to] = p.from <= p.to ? [p.from, p.to] : [p.to, p.from];
    return { start: Date.parse(from + "T00:00:00Z") - JKT, end: Date.parse(to + "T00:00:00Z") - JKT + 86_400_000 - 1 };
  }
  const j = jd(now);
  const y = j.getUTCFullYear(), m = j.getUTCMonth(), d = j.getUTCDate();
  const map: Record<PresetPeriod, number> = {
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
