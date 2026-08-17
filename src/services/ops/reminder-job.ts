// Job pengingat — SATU-SATUNYA kode Fase 7 yang berjalan tanpa manusia (K102, §4).
//
// ⚠️ BUKAN modul murni, dan itu disengaja. Berbeda dari sla.ts/sla-policy.ts (7b),
//    berkas ini MEMBACA dan MENULIS data nyata satu tenant penuh. Yang tetap
//    berlaku: SETIAP keputusan ambang/keadaan diambil dari modul murni —
//    `nilaiSla()` + `AMBANG_MENDEKATI_JAM` + `BATAS_NOTIFIKASI_PER_JALAN`.
//    Menulis ulang salah satunya di sini (sekecil `if (dueAt < now)` untuk
//    MEMUTUSKAN keadaan) berarti punya dua tafsir atas aturan yang sama — persis
//    kelas bug yang seluruh 7b dibangun untuk mencegahnya (K51). Query SQL di
//    bawah hanya PRA-SARING yang bisa di-index; vonisnya tetap `nilaiSla()`.
//
// LARANGAN YANG MENGIKAT (K102) — ini batasan keselamatan, bukan selera gaya.
// Kode yang berjalan tanpa pengawasan dan bisa mengubah pekerjaan adalah kode
// yang kesalahannya baru ketahuan berhari-hari kemudian:
//   1. TIDAK PERNAH mengubah `Task` (status, completedAt, apa pun). Satu-satunya
//      tabel yang ditulis berkas ini adalah `Notification`, lewat notify().
//   2. TIDAK PERNAH membuat/menutup `Task`.
//   3. TIDAK PERNAH memanggil LLM (biaya token tak terlihat + K54: LLM hanya
//      jalan saat tombol ditekan). Berkas ini tidak mengimpor apa pun dari ai/.
//   4. DIBATASI `BATAS_NOTIFIKASI_PER_JALAN` notifikasi per tenant per jalan, dan
//      sisanya DILAPORKAN (`dibatasi`), bukan diam-diam dibuang.
//   5. `systemContext(tenantId)` SATU PER TENANT, berulang — tidak pernah ada
//      query lintas-tenant (aturan context.ts).
//
// IDEMPOTENSI (K101): tiap notifikasi punya `dedupeKey` deterministik, unik per
// tenant lewat `@@unique([tenantId, dedupeKey])`. Job boleh dijalankan 1× atau
// 50× sehari; barisnya tetap satu. Tabrakan kunci BUKAN galat — ia hasil normal
// job yang dijalankan ulang, dan dihitung sebagai `dilewati`.
//
// K86: TIDAK ADA sistem notifikasi kedua. Semua penulisan lewat notify() yang
// sudah ada (Fase 5d), tabel yang sudah ada, kolom yang sudah ada.

