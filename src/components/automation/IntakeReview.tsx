'use client'

// Layar tinjauan Vessel Call Intake (PRD-004 Step 3, §13).
//
// Prinsip tampilan: usulan AI, data master, dan nilai yang dikonfirmasi peninjau
// SELALU dibedakan (lencana ikon + teks). Semua keputusan (pilih/konfirmasi/buat
// master/duplikat/portal/approve) adalah tindakan manusia yang eksplisit; server
// menghitung ulang syarat dan duplikat pada setiap tindakan.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Link2, Loader2, Plus, RadioTower, RefreshCw, RotateCcw, ShieldAlert, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, useT, type Lang } from '@/lib/i18n'
import type { IntakeDto } from '@/services/intake/intake.service'
import type { FieldUsulan, HasilCocok, KandidatDuplikat } from '@/services/intake/intake-policy'
import { VesselFieldsGrid, emptyForm, inputCls, labelCls, type FormState } from '@/components/settings/vessel-form'
import { btnCls, fmtWaktu } from './shared'
import {
  DuplicateBadge,
  IntakeStatusBadge,
  LABEL_COCOK,
  LABEL_KLASIFIKASI,
  LABEL_PERINGATAN,
  LABEL_SYARAT,
  MatchBadge,
  ProvenanceBadge,
} from './intake-shared'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    back: '← Daftar intake', loading: 'Memuat…', errLoad: 'Gagal memuat intake.', errAction: 'Tindakan gagal.', refresh: 'Muat ulang',
    version: 'Versi', classification: 'Klasifikasi', reasonForced: 'Ditetapkan sistem',
    CLASSIFICATION_INVALID: 'klasifikasi AI tidak dikenal', MINIMUM_FIELDS_MISSING: 'identitas kapal atau pelabuhan/ETA tidak ada', TOO_MANY_VESSELS: 'terlalu banyak kapal',
    setClass: 'Tetapkan sebagai', sourceTitle: 'Sumber', kind: 'Jenis input', received: 'Diterima', uploader: 'Pengunggah', file: 'Berkas',
    size: 'Ukuran', hash: 'Sidik jari', original: 'Dokumen asli', originalKept: 'Disimpan (lampiran sensitif)', originalNot: 'Tidak disimpan',
    openOriginal: 'Buka', extractor: 'Pengekstrak', reviewer: 'Peninjau terakhir',
    vesselsTitle: 'Kapal', vessel: 'Kapal', primary: 'Kapal utama', excluded: 'Dikeluarkan dari usulan', exclude: 'Keluarkan', include: 'Sertakan lagi',
    addVessel: 'Tambah kapal', fName: 'Nama', fImo: 'IMO', fMmsi: 'MMSI', fCallSign: 'Call sign', fType: 'Tipe', fRole: 'Peran',
    partiesTitle: 'Pihak & pelabuhan', principal: 'Principal', customer: 'Customer (pihak ditagih)', port: 'Pelabuhan',
    fieldsTitle: 'Jadwal & keterangan', eta: 'ETA', etb: 'ETB', etc: 'ETC', etd: 'ETD', agencyType: 'Jenis keagenan', jetty: 'Jetty',
    clientReference: 'Rujukan pengirim', requestDate: 'Tanggal permintaan', portName: 'Nama pelabuhan (dokumen)', portUnlocode: 'UN/LOCODE (dokumen)',
    principalName: 'Nama principal (dokumen)', customerName: 'Nama customer (dokumen)',
    edit: 'Ubah', save: 'Simpan', cancel: 'Batal', aiSaid: 'AI membaca', empty: '—',
    match: 'Kecocokan master', selected: 'Terpilih', candidates: 'Kandidat', choose: 'Pilih', confirm: 'Konfirmasi kecocokan',
    pickFromMaster: 'Pilih dari master…', createNew: 'Buat baru', leaveEmpty: 'Biarkan kosong', undoEmpty: 'Batalkan "kosong"', unselect: 'Batalkan pilihan',
    portsLink: 'Kelola master pelabuhan', noPortCreate: 'Pelabuhan tidak dibuat dari intake — tambahkan di master pelabuhan bila belum ada.',
    cargoTitle: 'Muatan', noCargo: 'Tidak ada muatan.', remove: 'Hapus', contact: 'Narahubung (hanya untuk isian master baru)',
    sourceConfirmTitle: 'Nilai dari PDF/gambar belum dicek', sourceConfirmBody: 'Cocokkan nama/identitas di atas dengan dokumen asli, lalu tandai sudah dicek.',
    sourceConfirm: 'Saya sudah mencocokkan dengan dokumen', dupTitle: 'Pemeriksaan duplikat', noDup: 'Tidak ditemukan voyage atau intake lain yang mirip.',
    linkThis: 'Tautkan ke voyage ini', linkConfirm: 'Tautkan intake ke voyage ini? Tidak ada voyage baru yang dibuat.', openIntake: 'Buka intake',
    decision: 'Keputusan', continueNew: 'Lanjut sebagai voyage BARU', checked: 'Saya sudah memeriksa kandidat di atas dan ini kunjungan yang berbeda.',
    reason: 'Alasan (wajib, min. 10 karakter)', reasonOpt: 'Alasan (opsional)', cancelIntake: 'Atau batalkan intake dengan tombol Tolak di bawah.',
    portalTitle: 'Paparan portal klien', portalInfo: 'Voyage dengan customer akan terlihat di portal klien bila customer itu punya akses portal.',
    portalWarn: 'Customer ini punya {n} akses portal aktif. Voyage yang dibuat — termasuk status PLANNED, kapal, pelabuhan, dan ETA — LANGSUNG terlihat oleh mereka.',
    portalAck: 'Saya paham voyage ini akan terlihat di portal customer tersebut.', noCustomer: 'Tanpa customer — voyage tidak tampil di portal klien.',
    condTitle: 'Syarat persetujuan', condOk: 'Semua syarat data terpenuhi.', decisionsNeeded: 'Diputuskan saat menyetujui',
    approve: 'Setujui & buat voyage', approving: 'Membuat voyage…', reject: 'Tolak', rejectReason: 'Alasan penolakan', rejectConfirm: 'Tolak intake',
    retry: 'Coba buat lagi', failed: 'Pembuatan voyage gagal', errorCode: 'Kode',
    doneTitle: 'Selesai', voyage: 'Voyage', openVoyage: 'Buka voyage', warnings: 'Peringatan pasca-pembuatan',
    startMonitor: 'Mulai pemantauan', monitorStarted: 'Pemantauan dimulai.', monitorNote: 'Pemantauan tidak dinyalakan otomatis.',
    linkedTitle: 'Ditautkan ke voyage yang sudah ada', rejectedTitle: 'Ditolak', createTitle: 'Buat master baru',
    createConfirm: 'Saya sudah memeriksa data ini dan ingin membuat master baru.', createSave: 'Buat & kaitkan',
    cName: 'Nama', cEmail: 'Email', cPhone: 'Telepon', cAddress: 'Alamat', mmsiNote: 'Sumber MMSI tidak diisi otomatis: pilih sendiri bila MMSI disimpan.',
    reasons: 'Dasar', notesNote: 'Jetty, rujukan pengirim, dan tanggal permintaan disimpan di catatan voyage.',
  },
  en: {
    back: '← Intakes', loading: 'Loading…', errLoad: 'Failed to load intake.', errAction: 'Action failed.', refresh: 'Reload',
    version: 'Version', classification: 'Classification', reasonForced: 'Set by system',
    CLASSIFICATION_INVALID: 'unknown AI classification', MINIMUM_FIELDS_MISSING: 'vessel identity or port/ETA missing', TOO_MANY_VESSELS: 'too many vessels',
    setClass: 'Set as', sourceTitle: 'Source', kind: 'Input type', received: 'Received', uploader: 'Uploaded by', file: 'File',
    size: 'Size', hash: 'Fingerprint', original: 'Original document', originalKept: 'Kept (sensitive attachment)', originalNot: 'Not kept',
    openOriginal: 'Open', extractor: 'Extractor', reviewer: 'Last reviewer',
    vesselsTitle: 'Vessels', vessel: 'Vessel', primary: 'Primary vessel', excluded: 'Excluded from proposal', exclude: 'Exclude', include: 'Include again',
    addVessel: 'Add vessel', fName: 'Name', fImo: 'IMO', fMmsi: 'MMSI', fCallSign: 'Call sign', fType: 'Type', fRole: 'Role',
    partiesTitle: 'Parties & port', principal: 'Principal', customer: 'Customer (billed party)', port: 'Port',
    fieldsTitle: 'Schedule & details', eta: 'ETA', etb: 'ETB', etc: 'ETC', etd: 'ETD', agencyType: 'Agency type', jetty: 'Jetty',
    clientReference: 'Sender reference', requestDate: 'Request date', portName: 'Port name (document)', portUnlocode: 'UN/LOCODE (document)',
    principalName: 'Principal name (document)', customerName: 'Customer name (document)',
    edit: 'Edit', save: 'Save', cancel: 'Cancel', aiSaid: 'AI read', empty: '—',
    match: 'Master match', selected: 'Selected', candidates: 'Candidates', choose: 'Choose', confirm: 'Confirm match',
    pickFromMaster: 'Pick from master…', createNew: 'Create new', leaveEmpty: 'Leave empty', undoEmpty: 'Undo "empty"', unselect: 'Clear selection',
    portsLink: 'Manage port master', noPortCreate: 'Ports are not created from an intake — add it to the port master if missing.',
    cargoTitle: 'Cargo', noCargo: 'No cargo.', remove: 'Remove', contact: 'Contact (only to prefill new master data)',
    sourceConfirmTitle: 'Values from PDF/image not yet checked', sourceConfirmBody: 'Compare the names/identities above with the original document, then mark them as checked.',
    sourceConfirm: 'I checked them against the document', dupTitle: 'Duplicate check', noDup: 'No similar voyage or intake found.',
    linkThis: 'Link to this voyage', linkConfirm: 'Link this intake to this voyage? No new voyage will be created.', openIntake: 'Open intake',
    decision: 'Decision', continueNew: 'Continue as a NEW voyage', checked: 'I checked the candidates above and this is a different call.',
    reason: 'Reason (required, min. 10 characters)', reasonOpt: 'Reason (optional)', cancelIntake: 'Or cancel the intake with Reject below.',
    portalTitle: 'Client portal exposure', portalInfo: 'A voyage with a customer is visible in the client portal if that customer has portal access.',
    portalWarn: 'This customer has {n} active portal access(es). The created voyage — including PLANNED status, vessel, port and ETA — is IMMEDIATELY visible to them.',
    portalAck: 'I understand this voyage will be visible in that customer’s portal.', noCustomer: 'No customer — the voyage will not appear in the client portal.',
    condTitle: 'Approval conditions', condOk: 'All data conditions are met.', decisionsNeeded: 'Decided when approving',
    approve: 'Approve & create voyage', approving: 'Creating voyage…', reject: 'Reject', rejectReason: 'Rejection reason', rejectConfirm: 'Reject intake',
    retry: 'Try creating again', failed: 'Voyage creation failed', errorCode: 'Code',
    doneTitle: 'Done', voyage: 'Voyage', openVoyage: 'Open voyage', warnings: 'Post-creation warnings',
    startMonitor: 'Start monitoring', monitorStarted: 'Monitoring started.', monitorNote: 'Monitoring is not started automatically.',
    linkedTitle: 'Linked to an existing voyage', rejectedTitle: 'Rejected', createTitle: 'Create new master record',
    createConfirm: 'I checked this data and want to create a new master record.', createSave: 'Create & link',
    cName: 'Name', cEmail: 'Email', cPhone: 'Phone', cAddress: 'Address', mmsiNote: 'MMSI source is not prefilled: choose it yourself if you keep the MMSI.',
    reasons: 'Basis', notesNote: 'Jetty, sender reference and request date are kept in the voyage notes.',
  },
}

