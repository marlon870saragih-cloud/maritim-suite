// Ekspor mandiri seluruh data tenant — K186 (Fase 8k). 🔴 Opus.
//
// KENAPA INI FITUR, BUKAN KEBAIKAN HATI: ia prasyarat komersial. Perusahaan
// tidak memindahkan pembukuannya ke sistem yang datanya tak bisa diambil
// kembali, dan pertanyaan "kalau kami berhenti, data kami bagaimana?" muncul
// di percakapan penjualan pertama. Ia juga separuh K187 (permintaan AKSES) dan
// separuh K188 (offboarding langkah 2) — satu mesin, tiga kegunaan.
//
// ---------------------------------------------------------------------------
// TIGA KEPUTUSAN YANG MENENTUKAN APAKAH INI AMAN
//
// 1. **Daftar tabel BUKAN daftar tulis-tangan.** Ia diturunkan dari
//    `TENANT_MODELS` (tenant-guard.ts) — sumber kebenaran yang SAMA yang
//    dipakai pagar isolasi. Akibatnya model bertenant baru otomatis ikut
//    terekspor, dan mustahil ada tabel yang "lupa diekspor" tanpa juga lupa
//    dipagari (yang akan ditangkap check-tenant-guard.mjs). Daftar tulis-
//    tangan pasti akan basi — pertanyaannya cuma kapan.
//
// 2. **Pengambilan barisnya lewat `forTenant(ctx)`, bukan `prisma` mentah.**
//    Isolasi ekspor karena itu BUKAN implementasi kedua yang harus dijaga
//    tetap sama dengan yang asli — ia pagar yang sama persis. §17/8k butir 2
//    ("ekspor tak memuat satu baris pun milik tenant lain") jadi sifat
//    struktural, bukan sesuatu yang diuji lalu diharapkan tetap benar.
//
// 3. **Attachment hasil ditulis TANPA `uploadAttachment()`** — sama alasan &
//    pola dengan `unggahLogo()` (branding.service.ts, K181): entitas pemilik
//    berkas ini adalah TENANT itu sendiri, dan mendaftarkan 'TENANT' di
//    `ENTITAS_DIDUKUNG` akan membuat pemeriksaan kepemilikan generik cocok
//    dengan tenant SIAPA PUN (lubang lintas-tenant). `entityId` di sini SELALU
//    `ctx.tenantId` dari sesi — tak pernah dari input.
//
// ---------------------------------------------------------------------------
// KENAPA ZIP, PADAHAL K109 MENOLAK ARSIP
//
// Daftar putih K109 (`TIPE_DITERIMA`) menolak .zip dengan alasan tertulis:
// "menyembunyikan isinya dari SEMUA pemeriksaan". Alasan itu tentang BERKAS
// YANG DIUNGGAH PIHAK LUAR — yang isinya tak dikenal dan bisa jahat. Bundel
// ini kebalikannya: ia DIHASILKAN sistem sendiri dari baris database sendiri,
// isinya diketahui persis, dan tak pernah melewati `periksaBerkas()` karena
// tak ada yang perlu diperiksa dari berkas yang baru saja kita tulis sendiri.
// Melebarkan `TIPE_DITERIMA` demi ini justru akan melonggarkan jalur unggah
// pihak luar — persis yang tidak boleh terjadi. Jadi: ZIP, lewat jalur tulis
// bespoke, dan `TIPE_DITERIMA` tidak disentuh sama sekali.
//
// Penyajiannya tetap tunduk K108: selalu sebagai unduhan (Content-Disposition
// attachment + nosniff + CSP sandbox), tak pernah inline.

import type { Attachment } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { TENANT_MODELS } from '../tenant-guard'
import { conflict, notFound, validation } from '../errors'
import { catatAudit, type Jejak } from '../finance/audit'
import { notify } from '../notification.service'
import { buatStorageKey, buatTokenBerkas, penyimpananLokal, sha256, type PenyimpananBerkas } from '../ops/storage/local'
import { bangunBundelEkspor, type BerkasLampiran, type TabelEkspor } from '@/lib/export-bundle'

