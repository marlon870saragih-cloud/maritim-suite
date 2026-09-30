# PRD-005 Eval-7 — Log Dataset & Validasi Pra-LIVE

Semua kejadian di bawah terjadi SEBELUM run LIVE apa pun (0 panggilan penyedia, `SPIKE_OPENROUTER_API_KEY` tidak dipakai).
Kandidat `prd005-intake-text/kandidat-validator-v3-1` (sidik `71b9fa5ad7ac6366…`, commit `e04b4ac`) TIDAK diubah.

## 1. Spesifikasi & pool

- `docs/PRD-005-EVAL7-DATASET-SPEC.md` (sha256 `3385aa523a50edaa35e11cbfe73037e733b721e96cae51e22e42a5ccf6ac4bce`) = satu-satunya input
  penulis. Isi: kontrak produk + format anotasi + distribusi A–I; tanpa detail validator V3, tanpa kasus lama.
- Pool baru, diverifikasi TIDAK ada di berkas terlacak repo saat pembuatan: 30 pelabuhan laut Indonesia dari daftar kode UN/LOCODE
  (dataset `datasets/un-locode`, turunan UNECE; situs UNECE diblokir kebijakan jaringan sesi), 60 IMO (check digit sah),
  30 MMSI, 30 call sign; sentinel `XJW7xx`, domain `uji7.invalid`, telepon `+62-557-`.

## 2. Penulisan independen

- Penulis = subagen terpisah; instruksi isolasi: hanya `Read` atas salinan spesifikasi di `/tmp/claude-0/eval7-author/spec.md`
  dan `Write`/`Edit` atas berkas keluaran; dilarang membaca repo/`/home/user`, tanpa Bash/Grep/Glob/web.
- Laporan alat penulis (v1): `Read` spesifikasi ×1, `Write` keluaran ×1, `Edit` keluaran ×3 (swa-koreksi sebelum serah-terima).
  v1 sha256 `6f3db896c70908191c253008aef6b05f67c6240c725807e19791571488b95953`.
- Keterbatasan jujur: isolasi = instruksi + laporan alat, bukan sandbox teknis; penulis dari keluarga model yang sama.
- Distribusi: A7 B5 C6 D4 E3 F3 G3 H4 I5; ID15 EN13 MIX12; 30 NEW_* / 4 INSUFFICIENT / 5 non-keagenan (+1 tak-keagenan ganda
  sesuai GT). Spesifikasi meminta "kira-kira 26 / 14"; penulis melaporkan simpangan ini sendiri — tidak diubah (bukan aturan
  keras pemeriksa).

## 3. Validasi v1 → dikembalikan ke penulis yang SAMA (data saja)

| Kasus | Temuan pemeriksa | Perbaikan penulis |
|---|---|---|
| V31 | T3 nama kapal `ELANG PERKASA` sudah ada di repo | diganti `SANGGALA TIRTAMAYA` (text[4], gt nama present/alternatif, authorNote) |
| V34 | D2 "tahun ditulis langsung": grup `2093` di nomor rekening | rekening → `128-004-771-5836` (text[11] + nilai `forbidden` yang sama) |
| V38 | D2 domain e-mail: titik akhir kalimat terbaca sebagai bagian alamat | kalimat diubah agar alamat tak diikuti titik (text[8]) |

Pesan ke penulis hanya menyebut tabrakan data; tidak ada info validator. Diff struktural v1→v2 diverifikasi: tepat 7 field
berubah, semuanya di V31/V34/V38. Laporan alat penulis (v2): `Read` ×2, `Edit` ×6 atas berkas keluaran saja.
**v2 (beku)** sha256 `f44878e22589bcb8065a6dcb3eb540ab78959edd3776ed672fff264a6c633761`.

## 4. Hasil pemeriksa (v2)

- Integritas GT: 0 temuan (40/40), 0 INFO. Tumpang-tindih: 0 temuan; korpus 1.104 entri (Eval-1..6, RG, prompt, literal
  pengembangan V3); kemiripan maksimum trigram kata 0,150 (V34↔W25), 5-gram karakter 0,241 (V02↔W02); ambang 0,30 / 0,40.
- Manifes beku `prisma/spike-eval7-beku.json`: hash dataset `ca747902…`, hash GT `c209ead7…`, sidik manifes `96992184…`.

## 5. Dry-run jawaban SEMPURNA (jalur produksi, DB loopback, stub, 0 panggilan penyedia) — PENGHALANG LIVE

82/82 slot lewat `submitIntake` produksi; bukti jalur 82/82; 0 FATAL POST; 0 muatan tak berbukti; 0 identitas; 0 pelanggaran
toleransi-nol tambahan; konsistensi ulangan 100%; privasi buku besar & laporan lulus; sisa DB 0. **Held-out 66/80 (82,5%) < 90%
→ verdict dry-run FAIL (`G_LULUS_HELDOUT`).** RAW sempurna = 0 MAJOR; semua MAJOR di POST (validator V3 mengosongkan nilai yang
tertulis — arah aman, tidak pernah nilai salah):

| Kasus | Kat. | Field dikosongkan | Jejak V3 | Pola sumber (ringkas) |
|---|---|---|---|---|
| V09 | B | jumlah | `Q_RELATION` | "… crude loading, approx 250,000 bbls" (penanda perkiraan membuka segmen sesudah koma) |
| V13 | C | operasi (1 dari 4 baris) | `O_NONE` | operasi di kalimat pengantar daftar muatan ("untuk bongkar muatan … berikut:") |
| V16 | C | operasi ×3 | `O_NONE` | "Muatan proyek …, dibongkar di <pelabuhan>:" + daftar |
| V23 | E | operasi ×2 | `O_NONE` | "yang akan memuat pupuk di <pelabuhan>:" + daftar |
| V25 | E | operasi (1 dari 3) | `O_NONE` | "Discharge cargo:" + daftar |
| V28 | F | operasi ×2 | `O_NONE` | "loading at <pelabuhan>" di kalimat nominasi; muatan di baris lain |
| V35 | H | operasi | `O_NONE` | kata operasi terpotong baris ("bong-/kar") |

Atribusi: perilaku kandidat V3 (operasi hanya dari T1/T2/T3 terbatas; T3 hanya untuk SATU muatan; pengikatan jumlah AM3/AM6), bukan
cacat GT — setiap nilai GT tertulis di sumber. Sesuai aturan kritis owner: **STOP**. V3, GT, gerbang TIDAK diubah. Bila V3 kelak
diubah berdasarkan temuan ini, V01–V40 menjadi **EXPOSED — REGRESSION ONLY** dan bukti held-out berikutnya butuh dataset segar B (D5).
