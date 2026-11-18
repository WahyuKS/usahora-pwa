# USAHORA – Catatan teknis untuk Phase 2

Status: catatan, **belum diimplementasikan**. Dibuat pada Phase 1.1 (storage hardening) dari hasil
code review PR #1. Temuan di sini sengaja tidak diperbaiki di Phase 1.1 karena bergantung pada cara
`store.ts` disambungkan ke repository (`src/data/db`).

Batasan produk yang berlaku untuk semua solusi di bawah:
offline-first, data lama tidak dihapus, tidak ada perubahan UI/menu, bukan POS/ERP,
model pembelian satu kali (tidak ada ketergantungan wajib pada server).

---

## M3 – Rollback membuang perubahan yang dibuat setelah migrasi

**Masalah.** `rollbackLegacyMigration()` mengembalikan seluruh repository ke snapshot sebelum migrasi
pertama. Semua yang ditulis setelah migrasi ikut hilang. Fungsi ini juga tidak punya pengaman.

**Kenapa belum diperbaiki.** Di Phase 1 tidak ada yang menulis ke repository, jadi belum bisa terjadi.
Begitu `store.ts` menulis ke repository (Phase 2), rollback seperti sekarang berbahaya.

**Arah solusi Phase 2.**
1. Rollback hanya diizinkan selama belum ada penulisan baru setelah migrasi. Catat di `kv`
   (misalnya `writes_since_migration` atau timestamp penulisan pertama). Jika sudah ada, tolak dengan
   pesan jelas.
2. Setelah ada penulisan baru, pemulihan memakai **snapshot berkala** (Phase 7, backup v2), bukan
   rollback migrasi. Sebelum memulihkan, snapshot kondisi saat ini selalu dibuat dulu.
3. Tidak ada tombol rollback di UI pada Phase 2 (tidak mengubah UI). Rollback tetap fungsi pemulihan
   teknis.

**Tes penerimaan.** Rollback ditolak setelah ada penulisan baru; rollback berhasil bila belum ada;
data lama (localStorage/AsyncStorage) tetap utuh di kedua kasus.

## M4 – Data yang dihapus bisa muncul kembali

**Masalah.** Migrasi melakukan upsert dari data lama. Record yang dihapus setelah migrasi pertama
tidak ikut terhapus saat migrasi diulang, dan record yang dihapus di repository bisa "hidup lagi"
dari data lama. Outbox selalu ditimpa dari data lama karena tidak punya `updated_at`.

**Arah solusi Phase 2.**
1. **Satu sumber kebenaran setelah migrasi.** Setelah migrasi berhasil dan diverifikasi, `store.ts`
   hanya membaca/menulis repository. Data lama dibekukan (dibaca saja, tidak dipakai lagi), sehingga
   migrasi tidak perlu diulang dengan sumber yang berubah. `migrateLegacy` dengan `sourceHash` berbeda
   setelah status `done` harus berhenti dan melapor, bukan menggabungkan ulang.
2. **Tombstone untuk penghapusan.** Penghapusan dicatat (`deleted_at` atau tabel `tombstones`
   berisi `entity`, `id`, `deleted_at`). Proses apa pun yang menggabungkan data (migrasi ulang,
   import backup, pull sync) wajib menghormati tombstone yang lebih baru dari record yang masuk.
3. **Outbox**: di-key dengan `op_id` dan tidak pernah di-upsert dari data lama setelah migrasi.
   Op yang sudah terkirim dihapus dari outbox; jangan dihidupkan kembali.

**Tes penerimaan.** Hapus record → migrasi diulang → record tetap terhapus. Hapus → import backup lama
berisi record itu → tetap terhapus (kecuali pengguna memilih "Ganti semua"). Outbox tidak bertambah
atau kembali setelah migrasi diulang.

## M5 – Migrasi tidak mengunci penulisan lain

**Masalah.** Snapshot "sebelum migrasi" diambil di luar transaksi. Pemulihan saat verifikasi gagal
mengosongkan tabel, sehingga penulisan yang terjadi di antara keduanya hilang. Snapshot dari
percobaan migrasi pertama yang gagal bisa sudah usang saat dipakai nanti.

**Arah solusi Phase 2.**
1. **Gerbang start-up.** Migrasi berjalan sebelum `store.ts` membuka data (sebelum UI siap), sehingga
   tidak ada penulisan lain selama migrasi. Ini satu-satunya urutan yang aman dan tetap offline.
2. Snapshot dan penulisan migrasi dijalankan dalam satu transaksi repository (sekarang transaksi
   sudah benar-benar all-or-nothing di Web dan Native setelah Phase 1.1).
3. Snapshot pra-migrasi diperbarui bila percobaan sebelumnya gagal, dan berisi `created_at` serta
   `sourceHash` agar bisa diverifikasi sebelum dipakai.
4. Web: pakai Web Locks (sudah dipakai untuk penulisan sejak Phase 1.1) agar dua tab tidak
   memigrasi sambil menulis bersamaan.

**Tes penerimaan.** Penulisan yang dicoba selama migrasi menunggu sampai migrasi selesai (atau ditolak
dengan jelas), tidak pernah hilang. Verifikasi gagal → isi repository sama persis dengan sebelum
migrasi.

---

## M6 – Batas ukuran AsyncStorage (Android/iOS)

