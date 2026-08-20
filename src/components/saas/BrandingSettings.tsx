'use client'

// Settings › Merek (K180, Fase 8i). Logo, satu warna aksen + pratinjau
// kontras LANGSUNG (client-side, sebelum simpan — periksaWarnaAksen() murni,
// aman diimpor di komponen klien), dan alamat portal ber-slug (K182).

import { useEffect, useRef, useState } from 'react'
import { Loader2, Upload, Palette, Link2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'
import { periksaWarnaAksen } from '@/services/saas/contrast'

type Branding = {
  companyName: string
  brandPrimaryColor: string | null
  portalSlug: string | null
  logoTersedia: boolean
  logoViaAttachment: boolean
}

const T: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Merek', desc: 'Logo, warna aksen, dan alamat portal yang dilihat pelanggan & vendor Anda saat masuk ke portal.',
    logoTitle: 'Logo', logoDesc: 'Tampil di header portal & halaman masuk ber-alamat sendiri. Dokumen (EPDA/FDA/Invoice) sudah memakai logo ini sejak awal, tak berubah.',
    uploadBtn: 'Unggah Logo', uploading: 'Mengunggah…', noLogo: 'Belum ada logo diunggah — memakai logo lama (jika ada) di dokumen.',
    colorTitle: 'Warna Aksen', colorDesc: 'Satu warna untuk tombol & tautan di portal. Sistem otomatis memilih teks putih/hitam yang paling terbaca di atasnya.',
    colorPreview: 'Pratinjau tombol', colorSafe: 'Kontras aman', colorWarn: 'Kontras rendah',
    slugTitle: 'Alamat Portal', slugDesc: 'Pelanggan & vendor masuk lewat alamat ini alih-alih halaman masuk umum.',
    slugPlaceholder: 'nama-perusahaan-anda', slugPreview: 'Pratinjau:', slugNone: 'Belum diatur — portal Anda memakai halaman masuk umum tanpa logo.',
    save: 'Simpan', saving: 'Menyimpan…', saved: 'Tersimpan.',
    errGeneric: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.', errUpload: 'Gagal mengunggah logo.',
    errFileType: 'Format tidak didukung — gunakan PNG, JPG, atau WebP.',
  },
  en: {
    title: 'Branding', desc: 'Logo, accent color, and portal address seen by your customers & vendors when signing in to the portal.',
    logoTitle: 'Logo', logoDesc: 'Shown in the portal header & its own login address. Documents (EPDA/FDA/Invoice) already use this logo, unchanged.',
    uploadBtn: 'Upload Logo', uploading: 'Uploading…', noLogo: 'No logo uploaded yet — documents fall back to the legacy logo, if any.',
    colorTitle: 'Accent Color', colorDesc: 'One color for buttons & links in the portal. The system automatically picks the most readable white/black text on top of it.',
    colorPreview: 'Button preview', colorSafe: 'Safe contrast', colorWarn: 'Low contrast',
    slugTitle: 'Portal Address', slugDesc: 'Customers & vendors sign in through this address instead of the generic login page.',
    slugPlaceholder: 'your-company-name', slugPreview: 'Preview:', slugNone: 'Not set yet — your portal uses the generic login page without a logo.',
    save: 'Save', saving: 'Saving…', saved: 'Saved.',
    errGeneric: 'Failed to save.', errConn: 'Failed to connect to server.', errUpload: 'Failed to upload logo.',
    errFileType: 'Unsupported format — use PNG, JPG, or WebP.',
  },
}

const inputCls =
  'w-full h-10 px-3 rounded-md border border-card-border bg-surface-tertiary/40 text-white text-sm focus:outline-none focus:border-accent-blue'

