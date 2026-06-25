// Baris dokumen untuk tabel "Dokumen Terbaru".
export type DocRow = {
  docNumber: string
  type: string
  vessel: string
  port: string
  status: string
}

// Data contoh (dari mockup Stitch) — dipakai sampai DB Supabase + NextAuth aktif.
export const SAMPLE_RECENT_DOCS: DocRow[] = [
  { docNumber: 'DOC-2023-8901', type: 'FAL 1', vessel: 'MV Ocean Blue', port: 'Tanjung Priok', status: 'FINAL' },
  { docNumber: 'DOC-2023-8902', type: 'SOF', vessel: 'MT Pacific Pearl', port: 'Belawan', status: 'SENT' },
  { docNumber: 'DOC-2023-8903', type: 'SIB', vessel: 'MV Star Liner', port: 'Tanjung Perak', status: 'DRAFT' },
  { docNumber: 'DOC-2023-8904', type: 'Crew Change', vessel: 'SS Horizon', port: 'Makassar', status: 'OVERDUE' },
  { docNumber: 'DOC-2023-8905', type: 'FAL 5', vessel: 'MV Ocean Blue', port: 'Tanjung Priok', status: 'FINAL' },
]

/**
 * TODO(db): setelah Supabase + NextAuth aktif, ganti isi fungsi ini dengan query Prisma
 * ter-scope tenantId dari session, contoh:
 *
 *   const docs = await prisma.maritimeDocument.findMany({
 *     where: { tenantId: session.user.tenantId },
 *     include: { vessel: true, principal: true },
 *     orderBy: { createdAt: 'desc' },
 *     take: 10,
 *   })
 *   return docs.map((d) => ({ ... }))
 *
 * Untuk sekarang mengembalikan data contoh agar UI bisa dirender tanpa DB.
 */
export async function getRecentDocuments(): Promise<DocRow[]> {
  return SAMPLE_RECENT_DOCS
}
