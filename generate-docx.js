'use strict';

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, AlignmentType, BorderStyle,
  WidthType, ShadingType, PageBreak,
  LevelFormat, ExternalHyperlink, UnderlineType,
  TextWrappingType, TextWrappingSide, HorizontalPositionAlign, VerticalPositionAlign,
} = require('docx');
const QRCode = require('qrcode');

let fetch;
try { fetch = require('node-fetch'); } catch(e) { fetch = global.fetch; }

// ─── TYPOGRAPHY & COLOR CONSTANTS ────────────────────────────────────────────
// Fonts
const F_HEADING = 'PT Sans Narrow';   // Section headings
const F_BODY    = 'Arial';            // Body text (fallback for PT Sans Narrow in body)
const F_BARLOW  = 'Barlow';           // Sub-section titles like "What do people see"

// Colors
const GREEN       = '28AB83';
const GREEN_LIGHT = 'E5F5F0';
const DARK_NAVY   = '323547';
const BLACK       = '000000';
const WHITE       = 'FFFFFF';
const AMBER       = 'C97D10';
const AMBER_LIGHT = 'FDF5E6';
const RED         = 'E05454';
const RED_LIGHT   = 'FDF0F0';
const GRAY        = 'F7FAF9';
const GRAY_MID    = 'EEEEEE';
const MUTED       = '7a8a9a';
const BORDER_C    = 'D9EDE7';

// Sizes (half-points: 22 = 11pt, 24 = 12pt, 32 = 16pt, 38 = 19pt)
const SZ_BODY         = 22;  // 11pt — standard body
const SZ_NOTE         = 18;  // 9pt  — explanatory notes
const SZ_BULLET       = 22;  // 11pt
const SZ_SUBHEAD      = 26;  // 13pt — step headings
const SZ_SECTION      = 32;  // 16pt — PT Sans Narrow section headings
const SZ_WHAT_DO      = 38;  // 19pt — "What do people see when they research you?"
const SZ_MMW_DIFF     = 46;  // 23pt — "How Medical Marketing Whiz is Different"
const SZ_METRIC_VAL   = 44;
const SZ_METRIC_LABEL = 17;

// Page dimensions
const PAGE_W    = 12240;
const PAGE_H    = 15840;
const MARGIN    = 1080;   // 0.75in
const CONTENT_W = PAGE_W - MARGIN * 2; // 10080 DXA ≈ 7 inches

// Image dimensions (pixels at 96dpi)
// 8.5in × 96 = 816px wide;  1.25in × 96 = 120px tall
const HDR_IMG_W = 816;
const HDR_IMG_H = 120;
// Cover: 8.5in × 11in
const COVER_W   = 816;
const COVER_H   = 1056;
// Content images: match text width (7in × 96 = 672px)
const IMG_W     = 672;

// ─── IMAGE URLs ───────────────────────────────────────────────────────────────
const IMAGE_URLS = {
  cover:                'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3f3903d829c73b27877b5.png',
  header_banner:        'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b629a78e55077a091d0a.png',
  patient_journey:      'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b629fa2dde97427c8c44.png',
  seo_vs_aeo:           'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b6293ffd8cf7a0ec5ee3.png',
  what_drives_rankings: 'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b62924c2b28f0390da30.png',
  account_manager:      'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b6293ffd8cf7a0ec5edc.png',
  whiz_works:           'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b629fa2dde97427c8c45.png',
  practice_pro:         'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b5fd3d829c73b270a9e9.png',
  smart_start:          'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b6298c83fdca504f14b1.png',
  deal_breakers:        'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b62917d86ef0ca0f010b.png',
  awards:               'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b6297f66a68b7bc45541.png',
  review_1:             'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b6297f66a68b7bc45542.png',
  review_2:             'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b6291faf1b5e928036e0.png',
  review_3:             'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b6294cde4bbc2a0254d0.png',
  review_4:             'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b6293ffd8cf7a0ec5edd.png',
  review_5:             'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b629191f0e3487a77449.png',
  review_6:             'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b6293ffd8cf7a0ec5edf.png',
  review_7:             'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b6294cde4bbc2a0254cf.png',
  review_8:             'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b6297f66a68b7bc45543.png',
  review_9:             'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b62984c045c274932c1b.png',
  review_10:            'https://assets.cdn.filesafe.space/y2T4QnIAgObiz9B7329R/media/69d3b629bec7abdef10cc6bf.png',
};

// ─── FETCHERS ─────────────────────────────────────────────────────────────────
async function fetchImageBuffer(url) {
  try {
    const res = await fetch(url, { timeout: 14000 });
    if (!res.ok) return null;
    return await res.buffer();
  } catch (e) {
    console.warn('[DOCX] Image fetch failed:', url.slice(-40), e.message);
    return null;
  }
}

async function fetchAllImages() {
  const buffers = {};
  await Promise.all(Object.entries(IMAGE_URLS).map(async ([key, url]) => {
    buffers[key] = await fetchImageBuffer(url);
  }));
  return buffers;
}

async function generateQRCode(url) {
  try {
    return await QRCode.toBuffer(url, { width: 160, margin: 1 });
  } catch (e) {
    console.warn('[DOCX] QR code generation failed:', e.message);
    return null;
  }
}

// ─── SCORE HELPERS ────────────────────────────────────────────────────────────
function scoreColor(v) {
  if (v === null || v === undefined) return AMBER;
  return v >= 65 ? GREEN : v >= 35 ? AMBER : RED;
}
function scoreBg(v) {
  if (v === null || v === undefined) return AMBER_LIGHT;
  return v >= 65 ? GREEN_LIGHT : v >= 35 ? AMBER_LIGHT : RED_LIGHT;
}
function scoreLabel(v) {
  if (v === null || v === undefined) return 'N/A';
  return v >= 65 ? 'Good' : v >= 35 ? 'Needs Work' : 'Critical';
}

// ─── BASE ELEMENT BUILDERS ────────────────────────────────────────────────────
function pageBreak() { return new Paragraph({ children: [new PageBreak()] }); }
function spacer(pt = 8) { return new Paragraph({ spacing: { before: 0, after: pt * 20 }, children: [] }); }

// PT Sans Narrow green section heading (16pt)
function sectionHeading(text) {
  return new Paragraph({
    spacing: { before: 360, after: 140 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GREEN, space: 4 } },
    children: [new TextRun({ text, bold: true, size: SZ_SECTION, color: GREEN, font: F_HEADING })],
  });
}

// Barlow navy sub-heading (used for "What do people see...")
function barlowHeading(text, size = SZ_WHAT_DO, color = DARK_NAVY) {
  return new Paragraph({
    spacing: { before: 300, after: 120 },
    children: [new TextRun({ text, bold: true, size, color, font: F_BARLOW })],
  });
}

// PT Sans Narrow green sub-heading (e.g. "Your Website:", "Your Website Traffic Snapshot")
function greenSubHeading(text, size = SZ_SECTION) {
  return new Paragraph({
    spacing: { before: 240, after: 100 },
    children: [new TextRun({ text, bold: true, size, color: GREEN, font: F_HEADING })],
  });
}

// Step heading (Step 1:, Step 2: etc.) — 13pt bold black, with space after
function stepHeading(text) {
  return new Paragraph({
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true, size: SZ_SUBHEAD, color: BLACK, font: F_BODY })],
  });
}

// Standard dark sub-heading (used within sections for labels like "GBP Checklist")
function subHeading(text) {
  return new Paragraph({
    spacing: { before: 220, after: 100 },
    children: [new TextRun({ text, bold: true, size: 24, color: BLACK, font: F_BODY })],
  });
}

// Body text — black, 11pt
function body(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 80, line: 288 },
    children: [new TextRun({
      text,
      size: SZ_BODY,
      color: opts.color || BLACK,
      font: opts.font || F_BODY,
      bold: opts.bold || false,
      italics: opts.italic || false,
    })],
  });
}

function note(text) { return body(text, { italic: true, color: MUTED }); }

// Bullet item
function bullet(text, bold = false) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { before: 50, after: 50 },
    children: [new TextRun({ text, size: SZ_BULLET, font: F_BODY, color: BLACK, bold })],
  });
}

// Numbered list item
function numbered(text, bold = false) {
  return new Paragraph({
    numbering: { reference: 'numbers', level: 0 },
    spacing: { before: 50, after: 50 },
    children: [new TextRun({ text, size: SZ_BULLET, font: F_BODY, color: BLACK, bold })],
  });
}

// Centered image — wPx/hPx in pixels; keepTogether wraps in a single-cell table to prevent page splits
function centeredImage(buffer, wPx, hPx, type = 'png', keepTogether = false) {
  if (!buffer) return spacer(4);
  const para = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 100 },
    children: [new ImageRun({ data: buffer, transformation: { width: wPx, height: hPx }, type })],
  });
  if (!keepTogether) return para;
  // Wrap in table to keep image + caption together across page breaks
  const none = { style: BorderStyle.NONE, size: 0, color: WHITE };
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: none, bottom: none, left: none, right: none },
      children: [para],
    })] })],
  });
}

// ─── STYLED BLOCKS ────────────────────────────────────────────────────────────
function cardBlock(children, bgFill = GREEN_LIGHT, borderColor = GREEN) {
  const b = { style: BorderStyle.SINGLE, size: 6, color: borderColor };
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: b, bottom: b, left: b, right: b },
      shading: { fill: bgFill, type: ShadingType.CLEAR },
      margins: { top: 160, bottom: 160, left: 220, right: 220 },
      children,
    })] })],
  });
}

function accentCallout(children) {
  const none = { style: BorderStyle.NONE, size: 0, color: WHITE };
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: none, bottom: none, right: none, left: { style: BorderStyle.SINGLE, size: 24, color: GREEN } },
      shading: { fill: GREEN_LIGHT, type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 200, right: 200 },
      children,
    })] })],
  });
}

