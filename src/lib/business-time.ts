// Waktu bisnis Samarinda — logika murni, TANPA impor (PRD-002 Step 3).
//
// Tiga jenis waktu di aplikasi ini, dan hanya satu yang diurus berkas ini:
//   1. INSTAN mutlak (createdAt, dueAt tugas, completedAt) — Date biasa, disimpan
//      UTC oleh Prisma. Membandingkannya tidak butuh zona waktu.
//   2. TANGGAL KALENDER voyage (ETA/ETB/…/ATD) — 00:00 UTC berarti "tanggal itu",
//      di zona mana pun (services/master/voyage-dates.ts, D4). JANGAN dikonversi
//      lewat berkas ini.
//   3. TANGGAL/BULAN BISNIS — "hari ini" menurut kantor di Samarinda. Dipakai job
//      tanpa manusia untuk memutuskan kapan hari/bulan baru dimulai. Inilah
//      berkas ini.
//
// Kenapa bukan jam mesin: VM produksi berjalan di Etc/UTC, laptop dev di WITA.
// Kunci yang bergantung pada jam mesin berbeda di keduanya — dan `toISOString()`
// (UTC) menggulirkan "hari baru" pukul 08:00 WITA, bukan tengah malam.
//
// Asia/Makassar tidak punya DST, tapi kode ini tidak mengandalkannya: semua
// perhitungan lewat Intl dengan zona BERNAMA, bukan offset +8 yang ditanam.
//
// Tanpa impor supaya bisa diuji langsung oleh Node (prisma/check-business-time.mjs).

export const ZONA_BISNIS = 'Asia/Makassar'

const formatter = new Map<string, Intl.DateTimeFormat>()

function formatUntuk(zona: string): Intl.DateTimeFormat {
  let f = formatter.get(zona)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    formatter.set(zona, f)
  }
  return f
}

type Bagian = { tahun: string; bulan: string; hari: string; jam: string; menit: string }

function bagian(d: Date, zona: string): Bagian {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new RangeError('Waktu tidak valid untuk dikonversi ke waktu bisnis.')
  }
  const p: Record<string, string> = {}
  for (const x of formatUntuk(zona).formatToParts(d)) p[x.type] = x.value
  return { tahun: p.year, bulan: p.month, hari: p.day, jam: p.hour, menit: p.minute }
}

/** "YYYY-MM-DD" — tanggal kalender di zona bisnis (bawaan Asia/Makassar). */
export function tanggalBisnis(d: Date, zona: string = ZONA_BISNIS): string {
  const b = bagian(d, zona)
  return `${b.tahun}-${b.bulan}-${b.hari}`
}

/** "YYYY-MM" — bulan kalender di zona bisnis (bawaan Asia/Makassar). */
export function bulanBisnis(d: Date, zona: string = ZONA_BISNIS): string {
  const b = bagian(d, zona)
  return `${b.tahun}-${b.bulan}`
}

/** "YYYY-MM-DD HH:mm WITA" — untuk teks yang dibaca manusia, bukan untuk kunci. */
export function waktuBisnis(d: Date, zona: string = ZONA_BISNIS): string {
  const b = bagian(d, zona)
  const label = zona === ZONA_BISNIS ? 'WITA' : zona
  return `${b.tahun}-${b.bulan}-${b.hari} ${b.jam}:${b.menit} ${label}`
}
