// Akses UI Komunikasi WA-1 (Step 2I) — untuk layout/halaman server: tampilkan menu, halaman, dan tombol
// "Siapkan Update Klien" HANYA bila pagar Automation Hub lolos (tenant allowlist + ADMIN/MANAJER_OPERASI)
// DAN gerbang WA-1 aktif (flag + bukan produksi). Ini hanya menyembunyikan UI; setiap aksi tetap diputus
// ulang oleh gerbang() di service/API.

import { bolehAksesAutomation } from '../automation/access'
import { bacaKonfigurasiKomunikasi } from './comm-policy'

export function bolehAksesKomunikasi(pengguna: { tenantId?: string | null; role?: string | null }): boolean {
  return bolehAksesAutomation(pengguna) && bacaKonfigurasiKomunikasi(process.env).aktif
}
