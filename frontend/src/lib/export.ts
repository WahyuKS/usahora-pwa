import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const html = esc;

function webDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function shareText(content: string, filename: string, mime: string) {
  if (Platform.OS === "web") return webDownload(content, filename, mime);
  const f = new File(Paths.cache, filename);
  if (f.exists) f.delete();
  f.create();
  f.write(content);
  await Sharing.shareAsync(f.uri, { mimeType: mime, dialogTitle: filename });
}

export function toCSV(headers: string[], rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const s = String(v ?? "");
    return /[";\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Semicolon separator + BOM opens correctly in Excel with Indonesian locale.
  return "\uFEFF" + [headers, ...rows].map((r) => r.map(cell).join(";")).join("\n");
}

export const exportCSV = (filename: string, headers: string[], rows: (string | number)[][]) =>
  shareText(toCSV(headers, rows), filename.endsWith(".csv") ? filename : `${filename}.csv`, "text/csv");

const baseCss = `
  *{box-sizing:border-box} body{font-family:Inter,-apple-system,Segoe UI,Roboto,sans-serif;color:#0F172A;margin:0;padding:32px;font-size:12px}
  h1{font-size:22px;margin:0} h2{font-size:14px;margin:20px 0 8px} .muted{color:#64748B}
  table{width:100%;border-collapse:collapse;margin-top:12px} th{background:#F1F5F9;text-align:left;font-size:11px;padding:8px;color:#475569}
  td{padding:8px;border-bottom:1px solid #E2E8F0} .r{text-align:right} .tot td{font-weight:700;border-bottom:none}
  .brand{color:#2563EB;font-weight:800;letter-spacing:1px} .pill{display:inline-block;padding:3px 10px;border-radius:99px;background:#EFF6FF;color:#2563EB;font-weight:600}
  .row{display:flex;justify-content:space-between;gap:24px}
`;
export const wrapHtml = (title: string, body: string) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(title)}</title><style>${baseCss}</style></head><body>${body}</body></html>`;

/**
 * Web: expo-print ignores the HTML and prints the current screen, so the document (receipt, invoice,
 * report — with the business logo) is rendered in a hidden frame and printed from there.
 * The browser dialog also offers "Save as PDF".
 */
export function printOnWeb(htmlStr: string): Promise<void> {
  return new Promise((resolve, reject) => {
    document.querySelectorAll("iframe[data-testid=print-frame]").forEach((f) => f.remove());
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("data-testid", "print-frame");
    Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", opacity: "0" });
    frame.onload = () => {
      const w = frame.contentWindow;
      if (!w) return reject(new Error("Tidak bisa membuka dokumen untuk dicetak"));
      // onload fires after images (logo) are loaded; give fonts a moment.
      setTimeout(() => {
        try {
          w.focus();
          w.print();
          resolve();
        } catch (e) {
          reject(e);
        } finally {
          setTimeout(() => frame.remove(), 60_000);
        }
      }, 200);
    };
    frame.srcdoc = htmlStr;
    document.body.appendChild(frame);
  });
}

export async function printHtml(htmlStr: string) {
  if (Platform.OS === "web") return printOnWeb(htmlStr);
  await Print.printAsync({ html: htmlStr });
}

export async function sharePdf(htmlStr: string, filename: string) {
  if (Platform.OS === "web") return printOnWeb(htmlStr);
  const { uri } = await Print.printToFileAsync({ html: htmlStr });
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: filename });
}

export function tableHtml(headers: string[], rows: (string | number)[][], rightCols: number[] = []) {
  return `<table><thead><tr>${headers.map((h, i) => `<th class="${rightCols.includes(i) ? "r" : ""}">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c, i) => `<td class="${rightCols.includes(i) ? "r" : ""}">${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}