/** K186 — "satu ekspor aktif per tenant". */
const STATUS_AKTIF = 'BERJALAN'

/** K186 — "berkas hasil kedaluwarsa (isi expiresAt K106)". */
const HARI_KEDALUWARSA = 7

/**
 * Model yang SENGAJA tidak ikut bundel:
 *
 * - `AuditLog` — jejak hukum, bukan data operasional tenant. Menyerahkannya
 *   dalam satu berkas yang bisa dibawa keluar berarti menyerahkan catatan
 *   "siapa melakukan apa" atas orang-orang yang bekerja di sana; ia dibaca di
 *   layar Jejak Audit yang sudah ada, dengan pagar perannya sendiri.
 * - `Payment`/`SubscriptionInvoice` — transaksi LANGGANAN antara tenant dan
 *   Maritime Suite, bukan data operasional keagenan. Kuitansinya sudah bisa
 *   diunduh sendiri di Settings › Billing.
 * - `UsageEvent` — telemetri produk kami tentang tenant (K183), bukan
 *   datanya. Tak ada gunanya bagi tenant dan bukan miliknya untuk dibawa.
 */
const TABEL_DIKECUALIKAN: ReadonlySet<string> = new Set([
  'AuditLog',
  'Payment',
  'SubscriptionInvoice',
  'UsageEvent',
])

/** `Voyage` → `voyage`, `PortCall` → `portCall`. Nama model → properti klien Prisma. */
const keCamel = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** Urutan stabil supaya dua ekspor berturut-turut menghasilkan susunan sheet yang sama. */
export function tabelYangDiekspor(): string[] {
  // `Array.from`, bukan spread: target tsconfig repo ini di bawah es2015 dan
  // menyebar ReadonlySet gagal kompilasi (TS2802).
  return Array.from(TENANT_MODELS).filter((m) => !TABEL_DIKECUALIKAN.has(m)).sort()
}

export type RingkasanExportJob = {
  id: string
  status: string
  attachmentId: string | null
  galat: string | null
  jumlahTabel: number | null
  ukuranBytes: number | null
  createdAt: string
  selesaiPada: string | null
  /** Hanya benar bila berkasnya masih ada & belum kedaluwarsa. */
  bisaDiunduh: boolean
}

function ringkas(j: {
  id: string
  status: string
  attachmentId: string | null
  galat: string | null
  jumlahTabel: number | null
  ukuranBytes: number | null
  createdAt: Date
  selesaiPada: Date | null
}, bisaDiunduh: boolean): RingkasanExportJob {
  return {
    id: j.id,
    status: j.status,
    attachmentId: j.attachmentId,
    galat: j.galat,
    jumlahTabel: j.jumlahTabel,
    ukuranBytes: j.ukuranBytes,
    createdAt: j.createdAt.toISOString(),
    selesaiPada: j.selesaiPada?.toISOString() ?? null,
    bisaDiunduh,
  }
}

/**
 * K186 tabel peran — ekspor HANYA `ADMIN`, dan itu termasuk **bukan**
 * `DIREKTUR` meski Fase 5e memberi direktur "lihat-saja semua": satu berkas
 * berisi seluruh data perusahaan adalah objek yang berbeda jenisnya dari
 * sebuah layar laporan, dan menyalinnya keluar adalah TINDAKAN, bukan
 * penglihatan. Alasan yang sama sudah dipakai K110 saat menutup lampiran
 * sensitif dari DIREKTUR.
 */
const PERAN_EKSPOR = ['ADMIN'] as const

export async function listExportJobs(ctx: TenantContext): Promise<RingkasanExportJob[]> {
  requireRole(ctx, ...PERAN_EKSPOR)
  const db = forTenant(ctx)
  const jobs = await db.exportJob.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })

  const idBerkas = jobs.map((j) => j.attachmentId).filter((x): x is string => !!x)
  const berkas = idBerkas.length
    ? await db.attachment.findMany({
        where: { id: { in: idBerkas }, deletedAt: null },
        select: { id: true, expiresAt: true },
      })
    : []
  const hidup = new Map(berkas.map((b) => [b.id, b.expiresAt]))

  const sekarang = new Date()
  return jobs.map((j) => {
    const exp = j.attachmentId ? hidup.get(j.attachmentId) : undefined
    const ada = j.attachmentId ? hidup.has(j.attachmentId) : false
    return ringkas(j, ada && (!exp || exp > sekarang))
  })
}

