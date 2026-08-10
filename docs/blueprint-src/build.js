// Pembuat dokumen Word — Maritime Suite Blueprint 2.0 Volume 1
// Jalankan: node build.js
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, ImageRun,
  Header, Footer, PageNumber, TableOfContents, LevelFormat, convertMillimetersToTwip,
  VerticalAlign, PositionalTab, PositionalTabAlignment, PositionalTabLeader,
} = require('docx');

const content = require('./content.js');

// ---------- tetapan tampilan ----------
const NAVY = '1C3A5E';
const GOLD = 'C0902F';
const RED  = 'A81E32';
const GREY = '5A5A5A';
const LIGHT = 'F2F4F7';

const FONT = 'Calibri';
const PAGE_W = 11906;                 // A4 dalam DXA
const MARGIN = convertMillimetersToTwip(25);
const USABLE = PAGE_W - MARGIN * 2;   // ~10488

// ---------- pemformat teks sebaris: **tebal**, `kode`, _miring_ ----------
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, ...base }));
    const tok = m[0];
    if (tok.startsWith('**')) {
      out.push(new TextRun({ text: tok.slice(2, -2), font: FONT, bold: true, ...base }));
    } else if (tok.startsWith('`')) {
      out.push(new TextRun({ text: tok.slice(1, -1), font: 'Consolas', size: 19, color: '8A4B08', ...base }));
    } else {
      out.push(new TextRun({ text: tok.slice(1, -1), font: FONT, italics: true, ...base }));
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, ...base }));
  return out.length ? out : [new TextRun({ text: '', font: FONT })];
}

const P = (text, opt = {}) => new Paragraph({
  children: runs(text, opt.run || {}),
  spacing: { after: opt.after ?? 140, line: opt.line ?? 288 },
  alignment: opt.align,
  indent: opt.indent,
  border: opt.border,
  shading: opt.shading,
  keepNext: opt.keepNext,
});

// ---------- tabel ----------
function cell(text, { head = false, w, bg, bold = false, align, keep = false } = {}) {
  const lines = String(text).split('||');
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: bg || (head ? NAVY : 'FFFFFF'), color: 'auto' },
    margins: { top: 90, bottom: 90, left: 130, right: 130 },
    verticalAlign: VerticalAlign.TOP,
    children: lines.map((line, i) => new Paragraph({
      children: runs(line, head
        ? { bold: true, color: 'FFFFFF', size: 19 }
        : { bold, size: 19 }),
      spacing: { after: i === lines.length - 1 ? 0 : 60, line: 260 },
      alignment: align,
      keepNext: keep,          // menahan tabel pendek agar tidak terbelah antar-halaman
      keepLines: true,
    })),
  });
}

function makeTable(block) {
  const widths = block.w
    ? block.w.map(x => Math.round(USABLE * x / block.w.reduce((a, b) => a + b, 0)))
    : new Array(block.head.length).fill(Math.floor(USABLE / block.head.length));
  // koreksi pembulatan supaya jumlahnya persis
  const drift = USABLE - widths.reduce((a, b) => a + b, 0);
  widths[widths.length - 1] += drift;

  const border = { style: BorderStyle.SINGLE, size: 2, color: 'C9CFD8' };
  // Tabel pendek ditahan utuh dalam satu halaman; tabel panjang dibiarkan mengalir
  // (kalau dipaksa utuh, Word justru melompatkan seluruh tabel dan meninggalkan halaman kosong).
  const short = block.rows.length <= 9;
  const rows = [];
  if (block.head) {
    rows.push(new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: block.head.map((h, i) => cell(h, { head: true, w: widths[i], keep: short })),
    }));
  }
  block.rows.forEach((r, ri) => {
    const isLast = ri === block.rows.length - 1;
    rows.push(new TableRow({
      cantSplit: true,
      children: r.map((c, i) => cell(c, {
        w: widths[i],
        bg: ri % 2 === 1 ? LIGHT : 'FFFFFF',
        bold: block.boldFirst && i === 0,
        keep: short && !isLast,
      })),
    }));
  });
  return new Table({
    columnWidths: widths,
    width: { size: USABLE, type: WidthType.DXA },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows,
  });
}