const LABEL_ALASAN_DUP: Record<Lang, Record<string, string>> = {
  id: {
    SAME_PORT_ACTIVE_ETA_CLOSE: 'Pelabuhan sama, voyage aktif, ETA ≤ 3 hari',
    SAME_PORT_ACTIVE_NO_ETA: 'Pelabuhan sama, voyage aktif tanpa ETA',
    ETA_WITHIN_WINDOW: 'ETA ≤ 7 hari',
    PORT_MISSING: 'Pelabuhan salah satu sisi kosong',
    ETA_MISSING: 'ETA salah satu sisi kosong',
    RECENTLY_COMPLETED_SAME_PORT: 'Baru selesai di pelabuhan yang sama',
    OTHER_ACTIVE_INTAKE: 'Intake lain yang masih ditinjau untuk kapal yang sama',
  },
  en: {
    SAME_PORT_ACTIVE_ETA_CLOSE: 'Same port, active voyage, ETA ≤ 3 days',
    SAME_PORT_ACTIVE_NO_ETA: 'Same port, active voyage without ETA',
    ETA_WITHIN_WINDOW: 'ETA ≤ 7 days',
    PORT_MISSING: 'Port missing on one side',
    ETA_MISSING: 'ETA missing on one side',
    RECENTLY_COMPLETED_SAME_PORT: 'Recently completed at the same port',
    OTHER_ACTIVE_INTAKE: 'Another intake under review for the same vessel',
  },
}

