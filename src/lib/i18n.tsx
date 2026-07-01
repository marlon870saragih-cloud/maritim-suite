'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

/**
 * i18n bersama Maritime Suite — bilingual ID/EN.
 * Auto-detect dari navigator.language (startsWith 'id' → id, else en), bisa diganti manual.
 * Disimpan di localStorage['ms-lang'] DAN cookie 'ms-lang' (agar server component bisa baca —
 * lihat lib/i18n-server.ts). Saat diganti, router.refresh() supaya konten server ikut ganti bahasa.
 * Client: const t = useT(STR) di mana STR: Record<Lang, {...}>. Tombol: <LangToggle/>.
 */
export type Lang = 'id' | 'en'

function writeCookie(l: Lang) {
  try {
    document.cookie = `ms-lang=${l}; path=/; max-age=31536000; samesite=lax`
  } catch {}
}

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: 'id',
  setLang: () => {},
})

export function LangProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [lang, setLangState] = useState<Lang>('id')

  useEffect(() => {
    let next: Lang = 'id'
    let hadCookie = false
    try {
      const cookie = document.cookie.match(/(?:^|; )ms-lang=(id|en)/)?.[1] as Lang | undefined
      const saved = localStorage.getItem('ms-lang')
      if (cookie) hadCookie = true
      if (saved === 'id' || saved === 'en') next = saved
      else if (cookie) next = cookie
      else next = (navigator.language || 'id').toLowerCase().startsWith('id') ? 'id' : 'en'
    } catch {}
    setLangState(next)
    document.documentElement.lang = next
    writeCookie(next)
    // Kunjungan pertama (belum ada cookie): minta server render ulang dengan bahasa terdeteksi.
    if (!hadCookie) router.refresh()
  }, [router])

  const setLang = (l: Lang) => {
    setLangState(l)
    document.documentElement.lang = l
    try {
      localStorage.setItem('ms-lang', l)
    } catch {}
    writeCookie(l)
    router.refresh() // server component ikut ganti bahasa tanpa reload manual
  }

  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>
}

export function useLang() {
  return useContext(LangCtx)
}

/** Pilih sub-objek bahasa aktif dari kamus Record<Lang, T>. */
export function useT<T>(dict: Record<Lang, T>): T {
  return dict[useContext(LangCtx).lang]
}

/** Tombol ID/EN portabel (inline-styled). tone 'ink' utk latar gelap, 'paper' utk latar terang. */
export function LangToggle({ tone = 'ink', className = '' }: { tone?: 'ink' | 'paper'; className?: string }) {
  const { lang, setLang } = useLang()
  const ink = tone === 'ink'
  const border = ink ? 'rgba(143,166,171,.34)' : '#cdbf98'
  const idle = ink ? '#9fb6b9' : '#6B6553'
  const idleHover = ink ? '#fff' : '#16201f'

  return (
    <div
      className={`ms-lang ${className}`.trim()}
      role="group"
      aria-label="Language / Bahasa"
      style={{ display: 'inline-flex', border: `1px solid ${border}`, borderRadius: 9, overflow: 'hidden' }}
    >
      {(['id', 'en'] as Lang[]).map((l) => {
        const on = lang === l
        return (
          <button
            key={l}
            type="button"
            aria-pressed={on}
            onClick={() => setLang(l)}
            onMouseEnter={(e) => {
              if (!on) e.currentTarget.style.color = idleHover
            }}
            onMouseLeave={(e) => {
              if (!on) e.currentTarget.style.color = idle
            }}
            style={{
              appearance: 'none',
              border: 0,
              cursor: 'pointer',
              padding: '6px 10px',
              fontFamily: 'var(--font-mono), monospace',
              fontSize: '.72rem',
              letterSpacing: '.06em',
              background: on ? '#C79A3E' : 'transparent',
              color: on ? '#231a06' : idle,
              fontWeight: on ? 700 : 400,
              transition: 'background .2s, color .2s',
            }}
          >
            {l.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}
