import { cookies, headers } from 'next/headers'

/**
 * Bahasa aktif untuk SERVER component. Sumber: cookie 'ms-lang' (ditulis oleh LangProvider
 * client). Fallback ke header Accept-Language, lalu default 'id' (produk Indonesia).
 * Pakai: const lang = getLang(); const t = DICT[lang].
 */
export type Lang = 'id' | 'en'

export function getLang(): Lang {
  const cookie = cookies().get('ms-lang')?.value
  if (cookie === 'id' || cookie === 'en') return cookie
  const accept = (headers().get('accept-language') || '').toLowerCase()
  if (accept.startsWith('en')) return 'en'
  return 'id'
}