type Opsi = { id: string; name: string; label?: string }
type Entitas = 'vessel' | 'principal' | 'customer' | 'port'
type Buat = { kind: 'vessel'; index: number } | { kind: 'principal' } | { kind: 'customer' }

const cardCls = 'bg-card-bg border border-card-border rounded-lg p-4 sm:p-5 min-w-0'
const btnGaris = cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary')
const dtCls = 'text-[10px] font-mono uppercase tracking-wider text-text-secondary'

/** Setara idTerpakai() server: dipilih/dibuat manusia, atau cocok otomatis & terkonfirmasi. */
function idDipakai(m: HasilCocok): string | null {
  if (m.leftEmpty || !m.selectedId) return null
  if (m.basis === 'SELECTED_BY_REVIEWER' || m.basis === 'CREATED_BY_REVIEWER') return m.selectedId
  if (m.status !== 'MATCHED' || (m.requiresConfirmation && !m.confirmed)) return null
  return m.selectedId
}

async function bacaGalat(res: Response, cadangan: string): Promise<string> {
  const teks = await res.text().catch(() => '')
  try {
    const j = JSON.parse(teks)
    return j?.error?.message ?? cadangan
  } catch {
    return teks && teks.length < 300 ? teks : cadangan
  }
}

export function IntakeReview({ id }: { id: string }) {
  const t = useT(STR)
  const { lang } = useLang()
  const [d, setD] = useState<IntakeDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [edit, setEdit] = useState<{ key: string; value: string } | null>(null)
  const [master, setMaster] = useState<Record<'vessel' | 'principal' | 'customer' | 'port', Opsi[]>>({ vessel: [], principal: [], customer: [], port: [] })
  const [putusan, setPutusan] = useState<'' | 'CONTINUE_AS_NEW'>('')
  const [sudahCek, setSudahCek] = useState(false)
  const [alasan, setAlasan] = useState('')
  const [ackPortal, setAckPortal] = useState(false)
  const [tolak, setTolak] = useState<string | null>(null)
  const [buat, setBuat] = useState<Buat | null>(null)

  const bisaEdit = d?.status === 'NEEDS_REVIEW'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/automation/intakes/${id}`, { cache: 'no-store' })
      if (!res.ok) return setError(await bacaGalat(res, t.errLoad))
      const body = await res.json()
      setD(body.intake)
    } catch {
      setError(t.errLoad)
    } finally {
      setLoading(false)
    }
  }, [id, t.errLoad])

  useEffect(() => {
    void load()
  }, [load])

  const muatMaster = useCallback(async () => {
    const ambil = async (url: string, peta: (x: Record<string, unknown>) => Opsi): Promise<Opsi[]> => {
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) return []
        const j = await res.json()
        return Array.isArray(j) ? j.map(peta) : []
      } catch {
        return []
      }
    }
    const [vessel, principal, customer, port] = await Promise.all([
      ambil('/api/vessels', (x) => ({ id: String(x.id), name: String(x.name), label: [x.name, x.imoNumber && `IMO ${x.imoNumber}`, x.callSign && `CS ${x.callSign}`].filter(Boolean).join(' · ') })),
      ambil('/api/principals', (x) => ({ id: String(x.id), name: String(x.name) })),
      ambil('/api/customers', (x) => ({ id: String(x.id), name: String(x.name) })),
      ambil('/api/ports', (x) => ({ id: String(x.id), name: String(x.name), label: x.unlocode ? `${x.name} (${x.unlocode})` : String(x.name) })),
    ])
    setMaster({ vessel, principal, customer, port })
  }, [])

  useEffect(() => {
    if (bisaEdit) void muatMaster()
  }, [bisaEdit, muatMaster])

  async function kirim(url: string, method: string, body: Record<string, unknown>, sukses?: string): Promise<boolean> {
    if (!d) return false
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: d.version, ...body }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) {
        const kondisi: string[] | undefined = j?.error?.details?.conditions
        setError(kondisi?.length ? kondisi.map((k) => LABEL_SYARAT[lang][k] ?? k).join(' ') : j?.error?.message ?? t.errAction)
        await load()
        return false
      }
      if (j?.intake) setD(j.intake)
      if (sukses) setNotice(sukses)
      return true
    } catch {
      setError(t.errAction)
      return false
    } finally {
      setBusy(false)
    }
  }

  const patch = (body: Record<string, unknown>) => kirim(`/api/automation/intakes/${id}`, 'PATCH', body)

  async function mulaiPantau() {
    if (!d?.voyageId) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/automation/monitored-voyages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voyageId: d.voyageId }),
      })
      if (!res.ok) setError(await bacaGalat(res, t.errAction))
      else setNotice(t.monitorStarted)
    } finally {
      setBusy(false)
    }
  }

  const p = d?.proposal
  const m = d?.matches
  const pelanggan = m ? idDipakai(m.customer) : null
  const rev = d?.review

  const opsiUntuk = useMemo(() => master, [master])

  if (loading && !d) {
    return <p className="flex items-center gap-2 text-sm text-text-secondary"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t.loading}</p>
  }
  if (!d || !p || !m) {
    return (
      <div className="space-y-3">
        <Link href="/automation/intake" className="text-sm text-accent-blue hover:underline">{t.back}</Link>
        <p role="alert" className="rounded border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error || t.errLoad}</p>
      </div>
    )
  }

  const ubahField = (key: string, value: string | null) => {
    setEdit(null)
    void patch({ fields: { [key]: value === '' ? null : value } })
  }

  const baris = (key: string, label: string, f: FieldUsulan<string | null> | FieldUsulan, jenis: 'text' | 'date' = 'text') => (
    <FieldRow
      key={key}
      label={label}
      f={f as FieldUsulan}
      lang={lang}
      t={t}
      bisaEdit={!!bisaEdit && !busy}
      sedangEdit={edit?.key === key ? edit.value : null}
      mulai={() => setEdit({ key, value: (f.value as string | null) ?? '' })}
      ubah={(v) => setEdit({ key, value: v })}
      batal={() => setEdit(null)}
      simpan={() => ubahField(key, edit?.value ?? '')}
      jenis={jenis}
    />
  )

  const utama = rev?.primaryVesselIndex ?? -1

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/automation/intake" className="text-sm text-accent-blue hover:underline">{t.back}</Link>
        <button type="button" onClick={() => void load()} disabled={loading || busy} className={btnGaris}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} aria-hidden="true" /> {t.refresh}
        </button>
      </div>

      {error && <p role="alert" className="rounded border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}
      {notice && <p role="status" className="rounded border border-status-success/30 bg-status-success/10 px-3 py-2 text-sm text-text-primary">{notice}</p>}

      {/* Ringkasan status */}
      <section className={cardCls} aria-label={t.classification}>
        <div className="flex flex-wrap items-center gap-2">
          <IntakeStatusBadge status={d.status} lang={lang} />
          <DuplicateBadge level={d.duplicateLevel} lang={lang} />
          <span className="text-xs text-text-secondary font-mono">{t.version} {d.version}</span>
        </div>
        <p className="mt-2 text-sm text-text-primary">
          {t.classification}: <strong>{LABEL_KLASIFIKASI[lang][d.classification] ?? d.classification}</strong>
          {p.classificationReason && (
            <span className="text-text-secondary"> — {t.reasonForced}: {t[p.classificationReason] ?? p.classificationReason}</span>
          )}
        </p>
        {bisaEdit && d.classification === 'INSUFFICIENT_INFORMATION' && (
          <div className="mt-2 flex flex-wrap gap-2">
            {(['NEW_NOMINATION', 'NEW_APPOINTMENT'] as const).map((c) => (
              <button key={c} type="button" disabled={busy} className={btnGaris} onClick={() => void patch({ classification: c })}>
                {t.setClass} {LABEL_KLASIFIKASI[lang][c]}
              </button>
            ))}
          </div>
        )}

        {d.status === 'COMPLETED' && (
          <div className="mt-3 rounded border border-status-success/30 bg-status-success/10 px-3 py-2 text-sm">
            <p className="flex items-center gap-2 text-text-primary"><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> {t.doneTitle}: {t.voyage} <strong>{d.voyageNumber}</strong></p>
            <div className="mt-2 flex flex-wrap gap-2">
              {d.voyageId && <Link href={`/voyages/${d.voyageId}`} className={btnGaris}>{t.openVoyage}</Link>}
              <button type="button" disabled={busy} onClick={() => void mulaiPantau()} className={btnGaris}>
                <RadioTower className="w-3.5 h-3.5" aria-hidden="true" /> {t.startMonitor}
              </button>
            </div>
            <p className="mt-1 text-xs text-text-secondary">{t.monitorNote}</p>
            {d.postCreateWarnings.length > 0 && (
              <div className="mt-2">
                <p className={dtCls}>{t.warnings}</p>
                <ul className="list-disc pl-5 text-text-primary">
                  {d.postCreateWarnings.map((w) => <li key={w}>{LABEL_PERINGATAN[lang][w] ?? w}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
        {d.status === 'LINKED_EXISTING' && (
          <div className="mt-3 rounded border border-status-success/30 bg-status-success/10 px-3 py-2 text-sm text-text-primary">
            <p className="flex items-center gap-2"><Link2 className="w-4 h-4" aria-hidden="true" /> {t.linkedTitle}: <strong>{d.voyageNumber}</strong></p>
            {d.voyageId && <Link href={`/voyages/${d.voyageId}`} className={cn(btnGaris, 'mt-2')}>{t.openVoyage}</Link>}
          </div>
        )}
        {d.status === 'REJECTED' && (
          <p className="mt-3 rounded border border-border-muted bg-surface-tertiary px-3 py-2 text-sm text-text-primary">
            <XCircle className="inline w-4 h-4 mr-1" aria-hidden="true" /> {t.rejectedTitle}: {d.decisionReason}
          </p>
        )}
        {d.status === 'FAILED' && (
          <div className="mt-3 rounded border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-text-primary">
            <p>{t.failed} — {t.errorCode}: <code>{d.errorCode}</code></p>
          </div>
        )}
      </section>

      {/* Sumber */}
      <section className={cardCls} aria-labelledby="in-src">
        <h2 id="in-src" className="font-display text-lg text-text-primary">{t.sourceTitle}</h2>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <Info label={t.kind} value={d.inputKind} />
          <Info label={t.received} value={fmtWaktu(String(d.createdAt), lang)} />
          <Info label={t.uploader} value={d.names[d.submittedByUserId] ?? d.submittedByUserId} />
          <Info label={t.reviewer} value={d.reviewedByUserId ? `${d.names[d.reviewedByUserId] ?? d.reviewedByUserId} · ${fmtWaktu(d.reviewedAt ? String(d.reviewedAt) : null, lang)}` : t.empty} />
          <Info label={t.file} value={d.sourceFileName ?? t.empty} />
          <Info label={t.size} value={d.sourceSizeBytes != null ? `${Math.max(1, Math.round(d.sourceSizeBytes / 1024))} KB` : t.empty} />
          <Info label={t.hash} value={d.inputHashShort} mono />
          <div>
            <dt className={dtCls}>{t.original}</dt>
            <dd className="text-text-primary">
              {d.attachmentId ? (
                <>
                  {t.originalKept} ·{' '}
                  <a href={`/api/attachments/${d.attachmentId}/content`} target="_blank" rel="noreferrer" className="text-accent-blue hover:underline">{t.openOriginal}</a>
                </>
              ) : t.originalNot}
            </dd>
          </div>
        </dl>
      </section>

      {/* Konfirmasi sumber PDF/gambar */}
      {bisaEdit && rev && rev.unconfirmedFields.length > 0 && (
        <section className="rounded-lg border border-accent-amber/40 bg-accent-amber/10 p-4 text-sm" aria-labelledby="in-srcconf">
          <h2 id="in-srcconf" className="flex items-center gap-2 font-medium text-text-primary"><ShieldAlert className="w-4 h-4" aria-hidden="true" /> {t.sourceConfirmTitle}</h2>
          <p className="mt-1 text-text-secondary">{t.sourceConfirmBody}</p>
          <button type="button" disabled={busy} onClick={() => void patch({ confirmSourceFields: true })} className={cn(btnGaris, 'mt-2')}>{t.sourceConfirm}</button>
        </section>
      )}

      {/* Kapal */}
      <section className={cardCls} aria-labelledby="in-vessels">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="in-vessels" className="font-display text-lg text-text-primary">{t.vesselsTitle}</h2>
          {bisaEdit && (
            <button type="button" disabled={busy} onClick={() => void patch({ addVessel: true })} className={btnGaris}>
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {t.addVessel}
            </button>
          )}
        </div>
        <div className="mt-3 space-y-4">
          {p.vessels.map((v, i) => (
            <div key={i} className={cn('rounded border border-border-muted p-3', v.excluded && 'opacity-60')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-text-primary">
                  {t.vessel} {i + 1}
                  {i === utama && !v.excluded && <span className="ml-2 rounded border border-accent-blue/40 px-1.5 py-0.5 text-[10px] text-accent-blue">{t.primary}</span>}
                  {v.excluded && <span className="ml-2 text-xs text-text-secondary">{t.excluded}</span>}
                </p>
                {bisaEdit && (
                  <button type="button" disabled={busy} className={btnGaris} onClick={() => void patch({ vessels: [{ index: i, excluded: !v.excluded }] })}>
                    {v.excluded ? t.include : t.exclude}
                  </button>
                )}
              </div>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {(['name', 'imo', 'mmsi', 'callSign', 'vesselType'] as const).map((k) => (
                    <FieldRow
                      key={k}
                      label={t[{ name: 'fName', imo: 'fImo', mmsi: 'fMmsi', callSign: 'fCallSign', vesselType: 'fType' }[k]]}
                      f={v[k]}
                      lang={lang}
                      t={t}
                      bisaEdit={!!bisaEdit && !busy && !v.excluded}
                      sedangEdit={edit?.key === `v${i}.${k}` ? edit.value : null}
                      mulai={() => setEdit({ key: `v${i}.${k}`, value: v[k].value ?? '' })}
                      ubah={(x) => setEdit({ key: `v${i}.${k}`, value: x })}
                      batal={() => setEdit(null)}
                      simpan={() => {
                        const nilai = edit?.value ?? ''
                        setEdit(null)
                        void patch({ vessels: [{ index: i, [k]: nilai === '' ? null : nilai }] })
                      }}
                    />
                  ))}
                  <tr className="border-t border-border-muted/50">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal text-text-secondary w-40">{t.fRole}</th>
                    <td className="py-1.5" colSpan={2}>
                      {bisaEdit && !v.excluded ? (
                        <select
                          aria-label={t.fRole}
                          value={v.role.value ?? ''}
                          disabled={busy}
                          onChange={(e) => void patch({ vessels: [{ index: i, role: e.target.value || null }] })}
                          className="bg-surface border border-border-muted rounded px-2 py-1 text-sm text-text-primary"
                        >
                          <option value="">—</option>
                          <option value="TUG">TUG</option>
                          <option value="BARGE">BARGE</option>
                        </select>
                      ) : (
                        <span className="text-text-primary">{v.role.value ?? t.empty}</span>
                      )}
                      <span className="ml-2"><ProvenanceBadge f={v.role} lang={lang} /></span>
                    </td>
                  </tr>
                </tbody>
              </table>
              {!v.excluded && m.vessels[i] && (
                <MatchPanel
                  t={t}
                  lang={lang}
                  judul={t.match}
                  h={m.vessels[i]}
                  names={d.names}
                  bisaEdit={!!bisaEdit && !busy}
                  opsi={opsiUntuk.vessel}
                  pilih={(idx, dibuat) => void patch({ select: { entity: 'vessel', index: i, id: idx, created: dibuat } })}
                  konfirmasi={() => void patch({ confirm: { entity: 'vessel', index: i } })}
                  buatBaru={() => setBuat({ kind: 'vessel', index: i })}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Pihak & pelabuhan */}
      <section className={cardCls} aria-labelledby="in-parties">
        <h2 id="in-parties" className="font-display text-lg text-text-primary">{t.partiesTitle}</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {(['principal', 'customer', 'port'] as const).map((e) => (
            <div key={e} className="rounded border border-border-muted p-3 min-w-0">
              <p className="text-sm font-medium text-text-primary">{t[e]}</p>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {e === 'principal' && baris('principalName', t.principalName, p.principalName)}
                  {e === 'customer' && baris('customerName', t.customerName, p.customerName)}
                  {e === 'port' && baris('portName', t.portName, p.portName)}
                  {e === 'port' && baris('portUnlocode', t.portUnlocode, p.portUnlocode)}
                </tbody>
              </table>
              <MatchPanel
                t={t}
                lang={lang}
                judul={t.match}
                h={m[e]}
                names={d.names}
                bisaEdit={!!bisaEdit && !busy}
                opsi={opsiUntuk[e]}
                pilih={(idx, dibuat) => void patch({ select: { entity: e as Entitas, id: idx, created: dibuat } })}
                konfirmasi={() => void patch({ confirm: { entity: e } })}
                buatBaru={e === 'port' ? undefined : () => setBuat({ kind: e })}
                kosongkan={e === 'port' ? undefined : (nilai) => void patch({ leaveEmpty: { entity: e, value: nilai } })}
              />
              {e === 'port' && (
                <p className="mt-2 text-xs text-text-secondary">
                  {t.noPortCreate} <Link href="/settings/ports" className="text-accent-blue hover:underline">{t.portsLink}</Link>
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Jadwal & keterangan */}
      <section className={cardCls} aria-labelledby="in-fields">
        <h2 id="in-fields" className="font-display text-lg text-text-primary">{t.fieldsTitle}</h2>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {baris('eta', t.eta, p.eta, 'date')}
            {baris('etb', t.etb, p.etb, 'date')}
            {baris('etc', t.etc, p.etc, 'date')}
            {baris('etd', t.etd, p.etd, 'date')}
            {baris('agencyType', t.agencyType, p.agencyType)}
            {baris('jetty', t.jetty, p.jetty)}
            {baris('clientReference', t.clientReference, p.clientReference)}
            <FieldRow label={t.requestDate} f={p.requestDate} lang={lang} t={t} bisaEdit={false} sedangEdit={null} mulai={() => {}} ubah={() => {}} batal={() => {}} simpan={() => {}} />
          </tbody>
        </table>
        <p className="mt-2 text-xs text-text-secondary">{t.notesNote}</p>
        {p.contact && (
          <p className="mt-2 text-xs text-text-secondary">
            {t.contact}: {[p.contact.name, p.contact.email, p.contact.phone].filter(Boolean).join(' · ')}
          </p>
        )}
      </section>

      {/* Muatan */}
      <section className={cardCls} aria-labelledby="in-cargo">
        <h2 id="in-cargo" className="font-display text-lg text-text-primary">{t.cargoTitle}</h2>
        {p.cargoes.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">{t.noCargo}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {p.cargoes.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-text-primary">
                <span>{c.name}{c.quantity != null ? ` · ${c.quantity} ${c.unit ?? ''}` : ''}{c.operation ? ` · ${c.operation}` : ''}</span>
                <ProvenanceBadge f={{ value: c.name, source: c.source, flags: [], extracted: null, confirmed: false }} lang={lang} />
                {bisaEdit && (
                  <button type="button" disabled={busy} className={btnGaris} onClick={() => void patch({ cargoes: p.cargoes.filter((_, j) => j !== i) })}>{t.remove}</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Duplikat */}
      <section className={cardCls} aria-labelledby="in-dup">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="in-dup" className="font-display text-lg text-text-primary">{t.dupTitle}</h2>
          <DuplicateBadge level={d.duplicateLevel} lang={lang} />
        </div>
        {d.duplicateCandidates.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">{t.noDup}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {d.duplicateCandidates.map((c: KandidatDuplikat) => (
              <li key={`${c.type}-${c.id}`} className="rounded border border-border-muted p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <DuplicateBadge level={c.level} lang={lang} />
                  {c.type === 'VOYAGE' ? (
                    <Link href={`/voyages/${c.id}`} className="font-medium text-accent-blue hover:underline">{c.label}</Link>
                  ) : (
                    <Link href={`/automation/intake/${c.id}`} className="font-medium text-accent-blue hover:underline">{t.openIntake}</Link>
                  )}
                  <span className="text-text-secondary">{[c.vesselName, c.portName, c.eta && `ETA ${c.eta}`, c.status].filter(Boolean).join(' · ')}</span>
                </div>
                <p className="mt-1 text-xs text-text-secondary">{t.reasons}: {LABEL_ALASAN_DUP[lang][c.reason] ?? c.reason}</p>
                {bisaEdit && c.type === 'VOYAGE' && (
                  <button
                    type="button"
                    disabled={busy}
                    className={cn(btnGaris, 'mt-2')}
                    onClick={() => {
                      if (window.confirm(t.linkConfirm)) void kirim(`/api/automation/intakes/${id}/link`, 'POST', { voyageId: c.id, reason: alasan || null })
                    }}
                  >
                    <Link2 className="w-3.5 h-3.5" aria-hidden="true" /> {t.linkThis}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {bisaEdit && d.duplicateLevel !== 'NO_DUPLICATE' && (
          <fieldset className="mt-4 rounded border border-border-muted p-3">
            <legend className="px-1 text-xs text-text-secondary">{t.decision}</legend>
            <label className="flex items-start gap-2 text-sm text-text-primary">
              <input type="radio" name="dup" checked={putusan === 'CONTINUE_AS_NEW'} onChange={() => setPutusan('CONTINUE_AS_NEW')} className="mt-1" />
              {t.continueNew}
            </label>
            {putusan === 'CONTINUE_AS_NEW' && (
              <div className="mt-2 space-y-2 pl-6">
                <label className="flex items-start gap-2 text-sm text-text-primary">
                  <input type="checkbox" checked={sudahCek} onChange={(e) => setSudahCek(e.target.checked)} className="mt-1" />
                  {t.checked}
                </label>
                <label className="block">
                  <span className={labelCls}>{d.duplicateLevel === 'LIKELY_DUPLICATE' ? t.reason : t.reasonOpt}</span>
                  <textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} rows={2} maxLength={1000} className={inputCls} />
                </label>
              </div>
            )}
            <p className="mt-2 text-xs text-text-secondary">{t.cancelIntake}</p>
          </fieldset>
        )}
      </section>

      {/* Paparan portal */}
      {(bisaEdit || d.status === 'FAILED') && (
        <section className={cardCls} aria-labelledby="in-portal">
          <h2 id="in-portal" className="font-display text-lg text-text-primary">{t.portalTitle}</h2>
          {!pelanggan ? (
            <p className="mt-2 text-sm text-text-secondary">{t.noCustomer}</p>
          ) : rev && rev.portalActiveAccessCount > 0 ? (
            <div role="alert" className="mt-2 rounded border border-status-danger/40 bg-status-danger/10 p-3 text-sm text-text-primary">
              <p>{t.portalWarn.replace('{n}', String(rev.portalActiveAccessCount))}</p>
              {bisaEdit && (
                <label className="mt-2 flex items-start gap-2">
                  <input type="checkbox" checked={ackPortal} onChange={(e) => setAckPortal(e.target.checked)} className="mt-1" />
                  {t.portalAck}
                </label>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-text-secondary">{t.portalInfo}</p>
          )}
        </section>
      )}

      {/* Syarat & tindakan */}
      {(bisaEdit || d.status === 'FAILED') && rev && (
        <section className={cardCls} aria-labelledby="in-cond">
          <h2 id="in-cond" className="font-display text-lg text-text-primary">{t.condTitle}</h2>
          {rev.conditions.length === 0 ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-status-success"><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> {t.condOk}</p>
          ) : (
            <ul className="mt-2 list-disc pl-5 text-sm text-text-primary">
              {rev.conditions.map((c) => <li key={c}>{LABEL_SYARAT[lang][c] ?? c}</li>)}
            </ul>
          )}
          {bisaEdit && rev.decisionsNeeded.length > 0 && (
            <div className="mt-2 text-xs text-text-secondary">
              <p className={dtCls}>{t.decisionsNeeded}</p>
              <ul className="list-disc pl-5">{rev.decisionsNeeded.map((c) => <li key={c}>{LABEL_SYARAT[lang][c] ?? c}</li>)}</ul>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {bisaEdit && (
              <button
                type="button"
                disabled={busy || rev.conditions.length > 0}
                onClick={() =>
                  void kirim(`/api/automation/intakes/${id}/approve`, 'POST', {
                    duplicateDecision: d.duplicateLevel === 'NO_DUPLICATE' ? null : putusan || null,
                    duplicateConfirmed: sudahCek,
                    decisionReason: alasan || null,
                    portalExposureAck: ackPortal,
                  })
                }
                className={cn(btnCls, 'bg-accent-blue text-white hover:bg-accent-blue/90')}
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />}
                {busy ? t.approving : t.approve}
              </button>
            )}
            {d.status === 'FAILED' && (
              <button type="button" disabled={busy} onClick={() => void kirim(`/api/automation/intakes/${id}/retry`, 'POST', {})} className={cn(btnCls, 'bg-accent-blue text-white hover:bg-accent-blue/90')}>
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> {t.retry}
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => setTolak(tolak === null ? '' : null)} className={cn(btnCls, 'border border-status-danger/40 text-status-danger')}>
              <XCircle className="w-3.5 h-3.5" aria-hidden="true" /> {t.reject}
            </button>
          </div>
          {tolak !== null && (
            <div className="mt-3 space-y-2">
              <label className="block">
                <span className={labelCls}>{t.rejectReason}</span>
                <textarea value={tolak} onChange={(e) => setTolak(e.target.value)} rows={2} maxLength={1000} className={inputCls} />
              </label>
              <button
                type="button"
                disabled={busy || tolak.trim().length < 3}
                onClick={() => void kirim(`/api/automation/intakes/${id}/reject`, 'POST', { reason: tolak }).then((ok) => ok && setTolak(null))}
                className={cn(btnCls, 'border border-status-danger/40 text-status-danger')}
              >
                {t.rejectConfirm}
              </button>
            </div>
          )}
        </section>
      )}

      {buat && (
        <BuatMasterDialog
          t={t}
          buat={buat}
          prefill={
            buat.kind === 'vessel'
              ? {
                  name: p.vessels[buat.index].name.value ?? '',
                  imoNumber: p.vessels[buat.index].imo.value ?? '',
                  callSign: p.vessels[buat.index].callSign.value ?? '',
                  vesselType: p.vessels[buat.index].vesselType.value ?? '',
                  mmsi: p.vessels[buat.index].mmsi.value ?? '',
                }
              : {
                  name: (buat.kind === 'principal' ? p.principalName.value ?? p.principalName.extracted : p.customerName.value ?? p.customerName.extracted) ?? '',
                  email: p.contact?.email ?? '',
                  phone: p.contact?.phone ?? '',
                }
          }
          tutup={() => setBuat(null)}
          selesai={(idBaru) => {
            setBuat(null)
            void muatMaster()
            if (buat.kind === 'vessel') void patch({ select: { entity: 'vessel', index: buat.index, id: idBaru, created: true } })
            else void patch({ select: { entity: buat.kind, id: idBaru, created: true } })
          }}
        />
      )}
    </div>
  )
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className={dtCls}>{label}</dt>
      <dd className={cn('text-text-primary break-words', mono && 'font-mono')}>{value}</dd>
    </div>
  )
}

function FieldRow({
  label, f, lang, t, bisaEdit, sedangEdit, mulai, ubah, batal, simpan, jenis = 'text',
}: {
  label: string
  f: FieldUsulan<string | null> | FieldUsulan
  lang: Lang
  t: Record<string, string>
  bisaEdit: boolean
  sedangEdit: string | null
  mulai: () => void
  ubah: (v: string) => void
  batal: () => void
  simpan: () => void
  jenis?: 'text' | 'date'
}) {
  const berbeda = f.extracted != null && f.extracted !== f.value
  return (
    <tr className="border-t border-border-muted/50 align-top">
      <th scope="row" className="py-1.5 pr-3 text-left font-normal text-text-secondary w-40">{label}</th>
      <td className="py-1.5 pr-2 min-w-0">
        {sedangEdit !== null ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type={jenis}
              aria-label={label}
              value={sedangEdit}
              onChange={(e) => ubah(e.target.value)}
              className="bg-surface border border-border-muted rounded px-2 py-1 text-sm text-text-primary"
            />
            <button type="button" onClick={simpan} className={btnGaris}>{t.save}</button>
            <button type="button" onClick={batal} className={btnGaris}>{t.cancel}</button>
          </div>
        ) : (
          <>
            <span className="text-text-primary break-words">{(f.value as string | null) ?? t.empty}</span>
            {berbeda && <span className="block text-[11px] text-text-secondary">{t.aiSaid}: {String(f.extracted)}</span>}
          </>
        )}
      </td>
      <td className="py-1.5 text-right">
        <span className="inline-flex flex-wrap items-center justify-end gap-2">
          <ProvenanceBadge f={f as FieldUsulan} lang={lang} />
          {bisaEdit && sedangEdit === null && (
            <button type="button" onClick={mulai} className={cn(btnCls, 'min-h-[28px] px-2 border border-border-muted text-text-secondary hover:text-text-primary')}>{t.edit}</button>
          )}
        </span>
      </td>
    </tr>
  )
}

function MatchPanel({
  t, lang, judul, h, names, bisaEdit, opsi, pilih, konfirmasi, buatBaru, kosongkan,
}: {
  t: Record<string, string>
  lang: Lang
  judul: string
  h: HasilCocok
  names: Record<string, string>
  bisaEdit: boolean
  opsi: Opsi[]
  pilih: (id: string | null, dibuat: boolean) => void
  konfirmasi: () => void
  buatBaru?: () => void
  kosongkan?: (nilai: boolean) => void
}) {
  const L = LABEL_COCOK[lang]
  const dipilihManusia = h.basis === 'SELECTED_BY_REVIEWER' || h.basis === 'CREATED_BY_REVIEWER'
  const perluKonfirmasi = h.status === 'MATCHED' && h.requiresConfirmation && !h.confirmed && !dipilihManusia
  return (
    <div className="mt-3 rounded bg-surface-tertiary/50 p-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={dtCls}>{judul}</span>
        {h.leftEmpty ? <span className="text-xs text-text-secondary">{L.LEFT_EMPTY}</span> : <MatchBadge status={h.status} lang={lang} />}
        {h.basis && !h.leftEmpty && <span className="text-xs text-text-secondary">{L[h.basis] ?? h.basis}</span>}
        {h.confirmed && !dipilihManusia && <span className="text-xs text-status-success">✓ {t.confirm}</span>}
      </div>
      {h.selectedId && !h.leftEmpty && (
        <p className="mt-1 text-text-primary">{t.selected}: <strong>{names[h.selectedId] ?? h.selectedId}</strong></p>
      )}
      {bisaEdit && perluKonfirmasi && (
        <button type="button" onClick={konfirmasi} className={cn(btnGaris, 'mt-2')}>{t.confirm}</button>
      )}
      {h.candidates.length > 0 && (
        <div className="mt-2">
          <p className={dtCls}>{t.candidates}</p>
          <ul className="mt-1 space-y-1">
            {h.candidates.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <span className="text-text-primary">{c.label}</span>
                <span className="text-[11px] text-text-secondary">{c.basis.split('+').map((b) => L[b] ?? b).join(' + ')}</span>
                {c.warning && <span className="text-[11px] text-accent-amber">({L[c.warning] ?? c.warning})</span>}
                {bisaEdit && h.selectedId !== c.id && !c.warning && (
                  <button type="button" onClick={() => pilih(c.id, false)} className={cn(btnCls, 'min-h-[28px] px-2 border border-border-muted text-text-secondary hover:text-text-primary')}>{t.choose}</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {bisaEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {opsi.length > 0 && !h.leftEmpty && (
            <select
              aria-label={t.pickFromMaster}
              value=""
              onChange={(e) => e.target.value && pilih(e.target.value, false)}
              className="max-w-full bg-surface border border-border-muted rounded px-2 py-1 text-xs text-text-primary"
            >
              <option value="">{t.pickFromMaster}</option>
              {opsi.map((o) => <option key={o.id} value={o.id}>{o.label ?? o.name}</option>)}
            </select>
          )}
          {buatBaru && !h.leftEmpty && <button type="button" onClick={buatBaru} className={btnGaris}><Plus className="w-3.5 h-3.5" aria-hidden="true" /> {t.createNew}</button>}
          {kosongkan && (
            <button type="button" onClick={() => kosongkan(!h.leftEmpty)} className={btnGaris}>{h.leftEmpty ? t.undoEmpty : t.leaveEmpty}</button>
          )}
          {dipilihManusia && !h.leftEmpty && <button type="button" onClick={() => pilih(null, false)} className={btnGaris}>{t.unselect}</button>}
        </div>
      )}
    </div>
  )
}

/**
 * D2 — master baru dibuat lewat endpoint master YANG ADA (POST /api/vessels,
 * /api/principals, /api/customers) dengan konfirmasi eksplisit. AI hanya prefill.
 */
function BuatMasterDialog({
  t, buat, prefill, tutup, selesai,
}: {
  t: Record<string, string>
  buat: Buat
  prefill: Record<string, string>
  tutup: () => void
  selesai: (id: string) => void
}) {
  const [form, setForm] = useState<FormState>(() => ({ ...emptyForm(), ...prefill, mmsiSource: '' }))
  const [yakin, setYakin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function simpan() {
    setBusy(true)
    setError('')
    try {
      const url = buat.kind === 'vessel' ? '/api/vessels' : buat.kind === 'principal' ? '/api/principals' : '/api/customers'
      const body =
        buat.kind === 'vessel'
          ? form
          : { name: form.name, email: form.email || null, phone: form.phone || null, address: form.address || null }
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) return setError(await bacaGalat(res, t.errAction))
      const j = await res.json()
      const baru = j.vessel ?? j.principal ?? j.customer
      if (!baru?.id) return setError(t.errAction)
      selesai(baru.id)
    } catch {
      setError(t.errAction)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="buat-master" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-card-border bg-card-bg p-4 sm:p-5">
        <h2 id="buat-master" className="font-display text-lg text-text-primary">{t.createTitle} — {t[buat.kind]}</h2>
        {error && <p role="alert" className="mt-2 rounded border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}
        <div className="mt-3">
          {buat.kind === 'vessel' ? (
            <>
              <VesselFieldsGrid form={form} set={set} />
              <p className="mt-2 text-xs text-text-secondary">{t.mmsiNote}</p>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(['name', 'email', 'phone', 'address'] as const).map((k) => (
                <label key={k} className={cn('block', k === 'address' && 'sm:col-span-2')}>
                  <span className={labelCls}>{t[{ name: 'cName', email: 'cEmail', phone: 'cPhone', address: 'cAddress' }[k]]}{k === 'name' && <span className="text-status-danger"> *</span>}</span>
                  <input value={form[k] ?? ''} onChange={(e) => set(k, e.target.value)} className={inputCls} />
                </label>
              ))}
            </div>
          )}
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm text-text-primary">
          <input type="checkbox" checked={yakin} onChange={(e) => setYakin(e.target.checked)} className="mt-1" />
          {t.createConfirm}
        </label>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={tutup} className={btnGaris}>{t.cancel}</button>
          <button type="button" disabled={!yakin || busy || !form.name?.trim()} onClick={() => void simpan()} className={cn(btnCls, 'bg-accent-blue text-white hover:bg-accent-blue/90')}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} {t.createSave}
          </button>
        </div>
      </div>
    </div>
  )
}
