// Super-admin = operator SaaS (mis. pemilik) yang boleh mengaktifkan langganan
// tenant lain secara manual (setelah verifikasi bukti transfer).
// Daftar email diambil dari env `SUPERADMIN_EMAILS` (dipisah koma).
export function isSuperadmin(email?: string | null): boolean {
  if (!email) return false
  const list = (process.env.SUPERADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return list.includes(email.toLowerCase())
}
