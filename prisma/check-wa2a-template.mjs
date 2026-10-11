// Uji STATIS + MURNI WA-2a Step 2F (F2) — delapan template pesan klien yang disetujui owner.
// Tanpa DB/jaringan. Teks harapan ditulis ULANG di sini (bukan dibaca dari modul) supaya
// perbandingan byte-per-byte benar-benar independen dari kode yang diuji.
//
// Jalankan: node prisma/check-wa2a-template.mjs

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const baca = (rel) => readFileSync(join(AKAR, rel), 'utf8')
let lulus = 0
let gagal = 0
function cek(nama, kondisi, detail = '') {
  if (kondisi) {
    lulus++
    console.log(`  ✅ ${nama}${detail ? ` — ${detail}` : ''}`)
  } else {
    gagal++
    console.log(`  ❌ ${nama}${detail ? ` — ${detail}` : ''}`)
  }
}
const bagian = (j) => console.log(`\n${j}`)
const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const T = jiti('../src/services/whatsapp/wa-template.ts')
const K = jiti('../src/services/whatsapp/wa2-policy.ts')
// Hanya untuk uji perbandingan (uji ini bukan kode aplikasi).
const WA1T = jiti('../src/services/communication/comm-template.ts')
const WA1P = jiti('../src/services/communication/comm-policy.ts')

const tanpaKomentar = (s) => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')
const kodeGalat = (fn) => {
  try {
    fn()
    return null
  } catch (e) {
    return e?.code ?? e?.message ?? String(e)
  }
}

// ======================================================================= teks harapan
const BALASAN_ID = 'Balasan ke nomor ini belum kami pantau. Mohon hubungi kami melalui saluran yang biasa Anda gunakan.'
const BALASAN_EN = 'Replies to this number are not yet monitored. Please contact us through your usual channel.'
const kaki = (b) => (b === 'ID' ? ['', BALASAN_ID, '', 'Hormat kami,', 'PT Tribuana Solusi Maritim'] : ['', BALASAN_EN, '', 'Regards,', 'PT Tribuana Solusi Maritim'])
const kepala = (b, judul) => [judul, b === 'ID' ? 'Voyage: {{voyage_number}} | Pelabuhan: {{port_name}}' : 'Voyage: {{voyage_number}} | Port: {{port_name}}', '', b === 'ID' ? 'Yth. Bapak/Ibu,' : 'Dear Sir/Madam,', '']
const HARAP = {
  SCHEDULE_CHANGE: {
    ID: [...kepala('ID', 'Update Jadwal Kapal — {{vessel_name}}'), 'Berikut perubahan jadwal {{vessel_name}}:', '{{schedule_lines_ID}}', '', 'Jadwal dapat berubah sewaktu-waktu.', ...kaki('ID')].join('\n'),
    EN: [...kepala('EN', 'Vessel Schedule Update — {{vessel_name}}'), 'Please note the following schedule changes for {{vessel_name}}:', '{{schedule_lines_EN}}', '', 'Schedule is subject to change.', ...kaki('EN')].join('\n'),
  },
  EOSP: {
    ID: [...kepala('ID', 'Update Kapal — {{vessel_name}}'), 'Milestone EOSP untuk {{vessel_name}} pada kunjungan {{port_name}} tercatat pada {{event_local_time}}.', ...kaki('ID')].join('\n'),
    EN: [...kepala('EN', 'Vessel Update — {{vessel_name}}'), 'The EOSP milestone for {{vessel_name}} on the {{port_name}} port call was recorded at {{event_local_time}}.', ...kaki('EN')].join('\n'),
  },
  ALL_FAST: {
    ID: [...kepala('ID', 'Update Sandar — {{vessel_name}}'), '{{vessel_name}} — ALL FAST tercatat di {{port_name}} pada {{event_local_time}}.', ...kaki('ID')].join('\n'),
    EN: [...kepala('EN', 'Berthing Update — {{vessel_name}}'), '{{vessel_name}} — ALL FAST recorded at {{port_name}} at {{event_local_time}}.', ...kaki('EN')].join('\n'),
  },
  SAILED: {
    ID: [...kepala('ID', 'Update Keberangkatan — {{vessel_name}}'), '{{vessel_name}} telah berangkat dari {{port_name}} pada {{event_local_time}}.', ...kaki('ID')].join('\n'),
    EN: [...kepala('EN', 'Departure Update — {{vessel_name}}'), '{{vessel_name}} sailed from {{port_name}} at {{event_local_time}}.', ...kaki('EN')].join('\n'),
  },
}
const KEL = ['SCHEDULE_CHANGE', 'EOSP', 'ALL_FAST', 'SAILED']
const BHS = ['ID', 'EN']
const ID_HARAP = { SCHEDULE_CHANGE: 'schedule', EOSP: 'eosp', ALL_FAST: 'allfast', SAILED: 'sailed' }