import type { Task, TaskStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { systemContext, type TenantContext } from '../context'
import { forTenant } from '../tenant-db'
import { notify, type NewNotification } from '../notification.service'
import { nilaiSla } from './sla'
import { AMBANG_MENDEKATI_JAM, BATAS_NOTIFIKASI_PER_JALAN, PERAN_ESKALASI_SLA } from './sla-policy'

// ------------------------------------------------------------------ kebijakan

/** Tiga jenis notifikasi yang lahir dari job ini (K86/K102). */
export type JenisPengingat = 'TASK_DUE' | 'TASK_OVERDUE' | 'SLA_BREACH'

/** Status yang tidak lagi menunggu dikerjakan — tak pantas diingatkan. */
const STATUS_TERMINAL: readonly TaskStatus[] = ['DONE', 'CANCELLED']

/**
 * Batas jumlah BARIS TUGAS yang dibaca per sapuan (bukan batas notifikasi).
 *
 * Dibuat lebih longgar dari batas notifikasi karena sebagian besar tugas yang
 * terbaca justru sudah punya notifikasi (→ `dilewati`, tidak memakan jatah).
 * Tanpa kelonggaran ini, tenant yang sudah diberitahu untuk 500 tugas pertama
 * tidak akan pernah sampai ke tugas ke-501 pada jalan berikutnya.
 */
const BATAS_BARIS_DIBACA_PER_SAPUAN = BATAS_NOTIFIKASI_PER_JALAN * 4

/** Urutan prioritas saat jatah notifikasi habis: yang paling gawat lebih dulu. */
const PRIORITAS_JENIS: Readonly<Record<JenisPengingat, number>> = {
  SLA_BREACH: 0,
  TASK_OVERDUE: 1,
  TASK_DUE: 2,
}

const JAM = 3_600_000

// -------------------------------------------------------------- bentuk kunci

// Ketiganya deterministik dan bisa dibaca manusia (K101). Semua komponen waktu
// memakai UTC lewat toISOString() — bukan zona waktu server — supaya kuncinya
// tidak berubah kalau job dipindah ke mesin lain.

/**
 * `TASK_DUE:<taskId>:<dueAt-ISO-jam>` — satu pengingat "mendekati" per TENGGAT.
 *
 * `dueAt` masuk ke kunci bukan tanpa maksud (K101): kalau ETA mundur dan `dueAt`
 * bergeser (K94), pengingatnya MEMANG harus berbunyi lagi untuk tenggat yang
 * baru. Yang tak boleh berbunyi dua kali adalah tenggat yang SAMA. Baris lama
 * sengaja tidak dibersihkan — ia jejak bahwa tenggat lama pernah ada.
 */
export function kunciTaskDue(taskId: string, dueAt: Date): string {
  return `TASK_DUE:${taskId}:${dueAt.toISOString().slice(0, 13)}`
}

/**
 * `TASK_OVERDUE:<taskId>:<YYYY-MM-DD>` — paling banyak satu per HARI KALENDER
 * selama tugas masih terlambat. Tanggalnya diambil dari waktu JALANNYA JOB
 * (bukan dari `dueAt`): tugas yang terlambat lima hari berbunyi lima kali, satu
 * kali per hari, bukan lima kali dalam sehari.
 */
export function kunciTaskOverdue(taskId: string, sekarang: Date): string {
  return `TASK_OVERDUE:${taskId}:${sekarang.toISOString().slice(0, 10)}`
}

/**
 * `SLA_BREACH:<taskId>:<penerimaUserId>` — sekali seumur hidup tugas, PER
 * PENERIMA.
 *
 * K101 menulis kuncinya tanpa komponen waktu, dan itu dipertahankan: pelanggaran
 * SLA adalah penilaian akhir yang tidak berubah lagi, jadi tak ada alasan ia
 * berbunyi dua kali. Yang DITAMBAHKAN K103 (versi P34 final) hanyalah komponen
 * PENERIMA — karena eskalasi kini satu baris per orang, bukan satu siaran, dan
 * idempotensinya harus berlaku per pasangan (tugas, penerima). Satu dedupeKey
 * global akan membuat orang kedua dan seterusnya tidak pernah kebagian.
 */
export function kunciSlaBreach(taskId: string, penerimaUserId: string): string {
  return `SLA_BREACH:${taskId}:${penerimaUserId}`
}

// -------------------------------------------------------------- bentuk hasil

/** Laporan satu tenant, dikembalikan apa adanya sebagai JSON (K102). */
export type HasilJalanPengingat = {
  /** tenantId — nama kolom `tenant` mengikuti K102 apa adanya. */
  tenant: string
  namaTenant: string | null
  dibuat: number
  dilewati: number
  dibatasi: number
  /** Rincian `dibuat` per jenis — untuk kartu hasil di layar, bukan untuk logika. */
  perJenis: Record<JenisPengingat, number>
  /** Terisi hanya bila tenant ini gagal; tenant lain tetap diproses. */
  galat?: string
}

export type OpsiJalanPengingat = {
  /**
   * Waktu acuan job. SELALU boleh disuntikkan (K11) — uji butir 4 §18/7e perlu
   * menjalankan "hari berikutnya" tanpa mengubah jam sistem, dan `nilaiSla()`
   * memang menerima `sekarang` sebagai argumen.
   *
   * ⚠️ TIDAK diteruskan dari HTTP. Route `/api/jobs/run` sengaja tidak menerima
   * parameter waktu: penjadwal luar tidak boleh bisa menggeser jam job dan
   * menerbitkan ulang seluruh pengingat kemarin.
   */
  sekarang?: Date
}

/** Satu calon notifikasi, sebelum diputuskan lahir/dilewati/dibatasi. */
type Calon = {
  dedupeKey: string
  jenis: JenisPengingat
  /** Untuk pengurutan stabil saat jatah habis. */
  urut: string
  data: NewNotification
}

// ------------------------------------------------------------------- bantuan

const potong = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s)

