// Adapter TERBATAS WA-1 → WA-2 (WA-2a Step 2F F3, keputusan owner D2/D3).
//
// SATU-SATUNYA berkas src/services/whatsapp yang boleh mengimpor modul WA-1 (dikunci uji: resolusi impor,
// termasuk impor relatif). Hanya meneruskan fungsi yang AMAN dibagi — tanpa gerbang/flag WA-1, tanpa
// process.env — sehingga WA-2 tidak bergantung pada WA1_INTERNAL_FAKE_TEST_ENABLED:
//   • Prepare inti (pengelompokan sinyal, revalidasi sumber, idempoten per kunci sumber) + muat/kunci/revalidasi
//     kandidat — tidak diduplikasi di WA-2 (D2).
//   • Klasifikasi sinyal & teks kunci kandidat (murni), JSON kanonik untuk sidik (murni), deteksi konflik yang
//     aman diulang.
// Tidak ada pembuat approval, tidak ada Send, tidak ada template WA-1 (template klien = wa-template.ts).

export {
  bisaDiulang as bisaDiulangWa1,
  kunciCandidate,
  muatCandidateDalamTx,
  revalidasiCandidate,
  siapkanDalamTx as siapkanCandidateDalamTx,
  type CandidateBaris,
  type HasilRevalidasiCandidate,
  type HasilSiapkanCandidate,
  type Tx as TxWa1,
} from '@/services/communication/communication.service'
export { klasifikasiSinyal, teksKunciCandidate, type KunciCandidate, type SinyalMasuk } from '@/services/communication/comm-policy'
export { jsonKanonikKomunikasi } from '@/services/communication/comm-hash'
