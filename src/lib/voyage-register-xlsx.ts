// Export xlsx "Voyage & Finance Register" (Fase 5c) — pola warna & tata letak
// sama persis finance-xlsx.ts (NAVY/BRASS) supaya semua unduhan xlsx tenant
// terlihat satu keluarga.

import ExcelJS from 'exceljs'
import type { VoyageRegisterRow } from '@/services/reports.service'

const NAVY = 'FF0E2238'
const WHITE = 'FFFFFFFF'
const GRAY = 'FF6B7A8D'
const RED = 'FFC0432E'

const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '')

export async function buildVoyageRegisterWorkbook(
  rows: VoyageRegisterRow[],
  companyName: string,
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = companyName
  wb.created = new Date()
  const ws = wb.addWorksheet('Voyage Register')

  ws.columns = [
    { width: 18 }, { width: 22 }, { width: 20 }, { width: 16 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 },
  ]

  ws.mergeCells('A1:K1')
  const title = ws.getCell('A1')
  title.value = 'VOYAGE & FINANCE REGISTER'
  title.font = { bold: true, size: 16, color: { argb: WHITE } }
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  ws.getRow(1).height = 32

  ws.mergeCells('A2:K2')
  const sub = ws.getCell('A2')
  sub.value = `${companyName}   ·   Per ${new Date().toISOString().slice(0, 10)}   ·   ${rows.length} voyage`
  sub.font = { italic: true, size: 10, color: { argb: GRAY } }
  sub.alignment = { indent: 1 }

  const headerRow = 4
  const headers = [
    'Voyage', 'Vessel', 'Principal', 'Port', 'Status', 'ETA', 'ETD',
    'EPDA/FPDA', 'FDA', 'Invoice', 'Outstanding',
  ]
  headers.forEach((label, i) => {
    const c = ws.getRow(headerRow).getCell(i + 1)
    c.value = label
    c.font = { bold: true, size: 9, color: { argb: WHITE } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    c.alignment = { indent: 1, vertical: 'middle' }
  })
  ws.getRow(headerRow).height = 16

  let r = headerRow + 1
  const fmt = '#,##0'
  for (const row of rows) {
    ws.getCell(`A${r}`).value = row.voyageNumber
    ws.getCell(`B${r}`).value = row.vesselName
    ws.getCell(`C${r}`).value = row.principal ?? '—'
    ws.getCell(`D${r}`).value = row.port ?? '—'
    ws.getCell(`E${r}`).value = row.status
    ws.getCell(`F${r}`).value = fmtDate(row.eta)
    ws.getCell(`G${r}`).value = fmtDate(row.etd)

    const money = (col: string, v: number) => {
      const c = ws.getCell(`${col}${r}`)
      c.value = v
      c.numFmt = `"${row.baseCurrency}" ${fmt}`
      c.alignment = { horizontal: 'right' }
    }
    money('H', row.epdaTotal)
    money('I', row.fdaTotal)
    money('J', row.invoiceTotal)
    const outCell = ws.getCell(`K${r}`)
    outCell.value = row.invoiceOutstanding
    outCell.numFmt = `"${row.baseCurrency}" ${fmt}`
    outCell.alignment = { horizontal: 'right' }
    if (row.invoiceOutstanding > 0) outCell.font = { color: { argb: RED }, bold: true }

    if (r % 2 === 0) {
      for (let col = 1; col <= 11; col++) {
        const c = ws.getRow(r).getCell(col)
        if (!c.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F6F9' } }
      }
    }
    r++
  }

  ws.views = [{ state: 'frozen', ySplit: headerRow }]
  return wb.xlsx.writeBuffer()
}
