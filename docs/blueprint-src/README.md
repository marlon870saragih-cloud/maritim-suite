# Sumber Blueprint 2.0 — Volume 1

Pembuat berkas Word `../Maritim Suite Blueprint 2.0 - Volume 1 Executive Blueprint.docx`.

- `content.js` — **isi dokumen**. Sunting di sini. Blok yang tersedia:
  `h1 h2 h3 lead p ul ol table note quote pb rule`.
  Dalam teks: `**tebal**`, `` `kode` ``, `_miring_`. Dalam sel tabel, `||` = baris baru.
- `build.js` — tata letak, warna, sampul, header/footer, daftar isi.

## Cara membangun ulang

```bash
npm install docx          # sekali saja
node build.js
```

Berkas `.docx` ditulis ke folder `docs/`. Setelah itu buka di Word,
klik kanan pada Daftar Isi lalu **Update Field** agar nomor halaman menyesuaikan.

Logo diambil dari `public/logo-transparent.png`.
