import type { Lang } from '@/lib/i18n'

/**
 * String yang berulang di hampir semua form dokumen (tombol simpan/unduh/preview, ringkasan,
 * toast error, dll). Dipakai bersama agar tiap form tinggal menambah string khasnya sendiri.
 * Pakai: const c = useT(FORM_COMMON) di komponen client.
 */
export const FORM_COMMON: Record<Lang, {
  saveDraft: string
  saveChanges: string
  saved: string
  saveFail: string
  pdfFail: string
  download: string
  preview: string
  addRow: string
  deleteRow: string
  summary: string
  subtotal: string
  pdfNote: string
  backFinance: string
  backDok: string
}> = {
  id: {
    backFinance: 'Kembali ke Finance',
    backDok: 'Kembali ke Dokumen',
    saveDraft: 'Simpan Draft',
    saveChanges: 'Simpan Perubahan',
    saved: 'Tersimpan ✓',
    saveFail: 'Gagal menyimpan. Pastikan Anda sudah login.',
    pdfFail: 'Gagal membuat PDF. Coba lagi.',
    download: 'Unduh',
    preview: 'Preview',
    addRow: 'Tambah baris',
    deleteRow: 'Hapus baris',
    summary: 'Ringkasan',
    subtotal: 'Subtotal',
    pdfNote: 'Kop & rekening pada PDF otomatis dari profil perusahaan Anda. Draft tersimpan bisa dibuka & diunduh ulang dari halaman Finance.',
  },
  en: {
    backFinance: 'Back to Finance',
    backDok: 'Back to Documents',
    saveDraft: 'Save draft',
    saveChanges: 'Save changes',
    saved: 'Saved ✓',
    saveFail: 'Failed to save. Make sure you are signed in.',
    pdfFail: 'Failed to generate PDF. Please try again.',
    download: 'Download',
    preview: 'Preview',
    addRow: 'Add row',
    deleteRow: 'Delete row',
    summary: 'Summary',
    subtotal: 'Subtotal',
    pdfNote: 'Letterhead & bank details on the PDF are auto-filled from your company profile. Saved drafts can be reopened & re-downloaded from the Finance page.',
  },
}
