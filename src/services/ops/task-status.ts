// Mesin status Task — MURNI, tanpa satu pun impor nilai (K91/K99, §3).
//
// ❌ MURNI. Kontrak yang sama persis dengan calc-engine.ts, disbursement-status.ts,
// dan owner-guard.ts:
//   1. `import type` SAJA. Impor nilai RELATIF tanpa ekstensi gagal di Node
//      (ERR_MODULE_NOT_FOUND); yang BER-ekstensi `.ts` gagal di tsc (TS5097).
//      Tak ada bentuk impor nilai lintas-modul murni yang lolos keduanya.
//      `import type` terhapus saat Node melakukan type-stripping, jadi
//      specifier-nya tak pernah di-resolve — aman di dua-duanya (K11/K51).
//   2. Tidak melempar ServiceError (itu impor). Penolakan keluar sebagai NILAI
//      ber-`alasan`, dan service layer (7c) yang menerjemahkannya jadi 409/403.
//   3. Tidak ada `new Date()`. `sekarang` selalu masuk sebagai argumen — itulah
//      yang membuat "buka kembali ≤ 24 jam" bisa diuji tanpa menunggu 24 jam.
//
// Karena murni, prisma/check-task-engine.mjs mengimpor berkas ini LANGSUNG dengan
// `node` polos: uji memakai tabel yang PERSIS SAMA dengan yang dipakai aplikasi,
// bukan tiruannya.
//
// ⚠️ Dilarang memakai "parameter property" (`constructor(readonly x: T)`) di
// berkas ini dan saudaranya — penghapus-tipe bawaan Node menolaknya
// (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX). Lihat catatan OwnerGuardError di
// owner-guard.ts.

import type { Role, TaskStatus } from '@prisma/client'

/** Alias lokal supaya modul murni saudaranya tak perlu ikut menyentuh @prisma/client. */
export type StatusTugas = TaskStatus
export type PeranPengguna = Role

/**
 * Graf transisi K91. `Record` lengkap secara sengaja: menambah anggota
 * `TaskStatus` di schema.prisma akan membuat tsc gagal di sini, bukan diam-diam
 * menghasilkan status yang tak punya jalan keluar.
 *
 * Dua baris yang paling mudah salah dibaca:
 *   - `TODO` TIDAK punya jalan langsung ke `DONE`. Pekerjaan yang tak pernah
 *     "dimulai" membuat `startedAt` kosong dan cycle time tak berarti apa-apa;
 *     jalurnya wajib lewat `IN_PROGRESS`.
 *   - `DONE → IN_PROGRESS` ada, tapi BERPAGAR (lihat bolehTransisiTugas).
 *     Tabel ini menjawab "apakah busurnya ada", bukan "apakah orang ini boleh".
 */
export const TRANSISI_TUGAS: Readonly<Record<StatusTugas, readonly StatusTugas[]>> = {
  TODO: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
  IN_PROGRESS: ['TODO', 'BLOCKED', 'DONE', 'CANCELLED'],
  BLOCKED: ['TODO', 'IN_PROGRESS', 'CANCELLED'],
  DONE: ['IN_PROGRESS'], // "buka kembali" — berpagar peran + jendela waktu
  CANCELLED: [], // terminal, sejalan disbursement-status.ts
}

/** `CANCELLED` terminal. `DONE` TIDAK terminal — ia masih punya jalan keluar berpagar. */
export const STATUS_TERMINAL_TUGAS: ReadonlySet<StatusTugas> = new Set<StatusTugas>(['CANCELLED'])

/**
 * K91 — jendela "buka kembali". Bukan ambang SLA, jadi TIDAK tinggal di
 * sla-policy.ts (yang khusus P32/P33/P34); ini aturan mesin status.
 *
 * Kenapa 24 jam dan bukan "selamanya": melarang buka-kembali sama sekali membuat
 * orang membuat tugas duplikat; membiarkannya bebas membuat angka penyelesaian
 * SLA tak berarti apa-apa, karena tenggat masa lalu bisa dinilai ulang kapan saja.
 */
