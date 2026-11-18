# USAHORA — PRD

## Original problem statement
Build USAHORA, a business management system for Indonesian UMKM (Bahasa Indonesia, IDR, Asia/Jakarta). It should be mobile-first and offline-first with cloud sync. Modules: Dashboard, POS, Produk & Inventaris, Pembelian & Supplier, Pelanggan, Keuangan, Invoice & Quotation, Tagihan, Kalkulator HPP, Dokumen & SOP, Laporan, Pengaturan, Backup/Restore. Brand colours: #2563EB / #0F172A. Font: Inter. (Full brief in the first message of the conversation.)

## User choices
- Expo mobile app with the built-in cloud server (FastAPI + MongoDB) instead of React/Vite + Laravel/MySQL.
- Email + password login (JWT).
- Optional demo data that can be removed.
- All extra modules: Pembelian & Supplier, Tagihan, HPP, Dokumen & SOP, Backup JSON.

## Architecture
- Data is stored on the device first (`src/data/store.ts`), with an outbox of pending changes. Sales, payments and stock movements are permanent records that are never edited.
- Sync engine (`src/data/sync.ts`):
  - Every change carries a unique key, so the server never applies it twice.
  - Retries with backoff.
  - Detects conflicts and lets the user choose which version to keep.
  - Runs automatically on reconnect and when the app returns to the foreground.
- Backend (`backend/server.py`):
  - Auth (bcrypt + JWT), rate limit by IP and email.
  - Business profile, sync push/pull, cloud backup.
  - Every record is tied to a business on the server side, so one business cannot see another's data.

## Implemented (2026-06)
- Login/register, business profile and invoice settings.
- Dashboard: KPIs, chart, alerts, top products, recent activity.
- POS with receipt print/PDF and sales on credit.
- Products with stock movements, opname and archive.
- Customers and suppliers, purchases with goods receipt.
- Finance: P&L, cash flow, cash journal.
- Invoices and quotations: preview, PDF, mark paid, convert quotation to invoice.
- Recurring bills with in-app reminders.
- HPP calculator.
- Editable SOP and document templates.
- 10 reports with CSV and PDF export.
- Backup and restore: JSON file and cloud.
- Demo data that can be loaded and cleared.
- Tested: iteration 1 and iteration 2 (all pass).

## Backlog
- P1: product photos (object storage); barcode scanner (camera); staff accounts and roles.
- P1: pagination for sync pull; push pending changes when the web page closes.
- P2: full double-entry bookkeeping and balance sheet; installable offline web app (PWA); encrypting data on the device; WhatsApp invoice share link.
