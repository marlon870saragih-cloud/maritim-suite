import ExcelJS from 'exceljs'
import type { FinSummary } from './finance-summary'

const NAVY = 'FF0E2238'
const BRASS = 'FFC79A3E'
const PAPER = 'FFF3F6F9'
const WHITE = 'FFFFFFFF'
const GRAY = 'FF6B7A8D'
const RED = 'FFC0432E'

const STATUS: Record<string, string> = { DRAFT: 'Draf', FINAL: 'Final', SENT: 'Terkirim', PAID: 'Lunas', CANCELLED: 'Batal' }

function sectionHeader(ws: ExcelJS.Worksheet, r: number, text: string) {
  ws.mergeCells(`A${r}:I${r}`)
  const c = ws.getCell(`A${r}`)
  c.value = text
  c.font = { bold: true, size: 10, color: { argb: BRASS } }
  c.alignment = { indent: 1, vertical: 'middle' }
  ws.getRow(r).height = 18
}
function tableHeader(ws: ExcelJS.Worksheet, r: number, cols: string[]) {
  cols.forEach((label, i) => {
    const c = ws.getRow(r).getCell(i + 1)
    c.value = label
    c.font = { bold: true, size: 9, color: { argb: WHITE } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    c.alignment = { indent: 1, vertical: 'middle' }
  })
  ws.getRow(r).height = 16
}
function money(c: ExcelJS.Cell, v: number, fmt: string) {
  c.value = v
  c.numFmt = fmt
  c.alignment = { horizontal: 'right' }
}
const bar = (v: number, max: number) => '█'.repeat(Math.max(0, Math.round((v / Math.max(max, 1)) * 22)))

/** Bangun workbook ringkasan keuangan (rapi, ber-format, dengan mini-grafik in-cell). */
export async function buildFinanceWorkbook(summary: FinSummary): Promise<ExcelJS.Buffer> {
  const fmt = '#,##0'
  const wb = new ExcelJS.Workbook()
  wb.creator = summary.company
  wb.created = new Date()
  const ws = wb.addWorksheet('Ringkasan Keuangan')
  ws.columns = [
    { width: 13 }, { width: 20 }, { width: 30 }, { width: 24 },
    { width: 15 }, { width: 13 }, { width: 16 }, { width: 10 }, { width: 16 },
  ]

  ws.mergeCells('A1:I1')
  const title = ws.getCell('A1')
  title.value = 'RINGKASAN KEUANGAN — FINANCIAL SUMMARY'
  title.font = { bold: true, size: 16, color: { argb: WHITE } }
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  ws.getRow(1).height = 32

  ws.mergeCells('A2:I2')
  const sub = ws.getCell('A2')
  sub.value = `${summary.company}   ·   Per ${summary.generatedAt}   ·   Mata uang: ${summary.currency}`
  sub.font = { italic: true, size: 10, color: { argb: GRAY } }
  sub.alignment = { indent: 1 }

  let r = 4
  const kpi = (label: string, val: number | string, isMoney = true) => {
    ws.mergeCells(`A${r}:B${r}`)
    const lc = ws.getCell(`A${r}`)
    lc.value = label
    lc.font = { bold: true, size: 9, color: { argb: GRAY } }
    lc.alignment = { indent: 1 }
    const vc = ws.getCell(`C${r}`)
    vc.value = val
    if (isMoney && typeof val === 'number') vc.numFmt = `"${summary.currency}" ${fmt}`
    vc.font = { bold: true, size: 12, color: { argb: label.includes('Piutang') ? RED : NAVY } }
    ws.getRow(r).height = 18
    r++
  }
  kpi('Total Piutang (Outstanding)', summary.totalOutstanding)
  kpi('Total Ditagih (Invoiced)', summary.totalInvoiced)
  kpi('Total Lunas (Paid)', summary.totalPaid)
  kpi('PPN Total', summary.totalVat)
  kpi('Invoice lewat tempo', `${summary.overdueCount} invoice`, false)

  r += 1
  sectionHeader(ws, r, 'UMUR PIUTANG / AGING')
  r++
  tableHeader(ws, r, ['Kelompok', 'Jumlah', `Nilai (${summary.currency})`, 'Grafik'])
  r++
  const maxAge = Math.max(...summary.aging.map((a) => a.value), 1)
  for (const a of summary.aging) {
    ws.getCell(`A${r}`).value = a.label
    ws.getCell(`B${r}`).value = a.count
    money(ws.getCell(`C${r}`), a.value, fmt)
    const g = ws.getCell(`D${r}`)
    g.value = bar(a.value, maxAge)
    g.font = { color: { argb: BRASS } }
    r++
  }

  r += 1
  sectionHeader(ws, r, 'PIUTANG PER PRINCIPAL')
  r++
  tableHeader(ws, r, ['Principal', 'Invoice', `Outstanding (${summary.currency})`, `Ditagih (${summary.currency})`])
  r++
  for (const p of summary.byPrincipal) {
    ws.getCell(`A${r}`).value = p.principal
    ws.getCell(`B${r}`).value = p.count
    money(ws.getCell(`C${r}`), p.outstanding, fmt)
    money(ws.getCell(`D${r}`), p.invoiced, fmt)
    r++
  }

  r += 1
  sectionHeader(ws, r, 'DAFTAR INVOICE')
  r++
  const listHead = r
  tableHeader(ws, r, ['Tanggal', 'No Invoice', 'Principal', 'Kapal/Voyage', 'DPP', 'PPN', 'Total', 'Status', 'Outstanding'])
  r++
  const listStart = r
  for (const row of summary.rows) {
    ws.getCell(`A${r}`).value = row.date
    ws.getCell(`B${r}`).value = row.docNumber
    ws.getCell(`C${r}`).value = row.principal
    ws.getCell(`D${r}`).value = row.vessel
    money(ws.getCell(`E${r}`), row.dpp, fmt)
    money(ws.getCell(`F${r}`), row.vat, fmt)
    money(ws.getCell(`G${r}`), row.total, fmt)
    ws.getCell(`H${r}`).value = STATUS[row.status] ?? row.status
    money(ws.getCell(`I${r}`), row.outstanding, fmt)
    if ((r - listStart) % 2 === 1) {
      for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']) {
        ws.getCell(`${col}${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAPER } }
      }
    }
    r++
  }
  if (r - 1 >= listStart) ws.autoFilter = { from: `A${listHead}`, to: `I${listHead}` }

  const tc = ws.getCell(`D${r}`)
  tc.value = 'TOTAL'
  tc.font = { bold: true }
  tc.alignment = { horizontal: 'right' }
  const gt = ws.getCell(`G${r}`)
  money(gt, summary.totalInvoiced, fmt)
  gt.font = { bold: true, color: { argb: NAVY } }
  const ot = ws.getCell(`I${r}`)
  money(ot, summary.totalOutstanding, fmt)
  ot.font = { bold: true, color: { argb: RED } }

  return wb.xlsx.writeBuffer()
}