export const JAM_BUKA_KEMBALI = 24

/**
 * K91 + K98 — hanya dua peran ini yang boleh membuka kembali tugas yang sudah
 * `DONE`. `OPERATOR` sengaja TIDAK termasuk: mengoreksi penilaian pekerjaan
 * adalah wewenang koordinasi, bukan wewenang pelaksana.
 */
export const PERAN_BOLEH_BUKA_KEMBALI: readonly PeranPengguna[] = ['ADMIN', 'MANAJER_OPERASI']

export type AlasanTolakTransisi =
  | 'TRANSISI_TAK_SAH'
  | 'BLOKIR_TANPA_ALASAN'
  | 'BUKA_KEMBALI_PERAN'
  | 'BUKA_KEMBALI_KEDALUWARSA'
  | 'BUKA_KEMBALI_TANPA_COMPLETED_AT'

export type HasilTransisiTugas =
  | { boleh: true }
  | { boleh: false; alasan: AlasanTolakTransisi; pesan: string }

export type PermintaanTransisi = {
  dari: StatusTugas
  ke: StatusTugas
  /**
   * Peran pelaku, DITERIMA SEBAGAI ARGUMEN — berkas ini tidak pernah membaca
   * sesi, konteks, atau global apa pun. Itulah yang membuat pagar peran bisa
   * diuji dengan tujuh nilai peran tanpa satu pun login.
   */
  peran: PeranPengguna
  /** Wajib tak-kosong saat `ke === 'BLOCKED'` (K91). */
  blockedReason?: string | null
  /** Snapshot K99 milik tugas saat ini — dipakai hanya untuk jendela buka-kembali. */
  completedAt?: Date | null
  /** Selalu disuntikkan; tak ada `new Date()` di modul murni (K11). */
  sekarang: Date
}

const kosong = (teks: string | null | undefined): boolean =>
  typeof teks !== 'string' || teks.trim() === ''

/** Apakah busurnya ada di graf K91 — tanpa memandang peran atau syarat lain. */
export const busurTugasAda = (dari: StatusTugas, ke: StatusTugas): boolean =>
  TRANSISI_TUGAS[dari].includes(ke)

/** Transisi ini adalah "buka kembali" K91? */
export const adalahBukaKembali = (dari: StatusTugas, ke: StatusTugas): boolean =>
  dari === 'DONE' && ke === 'IN_PROGRESS'

export const bolehBukaKembali = (peran: PeranPengguna): boolean =>
  PERAN_BOLEH_BUKA_KEMBALI.includes(peran)

/**
 * Pemeriksaan transisi lengkap K91: graf → syarat `BLOCKED` → pagar buka-kembali.
 *
 * Yang TIDAK diperiksa di sini karena butuh database: apakah pelaku adalah
 * penanggung jawab tugasnya (baris "ubah status tugas milik sendiri" K98).
 * Itu milik task.service.ts (7c) — berkas ini hanya tahu peran, bukan siapa
 * ditugaskan ke apa.
 */
