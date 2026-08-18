// Bentuk `ButirTimeline` + penggabungan/pengurutan — MURNI (K11/K51), tanpa
// satu pun impor nilai, tanpa `new Date()`, tanpa query. Delapan sumber
// (VoyageEvent, AuditLog-status, Task, Disbursement, Invoice, Comment,
// Attachment, EmailLog) semuanya sudah diproyeksikan jadi `ButirTimeline` oleh
// `timeline.service.ts` SEBELUM sampai ke sini — berkas ini cuma menggabung
// & mengurutkan, sejalan K39/K46/K66/K113 (turunan dihitung saat diminta,
// tak disimpan).

export type SumberTimeline =
  | 'EVENT'
  | 'STATUS'
  | 'TASK'
  | 'DISBURSEMENT'
  | 'INVOICE'
  | 'COMMENT'
  | 'ATTACHMENT'
  | 'EMAIL'

export type ButirTimeline = {
  /** ISO string — bentuk murni ini tak boleh memegang objek Date (K51). */
  waktu: string
  sumber: SumberTimeline
  judul: string
  detail: string | null
  href: string | null
  aktor: string | null
}

/**
 * Gabung & urutkan SEMUA butir dari semua sumber, TERBARU DULU (menurun) —
 * pola yang sama dengan Approval/Notification/Comment di layar lain: yang
 * baru terjadi adalah yang paling ingin dilihat orang lebih dulu saat
 * membuka satu voyage. Dua kunci tambahan menjaga determinisme saat `waktu`
 * sama persis (mis. dua baris lahir dalam transaksi yang sama): `sumber`
 * menaik, lalu urutan asli — sejalan gaya tie-break `urutkanUntukPemotongan`
 * di konteks.ts (K76/3).
 */
export function gabungkanTimeline(...sumber: readonly ButirTimeline[][]): ButirTimeline[] {
  return sumber
    .flat()
    .map((b, i) => ({ b, i }))
    .sort((x, y) => {
      const selisih = y.b.waktu.localeCompare(x.b.waktu)
      if (selisih !== 0) return selisih
      if (x.b.sumber !== y.b.sumber) return x.b.sumber < y.b.sumber ? -1 : 1
      return x.i - y.i
    })
    .map((x) => x.b)
}
