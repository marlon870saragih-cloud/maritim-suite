'use client'

// Layar tinjauan Vessel Call Intake (PRD-004 Step 3 · dirapikan Step 4F).
//
// Prinsip tampilan: hasil baca AI, data master, dan keputusan peninjau SELALU
// dibedakan (lencana ikon + teks). Setiap keputusan adalah tindakan manusia yang
// eksplisit; server tetap menghitung ulang syarat & duplikat pada setiap tindakan.
// Step 4F: tata letak tanpa gulir samping (1024px+), galat tampil di dekat tombol,
// penjelasan kegagalan dalam bahasa operator, dan ringkasan WAJIB sebelum voyage dibuat.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Plus,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Ship,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, useT, type Lang } from '@/lib/i18n'
import type { IntakeDto } from '@/services/intake/intake.service'
import {
  basisTerkuat,
  formatJumlah,
  formatTanggal,
  inputVisual,
  kandidatBerisiko,
  kandidatLain,
  MAKS_CARGO_INTAKE,
  MIN_PANJANG_ALASAN,
  penjelasanKonflik,
  type FieldUsulan,
  type HasilCocok,
  type KandidatCocok,
  type KandidatDuplikat,
} from '@/services/intake/intake-policy'
import { VesselFieldsGrid, emptyForm, inputCls, labelCls, type FormState } from '@/components/settings/vessel-form'
import { VOYAGE_STATUS_COLOR, type VoyageStatusStr } from '@/components/voyage/voyage-status'
import { btnCls, fmtWaktu, tautanSentuhCls } from './shared'
import {
  DuplicateBadge,
  IntakeStatusBadge,
  LABEL_BASIS,
  LABEL_DUPLIKAT,
  LABEL_JENIS_INPUT,
  LABEL_KLASIFIKASI,
  LABEL_PERINGATAN,
  LABEL_SYARAT,
  MatchBadge,
  ProvenanceBadge,
  penjelasanGagal,
  pesanGalatServer,
} from './intake-shared'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    back: '← Daftar intake', loading: 'Memuat…', errLoad: 'Gagal memuat intake.', errAction: 'Tindakan gagal.', refresh: 'Muat ulang',
    requestType: 'Jenis permintaan', reasonForced: 'ditetapkan sistem',
    CLASSIFICATION_INVALID: 'jawaban AI tidak dikenali', MINIMUM_FIELDS_MISSING: 'identitas kapal atau pelabuhan/ETA tidak ditemukan', TOO_MANY_VESSELS: 'terlalu banyak kapal dalam satu permintaan',
    setClass: 'Ini sebenarnya', sourceTitle: 'Sumber permintaan', kind: 'Diterima sebagai', received: 'Diterima', uploader: 'Dikirim oleh', file: 'Nama berkas',
    original: 'Dokumen asli', originalKept: 'Disimpan sebagai lampiran rahasia', originalNot: 'Tidak disimpan', openOriginal: 'Buka dokumen asli',
    reviewer: 'Terakhir ditinjau',
    visualTitle: 'Isian ini dibaca AI dari PDF/gambar',
    visualKept: 'Buka dokumen asli dan cocokkan, lalu konfirmasi setiap kecocokan kapal, pelabuhan, dan pihak di bawah.',
    visualNotKept: 'Dokumen asli tidak disimpan di aplikasi. Karena itu setiap kecocokan kapal, pelabuhan, dan pihak di bawah wajib Anda konfirmasi sendiri — sistem tidak menganggapnya pasti.',
    vesselsTitle: 'Kapal', pairTitle: 'Tug + Tongkang', vessel: 'Kapal', tug: 'Tug', barge: 'Tongkang', primary: 'Kapal utama voyage',
    vesselsDropped: 'AI mendeteksi {n} kapal tambahan, tetapi identitasnya tidak dapat diverifikasi terhadap dokumen sumber. Periksa dokumen sebelum melanjutkan.',
    excluded: 'Dikeluarkan dari usulan', exclude: 'Keluarkan', include: 'Sertakan lagi', addVessel: 'Tambah kapal',
    fName: 'Nama', fImo: 'IMO', fMmsi: 'MMSI', fCallSign: 'Call sign', fType: 'Tipe', fRole: 'Peran',
    partiesTitle: 'Pihak & pelabuhan', principal: 'Principal', customer: 'Customer (pihak ditagih)', port: 'Pelabuhan',
    fieldsTitle: 'Jadwal & keterangan', eta: 'ETA', etb: 'ETB', etc: 'ETC', etd: 'ETD', agencyType: 'Jenis keagenan', jetty: 'Jetty',
    clientReference: 'Nomor rujukan pengirim', requestDate: 'Tanggal permintaan', portName: 'Nama di dokumen', portUnlocode: 'Kode pelabuhan di dokumen',
    principalName: 'Nama di dokumen', customerName: 'Nama di dokumen',
    edit: 'Ubah', save: 'Simpan', cancel: 'Batal', aiSaid: 'AI membaca', empty: '—',
    master: 'Data master', selected: 'Terpilih', otherCandidates: 'Kemungkinan lain', choose: 'Pilih', confirm: 'Ya, ini benar',
    pickFromMaster: '— cari di data master —', useSelected: 'Pakai pilihan ini', createNew: 'Buat data master baru',
    leaveEmpty: 'Biarkan kosong', undoEmpty: 'Batalkan "kosong"', unselect: 'Batalkan pilihan',
    riskyAsk: 'Kandidat ini berisiko. Yakin memilih', riskyYes: 'Ya, pilih', mmsiUnverified: 'MMSI belum terverifikasi', riskyUnverified: 'MMSI kapal ini belum terverifikasi di data master.',
    riskyPartial: 'Namanya hanya mirip, tidak sama.', riskyInactive: 'Data master ini nonaktif.', riskyConflict: 'Identitas di dokumen bertentangan.',
    portsLink: 'Kelola data master pelabuhan', noPortCreate: 'Pelabuhan tidak dibuat dari intake — tambahkan dulu di data master bila belum ada.',
    cargoTitle: 'Muatan', noCargo: 'Tidak ada muatan.', remove: 'Hapus', cargoEdit: 'Ubah', cargoAdd: 'Tambah muatan', cargoName: 'Nama muatan', cargoQty: 'Jumlah', cargoUnit: 'Satuan', cargoOp: 'Operasi', cargoOpNone: '— tidak ditentukan —', cargoSave: 'Simpan muatan', cargoCancel: 'Batal', cargoNameReq: 'Nama muatan wajib diisi.', cargoQtyBad: 'Jumlah harus angka 0 atau lebih.', cargoFull: 'Sudah mencapai batas 20 muatan.', contact: 'Narahubung di dokumen (hanya untuk mengisi data master baru)',
    dupTitle: 'Pemeriksaan duplikat', noDup: 'Tidak ditemukan voyage atau intake lain yang mirip.',
    dupBanner: 'Ada voyage yang mungkin sama dengan permintaan ini. Periksa bagian "Pemeriksaan duplikat" sebelum menyetujui.',
    thisIntake: 'Permintaan ini', existing: 'Voyage yang ada',
    linkThis: 'Tautkan ke voyage ini (tanpa voyage baru)', linkConfirm: 'Tautkan intake ke voyage ini? Tidak ada voyage baru yang dibuat, dan data voyage yang ada TIDAK diubah.',
    linkNote: 'Menautkan hanya mencatat bahwa permintaan ini milik voyage tersebut. ETA/data voyage lama tidak diubah — perbarui manual di halaman voyage bila perlu.',
    openIntake: 'Buka intake itu', decision: 'Keputusan Anda', continueNew: 'Ini kunjungan BERBEDA — lanjut sebagai voyage baru',
    checked: 'Saya sudah memeriksa voyage kandidat di atas.', reason: 'Alasan (wajib, minimal 10 karakter)', reasonOpt: 'Alasan (opsional)',
    cancelIntake: 'Bukan kunjungan baru? Gunakan tombol Tolak di bagian bawah.', basis: 'Alasan ditandai',
    portalTitle: 'Paparan portal klien', portalInfo: 'Customer ini belum punya akses portal — voyage tidak tampil di portal klien.',
    portalWarn: 'Customer ini punya {n} akses portal aktif. Begitu voyage dibuat — termasuk status PLANNED, kapal, pelabuhan, dan ETA — LANGSUNG terlihat oleh mereka.',
    portalAck: 'Saya paham voyage ini akan langsung terlihat di portal customer tersebut.', noCustomer: 'Tanpa customer — voyage tidak tampil di portal klien.',
    actionTitle: 'Keputusan akhir', condTitle: 'Yang masih perlu diselesaikan', condOk: 'Semua data sudah lengkap.',
    approve: 'Setujui & buat voyage…', reject: 'Tolak', rejectReason: 'Alasan penolakan', rejectConfirm: 'Tolak intake ini',
    retry: 'Coba buat lagi…', failedTitle: 'Voyage belum dibuat', techCode: 'Kode teknis',
    blockedTitle: 'Belum bisa disetujui:', goDup: 'Ke pemeriksaan duplikat', goPortal: 'Ke paparan portal',
    doneTitle: 'Voyage dibuat', openVoyage: 'Buka voyage', warnings: 'Perlu perhatian',
    startMonitor: 'Mulai pemantauan', monitorStarted: 'Pemantauan dimulai.', monitorNote: 'Pemantauan tidak dinyalakan otomatis.',
    linkedTitle: 'Ditautkan ke voyage yang sudah ada', rejectedTitle: 'Ditolak', createTitle: 'Buat data master baru',
    createConfirm: 'Saya sudah memeriksa data ini dan ingin membuat data master baru.', createSave: 'Buat & pakai',
    cName: 'Nama', cEmail: 'Email', cPhone: 'Telepon', cAddress: 'Alamat', mmsiNote: 'Sumber MMSI tidak diisi otomatis: pilih sendiri bila MMSI disimpan.',
    notesNote: 'Jetty, nomor rujukan, dan tanggal permintaan disimpan di catatan voyage.',
    notRelevantTitle: 'Ini bukan permintaan kunjungan kapal baru',
    notRelevantBody: 'Intake jenis ini tidak bisa dijadikan voyage. Tolak dengan alasan singkat. Bila ternyata ini nominasi, kirim ulang permintaannya.',
    showAiRead: 'Lihat hasil baca AI',
    confirmTitle: 'Periksa sebelum voyage dibuat', retryTitle: 'Coba buat voyage lagi', cVessel: 'Kapal', cPort: 'Pelabuhan', cSchedule: 'Jadwal',
    cPrincipal: 'Principal', cCustomer: 'Customer', cCargo: 'Muatan', cDup: 'Duplikat', cPortal: 'Portal klien', cStatus: 'Status voyage',
    leftEmpty: 'Dikosongkan', notInPortal: 'tidak tampil di portal', portalVisible: 'LANGSUNG terlihat di portal customer ({n} akses)',
    dupNew: 'Diputuskan sebagai kunjungan berbeda', planned: 'PLANNED — pemantauan tidak otomatis', back2: 'Kembali periksa', yesCreate: 'Ya, buat voyage',
  },
  en: {
    back: '← Intakes', loading: 'Loading…', errLoad: 'Failed to load intake.', errAction: 'Action failed.', refresh: 'Reload',
    requestType: 'Request type', reasonForced: 'set by system',
    CLASSIFICATION_INVALID: 'AI answer not recognised', MINIMUM_FIELDS_MISSING: 'vessel identity or port/ETA not found', TOO_MANY_VESSELS: 'too many vessels in one request',
    setClass: 'This is actually a', sourceTitle: 'Request source', kind: 'Received as', received: 'Received', uploader: 'Sent by', file: 'File name',
    original: 'Original document', originalKept: 'Kept as a confidential attachment', originalNot: 'Not kept', openOriginal: 'Open original document',
    reviewer: 'Last reviewed',
    visualTitle: 'These values were read by AI from a PDF/image',
    visualKept: 'Open the original document and compare, then confirm each vessel, port and party match below.',
    visualNotKept: 'The original document is not kept in the app. Therefore every vessel, port and party match below must be confirmed by you — the system does not treat them as certain.',
    vesselsTitle: 'Vessels', pairTitle: 'Tug + Barge', vessel: 'Vessel', tug: 'Tug', barge: 'Barge', primary: 'Voyage primary vessel',
    vesselsDropped: 'AI detected {n} more vessel(s), but their identity could not be verified against the source document. Check the document before continuing.',
    excluded: 'Excluded from proposal', exclude: 'Exclude', include: 'Include again', addVessel: 'Add vessel',
    fName: 'Name', fImo: 'IMO', fMmsi: 'MMSI', fCallSign: 'Call sign', fType: 'Type', fRole: 'Role',
    partiesTitle: 'Parties & port', principal: 'Principal', customer: 'Customer (billed party)', port: 'Port',
    fieldsTitle: 'Schedule & details', eta: 'ETA', etb: 'ETB', etc: 'ETC', etd: 'ETD', agencyType: 'Agency type', jetty: 'Jetty',
    clientReference: 'Sender reference', requestDate: 'Request date', portName: 'Name in document', portUnlocode: 'Port code in document',
    principalName: 'Name in document', customerName: 'Name in document',
    edit: 'Edit', save: 'Save', cancel: 'Cancel', aiSaid: 'AI read', empty: '—',
    master: 'Master data', selected: 'Selected', otherCandidates: 'Other possibilities', choose: 'Choose', confirm: 'Yes, this is right',
    pickFromMaster: '— search master data —', useSelected: 'Use this selection', createNew: 'Create new master record',
    leaveEmpty: 'Leave empty', undoEmpty: 'Undo "empty"', unselect: 'Clear selection',
    riskyAsk: 'This candidate is risky. Really choose', riskyYes: 'Yes, choose', mmsiUnverified: 'MMSI unverified', riskyUnverified: 'This vessel’s MMSI is not verified in master data.',
    riskyPartial: 'The name is only similar, not the same.', riskyInactive: 'This master record is inactive.', riskyConflict: 'The document identity is conflicting.',
    portsLink: 'Manage port master', noPortCreate: 'Ports are not created from an intake — add it to the port master first if missing.',
    cargoTitle: 'Cargo', noCargo: 'No cargo.', remove: 'Remove', cargoEdit: 'Edit', cargoAdd: 'Add cargo', cargoName: 'Cargo name', cargoQty: 'Quantity', cargoUnit: 'Unit', cargoOp: 'Operation', cargoOpNone: '— not specified —', cargoSave: 'Save cargo', cargoCancel: 'Cancel', cargoNameReq: 'Cargo name is required.', cargoQtyBad: 'Quantity must be a number 0 or greater.', cargoFull: 'The 20 cargo limit has been reached.', contact: 'Contact in document (only to prefill new master data)',
    dupTitle: 'Duplicate check', noDup: 'No similar voyage or intake found.',
    dupBanner: 'A voyage may already exist for this request. Check "Duplicate check" before approving.',
    thisIntake: 'This request', existing: 'Existing voyage',
    linkThis: 'Link to this voyage (no new voyage)', linkConfirm: 'Link this intake to this voyage? No new voyage is created and the existing voyage is NOT changed.',
    linkNote: 'Linking only records that this request belongs to that voyage. The existing ETA/data is not changed — update it manually on the voyage page if needed.',
    openIntake: 'Open that intake', decision: 'Your decision', continueNew: 'This is a DIFFERENT call — continue as a new voyage',
    checked: 'I checked the candidate voyages above.', reason: 'Reason (required, min. 10 characters)', reasonOpt: 'Reason (optional)',
    cancelIntake: 'Not a new call? Use Reject at the bottom.', basis: 'Flagged because',
    portalTitle: 'Client portal exposure', portalInfo: 'This customer has no portal access — the voyage will not appear in the client portal.',
    portalWarn: 'This customer has {n} active portal access(es). Once created, the voyage — including PLANNED status, vessel, port and ETA — is IMMEDIATELY visible to them.',
    portalAck: 'I understand this voyage will be immediately visible in that customer’s portal.', noCustomer: 'No customer — the voyage will not appear in the client portal.',
    actionTitle: 'Final decision', condTitle: 'Still to be done', condOk: 'All data is complete.',
    approve: 'Approve & create voyage…', reject: 'Reject', rejectReason: 'Rejection reason', rejectConfirm: 'Reject this intake',
    retry: 'Try creating again…', failedTitle: 'Voyage not created', techCode: 'Technical code',
    blockedTitle: 'Cannot approve yet:', goDup: 'Go to duplicate check', goPortal: 'Go to portal exposure',
    doneTitle: 'Voyage created', openVoyage: 'Open voyage', warnings: 'Needs attention',
    startMonitor: 'Start monitoring', monitorStarted: 'Monitoring started.', monitorNote: 'Monitoring is not started automatically.',
    linkedTitle: 'Linked to an existing voyage', rejectedTitle: 'Rejected', createTitle: 'Create new master record',
    createConfirm: 'I checked this data and want to create a new master record.', createSave: 'Create & use',
    cName: 'Name', cEmail: 'Email', cPhone: 'Phone', cAddress: 'Address', mmsiNote: 'MMSI source is not prefilled: choose it yourself if you keep the MMSI.',
    notesNote: 'Jetty, sender reference and request date are kept in the voyage notes.',
    notRelevantTitle: 'This is not a new vessel-call request',
    notRelevantBody: 'This kind of intake cannot become a voyage. Reject it with a short reason. If it is actually a nomination, submit the request again.',
    showAiRead: 'Show what the AI read',
    confirmTitle: 'Check before the voyage is created', retryTitle: 'Try creating the voyage again', cVessel: 'Vessel', cPort: 'Port', cSchedule: 'Schedule',
    cPrincipal: 'Principal', cCustomer: 'Customer', cCargo: 'Cargo', cDup: 'Duplicate', cPortal: 'Client portal', cStatus: 'Voyage status',
    leftEmpty: 'Left empty', notInPortal: 'not shown in portal', portalVisible: 'IMMEDIATELY visible in the customer portal ({n} access)',
    dupNew: 'Decided as a different call', planned: 'PLANNED — monitoring not automatic', back2: 'Go back and check', yesCreate: 'Yes, create voyage',
  },
}

