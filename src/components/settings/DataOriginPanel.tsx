'use client'

// Settings › Data & AI (Fase 6a · K55–K59).
//
// Dua isi, dan urutannya disengaja:
//   1. Status go-live + tombol "Mulai pakai sungguhan" (ADMIN).
//   2. Tabel hitungan NYATA / UJI / SEED per model.
//
// Angka di tabel ini WAJIB sama persis dengan `SELECT dataOrigin, count(*)`
// langsung ke DB (cara verifikasi 6a butir 6) — karena itu tidak ada penyaringan
// apa pun di sisi klien; komponen hanya menampilkan apa yang dihitung
// ringkasanProvenance() di server. Kalau nanti angkanya terasa "terlalu besar",
// yang benar adalah memperbaiki datanya, bukan menyaring tampilannya.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, PlayCircle } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'
import { ASAL_DATA, LABEL_ASAL, type AsalData } from '@/services/ai/provenance'
import type { RingkasanProvenance } from '@/services/ai/origin.service'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    goLiveTitle: 'Status pemakaian',
    belum: 'Belum go-live — semua data baru ditandai LATIHAN/UJI',
    sudah: 'Sudah dipakai sungguhan sejak',
    goLiveBtn: 'Mulai pakai sungguhan',
    goLiveHint:
      'Sesudah tombol ini ditekan, setiap voyage & dokumen BARU ditandai NYATA. Data yang sudah ada TIDAK berubah — asal data adalah cap yang ditempel saat baris dibuat, bukan kesimpulan dari tanggal.',
    adminOnly: 'Hanya ADMIN yang bisa menekan tombol ini.',
    tabelTitle: 'Asal data tersimpan',
    thModel: 'Model',
    thTotal: 'Total',
    belumBercap: 'baris belum bercap (dibaca sebagai UJI)',
    semuaBercap: 'Setiap baris punya asal yang eksplisit.',
    catatan:
      'NYATA = kunjungan/dokumen sungguhan; UJI = latihan, demo, reproduksi bug; SEED = contoh bawaan aplikasi. Hanya baris NYATA yang boleh menaikkan keyakinan prediksi biaya.',
    gagal: 'Gagal menyimpan. Coba lagi.',
  },
  en: {
    goLiveTitle: 'Usage status',
    belum: 'Not live yet — all new data is marked PRACTICE/TEST',
    sudah: 'In real use since',
    goLiveBtn: 'Start real usage',
    goLiveHint:
      'Once pressed, every NEW voyage & document is marked REAL. Existing data does NOT change — data origin is stamped when a row is created, not inferred from dates.',
    adminOnly: 'Only ADMIN can press this button.',
    tabelTitle: 'Stored data origin',
    thModel: 'Model',
    thTotal: 'Total',
    belumBercap: 'rows without a stamp (read as TEST)',
    semuaBercap: 'Every row has an explicit origin.',
    catatan:
      'REAL = genuine calls/documents; TEST = practice, demos, bug repro; SEED = built-in samples. Only REAL rows may raise cost-prediction confidence.',
    gagal: 'Failed to save. Please try again.',
  },
}

/**
 * Warna sengaja TIDAK hijau untuk SEED/UJI (K70 melarangnya untuk tier
 * LATIHAN/KATALOG, dan alasannya sama di sini): hijau dibaca sebagai "beres".
 */
const WARNA: Record<AsalData, string> = {
  NYATA: 'text-status-success',
  UJI: 'text-status-warning',
  SEED: 'text-text-secondary',
}

const fmtTanggal = (d: string | Date, lang: Lang) =>
  new Date(d).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

export function DataOriginPanel({
  ringkasan,
  lang,
  bolehGoLive,
}: {
  ringkasan: RingkasanProvenance
  lang: Lang
  bolehGoLive: boolean
}) {
  const t = useT(STR)
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function mulaiSungguhan() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/tenant/go-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) {
        setError(t.gagal)
        return
      }
      router.refresh()
    } catch {
      setError(t.gagal)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* ---------------- go-live ---------------- */}
      <section className="bg-card-bg border border-card-border rounded-lg p-5 space-y-3">
        <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">
          {t.goLiveTitle}
        </p>

        {ringkasan.sudahGoLive && ringkasan.goLiveAt ? (
          <p className="text-white text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-status-success shrink-0" />
            {t.sudah} <span className="font-mono">{fmtTanggal(ringkasan.goLiveAt, lang)}</span>
          </p>
        ) : (
          <>
            <p className="text-status-warning text-sm">{t.belum}</p>
            <button
              type="button"
              disabled={busy || !bolehGoLive}
              onClick={mulaiSungguhan}
              className="inline-flex items-center gap-2 bg-accent-blue/12 text-accent-blue border border-accent-blue/40
                         rounded px-3.5 py-2 text-sm hover:bg-accent-blue/20 transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
              {t.goLiveBtn}
            </button>
            {!bolehGoLive && <p className="text-text-secondary text-xs">{t.adminOnly}</p>}
          </>
        )}

        <p className="text-text-secondary text-xs leading-relaxed">{t.goLiveHint}</p>
        {error && (
          <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
            {error}
          </p>
        )}
      </section>

      {/* ---------------- hitungan ---------------- */}
      <section className="space-y-3">
        <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">
          {t.tabelTitle}
        </p>

        <div className="overflow-x-auto border border-card-border/60 rounded-md">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                <th className="px-4 py-2.5 font-medium">{t.thModel}</th>
                {/* Urutan kolom NYATA → UJI → SEED: yang paling penting dulu. */}
                {['NYATA', 'UJI', 'SEED'].map((a) => (
                  <th key={a} className="px-4 py-2.5 font-medium text-right">
                    {LABEL_ASAL[lang][a as AsalData]}
                  </th>
                ))}
                <th className="px-4 py-2.5 font-medium text-right">{t.thTotal}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {ringkasan.perModel.map((m) => (
                <tr key={m.model} className="border-b border-card-border/50">
                  <td className="px-4 py-3 text-text-primary font-mono">{m.model}</td>
                  {(['NYATA', 'UJI', 'SEED'] as AsalData[]).map((a) => (
                    <td key={a} className={`px-4 py-3 text-right font-mono ${WARNA[a]}`}>
                      {m.hitungan[a]}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-mono text-text-primary">{m.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-text-secondary text-xs">
          {ringkasan.belumBercap > 0 ? (
            <span className="text-status-warning">
              {ringkasan.belumBercap} {t.belumBercap}
            </span>
          ) : (
            t.semuaBercap
          )}
        </p>
        <p className="text-text-secondary text-xs leading-relaxed">{t.catatan}</p>
        {/* ASAL_DATA diimpor supaya daftar asal yang sah tetap satu sumber (provenance.ts);
            kalau nanti muncul asal keempat, baris ini yang akan menandainya. */}
        {ASAL_DATA.length !== 3 && (
          <p className="text-status-warning text-xs">
            ASAL_DATA berubah ({ASAL_DATA.join(', ')}) — kolom tabel di atas perlu disesuaikan.
          </p>
        )}
      </section>
    </div>
  )
}
