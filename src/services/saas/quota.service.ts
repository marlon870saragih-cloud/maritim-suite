// Lapisan DB kuota (K156, Fase 8c) — menyambungkan mesin murni `quota.ts` ke
// hitungan nyata. Pola meniru port.service.ts (⭐ MODUL RUJUKAN).
//
// SEMUA ARTI hidup di quota.ts (mesin) & commercial-policy.ts (angka). Berkas
// ini hanya MENGHITUNG dan MELEMPAR. Tidak ada satu pun `if (terpakai >= batas)`
// di sini — vonisnya selalu `nilaiKuota()`, sebab dua tafsir atas aturan yang
// sama persis kelas bug yang K51 dibangun untuk mencegah.
//
// TIGA SIFAT YANG DISENGAJA:
//
// 1. **Nol biaya selama P49 belum dijawab.** `pastikanKuota()` berhenti pada
//    `adaBatasTerpasang()` — konstanta, tanpa query — sebelum menyentuh apa pun.
//    Hari ini semua batas `null`, jadi keempat titik panggil tidak menambah
//    SATU query pun dibanding sebelum Fase 8c (§17/8c butir 1).
//
// 2. **Berdiri sendiri dari `pastikanLanggananAktif()` (K33).** Keduanya membaca
//    `Tenant` masing-masing dan tak saling memanggil. Menggabungkannya jadi satu
//    pembacaan memang menghemat satu query, tapi membuat kegagalan salah satu
//    menyeret yang lain — dan §17/8c butir 6 justru menuntut buktinya bahwa
//    langganan habis tetap menolak meski kuota longgar.
//
// 3. **Menahan HANYA pembuatan baru** (K156/1). Tak satu pun fungsi di sini
//    dipanggil dari jalur baca, sunting, cetak, atau tagih. Data lama tenant
//    yang kuotanya HABIS tetap terbuka seluruhnya — persis perilaku
//    `tenantAccess().locked` yang sudah berlaku.

import type { TenantContext } from '../context'
import { forTenant } from '../tenant-db'
import { forbidden, validation } from './../errors'
import { monthWindow } from '@/lib/doc-number'
import {
  AMBANG_PERINGATAN_KUOTA,
  FIELD_KUOTA,
  JENIS_KUOTA,
  PAKET_UNTUK_PLAN,
  TANPA_BATAS,
  adaBatasTerpasang,
  kuotaUntukPaket,
  type JenisKuota,
  type Kuota,
} from './commercial-policy'
import { nilaiKuota, type HasilKuota } from './quota'

const MB = 1024 * 1024

/** Label manusiawi per jenis — dipakai di pesan penolakan & di layar. */
const LABEL: Readonly<Record<JenisKuota, { id: string; en: string; satuan: string }>> = {
  VOYAGE: { id: 'voyage bulan ini', en: 'voyages this month', satuan: 'voyage' },
  PENGGUNA: { id: 'pengguna aktif', en: 'active users', satuan: 'pengguna' },
  PENYIMPANAN: { id: 'penyimpanan lampiran', en: 'attachment storage', satuan: 'MB' },
  PANGGILAN_AI: { id: 'panggilan AI bulan ini', en: 'AI calls this month', satuan: 'panggilan' },
}

function jenisSah(jenis: unknown): jenis is JenisKuota {
  return typeof jenis === 'string' && (JENIS_KUOTA as readonly string[]).includes(jenis)
}

/** Batas paket yang sedang berlaku untuk tenant ini. TRIAL → tanpa batas (lihat K146). */
async function kuotaTenant(ctx: TenantContext): Promise<Readonly<Kuota>> {
  const tenant = await forTenant(ctx).tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { plan: true },
  })
  // Tenant tak terbaca → tanpa batas. Arah membuka, sejalan quota.ts: kegagalan
  // membaca kebijakan tidak boleh berubah jadi penolakan kerja.
  if (!tenant) return TANPA_BATAS
  const planId = PAKET_UNTUK_PLAN[tenant.plan] ?? null
  return kuotaUntukPaket(planId)
}

// ------------------------------------------------------------------ hitungan

/**
 * Berapa yang sudah terpakai untuk satu jenis.
 *
 * Dihitung SAAT DIMINTA, tidak pernah disimpan (K156/2, sejalan K100 keadaan SLA
 * & K113 skor vendor): satu `count()` ber-index lebih murah daripada kolom yang
 * selalu basi dan butuh job untuk memperbaruinya.
 */