export function BrandingSettings() {
  const t = useT(T)
  const [data, setData] = useState<Branding | null>(null)
  const [color, setColor] = useState('')
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [logoNonce, setLogoNonce] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function muat() {
    const res = await fetch('/api/settings/branding')
    if (!res.ok) return
    const d: Branding = await res.json()
    setData(d)
    setColor(d.brandPrimaryColor ?? '')
    setSlug(d.portalSlug ?? '')
  }

  useEffect(() => {
    muat()
  }, [])

  const kontras = color ? periksaWarnaAksen(color) : null

  async function simpan() {
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch('/api/settings/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brandPrimaryColor: color || null, portalSlug: slug || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setNotice({ ok: false, text: body?.error?.message ?? t.errGeneric })
        return
      }
      await muat()
      setNotice({ ok: true, text: t.saved })
    } catch {
      setNotice({ ok: false, text: t.errConn })
    } finally {
      setBusy(false)
    }
  }

  async function unggahLogo(file: File) {
    setUploadingLogo(true)
    setNotice(null)
    try {
      const form = new FormData()
      form.set('file', file)
      const res = await fetch('/api/settings/branding/logo', { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setNotice({ ok: false, text: body?.error?.message ?? t.errUpload })
        return
      }
      await muat()
      setLogoNonce((n) => n + 1)
      setNotice({ ok: true, text: t.saved })
    } catch {
      setNotice({ ok: false, text: t.errConn })
    } finally {
      setUploadingLogo(false)
    }
  }

  if (!data) return <Loader2 className="h-5 w-5 animate-spin text-text-secondary" />

  return (
    <div className="space-y-6">
      {notice && (
        <p className={`text-sm rounded-md px-3 py-2 ${notice.ok ? 'bg-status-success/10 text-status-success' : 'bg-status-danger/10 text-status-danger'}`}>
          {notice.text}
        </p>
      )}

      {/* LOGO */}
      <div className="bg-card-bg border border-card-border rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-accent-blue" />
          <h2 className="font-display text-white text-base">{t.logoTitle}</h2>
        </div>
        <p className="text-text-secondary text-xs">{t.logoDesc}</p>

        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-md border border-card-border bg-surface-tertiary/40 flex items-center justify-center overflow-hidden shrink-0">
            {data.logoTersedia ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={logoNonce} src={`/api/settings/branding/logo?v=${logoNonce}`} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              <span className="text-text-secondary text-[10px] text-center px-1">{t.noLogo}</span>
            )}
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void unggahLogo(f)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingLogo}
              className="inline-flex items-center gap-2 rounded-md border border-card-border px-3 py-2 text-xs text-text-secondary hover:text-white hover:border-accent-blue/50 transition-colors disabled:opacity-40"
            >
              {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploadingLogo ? t.uploading : t.uploadBtn}
            </button>
          </div>
        </div>
      </div>

      {/* WARNA AKSEN */}
      <div className="bg-card-bg border border-card-border rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-accent-blue" />
          <h2 className="font-display text-white text-base">{t.colorTitle}</h2>
        </div>
        <p className="text-text-secondary text-xs">{t.colorDesc}</p>

        <div className="flex items-center gap-3">
          <input
            type="color"
            value={kontras?.hex ?? '#0059BB'}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-14 rounded-md border border-card-border bg-transparent cursor-pointer"
          />
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#0059BB"
            className={`${inputCls} max-w-[160px] font-mono`}
          />
          {color && kontras?.hex && (
            <button
              type="button"
              style={{ backgroundColor: kontras.hex, color: kontras.tekstAman ?? '#fff' }}
              className="px-4 py-2 rounded-lg text-sm font-medium pointer-events-none"
            >
              {t.colorPreview}
            </button>
          )}
        </div>

        {kontras?.hex && (
          <p className={`text-xs flex items-center gap-1.5 ${kontras.amanAA ? 'text-status-success' : 'text-status-warning'}`}>
            {kontras.amanAA ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {kontras.amanAA ? `${t.colorSafe} (${kontras.rasio}:1)` : kontras.peringatan}
          </p>
        )}
        {color && !kontras?.hex && (
          <p className="text-xs text-status-danger flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> {color}
          </p>
        )}
      </div>

      {/* SLUG PORTAL */}
      <div className="bg-card-bg border border-card-border rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-accent-blue" />
          <h2 className="font-display text-white text-base">{t.slugTitle}</h2>
        </div>
        <p className="text-text-secondary text-xs">{t.slugDesc}</p>

        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          placeholder={t.slugPlaceholder}
          className={`${inputCls} max-w-sm font-mono`}
        />
        {slug ? (
          <p className="text-text-secondary text-xs">
            {t.slugPreview} <code className="text-accent-teal">/portal/{slug}/login</code>
          </p>
        ) : (
          <p className="text-text-secondary text-xs">{t.slugNone}</p>
        )}
      </div>

      <button
        type="button"
        onClick={simpan}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white
                   transition-colors hover:bg-accent-blue/90 disabled:opacity-40"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? t.saving : t.save}
      </button>
    </div>
  )
}