// ─── METRIC CARD GRID ─────────────────────────────────────────────────────────
function metricGrid(metrics) {
  const n = metrics.length;
  const colW = Math.floor(CONTENT_W / n);
  const lastW = CONTENT_W - colW * (n - 1);

  const cells = metrics.map((m, i) => {
    const color = m.color || scoreColor(m.raw);
    const bg    = m.bg    || scoreBg(m.raw);
    return new TableCell({
      width: { size: i < n - 1 ? colW : lastW, type: WidthType.DXA },
      borders: {
        top:    { style: BorderStyle.SINGLE, size: 12, color },
        bottom: { style: BorderStyle.SINGLE, size: 4,  color: BORDER_C },
        left:   { style: BorderStyle.SINGLE, size: 4,  color: BORDER_C },
        right:  { style: BorderStyle.SINGLE, size: 4,  color: BORDER_C },
      },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 140, bottom: 140, left: 160, right: 160 },
      children: [
        new Paragraph({ spacing: { before: 0, after: 40 }, children: [new TextRun({ text: m.label, size: SZ_METRIC_LABEL, font: F_BODY, color: MUTED, bold: true })] }),
        new Paragraph({ spacing: { before: 0, after: 40 }, children: [new TextRun({ text: String(m.value ?? 'N/A'), size: SZ_METRIC_VAL, font: F_BODY, bold: true, color })] }),
        m.sub     ? new Paragraph({ spacing: { before: 0, after: 40 }, children: [new TextRun({ text: m.sub,     size: SZ_METRIC_LABEL, font: F_BODY, color: MUTED, bold: true })] }) : null,
        m.explain ? new Paragraph({ spacing: { before: 40, after: 0  }, children: [new TextRun({ text: m.explain, size: SZ_NOTE,         font: F_BODY, color: BLACK, italics: true })] }) : null,
      ].filter(Boolean),
    });
  });

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [...metrics.slice(0, -1).map(() => colW), lastW],
    rows: [new TableRow({ children: cells })],
  });
}

// ─── DATA TABLE ───────────────────────────────────────────────────────────────
function dataTable(rows) {
  const none   = { style: BorderStyle.NONE, size: 0, color: WHITE };
  const bottom = { style: BorderStyle.SINGLE, size: 4, color: BORDER_C };
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [6200, 3880],
    rows: rows.map((r, i) => {
      const isLast = i === rows.length - 1;
      const bords = { top: none, left: none, right: none, bottom: isLast ? none : bottom };
      return new TableRow({ children: [
        new TableCell({
          borders: bords, width: { size: 6200, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 60, right: 60 },
          children: [
            new Paragraph({ children: [new TextRun({ text: r.label, size: SZ_BODY, font: F_BODY, color: BLACK })] }),
            r.explain ? new Paragraph({ children: [new TextRun({ text: r.explain, size: SZ_NOTE, font: F_BODY, color: MUTED, italics: true })] }) : null,
          ].filter(Boolean),
        }),
        new TableCell({
          borders: bords, width: { size: 3880, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 60, right: 60 },
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: String(r.value ?? 'N/A'), size: SZ_BODY, font: F_BODY, bold: true, color: r.color || BLACK })] })],
        }),
      ]});
    }),
  });
}

// ─── KEYWORD TABLE ────────────────────────────────────────────────────────────
function keywordTable(keywords) {
  const ranked = (keywords || []).filter(k => k.position && k.position > 0);
  if (ranked.length === 0) {
    return cardBlock([body('No keyword ranking data found. This typically means the domain has low SEO presence — a key area MMW addresses.', { italic: true })], AMBER_LIGHT, AMBER);
  }
  const colWidths = [5560, 2120, 2400];
  const hdrB  = { style: BorderStyle.SINGLE, size: 4, color: GREEN };
  const cellB = { style: BorderStyle.SINGLE, size: 4, color: BORDER_C };
  const hBords  = { top: hdrB,  bottom: hdrB,  left: hdrB,  right: hdrB  };
  const cBords  = { top: cellB, bottom: cellB, left: cellB, right: cellB };

  const headerRow = new TableRow({
    tableHeader: true,
    children: ['Keyword', 'Position', 'Search Volume/mo'].map((h, i) =>
      new TableCell({
        borders: hBords, width: { size: colWidths[i], type: WidthType.DXA },
        shading: { fill: DARK_NAVY, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, size: 19, bold: true, font: F_BODY, color: WHITE })] })],
      })
    ),
  });

  const dataRows = ranked.slice(0, 15).map(kw => {
    const pos = kw.position;
    const posColor = pos <= 3 ? GREEN : pos <= 10 ? AMBER : RED;
    const posBg    = pos <= 3 ? GREEN_LIGHT : pos <= 10 ? AMBER_LIGHT : RED_LIGHT;
    return new TableRow({ children: [
      new TableCell({ borders: cBords, width: { size: colWidths[0], type: WidthType.DXA }, margins: { top: 70, bottom: 70, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: kw.keyword || '', size: SZ_BODY, font: F_BODY, color: BLACK })] })] }),
      new TableCell({ borders: cBords, width: { size: colWidths[1], type: WidthType.DXA }, shading: { fill: posBg, type: ShadingType.CLEAR }, margins: { top: 70, bottom: 70, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `#${pos}`, size: 22, font: F_BODY, bold: true, color: posColor })] })] }),
      new TableCell({ borders: cBords, width: { size: colWidths[2], type: WidthType.DXA }, margins: { top: 70, bottom: 70, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: kw.searchVolume ? kw.searchVolume.toLocaleString() : '—', size: SZ_BODY, font: F_BODY, color: BLACK })] })] }),
    ]});
  });

  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: colWidths, rows: [headerRow, ...dataRows] });
}

// ─── DIRECTORY GRID ───────────────────────────────────────────────────────────
function directoryGrid(allDirs) {
  if (!allDirs || allDirs.length === 0) return body('No directory data available.', { italic: true });
  const colW  = Math.floor(CONTENT_W / 3);
  const lastW = CONTENT_W - colW * 2;
  const b = { style: BorderStyle.SINGLE, size: 4, color: BORDER_C };
  const borders = { top: b, bottom: b, left: b, right: b };
  const rows = [];
  for (let i = 0; i < Math.min(allDirs.length, 30); i += 3) {
    const cells = [0, 1, 2].map(j => {
      const dir   = allDirs[i + j];
      const name  = dir ? (dir.directory || dir.name || 'Directory') : '';
      const found = dir ? dir.found : false;
      return new TableCell({
        borders,
        width: { size: j < 2 ? colW : lastW, type: WidthType.DXA },
        shading: { fill: !dir ? WHITE : found ? GREEN_LIGHT : RED_LIGHT, type: ShadingType.CLEAR },
        margins: { top: 70, bottom: 70, left: 100, right: 100 },
        children: dir ? [new Paragraph({ children: [
          new TextRun({ text: found ? '✓  ' : '✗  ', size: SZ_BODY, bold: true, font: F_BODY, color: found ? GREEN : RED }),
          new TextRun({ text: name, size: SZ_BODY, font: F_BODY, color: found ? BLACK : RED }),
        ]})] : [new Paragraph({ children: [] })],
      });
    });
    rows.push(new TableRow({ children: cells }));
  }
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [colW, colW, lastW], rows });
}

// ─── OPPORTUNITY / DIAGNOSTIC CARDS ──────────────────────────────────────────
const AUDIT_EXPLANATIONS = {
  'reduce unused javascript':                  'Unused JavaScript slows page load. Removing it can significantly improve your speed score and time-to-interactive.',
  'properly size images':                      'Oversized images are a top cause of slow websites. Right-sizing them can cut load time by seconds on mobile.',
  'eliminate render-blocking resources':       'Scripts and stylesheets that load before page content delay first paint — hurting both speed and search rankings.',
  'serve images in next-gen formats':          'Modern formats like WebP are 25–34% smaller than JPEG/PNG, giving visitors faster load times at equal quality.',
  'reduce unused css':                         'CSS files your page doesn\'t use still get downloaded by every visitor, unnecessarily slowing the experience.',
  'enable text compression':                   'Compressing text files before sending can reduce transfer size by up to 70%, speeding up load time noticeably.',
  'minify javascript':                         'Removing whitespace and comments from code files reduces their size without changing functionality.',
  'minify css':                                'Minified CSS loads faster without affecting how your site looks to visitors.',
  'avoid enormous network payloads':           'Large page sizes slow down mobile users especially. Lean pages improve experience for all patients.',
  'efficient cache policy':                    'Without browser caching, every visitor re-downloads everything. Caching stores files locally for faster return visits.',
  'ensure text remains visible':               'Using font-display ensures text is always readable while custom fonts are loading in the background.',
  'image elements do not have explicit width': 'Without set dimensions, images cause "layout shift" — the page jumps as images load, hurting Google\'s CLS score.',
  'links do not have a discernible name':      'Unnamed links hurt accessibility and SEO. Descriptive link text helps both screen readers and search engines.',
  'document does not have a meta description': 'Missing meta descriptions mean Google auto-generates them — often poorly. A strong description improves click-through from search.',
  'page has no title':                         'The page title is the single most important on-page SEO element. Without it Google cannot properly rank the page.',
  'buttons do not have an accessible name':    'Buttons without labels are invisible to screen readers and damage your accessibility score.',
};

function opportunityCards(items, type = 'opportunity') {
  if (!items || items.length === 0) return spacer(4);
  const accentColor = type === 'opportunity' ? AMBER : RED;
  const bgColor     = type === 'opportunity' ? AMBER_LIGHT : RED_LIGHT;
  const none  = { style: BorderStyle.NONE, size: 0, color: WHITE };
  const cellB = { style: BorderStyle.SINGLE, size: 4, color: GRAY_MID };

  const rows = items.slice(0, 8).map(item => {
    const titleLower = (item.title || '').toLowerCase();
    const explanation = Object.entries(AUDIT_EXPLANATIONS).find(([k]) => titleLower.includes(k))?.[1] || null;
    return new TableRow({ children: [
      new TableCell({
        width: { size: 100, type: WidthType.DXA },
        borders: { top: none, bottom: none, left: none, right: none },
        shading: { fill: accentColor, type: ShadingType.CLEAR },
        children: [new Paragraph({ children: [] })],
      }),
      new TableCell({
        width: { size: CONTENT_W - 100, type: WidthType.DXA },
        borders: { top: none, left: none, right: { style: BorderStyle.SINGLE, size: 4, color: BORDER_C }, bottom: cellB },
        shading: { fill: bgColor, type: ShadingType.CLEAR },
        margins: { top: 100, bottom: 100, left: 180, right: 160 },
        children: [
          new Paragraph({ children: [
            new TextRun({ text: item.title || '', size: SZ_BODY, bold: true, font: F_BODY, color: BLACK }),
            item.savings ? new TextRun({ text: `  —  ${item.savings}`, size: 20, font: F_BODY, color: accentColor }) : new TextRun({ text: '' }),
          ]}),
          explanation ? new Paragraph({ spacing: { before: 40, after: 0 }, children: [new TextRun({ text: explanation, size: SZ_NOTE, font: F_BODY, color: BLACK, italics: true })] }) : null,
        ].filter(Boolean),
      }),
    ]});
  });

  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [100, CONTENT_W - 100], rows });
}