// ======================================================================= T1
bagian('[T1] Delapan teks mentah = teks yang disetujui owner (byte-per-byte)')
for (const k of KEL) for (const b of BHS) cek(`${k}/${b} identik byte-per-byte`, T.TEMPLATE_KLIEN[k][b] === HARAP[k][b])
cek('tepat 4 keluarga × 2 bahasa; keluarga = KELUARGA_PESAN_KLIEN (F1)', Object.keys(T.TEMPLATE_KLIEN).join() === KEL.join() && KEL.every((k) => Object.keys(T.TEMPLATE_KLIEN[k]).join() === 'ID,EN') && [...K.KELUARGA_PESAN_KLIEN].join() === KEL.join())
cek('id template wa2.<keluarga>.<bahasa>.v1', KEL.every((k) => BHS.every((b) => T.idTemplateKlien(k, b) === `wa2.${ID_HARAP[k]}.${b}.v1`)) && T.VERSI_TEMPLATE_KLIEN === 1)
cek('id tidak bertabrakan dengan id template WA-1 (wa1.*)', KEL.every((k) => BHS.every((b) => T.idTemplateKlien(k, b) !== WA1T.idTemplate(k, b))))
cek('konstanta template beku', Object.isFrozen(T.TEMPLATE_KLIEN) && KEL.every((k) => Object.isFrozen(T.TEMPLATE_KLIEN[k])))
const semuaTeks = KEL.flatMap((k) => BHS.map((b) => T.TEMPLATE_KLIEN[k][b]))
cek('tanpa preamble SIMULASI WA-1', semuaTeks.every((t) => !/SIMULASI|SIMULATION|TIDAK DIKIRIM|NOT SENT/.test(t)))
cek('"jadwal dapat berubah" HANYA di template jadwal', KEL.every((k) => BHS.every((b) => /Jadwal dapat berubah sewaktu-waktu\.|Schedule is subject to change\./.test(T.TEMPLATE_KLIEN[k][b]) === (k === 'SCHEDULE_CHANGE'))))
cek('pemberitahuan "balasan belum dipantau" di SEMUA template (bahasa yang sesuai)', KEL.every((k) => T.TEMPLATE_KLIEN[k].ID.includes(BALASAN_ID) && T.TEMPLATE_KLIEN[k].EN.includes(BALASAN_EN) && !T.TEMPLATE_KLIEN[k].ID.includes(BALASAN_EN)))
cek('tanpa ETB, tanpa token PIC/staf/nomor', semuaTeks.every((t) => !/ETB|\{\{(pic|contact|staff|phone|nomor|nama_pic)/i.test(t)))
cek('token template hanya dari daftar sumber tervalidasi', semuaTeks.every((t) => [...t.matchAll(/\{\{(\w+)\}\}/g)].every((m) => ['vessel_name', 'voyage_number', 'port_name', 'event_local_time', 'schedule_lines_ID', 'schedule_lines_EN'].includes(m[1]))))
cek('teks template tanpa penanda format WhatsApp (* _ ~ `) di luar token', semuaTeks.every((t) => !/[*~`]/.test(t) && !/_/.test(t.replace(/\{\{\w+\}\}/g, ''))))

// ======================================================================= T2
bagian('[T2] Render dengan data sintetis (contoh laporan F2)')
const dasar = { vesselName: 'MV CONTOH SINTETIS', voyageNumber: 'VYG-2026-900001', portName: 'Balikpapan' }
const WAKTU = WA1P.formatWaktuLokal('2026-10-11T06:30:00.000Z', 'Asia/Makassar')
cek('waktu lokal sintetis dari formatter WA-1 = "2026-10-11 14:30 (UTC+08:00, Asia/Makassar)"', WAKTU === '2026-10-11 14:30 (UTC+08:00, Asia/Makassar)')
const rJadwal = T.renderPesanKlien({ ...dasar, keluarga: 'SCHEDULE_CHANGE', bahasa: 'ID', perubahan: [{ medan: 'eta', lama: '2026-10-14', baru: '2026-10-15' }] })
const harapJadwal = [
  'Update Jadwal Kapal — MV CONTOH SINTETIS',
  'Voyage: VYG-2026-900001 | Pelabuhan: Balikpapan',
  '',
  'Yth. Bapak/Ibu,',
  '',
  'Berikut perubahan jadwal MV CONTOH SINTETIS:',
  'ETA: dari 2026-10-14 menjadi 2026-10-15.',
  '',
  'Jadwal dapat berubah sewaktu-waktu.',
  '',
  BALASAN_ID,
  '',
  'Hormat kami,',
  'PT Tribuana Solusi Maritim',
].join('\n')
cek('contoh jadwal ID (ETA saja) = contoh di laporan, byte-per-byte', rJadwal.body === harapJadwal && rJadwal.templateId === 'wa2.schedule.ID.v1' && rJadwal.templateVersion === 1 && rJadwal.bahasa === 'ID')
const rAf = T.renderPesanKlien({ ...dasar, keluarga: 'ALL_FAST', bahasa: 'EN', eventLocalTime: WAKTU })
const harapAf = ['Berthing Update — MV CONTOH SINTETIS', 'Voyage: VYG-2026-900001 | Port: Balikpapan', '', 'Dear Sir/Madam,', '', 'MV CONTOH SINTETIS — ALL FAST recorded at Balikpapan at 2026-10-11 14:30 (UTC+08:00, Asia/Makassar).', '', BALASAN_EN, '', 'Regards,', 'PT Tribuana Solusi Maritim'].join('\n')
cek('contoh ALL_FAST EN = contoh di laporan, byte-per-byte', rAf.body === harapAf && rAf.templateId === 'wa2.allfast.EN.v1')
const isiHarap = (k, b, nilai) => HARAP[k][b].replace(/\{\{(\w+)\}\}/g, (_, x) => nilai[x])
let renderCocok = true
for (const k of KEL) for (const b of BHS) {
  const inp = k === 'SCHEDULE_CHANGE' ? { ...dasar, keluarga: k, bahasa: b, perubahan: [{ medan: 'eta', lama: '2026-10-14', baru: '2026-10-15' }, { medan: 'etd', lama: '2026-10-16', baru: '2026-10-17' }] } : { ...dasar, keluarga: k, bahasa: b, eventLocalTime: WAKTU }
  const baris = b === 'ID' ? 'ETA: dari 2026-10-14 menjadi 2026-10-15.\nETD: dari 2026-10-16 menjadi 2026-10-17.' : 'ETA: revised from 2026-10-14 to 2026-10-15.\nETD: revised from 2026-10-16 to 2026-10-17.'
  const nilai = { vessel_name: dasar.vesselName, voyage_number: dasar.voyageNumber, port_name: dasar.portName, event_local_time: WAKTU, [`schedule_lines_${b}`]: baris }
  const r = T.renderPesanKlien(inp)
  if (r.body !== isiHarap(k, b, nilai) || r.templateId !== `wa2.${ID_HARAP[k]}.${b}.v1`) renderCocok = false
}
cek('8 render (jadwal ETA+ETD, milestone) = teks harapan terisi', renderCocok)
const etd = T.renderPesanKlien({ ...dasar, keluarga: 'SCHEDULE_CHANGE', bahasa: 'EN', perubahan: [{ medan: 'etd', lama: '2026-10-16', baru: '2026-10-18' }] })
cek('ETD saja: hanya baris ETD tampil, tanpa ETA', etd.body.includes('ETD: revised from 2026-10-16 to 2026-10-18.') && !etd.body.includes('ETA:'))
const terbalik = T.renderPesanKlien({ ...dasar, keluarga: 'SCHEDULE_CHANGE', bahasa: 'ID', perubahan: [{ medan: 'etd', lama: '2026-10-16', baru: '2026-10-17' }, { medan: 'eta', lama: '2026-10-14', baru: '2026-10-15' }] })
cek('urutan tetap ETA lalu ETD walau input terbalik', terbalik.body.indexOf('ETA:') < terbalik.body.indexOf('ETD:'))
cek('deterministik: input sama → body identik (100×)', Array.from({ length: 100 }, () => T.renderPesanKlien({ ...dasar, keluarga: 'EOSP', bahasa: 'ID', eventLocalTime: WAKTU }).body).every((x, _, a) => x === a[0]))
cek('tidak ada token tersisa di hasil render', !/\{\{|\}\}/.test(rJadwal.body + rAf.body + etd.body))
cek('spasi ganda di data dipakai apa adanya (tidak dirapatkan diam-diam)', T.renderPesanKlien({ ...dasar, vesselName: 'MV  DUA SPASI', keluarga: 'SAILED', bahasa: 'ID', eventLocalTime: WAKTU }).body.includes('MV  DUA SPASI telah berangkat'))

// ======================================================================= T3
bagian('[T3] Data berisiko DITOLAK (tidak diubah diam-diam)')
const c = (n) => String.fromCharCode(n)
const BURUK = [
  ['newline', `MV A${c(10)}B`], ['carriage return', `MV A${c(13)}B`], ['tab', `MV A${c(9)}B`], ['NUL', `MV A${c(0)}B`], ['DEL', `MV A${c(127)}B`], ['C1 (U+0085)', `MV A${c(0x85)}B`],
  ['U+2028', `MV A${c(0x2028)}B`], ['U+2029', `MV A${c(0x2029)}B`], ['zero-width space', `MV A${c(0x200b)}B`], ['RLO bidi', `MV A${c(0x202e)}B`], ['LRI bidi', `MV A${c(0x2066)}B`], ['BOM', `${c(0xfeff)}MV A`],
  ['token {{', 'MV {{port_name}}'], ['token }}', 'MV A}}'], ['bintang', 'MV *TEBAL*'], ['garis bawah', 'MV _MIRING_'], ['tilde', 'MV ~CORET~'], ['backtick', 'MV `KODE`'],
  ['awalan kutipan >', '> MV A'], ['awalan daftar -', '- MV A'], ['awalan bullet •', '• MV A'], ['awalan daftar angka', '1. MV A'],
  ['spasi di awal', ' MV A'], ['spasi di akhir', 'MV A '], ['kosong', ''], ['hanya spasi', '   '], ['bukan teks', 42], ['null', null],
]
for (const medan of ['vesselName', 'voyageNumber', 'portName']) {
  const tolakSemua = BURUK.every(([, v]) => kodeGalat(() => T.renderPesanKlien({ ...dasar, [medan]: v, keluarga: 'EOSP', bahasa: 'ID', eventLocalTime: WAKTU })) === 'TEMPLATE_DATA_INVALID')
  cek(`${medan}: ${BURUK.length} varian berisiko → TEMPLATE_DATA_INVALID`, tolakSemua)
}
cek('nilai sah dikembalikan apa adanya oleh periksaTeksData (identitas, bukan salinan yang diubah)', T.periksaTeksData('MV A-B 1.0', 'x') === 'MV A-B 1.0')
cek('data yang ditolak WA-2 justru LOLOS di WA-1 (WA-2 lebih ketat; WA-1 menormalisasi)', WA1T.normalisasiTeksData(`MV A${c(10)}B`, 'x') === 'MV A B' && WA1T.normalisasiTeksData('MV *X*', 'x') === 'MV *X*')
cek('nilai yang sah identik di WA-1 & WA-2 (perilaku sama untuk data bersih)', ['MV CONTOH SINTETIS', 'VYG-2026-900001', 'Balikpapan', 'MV  DUA SPASI'].every((v) => T.periksaTeksData(v, 'x') === v && (v.includes('  ') || WA1T.normalisasiTeksData(v, 'x') === v)))
cek('waktu milestone dengan zona ber-garis-bawah (America/North_Dakota/New_Salem) → TEMPLATE_DATA_INVALID', kodeGalat(() => T.renderPesanKlien({ ...dasar, keluarga: 'EOSP', bahasa: 'EN', eventLocalTime: '2026-10-11 14:30 (UTC-05:00, America/North_Dakota/New_Salem)' })) === 'TEMPLATE_DATA_INVALID')
cek('body > 4096 karakter → TEMPLATE_DATA_INVALID', kodeGalat(() => T.renderPesanKlien({ ...dasar, portName: 'P'.repeat(4100), keluarga: 'EOSP', bahasa: 'ID', eventLocalTime: WAKTU })) === 'TEMPLATE_DATA_INVALID' && T.MAKS_KARAKTER_BODY === 4096)

// ======================================================================= T4
bagian('[T4] Input jadwal & milestone tidak sah DITOLAK')
const J = (perubahan, bahasa = 'ID') => kodeGalat(() => T.renderPesanKlien({ ...dasar, keluarga: 'SCHEDULE_CHANGE', bahasa, perubahan }))
cek('perubahan kosong / tidak ada → TEMPLATE_INPUT_INVALID', J([]) === 'TEMPLATE_INPUT_INVALID' && J(undefined) === 'TEMPLATE_INPUT_INVALID')
cek('medan tak berubah (lama = baru) → ditolak (hanya yang berubah ditampilkan)', J([{ medan: 'eta', lama: '2026-10-14', baru: '2026-10-14' }]) === 'TEMPLATE_INPUT_INVALID')
cek('ETB / medan asing → ditolak (tanpa ETB, K-3)', J([{ medan: 'etb', lama: '2026-10-14', baru: '2026-10-15' }]) === 'TEMPLATE_INPUT_INVALID')
cek('ETA ganda → ditolak', J([{ medan: 'eta', lama: '2026-10-14', baru: '2026-10-15' }, { medan: 'eta', lama: '2026-10-15', baru: '2026-10-16' }]) === 'TEMPLATE_INPUT_INVALID')
cek('lebih dari dua perubahan → ditolak', J([{ medan: 'eta', lama: '2026-10-14', baru: '2026-10-15' }, { medan: 'etd', lama: '2026-10-16', baru: '2026-10-17' }, { medan: 'eta', lama: '2026-10-01', baru: '2026-10-02' }]) === 'TEMPLATE_INPUT_INVALID')
cek('format K-1: jam, ISO lengkap, tanggal tak sah (2026-02-30), null → ditolak', ['2026-10-14 10:00', '2026-10-14T00:00:00Z', '2026-02-30', '14-10-2026', null].every((x) => J([{ medan: 'eta', lama: x, baru: '2026-10-15' }]) === 'TEMPLATE_INPUT_INVALID' && J([{ medan: 'eta', lama: '2026-10-13', baru: x }]) === 'TEMPLATE_INPUT_INVALID'))
cek('jadwal dengan eventLocalTime → ditolak', kodeGalat(() => T.renderPesanKlien({ ...dasar, keluarga: 'SCHEDULE_CHANGE', bahasa: 'ID', perubahan: [{ medan: 'eta', lama: '2026-10-14', baru: '2026-10-15' }], eventLocalTime: WAKTU })) === 'TEMPLATE_INPUT_INVALID')
const M = (eventLocalTime, extra = {}) => kodeGalat(() => T.renderPesanKlien({ ...dasar, keluarga: 'SAILED', bahasa: 'ID', eventLocalTime, ...extra }))
cek('milestone: tanpa waktu / format salah / tanpa zona / UTC polos → ditolak', [undefined, '', '2026-10-11 14:30', '2026-10-11T06:30:00Z', '2026-10-11 14:30 (UTC+08:00)', '2026-10-11 14:30 (UTC, UTC)'].every((w) => M(w) === 'TEMPLATE_INPUT_INVALID'))
cek('milestone dengan perubahan jadwal → ditolak', M(WAKTU, { perubahan: [{ medan: 'eta', lama: '2026-10-14', baru: '2026-10-15' }] }) === 'TEMPLATE_INPUT_INVALID')
cek('bahasa / keluarga tak dikenal → ditolak', kodeGalat(() => T.renderPesanKlien({ ...dasar, keluarga: 'EOSP', bahasa: 'id', eventLocalTime: WAKTU })) === 'TEMPLATE_INPUT_INVALID' && kodeGalat(() => T.renderPesanKlien({ ...dasar, keluarga: 'NOR_TENDERED', bahasa: 'ID', eventLocalTime: WAKTU })) === 'TEMPLATE_INPUT_INVALID')

// ======================================================================= S1
bagian('[S1] Statis — murni, tanpa LLM, tanpa WA-1')
const kode = tanpaKomentar(baca('src/services/whatsapp/wa-template.ts'))
cek('tanpa process.env / DB / jaringan / console', !/process\.env|\$queryRaw|forTenant|@prisma\/client|fetch\(|node:(http|https|net|tls|dns)|console\./.test(kode))
cek('tanpa LLM / AI (openrouter, lib/ai, anthropic, model)', !/openrouter|lib\/ai|anthropic|chatCompletion|\bmodel\b/i.test(kode))
const imp = [...kode.matchAll(/\bfrom\s+'([^']+)'|\bimport\(\s*'([^']+)'\s*\)|\brequire\(\s*'([^']+)'\s*\)/g)].map((m) => m[1] ?? m[2] ?? m[3])
cek('impor HANYA ./wa2-policy (tanpa modul WA-1, termasuk impor relatif)', imp.length === 1 && imp[0] === './wa2-policy', imp.join(', '))
cek('tanpa normalisasi diam-diam (replace pada nilai data selain pengisian token)', [...kode.matchAll(/\.replace\(/g)].length === 1 && /teks\.replace\(\/\\\{\\\{\(\[a-zA-Z_\]\+\)\\\}\\\}\/g/.test(kode))
cek('berkas sumber tanpa karakter kontrol/pemisah baris mentah (regex ditulis sebagai escape)', !/[\u0000-\u0008\u000b-\u001f\u2028\u2029\u200b-\u200f\u202a-\u202e\ufeff]/.test(baca('src/services/whatsapp/wa-template.ts')))

// ======================================================================= S2
bagian('[S2] Lingkup F2')
const berubah = execFileSync('git', ['diff', '--name-only', 'main'], { cwd: AKAR, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const baru = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: AKAR, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const BOLEH = new Set([
  'src/services/whatsapp/wa-template.ts', 'prisma/check-wa2a-template.mjs', 'prisma/check-wa2a-message-policy.mjs',
  // F3 (penyesuaian lingkup disetujui owner) — path persis, tanpa wildcard. Modul F1 yang diperluas F3:
  'src/services/whatsapp/wa2-policy.ts', 'src/services/whatsapp/wa-message-policy.ts',
  'src/services/communication/communication.service.ts',
  'src/services/whatsapp/wa1-bridge.ts',
  'src/services/whatsapp/wa-freshness.ts',
  'src/services/whatsapp/wa-access-resolver.ts',
  'src/services/whatsapp/wa-schedule-confirmation.service.ts',
  'src/services/whatsapp/wa-message.service.ts',
  'prisma/check-comm-policy.mjs',
  'prisma/check-wa2a-contact.mjs',
  'prisma/check-wa2a-access.mjs',
  'prisma/check-wa2a-message-f3.mjs',
  'prisma/check-wa2a-message-f3-db.mjs',
  'docs/whatsapp/WA-2a-F3-EVIDENCE.md',
])
const semua = [...new Set([...berubah, ...baru])]
cek('hanya berkas F2 (+ penyesuaian lingkup F1 & berkas F3 yang disetujui) yang berubah/baru', semua.every((f) => BOLEH.has(f)), semua.join(', ') || '(bersih)')

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
