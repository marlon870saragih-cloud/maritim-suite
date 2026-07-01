'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  Compass,
  Building2,
  Database,
  Ship,
  FileText,
  ListChecks,
  Archive,
  Sparkles,
  Receipt,
  Lightbulb,
  ArrowRight,
} from 'lucide-react'
import { useT } from '@/lib/i18n'

type Section = {
  id: string
  title: string
  intro?: string
  steps: string[]
  note?: string
  link?: { href: string; label: string }
}

type Guide = {
  kicker: string
  h1: string
  subtitle: string
  toc: string
  principleTitle: string
  principle: string
  sections: Section[]
  footerNote: string
}

const SECTION_ICONS: Record<string, LucideIcon> = {
  start: Compass,
  profil: Building2,
  master: Database,
  portcall: Ship,
  finance: FileText,
  dokumen: FileText,
  kelola: ListChecks,
  arsip: Archive,
  ai: Sparkles,
  efaktur: Receipt,
  tips: Lightbulb,
}

const GUIDE: Record<'id' | 'en', Guide> = {
  id: {
    kicker: 'Panduan',
    h1: 'Cara memakai Maritime Suite',
    subtitle: 'Dari masuk pertama kali sampai dokumen terbit & tersimpan. Ikuti urutannya — sekali atur, seterusnya tinggal pakai.',
    toc: 'Isi panduan',
    principleTitle: 'Prinsip utama — wajib dipahami',
    principle:
      'Semua angka (subtotal, fee agensi, total) dihitung otomatis oleh sistem — tidak pernah diketik manual, dan AI tidak pernah menulis angka. AI hanya membantu menyusun bahasa/teks. Anda tetap memeriksa setiap dokumen sebelum menandainya “Final”.',
    footerNote:
      'Masih bingung? Buka Asisten Dokumen AI dari sidebar dan tanyakan langsung — misalnya “buatkan EPDA untuk MT Soechi Asia di Samarinda”.',
    sections: [
      {
        id: 'start',
        title: 'Langkah pertama',
        intro: 'Tiga hal ini cukup diatur sekali di awal. Setelah itu pembuatan dokumen jadi cepat.',
        steps: [
          'Masuk dengan email & kata sandi perusahaan Anda.',
          'Lengkapi Profil Perusahaan (logo, alamat, kontak, NPWP, rekening bank) — ini jadi kop semua dokumen.',
          'Isi Master Data: data kapal (vessel) dan principal yang sering Anda tangani.',
        ],
        note: 'Selama masa uji coba, badge “Trial” menampilkan sisa hari di pojok kanan atas.',
      },
      {
        id: 'profil',
        title: 'Profil Perusahaan',
        intro: 'Inilah identitas yang muncul di kepala setiap PDF. Isi selengkap mungkin.',
        steps: [
          'Buka Pengaturan → Profil Perusahaan.',
          'Unggah logo (PNG transparan paling rapi), isi nama, alamat, telepon, email.',
          'Isi NPWP — wajib jika nanti ingin ekspor e-Faktur Coretax.',
          'Isi data rekening bank (nama bank, nomor, atas nama) — muncul di blok pembayaran dokumen.',
        ],
        link: { href: '/settings/company', label: 'Buka Profil Perusahaan' },
      },
      {
        id: 'master',
        title: 'Master Data: Kapal & Principal',
        intro: 'Data yang dipakai berulang. Diisi sekali, dipilih cepat saat membuat dokumen.',
        steps: [
          'Vessel Database: tambah kapal (nama, IMO, bendera, GT/NRT, LOA) — angka teknis dipakai otomatis di dokumen.',
          'Principal & Kontak: tambah pemilik/penyewa kapal beserta kontaknya.',
          'Semakin lengkap master data, semakin sedikit yang perlu diketik ulang.',
        ],
        link: { href: '/settings/vessels', label: 'Buka Vessel Database' },
      },
      {
        id: 'portcall',
        title: 'Mulai dari Port Call',
        intro: 'Port Call Manager adalah pusatnya. Buat satu port call, lalu semua dokumen tinggal mengikut.',
        steps: [
          'Buat Port Call baru: pilih kapal & principal, isi pelabuhan, ETA/ETD, jenis operasi.',
          'Dari port call itu Anda bisa membuat dokumen yang langsung terisi datanya (kapal, principal, port otomatis).',
          'Semua dokumen yang dibuat dari sebuah port call akan terkumpul rapi di port call tersebut.',
        ],
        link: { href: '/portcall', label: 'Buka Port Call Manager' },
      },
      {
        id: 'finance',
        title: 'Modul Finance',
        intro: 'Dokumen keuangan keagenan: estimasi biaya sampai penagihan.',
        steps: [
          'EPDA/FPDA — estimasi & realisasi biaya disbursement pelabuhan.',
          'Invoice, Kwitansi, Nota Debit/Kredit — penagihan & bukti terima.',
          'PR/PO, BDN, SOA, SPK — pengadaan, bunker, rekap akun, surat perintah kerja.',
          'Isi baris-baris biaya; subtotal, fee agensi, dan total dihitung otomatis. Klik Pratinjau untuk melihat PDF, lalu Simpan.',
        ],
        link: { href: '/finance', label: 'Buka Finance Generator' },
      },
      {
        id: 'dokumen',
        title: 'Modul Maritime Dokumen',
        intro: '29 dokumen operasional & izin berlayar — SOF, NOR, FAL, dan lainnya.',
        steps: [
          'Buka Maritime Dokumen, pilih jenis dokumen dari kategori.',
          'Contoh: SOF (Statement of Facts), NOR (Notice of Readiness), FAL 1–5, Letter of Protest, Crew List, Time Sheet.',
          'Isi formulir → Pratinjau → Simpan. PDF langsung ber-kop perusahaan Anda.',
        ],
        link: { href: '/dokumen', label: 'Buka Maritime Dokumen' },
      },
      {
        id: 'kelola',
        title: 'Menyimpan & status dokumen',
        intro: 'Penting: hanya dokumen yang Disimpan yang bisa dibuka lagi nanti.',
        steps: [
          'Simpan vs Pratinjau/Unduh: Pratinjau & Unduh hanya menghasilkan PDF sesaat. Agar tersimpan di sistem, tekan Simpan.',
          'Status dokumen: Draf → Final → Terkirim → Lunas (atau Batal). Ubah status langsung dari tabel dokumen.',
          'Tiap baris punya tombol Lihat PDF, Buka/Edit (memuat ulang data ke formulir), dan Unduh PDF.',
        ],
        note: 'Tandai “Final” hanya setelah Anda memeriksa semua angka & teksnya.',
      },
      {
        id: 'arsip',
        title: 'Mencari dokumen lama (Arsip)',
        intro: 'Dokumen seberapa lama pun bisa ditemukan kembali di Arsip.',
        steps: [
          'Buka Maritime Dokumen → “Lihat semua”, atau langsung ke halaman Arsip.',
          'Cari dengan nomor dokumen, nama kapal, port, atau principal.',
          'Saring berdasarkan jenis dokumen & status, lalu telusuri per halaman.',
        ],
        link: { href: '/dokumen/arsip', label: 'Buka Arsip Dokumen' },
      },
      {
        id: 'ai',
        title: 'Asisten Dokumen AI',
        intro: 'Cara tercepat: minta lewat percakapan. AI membantu menyusun, Anda yang memutuskan.',
        steps: [
          'Buka Asisten Dokumen AI dari sidebar.',
          'Ketik permintaan dengan bahasa biasa, mis. “buat NOR untuk kapal X di pelabuhan Y”.',
          'AI menyusun teks & draf; angka tetap dihitung mesin, dan Anda memeriksa sebelum menyimpan.',
        ],
        link: { href: '/finance/asisten', label: 'Buka Asisten AI' },
      },
      {
        id: 'efaktur',
        title: 'Ekspor e-Faktur (Coretax)',
        intro: 'Untuk pelaporan pajak: ekspor invoice ke format XML Coretax.',
        steps: [
          'Pastikan NPWP perusahaan sudah terisi di Profil Perusahaan.',
          'Pastikan NPWP lawan transaksi (bill-to) terisi pada invoice.',
          'Di halaman Finance, gunakan ekspor e-Faktur sesuai masa pajak (bulan invoice).',
        ],
        link: { href: '/finance', label: 'Cek kesiapan e-Faktur' },
      },
      {
        id: 'tips',
        title: 'Tips singkat',
        steps: [
          'Ganti bahasa ID/EN lewat tombol di pojok kanan atas — termasuk untuk panduan ini.',
          'Di ponsel, buka menu lewat tombol garis-tiga (☰) di kiri atas.',
          'Buka panduan ini kapan saja lewat ikon tanda tanya (?) di kanan atas.',
        ],
      },
    ],
  },
  en: {
    kicker: 'User Guide',
    h1: 'How to use Maritime Suite',
    subtitle: 'From first sign-in to issuing and storing documents. Follow the order — set it up once, then just use it.',
    toc: 'Contents',
    principleTitle: 'Core principle — read this first',
    principle:
      'All figures (subtotals, agency fee, totals) are computed automatically by the system — never typed by hand, and AI never writes numbers. AI only helps with wording. You still review every document before marking it “Final”.',
    footerNote:
      'Still stuck? Open the AI Document Assistant from the sidebar and just ask — e.g. “create an EPDA for MT Soechi Asia in Samarinda”.',
    sections: [
      {
        id: 'start',
        title: 'First steps',
        intro: 'These three are set once. After that, creating documents is fast.',
        steps: [
          'Sign in with your company email & password.',
          'Complete the Company Profile (logo, address, contact, tax ID, bank) — it becomes the header of every document.',
          'Fill Master Data: the vessels and principals you handle often.',
        ],
        note: 'During the trial, a “Trial” badge shows the days remaining at the top right.',
      },
      {
        id: 'profil',
        title: 'Company Profile',
        intro: 'This is the identity printed at the top of every PDF. Fill it in fully.',
        steps: [
          'Open Settings → Company Profile.',
          'Upload a logo (a transparent PNG looks cleanest), add name, address, phone, email.',
          'Add your tax ID (NPWP) — required if you later export e-Faktur (Coretax).',
          'Add bank details (bank name, account number, holder) — shown in the document payment block.',
        ],
        link: { href: '/settings/company', label: 'Open Company Profile' },
      },
      {
        id: 'master',
        title: 'Master Data: Vessels & Principals',
        intro: 'Reused data. Enter once, pick quickly when creating documents.',
        steps: [
          'Vessel Database: add vessels (name, IMO, flag, GT/NRT, LOA) — technical figures auto-fill documents.',
          'Principals & Contacts: add owners/charterers and their contacts.',
          'The more complete your master data, the less you retype.',
        ],
        link: { href: '/settings/vessels', label: 'Open Vessel Database' },
      },
      {
        id: 'portcall',
        title: 'Start from a Port Call',
        intro: 'Port Call Manager is the hub. Create one port call, and documents follow from it.',
        steps: [
          'Create a Port Call: pick vessel & principal, set port, ETA/ETD, operation type.',
          'From that port call you can create documents pre-filled with its data (vessel, principal, port).',
          'All documents created from a port call are grouped neatly under it.',
        ],
        link: { href: '/portcall', label: 'Open Port Call Manager' },
      },
      {
        id: 'finance',
        title: 'Finance module',
        intro: 'Agency finance documents: from cost estimates to billing.',
        steps: [
          'EPDA/FPDA — estimated & final port disbursement accounts.',
          'Invoice, Receipt, Debit/Credit Note — billing & proof of receipt.',
          'PR/PO, BDN, SOA, SPK — procurement, bunker, statement of account, work order.',
          'Enter cost lines; subtotal, agency fee and total compute automatically. Click Preview to see the PDF, then Save.',
        ],
        link: { href: '/finance', label: 'Open Finance Generator' },
      },
      {
        id: 'dokumen',
        title: 'Maritime Documents module',
        intro: '29 operational & clearance documents — SOF, NOR, FAL, and more.',
        steps: [
          'Open Maritime Documents, choose a type from the categories.',
          'Examples: SOF (Statement of Facts), NOR (Notice of Readiness), FAL 1–5, Letter of Protest, Crew List, Time Sheet.',
          'Fill the form → Preview → Save. The PDF carries your company letterhead.',
        ],
        link: { href: '/dokumen', label: 'Open Maritime Documents' },
      },
      {
        id: 'kelola',
        title: 'Saving & document status',
        intro: 'Important: only documents you Save can be reopened later.',
        steps: [
          'Save vs Preview/Download: Preview & Download only produce a one-off PDF. To keep it in the system, press Save.',
          'Document status: Draft → Final → Sent → Paid (or Cancelled). Change it right from the document table.',
          'Each row has View PDF, Open/Edit (reloads data into the form), and Download PDF.',
        ],
        note: 'Mark “Final” only after you have reviewed every figure and the text.',
      },
      {
        id: 'arsip',
        title: 'Finding old documents (Archive)',
        intro: 'Any document, however old, can be found again in the Archive.',
        steps: [
          'Open Maritime Documents → “View all”, or go straight to the Archive page.',
          'Search by document number, vessel name, port, or principal.',
          'Filter by document type & status, then page through results.',
        ],
        link: { href: '/dokumen/arsip', label: 'Open Document Archive' },
      },
      {
        id: 'ai',
        title: 'AI Document Assistant',
        intro: 'The fastest path: ask in a chat. AI drafts, you decide.',
        steps: [
          'Open the AI Document Assistant from the sidebar.',
          'Type a plain-language request, e.g. “create a NOR for vessel X at port Y”.',
          'AI composes the text & a draft; numbers stay machine-computed, and you review before saving.',
        ],
        link: { href: '/finance/asisten', label: 'Open AI Assistant' },
      },
      {
        id: 'efaktur',
        title: 'Export e-Faktur (Coretax)',
        intro: 'For tax reporting: export invoices to the Coretax XML format.',
        steps: [
          'Make sure your company tax ID is set in the Company Profile.',
          'Make sure the buyer (bill-to) tax ID is set on the invoice.',
          'On the Finance page, use the e-Faktur export for the relevant tax period (invoice month).',
        ],
        link: { href: '/finance', label: 'Check e-Faktur readiness' },
      },
      {
        id: 'tips',
        title: 'Quick tips',
        steps: [
          'Switch ID/EN with the button at the top right — including for this guide.',
          'On mobile, open the menu via the hamburger (☰) at the top left.',
          'Open this guide anytime via the question-mark (?) icon at the top right.',
        ],
      },
    ],
  },
}