// ─── AI QUERY CARDS (keep-together via single-cell table) ─────────────────────
function aiQueryCards(queries) {
  if (!queries || queries.length === 0) return [body('AI visibility data not available.', { italic: true })];
  return queries.map(q => {
    const appears    = q.appears || false;
    const sideColor  = appears ? GREEN : RED;
    const none       = { style: BorderStyle.NONE, size: 0, color: WHITE };
    // Outer keep-together wrapper
    return new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [CONTENT_W],
      rows: [new TableRow({ children: [new TableCell({
        borders: none,
        margins: { top: 0, bottom: 80, left: 0, right: 0 },
        children: [
          // Inner styled card
          new Table({
            width: { size: CONTENT_W, type: WidthType.DXA },
            columnWidths: [CONTENT_W],
            rows: [new TableRow({ children: [new TableCell({
              borders: {
                top:    { style: BorderStyle.SINGLE, size: 4,  color: BORDER_C },
                bottom: { style: BorderStyle.SINGLE, size: 4,  color: BORDER_C },
                right:  { style: BorderStyle.SINGLE, size: 4,  color: BORDER_C },
                left:   { style: BorderStyle.SINGLE, size: 24, color: sideColor },
              },
              shading: { fill: GRAY, type: ShadingType.CLEAR },
              margins: { top: 140, bottom: 140, left: 200, right: 200 },
              children: [
                new Paragraph({ spacing: { before: 0, after: 60 }, children: [new TextRun({ text: `Query: "${q.q || q.query || ''}"`, size: 19, bold: true, font: F_BODY, color: MUTED })] }),
                new Paragraph({ spacing: { before: 0, after: 80 }, children: [new TextRun({ text: q.result || q.response || '', size: SZ_BODY, font: F_BODY, color: BLACK })] }),
                new Paragraph({ spacing: { before: 0, after: 0  }, children: [new TextRun({ text: appears ? '✓  Business appears in results' : '✗  Business does NOT appear in results', size: 20, bold: true, font: F_BODY, color: sideColor })] }),
              ],
            })] })],
          }),
        ],
      })] })],
    });
  });
}

