// Pembangun berkas ekspor data tenant (K186, Fase 8k) — MURNI dari sisi data:
// menerima baris yang SUDAH diambil pemanggil, mengembalikan satu Buffer ZIP.
// Tidak menyentuh database, tidak tahu tenant mana yang sedang diekspor.
//
// Isi bundel (K186 "XLSX per tabel + JSON untuk kesetiaan penuh + lampiran"):
//
//   data.xlsx            satu SHEET per tabel — yang dibuka orang di Excel.
//   data.json            kesetiaan penuh: tipe asli, nilai null, presisi angka,
//                        dan kolom yang tak muat di spreadsheet.
//   lampiran/<berkas>    berkas fisik yang diunggah tenant, apa adanya.
//   BACA-SAYA.txt        manifes: apa isi bundel ini, kapan dibuat, berapa baris
//                        per tabel — supaya berkas yang dibuka 2 tahun lagi
//                        masih bisa dijelaskan tanpa membuka aplikasi.
//
// KENAPA XLSX **DAN** JSON, bukan salah satu: spreadsheet adalah yang benar-
// benar dibuka manusia, tapi ia berbohong tentang tipe (tanggal jadi angka,
// id panjang jadi notasi ilmiah, null jadi sel kosong yang tak bisa dibedakan
// dari string kosong). JSON menyimpan yang sesungguhnya. Pertanyaan komersial
// "kalau kami berhenti, data kami bisa diambil?" hanya terjawab benar kalau
// jawabannya mencakup keduanya.

import ExcelJS from 'exceljs'
import JSZip from 'jszip'

/** Satu tabel yang diekspor. `baris` sudah berupa objek polos siap serialisasi. */
export type TabelEkspor = {
  nama: string
  baris: Record<string, unknown>[]
}

export type BerkasLampiran = {
  /** Nama di dalam ZIP (sudah unik — lihat catatan namaUnik di export.service.ts). */
  nama: string
  isi: Buffer
}

export type HasilBundel = {
  isi: Buffer
  jumlahTabel: number
  jumlahBaris: number
  jumlahLampiran: number
}

/** Nama sheet Excel: maksimal 31 karakter, tanpa : \ / ? * [ ] */
function namaSheetAman(nama: string, dipakai: Set<string>): string {
  const bersih = nama.replace(/[:\\/?*[\]]/g, '_').slice(0, 31)
  if (!dipakai.has(bersih)) {
    dipakai.add(bersih)
    return bersih
  }
  // Tabrakan sesudah dipotong 31 karakter — beri akhiran angka.
  for (let i = 2; i < 100; i++) {
    const alt = `${bersih.slice(0, 31 - String(i).length - 1)}_${i}`
    if (!dipakai.has(alt)) {
      dipakai.add(alt)
      return alt
    }
  }
  throw new Error(`[export] tak bisa membuat nama sheet unik untuk "${nama}"`)
}

/**
 * Nilai untuk SEL SPREADSHEET. Objek/array diratakan jadi JSON string — Excel
 * tak punya tipe untuk keduanya, dan menaruh "[object Object]" di sel adalah
 * cara paling halus kehilangan data tanpa ada yang sadar.
 */
function selDari(v: unknown): string | number | boolean | Date | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'object') return JSON.stringify(v)
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  return String(v)
}

