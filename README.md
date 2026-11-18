# USAHORA — Business Management System for UMKM

*Manage smarter. Grow further.*

USAHORA is a mobile-first business app for Indonesian UMKM: kasir/POS, produk & stok, pembelian & supplier, pelanggan, keuangan, invoice & quotation, tagihan, kalkulator HPP, dokumen & SOP, laporan, backup/restore, and cloud sync. All data is stored on the device first, so it keeps working offline.

## Stack (adapted to the Emergent platform)
The original brief asked for React + Vite + Laravel + MySQL. This platform builds with:
- **App**: Expo (React Native + TypeScript, expo-router). It runs on Android and iPhone (Expo Go or a native build) and in the web preview.
- **Local data (offline-first)**: a local-first repository (`frontend/src/data/store.ts`) kept in device storage (AsyncStorage on native, localStorage on web). It holds immutable sales, payments and stock-movement records, plus an **outbox** of pending changes.
- **Backend**: FastAPI (`backend/server.py`) with MongoDB, JWT auth and bcrypt password hashes.

## Architecture
- Every mutation is written locally first, then queued in the outbox with a unique `op_id` (idempotency key).
- Sync (`frontend/src/data/sync.ts`):
  - Sends changes in batches to `POST /api/sync/push`, then pulls `GET /api/sync/pull?since=`.
  - Runs automatically when the device comes back online or the app returns to the foreground, and a short delay after each change.
  - Retries with backoff. A manual sync button is in Pengaturan.
- Duplicates are prevented:
  - The server stores every `op_id` it has applied, so a re-sent change is ignored.
  - Immutable entities (`sales`, `stockMovements`, `payments`) are insert-only, so stock is never reduced twice.
- Conflicts on editable records (products, customers, etc.) are detected with `base_updated_at`. The user then picks "Pakai versi saya" or "Pakai versi server" in Pengaturan. The app does not silently apply "last write wins".
- Business isolation: the server always takes `business_id` from the JWT user, never from the client.
- Stock is calculated from stock movements (awal, masuk, keluar, penyesuaian, penjualan, pembelian), never edited directly.
- Finance:
  - Omzet (sales) is kept separate from cash in (payments received).
  - Piutang = unpaid sales + open invoices. Utang = unpaid purchases.
  - Laba kotor = omzet − HPP. Laba bersih = laba kotor + pendapatan lain − biaya operasional.
  - Purchase payments count as cash out but not as operating cost, because stock cost is counted through HPP.

## Running
- Backend: `uvicorn server:app --host 0.0.0.0 --port 8001`. Needs these values in `backend/.env`: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`.
- Frontend: `cd frontend && yarn expo start`. Needs `EXPO_PUBLIC_BACKEND_URL` in `frontend/.env`.
- Deploy: use the Emergent **Publish** button. Android and iOS builds are generated from the deployment panel.

## API
| Method | Path | Purpose |
|---|---|---|
| POST | /api/auth/register | name, business_name, email, password (min 8) |
| POST | /api/auth/login | rate limited |
| GET | /api/auth/me | current user + business |
| PUT | /api/business | business profile & invoice settings |
| POST | /api/sync/push | ops[] → applied / duplicates / conflicts / rejected |
| GET | /api/sync/pull | changed records since timestamp |
| POST | /api/backup, GET /api/backup/latest | cloud backup snapshots |

## Done
- Login and registration, plus business profile and invoice settings.
- Dashboard with real figures and period filters: today, 7 days, this month, this year.
- POS:
  - Search, category filter, cart, discount per item and per transaction.
  - Payment by tunai, transfer, QRIS or lainnya, with automatic change calculation.
  - Sales on credit (piutang) for a selected customer.
  - Receipt print and PDF share.
- Products: add, edit, archive, stock in/out, stock opname, movement history, low-stock alerts, inventory value.
- Suppliers and purchases: payment status, receiving goods adds stock, extra costs are spread into the unit cost.
- Customers: transaction history, total spend, piutang, and recording later payments.
- Finance: income and expenses, simple laba rugi, cash flow, cash journal.
- Invoices and quotations:
  - Automatic numbering, tax, discount, preview, print, PDF and share.
  - Mark as paid (recorded as income), convert a quotation into an invoice.
- Bills: recurring bills, in-app reminders on the dashboard, paying a bill records an expense.
- HPP calculator: margin and markup shown separately, margin validated to stay under 100%, price simulation.
- Documents & SOP: 9 editable templates, printable.
- Reports: 10 report types with date, category and product filters; export as CSV (opens in Excel) or PDF.
- Backup and restore:
  - Export and import JSON, with file validation and a confirmation step.
  - Cloud backup and restore, and the time of the last backup.
- Demo data: optional, can be removed in one tap.
- Offline-first with a sync status indicator and a manual sync button.

## Not done yet / risks
- This is not a PWA (no service worker or manifest). The web preview works in the browser, but installable offline web needs a separate web build.
- Product photos are not built yet; they need object storage.
- Full double-entry bookkeeping (chart of accounts, balance sheet) is not built. Laba rugi is a simple transaction-based report.
- Local data is not encrypted on the device.
- Multi-device sync has not been tested under heavy concurrent editing. Stock conflicts between devices can make stock negative without any warning.
- There is no barcode scanner yet (camera).
- There are no roles or staff accounts yet; there is one owner per business.
