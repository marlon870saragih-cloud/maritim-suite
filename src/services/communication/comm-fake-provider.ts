// Penyedia FAKE WA-1 (Step 2E) — fungsi MURNI. Hanya `import type`.
//
// PRD §13.1: deterministik, tanpa acak; skenario ditetapkan pada fixture. TANPA egress:
// tak ada HTTP/DNS/socket, kredensial, deep link, atau fallback ke penyedia nyata. Juga
// tanpa jam, env, atau DB — keluarannya HANYA fungsi dari (skenario, attemptNo, dasarReceipt).
// Kemurnian ini syarat model satu transaksi: service boleh menjalankan ulang seluruh
// transaksi Send (konflik/serialisasi) tanpa efek samping di luar database.
//
// Setiap hasil membawa provider=FAKE, simulation=true, externalDelivery=false; FAKE_SENT
// tidak dapat dipromosikan menjadi SENT (tak ada state SENT di WA-1).

import type { SkenarioFake } from './comm-fixture'

type Simulasi = { provider: 'FAKE'; simulation: true; externalDelivery: false }

export type HasilPenyediaFake =
  | (Simulasi & { diterima: true; receipt: string })
  | (Simulasi & { diterima: false; alasan: 'FAKE_SIMULATED_FAILURE' })

const POLA_DASAR_RECEIPT = /^[0-9a-f]{64}$/

export function kirimLewatPenyediaFake(i: { skenario: SkenarioFake; attemptNo: number; dasarReceipt: string }): HasilPenyediaFake {
  if (!Number.isSafeInteger(i.attemptNo) || i.attemptNo < 1) throw new Error('[fake] attemptNo tidak sah.')
  if (typeof i.dasarReceipt !== 'string' || !POLA_DASAR_RECEIPT.test(i.dasarReceipt)) throw new Error('[fake] dasar receipt tidak sah.')
  const sim: Simulasi = { provider: 'FAKE', simulation: true, externalDelivery: false }
  const diterima = (): HasilPenyediaFake => ({ ...sim, diterima: true, receipt: `fake_${i.dasarReceipt.slice(0, 32)}` })
  const gagal = (): HasilPenyediaFake => ({ ...sim, diterima: false, alasan: 'FAKE_SIMULATED_FAILURE' })
  switch (i.skenario) {
    case 'SUCCESS':
      return diterima()
    case 'FAIL_BEFORE_ACCEPT':
      return gagal()
    case 'FAIL_ONCE_THEN_SUCCESS':
      return i.attemptNo === 1 ? gagal() : diterima()
    default:
      throw new Error('[fake] skenario tidak dikenal.')
  }
}