export async function bangunBundelEkspor(input: {
  companyName: string
  tenantId: string
  dibuatPada: Date
  tabel: TabelEkspor[]
  lampiran: BerkasLampiran[]
  /** Profil perusahaan (satu baris Tenant) — ikut sebagai sheet & di JSON. */
  profil: Record<string, unknown> | null
}): Promise<HasilBundel> {
  const { companyName, tenantId, dibuatPada, tabel, lampiran, profil } = input

  // ---------------------------------------------------------------- XLSX
  const wb = new ExcelJS.Workbook()
  wb.creator = companyName
  wb.created = dibuatPada

  const dipakai = new Set<string>()
  const semuaTabel: TabelEkspor[] = profil
    ? [{ nama: 'Perusahaan', baris: [profil] }, ...tabel]
    : tabel

  for (const t of semuaTabel) {
    const ws = wb.addWorksheet(namaSheetAman(t.nama, dipakai))
    if (t.baris.length === 0) {
      // Tabel kosong tetap dapat sheet-nya sendiri: "tidak ada data" adalah
      // jawaban yang berbeda dari "tabel ini tidak ikut diekspor", dan hanya
      // yang pertama yang benar di sini.
      ws.addRow(['(tidak ada data)'])
      continue
    }
    // Kunci diambil dari GABUNGAN semua baris, bukan baris pertama: kolom
    // bernilai null di baris pertama tetap harus punya kolomnya sendiri.
    const kunci: string[] = []
    const terlihat = new Set<string>()
    for (const b of t.baris) {
      for (const k of Object.keys(b)) {
        if (!terlihat.has(k)) {
          terlihat.add(k)
          kunci.push(k)
        }
      }
    }
    ws.addRow(kunci)
    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    for (const b of t.baris) ws.addRow(kunci.map((k) => selDari(b[k])))
  }

  const xlsx = Buffer.from(await wb.xlsx.writeBuffer())

  // ---------------------------------------------------------------- JSON
  const json = JSON.stringify(
    {
      _meta: {
        aplikasi: 'Maritime Suite',
        tenantId,
        companyName,
        dibuatPada: dibuatPada.toISOString(),
        jumlahTabel: semuaTabel.length,
        catatan:
          'Ekspor mandiri seluruh data operasional tenant ini. data.xlsx berisi data yang sama untuk dibuka di Excel; berkas ini menyimpan tipe & nilai aslinya.',
      },
      data: Object.fromEntries(semuaTabel.map((t) => [t.nama, t.baris])),
    },
    // Date → ISO otomatis lewat toJSON; BigInt tidak punya toJSON, jadi
    // ditangani eksplisit agar JSON.stringify tak melempar.
    (_k, v) => (typeof v === 'bigint' ? Number(v) : v),
    2,
  )

  // ------------------------------------------------------------- manifes
  const jumlahBaris = semuaTabel.reduce((s, t) => s + t.baris.length, 0)
  const manifes = [
    'EKSPOR DATA — MARITIME SUITE',
    '='.repeat(60),
    `Perusahaan   : ${companyName}`,
    `Tenant ID    : ${tenantId}`,
    `Dibuat pada  : ${dibuatPada.toISOString()}`,
    '',
    'ISI BUNDEL',
    '-'.repeat(60),
    'data.xlsx        Satu sheet per tabel — untuk dibuka di Excel.',
    'data.json        Data yang sama dengan tipe & nilai aslinya (null,',
    '                 tanggal, angka presisi penuh). Ini yang dipakai kalau',
    '                 datanya akan dipindahkan ke sistem lain.',
    'lampiran/        Berkas yang pernah diunggah ke aplikasi, apa adanya.',
    '',
    'JUMLAH BARIS PER TABEL',
    '-'.repeat(60),
    ...semuaTabel.map((t) => `${t.nama.padEnd(34)} ${String(t.baris.length).padStart(8)}`),
    '-'.repeat(60),
    `${'TOTAL'.padEnd(34)} ${String(jumlahBaris).padStart(8)}`,
    `${'Lampiran (berkas)'.padEnd(34)} ${String(lampiran.length).padStart(8)}`,
    '',
    'Bundel ini dibuat atas permintaan ADMIN perusahaan di atas dan hanya',
    'memuat data milik perusahaan itu.',
    '',
  ].join('\n')

  // ----------------------------------------------------------------- ZIP
  const zip = new JSZip()
  zip.file('data.xlsx', xlsx)
  zip.file('data.json', json)
  zip.file('BACA-SAYA.txt', manifes)
  const folder = zip.folder('lampiran')
  for (const l of lampiran) folder?.file(l.nama, l.isi)

  const isi = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  return {
    isi,
    jumlahTabel: semuaTabel.length,
    jumlahBaris,
    jumlahLampiran: lampiran.length,
  }
}