// ─── MAIN GENERATE ────────────────────────────────────────────────────────────
async function generateReport(data) {
  const p        = data.places || {};
  const we       = data.websiteExtract || {};
  const ps       = data.pagespeed || {};
  const al       = data.adviceLocal?.report?.data || {};
  const ov       = al.overview?.baselineOverview || {};
  const baseline = al.data?.baseline || {};
  const dfs      = data.dataForSeo || {};
  const ai       = data.aiVisibility || {};
  const rec      = data.recommendation || {};
  const wa       = data.websiteAudit || {};

  const businessName = data.businessName || 'Your Practice';
  const cityState    = [p.city, p.state].filter(Boolean).join(', ');
  const specialty    = we.specialty || '';
  const website      = p.website || '';
  const date         = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const vis       = ov.visibilityScore ?? null;
  const nap       = ov.napScore ?? null;
  const reviews   = p.reviewCount ?? 0;
  const rating    = p.rating ?? null;
  const mobile    = ps.mobile?.performanceScore ?? null;
  const desktop   = ps.desktop?.performanceScore ?? null;
  const bl        = dfs.backlinks || {};
  const dirsFound = ov.directoriesFound ?? 0;
  const dirsTotal = ov.directoriesTotal ?? 27;
  const keywords  = dfs.keywords || [];
  const targetKws = dfs.targetKeywords || [];
  const allKws    = [...targetKws, ...keywords.filter(k => !k.isTarget)];
  const p1kws     = allKws.filter(k => k.isPage1).length;
  const allDirs   = [...(baseline.locals || []), ...(baseline.directories || [])];
  const etv       = dfs.domainOverview?.etv ?? 0;
  const estMonthly = etv > 0 ? Math.round(etv * 12) : null;

  console.log('[DOCX] Fetching images & generating QR code...');
  const [imgs, qrBuffer] = await Promise.all([
    fetchAllImages(),
    generateQRCode('https://medmarketingwhiz.com/meet-with-lori'),
  ]);
  console.log('[DOCX] Building document...');

  // ── PATIENT JOURNEY ───────────────────────────────────────────────────────
  const journeySection = [
    sectionHeading('How Patients Are Choosing Providers in the AI Era:'),
    body('In today\'s digitally connected world, the way patients find and choose a wellness or aesthetics provider has changed dramatically. It\'s no longer just about having a degree or being a great clinician — it\'s about how you show up online, both on Google and in AI searches like ChatGPT.'),
    spacer(6),
    stepHeading('Step 1: Word-of-Mouth & Community Recommendations'),
    body('Patients often begin their journey through conversations. They may be talking about their symptoms or wellness goals with friends and family, sparking a conversation. They also may reach out to friends or family who they consider healthy or look great for their age. If they are new to the area, they often turn to social media to ask for recommendations in Facebook groups or on Instagram. They may also get a referral from their primary care physician, personal trainer, or another service professional they trust.'),
    spacer(4),
    stepHeading('Step 2: Online Research & Reviews'),
    body('The next part of the patient research process is online research. They may turn to Google or ChatGPT to research symptoms or treatment options. Even if patients get a referral from a healthcare provider, 92% of them will go online to validate that recommendation and do their own research. Before a patient will even consider calling you or booking an online appointment, they want to validate that you are the right choice. They read your online reviews, look for red flags, visit your website, and seek social proof.'),
    spacer(4),
    stepHeading('Step 3: Comparison Shopping'),
    body('Patients will typically compare the top 3–4 providers before deciding to schedule a consultation. This is especially true for elective services like hormone therapy, weight loss, women\'s health, and aesthetics. This research phase can span weeks or even months. Patients look at websites, scroll through social media, and watch YouTube videos to learn more about you and your competitors.'),
    spacer(4),
    stepHeading('Step 4: Seeking Expertise'),
    body('Here\'s the truth: these patients probably already have a doctor that they\'ve gone to for years. But they\'re still searching because they\'re not being heard — or helped. They\'re looking for someone who specializes in their exact symptoms and who has the credentials and experience to fix the problem.'),
    spacer(4),
    body('By understanding this journey, we can tailor your digital strategy to position you as the clear and confident choice.'),
    spacer(8),
    centeredImage(imgs.patient_journey, IMG_W, Math.round(IMG_W * 0.59), 'png'),
    spacer(8),
    body('In the evolving landscape of healthcare marketing, transforming a stranger into a patient is a deliberate and nuanced process, underscoring the necessity of a comprehensive marketing strategy. Recognizing this, Medical Marketing Whiz meticulously crafted our marketing programs to guide this entire patient journey.'),
    spacer(4),
    body('It begins with the first crucial step of turning strangers into online visitors, capturing their attention through our strategic online presence. From there, these visitors evolve into leads, having expressed an initial interest in your services.'),
    spacer(4),
    body('But our job doesn\'t stop there; through targeted engagement and personalized communication, we nurture these leads, gently guiding them towards becoming your patients. And the journey continues even after they\'ve received your care, as we empower patients to become promoters of your services, sharing their positive experiences with others. This seamless transition from stranger to online visitor, to lead, to patient, and finally to promoter is the core of our programs. By covering each aspect of the patient journey, we ensure no step is overlooked, making the pathway to patient acquisition and retention as effective and efficient as possible.'),
  ];

  // ── WEBSITE ───────────────────────────────────────────────────────────────
  const websiteSection = [
    barlowHeading('What do people see when they research you?', SZ_WHAT_DO, DARK_NAVY),
    greenSubHeading(website ? `Your Website:  ${website}` : 'Your Website:', SZ_SECTION),
    body('Your website is often your first impression — and it\'s either building trust or losing it.'),
    body('Studies show that 75% of visitors will leave a website if it lacks credibility or clarity. That\'s why your website must do three things immediately:'),
    spacer(4),
    numbered('Establish your expertise as the #1 go-to provider in your area'),
    numbered('Build trust through "social proof and credibility"'),
    numbered('Guide visitors to a clear call to action'),
    spacer(4),
    body('Adding photos of you, showcasing credentials, patient testimonials, and making it easy to book — these are non-negotiables.'),
    spacer(8),

    subHeading('Website Conversion & Social Proof Checklist:'),
    bullet('Is your site built in WordPress?'),
    bullet('Are there dedicated pages for your key services?'),
    bullet('Are real photos used (you, your team, your space)?'),
    bullet('Do you feature award logos, board certifications, or recognitions on the homepage?'),
    bullet('Are Google reviews integrated?'),
    bullet('Is the site mobile-responsive?'),
    bullet('Are SEO elements in place (H1s, meta descriptions, etc.)?'),
    spacer(12),

    greenSubHeading('Your Website Traffic Snapshot', SZ_SECTION),
    body('Estimated monthly organic traffic is based on your current keyword rankings and their associated search volumes. This is search-driven traffic — the kind MMW directly improves.'),
    spacer(6),
    metricGrid([
      { label: 'Est. Monthly Organic Traffic', value: estMonthly ? `~${estMonthly.toLocaleString()}` : 'Minimal', sub: estMonthly ? 'organic visits/mo' : 'Low organic presence', raw: estMonthly ? (estMonthly > 500 ? 75 : estMonthly > 100 ? 45 : 20) : 10, explain: 'Based on keyword rankings and search volume. Higher traffic = more patients finding you without ads.' },
      { label: 'Page 1 Keywords', value: p1kws, sub: 'in Google top 10', raw: p1kws >= 5 ? 75 : p1kws >= 1 ? 45 : 10, explain: 'Keywords where your site appears on the first page of Google. Page 1 captures 95% of all search clicks.' },
      { label: 'Domain Rank', value: bl.domainRank ?? 'N/A', sub: 'authority score', raw: bl.domainRank, explain: 'Your website\'s overall authority score. Higher scores help you outrank competitors for the same keywords.' },
    ]),
    spacer(12),

    greenSubHeading('Website Speed and Technical SEO:', SZ_SECTION),
    body('Google uses page speed as a direct ranking factor. A slow website loses patients before they ever read your first sentence.'),
    spacer(6),
    metricGrid([
      { label: 'Mobile Performance', value: mobile !== null ? `${mobile}/100` : 'N/A', sub: mobile === null ? 'N/A' : mobile < 50 ? 'Critical' : mobile < 70 ? 'Needs Work' : 'Good', raw: mobile, explain: 'Google\'s score for how fast your site loads on mobile. Below 50 can directly hurt your search rankings.' },
      { label: 'Desktop Performance', value: desktop !== null ? `${desktop}/100` : 'N/A', sub: desktop === null ? 'N/A' : desktop < 50 ? 'Critical' : desktop < 70 ? 'Needs Work' : 'Good', raw: desktop, explain: 'Your speed score on desktop computers. Both mobile and desktop affect where you appear in Google.' },
      { label: 'Page Size', value: ps.mobile?.pageSize || 'N/A', sub: 'total page weight', raw: null, explain: 'The heavier the page, the slower it loads. Aim to keep page size below 3 MB for optimal performance.' },
    ]),
    spacer(8),
    metricGrid([
      { label: 'Largest Contentful Paint', value: ps.mobile?.lcp || 'N/A', sub: 'time to main content', raw: ps.mobile?.lcp ? (parseFloat(ps.mobile.lcp) <= 2.5 ? 75 : parseFloat(ps.mobile.lcp) <= 4 ? 45 : 20) : null, explain: 'How long before the biggest element on your page appears. Google flags anything over 2.5s as a poor experience.' },
      { label: 'Total Blocking Time', value: ps.mobile?.tbt || 'N/A', sub: 'interactivity delay', raw: ps.mobile?.tbt ? (parseInt(ps.mobile.tbt) <= 200 ? 75 : parseInt(ps.mobile.tbt) <= 600 ? 45 : 20) : null, explain: 'Time visitors wait before they can interact with your page. High blocking time frustrates potential patients.' },
      { label: 'Layout Shift (CLS)', value: ps.mobile?.cls || 'N/A', sub: 'visual stability', raw: ps.mobile?.cls ? (parseFloat(ps.mobile.cls) <= 0.1 ? 75 : parseFloat(ps.mobile.cls) <= 0.25 ? 45 : 20) : null, explain: 'Measures whether elements jump as the page loads. Google penalizes sites that shift unexpectedly.' },
    ]),
    spacer(8),
    metricGrid([
      { label: 'Passing Audits', value: ps.mobile?.passingAudits ?? 'N/A', sub: 'technical checks passed', raw: (ps.mobile?.passingAudits || 0) > 30 ? 75 : (ps.mobile?.passingAudits || 0) > 20 ? 45 : 20, explain: 'Google Lighthouse checks your site is currently passing. Each is a specific technical best practice.' },
      { label: 'Failing Audits', value: ps.mobile?.failingAudits ?? 'N/A', sub: 'need to be fixed', raw: (ps.mobile?.failingAudits || 0) < 5 ? 75 : (ps.mobile?.failingAudits || 0) < 10 ? 45 : 20, explain: 'The number of Google technical checks your site is failing. Each failed audit is a specific fixable issue.' },
      { label: 'Page Requests', value: ps.mobile?.requests ?? 'N/A', sub: 'files loaded per visit', raw: null, explain: 'Every image, script, and font is a separate request. Fewer requests = faster load times.' },
    ]),
    spacer(12),

    subHeading('Top Optimization Opportunities:'),
    body('These are the highest-impact speed improvements available — each represents real time savings for your patients.'),
    spacer(6),
    ps.mobile?.opportunities?.length > 0 ? opportunityCards(ps.mobile.opportunities, 'opportunity') : body('No major optimization opportunities detected.', { italic: true }),
    spacer(10),

    subHeading('Diagnostics & Failed Audits:'),
    body('These are specific technical issues Google has flagged on your website. Each one impacts your search ranking and patient experience.'),
    spacer(6),
    ps.mobile?.diagnostics?.length > 0 ? opportunityCards(ps.mobile.diagnostics, 'diagnostic') : body('No major diagnostic issues detected.', { italic: true }),
  ];

  // ── SEO DEEP DIVE ─────────────────────────────────────────────────────────
  const seoSection = [
    sectionHeading('Website SEO Deep Dive: Unlocking Your Website\'s Full Potential'),
    body('Have you ever wondered why your website isn\'t reaching its full potential, despite consistent efforts in SEO? Often, the barriers to high search rankings and strong online visibility lie hidden within the complex backend of your website.'),
    spacer(4),
    body('Fortunately, a comprehensive SEO audit can uncover these hidden roadblocks, enabling transformative improvements to your digital presence. An effective SEO audit isn\'t just a routine check — it\'s the catalyst that propels your business toward greater search visibility, higher rankings, and substantial online growth.'),
    spacer(4),
    body('This is where transformation begins!', { bold: true }),
    spacer(10),

    subHeading('📌 What Exactly is an SEO Audit?'),
    body('An SEO audit is essentially a deep diagnostic evaluation of your website\'s overall performance and optimization. Think of it like a thorough check-up on your car: it identifies hidden technical issues, evaluates structural health, assesses content quality, and uncovers reasons why your website isn\'t ranking as highly as it should.'),
    spacer(4),
    body('The primary objective of an SEO audit is to pinpoint specific, actionable improvements that will immediately enhance your search engine visibility and client experience.'),
    spacer(4),
    body('For example, if you operate a functional medicine clinic, integrative wellness center, concierge practice, medical spa, aesthetics office, or women\'s health-focused business and find that your website rarely appears on Google when prospective clients search for your services, an SEO audit will reveal exactly why — and provide a clear roadmap to fix it.'),
    spacer(4),
    body('Regular SEO audits are essential to ensure your website keeps pace with ever-changing Google algorithms and industry best practices, helping you consistently outperform competitors and maintain high search rankings.'),
    spacer(10),

    subHeading('🛠️ What Does an SEO Audit Include?'),
    body('A thorough SEO audit involves a systematic approach, examining critical aspects of your website. Here\'s how our audit process unfolds using our advanced SEO tools:'),
    spacer(6),
    numbered('Keyword Research & Analysis — Identifying optimal keywords that your ideal clients use in search and evaluating the intent behind these keywords to craft targeted content strategies for attracting and converting more clients.'),
    numbered('Technical SEO Analysis — Website speed and mobile responsiveness, URL structure, XML sitemaps, meta tags, schema markup, and robots.txt files. Identifying technical issues hindering website crawlability and indexability by search engines.'),
    numbered('On-Page Optimization Evaluation — Examining title tags, meta descriptions, header structures (H1-H6), internal linking, image alt attributes, and overall navigation. Ensuring your site communicates its content clearly and effectively to both visitors and search engines.'),
    numbered('Content Quality & Engagement Assessment — Reviewing the uniqueness, relevance, keyword usage, and overall quality of your website content. Analyzing user-engagement metrics such as bounce rates and time spent on pages to understand how well your content resonates with visitors.'),
    numbered('Backlink Profile Analysis — Auditing your backlink profile to identify authoritative and beneficial backlinks, detecting and removing potentially harmful or spammy backlinks, and establishing a high-quality, authoritative link structure to boost your site\'s credibility and visibility in search results.'),
    spacer(4),
    body('This isn\'t just about technical improvements — it\'s about transforming your website into your most effective marketing asset.'),
    spacer(10),

    ...(wa.overallScore !== null && wa.overallScore !== undefined ? [
      subHeading('SEO Audit Category Scores:'),
      body('Your website was evaluated across five key dimensions. Each score reflects specific, actionable improvements MMW addresses in every program.'),
      spacer(6),
      metricGrid([
        { label: 'SEO Foundation', value: wa.seo?.score != null ? `${wa.seo.score}/100` : 'N/A', sub: scoreLabel(wa.seo?.score), raw: wa.seo?.score, explain: 'Title tags, meta descriptions, H1 usage, schema markup, and internal linking.' },
        { label: 'Content Quality', value: wa.content?.score != null ? `${wa.content.score}/100` : 'N/A', sub: scoreLabel(wa.content?.score), raw: wa.content?.score, explain: 'Service descriptions, educational content, blogs, and FAQ depth.' },
        { label: 'Trust & Credibility', value: wa.trust?.score != null ? `${wa.trust.score}/100` : 'N/A', sub: scoreLabel(wa.trust?.score), raw: wa.trust?.score, explain: 'Credentials, testimonials, before/after photos, awards, and team presence.' },
      ]),
      spacer(6),
      metricGrid([
        { label: 'Conversion', value: wa.conversion?.score != null ? `${wa.conversion.score}/100` : 'N/A', sub: scoreLabel(wa.conversion?.score), raw: wa.conversion?.score, explain: 'CTAs, online booking, phone visibility, contact forms, and urgency cues.' },
        { label: 'Service Coverage', value: wa.services?.score != null ? `${wa.services.score}/100` : 'N/A', sub: scoreLabel(wa.services?.score), raw: wa.services?.score, explain: 'Whether services have dedicated pages with enough content for Google to rank them individually.' },
        { label: 'Overall Score', value: wa.overallScore != null ? `${wa.overallScore}/100` : 'N/A', sub: scoreLabel(wa.overallScore), raw: wa.overallScore, explain: 'Combined score across all five audit categories.' },
      ]),
      spacer(10),
    ] : []),

    ...(wa.topFindings?.length > 0 ? [
      subHeading('SEO Top Findings:'),
      body('These are the highest-priority issues identified — the ones with the biggest impact on your search visibility and patient acquisition:'),
      spacer(6),
      cardBlock(
        wa.topFindings.map((f, i) => new Paragraph({
          spacing: { before: i === 0 ? 0 : 80, after: 0 },
          children: [
            new TextRun({ text: '▸  ', size: SZ_BODY, font: F_BODY, color: GREEN, bold: true }),
            new TextRun({ text: f, size: SZ_BODY, font: F_BODY, color: BLACK }),
          ],
        })),
        GREEN_LIGHT, GREEN
      ),
      spacer(10),
    ] : []),

    subHeading('Keyword Performance Overview:'),
    body('These metrics show how your website currently performs in organic Google search — the terms patients use to find providers like you.'),
    spacer(6),
    metricGrid([
      { label: 'Page 1 Rankings', value: p1kws, sub: 'keywords in top 10', raw: p1kws >= 5 ? 75 : p1kws >= 1 ? 45 : 10, explain: 'Page 1 is where 95% of search clicks happen. Every page 1 keyword is a potential patient.' },
      { label: 'Total Ranked Keywords', value: allKws.filter(k => k.position).length, sub: 'keywords with positions', raw: allKws.length >= 20 ? 75 : allKws.length >= 5 ? 45 : 20, explain: 'Total search terms your site ranks for organically across all positions.' },
      { label: 'Est. Traffic Value', value: etv > 0 ? '$' + etv.toFixed(2) + '/mo' : '$0.00', sub: 'equivalent ad spend', raw: etv > 50 ? 75 : etv > 10 ? 45 : 20, explain: 'What you\'d pay in Google Ads to get equivalent clicks. Shows the dollar value of your organic rankings.' },
    ]),
    spacer(10),

    subHeading('Top Keywords You Rank For:'),
    body('The search terms Google is currently showing your website for. Only keywords with confirmed rankings are displayed.'),
    spacer(6),
    keywordTable(allKws),
    spacer(12),

    subHeading('Backlink Profile:'),
    body('Backlinks are links from other websites pointing to yours — one of Google\'s most important ranking signals. They tell Google your site is trusted and authoritative.'),
    spacer(6),
    dataTable([
      { label: 'Total Backlinks', value: (bl.total || 0).toLocaleString(), color: (bl.total || 0) > 100 ? GREEN : (bl.total || 0) > 20 ? AMBER : RED, explain: 'Total links pointing to your site from across the web. More quality links = stronger authority.' },
      { label: 'Referring Domains', value: bl.referringDomains ?? 'N/A', color: (bl.referringDomains || 0) > 20 ? GREEN : (bl.referringDomains || 0) > 5 ? AMBER : RED, explain: 'Unique websites linking to you. Diversity of domains matters more than total link count.' },
      { label: 'Domain Rank', value: bl.domainRank ?? 'N/A', color: (bl.domainRank || 0) >= 30 ? GREEN : (bl.domainRank || 0) >= 10 ? AMBER : RED, explain: 'Overall authority score for your domain. Higher scores help you outrank competitors.' },
      { label: 'Spam Score', value: bl.spamScore !== undefined ? bl.spamScore + '%' : 'N/A', color: (bl.spamScore || 0) > 40 ? RED : (bl.spamScore || 0) > 20 ? AMBER : GREEN, explain: 'Percentage of backlinks considered low-quality. Should ideally stay below 20%.' },
    ]),
  ];

  // ── AI VISIBILITY ─────────────────────────────────────────────────────────
  const aiSection = [
    sectionHeading('AI & ChatGPT Search Analysis: The Future of Online Visibility'),
    centeredImage(imgs.seo_vs_aeo, IMG_W, Math.round(IMG_W * 0.54), 'png'),
    spacer(8),
    body('The way potential clients find and choose healthcare providers and medical aesthetics services is rapidly changing. Artificial intelligence (AI)-driven search tools such as ChatGPT and Google\'s own AI-powered search platform are dramatically reshaping online search behaviors. It\'s critical for your business to understand and optimize for these AI-driven platforms to remain competitive and visible in 2025 and beyond.'),
    spacer(8),
    subHeading('Why AI Searches (Like ChatGPT) Matter:'),
    body('AI-based search platforms aren\'t simply a passing trend — they represent a fundamental shift in how users find information online. Tools like ChatGPT deliver direct, concise answers instead of a long list of website results, which significantly impacts how prospective clients discover and select healthcare providers, wellness practices, medical spas, and aesthetics professionals.'),
    spacer(4),
    body('For instance, consider asking ChatGPT: "Who is the best medical spa for Botox in [your city]?" or "Which doctors in [your city] can help with hormone levels?" This direct approach is exactly how potential clients are already searching for your business.'),
    spacer(8),

    subHeading('AI Visibility Check — Simulated Search Results:'),
    body('We asked ChatGPT-style queries a real patient might use when searching for this type of provider in your area. Here\'s what AI search currently returns:'),
    spacer(6),
    ...aiQueryCards(ai.queries),

    spacer(6),
    ...(ai.reasons ? [
      subHeading('Why You Are Not Appearing in AI Results:'),
      accentCallout([body(ai.reasons)]),
      spacer(8),
    ] : []),

    greenSubHeading('Answer Engine Optimization (AEO): The New SEO', SZ_SECTION),
    body('In 2026, Answer Engine Optimization (AEO) is crucial in digital marketing. Unlike traditional SEO, which focuses on keywords and links, AEO prioritizes answering questions clearly, directly, and authoritatively — positioning you as the trusted answer AI platforms recommend.'),
    spacer(8),

    subHeading('Why AEO is Critical for Your 2026 Strategy:'),
    bullet('AI-powered searches (like ChatGPT and Google\'s AI Search) will soon eclipse traditional searches.'),
    bullet('Consumers want quick, clear, and credible answers from reliable providers.'),
    bullet('Providers optimized for AEO gain visibility and credibility by becoming the "recommended" go-to answer from AI platforms.'),
    spacer(8),

    subHeading('How Do You Optimize for Answer Engines?'),
    body('To dominate AI search results, your strategy must include:'),
    spacer(4),
    bullet('Clear, concise, and authoritative content: Short, informative answers, FAQs, and conversational content designed to directly answer questions.'),
    bullet('Structured data and schema markup: Helping AI platforms clearly interpret and utilize your content.'),
    bullet('Authority-building through media mentions, backlinks, press releases, and strong reputation management: AI platforms prioritize reputable, authoritative sources.'),
    spacer(8),

    subHeading('Google\'s Own AI Search: Keeping You Ahead'),
    body('Google\'s Search Generative Experience (SGE) now integrates AI, changing how search results are displayed — combining traditional website listings with quick-answer summaries and AI-generated responses. This shift demands a proactive strategy for your digital presence.'),
    spacer(4),
    body('In your marketing plan, we\'ll ensure you\'re prepared to thrive with:'),
    spacer(4),
    bullet('Regularly updated, authoritative content that clearly addresses common client questions and aligns with Google\'s AI-driven algorithm.'),
    bullet('Strong local SEO/AEO practices ensure your business is prominently visible in Google\'s new AI search experience.'),
    bullet('Continuous monitoring of your AI search visibility, with strategic adjustments as AI search continues evolving.'),
    spacer(6),
    body('Ready for the AI-Driven Future? Medical Marketing Whiz is proactive in optimizing your practice for AI-powered searches through AEO strategies, keeping your business ahead of competitors and dominating visibility in this new search landscape.'),
  ];

  // ── LOCAL & CITATIONS ─────────────────────────────────────────────────────
  const localSection = [
    centeredImage(imgs.what_drives_rankings, IMG_W, Math.round(IMG_W * 0.63), 'png'),
    spacer(8),
    sectionHeading('Are You Showing Up in the TOP 3 in Google Search?'),
    body('Now that we\'ve discussed the website, SEO, and AEO, we need to dive into how you get your website to rank on Google. According to Google\'s 2026 Ranking Factors, website content and on-page SEO is only 26% of what they look for.'),
    body('Ranking high in Google Maps is critical — 90% of clicks go to the top 3 listings.'),
    spacer(8),

    subHeading('Google\'s 2025 Ranking Factors:'),
    dataTable([
      { label: 'Google Business Profile optimization', value: '30%', color: GREEN },
      { label: 'On-Page SEO & Website Content', value: '26%', color: GREEN },
      { label: 'Link building, citations, and online mentions', value: '17%', color: AMBER },
      { label: 'Review quantity, quality, and frequency', value: '13%', color: AMBER },
      { label: 'Behavioral signals', value: '11%', color: MUTED },
      { label: 'Personalization', value: '3%', color: MUTED },
    ]),
    spacer(10),

    subHeading('Google Business Profile Report:'),
    dataTable([
      { label: 'GBP Claimed & Verified', value: p.placeId ? 'Yes ✓' : 'Not confirmed', color: p.placeId ? GREEN : RED },
      { label: 'Business Name', value: p.name || businessName, color: BLACK },
      { label: 'Address', value: p.formattedAddress || 'Not found', color: BLACK },
      { label: 'Phone Number', value: p.phone || 'Not found', color: p.phone ? BLACK : RED },
      { label: 'Website Listed on GBP', value: website || 'Not found', color: website ? BLACK : RED },
      { label: 'Business Status', value: p.businessStatus || 'Unknown', color: BLACK },
    ]),
    spacer(8),

    subHeading('Google Business Profile (GBP) Checklist:'),
    bullet('Is the GBP claimed and completed?'),
    bullet('Branded cover photo uploaded?'),
    bullet('Primary category correct?'),
    bullet('Weekly posts being published?'),
    bullet('Photos uploaded regularly?'),
    bullet('Social links connected?'),
    spacer(4),
    body('The goal is to get you into the top 3 organically so you don\'t have to pay Google a cent for ads! This is an ongoing effort and is a critical part of your SEO and AEO.'),
    spacer(12),

    sectionHeading('Online Reputation / Google Reviews'),
    body('Ninety-two percent of patients read reviews before choosing a healthcare or aesthetics provider. Does your online reputation need some attention?'),
    body('Goal: 100+ Google Reviews  |  4.8+ Star Rating  |  Ongoing Responses', { bold: true }),
    spacer(8),

    (() => {
      const both  = reviews >= 100 && rating >= 4.8;
      const ok    = reviews >= 30  || (rating && rating >= 4.0);
      const color = both ? GREEN : ok ? AMBER : RED;
      const bg    = both ? GREEN_LIGHT : ok ? AMBER_LIGHT : RED_LIGHT;
      const status = both ? '✓  Excellent — Meeting Goals' : ok ? '⚠  Developing — Needs Consistent Growth' : '✗  Critical — Immediate Action Needed';
      return cardBlock([
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 60 }, children: [
          new TextRun({ text: rating ? `${rating} ★` : '—', size: 72, bold: true, font: F_BODY, color }),
          new TextRun({ text: `   (${reviews} reviews)`, size: 36, font: F_BODY, color }),
        ]}),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [
          new TextRun({ text: status, size: 24, bold: true, font: F_BODY, color }),
        ]}),
      ], bg, color);
    })(),
    spacer(8),

    dataTable([
      { label: 'Total Google Reviews', value: reviews, color: reviews >= 100 ? GREEN : reviews >= 30 ? AMBER : RED, explain: 'Practices with 100+ reviews consistently outperform those with fewer in both trust and click-through.' },
      { label: 'Average Star Rating', value: rating ? rating + ' ★' : 'N/A', color: rating >= 4.8 ? GREEN : rating >= 4.0 ? AMBER : RED, explain: 'A 4.8+ rating is the benchmark. Even one unanswered bad review can deter potential patients.' },
      { label: 'Goal: Review Count', value: '100+ Google reviews', color: BLACK },
      { label: 'Goal: Star Rating', value: '4.8+ stars', color: BLACK },
    ]),
    spacer(4),
    bullet(`Over 100 Google reviews: ${reviews >= 100 ? 'Yes ✓' : `No — currently at ${reviews}`}`),
    bullet(`Over 4.8 star rating: ${rating && rating >= 4.8 ? 'Yes ✓' : `No — currently ${rating ?? 'unknown'}★`}`),
    bullet('Consistently getting new reviews: Verify in your GBP dashboard'),
    bullet('Responding to reviews: Verify in your GBP dashboard'),
    spacer(12),

    sectionHeading('Online Visibility: Citations & Directory Listings'),
    body('Your online presence needs to be consistent across the web — this builds authority and improves your search rankings.'),
    spacer(4),
    body('Online listings and citations are essential for Local SEO and online visibility because they serve as digital signposts that help potential patients find and verify a medical or aesthetic clinic. These listings can be found on a wide array of platforms, including Google Business Profile (most important!), Yahoo, Bing, Yelp, Healthgrades, Vitals, WebMD, RealSelf, DocSpot, and other online sources.'),
    spacer(4),
    body('Consistency and accuracy in online listings are crucial. Search engines like Google and AI platforms like ChatGPT use this information to validate the legitimacy of a business and its relevance to specific search queries. Inconsistent or outdated information can lead to confusion and negatively impact your local search rankings.'),
    spacer(8),

    metricGrid([
      { label: 'Visibility Score', value: vis !== null ? `${vis}%` : 'N/A', sub: scoreLabel(vis), raw: vis, explain: 'Overall local presence score across all scanned directories and platforms.' },
      { label: 'NAP Consistency', value: nap !== null ? `${nap}%` : 'N/A', sub: nap !== null && nap < 40 ? 'Critical' : nap !== null && nap < 70 ? 'Issues Found' : 'Consistent', raw: nap, explain: 'How accurately your Name, Address, and Phone appear across directories. Inconsistency hurts rankings.' },
      { label: 'Directories Found', value: `${dirsFound}/${dirsTotal}`, sub: `${dirsTotal - dirsFound} missing`, raw: dirsFound >= 20 ? 75 : dirsFound >= 10 ? 45 : 15, explain: 'Key business directories where your practice currently has a listing.' },
    ]),
    spacer(10),
    subHeading('Directory Presence:'),
    body('Green = found and listed correctly. Red = missing — directories where patients may be searching and not finding you.'),
    spacer(6),
    directoryGrid(allDirs),
    spacer(12),

    // ── SOCIAL MEDIA ─────────────────────────────────────────────────────────
    sectionHeading('Your Social Media:'),
    body('Did you know that 81% of businesses report an increase in website traffic with as little as six hours a week of social media marketing? 81% of patients consider a medical or aesthetic provider with an active online presence to be cutting-edge.'),
    spacer(4),
    body('Social media presents a huge opportunity for medical and aesthetic practices to market and target ideal patients. If you can create content that your patients want to share with friends and family, there is a high probability of converting those new eyes into patients.'),
    spacer(4),
    body('Your social media pages should be congruent with your branding and website, showcase your credentials and awards, the services you offer, and include personal content to engage your patients and grow your following. The mix of content should include both educational and personal posts.'),
    spacer(4),
    body('Social media is not about SELLING. It\'s about giving your followers a peek inside your practice so they get to know you and what you specialize in, and what they can expect from your office. You should be branding yourself as an expert. The general rule of thumb is 80% valuable/educational/personal content and only 20% or less on promotions or specials.'),
    spacer(4),
    body('The content should also drive traffic to your website, so be sure to include calls to action and links back to your website.'),
    spacer(12),

    // ── EMAIL MARKETING ───────────────────────────────────────────────────────
    sectionHeading('Email Marketing and SMS:'),
    body('Email continues to be one of the most effective marketing tactics that medical professionals can use. In fact, healthcare has the #2 open rate of any email that goes out (only religious organizations beat healthcare as far as open rates). Email marketing has higher conversion rates than both social + search combined. It is the key element in nurturing your new leads.'),
    spacer(4),
    body('Email marketing is a great way to educate clients every month and provide continuous communication about everything that they offer. Practices that excel at lead-nurturing generate 50% more sales-ready leads at a 33% lower cost!'),
    spacer(4),
    body('Email marketing is about educating your patients, raising awareness of services, building trust, and cultivating relationships. Remember the key rule of marketing: "tell your patients over and over what it is you do," and do not assume that they know just because there are brochures in your waiting room.'),
    spacer(4),
    body('One mistake we see people make is sending out "specials or promotions" via email. This attracts people who just want a sale or discount and can leave the impression that your services are simply low cost vs high value. Your emails should follow the 80-20 rule: 80% should be valuable content and only 20% promotional.'),
    spacer(4),
    body('How are you building your email list? You need to have a strategy to grow your list consistently because these leads you "own." You do not own your social media followers!'),
    spacer(12),

    // ── PATIENT EDUCATION EVENTS ──────────────────────────────────────────────
    sectionHeading('Patient Education Events'),
    body('Your marketing cannot stop with just digital tactics. In order to improve patient education and grow your high-revenue services, your marketing strategy should include a quarterly event or webinar. Examples include an open house event, partnering with support groups (i.e., breast cancer group or women\'s group), an online event/webinar, or getting involved with a local community event. These are all things to get your name out there at a minimal cost and position you as the expert.'),
    spacer(4),
    body('Getting people in the door to meet you, see your practice, and what you have to offer are some of the highest conversion rate activities that generate more appointments. We recommend doing an event at least quarterly and using your website, social media, email marketing, and Eventbrite to promote it. As your marketing experts, we help you to develop an event strategy and marketing plan.'),
    spacer(10),

    subHeading('Webinars'),
    body('Often, a webinar can be a great way to host an event without having to worry about all the stress that goes into planning an in-office event. Other times, a webinar may be a better choice if your topic is a sensitive one (vaginal health, ED, etc.). Medical Marketing Whiz specializes in lead-generating webinars that bring in highly qualified leads for your treatments automatically. Let us design, build, and host a high-converting webinar that generates a steady stream of new leads into your practice!'),
    spacer(10),

    subHeading('Podcasts'),
    body('In today\'s rapidly evolving digital landscape, doctors and other healthcare professionals should seriously consider incorporating podcasts into their marketing strategy. Podcasts are currently at the forefront of marketing trends, providing an invaluable platform to showcase your expertise and establish yourself as an industry authority.'),
    spacer(4),
    body('Podcasts have surged in popularity over recent years, attracting a diverse and engaged audience. This medium is a powerful tool for doctors to reach a wide range of potential patients and fellow professionals.'),
    spacer(4),
    bullet('Positioning as an Expert: Being a guest on a podcast allows you to share insights and address common health and wellness questions. By providing valuable, educational content, you can position yourself as a trusted expert in your field.', true),
    bullet('Building Authority: Being featured on popular podcast platforms like Apple Podcasts, Spotify, iHeartRadio, and Google Podcasts lends immediate credibility and authority.', true),
    bullet('Fostering Trust: Podcasts create a more personal connection with the audience. Listeners can get to know the doctor\'s personality and communication style, which goes a long way in building trust and rapport.', true),
    spacer(4),
    body('We can now get doctors featured on a popular healthcare podcast called "TopDocs Podcast" on Apple Podcasts, Spotify, and Google Podcasts. Being a guest on this podcast builds instant authority and serves as an amazing tool for patient education and practice revenue growth.'),
    spacer(4),
    body('Plus, we put out a press release that is guaranteed to be picked up on local and national affiliate sites of ABC, NBC, FOX, CBS, and dozens of radio station sites across the country, with more than 150 million unique monthly users.'),
  ];

  // ── HOW MMW IS DIFFERENT ──────────────────────────────────────────────────
  const mmwSection = [
    new Paragraph({
      spacing: { before: 300, after: 120 },
      children: [
        new TextRun({ text: '🌟 ', size: SZ_MMW_DIFF, font: F_BARLOW, color: 'D4A017' }),
        new TextRun({ text: 'How ', size: SZ_MMW_DIFF, bold: true, font: F_BARLOW, color: DARK_NAVY }),
        new TextRun({ text: 'Medical Marketing Whiz', size: SZ_MMW_DIFF, bold: true, font: F_BARLOW, color: GREEN }),
        new TextRun({ text: ' is Different ', size: SZ_MMW_DIFF, bold: true, font: F_BARLOW, color: DARK_NAVY }),
        new TextRun({ text: '🌟', size: SZ_MMW_DIFF, font: F_BARLOW, color: 'D4A017' }),
      ],
    }),
    centeredImage(imgs.account_manager, IMG_W, Math.round(IMG_W * 0.56), 'png'),
    spacer(8),
    body('Medical Marketing Whiz isn\'t just another marketing agency — our entire approach is specifically tailored to meet the distinct needs of specialized healthcare practices such as functional medicine, integrative wellness, concierge medicine, women\'s health, aesthetics, and medical spas.'),
    spacer(4),
    body('Our founder, Lori Werner, brings a uniquely analytical and deeply practical perspective to healthcare marketing. Her diverse professional background — which includes a mechanical engineering education and over 15 years in medical device and pharmaceutical sales — sets her apart in an industry often crowded with generic tactics.'),
    spacer(6),
    accentCallout([
      body('"I\'ve been in thousands of doctors\' offices and surgical procedures," Werner shares. "This experience helps me understand our clients\' day-to-day operations and what makes some offices more successful than others."', { italic: true }),
    ]),
    spacer(10),

    subHeading('A Strategic Advantage: Our Woman-Led Team'),
    body('At Medical Marketing Whiz, our predominantly female team is intentional, providing us with a unique strategic advantage. We recognize that women often act as the healthcare decision-makers in their families, carefully researching, reviewing, and choosing healthcare providers.'),
    spacer(4),
    accentCallout([body('"Women are often the healthcare decision-makers in their households," Werner explains. "They do their research, read reviews, and ask for recommendations."', { italic: true })]),
    spacer(6),
    body('Our female-led team deeply understands the nuanced questions, concerns, and priorities that drive healthcare decisions. Our marketing strategies resonate authentically with women, fostering trust and credibility through transparency, empathy, and education-focused content.'),
    spacer(10),

    subHeading('Our Proven Approach: Education, Trust & Visibility'),
    body('We don\'t rely on superficial appeals or generalized assumptions. Instead, we implement a highly effective, education-first strategy that involves:'),
    spacer(4),
    bullet('Optimizing your Google Business Profile and off-page SEO and AEO: Ensuring clients find you effortlessly online and perceive your practice as credible, trustworthy, and authoritative.', true),
    bullet('Professional Website Design: Building WordPress websites designed by experts, ensuring robust search engine visibility and immediate credibility.', true),
    bullet('Patient Education & Engagement: Utilizing email marketing, webinars, educational events, and authentic social media content that continually educates and engages current and potential clients.', true),
    spacer(6),
    accentCallout([body('"Patients want specialists with good reviews and testimonials. They value education and appreciate providers who share their knowledge and expertise."', { italic: true })]),
    spacer(10),

    subHeading('Why This Matters to You'),
    body('In today\'s competitive market, you must differentiate yourself by showcasing authenticity, building trust, and educating your audience — exactly what our specialized, women-led team excels at. We help you position your practice as the preferred choice, using a clear understanding of patient behavior and leveraging platforms like social media, podcasts, speaking engagements, and strategic partnerships to establish you as the local expert.'),
    spacer(4),
    body('Medical Marketing Whiz has also cultivated impactful collaborations with reputable organizations, such as TopDoctor Magazine, enhancing visibility and credibility for our clients nationwide.'),
    spacer(8),
    body('Ready to experience a different kind of marketing — one rooted in deep understanding, authenticity, and results-driven education?', { italic: true }),
    spacer(8),

    // Schedule call CTA with QR code
    ...(qrBuffer ? [
      new Table({
        width: { size: CONTENT_W, type: WidthType.DXA },
        columnWidths: [Math.floor(CONTENT_W * 0.7), Math.ceil(CONTENT_W * 0.3)],
        rows: [new TableRow({ children: [
          new TableCell({
            borders: { top: { style: BorderStyle.SINGLE, size: 6, color: GREEN }, bottom: { style: BorderStyle.SINGLE, size: 6, color: GREEN }, left: { style: BorderStyle.SINGLE, size: 6, color: GREEN }, right: { style: BorderStyle.NONE, size: 0, color: WHITE } },
            shading: { fill: GREEN_LIGHT, type: ShadingType.CLEAR },
            margins: { top: 160, bottom: 160, left: 200, right: 200 },
            children: [
              new Paragraph({ spacing: { before: 0, after: 80 }, children: [new TextRun({ text: '📅 Schedule Your Next Call with Lori Werner', size: 26, bold: true, font: F_BODY, color: GREEN })] }),
              new Paragraph({ spacing: { before: 0, after: 80 }, children: [new TextRun({ text: 'Scan the QR code or visit:', size: SZ_BODY, font: F_BODY, color: BLACK })] }),
              new Paragraph({ spacing: { before: 0, after: 0 }, children: [
                new ExternalHyperlink({ link: 'https://medmarketingwhiz.com/meet-with-lori', children: [
                  new TextRun({ text: 'medmarketingwhiz.com/meet-with-lori', size: SZ_BODY, font: F_BODY, color: GREEN, underline: { type: UnderlineType.SINGLE } }),
                ]}),
              ]}),
            ],
          }),
          new TableCell({
            borders: { top: { style: BorderStyle.SINGLE, size: 6, color: GREEN }, bottom: { style: BorderStyle.SINGLE, size: 6, color: GREEN }, left: { style: BorderStyle.NONE, size: 0, color: WHITE }, right: { style: BorderStyle.SINGLE, size: 6, color: GREEN } },
            shading: { fill: GREEN_LIGHT, type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 120, right: 120 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: qrBuffer, transformation: { width: 140, height: 140 }, type: 'png' })] })],
          }),
        ]})],
      }),
    ] : [
      new Paragraph({ spacing: { before: 0, after: 60 }, children: [
        new ExternalHyperlink({ link: 'https://medmarketingwhiz.com/meet-with-lori', children: [
          new TextRun({ text: '📅 Schedule Your Next Call with Lori Werner: medmarketingwhiz.com/meet-with-lori', size: SZ_BODY, font: F_BODY, color: GREEN, underline: { type: UnderlineType.SINGLE } }),
        ]}),
      ]}),
    ]),
    spacer(12),

    sectionHeading('Services Recommendation Based On The Data'),
    spacer(6),
    ...(rec.main_reason ? [
      cardBlock([
        new Paragraph({ spacing: { before: 0, after: 80 }, children: [new TextRun({ text: `Recommended Program: ${rec.recommended || 'Practice Pro'}`, size: 28, bold: true, font: F_BODY, color: GREEN })] }),
        new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: rec.main_reason, size: SZ_BODY, font: F_BODY, color: BLACK })] }),
      ], GREEN_LIGHT, GREEN),
    ] : []),
    spacer(12),
  ];

  // ── PROGRAMS ──────────────────────────────────────────────────────────────
  const programW = IMG_W;
  const programH = 349; // 3.63 inches × 96dpi = 349px

  const programSection = [
    sectionHeading('OUR MARKETING PROGRAMS'),
    body('As a reminder, we offer 3 core marketing programs. All of our programs are a 12-month commitment.'),
    spacer(6),
    subHeading('Who we love to work with:'),
    bullet('Doctors who want to attract high-quality patients and are trying to grow in-office procedures and/or cash services'),
    bullet('Doctors who want patients to know that their practice is #1 in their area, and they offer services that no one else does'),
    bullet('Practices that have the staff in place to ensure a great patient experience'),
    bullet('Doctors who are committed to their success and are willing to invest in marketing the right way'),
    bullet('Practices that are fun to deal with and eager to start now. Time is of the essence and space is limited. We only work with one office per specialty per area (usually 20 miles).'),
    spacer(6),
    subHeading('Who we are not a good fit for:'),
    bullet('People who are looking for a quick fix (there is no such thing). These tactics only work if you realize that in order to become the #1 provider in your area within 12 months or less, you need a multi-faceted marketing plan.'),
    bullet('Offices that are completely hands-off and think that marketing is "set it and forget it".'),
    bullet('Offices that don\'t have the staff in place to ensure a great patient experience.'),
    bullet('People who aren\'t ready to take action yet. Thinking you\'ll wait to invest in your marketing until you get more patients is like the cart before the horse.'),
    spacer(10),
    centeredImage(imgs.smart_start,  programW, programH, 'png'),
    spacer(8),
    centeredImage(imgs.practice_pro, programW, programH, 'png'),
    spacer(8),
    centeredImage(imgs.whiz_works,   programW, programH, 'png'),
    spacer(12),
    centeredImage(imgs.deal_breakers, programW, 350, 'png'),
    spacer(12),
  ];

  // ── SCOPE OF SERVICES (FULL — UNCUT) ─────────────────────────────────────
  const scopeSection = [
    sectionHeading('SCOPE OF SERVICES'),
    body('Below is a list of ALL of the various services that Medical Marketing Whiz offers. Please review these and we can provide a recommendation as to which program is best suited for you based on the marketing analysis report.'),
    spacer(8),

    subHeading('On-Page SEO'),
    bullet('Custom SEO Strategy & Roadmap'),
    bullet('Keyword Audit and Research (focused on transactional/commercial keywords)'),
    bullet('On-Page Optimization (titles, meta tags, headers, internal linking)'),
    bullet('Technical SEO (image optimization, page speed improvements, canonical tags, redirects, schema)'),
    bullet('Conversion Optimization'),
    bullet('Monthly Fresh Content — 2 blogs per month'),

    subHeading('Answer Engine Optimization (AEO)'),
    body('As AI tools like ChatGPT, Google\'s SGE (Search Generative Experience), Siri, and Alexa reshape the way patients get answers online, AEO ensures that your practice is the one being recommended.'),
    bullet('Conversational keyword research (e.g., "What is," "How to," "Can I get…")'),
    bullet('FAQ development for key service and location pages'),
    bullet('Structured data (FAQ, article, and review schema) implementation'),
    bullet('Author bio optimization to showcase expertise and build trust'),
    spacer(4),
    body('Together, SEO and AEO allow your practice to show up on every platform patients use to find care — from search engines to AI assistants.'),

    subHeading('Online Visibility Foundation'),
    bullet('Google Business Profile (GBP) Optimization (1 location included)'),
    bullet('Google Business Profile Posts'),
    bullet('Note: Additional GBP locations or provider profiles can be added for $97/mo each.'),
    bullet('40+ Directory Listings (Yelp, Bing, Alignable, Data Aggregators, and more)'),
    bullet('Backlink Building (reputable, industry-relevant sources)'),
    bullet('YouTube channel set up'),

    subHeading('Press Releases'),
    body('The program includes monthly releases. The Press Releases are distributed via presswire and will be picked up by local, regional affiliates of news station sites, including ABC, NBC, FOX, CBS, Associated Press, Google News, Yahoo News, radio stations, and newspaper publications sites across the country with more than 150 million monthly unique users. As proof of getting featured, you will receive a PDF report of all live URLs to the article. This press release not only gets you media attention, but it also provides powerful authority backlinks for SEO.'),

    subHeading('Website Build'),
    bullet('A WordPress website is required for this program'),
    bullet('Medical Marketing Whiz will include a WordPress website build up to 10 pages'),
    bullet('Or a Website Glow-up of an existing WordPress website'),
    bullet('Additional pages are $197 each, and payments can be spread over the 12-month term if requested'),
    bullet('Forms will be integrated into the ClinicWhiz CRM to capture all leads'),

    subHeading('Website Hosting, Maintenance, and Site Security'),
    bullet('Website hosting is included'),
    bullet('Hosting includes uptime monitoring, basic security, and routine maintenance with 30 minutes of edit time included each month.'),
    bullet('Client retains full ownership of the website (or if MMW is designing a new build website, the Client will take ownership at month 12 of the agreement)'),

    subHeading('Professional Video & Photo Package (1x/year)'),
    bullet('Half-day photo & video shoot'),
    bullet('One branded overview video for website/social'),
    bullet('25 high-quality branded photos, all of which will become the Client\'s property'),

    subHeading('Awards & Industry Recognition'),
    bullet('Research & Nomination Submission — Castle Connolly, Best Doctors, Women\'s Choice, etc. (award costs not included)'),
    bullet('Interview + Feature in Top Doctor Magazine'),
    bullet('Healthcare Impact Award'),

    subHeading('Build & Nurture Your List'),
    bullet('ClinicWhiz HIPAA-Compliant CRM via GoHighLevel (Unlimited Contacts & Sends)'),
    bullet('Lead Magnet Development (Custom Ebook or Gift Card Offer)'),
    bullet('Monthly Email Newsletter'),
    bullet('SMS Marketing'),
    bullet('Lead Capture Funnel with CRM Integration and automations'),

    subHeading('Reputation Management'),
    bullet('Automated Google Review Requests (via Text & Email)'),
    bullet('Custom QR Codes for Review Collection'),
    bullet('Online Reputation Monitoring & Reporting'),

    subHeading('Dr. Social Whiz Platform (AI-Powered Organic Social Media Platform)'),
    bullet('Client will receive access to the Dr. Social Whiz platform for content scheduling to Facebook, Instagram, LinkedIn, TikTok, and Google Business.'),
    bullet('AI and Canva integration Meta Ad Campaign to Promote Lead Magnet (Ad spend not included)'),
    bullet('Client is responsible for organic social posting and scheduling via the platform'),

    subHeading('Ads Management'),
    body('Meta Ads ($1,000–$1,500 ad spend suggested — client pays directly to Meta)'),
    bullet('New creatives as needed'),
    bullet('Copywriting included'),
    bullet('Retargeting pixel & Lead form setup'),
    bullet('Landing page'),
    bullet('Max 2 new ad copy tests per month'),
    bullet('Max 2 new creatives per month'),
    bullet('Weekly Optimization for each offer'),
    spacer(4),
    body('Google Ads ($2,000 min ad spend suggested — client pays directly to Google)'),
    bullet('Copywriting Included'),
    bullet('Retargeting Setup (Display Ad Required)'),
    bullet('Weekly Optimization'),
    bullet('Monthly Reporting'),

    subHeading('Events and Webinars'),
    bullet('Patient Education Event'),
    bullet('Open House'),
    bullet('Speaking Engagements'),
    bullet('Pre-recorded Webinar'),
    spacer(4),
    body('Included Event or Webinar Deliverables:'),
    bullet('Event/Webinar Planning Expert'),
    bullet('Event/Webinar Theme Development and Marketing Materials'),
    bullet('Event/Webinar Slide deck customization'),
    bullet('Internal & External Marketing (Email, Social Media, Press Release, Google Posts)'),
    bullet('RSVP Landing Page'),
    bullet('Webinar recording and editing'),
    bullet('Sales Funnel with Automated Reminders'),
    bullet('Post-Event/Webinar Email Follow-Up Sequence'),
    spacer(4),
    body('Events have the potential to drive $20K–$50K+ in revenue and help you quickly build trust and visibility in your market.'),

    subHeading('Graphic Design Support'),
    body('Custom-branded:'),
    bullet('Posters'),
    bullet('Brochures'),
    bullet('Flyers'),
    bullet('Rack Cards'),

    subHeading('Strategic Support'),
    bullet('Dedicated Marketing Whiz'),
    bullet('Receive a personalized Loom video or schedule a Zoom meeting to review performance, next steps, and questions.'),
    bullet('Quarterly Strategy & Reporting Calls with Client Success Manager'),

    subHeading('A-La-Carte Options:'),
    body('All products below are 1 time purchases — none are recurring services that can be added to an existing plan, except for Ads.'),
    bullet('Additional Web Pages | $197 ea.'),
    bullet('Additional Press Releases | $397 ea.'),
    bullet('Meta Ads Extra Campaign | $997 Setup, $997/mo mgmt fee, add\'l. topics $597/mo each'),
    bullet('Google Ads Extra Campaign | $997 Setup, $2,000/mo/niche management fee + $2,000 ad spend minimum'),
    bullet('Hourly Work | $197/hr'),
    bullet('A-la-Carte Event | $2,997 each'),
    bullet('A-la-Carte Webinar | $3,997 each'),
  ];

  // ── CLOSING ───────────────────────────────────────────────────────────────
  const reviewHeights = [494, 242, 184, 205, 224, 215, 179, 242, 149, 205];
  const reviewKeys = ['review_1','review_2','review_3','review_4','review_5','review_6','review_7','review_8','review_9','review_10'];

  // Keep the heading + first review together in one table cell so Word
  // won't orphan "Client Reviews & Testimonials" at the bottom of a page
  const noneB = { style: BorderStyle.NONE, size: 0, color: WHITE };
  const reviewHeadingAndFirst = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: noneB, bottom: noneB, left: noneB, right: noneB },
      children: [
        sectionHeading('Client Reviews & Testimonials'),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 40, after: 60 },
          children: [new TextRun({ text: '"What Others Say About Lori Werner And Medical Marketing Whiz…"', size: 24, bold: true, font: F_BODY, color: BLACK, italics: true })],
        }),
        spacer(8),
        ...(imgs.review_1 ? [centeredImage(imgs.review_1, IMG_W, reviewHeights[0], 'png')] : []),
      ],
    })] })],
  });

  const closingSection = [
    sectionHeading('READY TO GET STARTED?'),
    subHeading('Here\'s how you can get started and take the next steps!'),
    spacer(6),
    subHeading('1. Do you have any questions?'),
    body('Before we get started, let\'s make sure all of your questions are answered. Please give us a call at (888) 418-8065, or email lori@medicalmarketingwhiz.com with your questions.'),
    spacer(6),
    subHeading('2. Choose your program and get on our schedule!'),
    body('If you\'re ready to get started on a program, give us a call at (888) 418-8065 to make your first month\'s payment. We\'ll schedule onboarding and put you on our schedule.'),
    spacer(4),
    new Paragraph({
      spacing: { before: 60, after: 60 },
      children: [
        new TextRun({ text: 'Schedule next call here: ', size: SZ_BODY, font: F_BODY, color: BLACK }),
        new ExternalHyperlink({ link: 'https://medmarketingwhiz.com/meet-with-lori', children: [
          new TextRun({ text: 'https://medmarketingwhiz.com/meet-with-lori', size: SZ_BODY, font: F_BODY, color: GREEN, underline: { type: UnderlineType.SINGLE } }),
        ]}),
      ],
    }),
    spacer(8),
    body('We look forward to working with you!', { bold: true }),
    spacer(10),
    centeredImage(imgs.awards, IMG_W, Math.round(IMG_W * 0.15), 'png'),
    spacer(12),

    // Heading + first review kept together
    reviewHeadingAndFirst,
    spacer(6),

    // Reviews 2–10 with individual heights
    ...reviewKeys.slice(1).map((key, i) =>
      imgs[key] ? [centeredImage(imgs[key], IMG_W, reviewHeights[i + 1], 'png'), spacer(6)] : []
    ).flat(),
  ];

  // ── HEADER (banner image on all content pages) ────────────────────────────
  // The header sits outside the page margin area, so we set indent left: -MARGIN
  // to push the 816px-wide banner flush to the left page edge
  const headerChildren = imgs.header_banner
    ? [new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 0, after: 0, line: 240 },
        indent: { left: -MARGIN, right: -MARGIN },
        children: [new ImageRun({ data: imgs.header_banner, transformation: { width: HDR_IMG_W, height: HDR_IMG_H }, type: 'png' })],
      })]
    : [new Paragraph({
        spacing: { before: 0, after: 0 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GREEN, space: 1 } },
        children: [new TextRun({ text: `${businessName}  ·  Marketing Analysis Report`, size: 18, font: F_BODY, color: MUTED })],
      })];

  // ── ASSEMBLE ──────────────────────────────────────────────────────────────
  const doc = new Document({
    numbering: {
      config: [
        { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ],
    },
    styles: {
      default: { document: { run: { font: F_BODY, size: SZ_BODY, color: BLACK } } },
    },
    sections: [
      // Cover page — zero margins, full-bleed image, no header spacing
      {
        properties: {
          titlePage: true,
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 },
          },
        },
        headers: {
          first: new Header({ children: imgs.cover
            ? [new Paragraph({
                spacing: { before: 0, after: 0 },
                children: [new ImageRun({
                  data: imgs.cover,
                  transformation: { width: COVER_W, height: COVER_H },
                  type: 'png',
                  floating: {
                    horizontalPosition: {
                      relative: 'page',
                      align: HorizontalPositionAlign.LEFT,
                    },
                    verticalPosition: {
                      relative: 'page',
                      align: VerticalPositionAlign.TOP,
                    },
                    wrap: {
                      type: TextWrappingType.SQUARE,
                      side: TextWrappingSide.BOTH_SIDES,
                    },
                    margins: { top: 0, bottom: 0, left: 0, right: 0 },
                    allowOverlap: true,
                    zIndex: 251658240,
                  },
                })],
              })]
            : [new Paragraph({ children: [new TextRun({ text: businessName, size: 72, bold: true, font: F_HEADING, color: GREEN })] })],
          }),
        },
        // Single empty paragraph — no extra page break
        children: [new Paragraph({ children: [] })],
      },
      // Content pages — header banner + normal margins
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            // top=2160 = 1.5in: 1.25in header + 0.25in breathing room
            margin: { top: 2160, right: MARGIN, bottom: 900, left: MARGIN, header: 0, footer: 720 },
          },
        },
        headers: { default: new Header({ children: headerChildren }) },
        children: [
          ...journeySection, pageBreak(),
          ...websiteSection, pageBreak(),
          ...seoSection,     pageBreak(),
          ...aiSection,      pageBreak(),
          ...localSection,   pageBreak(),
          ...mmwSection,
          ...programSection, pageBreak(),
          ...scopeSection,   pageBreak(),
          ...closingSection,
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { generateReport };