/**
 * ⚠️ Bundel ekspor TIDAK MEMUAT BUNDEL EKSPOR SEBELUMNYA.
 *
 * Tanpa penyaring ini, ekspor #2 menelan zip #1, ekspor #3 menelan keduanya,
 * dan seterusnya — ukurannya berlipat tiap kali diminta sampai penyimpanan
 * tenant habis oleh salinan dirinya sendiri. Ditemukan lewat menjalankan uji
 * sungguhan (jumlah baris sheet Attachment tak cocok `count()`), bukan lewat
 * membaca kode.
 *
 * Baris METADATA-nya pun ikut disaring, bukan hanya berkasnya: daftar
 * "ekspor yang pernah saya minta" adalah artefak proses ekspor, bukan data
 * operasional keagenan — dan menampilkannya di dalam hasil ekspor hanya
 * menimbulkan pertanyaan "kenapa ada baris yang berkasnya tak ada di sini".
 */
const SARINGAN_TABEL: Readonly<Record<string, Record<string, unknown>>> = {
  Attachment: { kind: { not: 'EXPORT' } },
}

/** Kumpulkan seluruh baris tenant ini, tabel demi tabel, lewat pagar yang sama. */
async function kumpulkanTabel(ctx: TenantContext): Promise<TabelEkspor[]> {
  const db = forTenant(ctx) as unknown as Record<string, { findMany: (a?: unknown) => Promise<Record<string, unknown>[]> }>
  const hasil: TabelEkspor[] = []
  for (const nama of tabelYangDiekspor()) {
    const delegasi = db[keCamel(nama)]
    if (!delegasi?.findMany) {
      // Model terdaftar di TENANT_MODELS tapi tak ada di klien = skema &
      // guard sudah tak sinkron. Diam-diam melewatinya berarti mengirim
      // ekspor yang TIDAK lengkap sambil mengaku lengkap.
      throw validation(`Model "${nama}" terdaftar di TENANT_MODELS tapi tidak ada di klien Prisma — ekspor dihentikan supaya tidak mengaku lengkap.`)
    }
    const saringan = SARINGAN_TABEL[nama]
    hasil.push({ nama, baris: await delegasi.findMany(saringan ? { where: saringan } : {}) })
  }
  return hasil
}

/** Berkas fisik lampiran tenant. Nama di dalam ZIP dibuat unik & bisa dilacak. */
async function kumpulkanLampiran(
  ctx: TenantContext,
  penyimpanan: PenyimpananBerkas,
): Promise<BerkasLampiran[]> {
  const rows = await forTenant(ctx).attachment.findMany({
    // `kind != 'EXPORT'` — lihat catatan SARINGAN_TABEL di atas.
    where: { deletedAt: null, kind: { not: 'EXPORT' } },
    select: { id: true, fileName: true, storageKey: true },
    orderBy: { createdAt: 'asc' },
  })

  const keluar: BerkasLampiran[] = []
  for (const r of rows) {
    try {
      const isi = await penyimpanan.baca(r.storageKey)
      // Awalan id: dua lampiran boleh bernama sama persis (dan sering begitu —
      // "invoice.pdf"), jadi nama asli saja akan saling menimpa di dalam ZIP.
      keluar.push({ nama: `${r.id}__${r.fileName}`, isi })
    } catch {
      // Berkas hilang dari disk (mis. dipulihkan dari backup DB saja) tidak
      // boleh menggagalkan SELURUH ekspor — barisnya tetap ada di data.json.
      console.error(`[export] lampiran ${r.id} tak terbaca dari penyimpanan, dilewati.`)
    }
  }
  return keluar
}

/**
 * K186 — "tugas berjalan lama → hasilnya jadi Attachment, diberitahukan lewat
 * Notification saat siap. Bukan permintaan HTTP yang ditunggu di browser."
 *
 * Yang dikembalikan fungsi ini adalah JOB-nya (langsung, BERJALAN), bukan
 * berkasnya. Pekerjaan sesungguhnya berjalan di `jalankanEkspor()`.
 */
