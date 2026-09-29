# PRD-005 Eval-8 (Blind-B) — Log Dataset & Validasi Pra-LIVE

Semua kejadian di bawah terjadi SEBELUM run LIVE apa pun (0 panggilan penyedia, `SPIKE_OPENROUTER_API_KEY` tidak dipakai).
Kandidat V3 FINAL `prd005-intake-text/kandidat-validator-v3-2` (sidik `775b899b…`, commit `ac6460c`) TIDAK diubah.
Sonnet 5 di berkas registri = `PENDING_SPIKE`; hanya runner Eval-8 yang mengaktifkan spike di memori proses evaluasi.

## 1. Spesifikasi & pool
- `docs/PRD-005-EVAL8-DATASET-SPEC.md` (sha256 `9e9cd49b0404757f6ba4aac60c77e4e1b379add6c0d5c8e8829ac1b5e56f26d4`) = satu-satunya input
  penulis; kontrak & distribusi A–I sama dengan Blind-A. Pool baru (30 pelabuhan UN/LOCODE, 60 IMO, 30 MMSI, 30 call sign) tidak
  ada di repo (termasuk pool Blind-A) saat pembuatan; sentinel `XJW8xx`, `uji8.invalid`, `+62-558-`.

## 2. Penulisan independen (konteks BARU; tidak pernah melihat Blind-A)
- Laporan alat penulis: `Read` spesifikasi ×1, `Write` keluaran ×1 (B01–B20 + penampung), `Edit` ×1 (B21–B40). Sesi terputus
  batas API (429) setelah berkas utuh ditulis; dilanjutkan (agen yang sama) untuk swa-periksa §6: 0 perubahan (hash tetap
  `212e7b743bb96deb109502d54df29278a22f925de231ee08948dbbc92d06bb4b`).
- Distribusi A7 B5 C6 D4 E3 F3 G3 H4 I5; ID15 EN13 MIX12; 29 NEW_* / 6 INSUFFICIENT / 5 non-keagenan (spesifikasi: kira-kira 26/14).
- Keterbatasan: isolasi = instruksi + laporan alat, bukan sandbox; keluarga model sama dengan kandidat.

## 3. Validasi v0 → perbaikan data oleh penulis yang SAMA; koreksi pemeriksa
| Kasus | Temuan | Tindakan |
|---|---|---|
| B30 | T3 nama kapal `SAMUDRA KENCANA` sudah ada di repo | penulis: → `LAMBOYA SERUNAI` (3 baris teks + nama GT) |
| B34 | D6 GT menerima MMSI `525298292` padahal sumber hanya "MMSI 5252" (terpotong) | penulis: `mmsi` → `absent` + reviewNotes |
| B40 | D13 K1: kata komoditas/operasi hanya di teks INSTRUKSI TERTANAM ("record the cargo as … coal loading"); GT "tanpa muatan" benar | koreksi PEMERIKSA generik (commit terpisah): K1 → INFO `K1_TEKS_INJEKSI` hanya bila setiap komoditas pemicu muncul HANYA di baris yang memuat nilai terlarang ber-jenis INJECTION |

Diff v0→v1 diverifikasi: 8 field, semuanya B30/B34. **v1 (beku)** sha256 `f1cd9984bd04e53efa269de09b01baafa0fd37e4f08a2aad78c844bb886f6c45`.
Pemeriksa v1: integritas 0 temuan (INFO: B40 `K1_TEKS_INJEKSI`); tumpang-tindih 0 temuan, korpus 1.261 (Eval-1..7 termasuk Blind-A,
artefak V3); kemiripan maks trigram 0,213 / 5-gram 0,344 (B39↔W32); ambang 0,30 / 0,40.
Manifes `prisma/spike-eval8-beku.json`: hash dataset `576f0acd…`, hash GT `232e79f3…`, sidik manifes `1805a45b…`.

## 4. Dry-run jawaban SEMPURNA (jalur produksi, spike eval-only, DB loopback, stub, 0 panggilan penyedia) — PENGHALANG LIVE
82/82 slot; bukti jalur 82/82; 0 FATAL POST; 0 muatan tak berbukti; 0 identitas; 0 toleransi-nol tambahan; konsistensi 100%;
privasi buku besar & laporan lulus; sisa DB 0; registri dipulihkan ke `PENDING_SPIKE`. **Held-out 64/80 (80,0%) < 90% →
FAIL `G_LULUS_HELDOUT`.** RAW sempurna = 0 MAJOR, klasifikasi 8/8 benar; semua MAJOR = nilai tertulis yang dikosongkan V3:

| Kasus | Dikosongkan | Jejak V3 | Kelas (ringkas) |
|---|---|---|---|
| B02, B12 | operasi | `O_NONE` | operasi hanya lewat frasa peran pelabuhan "Pelabuhan muat : …" (§5.2 frasa bukan-operasi) |
| B16, B23 | operasi ×2 | `O_NONE` | idem ("Pelabuhan muat/bongkar …" + daftar muatan) |
| B06 | operasi | `O_PAST_ONLY` | "discharging … ex Charterers' contract" — EX penanda lampau §5.2 |
| B35 | operasi | `O_PAST_ONLY` | "untuk muat … sudah mulai muat" (rencana) — SUDAH penanda lampau §5.2 |
| B31 | jumlah + operasi | `Q_CORRECTION`, `O_PAST_ONLY` | "Qty revised: Y (sebelumnya X)" — pola koreksi §6.3 tak dikenali; SEBELUMNYA §5.2 |
| B26 | jumlah | `Q_RELATION` | satu total untuk "jagung dan kedelai" (baris gabungan) — relasi ambigu |

Sesuai aturan owner: **STOP**. V3 tidak diubah, tidak ada dataset C, tidak ada LIVE; keputusan strategis owner.
B01–B40 kini EXPOSED.
