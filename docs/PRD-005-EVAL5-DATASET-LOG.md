# PRD-005 Eval-5 — Log Dataset & Validasi Pra-LIVE

Semua kejadian di bawah terjadi SEBELUM run LIVE apa pun (0 panggilan penyedia). Kandidat tidak diubah.

## 1. Penulisan independen

- Penulis: konteks subagen terpisah; input satu-satunya = `docs/PRD-005-EVAL5-DATASET-SPEC.md`
  (sha256 `3c2288f663dc99a163ca727cf3af90b90195bb42a02d367d04dde62a2d6494e5`), ditempel utuh di prompt.
- Alat yang dilaporkan penulis: `Write` ×2 dan `Read` ×1, hanya pada berkas keluarannya sendiri
  (`/tmp/…/eval5-author/eval5-blind-cases.json`). Tidak ada Bash/Grep/Glob/akses repo.
- Keterbatasan: isolasi ditegakkan lewat instruksi + laporan alat, bukan sandbox teknis; penulis dari keluarga model yang sama
  dengan kandidat.
- Versi 1 (sha256 `29e0228249c368746e5fac71c498399673e12673c0d2545beaa1f84bcd739c86`): 40 kasus; A8 B5 C7 D4 E4 F6 G3 H3;
  ID15 EN15 MIX10; 25 NEW_* / 7 INSUFFICIENT / 8 non-keagenan.

## 2. Validasi versi 1

### 2.1 Koreksi pemeriksa (bukan data) — sebelum pembekuan, tanpa melihat keluaran model

| Aturan | Masalah | Koreksi |
|---|---|---|
| D3 | nilai pool dihitung per kemunculan; kasus koreksi IMO (Z23) menulis IMO salah & benar dalam satu kasus | batas "sekali" berlaku lintas kasus (sesuai spesifikasi §2.3 "whole dataset") |
| D6 | label IMO dicari ≤ 14 karakter; "IMO / Call sign : 9864019" dan "IMO MV X yang benar 9864306" berlabel sah | jendela ≤ 40 karakter pada baris yang sama |
| D5 | alternatif nama MUATAN berupa sinonim/terjemahan (jagung ↔ corn, CPO ↔ crude palm oil) dianggap cacat | alternatif nama muatan dikecualikan (pola `sinonim` Eval-4; hanya memperluas bentuk diterima); alternatif field identitas tetap wajib tertulis |
| D11 | nilai terlarang yang tidak tertulis (Palu/IDPSJ di Z22 — menjaga inferensi dari kode/nama) dianggap cacat; kontradiksi dinilai tanpa memperhatikan lingkup | nilai terlarang tak tertulis sah; kontradiksi hanya bila nilai terlarang = nilai GT diterima pada lingkup yang sama |

### 2.2 Cacat dataset → dikembalikan ke penulis independen (perbaikan dataset saja)

| Kasus | Temuan | Aturan |
|---|---|---|
| Z31 | laporan pasar menulis muatan + operasi, GT hanya `[[]]` (kontradiksi GT↔sumber) | D13/K1 |
| Z35 | entri kapal tanpa identitas apa pun; ekstraksi benar (tanpa kapal) akan dinilai MISSING_VESSEL | semantik anotasi |
| Z02, Z10, Z12, Z24 | nama kapal/pihak sudah ada di repo (ANGGREK SAMUDRA, CEMPAKA NUSA, TERATAI BIRU, LINTANG BAHARI, KUMALA SARI) | T3/T6 |

### 2.3 Temuan pra-LIVE tentang KANDIDAT (bukan cacat GT — data TIDAK diubah)

Dry-run jalur produksi dengan jawaban SEMPURNA dari GT (stub, 0 panggilan penyedia) menghasilkan MAJOR POST pada 5 kasus yang
GT-nya setia pada sumber, karena validator produksi mengosongkan nilai muatan yang tertulis:

| Kasus | Sumber | Yang dikosongkan validator |
|---|---|---|
| Z05 | `55000 WMT` | jumlah + satuan (WMT bukan satuan leksikon) |
| Z07 | `12000 MT palm kernel expeller … to be loaded` | operasi |
| Z08 | `4500 KL` | jumlah + satuan (KL bukan satuan leksikon) |
| Z17 | `discharge call` / `Discharge port` + `Cargo: 21000 MT milling wheat` | operasi |
| Z40 | `380` / `MT` terpisah pindah baris | jumlah + satuan baris kedua, operasi |

Konsekuensi: 10 dari 80 slot held-out tidak bisa lulus (slot lulus = 0 FATAL & 0 MAJOR) walau keluaran model sempurna →
batas atas kelulusan held-out 87,5% < ambang 90%. Perilaku ini konservatif (tidak mengarang), tetapi di bawah gerbang yang
disetujui owner menghasilkan FAIL `G_LULUS_HELDOUT`. Kasus TIDAK diubah (mengubahnya = menyetel dataset agar kandidat lulus).
Bila owner memilih memperbaiki validator, kelima kasus ini (dan pengetahuan ini) berstatus TERPAPAR untuk kandidat baru.

## 3. Versi 2 (beku)

- Perubahan penulis (diverifikasi diff: hanya Z02, Z10, Z12, Z24, Z31, Z35 yang berubah; 34 kasus lain identik):
  Z02 ANGGREK SAMUDRA → BENTALA KIRANA; Z10 CEMPAKA NUSA → WIRAGUNA TAMBORA; Z12 TERATAI BIRU → SANGKAR LARASATI dan
  PT Lintang Bahari → PT Gantari Pramudya; Z24 KUMALA SARI → ARGA SUNDARI; Z31 teks laporan pasar ditulis ulang tanpa
  pernyataan muatan (GT tetap `[[]]`); Z35 `vessels` → `[]` (tidak ada identitas tertulis). Alat penulis: Read + Write pada
  berkas keluarannya saja.
- Berkas beku: sha256 `654e7a9f291d28b77587bf6f922f25e555d42be6c069d6d3795ed8987c288011`;
  hash dataset kanonik `21dc22f6921e84fd21cada0e1ab878e71b2c354341ea10f697c8db2c07a83821`;
  hash GT `6c8fa7dd8cd2c019115d5a17ad3cd3cba2e54b2c4d3d9ab2b2f4bff23cc7abb5`.
- Integritas GT: 0 temuan. Tumpang-tindih: 0 temuan (korpus 648 entri; kemiripan maks trigram 0,088 / 5-gram 0,147).
- Dry-run jalur produksi (stub, 0 panggilan penyedia): 82/82 slot OK, bukti jalur produksi 82/82, sisa DB 0, privasi lulus;
  temuan §2.3 tetap (70/80 slot held-out lulus dengan jawaban sempurna).
