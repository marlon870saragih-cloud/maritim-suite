import { prisma } from '@/lib/prisma'

/** Field relasi yang disimpan di MaritimeDocument untuk mengaitkan dokumen ke Port Call. */
export type DocLinkFields = {
  portCallId?: string | null
  vesselId?: string | null
  principalId?: string | null
}

/**
 * Resolusi field relasi (`portCallId`/`vesselId`/`principalId`) yang harus disimpan
 * saat membuat sebuah dokumen.
 *
 * - Bila `portCallId` diberikan (dokumen dibuat dari Port Call), ambil kapal & principal
 *   dari Port Call tsb — sumber kebenaran tunggal.
 * - Bila tidak, dan `fromId` diberikan (dokumen berantai, mis. FPDA dari EPDA / Invoice dari
 *   FPDA), warisi relasi dari dokumen sumber agar rantai tetap terhubung ke Port Call yang sama.
 * - Semua query di-scope ke tenant; bila tak ditemukan, kembalikan objek kosong (tak mengikat).
 */
export async function resolveDocLinks(opts: {
  portCallId?: string | null
  fromId?: string | null
  tenantId: string
}): Promise<DocLinkFields> {
  const { portCallId, fromId, tenantId } = opts

  if (portCallId) {
    const pc = await prisma.portCall.findFirst({
      where: { id: portCallId, tenantId },
      select: { id: true, vesselId: true, principalId: true },
    })
    if (pc) return { portCallId: pc.id, vesselId: pc.vesselId, principalId: pc.principalId }
  }

  if (fromId) {
    const src = await prisma.maritimeDocument.findFirst({
      where: { id: fromId, tenantId },
      select: { portCallId: true, vesselId: true, principalId: true },
    })
    if (src && (src.portCallId || src.vesselId || src.principalId)) {
      return { portCallId: src.portCallId, vesselId: src.vesselId, principalId: src.principalId }
    }
  }

  return {}
}
