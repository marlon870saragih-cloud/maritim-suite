/**
 * Saat MEMBUAT dokumen baru, teruskan parameter `portcall`/`from` dari URL halaman
 * form ke endpoint save, agar dokumen tersimpan terkait ke Port Call yang benar
 * (langsung atau diwarisi lewat rantai dokumen). Dipakai di cabang "belum tersimpan"
 * saja — setelah tersimpan, form memakai `&id=` dan tautan sudah melekat di DB.
 */
export function createLinkQuery(): string {
  if (typeof window === 'undefined') return ''
  const p = new URLSearchParams(window.location.search)
  const parts: string[] = []
  const portCallId = p.get('portcall')
  const fromId = p.get('from')
  if (portCallId) parts.push(`portcall=${encodeURIComponent(portCallId)}`)
  if (fromId) parts.push(`from=${encodeURIComponent(fromId)}`)
  return parts.length ? '&' + parts.join('&') : ''
}
