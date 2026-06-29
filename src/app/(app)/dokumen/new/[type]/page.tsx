import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NorForm } from '@/components/dokumen/NorForm'
import { SofForm } from '@/components/dokumen/SofForm'
import { CrewListForm } from '@/components/dokumen/CrewListForm'
import { GenDecForm } from '@/components/dokumen/GenDecForm'
import { ShipStoresForm } from '@/components/dokumen/ShipStoresForm'
import { CargoDeclForm } from '@/components/dokumen/CargoDeclForm'
import { AppointmentForm } from '@/components/dokumen/AppointmentForm'
import { ReportForm } from '@/components/dokumen/ReportForm'
import { ProtestForm } from '@/components/dokumen/ProtestForm'
import { CrewChangeForm } from '@/components/dokumen/CrewChangeForm'
import { PortCallSummaryForm } from '@/components/dokumen/PortCallSummaryForm'

export default function NewDocumentPage({ params }: { params: { type: string } }) {
  // Dokumen operasional yang sudah punya generator.
  if (params.type === 'NOR') return <NorForm />
  if (params.type === 'SOF') return <SofForm />
  if (params.type === 'FAL_5' || params.type === 'CREW_LIST') return <CrewListForm />
  if (params.type === 'FAL_1' || params.type === 'FAL_BUNDLE') return <GenDecForm />
  if (params.type === 'FAL_3') return <ShipStoresForm />
  if (params.type === 'FAL_2') return <CargoDeclForm />
  if (params.type === 'AGENCY_APPOINTMENT' || params.type === 'SIB') return <AppointmentForm />
  if (params.type === 'ARRIVAL_REPORT') return <ReportForm kind="ARRIVAL" />
  if (params.type === 'DEPARTURE_REPORT') return <ReportForm kind="DEPARTURE" />
  if (params.type === 'LETTER_OF_PROTEST') return <ProtestForm />
  if (params.type === 'CREW_CHANGE_NOTICE') return <CrewChangeForm />
  if (params.type === 'PORT_CALL_SUMMARY') return <PortCallSummaryForm />

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
        <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-2">Dokumen Baru</p>
        <h1 className="font-display text-2xl text-white mb-2">{label}</h1>
        <p className="text-text-secondary text-sm">
          Generator dokumen ini sedang disiapkan. Yang sudah aktif:{' '}
          <Link href="/dokumen/new/FAL_1" className="text-accent-blue hover:underline">General Declaration</Link>,{' '}
          <Link href="/dokumen/new/NOR" className="text-accent-blue hover:underline">NOR</Link>,{' '}
          <Link href="/dokumen/new/SOF" className="text-accent-blue hover:underline">SOF</Link>,{' '}
          <Link href="/dokumen/new/FAL_5" className="text-accent-blue hover:underline">Crew List</Link>,{' '}
          <Link href="/dokumen/new/FAL_3" className="text-accent-blue hover:underline">Ship&apos;s Stores</Link>,{' '}
          <Link href="/dokumen/new/FAL_2" className="text-accent-blue hover:underline">Cargo Declaration</Link> &amp;{' '}
          <Link href="/dokumen/new/AGENCY_APPOINTMENT" className="text-accent-blue hover:underline">Agency Appointment</Link>.
        </p>
      </div>
    </div>
  )
}
