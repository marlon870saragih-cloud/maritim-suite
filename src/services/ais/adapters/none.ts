// Adapter NONE — bawaan (K175: tanpa penyedia adalah keadaan SAH). Tanpa jaringan,
// tanpa kunci, tanpa data posisi buatan. Poller tak pernah memanggil fetchLatest
// untuk adapter ini; implementasinya tetap aman bila terpanggil.

import type { AisAdapter } from '../contract'

export const adapterNone: AisAdapter = {
  id: 'NONE',
  capabilities: {
    latestByMmsi: true,
    maxMmsiPerRequest: 1,
    track: false,
    sourceTypes: ['UNKNOWN'],
    delivery: 'POLL',
    rateLimit: null,
    reportsPositionTime: true,
    minPollIntervalSec: 0,
  },
  configured: () => false,
  async fetchLatest() {
    return { ok: false, code: 'NOT_CONFIGURED', retryable: false }
  },
}