const bulat1 = (n: number) => Math.round(n * 10) / 10

/** Tautan ke papan tugas. Voyage disaring supaya kartunya langsung terlihat. */
function tautanTugas(t: Task): string {
  return t.voyageId ? `/tasks?assignee=all&voyageId=${t.voyageId}` : '/tasks?assignee=all'
}

const waktuLokal = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'

/** Pecah daftar kunci jadi potongan supaya `IN (...)` tidak jadi raksasa. */
function berkelompok<T>(xs: readonly T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

/** Kunci yang SUDAH ada di tabel Notification tenant ini. */
async function kunciYangSudahAda(ctx: TenantContext, kunci: readonly string[]): Promise<Set<string>> {
  const ada = new Set<string>()
  for (const kelompok of berkelompok(kunci, 500)) {
    const rows = await forTenant(ctx).notification.findMany({
      where: { dedupeKey: { in: kelompok } },
      select: { dedupeKey: true },
    })
    for (const r of rows) if (r.dedupeKey) ada.add(r.dedupeKey)
  }
  return ada
}

// -------------------------------------------------------------- sapuan 1 dari 3

/**
 * MENDEKATI → `TASK_DUE`, bertarget ke penanggung jawab (K101).
 *
 * Pra-saring SQL memakai index `[tenantId, status, dueAt]`; keadaannya tetap
 * divonis `nilaiSla()`. Tugas tanpa penanggung jawab TIDAK diingatkan di sapuan
 * ini — tugas yatim yang belum lewat tenggat masih bisa diambil orang, dan
 * menyiarkannya ke seluruh tenant untuk setiap tenggat yang mendekat adalah cara
 * tercepat membuat lonceng diabaikan. Ia berbunyi di sapuan 2, saat memang sudah
 * jadi masalah tim (K101 baris "Tugas tanpa penanggung jawab").
 */
async function sapuanMendekati(ctx: TenantContext, sekarang: Date): Promise<Calon[]> {
  const batasAtas = new Date(sekarang.getTime() + AMBANG_MENDEKATI_JAM * JAM)

  const rows = await forTenant(ctx).task.findMany({
    where: {
      deletedAt: null,
      status: { notIn: [...STATUS_TERMINAL] },
      completedAt: null,
      dueAt: { gte: sekarang, lte: batasAtas },
    },
    orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    take: BATAS_BARIS_DIBACA_PER_SAPUAN,
  })

  const calon: Calon[] = []
  for (const t of rows) {
    if (!t.dueAt) continue
    const sla = nilaiSla({
      dueAt: t.dueAt,
      completedAt: t.completedAt,
      slaHours: t.slaHours,
      sekarang,
      ambangMendekatiJam: AMBANG_MENDEKATI_JAM,
    })
    // Vonis modul murni, bukan pra-saring SQL di atas, yang menentukan.
    if (sla.keadaan !== 'MENDEKATI') continue
    if (!t.assigneeUserId) continue

    calon.push({
      dedupeKey: kunciTaskDue(t.id, t.dueAt),
      jenis: 'TASK_DUE',
      urut: `${t.dueAt.toISOString()}:${t.id}`,
      data: {
        type: 'TASK_DUE',
        userId: t.assigneeUserId,
        title: `Tenggat mendekat: ${potong(t.title)}`,
        message:
          `Jatuh tempo ${waktuLokal(t.dueAt)} — sisa ${bulat1(sla.sisaJam ?? 0)} jam ` +
          `(dihitung dalam jam kalender 24/7).`,
        entityType: 'TASK',
        entityId: t.id,
        href: tautanTugas(t),
        dedupeKey: kunciTaskDue(t.id, t.dueAt),
      },
    })
  }
  return calon
}

// -------------------------------------------------------------- sapuan 2 dari 3

/**
 * TERLAMBAT → `TASK_OVERDUE`, harian. Bertarget ke penanggung jawab bila ada;
 * SIARAN (`userId = null`) bertuliskan "belum ada penanggung jawab" bila tidak
 * (K101 — baris ini TIDAK berubah oleh P34; yang berubah hanya eskalasi SLA).
 */
async function sapuanTerlambat(ctx: TenantContext, sekarang: Date): Promise<Calon[]> {
  const rows = await forTenant(ctx).task.findMany({
    where: {
      deletedAt: null,
      status: { notIn: [...STATUS_TERMINAL] },
      completedAt: null,
      dueAt: { lt: sekarang },
    },
    orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    take: BATAS_BARIS_DIBACA_PER_SAPUAN,
  })

  const calon: Calon[] = []
  for (const t of rows) {
    if (!t.dueAt) continue
    const sla = nilaiSla({
      dueAt: t.dueAt,
      completedAt: t.completedAt,
      slaHours: t.slaHours,
      sekarang,
      ambangMendekatiJam: AMBANG_MENDEKATI_JAM,
    })
    if (sla.keadaan !== 'TERLAMBAT') continue

    const kunci = kunciTaskOverdue(t.id, sekarang)
    const telat = `terlambat ${bulat1(sla.telatJam ?? 0)} jam dari tenggat ${waktuLokal(t.dueAt)}`

    calon.push({
      dedupeKey: kunci,
      jenis: 'TASK_OVERDUE',
      urut: `${t.dueAt.toISOString()}:${t.id}`,
      data: {
        type: 'TASK_OVERDUE',
        userId: t.assigneeUserId ?? null,
        title: t.assigneeUserId
          ? `Tugas terlambat: ${potong(t.title)}`
          : `Tugas terlambat & belum ada penanggung jawab: ${potong(t.title)}`,
        message: t.assigneeUserId
          ? `Tugas ini ${telat}.`
          : `Tugas ini ${telat}, dan belum ada penanggung jawab (no assignee). ` +
            `Silakan tugaskan ke seseorang.`,
        entityType: 'TASK',
        entityId: t.id,
        href: tautanTugas(t),
        dedupeKey: kunci,
      },
    })
  }
  return calon
}

// -------------------------------------------------------------- sapuan 3 dari 3

/**
 * DILANGGAR → `SLA_BREACH`, eskalasi SATU TINGKAT (K103 versi P34 final).
 *
 * BUKAN satu baris siaran `userId = null`. Melainkan SATU BARIS PER PENGGUNA
 * AKTIF ber-peran ADMIN atau MANAJER_OPERASI di tenant ini — pola yang sama
 * dengan `terbitkanNotifikasiSebutan()` pada comment.service.ts (K128), pemicu
 * berbeda, bentuk sama. Idempotensinya per pasangan (tugas, penerima), lihat
 * kunciSlaBreach().
 *
 * Pra-saring memakai perbandingan antar-kolom (`completedAt > dueAt`) supaya
 * seluruh riwayat tugas selesai tidak perlu ditarik ke memori; vonis DILANGGAR
 * tetap dari `nilaiSla()` — termasuk aturan batas inklusifnya (selesai TEPAT
 * pada detik `dueAt` BUKAN pelanggaran).
 *
 * Urutan `completedAt desc` disengaja: yang baru saja dilanggar adalah yang
 * belum pernah dinotifikasi. Pelanggaran lama sudah punya kunci dan hanya akan
 * jadi `dilewati`.
 */
async function sapuanDilanggar(ctx: TenantContext, sekarang: Date): Promise<Calon[]> {
  const db = forTenant(ctx)

  const rows = await db.task.findMany({
    where: {
      deletedAt: null,
      dueAt: { not: null },
      completedAt: { not: null, gt: db.task.fields.dueAt },
    },
    orderBy: [{ completedAt: 'desc' }, { id: 'asc' }],
    take: BATAS_BARIS_DIBACA_PER_SAPUAN,
  })
  if (rows.length === 0) return []

  // Sekali per tenant, bukan sekali per tugas.
  const penerima = await db.user.findMany({
    where: { role: { in: [...PERAN_ESKALASI_SLA] }, isActive: true },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  })
  if (penerima.length === 0) return []

  const calon: Calon[] = []
  for (const t of rows) {
    const sla = nilaiSla({
      dueAt: t.dueAt,
      completedAt: t.completedAt,
      slaHours: t.slaHours,
      sekarang,
      ambangMendekatiJam: AMBANG_MENDEKATI_JAM,
    })
    if (sla.keadaan !== 'DILANGGAR') continue
    if (!t.dueAt || !t.completedAt) continue

    for (const u of penerima) {
      const kunci = kunciSlaBreach(t.id, u.id)
      calon.push({
        dedupeKey: kunci,
        jenis: 'SLA_BREACH',
        urut: `${t.completedAt.toISOString()}:${t.id}:${u.id}`,
        data: {
          type: 'SLA_BREACH',
          // K103 — bertarget ke ORANG, bukan siaran.
          userId: u.id,
          title: `SLA dilanggar: ${potong(t.title)}`,
          message:
            `Diselesaikan ${waktuLokal(t.completedAt)}, ` +
            `${bulat1(sla.telatJam ?? 0)} jam melewati tenggat ${waktuLokal(t.dueAt)}.`,
          entityType: 'TASK',
          entityId: t.id,
          href: tautanTugas(t),
          dedupeKey: kunci,
        },
      })
    }
  }
  return calon
}

// --------------------------------------------------------------- satu tenant

/**
 * Tiga sapuan untuk SATU tenant, dalam satu jalur (K102).
 *
 * Alurnya sengaja "kumpulkan dulu, baru tulis": tanpa itu, `dibatasi` hanya bisa
 * ditebak ("masih ada sisa?") alih-alih dihitung, dan laporan yang menebak
 * adalah laporan yang tak berguna untuk memutuskan apakah job perlu dijalankan
 * lagi.
 */
export async function jalankanPengingatUntukTenant(
  tenantId: string,
  opsi: OpsiJalanPengingat = {},
): Promise<HasilJalanPengingat> {
  const sekarang = opsi.sekarang ?? new Date()
  const ctx = systemContext(tenantId)

  const hasil: HasilJalanPengingat = {
    tenant: tenantId,
    namaTenant: null,
    dibuat: 0,
    dilewati: 0,
    dibatasi: 0,
    perJenis: { TASK_DUE: 0, TASK_OVERDUE: 0, SLA_BREACH: 0 },
  }

  const semua = [
    ...(await sapuanMendekati(ctx, sekarang)),
    ...(await sapuanTerlambat(ctx, sekarang)),
    ...(await sapuanDilanggar(ctx, sekarang)),
  ]

  // Kembar di dalam satu jalan (mustahil menurut bentuk kuncinya, tapi kalau
  // pernah terjadi ia akan jadi P2002 yang membingungkan) dibuang di sini.
  const unik = new Map<string, Calon>()
  for (const c of semua) if (!unik.has(c.dedupeKey)) unik.set(c.dedupeKey, c)

  const sudahAda = await kunciYangSudahAda(ctx, Array.from(unik.keys()))
  const belumAda = Array.from(unik.values()).filter((c) => !sudahAda.has(c.dedupeKey))
  hasil.dilewati = unik.size - belumAda.length

  // Jatah habis → yang paling gawat menang, sisanya dilaporkan `dibatasi` dan
  // akan lahir pada jalan berikutnya (kuncinya belum ada, jadi tidak hilang).
  belumAda.sort(
    (a, b) => PRIORITAS_JENIS[a.jenis] - PRIORITAS_JENIS[b.jenis] || a.urut.localeCompare(b.urut),
  )
  const akanDibuat = belumAda.slice(0, BATAS_NOTIFIKASI_PER_JALAN)
  hasil.dibatasi = belumAda.length - akanDibuat.length

  for (const c of akanDibuat) {
    // notify() menelan galatnya sendiri (Fase 5d) — termasuk P2002 dari kunci
    // yang lahir di sela-sela jalan ini. Karena itu `dibuat` TIDAK dihitung dari
    // banyaknya panggilan, melainkan dibaca ulang dari database di bawah.
    await notify(ctx, c.data)
  }

  const lahir = await kunciYangSudahAda(
    ctx,
    akanDibuat.map((c) => c.dedupeKey),
  )
  for (const c of akanDibuat) {
    if (lahir.has(c.dedupeKey)) {
      hasil.dibuat++
      hasil.perJenis[c.jenis]++
    } else {
      // Tidak lahir = tabrakan kunci (hasil normal job yang dijalankan ulang,
      // K101) ATAU kegagalan tulis yang sudah dicatat notify() ke log server.
      // Keduanya sama-sama "tidak jadi baris baru" bagi pemanggil.
      hasil.dilewati++
    }
  }

  return hasil
}

// ------------------------------------------------------------- semua tenant

/**
 * Seluruh tenant, SATU PER SATU (K88/K102). Tidak ada mode "lihat semua tenant":
 * tiap tenant mendapat `systemContext(tenantId)`-nya sendiri, dan seluruh query
 * datanya lewat tenant-guard.
 *
 * Satu-satunya pembacaan yang tidak bertenant di sini adalah DAFTAR TENANT-nya
 * sendiri (`Tenant` bukan model bertenant — ia induknya, dan tidak ada di
 * TENANT_MODELS). Itu daftar registri, bukan data pelanggan.
 *
 * Kegagalan satu tenant TIDAK menghentikan yang lain: job tak berpengawasan yang
 * berhenti di tenant ketiga akan diam-diam berhenti mengingatkan tenant keempat
 * dan seterusnya, dan tak seorang pun tahu.
 */
export async function jalankanPengingatUntukSemuaTenant(
  opsi: OpsiJalanPengingat = {},
): Promise<HasilJalanPengingat[]> {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, companyName: true },
    orderBy: { createdAt: 'asc' },
  })

  const hasil: HasilJalanPengingat[] = []
  for (const t of tenants) {
    try {
      const r = await jalankanPengingatUntukTenant(t.id, opsi)
      r.namaTenant = t.companyName
      hasil.push(r)
    } catch (e) {
      console.error(`[reminder-job] tenant ${t.id} gagal:`, e)
      hasil.push({
        tenant: t.id,
        namaTenant: t.companyName,
        dibuat: 0,
        dilewati: 0,
        dibatasi: 0,
        perJenis: { TASK_DUE: 0, TASK_OVERDUE: 0, SLA_BREACH: 0 },
        galat: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return hasil
}
