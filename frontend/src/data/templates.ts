// Editable document/SOP templates seeded once per business (deterministic ids avoid duplicates across devices).
export const DOC_TEMPLATES: { id: string; title: string; category: string; content: string }[] = [
  {
    id: "tpl-sop-toko",
    title: "SOP Operasional Toko",
    category: "SOP",
    content:
      "1. Toko buka pukul 08.00 dan tutup pukul 21.00.\n2. Karyawan hadir 15 menit sebelum toko buka.\n3. Pastikan area toko bersih dan produk tertata rapi.\n4. Sapa setiap pelanggan dengan ramah.\n5. Catat setiap kejadian penting di buku laporan harian.\n6. Laporkan produk rusak atau kedaluwarsa kepada pemilik.",
  },
  {
    id: "tpl-sop-kasir",
    title: "SOP Kasir",
    category: "SOP",
    content:
      "1. Hitung uang modal kasir di awal shift dan catat jumlahnya.\n2. Masukkan setiap penjualan melalui menu Kasir di USAHORA.\n3. Periksa kembali jumlah barang sebelum menyimpan transaksi.\n4. Hitung uang yang diterima dan berikan kembalian sesuai layar.\n5. Untuk pembayaran transfer/QRIS, pastikan dana sudah masuk.\n6. Di akhir shift, cocokkan uang kas dengan laporan penjualan hari ini.",
  },
  {
    id: "tpl-sop-stok",
    title: "SOP Pengelolaan Stok",
    category: "SOP",
    content:
      "1. Setiap barang masuk dicatat melalui Stok Masuk atau Pembelian.\n2. Barang rusak/hilang dicatat melalui Stok Keluar dengan keterangan.\n3. Lakukan stock opname minimal sebulan sekali (Penyesuaian Stok).\n4. Periksa daftar Stok Menipis setiap pagi.\n5. Terapkan prinsip FIFO: barang yang masuk lebih dulu dijual lebih dulu.",
  },
  {
    id: "tpl-sop-pembelian",
    title: "SOP Pembelian",
    category: "SOP",
    content:
      "1. Buat daftar kebutuhan berdasarkan laporan stok menipis.\n2. Bandingkan harga minimal dari dua supplier.\n3. Catat pembelian di menu Pembelian.\n4. Periksa jumlah dan kondisi barang saat diterima, lalu tandai Diterima.\n5. Simpan bukti pembayaran dan catat status pembayaran.",
  },
  {
    id: "tpl-checklist-buka",
    title: "Checklist Pembukaan Toko",
    category: "Checklist",
    content: "[ ] Buka kunci dan nyalakan lampu\n[ ] Bersihkan area depan toko\n[ ] Siapkan uang modal kasir\n[ ] Nyalakan perangkat kasir dan buka USAHORA\n[ ] Periksa stok produk di rak\n[ ] Pastikan papan harga sudah sesuai",
  },
  {
    id: "tpl-checklist-tutup",
    title: "Checklist Penutupan Toko",
    category: "Checklist",
    content: "[ ] Cocokkan uang kas dengan laporan penjualan\n[ ] Lakukan sinkronisasi data di USAHORA\n[ ] Rapikan rak dan bersihkan toko\n[ ] Matikan perangkat listrik\n[ ] Kunci pintu dan jendela",
  },
  {
    id: "tpl-invoice",
    title: "Template Kata Pengantar Invoice",
    category: "Template",
    content:
      "Yth. [Nama Pelanggan],\n\nBersama ini kami kirimkan invoice [Nomor Invoice] dengan total [Total]. Mohon melakukan pembayaran sebelum [Tanggal Jatuh Tempo] ke rekening yang tertera.\n\nTerima kasih atas kepercayaan Anda.\n\nHormat kami,\n[Nama Usaha]",
  },
  {
    id: "tpl-quotation",
    title: "Template Kata Pengantar Quotation",
    category: "Template",
    content:
      "Yth. [Nama Pelanggan],\n\nBerikut kami sampaikan penawaran harga [Nomor Quotation]. Penawaran berlaku selama 14 hari sejak tanggal diterbitkan.\n\nKami siap membantu bila ada pertanyaan.\n\nHormat kami,\n[Nama Usaha]",
  },
  {
    id: "tpl-admin",
    title: "Daftar Dokumen Administrasi",
    category: "Administrasi",
    content: "- NIB (Nomor Induk Berusaha)\n- NPWP usaha / pemilik\n- Izin usaha terkait (PIRT, Halal, dll.)\n- Rekening bank usaha\n- Perjanjian dengan supplier\n- Catatan inventaris aset",
  },
];
