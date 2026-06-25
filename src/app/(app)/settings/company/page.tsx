import { PageHeader } from '@/components/shared/PageHeader'

const FIELDS: { label: string; value: string }[] = [
  { label: 'Nama Perusahaan', value: 'PT Tribuana Solusi Maritim' },
  { label: 'Tagline', value: 'Maritime Agency & Husbandry Services' },
  { label: 'Alamat', value: 'Samarinda, Kalimantan Timur' },
  { label: 'Telepon', value: '+62 541 000000' },
  { label: 'Email', value: 'ops@tribuana.co.id' },
  { label: 'NPWP', value: '00.000.000.0-000.000' },
  { label: 'Bank', value: 'Bank Mandiri' },
  { label: 'No. Rekening', value: '000-00-0000000-0' },
]

export default function CompanySettingsPage() {
  return (
    <div className="p-margin-page max-w-[900px] mx-auto space-y-8">
      <PageHeader
        kicker="Pengaturan"
        title="Profil perusahaan"
        description="Data ini muncul di kop dokumen, invoice, dan DA."
      />

      <section className="bg-card-bg border border-card-border rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {FIELDS.map((f) => (
            <div key={f.label}>
              <label className="block text-xs font-mono uppercase tracking-wider text-text-secondary mb-1.5">
                {f.label}
              </label>
              <input
                defaultValue={f.value}
                disabled
                className="w-full bg-surface border border-border-muted rounded px-3 py-2.5 text-sm text-text-primary
                           disabled:opacity-70"
              />
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-text-secondary text-xs">
            Penyimpanan aktif setelah database terhubung.
          </p>
          <button
            type="button"
            disabled
            className="bg-[#2E86DE] text-white rounded px-5 py-2 text-sm font-medium opacity-60 cursor-not-allowed"
          >
            Simpan Perubahan
          </button>
        </div>
      </section>
    </div>
  )
}