export function bolehTransisiTugas(p: PermintaanTransisi): HasilTransisiTugas {
  if (!busurTugasAda(p.dari, p.ke)) {
    return {
      boleh: false,
      alasan: 'TRANSISI_TAK_SAH',
      pesan:
        p.dari === 'CANCELLED'
          ? 'Tugas yang dibatalkan tidak bisa diubah statusnya lagi.'
          : `Status ${p.dari} tidak bisa langsung menjadi ${p.ke}.`,
    }
  }

  // K91: kolom macet tanpa alasan adalah kolom yang tidak pernah dibaca siapa pun.
  if (p.ke === 'BLOCKED' && kosong(p.blockedReason)) {
    return {
      boleh: false,
      alasan: 'BLOKIR_TANPA_ALASAN',
      pesan: 'Status BLOCKED wajib disertai alasan (blockedReason).',
    }
  }

  if (adalahBukaKembali(p.dari, p.ke)) {
    if (!bolehBukaKembali(p.peran)) {
      return {
        boleh: false,
        alasan: 'BUKA_KEMBALI_PERAN',
        pesan: `Membuka kembali tugas hanya untuk ${PERAN_BOLEH_BUKA_KEMBALI.join('/')}.`,
      }
    }
    if (!(p.completedAt instanceof Date)) {
      // Tugas ber-status DONE tanpa completedAt berarti K99 dilanggar di
      // tempat lain. Menolak lebih jujur daripada menganggapnya "baru selesai".
      return {
        boleh: false,
        alasan: 'BUKA_KEMBALI_TANPA_COMPLETED_AT',
        pesan: 'Tugas DONE tanpa completedAt tidak bisa dibuka kembali.',
      }
    }
    const usiaJam = (p.sekarang.getTime() - p.completedAt.getTime()) / 3_600_000
    if (usiaJam > JAM_BUKA_KEMBALI) {
      return {
        boleh: false,
        alasan: 'BUKA_KEMBALI_KEDALUWARSA',
        pesan: `Tugas selesai lebih dari ${JAM_BUKA_KEMBALI} jam lalu — buat tugas baru, jangan buka yang lama.`,
      }
    }
  }

  return { boleh: true }
}

/**
 * Daftar tujuan yang boleh muncul sebagai tombol (§12/6 — jangan hard-code
 * daftar tombol di komponen). Menyaring pagar yang bisa dinilai TANPA database;
 * tombol yang lolos di sini tetap diperiksa ulang di service saat ditekan.
 */
export function transisiTersediaTugas(
  dari: StatusTugas,
  peran: PeranPengguna,
): readonly StatusTugas[] {
  return TRANSISI_TUGAS[dari].filter((ke) => !adalahBukaKembali(dari, ke) || bolehBukaKembali(peran))
}

/**
 * K99 — efek transisi pada kolom snapshot. Dipisah dari pemeriksaan izin supaya
 * ada SATU tempat yang tahu kapan `startedAt`/`completedAt` bergerak.
 *
 *   - `startedAt` diisi pada transisi PERTAMA ke IN_PROGRESS dan TIDAK direset
 *     oleh transisi berikutnya — yang diukur adalah kapan pekerjaan mulai
 *     disentuh, bukan kapan terakhir disentuh.
 *   - `completedAt` diisi saat masuk DONE dan DIKOSONGKAN saat keluar dari DONE.
 *     Inilah yang membuat SLA (K100) punya arti; `updatedAt` tidak bisa dipakai
 *     karena setiap komentar dan koreksi judul menggesernya.
 *   - `blockedReason` dibersihkan saat keluar dari BLOCKED, supaya alasan lama
 *     tidak menempel pada tugas yang sudah tidak macet.
 *
 * Mengembalikan PATCH (hanya field yang berubah), bukan objek tugas utuh —
 * berkas ini tidak tahu bentuk baris Prisma dan tidak perlu tahu.
 */
export type PatchTransisi = {
  startedAt?: Date
  completedAt?: Date | null
  blockedReason?: string | null
}

export function efekTransisiTugas(p: {
  dari: StatusTugas
  ke: StatusTugas
  startedAt?: Date | null
  blockedReason?: string | null
  sekarang: Date
}): PatchTransisi {
  const patch: PatchTransisi = {}

  if (p.ke === 'IN_PROGRESS' && !(p.startedAt instanceof Date)) patch.startedAt = p.sekarang
  if (p.ke === 'DONE') patch.completedAt = p.sekarang
  else if (p.dari === 'DONE') patch.completedAt = null

  if (p.ke === 'BLOCKED') patch.blockedReason = (p.blockedReason ?? '').trim()
  else if (p.dari === 'BLOCKED') patch.blockedReason = null

  return patch
}