**Fakta (diperiksa dari paket `@react-native-async-storage/async-storage` 2.2.0 yang terpasang):**
- Android memakai SQLite dengan **batas total database 6 MB secara default**
  (`android/config.gradle`, properti Gradle `AsyncStorage_db_size_in_MB`).
- Satu nilai dibaca lewat `CursorWindow` Android (kira-kira 2 MB per baris, tergantung versi
  Android). Nilai yang lebih besar bisa gagal dibaca.
- iOS menyimpan nilai besar sebagai file terpisah; tidak ada batas keras selain ruang disk.

**Dampak pada desain sekarang.**
- Satu tabel = satu nilai JSON. `stockMovements` adalah tabel yang terus bertambah; sekitar 200 byte
  per baris berarti ±10.000 pergerakan sudah mendekati 2 MB.
- Saat commit, versi lama dan baru ada bersamaan, jadi kebutuhan puncak ±2× ukuran tabel yang diubah.
  Total 6 MB bisa tercapai lebih cepat dari yang terlihat.
- Format lama (seluruh database dalam satu nilai) punya batas yang sama, bahkan lebih buruk. Jadi ini
  bukan regresi, tetapi juga belum solusi.
- Setiap penulisan menulis ulang seluruh tabel (O(n)); makin lambat seiring data bertambah.
- Kegagalan baca muncul sebagai `StorageReadError` (data tidak dianggap kosong, tidak ada penimpaan),
  jadi aman dari kehilangan data, tetapi aplikasi tidak bisa membuka tabel itu.

**Rekomendasi.**
1. **Jangka panjang (disarankan): `expo-sqlite` untuk Native** di fase tersendiri. Satu baris per
   record, transaksi asli SQLite, indeks seperti Dexie, tanpa batas 6 MB/2 MB. Antarmuka `Repo`
   tetap sama, jadi `store.ts` tidak perlu tahu. Migrasi dari format v2 ke SQLite memakai pola yang
   sama dengan migrasi sekarang (salin, verifikasi, data lama tidak dihapus).
2. **Jangka pendek, bila SQLite belum siap saat rilis:**
   - Naikkan `AsyncStorage_db_size_in_MB` (misalnya 50) lewat config plugin Expo; perlu build native.
   - Pecah tabel yang terus tumbuh (`stockMovements`, `activities`) per bulan
     (`stockMovements:2026-11`), sehingga setiap nilai tetap kecil dan penulisan hanya menyentuh bulan
     berjalan.
   - Pantau ukuran per tabel dan beri peringatan backup sebelum mendekati batas.
3. Tambahkan tes beban (misalnya 50.000 pergerakan stok) sebelum Phase 2 dirilis ke Android.

---

## L5 – Audit dependensi (`yarn audit`, 19 Nov 2026)

**Hasil.** 0 critical, 0 high, 42 moderate. Semuanya berasal dari **dua** advisory:

| Paket | Advisory | Versi aman | Masuk lewat |
|---|---|---|---|
| `minimatch` (3.1.5, 9.0.9, 10.2.6) | ReDoS lewat pola glob tertentu | ≥ 11.0.1 | `jest`, `babel-jest`, `@expo/fingerprint` |
| `glob` | Pembatalan AbortSignal tidak menghentikan penelusuran file | ≥ 14.0.2 | `jest` (`@jest/core`, `jest-cli`) |

**Evaluasi.**
- Keduanya alat **build/test** di komputer developer atau CI. Tidak ada yang masuk ke bundel aplikasi
  Web, Android, atau iOS, dan tidak memproses input dari pengguna.
- Perbaikannya butuh lompatan versi mayor (minimatch 3/9/10 → 11, glob → 14) di dalam dependensi
  Jest dan Expo. Memaksanya lewat `resolutions` berisiko merusak Jest 30 / Expo SDK 58.

**Rekomendasi.**
- Jangan melakukan upgrade massal atau `resolutions` paksa untuk dua advisory ini.
- Terima risikonya untuk saat ini (alat developer saja). Tinjau ulang saat upgrade Expo SDK berikutnya.
- Jalankan `npx expo install --check` sebelum rilis untuk memastikan versi cocok dengan SDK 58
  (belum dijalankan pada Phase 1.1).

---

## Catatan sisa dari Phase 1.1 (sudah diperbaiki, dengan batasan)

- **Registry Native** melindungi semua pemakai di satu proses JS. Instance yang melewati registry
  (misalnya modul termuat dua kali di bundel) tetap dilindungi oleh pemeriksaan manifest dan
  penanda "pending", tetapi penulisannya bisa ditolak dengan `ConcurrentModificationError`; pemanggil
  di Phase 2 harus mencoba ulang.
- **Web tanpa Web Locks** (browser lama): urutan penulisan hanya terjamin di dalam satu tab.
  Atomicity tetap terjamin, isolasi antar-tab tidak.
- **Transaksi Web** membaca data terkomit + perubahan staged (read committed). Isolasi terhadap
  penulis lain dijamin oleh kunci tulis, bukan oleh transaksi IndexedDB.
- **Salinan defensif** menambah biaya baca untuk tabel besar (salinan JSON di Native,
  structured clone di Web). Perlu diukur bersama M6.
- Belum diuji di perangkat Android/iOS dan browser sungguhan (hanya Jest + fake-indexeddb + AsyncStorage
  tiruan).