async function hitungTerpakai(ctx: TenantContext, jenis: JenisKuota): Promise<number> {
  const db = forTenant(ctx)

  if (jenis === 'VOYAGE') {
    // K32 — jendela bulan berjalan yang SAMA dengan penomoran dokumen. Voyage
    // bulan lalu tidak ikut terhitung (§17/8c butir 2).
    //
    // Yang soft-deleted TIDAK dihitung: kuota mengukur KAPASITAS yang sedang
    // dipakai, bukan jumlah tindakan yang pernah dilakukan. Tenant yang membuat
    // 25 voyage lalu menghapus 20 memang hanya memegang 5 — menagihnya untuk 25
    // berarti menghukum orang karena membereskan datanya sendiri.
    const { start, end } = monthWindow()
    return db.voyage.count({ where: { deletedAt: null, createdAt: { gte: start, lt: end } } })
  }

  if (jenis === 'PENGGUNA') {
    // Yang dihitung adalah pengguna AKTIF (§17/8c butir 5). Menonaktifkan
    // seseorang (Fase 5g) membebaskan kursinya seketika — barisnya tetap ada
    // supaya AuditLog.userId tidak kehilangan makna.
    return db.user.count({ where: { isActive: true } })
  }

  if (jenis === 'PENYIMPANAN') {
    const agg = await db.attachment.aggregate({
      _sum: { sizeBytes: true },
      where: { deletedAt: null },
    })
    return (agg._sum.sizeBytes ?? 0) / MB
  }

  // PANGGILAN_AI — ⚠️ lihat CATATAN SUMBER di commercial-policy.ts: tabelnya ada
  // sejak 8a tapi PENCATATNYA baru lahir di 8j (K183). Selama itu hitungan ini
  // selalu 0, dan `check-quota.mjs` sengaja GAGAL kalau ada paket yang mengisi
  // batas AI sebelum pencatatnya terpasang.
  const { start, end } = monthWindow()
  return db.usageEvent.count({
    where: { nama: { startsWith: 'AI_' }, createdAt: { gte: start, lt: end } },
  })
}

// -------------------------------------------------------------------- pagar

export type KuotaTerbaca = HasilKuota & { jenis: JenisKuota }

/**
 * Keadaan satu jenis kuota untuk tenant ini.
 *
 * Berhenti tanpa query bila tak ada paket yang membatasi jenis ini — itu jalur
 * yang berlaku hari ini untuk keempat jenis.
 */
export async function bacaKuota(ctx: TenantContext, jenis: JenisKuota): Promise<KuotaTerbaca> {
  const kosong = nilaiKuota({ terpakai: 0, batas: null, ambangPeringatan: AMBANG_PERINGATAN_KUOTA })

  if (!adaBatasTerpasang(jenis)) return { ...kosong, jenis }

  const batas = (await kuotaTenant(ctx))[FIELD_KUOTA[jenis]]
  // Paket tenant ini tak membatasi jenis ini (paket lain mungkin) → tetap tanpa
  // hitungan. Pembacaan `Tenant` di atas satu-satunya biaya.
  if (batas === null) return { ...kosong, jenis }

  const terpakai = await hitungTerpakai(ctx, jenis)
  return { ...nilaiKuota({ terpakai, batas, ambangPeringatan: AMBANG_PERINGATAN_KUOTA }), jenis }
}

/** Keempat jenis sekaligus — untuk `/api/quota`, QuotaMeter, dan sapuan job. */
export async function ringkasanKuota(ctx: TenantContext): Promise<KuotaTerbaca[]> {
  const hasil: KuotaTerbaca[] = []
  for (const jenis of JENIS_KUOTA) hasil.push(await bacaKuota(ctx, jenis))
  return hasil
}

const bulat = (n: number) => Math.round(n * 10) / 10

/**
 * K156/3 — SATU pemeriksa, dipanggil BERSEBELAHAN dengan `pastikanLanggananAktif()`
 * di titik pembuatan baris baru. Melempar FORBIDDEN bila kuotanya `HABIS`.
 *
 * Pesannya WAJIB menyebut angkanya dan menawarkan jalan keluar (§17/8c butir 2).
 * Penolakan yang cuma berbunyi "kuota habis" memaksa orang menebak batasnya, dan
 * tebakan itu berakhir jadi tiket dukungan — pos biaya terbesar sesudah
 * pengembangan (blueprint §11.5).
 *
 * Jenis di luar daftar putih → VALIDATION, bukan diam-diam lolos: itu bug
 * pemanggil, dan pagar yang diam saat dipanggil salah adalah pagar yang suatu
 * hari tidak terpasang tanpa ada yang tahu.
 */
export async function pastikanKuota(ctx: TenantContext, jenis: unknown): Promise<void> {
  if (!jenisSah(jenis)) {
    throw validation(`Jenis kuota tidak sah. Pilihan: ${JENIS_KUOTA.join(', ')}.`)
  }

  // Jalur hari ini: konstanta, nol query, langsung pulang.
  if (!adaBatasTerpasang(jenis)) return

  const k = await bacaKuota(ctx, jenis)
  if (k.keadaan !== 'HABIS') return

  const label = LABEL[jenis]
  throw forbidden(
    `Batas paket tercapai: ${bulat(k.terpakai)} dari ${k.batas} ${label.id}. ` +
      `Naikkan paket di Pengaturan › Langganan untuk menambah batas, ` +
      `atau hapus/nonaktifkan yang tidak terpakai. ` +
      `Data yang sudah ada tetap bisa dibuka, disunting, dicetak, dan ditagih.`,
  )
}

/** Label dipakai juga oleh sapuan notifikasi & UI — satu tempat, bukan diketik ulang. */
export { LABEL as LABEL_KUOTA }
