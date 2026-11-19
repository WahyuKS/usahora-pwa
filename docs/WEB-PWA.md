# USAHORA – Website & PWA

USAHORA bisa dipakai sebagai **website** dan **dipasang ke layar utama HP/komputer (PWA)** tanpa
Play Store / App Store. Versi web dibangun dari kode aplikasi yang sama (`frontend/`, Expo +
React Native Web), jadi semua modul yang sudah ada ikut tersedia.

## Mode yang tersedia

| Mode | Kapan aktif | Data disimpan di | Butuh server? |
|---|---|---|---|
| **Lokal (tanpa akun)** | Build tanpa `EXPO_PUBLIC_BACKEND_URL` (default untuk website) | Browser/perangkat pengguna (IndexedDB) | Tidak |
| **Cloud (akun)** | Build dengan `EXPO_PUBLIC_BACKEND_URL=https://...` | Perangkat + server (sinkronisasi) | Ya, backend FastAPI di `backend/` |

Pada mode lokal:
- Pengguna cukup mengisi nama usaha, lalu langsung bisa memakai semua modul.
- Tidak ada data yang dikirim ke server mana pun. Antrean sinkronisasi (outbox) tidak diisi.
- Foto produk/logo, backup cloud, akun karyawan, dan sinkronisasi disembunyikan (butuh server).
- "Keluar" lalu masuk lagi membuka **data usaha yang sama** di perangkat itu.
- Pengguna wajib rutin **Ekspor backup JSON** (Pengaturan → Backup & restore); dashboard mengingatkan bila belum backup 7 hari.
- Masa coba 14 hari, lalu aktivasi kode lisensi sekali bayar yang terikat ID perangkat. Lihat [SELLING.md](SELLING.md).
- **Utang-piutang**: saat menjual bisa Lunas / Bayar sebagian / Belum bayar, dengan tanggal janji bayar. Beranda menampilkan "Perlu ditagih" (terlambat, hari ini, segera) dengan tombol Tagih via WhatsApp; notifikasi perangkat muncul saat USAHORA dibuka di hari jatuh tempo (tanpa server, jadi tidak ada notifikasi saat aplikasi tertutup).
- **Tampilan Terang / Gelap / Ikuti HP** di Pengaturan → Tampilan.
- Khusus pemilik: menu **Jual** (dulu "Kasir") menampilkan **untung dan margin** setiap transaksi sebelum disimpan; dashboard menonjolkan **Untung bersih**.
- Beberapa perangkat: Impor backup (pindah) dan "Gabungkan dari perangkat lain" (manual, tanpa server).
- Struk ke printer thermal Bluetooth (BLE, 58 mm) lewat Chrome/Edge di Android atau laptop.

## Penyimpanan (web)

- Data disimpan di **IndexedDB** per usaha (`usahora_<businessId>`), ditulis per record yang berubah.
- Saat pertama kali dibuka setelah update, data lama di localStorage **disalin sekali** ke IndexedDB,
  diverifikasi, dan **tidak pernah diubah/dihapus**. Setelah itu salinan lama dibekukan: tidak ditulis
  dan tidak dimigrasi ulang, sehingga data yang dihapus tidak bisa muncul kembali.
- Jika IndexedDB tidak tersedia (mis. mode privat tertentu) atau migrasi gagal, aplikasi tetap memakai
  localStorage seperti sebelumnya (tidak ada data hilang). Pengaturan menampilkan jenis penyimpanan.
- Aplikasi meminta browser menyimpan data secara permanen (`navigator.storage.persist()`).

## Menjalankan secara lokal

```bash
cd frontend
npx yarn@1.22.22 install          # sekali saja
npx yarn@1.22.22 build:web        # expo export + service worker → folder dist/
npx yarn@1.22.22 serve:web        # buka http://localhost:8080
```

Pengembangan dengan hot reload: `npx expo start --web` (service worker tidak aktif di mode ini).

## Isi build (`frontend/dist/`)

| File | Fungsi |
|---|---|
| `index.html` | Dari `public/index.html`: meta PWA, ikon iOS, pendaftaran service worker |
| `manifest.webmanifest` | Nama, warna, ikon, `display: standalone` |
| `icons/` | 192, 512, maskable 512, apple-touch 180, favicon. Dibuat ulang dengan `yarn icons:pwa` |
| `sw.js` | Dibuat `scripts/build-sw.js`: precache semua file build ini, versi cache = hash isi build |
| `404.html` | Salinan `index.html` untuk hosting tanpa aturan rewrite |
| `_redirects`, `_headers` | Aturan SPA dan cache untuk Netlify / Cloudflare Pages |