export default function PanduanPage() {
  const t = useT(GUIDE)

  return (
    <div className="p-margin-page max-w-[1100px] mx-auto space-y-8">
      {/* Header */}
      <header className="space-y-2">
        <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.kicker}</p>
        <h1 className="font-display text-[28px] text-[#C8DCF8] leading-tight">{t.h1}</h1>
        <p className="text-text-secondary text-sm max-w-2xl">{t.subtitle}</p>
      </header>

      {/* Core principle callout */}
      <section className="relative rounded-xl border border-accent-amber/40 bg-accent-amber/[0.07] px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent-amber/15 border border-accent-amber/40 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-accent-amber" />
          </div>
          <div>
            <p className="font-display text-base text-accent-amber mb-1">{t.principleTitle}</p>
            <p className="text-sm text-text-primary/90 leading-relaxed">{t.principle}</p>
          </div>
        </div>
      </section>

      {/* Table of contents */}
      <nav className="rounded-xl border border-card-border bg-card-bg p-4">
        <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3 px-1">{t.toc}</p>
        <ol className="grid sm:grid-cols-2 gap-1">
          {t.sections.map((s, i) => {
            const Icon = SECTION_ICONS[s.id] ?? FileText
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-tertiary/50 transition-colors group"
                >
                  <span className="font-mono text-xs text-text-secondary/60 w-5 text-right">{i + 1}</span>
                  <Icon className="w-4 h-4 text-accent-blue/80 shrink-0" />
                  <span className="text-sm text-text-primary group-hover:text-accent-blue transition-colors">
                    {s.title}
                  </span>
                </a>
              </li>
            )
          })}
        </ol>
      </nav>

      {/* Sections */}
      <div className="space-y-5">
        {t.sections.map((s, i) => {
          const Icon = SECTION_ICONS[s.id] ?? FileText
          return (
            <section
              key={s.id}
              id={s.id}
              className="scroll-mt-24 rounded-xl border border-card-border bg-card-bg overflow-hidden"
            >
              <div className="flex items-center gap-3 px-5 py-4 border-b border-card-border bg-surface-secondary">
                <div className="w-9 h-9 rounded-lg bg-accent-blue/12 border border-accent-blue/30 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-accent-blue" />
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-text-secondary/60 uppercase tracking-widest">
                    {String(i + 1).padStart(2, '0')}
                  </p>
                  <h2 className="font-display text-lg text-white leading-tight">{s.title}</h2>
                </div>
              </div>

              <div className="px-5 py-4 space-y-3">
                {s.intro && <p className="text-sm text-text-secondary">{s.intro}</p>}
                <ol className="space-y-2.5">
                  {s.steps.map((step, j) => (
                    <li key={j} className="flex gap-3">
                      <span className="mt-0.5 w-5 h-5 rounded-full bg-accent-blue/10 border border-accent-blue/30 text-accent-blue font-mono text-[10px] flex items-center justify-center shrink-0">
                        {j + 1}
                      </span>
                      <span className="text-sm text-text-primary/90 leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>

                {s.note && (
                  <p className="text-xs text-accent-amber/90 bg-accent-amber/[0.07] border border-accent-amber/25 rounded-lg px-3 py-2 leading-relaxed">
                    {s.note}
                  </p>
                )}

                {s.link && (
                  <Link
                    href={s.link.href}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-blue hover:text-primary transition-colors pt-1"
                  >
                    {s.link.label}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            </section>
          )
        })}
      </div>

      <p className="text-sm text-text-secondary border-t border-card-border pt-5">{t.footerNote}</p>
    </div>
  )
}
