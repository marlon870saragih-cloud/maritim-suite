// Registry adapter AIS (PRD-003 Step 4). Konfigurasi memilih ID dari daftar TETAP —
// tak pernah URL (mencegah SSRF). Adapter vendor ditambahkan satu baris per vendor
// SETELAH API, syarat, dan kuotanya terkonfirmasi; Step 4 hanya NONE & FAKE.

import type { AisAdapter } from './contract'
import { kapabilitasDiterima, type IdPenyedia } from './ais-policy'
import { adapterNone } from './adapters/none'
import { adapterFake } from './adapters/fake'

const REGISTRY: Readonly<Record<IdPenyedia, AisAdapter>> = {
  NONE: adapterNone,
  FAKE: adapterFake,
}

/** Adapter untuk id terdaftar yang kapabilitasnya diterima; selain itu null. */
export function adapterUntuk(id: string): AisAdapter | null {
  if (!Object.prototype.hasOwnProperty.call(REGISTRY, id)) return null
  const a = REGISTRY[id as IdPenyedia]
  return a.id === id && kapabilitasDiterima(a.capabilities) ? a : null
}
