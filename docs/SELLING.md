# Menjual USAHORA (sekali bayar, tanpa langganan)

Panduan untuk penjual: lisensi, masa coba, hosting, dan informasi jujur untuk pembeli.

## 1. Alur penjualan

1. Pembeli membuka website USAHORA → **masa coba gratis 14 hari** (semua fitur).
2. Pembeli membayar (Lynk.id, Shopee, transfer, dll.) dan mengirim **ID perangkat** yang tampil di
   **Lainnya → Lisensi** (contoh `JPZR-MR83-BT38`; ada tombol "Kirim via WhatsApp" berisi pesan siap kirim).
3. Anda membuat **kode lisensi untuk ID perangkat itu** (langkah 2) dan mengirimkannya.
4. Pembeli menempel kode di **Lainnya → Lisensi** (atau di layar "Aktifkan USAHORA" setelah masa coba habis).
5. Lisensi dicek di perangkat **tanpa internet**, berlaku seumur hidup, tanpa langganan.
   **Kode hanya berlaku di perangkat itu**: jika dibagikan, kode ditolak di perangkat lain.

Setelah masa coba habis tanpa lisensi, aplikasi menampilkan layar aktivasi. **Data pembeli tidak
dihapus** dan tombol **Ekspor backup data** tetap tersedia.

## 2. Membuat kode lisensi

Sekali saja (sudah dilakukan saat pengembangan, kunci ada di `tools/license-sign/keys/`):

```bash
node tools/license-sign/sign.js init
```

Untuk setiap pembeli:

```bash
node tools/license-sign/sign.js issue --name "Toko Maju Jaya" --device JPZR-MR83-BT38 --order "SHP-12345"
```

Kirim baris yang diawali `USAHORA-...` ke pembeli. `--device` wajib. Catat nomor order + ID perangkat
(misalnya di spreadsheet) supaya Anda tahu berapa perangkat yang sudah diberi kode per pembeli.

### Kebijakan perangkat (saran)

- 1 lisensi = **2 perangkat** (misalnya HP + laptop): buat 2 kode dengan `--order` yang sama.
- **Ganti perangkat / data browser terhapus** → ID perangkat berubah. Buat kode baru untuk ID baru
  (saran: gratis, maksimal 3 kali per tahun). Pembeli memulihkan datanya dengan Impor backup.
- Kode lama tanpa ID perangkat (dibuat sebelum fitur ini) **tidak berlaku lagi**. Nama pada lisensi tampil di aplikasi
("Dilisensikan untuk Toko Maju Jaya"), jadi gunakan nama pembeli/usahanya.

Cek kode (untuk bantuan pembeli): `node tools/license-sign/sign.js verify <kode>`

### PENTING: kunci privat

- `tools/license-sign/keys/private.pem` adalah **kunci untuk membuat lisensi**. Tidak masuk git
  (sudah di `.gitignore`) dan tidak ada di aplikasi.
- **Simpan cadangannya** (USB, password manager, Google Drive pribadi yang terenkripsi).
  Jika hilang, Anda tidak bisa membuat lisensi baru yang diterima aplikasi; harus membuat kunci baru,
  build ulang, dan lisensi lama tetap berlaku hanya karena kunci publik lama ada di build lama.
- Jika bocor, siapa pun bisa membuat lisensi. Buat kunci baru (`init` setelah memindahkan yang lama),
  ganti `frontend/src/license/public-key.ts`, build ulang.

## 3. Hosting

Lihat [WEB-PWA.md](WEB-PWA.md). Ringkas: build `frontend/dist`, hosting statis HTTPS di root domain
(Netlify / Cloudflare Pages). Tombol "Beli lisensi" di aplikasi diaktifkan dengan:

```bash
EXPO_PUBLIC_PURCHASE_URL=https://lynk.id/namaanda/usahora npx yarn@1.22.22 build:web
```

Tanpa variabel itu, aplikasi menulis "Hubungi penjual USAHORA tempat Anda membeli."

## 4. Batasan yang harus dijelaskan ke pembeli (jujur = lebih sedikit komplain)

| Topik | Kenyataan |
|---|---|
| Penyimpanan | Data tersimpan di browser/HP pembeli (IndexedDB), **tidak di server**. Hapus data browser / ganti HP tanpa backup = data hilang. Wajib backup rutin (aplikasi mengingatkan tiap 7 hari). |
| iPhone | Pasang ke layar utama (Safari → Bagikan → Add to Home Screen). Tanpa itu, Safari bisa menghapus data situs yang tidak dibuka ±7 hari. |
| Beberapa perangkat | Tidak ada sinkronisasi otomatis. Bisa **pindah perangkat** (Impor backup) dan **menggabungkan data** dari perangkat lain secara manual (Pengaturan → Gabungkan dari perangkat lain). Penghapusan tidak ikut tergabung. |
| Printer Bluetooth | Struk 58 mm ESC/POS lewat **Chrome/Edge di Android atau laptop** dengan printer BLE. **Tidak bisa di iPhone** (Safari tidak mendukung Bluetooth web). Printer Bluetooth klasik (non-BLE) tidak terjangkau dari browser. Alternatif selalu ada: Cetak / Bagikan PDF. |
| Foto produk, akun karyawan, backup cloud | Tidak tersedia di versi tanpa server. |
| Lisensi | Satu kode untuk satu ID perangkat, dicek offline. Hapus data browser / install ulang = ID baru, minta kode baru ke penjual. |
| Enkripsi | Data di perangkat tidak dienkripsi khusus; lindungi HP dengan kunci layar. |

### Teks FAQ siap pakai

- **Apakah perlu bayar bulanan?** Tidak. Sekali bayar, berlaku seumur hidup.
- **Bisa offline?** Bisa. Setelah dibuka sekali, kasir, stok, keuangan, invoice, dan laporan jalan tanpa internet.
- **Data saya disimpan di mana?** Di HP/laptop Anda sendiri, tidak dikirim ke server. Karena itu lakukan backup rutin.
- **Bisa di HP dan laptop?** Bisa dipasang di keduanya, tetapi data tidak sinkron otomatis. Gunakan backup + "Gabungkan dari perangkat lain".
- **Bisa cetak struk ke printer thermal?** Bisa lewat Chrome di Android/laptop dengan printer Bluetooth BLE 58 mm. Di iPhone gunakan Cetak/PDF.
- **Coba dulu?** Ya, gratis 14 hari tanpa daftar.

## 5. Sebelum mulai menjual (checklist)

- [ ] Simpan cadangan `private.pem` di tempat aman.
- [ ] Deploy ke domain sendiri (HTTPS).
- [ ] Uji di HP Android (Chrome) dan iPhone (Safari): install, tambah produk, transaksi, offline, backup.
- [ ] Uji printer Bluetooth yang akan Anda rekomendasikan ke pembeli.
- [ ] Buat 1 lisensi untuk diri sendiri dan coba aktivasi di HP.
- [ ] Siapkan video tutorial singkat dan nomor bantuan.