const LABEL_ALASAN_DUP: Record<Lang, Record<string, string>> = {
  id: {
    SAME_PORT_ACTIVE_ETA_CLOSE: 'pelabuhan sama, voyage masih aktif, ETA berselisih ≤ 3 hari',
    SAME_PORT_ACTIVE_NO_ETA: 'pelabuhan sama, voyage aktif belum punya ETA',
    // Kode lama: masih dipakai baris duplikat yang TERSIMPAN sebelum pemecahan kode di
    // bawah, dan baris itu bisa saja beda pelabuhan — jadi teksnya tak boleh mengklaim apa pun
    // soal pelabuhan. Dua kode di bawahnya hanya muncul pada duplikat yang dihitung ulang.
    ETA_WITHIN_WINDOW: 'ETA berselisih ≤ 7 hari',
    ETA_WITHIN_WINDOW_OTHER_PORT: 'ETA berselisih ≤ 7 hari, tetapi PELABUHANNYA BERBEDA',
    ETA_WITHIN_WINDOW_PORT_UNKNOWN: 'ETA berselisih ≤ 7 hari, pelabuhan salah satunya belum diketahui',
    PORT_MISSING: 'pelabuhan salah satunya belum diketahui',
    ETA_MISSING: 'ETA salah satunya belum diketahui',
    RECENTLY_COMPLETED_SAME_PORT: 'baru selesai di pelabuhan yang sama',
    OTHER_ACTIVE_INTAKE: 'ada intake lain untuk kapal yang sama yang masih ditinjau',
  },
  en: {
    SAME_PORT_ACTIVE_ETA_CLOSE: 'same port, voyage still active, ETA within 3 days',
    SAME_PORT_ACTIVE_NO_ETA: 'same port, active voyage has no ETA',
    ETA_WITHIN_WINDOW: 'ETA within 7 days',
    ETA_WITHIN_WINDOW_OTHER_PORT: 'ETA within 7 days, but a DIFFERENT port',
    ETA_WITHIN_WINDOW_PORT_UNKNOWN: 'ETA within 7 days, port unknown on one side',
    PORT_MISSING: 'port unknown on one side',
    ETA_MISSING: 'ETA unknown on one side',
    RECENTLY_COMPLETED_SAME_PORT: 'recently completed at the same port',
    OTHER_ACTIVE_INTAKE: 'another intake for the same vessel is under review',
  },
}

