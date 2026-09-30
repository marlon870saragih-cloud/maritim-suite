# PRD-005 Eval-6 — Log Dataset & Validasi Pra-LIVE

Semua kejadian di bawah terjadi SEBELUM run LIVE apa pun (0 panggilan penyedia). Kandidat
(`prd005-intake-text/kandidat-pasca-eval5-1`, sidik `59b6b537…`) tidak diubah.

## 1. Penulisan independen

- Input satu-satunya penulis: `docs/PRD-005-EVAL6-DATASET-SPEC.md` (sha256 `c1fa6bb0524ca6afac00b86127b766dd831f3286bb27672ab4846da1f33379b6`),
  ditempel utuh di prompt bersama aturan isolasi. Prompt diperiksa: tidak memuat kasus Eval-5, audit/remediasi, Z05/Z07/Z08/Z17/Z40,
  `intake-policy.ts`, leksikon, Prompt v4, keluaran model, atau sentinel lama.
- Percobaan 1: gagal karena batas sesi (429) sebelum menulis berkas — tidak ada keluaran.
- Percobaan 2 (dipakai): alat yang terekam di transkrip = `Write` ×1 pada `/tmp/claude-0/eval6-author/eval6-blind-cases.json`, lalu
  serah-terima. Tidak ada Bash/Grep/Glob/Read repo. Versi 1 sha256 `0e9d084a40579255aa3e6ec50180c66360a3bd06932cb0d0605a84fcb6a8e3bf`.
- Percobaan 3: diluncurkan karena percobaan 2 tampak macet pada batas pemakaian; dihentikan sebelum menulis apa pun (transkrip: hanya
  `Read` berkas instruksi). Tidak berkontribusi pada dataset.
- Keterbatasan jujur: isolasi = instruksi + transkrip alat, bukan sandbox teknis; penulis dari keluarga model yang sama dengan kandidat.
- Distribusi (dilaporkan & diperiksa): A8 B5 C6 D5 E4 F6 G3 H3; ID15 EN15 MIX10; 25 NEW_* / 8 INSUFFICIENT / 7 non-keagenan.

## 2. Validasi versi 1

### 2.1 Tumpang-tindih → dikembalikan ke penulis yang SAMA (perbaikan dataset saja)

| Kasus | Temuan | Perbaikan |
|---|---|---|
| W03 | T3 nama kapal `SERAYU PERMATA` sudah ada di repo | penulis mengganti menjadi `RANGSANG BESTARI` (5 field W03: `text[0]`, `text[4]`, `text[7]`, `gt.vessels[0].name.present/alternatives`) |

Pesan ke penulis hanya menyebut tabrakan nama; tidak ada info validator. Diff struktural v1→v2 diverifikasi: tepat 5 field W03
berubah, tidak ada yang lain. Versi 2 (beku) sha256 `6dfe40153893b54bb24dd6d73a0c0d33b76cbbeb099b18d912c05517dde9d0b1`.

### 2.2 Koreksi pemeriksa (bukan data) — sebelum dry-run, tanpa keluaran model

| Aturan | Masalah | Koreksi |
|---|---|---|
| D7 + D13/K3 | "steel H-beam 420 MT" (W27): token `BEAM` pada nama profil baja dibaca sebagai label partikular kapal (lebar) → 420 dianggap bukan jumlah muatan. GT setia pada sumber. | nama profil berhuruf-hubung `H-/I-/WF-BEAM(S)` dinormalkan hanya untuk uji konteks D7 dan pengulangan K3; bila K3 hilang → INFO `K3_PROFIL_BAJA`. Generik (bukan per ID). Uji waras: "Beam 420 MT" sebagai partikular TETAP ditandai D7 + K3. |

### 2.3 Hasil akhir pemeriksa (versi 2)

- Integritas GT: 0 temuan (40/40 sumber↔GT konsisten); INFO: W27 `K3_PROFIL_BAJA`.
- Tumpang-tindih: 0 temuan; korpus 756 entri. Kemiripan maksimum: trigram kata 0,161 (W33 ↔ Z28), 5-gram karakter 0,264
  (W33 ↔ Z28); ambang 0,30 / 0,40; 0 mencurigakan.

## 3. Temuan pra-LIVE tentang KANDIDAT (bukan cacat GT — data TIDAK diubah, kandidat TIDAK diubah)

Dry-run jalur produksi (`submitIntake`, DB loopback, stub = jawaban SEMPURNA dari GT, 0 panggilan penyedia): **held-out 60/80
(75%)**. Pada ke-10 kasus yang gagal, RAW sempurna = 0 MAJOR; semua MAJOR ada di POST dengan atribusi `VALIDATOR`
(nilai tertulis dikosongkan). 0 FATAL, 0 muatan tak berbukti, 0 identitas, 0 pelanggaran toleransi-nol tambahan.

| Kasus | Sumber (ringkas) | Dikosongkan validator | Mekanisme (terverifikasi dari isi leksikon v2) |
|---|---|---|---|
| W13 | "semen curah ± 5.000 MT … untuk bongkaran" (prosa) | operasi | `BONGKARAN` bukan alias operasi |
| W15 | "40.000 zak … (± 2.000 ton)", "350 ton"; "bongkar semen" | jumlah ×2, operasi ×3 | satuan `ZAK`/`TON` tak ada di leksikon; operasi di luar baris muatan |
| W16 | "akan load di Kuala Kapuas" (prosa) + catatan "last voyage … discharge 4.100 MT CPO" | operasi ×2 | operasi bukan di baris muatan; catatan voyage lalu memicu `CONTRADICTS` |
| W21 | "beras 1.500 ton dan gula … ton" | jumlah ×2 | satuan `TON` tak ada |
| W27 | "steel H-beam 420 MT" | jumlah | `BEAM` label bukan-jumlah |
| W28 | "18 units heavy equipment" | jumlah | satuan `UNITS` tak ada |
| W36 | "jagung pipilan ± 2.600 ton untuk dimuat" | jumlah, operasi | `TON` tak ada; `DIMUAT` bukan alias |
| W38 | "LOAD CRUDE OIL ABT 45000 BBLS" | jumlah | satuan `BBLS` tak ada |
| W39 | "untuk pemuatan pasir besi ± 12.000 MT" | operasi | `PEMUATAN` bukan alias |
| W40 | OCR "pupuk urea ± 3.000 / ton bongkar" | jumlah, operasi | `TON` tak ada (+ patahan baris OCR) |

Konsekuensi: dengan gerbang yang dibekukan (held-out ≥ 90%), run LIVE hampir pasti berakhir **FAIL `G_LULUS_HELDOUT`** apa pun
kualitas model. Perilaku ini gagal-tertutup (tidak mengarang), jadi gerbang keselamatan tetap informatif. Gerbang TIDAK dilonggarkan,
GT TIDAK diubah, kandidat TIDAK diubah.

**Paparan:** dry-run ini mengungkap perilaku validator per kasus W01–W40 ke sesi implementasi. Bila validator diremediasi berdasarkan
temuan di atas, paket W01–W40 menjadi **EXPOSED — REGRESSION ONLY** untuk kandidat baru tersebut, dan bukti held-out berikutnya
memerlukan paket baru.
