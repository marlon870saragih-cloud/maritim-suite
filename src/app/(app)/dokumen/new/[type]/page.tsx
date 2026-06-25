import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function NewDocumentPage({ params }: { params: { type: string } }) {
  const label = params.type.replace(/_/g, ' ')

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-6">
      <Link
        href="/dokumen"
        className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-blue text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali ke Dokumen
      </Link>

      <div className="bg-card-bg border border-card-border rounded-lg p-8">
        <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-2">
          Dokumen Baru
        </p>
        <h1 className="font-display text-2xl text-white mb-2">{label}</h1>
        <p className="text-text-secondary text-sm">
          Form pembuatan dokumen ini sedang disiapkan (Step 5 lanjutan).
        </p>
      </div>
    </div>
  )
}