type Opsi = { id: string; name: string; label?: string; mmsiUnverified?: boolean }
type FormCargo = { i: number | 'baru'; name: string; quantity: string; unit: string; operation: string }
type Entitas = 'vessel' | 'principal' | 'customer' | 'port'
type Buat = { kind: 'vessel'; index: number } | { kind: 'principal' } | { kind: 'customer' }
type LokasiGalat = 'atas' | 'aksi' | 'duplikat' | 'field'

const cardCls = 'bg-card-bg border border-card-border rounded-lg p-4 sm:p-5 min-w-0'
const btnGaris = cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary')
const btnKecil = cn(btnCls, 'min-h-[30px] px-2 border border-border-muted text-text-secondary hover:text-text-primary')
const dtCls = 'text-[10px] font-mono uppercase tracking-wider text-text-secondary'
const SYARAT_DUPLIKAT = ['DUPLICATE_DECISION_REQUIRED', 'DUPLICATE_REVIEW_CONFIRMATION_REQUIRED', 'DUPLICATE_REASON_REQUIRED']

/** Setara idTerpakai() server: dipilih/dibuat manusia, atau cocok otomatis & terkonfirmasi. */
function idDipakai(m: HasilCocok): string | null {
  if (m.leftEmpty || !m.selectedId) return null
  if (m.basis === 'SELECTED_BY_REVIEWER' || m.basis === 'CREATED_BY_REVIEWER') return m.selectedId
  if (m.status !== 'MATCHED' || (m.requiresConfirmation && !m.confirmed)) return null
  return m.selectedId
}

async function bacaGalat(res: Response, cadangan: string, lang: Lang): Promise<string> {
  const teks = await res.text().catch(() => '')
  try {
    const j = JSON.parse(teks)
    return pesanGalatServer(j?.error?.details, lang) ?? j?.error?.message ?? cadangan
  } catch {
    return teks && teks.length < 300 ? teks : cadangan
  }
}

function Galat({ pesan, id }: { pesan: string | string[]; id?: string }) {
  const daftar = Array.isArray(pesan) ? pesan : [pesan]
  return (
    <div id={id} role="alert" tabIndex={-1} className="rounded border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-sm text-status-danger focus:outline-none">
      {daftar.length === 1 ? daftar[0] : <ul className="list-disc pl-5 space-y-0.5">{daftar.map((x) => <li key={x}>{x}</li>)}</ul>}
    </div>
  )
}