export async function mintaEkspor(ctx: TenantContext, jejak: Jejak = {}): Promise<RingkasanExportJob> {
  requireRole(ctx, ...PERAN_EKSPOR)
  const db = forTenant(ctx)

  // K186 "satu ekspor aktif per tenant" — pemeriksaan dilakukan SEBELUM baris
  // dibuat. Ini balapan yang mungkin secara teori (dua klik bersamaan); yang
  // terburuk terjadi adalah dua bundel identik dibuat, bukan data salah.
  const berjalan = await db.exportJob.findFirst({ where: { status: STATUS_AKTIF } })
  if (berjalan) {
    throw conflict('Masih ada permintaan ekspor yang sedang berjalan. Tunggu sampai selesai sebelum meminta yang baru — Anda akan dapat notifikasi saat berkasnya siap.')
  }

  const job = await db.exportJob.create({
    data: { tenantId: ctx.tenantId, status: STATUS_AKTIF, dimintaUserId: ctx.userId },
  })

  await catatAudit(
    ctx,
    { tableName: 'ExportJob', recordId: job.id, action: 'EXPORT', newValue: { status: STATUS_AKTIF } },
    jejak,
  )

  return ringkas(job, false)
}

/**
 * Kerja beratnya. Dipisah dari `mintaEkspor()` supaya route bisa memulai lalu
 * membalas segera (K186: bukan permintaan HTTP yang ditunggu di browser).
 *
 * TIDAK PERNAH melempar ke pemanggil: kegagalan dicatat pada job (status
 * GAGAL + `galat`) dan diberitahukan, karena pemanggilnya adalah proses
 * latar yang tak punya siapa-siapa untuk menerima lemparan.
 */
