# TAH — Register Hutang Teknis

Register hutang teknis Tribuana Automation Hub yang **sengaja ditunda** atas keputusan owner.
Setiap entri dijaga oleh `prisma/check-tah-policy.mjs` (bagian HUTANG):

- Selama celahnya masih ada di kode, entri **wajib** ada dengan `Status: OPEN` — menghapus
  entri atau menandainya selesai tanpa memperbaiki kode membuat uji GAGAL.
- Begitu celahnya tertutup di kode, uji juga GAGAL sampai entri diubah **eksplisit** menjadi
  `Status: RESOLVED` (dengan commit/PRD penutupnya). Hutang tak bisa hilang diam-diam ke dua arah.

Baris `Status:` dibaca mesin — jangan ubah formatnya.

---

## TD-005-01 — Celah pencatatan kuota AI

- Status: OPEN
- Dibuka: 2026-09-24 (PRD-005 Step 3A)
- Keputusan owner: D8 = B — diperbaiki sebagai tugas korektif TERPISAH, tidak dicampur ke PRD-005.
- Penjaga: `prisma/check-tah-policy.mjs` → HUTANG / TD-005-01

**Fakta (dari kode di `bae0ae7`):**

1. Kuota `PANGGILAN_AI` menghitung `UsageEvent` yang namanya berawalan `AI_`
   (`src/services/saas/quota.service.ts`).
2. Ekstraksi Vessel Call Intake mencatat `INTAKE_EXTRACTED` — tidak berawalan `AI_`,
   jadi ekstraksi intake tidak pernah terhitung kuota AI
   (`src/services/intake/intake.service.ts`).
3. `PEMAKAIAN_AI_TERCATAT = false` (`src/services/saas/commercial-policy.ts`) dan bawaan paket
   `panggilanAiPerBulan: null` — dalam praktik tak ada batas bulanan panggilan AI. Rem yang
   benar-benar bekerja hanya batas penyalahgunaan 30 panggilan / 5 menit / pengguna
   (`src/services/security/rate-limit.ts`).

**Dampak:** tidak ada batas bulanan biaya AI, termasuk intake.

**Kriteria selesai:** ekstraksi intake terhitung oleh kuota `PANGGILAN_AI` DAN
`PEMAKAIAN_AI_TERCATAT = true`, lalu entri ini diubah menjadi `Status: RESOLVED`
dengan rujukan commit/PRD. (Catatan untuk tugas korektif: `AgentModelCall` mungkin sumber
akuntansi AI yang lebih baik daripada `UsageEvent` — keputusan tugas itu, bukan PRD-005.)

---

## TD-005-02 — Setuju-sendiri intake yang terlihat di portal

- Status: OPEN
- Dibuka: 2026-09-24 (PRD-005 Step 3A)
- Keputusan owner: Q2 = A — alur persetujuan Vessel Call Intake TIDAK diubah selama PRD-005.
- Penjaga: `prisma/check-tah-policy.mjs` → HUTANG / TD-005-02

**Fakta (dari kode di `bae0ae7`):**

- `approveIntake` (`src/services/intake/intake.service.ts`) tidak melarang pengaju
  (`submittedByUserId`) menyetujui intake-nya sendiri.
- Voyage hasil intake dengan customer yang cocok terlihat di portal klien — secara kelas
  risiko TAH itu `EXTERNALLY_VISIBLE`, dan kebijakan owner D9 untuk kelas itu:
  **setuju-sendiri dilarang secara bawaan**.

**Dampak:** kontrol empat-mata belum berlaku untuk intake yang terlihat portal.

**Kriteria selesai:** saat intake dimigrasikan ke gerbang native `TahApprovalRequest`
(atau diberi pagar setuju-sendiri untuk kasus terlihat portal atas keputusan owner),
kebijakan D9 berlaku: `EXTERNALLY_VISIBLE` → setuju-sendiri dilarang secara bawaan.
Lalu entri ini diubah menjadi `Status: RESOLVED` dengan rujukan commit/PRD.