export function IntakeReview({ id }: { id: string }) {
  const t = useT(STR)
  const { lang } = useLang()
  const [d, setD] = useState<IntakeDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [galat, setGalat] = useState<{ lokasi: LokasiGalat; pesan: string | string[] } | null>(null)
  const [notice, setNotice] = useState('')
  const [edit, setEdit] = useState<{ key: string; value: string } | null>(null)
  const [master, setMaster] = useState<Record<Entitas, Opsi[]>>({ vessel: [], principal: [], customer: [], port: [] })
  /** Formulir muatan: 'baru' saat menambah, indeks saat mengubah baris yang ada. */
  const [formCargo, setFormCargo] = useState<FormCargo | null>(null)
  const [galatCargo, setGalatCargo] = useState('')
  const [putusan, setPutusan] = useState<'' | 'CONTINUE_AS_NEW'>('')
  const [sudahCek, setSudahCek] = useState(false)
  const [alasan, setAlasan] = useState('')
  const [ackPortal, setAckPortal] = useState(false)
  const [tolak, setTolak] = useState<string | null>(null)
  const [buat, setBuat] = useState<Buat | null>(null)
  const [ringkasan, setRingkasan] = useState<'approve' | 'retry' | null>(null)
  const refAksi = useRef<HTMLDivElement>(null)
  const refDup = useRef<HTMLElement>(null)
  const refPortal = useRef<HTMLElement>(null)

  const bisaEdit = d?.status === 'NEEDS_REVIEW'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/automation/intakes/${id}`, { cache: 'no-store' })
      if (!res.ok) return setGalat({ lokasi: 'atas', pesan: await bacaGalat(res, t.errLoad, lang) })
      const body = await res.json()
      setD(body.intake)
    } catch {
      setGalat({ lokasi: 'atas', pesan: t.errLoad })
    } finally {
      setLoading(false)
    }
  }, [id, t.errLoad, lang])

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
      // Penanda MMSI belum terverifikasi dibawa sebagai data, bukan teks, agar
      // bisa diterjemahkan saat dirender (D2 — peninjau harus melihatnya di dropdown).
      ambil('/api/vessels', (x) => ({ id: String(x.id), name: String(x.name), mmsiUnverified: !!x.mmsi && !x.mmsiVerifiedAt, label: [x.name, x.imoNumber && `IMO ${x.imoNumber}`, x.mmsi && `MMSI ${x.mmsi}`, x.callSign && `CS ${x.callSign}`].filter(Boolean).join(' · ') })),
      ambil('/api/principals', (x) => ({ id: String(x.id), name: String(x.name) })),
      ambil('/api/customers', (x) => ({ id: String(x.id), name: String(x.name) })),
      ambil('/api/ports', (x) => ({ id: String(x.id), name: String(x.name), label: x.unlocode ? `${x.name} (${x.unlocode})` : String(x.name) })),
    ])
    setMaster({ vessel, principal, customer, port })
  }, [])

  useEffect(() => {
    if (bisaEdit) void muatMaster()
  }, [bisaEdit, muatMaster])

  /** Galat tampil di tempat tindakan dilakukan dan layar digulir ke sana. */
  function tampilkanGalat(lokasi: LokasiGalat, pesan: string | string[]) {
    setGalat({ lokasi, pesan })
    requestAnimationFrame(() => {
      const el = document.getElementById(`galat-${lokasi}`)
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el?.focus({ preventScroll: true })
    })
  }

  function pesanDariRespons(j: { error?: { message?: string; details?: Record<string, unknown> } } | null): string | string[] {
    const det = j?.error?.details
    const kondisi = det?.conditions as string[] | undefined
    if (kondisi?.length) return kondisi.map((k) => LABEL_SYARAT[lang][k] ?? k)
    if (det?.code === 'CREATE_FAILED') {
      const g = penjelasanGagal(det.errorCode as string, lang)
      return `${g.judul} ${g.langkah}`
    }
    return pesanGalatServer(det, lang) ?? j?.error?.message ?? t.errAction
  }

  async function kirim(url: string, method: string, body: Record<string, unknown>, lokasi: LokasiGalat = 'atas', sukses?: string): Promise<boolean> {
    if (!d) return false
    setBusy(true)
    setGalat(null)
    setNotice('')
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: d.version, ...body }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) {
        await load()
        tampilkanGalat(lokasi, pesanDariRespons(j))
        return false
      }
      if (j?.intake) setD(j.intake)
      if (sukses) setNotice(sukses)
      if (j?.intake && j.intake.status !== 'NEEDS_REVIEW' && j.intake.status !== 'FAILED') window.scrollTo({ top: 0, behavior: 'smooth' })
      return true
    } catch {
      tampilkanGalat(lokasi, t.errAction)
      return false
    } finally {
      setBusy(false)
    }
  }

  const patch = (body: Record<string, unknown>, lokasi: LokasiGalat = 'atas') => kirim(`/api/automation/intakes/${id}`, 'PATCH', body, lokasi)

  async function mulaiPantau() {
    if (!d?.voyageId) return
    setBusy(true)
    setGalat(null)
    try {
      const res = await fetch('/api/automation/monitored-voyages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voyageId: d.voyageId }),
      })
      if (!res.ok) tampilkanGalat('atas', await bacaGalat(res, t.errAction, lang))
      else setNotice(t.monitorStarted)
    } finally {
      setBusy(false)
    }
  }

  if (loading && !d) {
    return <p className="flex items-center gap-2 text-sm text-text-secondary"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t.loading}</p>
  }
  if (!d) {
    return (
      <div className="space-y-3">
        <Link href="/automation/intake" className={cn(tautanSentuhCls, 'text-sm text-accent-blue hover:underline')}>{t.back}</Link>
        <Galat pesan={galat?.pesan ?? t.errLoad} />
      </div>
    )
  }

  const p = d.proposal

  /**
   * Simpan satu baris muatan (tambah atau ubah). Server menerima larik utuh dan
   * mempertahankan jejak asal baris yang isinya tidak berubah, jadi kirim semuanya.
   */
  function simpanCargo() {
    if (!formCargo) return
    const name = formCargo.name.trim()
    if (!name) return setGalatCargo(t.cargoNameReq)
    const qTeks = formCargo.quantity.trim().replace(",", ".")
    const q = qTeks === "" ? null : Number(qTeks)
    if (q !== null && (!Number.isFinite(q) || q < 0)) return setGalatCargo(t.cargoQtyBad)
    const baris = { name, quantity: q, unit: formCargo.unit.trim() || null, operation: formCargo.operation || null }
    const daftar = formCargo.i === "baru" ? [...p.cargoes, baris] : p.cargoes.map((c, j) => (j === formCargo.i ? baris : c))
    setGalatCargo("")
    setFormCargo(null)
void patch({ cargoes: daftar })
  }

  /** Formulir satu baris muatan; dipakai untuk menambah maupun mengubah. */
  function formulirCargo() {
    if (!formCargo) return null
    const set = (k: 'name' | 'quantity' | 'unit' | 'operation', v: string) => setFormCargo({ ...formCargo, [k]: v })
    return (
      <div className="rounded border border-border-muted p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="min-w-0">
            <label className={labelCls} htmlFor="cargo-name">{t.cargoName}</label>
            <input id="cargo-name" value={formCargo.name} onChange={(e) => set('name', e.target.value)} maxLength={200} className={inputCls} />
          </div>
          <div className="min-w-0">
            <label className={labelCls} htmlFor="cargo-qty">{t.cargoQty}</label>
            <input id="cargo-qty" inputMode="decimal" value={formCargo.quantity} onChange={(e) => set('quantity', e.target.value)} className={inputCls} />
          </div>
          <div className="min-w-0">
            <label className={labelCls} htmlFor="cargo-unit">{t.cargoUnit}</label>
            <input id="cargo-unit" value={formCargo.unit} onChange={(e) => set('unit', e.target.value)} maxLength={20} className={inputCls} />
          </div>
          <div className="min-w-0">
            <label className={labelCls} htmlFor="cargo-op">{t.cargoOp}</label>
            <select id="cargo-op" value={formCargo.operation} onChange={(e) => set('operation', e.target.value)} className={inputCls}>
              <option value="">{t.cargoOpNone}</option>
              <option value="LOAD">LOAD</option>
              <option value="DISCHARGE">DISCHARGE</option>
            </select>
          </div>
        </div>
        {galatCargo && <p role="alert" className="mt-2 text-xs text-status-danger">{galatCargo}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={busy} className={cn(btnCls, 'min-h-[30px] px-2 bg-accent-blue text-white hover:bg-accent-blue/90')} onClick={simpanCargo}>{t.cargoSave}</button>
          <button type="button" disabled={busy} className={btnKecil} onClick={() => { setFormCargo(null); setGalatCargo('') }}>{t.cargoCancel}</button>
        </div>
      </div>
    )
  }

  const m = d.matches
  const rev = d.review
  const pelanggan = idDipakai(m.customer)
  const visual = inputVisual(d.inputKind)
  const hanyaTolak = bisaEdit && (d.classification === 'NOT_RELEVANT' || d.classification === 'UNSUPPORTED_REQUEST')
  const utama = rev?.primaryVesselIndex ?? d.proposal.vessels.findIndex((v) => !v.excluded)
  const adaPasangan = p.vessels.some((v) => v.role.value === 'TUG') && p.vessels.some((v) => v.role.value === 'BARGE')
  // Tug/kapal utama tampil lebih dulu; indeks asli tetap dipakai untuk PATCH.
  const urutanKapal = p.vessels.map((v, i) => ({ v, i })).sort((a, b) => (a.i === utama ? -1 : b.i === utama ? 1 : a.i - b.i))
  const namaPeran = (role: string | null) => (role === 'TUG' ? t.tug : role === 'BARGE' ? t.barge : t.vessel)

  /** Keputusan yang bisa dicek di layar sebelum membuka ringkasan (server tetap memeriksa ulang). */
  function keputusanKurang(): string[] {
    const kurang: string[] = []
    if (d!.duplicateLevel !== 'NO_DUPLICATE') {
      if (putusan !== 'CONTINUE_AS_NEW') kurang.push('DUPLICATE_DECISION_REQUIRED')
      else {
        if (!sudahCek) kurang.push('DUPLICATE_REVIEW_CONFIRMATION_REQUIRED')
        if (d!.duplicateLevel === 'LIKELY_DUPLICATE' && alasan.trim().length < MIN_PANJANG_ALASAN) kurang.push('DUPLICATE_REASON_REQUIRED')
      }
    }
    if (pelanggan && (rev?.portalActiveAccessCount ?? 0) > 0 && !ackPortal) kurang.push('PORTAL_ACK_REQUIRED')
    return kurang
  }

  function mintaSetujui() {
    const kurang = keputusanKurang()
    if (kurang.length) {
      tampilkanGalat('aksi', kurang.map((k) => LABEL_SYARAT[lang][k] ?? k))
      return
    }
    setGalat(null)
    setRingkasan('approve')
  }

  // C-5 — isian tetap terbuka bila server menolak, supaya galatnya bisa tampil di sebelahnya.
  const ubahField = async (key: string, value: string | null) => {
    if (await patch({ fields: { [key]: value === '' ? null : value } }, 'field')) setEdit(null)
  }

  const baris = (key: string, label: string, f: FieldUsulan, jenis: 'text' | 'date' = 'text', bisa = true) => (
    <FieldRow
      key={key}
      label={label}
      f={f}
      lang={lang}
      t={t}
      bisaEdit={!!bisaEdit && !busy && bisa}
      sedangEdit={edit?.key === key ? edit.value : null}
      mulai={() => { setGalat(null); setEdit({ key, value: f.value ?? '' }) }}
      ubah={(v) => setEdit({ key, value: v })}
      batal={() => { setGalat(null); setEdit(null) }}
      simpan={() => void ubahField(key, edit?.value ?? '')}
      jenis={jenis}
      visual={visual}
      galat={galat?.lokasi === 'field' && edit?.key === key ? galat.pesan : undefined}
    />
  )

  // Syarat server + keputusan yang belum diambil di layar — "lengkap" hanya bila keduanya kosong.
  const syaratServer: string[] = rev?.conditions ?? []
  const daftarSyarat = [...syaratServer, ...(bisaEdit ? keputusanKurang().filter((k) => !syaratServer.includes(k)) : [])]
  const galatDi = (lokasi: LokasiGalat) => (galat?.lokasi === lokasi ? <Galat id={`galat-${lokasi}`} pesan={galat.pesan} /> : null)
  const gagal = d.status === 'FAILED' ? penjelasanGagal(d.errorCode, lang) : null

  const bagianTinjauan = (
    <>
      {/* Isian dari PDF/gambar */}
      {visual && (bisaEdit || d.status === 'FAILED') && (
        <section className="rounded-lg border border-accent-amber/40 bg-accent-amber/10 p-4 text-sm" aria-labelledby="in-visual">
          <h2 id="in-visual" className="flex items-center gap-2 font-medium text-text-primary"><FileText className="w-4 h-4" aria-hidden="true" /> {t.visualTitle}</h2>
          <p className="mt-1 text-text-secondary">{d.attachmentId ? t.visualKept : t.visualNotKept}</p>
          {d.attachmentId && (
            <a href={`/api/attachments/${d.attachmentId}/content`} target="_blank" rel="noreferrer" className={cn(btnGaris, 'mt-2')}>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> {t.openOriginal}
            </a>
          )}
        </section>
      )}

      {/* Kapal */}
      <section className={cardCls} aria-labelledby="in-vessels">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="in-vessels" className="flex items-center gap-2 font-display text-lg text-text-primary">
            <Ship className="w-4 h-4" aria-hidden="true" /> {adaPasangan ? t.pairTitle : t.vesselsTitle}
          </h2>
          {bisaEdit && (
            <button type="button" disabled={busy} onClick={() => void patch({ addVessel: true })} className={btnGaris}>
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {t.addVessel}
            </button>
          )}
        </div>
        {/* E5 Step 2 — kapal usulan AI yang dibuang validator: hanya hitungan, nilainya tak pernah ditampilkan. */}
        {(p.vesselsDropped ?? 0) > 0 && (
          <p role="note" className="mt-3 flex items-start gap-2 rounded border border-accent-amber/40 bg-accent-amber/10 px-3 py-2 text-sm text-text-primary">
            <AlertTriangle className="mt-0.5 w-4 h-4 flex-shrink-0" aria-hidden="true" /> {t.vesselsDropped.replace('{n}', String(p.vesselsDropped))}
          </p>
        )}
        <div className="mt-3 space-y-4">
          {urutanKapal.map(({ v, i }) => (
            <div key={i} className={cn('rounded border border-border-muted p-3 min-w-0', v.excluded && 'opacity-60')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-text-primary">
                  {namaPeran(v.role.value)}
                  {i === utama && !v.excluded && <span className="ml-2 rounded border border-accent-blue/40 px-1.5 py-0.5 text-[10px] text-accent-blue">{t.primary}</span>}
                  {v.excluded && <span className="ml-2 text-xs text-text-secondary">{t.excluded}</span>}
                </p>
                {bisaEdit && (
                  <button type="button" disabled={busy} className={btnKecil} onClick={() => void patch({ vessels: [{ index: i, excluded: !v.excluded }] })}>
                    {v.excluded ? t.include : t.exclude}
                  </button>
                )}
              </div>
              <div className="mt-2 divide-y divide-border-muted/50">
                {(['name', 'imo', 'mmsi', 'callSign', 'vesselType'] as const).map((k) => (
                  <FieldRow
                    key={k}
                    label={t[{ name: 'fName', imo: 'fImo', mmsi: 'fMmsi', callSign: 'fCallSign', vesselType: 'fType' }[k]]}
                    f={v[k]}
                    lang={lang}
                    t={t}
                    bisaEdit={!!bisaEdit && !busy && !v.excluded}
                    sedangEdit={edit?.key === `v${i}.${k}` ? edit.value : null}
                    mulai={() => { setGalat(null); setEdit({ key: `v${i}.${k}`, value: v[k].value ?? '' }) }}
                    ubah={(x) => setEdit({ key: `v${i}.${k}`, value: x })}
                    batal={() => { setGalat(null); setEdit(null) }}
                    visual={visual}
                    galat={galat?.lokasi === 'field' && edit?.key === `v${i}.${k}` ? galat.pesan : undefined}
                    simpan={() => {
                      const nilai = edit?.value ?? ''
                      void (async () => {
                        if (await patch({ vessels: [{ index: i, [k]: nilai === '' ? null : nilai }] }, 'field')) setEdit(null)
                      })()
                    }}
                  />
                ))}
                <div className="grid grid-cols-1 gap-1 py-1.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
                  <span className="text-sm text-text-secondary">{t.fRole}</span>
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    {bisaEdit && !v.excluded ? (
                      <select
                        aria-label={t.fRole}
                        value={v.role.value ?? ''}
                        disabled={busy}
                        onChange={(e) => void patch({ vessels: [{ index: i, role: e.target.value || null }] })}
                        className="bg-surface border border-border-muted rounded px-2 py-1 text-sm text-text-primary"
                      >
                        <option value="">—</option>
                        <option value="TUG">{t.tug}</option>
                        <option value="BARGE">{t.barge}</option>
                      </select>
                    ) : (
                      <span className="text-sm text-text-primary">{v.role.value ? namaPeran(v.role.value) : t.empty}</span>
                    )}
                    <ProvenanceBadge f={v.role} lang={lang} visual={visual} />
                  </div>
                </div>
              </div>
              {!v.excluded && m.vessels[i] && (
                <MatchPanel
                  t={t}
                  lang={lang}
                  h={m.vessels[i]}
                  names={d.names}
                  bisaEdit={!!bisaEdit && !busy}
                  opsi={master.vessel}
                  konflik={penjelasanKonflik(m.vessels[i], { imo: v.imo.value, mmsi: v.mmsi.value }, lang)}
                  pilih={(idx, dibuat) => void patch({ select: { entity: 'vessel', index: i, id: idx, created: dibuat } })}
                  konfirmasi={() => void patch({ confirm: { entity: 'vessel', index: i } })}
                  buatBaru={() => setBuat({ kind: 'vessel', index: i })}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Pihak & pelabuhan — 1 kolom < 1280px, 2 kolom ≥ 1280px, 3 kolom ≥ 1536px */}
      <section className={cardCls} aria-labelledby="in-parties">
        <h2 id="in-parties" className="font-display text-lg text-text-primary">{t.partiesTitle}</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {(['port', 'principal', 'customer'] as const).map((e) => (
            <div key={e} className="rounded border border-border-muted p-3 min-w-0">
              <p className="text-sm font-medium text-text-primary">{t[e]}</p>
              <div className="mt-2 divide-y divide-border-muted/50">
                {e === 'principal' && baris('principalName', t.principalName, p.principalName)}
                {e === 'customer' && baris('customerName', t.customerName, p.customerName)}
                {e === 'port' && baris('portName', t.portName, p.portName)}
                {e === 'port' && baris('portUnlocode', t.portUnlocode, p.portUnlocode)}
              </div>
              <MatchPanel
                t={t}
                lang={lang}
                h={m[e]}
                names={d.names}
                bisaEdit={!!bisaEdit && !busy}
                opsi={master[e]}
                konflik={m[e].status === 'CONFLICT' ? (lang === 'id' ? 'Kode dan nama pelabuhan di dokumen menunjuk pelabuhan yang berbeda.' : 'The port code and name in the document point to different ports.') : null}
                pilih={(idx, dibuat) => void patch({ select: { entity: e, id: idx, created: dibuat } })}
                konfirmasi={() => void patch({ confirm: { entity: e } })}
                buatBaru={e === 'port' ? undefined : () => setBuat({ kind: e })}
                kosongkan={e === 'port' ? undefined : (nilai) => void patch({ leaveEmpty: { entity: e, value: nilai } })}
              />
              {e === 'port' && bisaEdit && (
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
        <div className="mt-3 divide-y divide-border-muted/50">
          {baris('eta', t.eta, p.eta, 'date')}
          {baris('etb', t.etb, p.etb, 'date')}
          {baris('etc', t.etc, p.etc, 'date')}
          {baris('etd', t.etd, p.etd, 'date')}
          {baris('agencyType', t.agencyType, p.agencyType)}
          {baris('jetty', t.jetty, p.jetty)}
          {baris('clientReference', t.clientReference, p.clientReference)}
          {baris('requestDate', t.requestDate, p.requestDate, 'date', false)}
        </div>
        <p className="mt-2 text-xs text-text-secondary">{t.notesNote}</p>
        {p.contact && (
          <p className="mt-2 text-xs text-text-secondary break-words">
            {t.contact}: {[p.contact.name, p.contact.email, p.contact.phone].filter(Boolean).join(' · ')}
          </p>
        )}
      </section>

      {/* Muatan */}
      <section className={cardCls} aria-labelledby="in-cargo">
        <h2 id="in-cargo" className="font-display text-lg text-text-primary">{t.cargoTitle}</h2>
        {p.cargoes.length === 0 && formCargo?.i !== 'baru' ? (
          <p className="mt-2 text-sm text-text-secondary">{t.noCargo}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {p.cargoes.map((c, i) =>
              formCargo?.i === i ? (
                <li key={i}>{formulirCargo()}</li>
              ) : (
                <li key={i} className="flex flex-wrap items-center gap-2 text-text-primary">
                  <span className="break-words">{c.name}{c.quantity != null ? ` · ${formatJumlah(c.quantity, lang)} ${c.unit ?? ''}` : ''}{c.operation ? ` · ${c.operation}` : ''}</span>
                  <ProvenanceBadge f={{ value: c.name, source: c.source, flags: [], extracted: null, confirmed: false }} lang={lang} visual={visual} />
                  {bisaEdit && !formCargo && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        className={btnKecil}
                        onClick={() => { setGalatCargo(''); setFormCargo({ i, name: c.name, quantity: c.quantity == null ? '' : String(c.quantity), unit: c.unit ?? '', operation: c.operation ?? '' }) }}
                      >
                        {t.cargoEdit}
                      </button>
                      <button type="button" disabled={busy} className={btnKecil} onClick={() => void patch({ cargoes: p.cargoes.filter((_, j) => j !== i) })}>{t.remove}</button>
                    </>
                  )}
                </li>
              ),
            )}
            {formCargo?.i === 'baru' && <li>{formulirCargo()}</li>}
          </ul>
        )}
        {bisaEdit && !formCargo && (
          p.cargoes.length >= MAKS_CARGO_INTAKE ? (
            <p className="mt-2 text-xs text-text-secondary">{t.cargoFull}</p>
          ) : (
            <button
              type="button"
              disabled={busy}
              className={cn(btnKecil, 'mt-2')}
              onClick={() => { setGalatCargo(''); setFormCargo({ i: 'baru', name: '', quantity: '', unit: '', operation: '' }) }}
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {t.cargoAdd}
            </button>
          )
        )}
      </section>

      {/* Duplikat */}
      <section ref={refDup} className={cardCls} aria-labelledby="in-dup">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="in-dup" className="font-display text-lg text-text-primary">{t.dupTitle}</h2>
          <DuplicateBadge level={d.duplicateLevel} lang={lang} />
        </div>
        {galat?.lokasi === 'duplikat' && <div className="mt-2">{galatDi('duplikat')}</div>}
        {d.duplicateCandidates.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">{t.noDup}</p>
        ) : (
          <>
            <p className="mt-2 text-xs text-text-secondary">
              {t.thisIntake}: {[m.port.selectedId ? d.names[m.port.selectedId] : p.portName.value, p.eta.value && `ETA ${formatTanggal(p.eta.value, lang)}`].filter(Boolean).join(' · ') || t.empty}
            </p>
            <ul className="mt-2 space-y-2">
              {d.duplicateCandidates.map((c: KandidatDuplikat) => (
                <li key={`${c.type}-${c.id}`} className="rounded border border-border-muted p-3 text-sm min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <DuplicateBadge level={c.level} lang={lang} />
                    {c.type === 'VOYAGE' ? (
                      <Link href={`/voyages/${c.id}`} className={cn(tautanSentuhCls, 'font-medium text-accent-blue hover:underline break-all')}>{c.label}</Link>
                    ) : (
                      <Link href={`/automation/intake/${c.id}`} className={cn(tautanSentuhCls, 'font-medium text-accent-blue hover:underline')}>{t.openIntake}</Link>
                    )}
                  </div>
                  {/* C-3 — status voyage tak lagi diselipkan sebagai token telanjang di
                      tengah kalimat; jadi lencana berlabel dengan warna status bersama. */}
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-text-primary break-words">
                    <span>{t.existing}: {[c.vesselName, c.portName, c.eta && `ETA ${formatTanggal(c.eta, lang)}`].filter(Boolean).join(' · ') || t.empty}</span>
                    {c.status !== 'OPEN_INTAKE' && (
                      <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]', VOYAGE_STATUS_COLOR[c.status as VoyageStatusStr] ?? 'border-border-muted text-text-secondary')}>
                        {t.cStatus}: {c.status}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">{t.basis}: {LABEL_ALASAN_DUP[lang][c.reason] ?? c.reason}</p>
                  {bisaEdit && c.type === 'VOYAGE' && (
                    <button
                      type="button"
                      disabled={busy}
                      className={cn(btnGaris, 'mt-2')}
                      onClick={() => {
                        if (window.confirm(t.linkConfirm)) void kirim(`/api/automation/intakes/${id}/link`, 'POST', { voyageId: c.id, reason: alasan || null }, 'duplikat')
                      }}
                    >
                      <Link2 className="w-3.5 h-3.5" aria-hidden="true" /> {t.linkThis}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {bisaEdit && <p className="mt-2 text-xs text-text-secondary">{t.linkNote}</p>}
          </>
        )}
        {bisaEdit && d.duplicateLevel !== 'NO_DUPLICATE' && (
          <fieldset className="mt-4 rounded border border-border-muted p-3">
            <legend className="px-1 text-xs text-text-secondary">{t.decision}</legend>
            <label className="flex items-start gap-2 text-sm text-text-primary">
              <input type="checkbox" checked={putusan === 'CONTINUE_AS_NEW'} onChange={(e) => setPutusan(e.target.checked ? 'CONTINUE_AS_NEW' : '')} className="mt-1" />
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
        <section ref={refPortal} className={cardCls} aria-labelledby="in-portal">
          <h2 id="in-portal" className="font-display text-lg text-text-primary">{t.portalTitle}</h2>
          {!pelanggan ? (
            <p className="mt-2 text-sm text-text-secondary">{t.noCustomer}</p>
          ) : rev && rev.portalActiveAccessCount > 0 ? (
            <div className="mt-2 rounded border border-status-danger/40 bg-status-danger/10 p-3 text-sm text-text-primary">
              <p className="flex items-start gap-2"><AlertOctagon className="mt-0.5 w-4 h-4 flex-shrink-0 text-status-danger" aria-hidden="true" /> {t.portalWarn.replace('{n}', String(rev.portalActiveAccessCount))}</p>
              {bisaEdit && (
                <label className="mt-2 flex items-start gap-2 font-medium">
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
    </>
  )

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/automation/intake" className={cn(tautanSentuhCls, 'text-sm text-accent-blue hover:underline')}>{t.back}</Link>
        <button type="button" onClick={() => void load()} disabled={loading || busy} className={btnGaris}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} aria-hidden="true" /> {t.refresh}
        </button>
      </div>

      {galatDi('atas')}
      {notice && <p role="status" className="rounded border border-status-success/30 bg-status-success/10 px-3 py-2 text-sm text-text-primary">{notice}</p>}

      {/* Ringkasan status */}
      <section className={cardCls} aria-label={t.requestType}>
        <div className="flex flex-wrap items-center gap-2" title={`v${d.version}`}>
          <IntakeStatusBadge status={d.status} lang={lang} />
          {d.duplicateLevel !== 'NO_DUPLICATE' && <DuplicateBadge level={d.duplicateLevel} lang={lang} />}
        </div>
        <p className="mt-2 text-sm text-text-primary">
          {t.requestType}: <strong>{LABEL_KLASIFIKASI[lang][d.classification] ?? d.classification}</strong>
          {p.classificationReason && <span className="text-text-secondary"> ({t.reasonForced}: {t[p.classificationReason] ?? p.classificationReason})</span>}
        </p>
        {bisaEdit && d.classification === 'INSUFFICIENT_INFORMATION' && (
          <div className="mt-2 flex flex-wrap gap-2">
            {(['NEW_NOMINATION', 'NEW_APPOINTMENT'] as const).map((c) => (
              <button key={c} type="button" disabled={busy} className={btnGaris} onClick={() => void patch({ classification: c })}>
                {t.setClass} {LABEL_KLASIFIKASI[lang][c].toLowerCase()}
              </button>
            ))}
          </div>
        )}
        {bisaEdit && d.duplicateLevel !== 'NO_DUPLICATE' && !hanyaTolak && (
          <button type="button" onClick={() => refDup.current?.scrollIntoView({ behavior: 'smooth' })} className={cn('mt-3 flex w-full items-start gap-2 rounded border px-3 py-2 text-left text-sm', d.duplicateLevel === 'LIKELY_DUPLICATE' ? 'border-status-danger/40 bg-status-danger/10 text-status-danger' : 'border-accent-amber/40 bg-accent-amber/10 text-text-primary')}>
            <AlertTriangle className="mt-0.5 w-4 h-4 flex-shrink-0" aria-hidden="true" /> {LABEL_DUPLIKAT[lang][d.duplicateLevel]}: {t.dupBanner}
          </button>
        )}

        {d.status === 'COMPLETED' && (
          <div className="mt-3 rounded border border-status-success/30 bg-status-success/10 px-3 py-2 text-sm">
            <p className="flex items-center gap-2 text-text-primary"><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> {t.doneTitle}: <strong>{d.voyageNumber}</strong></p>
            <div className="mt-2 flex flex-wrap gap-2">
              {d.voyageId && <Link href={`/voyages/${d.voyageId}`} className={btnGaris}>{t.openVoyage}</Link>}
              <button type="button" disabled={busy} onClick={() => void mulaiPantau()} className={btnGaris}>
                <RadioTower className="w-3.5 h-3.5" aria-hidden="true" /> {t.startMonitor}
              </button>
            </div>
            <p className="mt-1 text-xs text-text-secondary">{t.monitorNote}</p>
            {d.postCreateWarnings.filter((w) => w !== 'RECONCILED').length > 0 && (
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
            <p className="mt-1 text-xs text-text-secondary">{t.linkNote}</p>
            {d.voyageId && <Link href={`/voyages/${d.voyageId}`} className={cn(btnGaris, 'mt-2')}>{t.openVoyage}</Link>}
          </div>
        )}
        {d.status === 'REJECTED' && (
          <p className="mt-3 rounded border border-border-muted bg-surface-tertiary px-3 py-2 text-sm text-text-primary break-words">
            <XCircle className="inline w-4 h-4 mr-1" aria-hidden="true" /> {t.rejectedTitle}: {d.decisionReason}
          </p>
        )}
        {gagal && (
          <div className="mt-3 rounded border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-sm text-text-primary">
            <p className="flex items-start gap-2 font-medium"><AlertOctagon className="mt-0.5 w-4 h-4 flex-shrink-0 text-status-danger" aria-hidden="true" /> {t.failedTitle}: {gagal.judul}</p>
            <p className="mt-1">{gagal.langkah}</p>
            <p className="mt-1 text-[11px] text-text-secondary">{t.techCode}: {d.errorCode}</p>
          </div>
        )}
      </section>

      {/* Sumber */}
      <section className={cardCls} aria-labelledby="in-src">
        <h2 id="in-src" className="font-display text-lg text-text-primary">{t.sourceTitle}</h2>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 text-sm">
          <Info label={t.kind} value={LABEL_JENIS_INPUT[lang][d.inputKind] ?? d.inputKind} />
          <Info label={t.received} value={fmtWaktu(String(d.createdAt), lang)} />
          <Info label={t.uploader} value={d.names[d.submittedByUserId] ?? '—'} />
          {d.sourceFileName && <Info label={t.file} value={d.sourceFileName} />}
          <div className="min-w-0">
            <dt className={dtCls}>{t.original}</dt>
            <dd className="text-text-primary">
              {d.attachmentId ? (
                <span className="flex flex-wrap items-center gap-2">
                  {t.originalKept}
                  <a href={`/api/attachments/${d.attachmentId}/content`} target="_blank" rel="noreferrer" className={cn(tautanSentuhCls, 'text-accent-blue hover:underline')}>
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> {t.openOriginal}
                  </a>
                </span>
              ) : t.originalNot}
            </dd>
          </div>
          {d.reviewedByUserId && <Info label={t.reviewer} value={`${d.names[d.reviewedByUserId] ?? '—'} · ${fmtWaktu(d.reviewedAt ? String(d.reviewedAt) : null, lang)}`} />}
        </dl>
      </section>

      {hanyaTolak ? (
        <>
          <section className="rounded-lg border border-accent-amber/40 bg-accent-amber/10 p-4 text-sm" aria-labelledby="in-norel">
            <h2 id="in-norel" className="font-medium text-text-primary">{t.notRelevantTitle}</h2>
            <p className="mt-1 text-text-secondary">{t.notRelevantBody}</p>
            <div ref={refAksi} className="mt-3 space-y-2">
              {galatDi('aksi')}
              <label className="block">
                <span className={labelCls}>{t.rejectReason}</span>
                <textarea value={tolak ?? ''} onChange={(e) => setTolak(e.target.value)} rows={2} maxLength={1000} className={inputCls} />
              </label>
              <button
                type="button"
                disabled={busy || (tolak ?? '').trim().length < 3}
                onClick={() => void kirim(`/api/automation/intakes/${id}/reject`, 'POST', { reason: tolak }, 'aksi').then((ok) => ok && setTolak(null))}
                className={cn(btnCls, 'bg-status-danger/80 text-white hover:bg-status-danger')}
              >
                <XCircle className="w-3.5 h-3.5" aria-hidden="true" /> {t.rejectConfirm}
              </button>
            </div>
          </section>
          <details className={cardCls}>
            <summary className="cursor-pointer text-sm text-text-secondary">{t.showAiRead}</summary>
            <div className="mt-4 space-y-6">{bagianTinjauan}</div>
          </details>
        </>
      ) : (
        <>
          {bagianTinjauan}

          {/* Keputusan akhir — galat selalu tampil DI SINI, di dekat tombol */}
          {(bisaEdit || d.status === 'FAILED') && rev && (
            <section className={cardCls} aria-labelledby="in-cond">
              <h2 id="in-cond" className="font-display text-lg text-text-primary">{t.actionTitle}</h2>
              {daftarSyarat.length === 0 ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-status-success"><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> {t.condOk}</p>
              ) : (
                <div className="mt-2">
                  <p className={dtCls}>{t.condTitle}</p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-text-primary">
                    {daftarSyarat.map((c) => <li key={c}>{LABEL_SYARAT[lang][c] ?? c}</li>)}
                  </ul>
                </div>
              )}
              <div ref={refAksi} className="mt-4 space-y-3">
                {galat?.lokasi === 'aksi' && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-status-danger">{t.blockedTitle}</p>
                    {galatDi('aksi')}
                    <div className="flex flex-wrap gap-2">
                      {Array.isArray(galat.pesan) && galat.pesan.some((x) => SYARAT_DUPLIKAT.some((k) => x === LABEL_SYARAT[lang][k])) && (
                        <button type="button" className={btnKecil} onClick={() => refDup.current?.scrollIntoView({ behavior: 'smooth' })}>{t.goDup}</button>
                      )}
                      {Array.isArray(galat.pesan) && galat.pesan.includes(LABEL_SYARAT[lang].PORTAL_ACK_REQUIRED) && (
                        <button type="button" className={btnKecil} onClick={() => refPortal.current?.scrollIntoView({ behavior: 'smooth' })}>{t.goPortal}</button>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {bisaEdit && (
                    <button
                      type="button"
                      disabled={busy || rev.conditions.length > 0}
                      onClick={mintaSetujui}
                      className={cn(btnCls, 'bg-accent-blue text-white hover:bg-accent-blue/90')}
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />}
                      {t.approve}
                    </button>
                  )}
                  {d.status === 'FAILED' && (
                    <button type="button" disabled={busy || rev.conditions.length > 0} onClick={() => { setGalat(null); setRingkasan('retry') }} className={cn(btnCls, 'bg-accent-blue text-white hover:bg-accent-blue/90')}>
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> {t.retry}
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={() => setTolak(tolak === null ? '' : null)} className={cn(btnCls, 'border border-status-danger/40 text-status-danger')}>
                    <XCircle className="w-3.5 h-3.5" aria-hidden="true" /> {t.reject}
                  </button>
                </div>
                {tolak !== null && (
                  <div className="space-y-2">
                    <label className="block">
                      <span className={labelCls}>{t.rejectReason}</span>
                      <textarea value={tolak} onChange={(e) => setTolak(e.target.value)} rows={2} maxLength={1000} className={inputCls} />
                    </label>
                    <button
                      type="button"
                      disabled={busy || tolak.trim().length < 3}
                      onClick={() => void kirim(`/api/automation/intakes/${id}/reject`, 'POST', { reason: tolak }, 'aksi').then((ok) => ok && setTolak(null))}
                      className={cn(btnCls, 'border border-status-danger/40 text-status-danger')}
                    >
                      {t.rejectConfirm}
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {ringkasan && (
        <RingkasanDialog
          t={t}
          lang={lang}
          d={d}
          mode={ringkasan}
          keputusan={{ putusan, alasan }}
          busy={busy}
          tutup={() => setRingkasan(null)}
          lanjut={() => {
            const url = ringkasan === 'approve' ? `/api/automation/intakes/${id}/approve` : `/api/automation/intakes/${id}/retry`
            const body =
              ringkasan === 'approve'
                ? {
                    duplicateDecision: d.duplicateLevel === 'NO_DUPLICATE' ? null : putusan || null,
                    duplicateConfirmed: sudahCek,
                    decisionReason: alasan || null,
                    portalExposureAck: ackPortal,
                  }
                : {}
            setRingkasan(null)
            void kirim(url, 'POST', body, 'aksi')
          }}
        />
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className={dtCls}>{label}</dt>
      <dd className="text-text-primary break-words">{value}</dd>
    </div>
  )
}

/** Satu baris isian: label | nilai (+ bacaan AI) | lencana & tombol — menumpuk rapi di layar sempit. */
function FieldRow({
  label, f, lang, t, bisaEdit, sedangEdit, mulai, ubah, batal, simpan, jenis = 'text', visual = false, galat,
}: {
  label: string
  f: FieldUsulan<string | null> | FieldUsulan
  lang: Lang
  t: Record<string, string>
  bisaEdit: boolean
  visual?: boolean
  galat?: string | string[]
  sedangEdit: string | null
  mulai: () => void
  ubah: (v: string) => void
  batal: () => void
  simpan: () => void
  jenis?: 'text' | 'date'
}) {
  const tampil = (v: unknown) => (v == null ? t.empty : jenis === 'date' ? formatTanggal(String(v), lang) : String(v))
  const berbeda = f.extracted != null && f.extracted !== f.value
  return (
    <div className="grid grid-cols-1 gap-1 py-1.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
      <span className="text-sm text-text-secondary">{label}</span>
      <div className="min-w-0">
        {sedangEdit !== null ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type={jenis}
                aria-label={label}
                value={sedangEdit}
                onChange={(e) => ubah(e.target.value)}
                className="min-w-0 max-w-full bg-surface border border-border-muted rounded px-2 py-1 text-sm text-text-primary"
              />
              <button type="button" onClick={simpan} className={btnKecil}>{t.save}</button>
              <button type="button" onClick={batal} className={btnKecil}>{t.cancel}</button>
            </div>
            {/* C-5 — penolakan isian ini tampil di sebelah isiannya, bukan di puncak layar. */}
            {galat && <div className="mt-1"><Galat id="galat-field" pesan={galat} /></div>}
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm text-text-primary [overflow-wrap:anywhere]">{tampil(f.value)}</span>
            <ProvenanceBadge f={f as FieldUsulan} lang={lang} visual={visual} />
            {bisaEdit && (
              <button type="button" onClick={mulai} className={cn(btnCls, 'min-h-[26px] px-2 border border-border-muted text-text-secondary hover:text-text-primary')}>{t.edit}</button>
            )}
          </div>
        )}
        {berbeda && sedangEdit === null && <span className="block text-[11px] text-text-secondary [overflow-wrap:anywhere]">{t.aiSaid}: {tampil(f.extracted)}</span>}
      </div>
    </div>
  )
}

function MatchPanel({
  t, lang, h, names, bisaEdit, opsi, konflik, pilih, konfirmasi, buatBaru, kosongkan,
}: {
  t: Record<string, string>
  lang: Lang
  h: HasilCocok
  names: Record<string, string>
  bisaEdit: boolean
  opsi: Opsi[]
  konflik: string | null
  pilih: (id: string | null, dibuat: boolean) => void
  konfirmasi: () => void
  buatBaru?: () => void
  kosongkan?: (nilai: boolean) => void
}) {
  const [dropdown, setDropdown] = useState('')
  const [berisiko, setBerisiko] = useState<KandidatCocok | null>(null)
  const L = LABEL_BASIS[lang]
  const dipilihManusia = h.basis === 'SELECTED_BY_REVIEWER' || h.basis === 'CREATED_BY_REVIEWER'
  const perluKonfirmasi = h.status === 'MATCHED' && h.requiresConfirmation && !h.confirmed && !dipilihManusia
  const sudahPasti = !h.leftEmpty && (dipilihManusia || (h.status === 'MATCHED' && (!h.requiresConfirmation || h.confirmed)))
  const lain = kandidatLain(h)
  const alasanRisiko = (k: KandidatCocok) =>
    [
      k.basis.includes('MMSI_UNVERIFIED') && t.riskyUnverified,
      k.basis === 'NAME_PARTIAL' && t.riskyPartial,
      k.warning && t.riskyInactive,
      h.status === 'CONFLICT' && t.riskyConflict,
    ].filter(Boolean).join(' ')

  const pakaiKandidat = (k: KandidatCocok) => {
    if (kandidatBerisiko(h, k)) setBerisiko(k)
    else pilih(k.id, false)
  }

  return (
    <div className="mt-3 rounded bg-surface-tertiary/50 p-2.5 text-sm min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className={dtCls}>{t.master}</span>
        <MatchBadge h={h} lang={lang} />
        {h.basis && !h.leftEmpty && !dipilihManusia && <span className="text-xs text-text-secondary">{L[h.basis] ?? h.basis}</span>}
      </div>
      {konflik && (
        <p className="mt-2 flex items-start gap-2 rounded border border-status-danger/40 bg-status-danger/10 px-2 py-1.5 text-text-primary">
          <AlertOctagon className="mt-0.5 w-4 h-4 flex-shrink-0 text-status-danger" aria-hidden="true" /> {konflik}
        </p>
      )}
      {h.selectedId && !h.leftEmpty && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-text-primary break-words">{t.selected}: <strong>{names[h.selectedId] ?? h.candidates.find((c) => c.id === h.selectedId)?.label ?? '—'}</strong></p>
          {bisaEdit && perluKonfirmasi && (
            <button type="button" onClick={konfirmasi} className={cn(btnCls, 'min-h-[30px] px-2 bg-accent-blue text-white hover:bg-accent-blue/90')}>
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> {t.confirm}
            </button>
          )}
        </div>
      )}
      {lain.length > 0 && (bisaEdit || !sudahPasti) && (
        <div className="mt-2">
          <p className={dtCls}>{t.otherCandidates}</p>
          <ul className="mt-1 space-y-1.5">
            {lain.map((c) => (
              <li key={c.id} className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-text-primary [overflow-wrap:anywhere]">{c.label}</span>
                  <span className={cn('text-[11px]', kandidatBerisiko(h, c) ? 'text-accent-amber' : 'text-text-secondary')}>
                    {kandidatBerisiko(h, c) && <AlertTriangle className="mr-0.5 inline w-3 h-3" aria-hidden="true" />}
                    {L[basisTerkuat(c.basis)] ?? c.basis}{c.warning ? ` · ${L[c.warning] ?? c.warning}` : ''}{c.mmsiUnverified ? ` · ${t.mmsiUnverified}` : ''}
                  </span>
                  {bisaEdit && !c.warning && (
                    <button type="button" onClick={() => pakaiKandidat(c)} className={btnKecil}>{t.choose}</button>
                  )}
                </div>
                {berisiko?.id === c.id && (
                  <div role="alert" className="mt-1 rounded border border-accent-amber/40 bg-accent-amber/10 p-2 text-xs text-text-primary">
                    <p>{alasanRisiko(c)} {t.riskyAsk} <strong>{c.label.split(' · ')[0]}</strong>?</p>
                    <div className="mt-1 flex gap-2">
                      <button type="button" className={btnKecil} onClick={() => { setBerisiko(null); pilih(c.id, false) }}>{t.riskyYes}</button>
                      <button type="button" className={btnKecil} onClick={() => setBerisiko(null)}>{t.cancel}</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {bisaEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {opsi.length > 0 && !h.leftEmpty && (
            <>
              <select
                aria-label={t.pickFromMaster}
                value={dropdown || (h.selectedId && opsi.some((o) => o.id === h.selectedId) ? h.selectedId : '')}
                onChange={(e) => setDropdown(e.target.value)}
                className="min-w-0 max-w-full bg-surface border border-border-muted rounded px-2 py-1 text-xs text-text-primary"
              >
                <option value="">{t.pickFromMaster}</option>
                {opsi.map((o) => (
                  <option key={o.id} value={o.id}>
                    {(o.label ?? o.name) + (o.mmsiUnverified ? ` · ${t.mmsiUnverified}` : '')}
                  </option>
                ))}
              </select>
              {dropdown && (
                <button type="button" onClick={() => { pilih(dropdown, false); setDropdown('') }} className={btnKecil}>{t.useSelected}</button>
              )}
            </>
          )}
          {buatBaru && !h.leftEmpty && !sudahPasti && (
            <button type="button" onClick={buatBaru} className={btnKecil}><Plus className="w-3.5 h-3.5" aria-hidden="true" /> {t.createNew}</button>
          )}
          {kosongkan && !(sudahPasti && !h.leftEmpty) && (
            <button type="button" onClick={() => kosongkan(!h.leftEmpty)} className={btnKecil}>{h.leftEmpty ? t.undoEmpty : t.leaveEmpty}</button>
          )}
          {(dipilihManusia || (h.status === 'MATCHED' && h.confirmed)) && !h.leftEmpty && (
            <button type="button" onClick={() => pilih(null, false)} className={btnKecil}>{t.unselect}</button>
          )}
        </div>
      )}
    </div>
  )
}

/** Step 4F / C1 — ringkasan WAJIB sebelum voyage dibuat (approve & coba lagi). */
function RingkasanDialog({
  t, lang, d, mode, keputusan, busy, tutup, lanjut,
}: {
  t: Record<string, string>
  lang: Lang
  d: IntakeDto
  mode: 'approve' | 'retry'
  keputusan: { putusan: string; alasan: string }
  busy: boolean
  tutup: () => void
  lanjut: () => void
}) {
  const refBatal = useRef<HTMLButtonElement>(null)
  const refTutup = useRef(tutup)
  refTutup.current = tutup
  useEffect(() => {
    // G-1 — fokus awal di tombol batal, BUKAN di tombol pembuat voyage: aksi ini tak bisa dibatalkan,
    // jadi Enter/Spasi refleks setelah dialog muncul tidak boleh langsung membuat voyage.
    refBatal.current?.focus()
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') refTutup.current()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])
  const p = d.proposal
  const m = d.matches
  const nama = (h: HasilCocok) => {
    const x = idDipakai(h)
    return x ? d.names[x] ?? '—' : null
  }
  const kapal = p.vessels
    .map((v, i) => ({ v, i }))
    .filter((x) => !x.v.excluded)
    .sort((a, b) => (a.i === (d.review?.primaryVesselIndex ?? 0) ? -1 : b.i === (d.review?.primaryVesselIndex ?? 0) ? 1 : 0))
    .map(({ v, i }) => `${nama(m.vessels[i]) ?? v.name.value ?? '—'}${v.role.value ? ` (${v.role.value === 'TUG' ? t.tug : t.barge})` : ''}`)
    .join(' + ')
  const jadwal = (['eta', 'etb', 'etd'] as const)
    .filter((k) => p[k].value)
    .map((k) => `${k.toUpperCase()} ${formatTanggal(p[k].value, lang)}`)
    .join(' · ')
  const portal = d.review?.portalActiveAccessCount ?? 0
  const pelanggan = nama(m.customer)
  const barisRingkas: Array<[string, string, boolean?]> = [
    [t.cVessel, kapal || '—'],
    [t.cPort, nama(m.port) ?? '—'],
    [t.cSchedule, jadwal || '—'],
    [t.cPrincipal, nama(m.principal) ?? t.leftEmpty],
    [t.cCustomer, pelanggan ? pelanggan : `${t.leftEmpty} (${t.notInPortal})`],
    [t.cCargo, p.cargoes.map((c) => `${c.name}${c.quantity != null ? ` ${formatJumlah(c.quantity, lang)} ${c.unit ?? ''}` : ''}`).join('; ') || '—'],
  ]
  if (d.duplicateLevel !== 'NO_DUPLICATE') {
    const alasan = mode === 'approve' ? keputusan.alasan : d.decisionReason ?? ''
    barisRingkas.push([t.cDup, `${LABEL_DUPLIKAT[lang][d.duplicateLevel]} — ${t.dupNew}${alasan ? `: "${alasan}"` : ''}`, true])
  }
  if (pelanggan && portal > 0) barisRingkas.push([t.cPortal, t.portalVisible.replace('{n}', String(portal)), true])
  barisRingkas.push([t.cStatus, t.planned])

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ringkasan-voyage" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-card-border bg-card-bg p-4 sm:p-5">
        <h2 id="ringkasan-voyage" className="font-display text-lg text-text-primary">{mode === 'approve' ? t.confirmTitle : t.retryTitle}</h2>
        <dl className="mt-3 divide-y divide-border-muted/60 text-sm">
          {barisRingkas.map(([label, nilai, tegas]) => (
            <div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-1.5">
              <dt className="text-text-secondary">{label}</dt>
              <dd className={cn('[overflow-wrap:anywhere]', tegas ? 'font-medium text-status-danger' : 'text-text-primary')}>{nilai}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button ref={refBatal} type="button" onClick={tutup} className={btnGaris}>{t.back2}</button>
          <button type="button" disabled={busy} onClick={lanjut} className={cn(btnCls, 'bg-accent-blue text-white hover:bg-accent-blue/90')}>
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> {t.yesCreate}
          </button>
        </div>
      </div>
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
  const { lang } = useLang()
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
      if (!res.ok) return setError(await bacaGalat(res, t.errAction, lang))
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
    <div role="dialog" aria-modal="true" aria-labelledby="buat-master" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-card-border bg-card-bg p-4 sm:p-5">
        <h2 id="buat-master" className="font-display text-lg text-text-primary">{t.createTitle} — {t[buat.kind]}</h2>
        {error && <div className="mt-2"><Galat pesan={error} /></div>}
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