// ---------- kotak catatan ----------
function noteBox(text, color = GOLD) {
  return new Paragraph({
    children: runs(text, { size: 20 }),
    spacing: { before: 160, after: 200, line: 288 },
    indent: { left: 220, right: 220 },
    shading: { type: ShadingType.CLEAR, fill: 'FBF7EE', color: 'auto' },
    border: {
      left: { style: BorderStyle.SINGLE, size: 18, color, space: 10 },
      top: { style: BorderStyle.SINGLE, size: 2, color: 'E8DFC9', space: 6 },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E8DFC9', space: 6 },
      right: { style: BorderStyle.SINGLE, size: 2, color: 'E8DFC9', space: 6 },
    },
  });
}

// ---------- penerjemah blok → elemen docx ----------
function render(blocks) {
  const out = [];
  // 'pb' tidak lagi menyisipkan paragraf kosong berisi PageBreak — paragraf semacam itu
  // bisa terdampar sendirian dan menghasilkan halaman kosong. Sebagai gantinya, blok
  // sesudahnya diberi tanda "mulai di halaman baru".
  let breakNext = false;
  const brk = () => { const v = breakNext; breakNext = false; return v; };

  for (const b of blocks) {
    switch (b.t) {
      case 'h1':
        out.push(new Paragraph({
          children: runs(b.x, { color: NAVY, bold: true, size: 34 }),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 0, after: 60 },
          pageBreakBefore: brk(),
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 8 } },
        }));
        break;
      case 'h2':
        out.push(new Paragraph({
          children: runs(b.x, { color: NAVY, bold: true, size: 25 }),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 110 },
          keepNext: true,
        }));
        break;
      case 'h3':
        out.push(new Paragraph({
          children: runs(b.x, { color: RED, bold: true, size: 22 }),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 220, after: 80 },
          keepNext: true,
        }));
        break;
      case 'lead':
        out.push(new Paragraph({
          children: runs(b.x, { italics: true, color: GREY, size: 21 }),
          spacing: { after: 220, line: 288 },
        }));
        break;
      case 'p':
        out.push(new Paragraph({
          children: runs(b.x, { size: 21 }),
          spacing: { after: 140, line: 288 },
          pageBreakBefore: brk(),
        }));
        break;
      case 'ul':
        b.x.forEach(item => out.push(new Paragraph({
          children: runs(item, { size: 21 }),
          numbering: { reference: 'bul', level: 0 },
          spacing: { after: 70, line: 288 },
        })));
        break;
      case 'ol':
        b.x.forEach(item => out.push(new Paragraph({
          children: runs(item, { size: 21 }),
          numbering: { reference: 'num', level: 0 },
          spacing: { after: 70, line: 288 },
        })));
        break;
      case 'table':
        if (b.cap) out.push(P(b.cap, { run: { bold: true, size: 20, color: NAVY }, after: 80, keepNext: true }));
        out.push(makeTable(b));
        out.push(new Paragraph({ text: '', spacing: { after: 180 } }));
        break;
      case 'note':
        out.push(noteBox(b.x, b.color === 'red' ? RED : b.color === 'navy' ? NAVY : GOLD));
        break;
      case 'quote':
        out.push(new Paragraph({
          children: runs(b.x, { italics: true, size: 22, color: NAVY }),
          spacing: { before: 160, after: 200, line: 300 },
          indent: { left: 400, right: 400 },
          alignment: AlignmentType.CENTER,
        }));
        break;
      case 'pb':
        breakNext = true;
        break;
      case 'rule':
        out.push(new Paragraph({
          text: '',
          spacing: { before: 100, after: 160 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D6DCE4', space: 4 } },
        }));
        break;
      default:
        throw new Error('Blok tak dikenal: ' + b.t);
    }
  }
  return out;
}

