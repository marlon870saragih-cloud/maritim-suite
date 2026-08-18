// VoyageEvent[] → SofData.events[] (K130, Fase 7g). Prefill SAJA — form SOF
// manual (SofForm.tsx) TETAP ADA dan tidak dimatikan (M6); ini cuma mengisi
// nilai awal yang operator boleh ubah sebelum menyimpan/mencetak.
//
// MURNI dalam arti fungsional: tak ada DB/fetch di sini, cuma pemetaan bentuk
// + format tanggal dari input yang sudah dibaca pemanggilnya (SofForm.tsx,
// lewat GET /api/voyages/[id]/events yang sudah berpagar K85-nya sendiri).

import type { SofEvent } from './sof-data'
import { LABEL_PERISTIWA, type KodePeristiwa } from '@/services/ops/event-codes'

export type PeristiwaUntukSof = {
  eventCode: string
  description: string | null
  occurredAt: string | Date
  remarks: string | null
}

const fmtTanggal = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
const fmtJam = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)

/**
 * Terurut `occurredAt` MENAIK (kronologi asli SOF) — pemanggil boleh mengirim
 * urutan apa pun, fungsi ini yang mengurutkan ulang, bukan mempercayai urutan
 * larik masuk (sejalan K130: "terurut occurredAt, bukan urutan input").
 */
export function sofEventsDariPeristiwa(peristiwa: readonly PeristiwaUntukSof[]): SofEvent[] {
  return [...peristiwa]
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
    .map((p) => {
      const d = new Date(p.occurredAt)
      const label = LABEL_PERISTIWA.en[p.eventCode as KodePeristiwa] ?? p.eventCode
      const desc = p.eventCode === 'OTHER' && p.description ? p.description : p.description ? `${label} — ${p.description}` : label
      return {
        date: fmtTanggal(d),
        time: fmtJam(d),
        desc: p.remarks ? `${desc} (${p.remarks})` : desc,
      }
    })
}
