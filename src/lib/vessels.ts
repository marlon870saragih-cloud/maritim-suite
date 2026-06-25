// Parser & tipe field kapal — dipakai bersama oleh route POST & PATCH /api/vessels.

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return v == null ? null : String(v)
  const t = v.trim()
  return t === '' ? null : t
}
const num = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const int = (v: unknown): number | null => {
  const n = num(v)
  return n === null ? null : Math.trunc(n)
}

export type VesselInput = {
  name: string
  imoNumber: string | null
  flag: string | null
  callSign: string | null
  vesselType: string | null
  gt: number | null
  nrt: number | null
  loa: number | null
  beam: number | null
  maxDraft: number | null
  yearBuilt: number | null
}

/** Ambil & rapikan field kapal dari body request (nilai kosong → null). */
export function vesselFields(body: Record<string, unknown>): VesselInput {
  return {
    name: str(body.name) ?? '',
    imoNumber: str(body.imoNumber),
    flag: str(body.flag),
    callSign: str(body.callSign),
    vesselType: str(body.vesselType),
    gt: num(body.gt),
    nrt: num(body.nrt),
    loa: num(body.loa),
    beam: num(body.beam),
    maxDraft: num(body.maxDraft),
    yearBuilt: int(body.yearBuilt),
  }
}