// ---------- sampul ----------
function coverSection() {
  const logoPath = path.join('D:', 'rapikan', '04 DEVELOPMENT DAN AI', 'CLAUDE CODE',
    'aplikasi maritim', 'maritime-suite', 'public', 'logo-transparent.png');
  const children = [];

  children.push(new Paragraph({ text: '', spacing: { after: 700 } }));

  if (fs.existsSync(logoPath)) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 420 },
      children: [new ImageRun({
        type: 'png',
        data: fs.readFileSync(logoPath),
        transformation: { width: 175, height: 145 },
      })],
    }));
  }

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: runs('PT TRIBUANA SOLUSI MARITIM', { bold: true, size: 28, color: NAVY, characterSpacing: 40 }),
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 620 },
    children: runs('Samarinda — Kalimantan Timur', { size: 20, color: GREY }),
  }));

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 0 },
    border: { top: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 14 } },
    children: runs('MARITIME SUITE', { bold: true, size: 62, color: NAVY }),
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: runs('BLUEPRINT 2.0', { bold: true, size: 34, color: GOLD }),
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 30 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 14 } },
    children: runs('Volume 1 — Executive Blueprint', { size: 26, color: GREY }),
  }));

  children.push(new Paragraph({ text: '', spacing: { after: 520 } }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: runs('Sistem Operasi Digital untuk Keagenan Kapal', { italics: true, size: 24, color: NAVY }),
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 900 },
    children: runs('Visi · Masalah · Solusi · Arsitektur · Model Bisnis · Peta Jalan', { size: 19, color: GREY }),
  }));

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: runs('Versi 2.0 · Volume 1 dari 3 · Agustus 2026', { size: 19, color: GREY }),
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: runs('DOKUMEN INTERNAL — RAHASIA', { bold: true, size: 18, color: RED }),
  }));

  return children;
}

// ---------- perakitan ----------
const doc = new Document({
  creator: 'PT Tribuana Solusi Maritim',
  title: 'Maritime Suite Blueprint 2.0 — Volume 1 Executive Blueprint',
  description: 'Blueprint eksekutif Maritime Suite untuk PT Tribuana Solusi Maritim',
  styles: {
    default: {
      document: { run: { font: FONT, size: 21 }, paragraph: { spacing: { line: 288 } } },
    },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 34, bold: true, color: NAVY } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 25, bold: true, color: NAVY } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 22, bold: true, color: RED } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bul', levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 460, hanging: 240 } } } },
      ]},
      { reference: 'num', levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 460, hanging: 240 } } } },
      ]},
    ],
  },
  sections: [
    {
      properties: { page: { margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } } },
      children: coverSection(),
    },
    {
      properties: { page: { margin: { top: MARGIN, right: MARGIN, bottom: convertMillimetersToTwip(20), left: MARGIN } } },
      headers: {
        default: new Header({ children: [new Paragraph({
          spacing: { after: 0 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D6DCE4', space: 6 } },
          children: [
            ...runs('Maritime Suite — Blueprint 2.0 · Volume 1', { size: 16, color: GREY }),
            new TextRun({ children: [new PositionalTab({
              alignment: PositionalTabAlignment.RIGHT, relativeTo: 'margin', leader: PositionalTabLeader.NONE })] }),
            new TextRun({ text: 'PT Tribuana Solusi Maritim', font: FONT, size: 16, color: GREY }),
          ],
        })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'Halaman ', font: FONT, size: 16, color: GREY }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: GREY }),
            new TextRun({ text: '  ·  Rahasia', font: FONT, size: 16, color: GREY }),
          ],
        })] }),
      },
      children: [
        new Paragraph({
          children: runs('Daftar Isi', { bold: true, size: 34, color: NAVY }),
          spacing: { after: 60 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 8 } },
        }),
        new Paragraph({
          children: runs('Nomor halaman sudah terisi. Bila dokumen disunting, klik kanan pada daftar lalu pilih "Update Field" untuk menyegarkannya.',
            { italics: true, size: 18, color: GREY }),
          spacing: { after: 240 },
        }),
        new TableOfContents('Daftar Isi', { hyperlink: true, headingStyleRange: '1-2' }),
        new Paragraph({ children: [new PageBreak()] }),
        ...render(content),
      ],
    },
  ],
});

const outDir = path.join('D:', 'rapikan', '04 DEVELOPMENT DAN AI', 'CLAUDE CODE',
  'aplikasi maritim', 'maritime-suite', 'docs');
const outFile = path.join(outDir, 'Maritim Suite Blueprint 2.0 - Volume 1 Executive Blueprint.docx');

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outFile, buf);
  console.log('OK ->', outFile);
  console.log('Ukuran:', (buf.length / 1024).toFixed(0), 'KB · blok konten:', content.length);
});