export async function jalankanEkspor(
  ctx: TenantContext,
  jobId: string,
  penyimpanan: PenyimpananBerkas = penyimpananLokal,
): Promise<void> {
  const db = forTenant(ctx)
  try {
    const tenant = await db.tenant.findFirst({ where: { id: ctx.tenantId } })
    if (!tenant) throw notFound('Tenant')

    const [tabel, lampiran] = await Promise.all([
      kumpulkanTabel(ctx),
      kumpulkanLampiran(ctx, penyimpanan),
    ])

    const dibuatPada = new Date()
    const bundel = await bangunBundelEkspor({
      companyName: tenant.companyName,
      tenantId: ctx.tenantId,
      dibuatPada,
      tabel,
      lampiran,
      // `logoUrl` dibuang dari profil: base64 8,7 KB yang membengkakkan sel
      // spreadsheet tanpa memberi tahu apa pun — logonya sendiri sudah ikut
      // sebagai berkas di folder lampiran/ sejak K181.
      profil: Object.fromEntries(Object.entries(tenant).filter(([k]) => k !== 'logoUrl')),
    })

    const stempel = dibuatPada.toISOString().slice(0, 10)
    const storageKey = buatStorageKey(ctx.tenantId, buatTokenBerkas(), '.zip')
    await penyimpanan.simpan(storageKey, bundel.isi, 'application/zip')

    const kedaluwarsa = new Date(dibuatPada.getTime() + HARI_KEDALUWARSA * 86_400_000)

    // Attachment ditulis LANGSUNG — lihat catatan "KENAPA ZIP" & keputusan 3
    // di kepala berkas ini. entityId SELALU ctx.tenantId (dari sesi).
    const att = await db.attachment.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: 'TENANT',
        entityId: ctx.tenantId,
        fileName: `ekspor-data-${stempel}.zip`,
        mimeType: 'application/zip',
        sizeBytes: bundel.isi.length,
        sha256: sha256(bundel.isi),
        storageKey,
        kind: 'EXPORT',
        // K126 semangat: bundel ini memuat SEGALANYA, termasuk data pribadi
        // awak. Ia tak pernah boleh muncul di daftar lampiran biasa apalagi
        // dibagikan ke portal (K170/2 menolak `sensitive` untuk dibagikan).
        sensitive: true,
        expiresAt: kedaluwarsa,
        uploadedByUserId: ctx.userId,
        note: `Ekspor mandiri ${bundel.jumlahTabel} tabel, ${bundel.jumlahBaris} baris, ${bundel.jumlahLampiran} lampiran.`,
      },
    })

    await db.exportJob.updateMany({
      where: { id: jobId },
      data: {
        status: 'SELESAI',
        attachmentId: att.id,
        jumlahTabel: bundel.jumlahTabel,
        ukuranBytes: bundel.isi.length,
        selesaiPada: new Date(),
      },
    })

    await catatAudit(ctx, {
      tableName: 'ExportJob',
      recordId: jobId,
      action: 'EXPORT',
      newValue: {
        status: 'SELESAI',
        jumlahTabel: bundel.jumlahTabel,
        jumlahBaris: bundel.jumlahBaris,
        jumlahLampiran: bundel.jumlahLampiran,
        ukuranBytes: bundel.isi.length,
      },
    })

    await notify(ctx, {
      type: 'EXPORT_READY',
      title: 'Ekspor data selesai',
      message: `${bundel.jumlahTabel} tabel, ${bundel.jumlahLampiran} lampiran. Berkas berlaku sampai ${kedaluwarsa.toISOString().slice(0, 10)}.`,
      href: '/settings/compliance',
      // Bertarget PEMINTA, bukan siaran (K101): berkas ini hanya boleh diunduh
      // ADMIN yang memintanya, jadi memberitahu seluruh tenant hanya
      // mengiklankan keberadaan berkas yang tak bisa mereka buka.
      userId: ctx.userId,
    })
  } catch (e) {
    const pesan = e instanceof Error ? e.message : 'Ekspor gagal.'
    console.error('[export] job gagal:', jobId, e)
    await forTenant(ctx).exportJob.updateMany({
      where: { id: jobId },
      data: { status: 'GAGAL', galat: pesan.slice(0, 500), selesaiPada: new Date() },
    })
    await notify(ctx, {
      type: 'EXPORT_READY',
      title: 'Ekspor data gagal',
      message: pesan.slice(0, 200),
      href: '/settings/compliance',
      userId: ctx.userId,
    }).catch(() => undefined)
  }
}

/** Berkas hasil untuk diunduh. ADMIN saja (K186), dan hanya yang belum kedaluwarsa. */
export async function bacaBerkasEkspor(
  ctx: TenantContext,
  jobId: string,
  penyimpanan: PenyimpananBerkas = penyimpananLokal,
  jejak: Jejak = {},
): Promise<{ row: Attachment; isi: Buffer }> {
  requireRole(ctx, ...PERAN_EKSPOR)
  const db = forTenant(ctx)

  const job = await db.exportJob.findFirst({ where: { id: jobId } })
  if (!job) throw notFound('Permintaan ekspor')
  if (job.status !== 'SELESAI' || !job.attachmentId) {
    throw conflict(`Ekspor ini berstatus ${job.status} — belum ada berkas yang bisa diunduh.`)
  }

  const row = await db.attachment.findFirst({ where: { id: job.attachmentId, deletedAt: null } })
  if (!row) throw notFound('Berkas ekspor')
  if (row.expiresAt && row.expiresAt <= new Date()) {
    throw conflict('Berkas ekspor ini sudah kedaluwarsa. Minta ekspor baru.')
  }

  const isi = await penyimpanan.baca(row.storageKey)

  // K186 "Jejak: AuditLog action='EXPORT' + ukuran + jumlah tabel" — dicatat
  // pada UNDUHAN juga, bukan hanya pembuatan: yang penting diketahui nanti
  // bukan "kapan berkasnya dibuat" melainkan "kapan ia dibawa keluar".
  await catatAudit(
    ctx,
    {
      tableName: 'ExportJob',
      recordId: jobId,
      action: 'EXPORT',
      newValue: { diunduh: true, ukuranBytes: row.sizeBytes, jumlahTabel: job.jumlahTabel },
    },
    jejak,
  )

  return { row, isi }
}