Service worker:
- Halaman: coba jaringan dulu (agar versi baru cepat terpakai), jika offline pakai `index.html` dari cache.
- File statis (nama mengandung hash): cache dulu.
- Tidak pernah meng-cache request ke server lain, `/api/*`, atau URL dengan `?token=`.
- Deploy baru → cache baru otomatis menggantikan yang lama.

## Deploy (hosting statis, HTTPS wajib untuk PWA)

Aplikasi memakai path absolut, jadi harus di-hosting di **root domain** (misalnya
`https://app.usahora.id/`), bukan di subfolder.

**Netlify / Cloudflare Pages**
- Build command: `cd frontend && npx yarn@1.22.22 install --frozen-lockfile && npx yarn@1.22.22 build:web`
- Publish directory: `frontend/dist`
- `_redirects` dan `_headers` sudah ikut di build.

**Vercel**
- Root directory `frontend`, build command `npx yarn@1.22.22 build:web`, output `dist`.
- Tambahkan rewrite semua path ke `/index.html` dan header `Cache-Control: no-cache` untuk `/sw.js`.

**GitHub Pages**
- Hanya cocok dengan custom domain di root (karena path absolut). `404.html` sudah disediakan
  sebagai fallback SPA.

Untuk mengaktifkan akun cloud: set `EXPO_PUBLIC_BACKEND_URL=https://api.domainanda.id` saat build,
dan jalankan backend (`backend/`, lihat README utama).

## Cara memasang (untuk pengguna)

- **Android (Chrome):** buka situs → menu ⋮ → *Install app* / *Tambahkan ke layar utama*.
- **iPhone/iPad (Safari):** buka situs → tombol Bagikan → *Add to Home Screen*.
- **Windows/macOS (Chrome/Edge):** ikon install di address bar.

## Yang sudah diuji (19 Nov 2026, build lokal + browser Chromium)

- Mulai usaha baru tanpa akun → dashboard kosong yang informatif (tanpa angka palsu).
- Tambah produk (stok awal dicatat sebagai pergerakan stok).
- Transaksi kasir: 2 item, tunai Rp50.000 → kembalian Rp20.000, stok 20 → 18, pergerakan
  `penjualan -2`, pembayaran tercatat, nomor transaksi unik.
- Keuangan: omzet Rp30.000, HPP Rp20.000, laba kotor Rp10.000; pengeluaran Rp5.000 → laba bersih
  Rp5.000, arus kas Rp25.000.
- Invoice: nomor otomatis, pratinjau, total Rp500.000, tercatat sebagai piutang di dashboard.
- Data tetap ada setelah reload dan setelah Keluar → Buka lagi.
- **Offline:** server dimatikan → 19 rute tetap terbuka langsung dari URL; pengeluaran dicatat saat offline.
- Update: build baru otomatis menggantikan cache lama.
- Responsif: 10 halaman × 6 lebar (360, 390, 430, 768, 1024, 1440 px) tanpa elemen meluber.
- Console: tidak ada error saat pemakaian normal.
- Unit test: 103 (101 lama + 2 mode lokal), 1 dilewati.

## Belum diuji / batasan

- Belum diuji di HP Android/iPhone sungguhan, Safari, dan Firefox. Pemasangan PWA belum dicoba
  di perangkat nyata (hanya diverifikasi manifest, ikon, dan service worker aktif).
- Penyimpanan web sudah IndexedDB. Data tetap dimuat penuh ke memori saat aplikasi dibuka, jadi
  usaha dengan puluhan ribu transaksi perlu diuji kecepatannya.
- Printer Bluetooth belum diuji dengan printer fisik (hanya dengan printer tiruan di tes otomatis).
- "Gabungkan dari perangkat lain" belum diuji lewat pemilih file di browser (logikanya diuji otomatis).
- Safari/iOS dapat menghapus data situs yang tidak dibuka ±7 hari jika tidak dipasang ke layar utama.
  Sarankan pengguna memasang PWA dan rutin backup.
- Data lokal tidak dienkripsi.
- Ekspor/impor backup JSON dan ekspor CSV/PDF memakai kode yang sudah ada; belum diuji ulang di build web ini.
- Ukuran unduhan pertama ±5 MB (sebagian besar font dan JavaScript), setelah itu dari cache.
