import {
  PDFDocument,
  PageSizes,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB as PdfRgb,
} from 'pdf-lib';
import {
  finishedSize,
  paletteLabel,
  relativeLuminance,
  stitchAspectRatio,
  type GaugeSpec,
  type Grid,
  type PatternResultJson,
  type RGB,
  type Technique,
  type YardageEstimate,
} from 'knitting-pattern-core';

const MARGIN = 36;
const [PAGE_WIDTH, PAGE_HEIGHT] = PageSizes.Letter;

function toPdfColor(color: RGB): PdfRgb {
  return rgb(color.r / 255, color.g / 255, color.b / 255);
}

const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.4, 0.4, 0.4);
const WARNING = rgb(0.6, 0.15, 0.1);

class PdfWriter {
  doc: PDFDocument;
  font: PDFFont;
  boldFont: PDFFont;
  page!: PDFPage;
  y = 0;

  private constructor(doc: PDFDocument, font: PDFFont, boldFont: PDFFont) {
    this.doc = doc;
    this.font = font;
    this.boldFont = boldFont;
    this.newPage();
  }

  static async create(): Promise<PdfWriter> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    return new PdfWriter(doc, font, boldFont);
  }

  newPage(): void {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  ensureSpace(height: number): void {
    if (this.y - height < MARGIN) {
      this.newPage();
    }
  }

  heading(text: string, size = 16): void {
    this.ensureSpace(size + 10);
    this.page.drawText(text, {
      x: MARGIN,
      y: this.y - size,
      size,
      font: this.boldFont,
      color: INK,
    });
    this.y -= size + 10;
  }

  subheading(text: string, size = 12): void {
    this.ensureSpace(size + 8);
    this.page.drawText(text, {
      x: MARGIN,
      y: this.y - size,
      size,
      font: this.boldFont,
      color: INK,
    });
    this.y -= size + 8;
  }

  paragraph(text: string, options: { size?: number; color?: PdfRgb; font?: PDFFont } = {}): void {
    const size = options.size ?? 10.5;
    const font = options.font ?? this.font;
    const color = options.color ?? INK;
    const maxWidth = PAGE_WIDTH - MARGIN * 2;

    for (const line of wrapText(text, font, size, maxWidth)) {
      this.ensureSpace(size + 4);
      this.page.drawText(line, { x: MARGIN, y: this.y - size, size, font, color });
      this.y -= size + 4;
    }
  }

  spacer(height: number): void {
    this.ensureSpace(height);
    this.y -= height;
  }
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

// --- Chart rendering -------------------------------------------------------

const CHART_HEADER_H = 34;
const COL_LABEL_H = 14;
const ROW_LABEL_W = 26;
const MIN_TILE_CELL_PT = 9;
const MAX_CELL_PT = 18;
const MIN_SINGLE_PAGE_CELL_PT = 8;
/** Cells at least this big get a per-color symbol so the chart survives B&W printing and
 * works for colorblind knitters. */
const MIN_SYMBOL_CELL_PT = 7;

/**
 * One symbol per palette index, drawn inside chart cells and shown in the legend. Standard
 * chart practice: the background/first color stays blank; distinct high-contrast glyphs for
 * the rest. WinAnsi-safe characters only (Helvetica).
 */
const COLOR_SYMBOLS = [
  '',
  'x',
  'o',
  '/',
  '+',
  '-',
  'V',
  '=',
  'T',
  'L',
  'n',
  'u',
  's',
  'z',
  '*',
  '#',
  '<',
  '>',
  '?',
  '%',
  'A',
  'b',
  'c',
  'e',
  'F',
  'g',
  'H',
  'k',
  'm',
  'P',
  'q',
  'r',
  'w',
  'y',
  '3',
  '4',
  '7',
  '9',
  '&',
  '@',
];

export function colorSymbol(paletteIndex: number): string {
  // Covers MAX_COLORS (40) with distinct glyphs; beyond that (impossible via the API's
  // validation) fall back to blank rather than duplicating another color's symbol.
  return COLOR_SYMBOLS[paletteIndex] ?? '';
}

/** Black or white, whichever contrasts with the cell color (WCAG-ish midpoint on luminance). */
function symbolInk(cell: RGB): PdfRgb {
  return relativeLuminance(cell) > 0.35 ? rgb(0.08, 0.08, 0.08) : rgb(0.97, 0.97, 0.97);
}

function drawChart(
  writer: PdfWriter,
  grid: Grid,
  gauge: GaugeSpec | undefined,
  technique: Technique,
): void {
  // Row numbers live on BOTH sides (RS rows on the right, WS rows on the left — standard
  // flat-chart convention), so reserve a label gutter on each side.
  const availableW = PAGE_WIDTH - MARGIN * 2 - ROW_LABEL_W * 2;
  const availableH = PAGE_HEIGHT - MARGIN * 2 - CHART_HEADER_H - COL_LABEL_H;
  const aspect = stitchAspectRatio(gauge);

  // Cell height is the free variable; width = height * aspect. Fit both dimensions.
  const fitByHeight = Math.min(
    Math.floor(availableH / grid.height),
    Math.floor(availableW / (grid.width * aspect)),
  );
  const singlePageFits = fitByHeight >= MIN_SINGLE_PAGE_CELL_PT;

  const cellH = singlePageFits ? Math.min(fitByHeight, MAX_CELL_PT) : MIN_TILE_CELL_PT;
  // FLOOR, not round: rounding the width up could make grid.width * cellW exceed the page
  // even though the "fits on one page" decision above said yes — producing an unexplained
  // second page holding a single orphan column (seen at 35 sts x default gauge).
  const cellW = Math.max(
    1,
    singlePageFits ? Math.floor(cellH * aspect) : Math.round(cellH * aspect),
  );

  const tileCols = Math.max(1, Math.floor(availableW / cellW));
  const tileRows = Math.max(1, Math.floor(availableH / cellH));
  const pagesAcross = Math.ceil(grid.width / tileCols);
  const pagesDown = Math.ceil(grid.height / tileRows);

  // Explain the split whenever a split ACTUALLY happens (derived from the real page counts,
  // not the pre-rounding fit estimate).
  if (pagesAcross * pagesDown > 1) {
    writer.paragraph(
      `The chart is split across ${pagesAcross * pagesDown} pages (${pagesAcross} across x ${pagesDown} down) to stay legible. Stitch and row numbers on every page show where each piece sits in the full chart.`,
      { color: MUTED, size: 9.5 },
    );
  }

  const drawSymbols = cellH >= MIN_SYMBOL_CELL_PT && grid.palette.length > 1;
  const symbolSize = Math.max(4, Math.floor(cellH * 0.62));

  for (let tileRow = 0; tileRow < pagesDown; tileRow++) {
    for (let tileCol = 0; tileCol < pagesAcross; tileCol++) {
      writer.newPage();
      const gx0 = tileCol * tileCols;
      const gy0 = tileRow * tileRows;
      const gx1 = Math.min(grid.width, gx0 + tileCols);
      const gy1 = Math.min(grid.height, gy0 + tileRows);

      const title =
        pagesAcross * pagesDown > 1
          ? `Chart — piece ${tileRow * pagesAcross + tileCol + 1} of ${pagesAcross * pagesDown} (rows ${grid.height - Math.min(grid.height, gy0 + tileRows) + 1}–${grid.height - gy0}, sts ${grid.width - gx1 + 1}–${grid.width - gx0})`
          : 'Chart';
      writer.page.drawText(title, {
        x: MARGIN,
        y: PAGE_HEIGHT - MARGIN - 14,
        size: 12,
        font: writer.boldFont,
        color: INK,
      });

      const chartTop = PAGE_HEIGHT - MARGIN - CHART_HEADER_H;
      const originX = MARGIN + ROW_LABEL_W;
      const tileBottomY = chartTop - (gy1 - gy0) * cellH;

      // Stitch numbers count from the RIGHT edge (stitch 1 = last grid column), the
      // direction RS rows are worked. Label stitch 1 and every 5th.
      for (let gx = gx0; gx < gx1; gx++) {
        const stitchNumber = grid.width - gx;
        if (stitchNumber !== 1 && stitchNumber % 5 !== 0) continue;
        const label = String(stitchNumber);
        const cx = originX + (gx - gx0) * cellW + cellW / 2;
        writer.page.drawText(label, {
          x: cx - writer.font.widthOfTextAtSize(label, 6) / 2,
          y: chartTop + 3,
          size: 6,
          font: writer.font,
          color: MUTED,
        });
      }

      for (let gy = gy0; gy < gy1; gy++) {
        const chartRowNumber = grid.height - gy; // chart row 1 = bottom of the picture
        const rowTopY = chartTop - (gy - gy0) * cellH - cellH;

        // RS (odd) rows are read right-to-left: number them on the right edge, where the
        // knitter starts. WS (even) rows start on the left.
        const label = String(chartRowNumber);
        const isRs = chartRowNumber % 2 === 1;
        writer.page.drawText(label, {
          x: isRs
            ? originX + (gx1 - gx0) * cellW + 4
            : MARGIN + ROW_LABEL_W - 4 - writer.font.widthOfTextAtSize(label, 6),
          y: rowTopY + cellH / 2 - 3,
          size: 6,
          font: writer.font,
          color: MUTED,
        });

        for (let gx = gx0; gx < gx1; gx++) {
          const paletteIndex = grid.indices[gy * grid.width + gx] ?? 0;
          const color = grid.palette[paletteIndex] ?? { r: 255, g: 255, b: 255 };
          const cellX = originX + (gx - gx0) * cellW;
          writer.page.drawRectangle({
            x: cellX,
            y: rowTopY,
            width: cellW,
            height: cellH,
            color: toPdfColor(color),
            borderColor: rgb(0.75, 0.75, 0.75),
            borderWidth: cellH >= 6 ? 0.4 : 0,
          });

          // Per-color symbol: colorwork charts stay readable in B&W print and for
          // colorblind knitters; texture charts use the standard dot-means-purl.
          if (drawSymbols) {
            const glyph =
              technique === 'texture' ? (paletteIndex === 0 ? '•' : '') : colorSymbol(paletteIndex);
            if (glyph) {
              writer.page.drawText(glyph, {
                x: cellX + cellW / 2 - writer.font.widthOfTextAtSize(glyph, symbolSize) / 2,
                y: rowTopY + cellH / 2 - symbolSize * 0.36,
                size: symbolSize,
                font: writer.font,
                color: symbolInk(color),
              });
            }
          }
        }
      }

      // Heavier guide lines every 10 stitches/rows (counted from the right and the bottom,
      // matching the numbering) — the standard counting aid on professional charts.
      const guide = rgb(0.35, 0.35, 0.35);
      for (let gx = gx0; gx <= gx1; gx++) {
        const stitchesFromRight = grid.width - gx;
        if (stitchesFromRight % 10 !== 0 && gx !== gx0 && gx !== gx1) continue;
        const x = originX + (gx - gx0) * cellW;
        writer.page.drawLine({
          start: { x, y: chartTop },
          end: { x, y: tileBottomY },
          thickness: stitchesFromRight % 10 === 0 ? 0.9 : 0.5,
          color: guide,
        });
      }
      for (let gy = gy0; gy <= gy1; gy++) {
        const rowsFromBottom = grid.height - gy;
        if (rowsFromBottom % 10 !== 0 && gy !== gy0 && gy !== gy1) continue;
        const y = chartTop - (gy - gy0) * cellH;
        writer.page.drawLine({
          start: { x: originX, y },
          end: { x: originX + (gx1 - gx0) * cellW, y },
          thickness: rowsFromBottom % 10 === 0 ? 0.9 : 0.5,
          color: guide,
        });
      }

      writer.y = MARGIN;
    }
  }
}

// --- Section builders --------------------------------------------------------

function drawLegend(
  writer: PdfWriter,
  grid: Grid,
  yardage: YardageEstimate,
  technique: Technique,
): void {
  writer.heading('Color Legend');
  writer.paragraph(
    'Yardage is a rough estimate based on gauge and stitch count (see Materials below) — buy an extra margin per color.',
    { size: 9, color: MUTED },
  );
  writer.spacer(4);

  const swatchSize = 14;
  for (let i = 0; i < grid.palette.length; i++) {
    const color = grid.palette[i];
    if (!color) continue;
    const est = yardage.perColor.find((c) => c.paletteIndex === i);
    writer.ensureSpace(swatchSize + 6);
    writer.page.drawRectangle({
      x: MARGIN,
      y: writer.y - swatchSize,
      width: swatchSize,
      height: swatchSize,
      color: toPdfColor(color),
      borderColor: rgb(0.5, 0.5, 0.5),
      borderWidth: 0.5,
    });
    // The same symbol drawn in the chart cells, so the legend doubles as the symbol key.
    const glyph = technique === 'texture' ? (i === 0 ? '•' : '') : colorSymbol(i);
    if (glyph) {
      writer.page.drawText(glyph, {
        x: MARGIN + swatchSize / 2 - writer.font.widthOfTextAtSize(glyph, 9) / 2,
        y: writer.y - swatchSize + 3.5,
        size: 9,
        font: writer.font,
        color: symbolInk(color),
      });
    }
    const hex = `#${[color.r, color.g, color.b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    const stitches = est?.stitchCount ?? 0;
    const yards = Math.ceil(est?.estimatedYards ?? 0);
    const meters = Math.ceil((est?.estimatedYards ?? 0) * 0.9144);
    writer.page.drawText(
      `${paletteLabel(i)}  ${hex}  —  ${stitches} stitches  —  ~${yards} yd / ${meters} m`,
      {
        x: MARGIN + swatchSize + 8,
        y: writer.y - swatchSize + 3,
        size: 10,
        font: writer.font,
        color: INK,
      },
    );
    writer.y -= swatchSize + 6;
  }
}

function drawHowToRead(writer: PdfWriter, technique: Technique): void {
  writer.subheading('How to read this pattern');
  const lines = [
    'Worked flat in stockinette, bottom-up: chart row 1 is the BOTTOM row of the chart.',
    'Odd rows are the right side (RS) — knit, reading the chart right-to-left. Even rows are the wrong side (WS) — purl, reading left-to-right.',
  ];
  if (technique === 'stranded') {
    lines.push(
      'Carry the color not in use loosely across the back; catch floats longer than ~5 stitches.',
    );
  }
  if (technique === 'intarsia') {
    lines.push(
      'Use a separate bobbin for each color block and twist the yarns around each other at every color change to avoid holes.',
    );
  }
  if (technique === 'texture') {
    lines.push(
      'K = knit, P = purl. The stitch letters are already flipped on WS rows so the motif reads correctly from the RS — work each row exactly as written.',
    );
  }
  lines.push(
    technique === 'texture'
      ? 'To work in the round instead: read every chart row right-to-left, and work dark squares as purl, light squares as knit, on every round.'
      : 'To work in the round instead: read every chart row right-to-left and knit every round (no WS rows).',
  );
  for (const line of lines) {
    writer.paragraph(`•  ${line}`, { size: 9.5 });
  }
}

function drawInstructions(writer: PdfWriter, pattern: PatternResultJson): void {
  writer.heading('Row-by-Row Instructions');
  writer.spacer(4);

  for (const row of pattern.rows) {
    writer.paragraph(row.text, { size: 9.5 });
  }

  if (pattern.technique === 'stranded') {
    if (pattern.manyColorRowWarnings.length > 0) {
      writer.spacer(6);
      writer.subheading('Notes: rows with more than 2 colors');
      writer.paragraph(
        'Stranded (Fair Isle) colorwork is typically worked with at most 2 colors per row. Consider intarsia for these rows, or reduce the color count.',
        { size: 9, color: MUTED },
      );
      for (const w of pattern.manyColorRowWarnings) {
        writer.paragraph(`Row ${w.chartRow}: ${w.colorCount} colors`, { size: 9, color: WARNING });
      }
    }
    if (pattern.floatWarnings.length > 0) {
      writer.spacer(6);
      writer.subheading('Notes: long floats (catch every ~5 stitches)');
      for (const w of pattern.floatWarnings) {
        writer.paragraph(
          `Row ${w.chartRow}: ${paletteLabel(w.paletteIndex)} floats ${w.length} stitches (between stitch ${w.fromStitch} and ${w.toStitch})`,
          { size: 9, color: WARNING },
        );
      }
    }
  }

  if (pattern.technique === 'intarsia') {
    writer.spacer(6);
    writer.subheading(`Bobbins needed: ${pattern.bobbinCount}`);
    writer.paragraph(
      'Each contiguous color region needs its own bobbin. Twist yarns at every color change (bring the new color up and over the old) to avoid holes.',
      { size: 9, color: MUTED },
    );
  }

  if (pattern.technique === 'texture') {
    writer.spacer(6);
    writer.subheading('Stitch key');
    writer.paragraph(
      'K = knit, P = purl. P stitches show as a raised bump on the right side; K stitches show as a flat "V". The stitch to work is already inverted for WS rows above so the picture reads correctly from the right side.',
      { size: 9, color: MUTED },
    );
  }
}

/** Rough yarn-weight/needle suggestion from stitch gauge (CYC standard bands). */
function yarnSuggestion(gauge: GaugeSpec): string {
  const sts = gauge.stitchesPer4In;
  if (sts >= 32) return 'lace-weight yarn, 1.5-2.5 mm needles';
  if (sts >= 27) return 'fingering / #1 super fine yarn, 2.25-3.25 mm needles';
  if (sts >= 23) return 'sport / #2 fine yarn, 3.25-3.75 mm needles';
  if (sts >= 21) return 'DK / #3 light yarn, 3.75-4.5 mm needles';
  if (sts >= 16) return 'worsted-aran / #4 medium yarn, 4.5-5.5 mm needles';
  if (sts >= 12) return 'chunky / #5 bulky yarn, 5.5-8 mm needles';
  return 'super-bulky / #6 yarn, 8 mm+ needles';
}

function drawMaterials(
  writer: PdfWriter,
  yardage: YardageEstimate,
  grid: Grid,
  gauge: GaugeSpec | undefined,
): void {
  writer.heading('Materials & Size (Estimated)');
  if (gauge) {
    const size = finishedSize({ widthStitches: grid.width, heightRows: grid.height }, gauge);
    writer.paragraph(
      `Finished size at gauge: ~${size.widthIn.toFixed(1)} x ${size.heightIn.toFixed(1)} in (${(size.widthIn * 2.54).toFixed(0)} x ${(size.heightIn * 2.54).toFixed(0)} cm). The gauge suggests ${yarnSuggestion(gauge)} — always swatch and adjust.`,
      { size: 10 },
    );
  }
  const totalYd = Math.ceil(yardage.totalEstimatedYards);
  const totalM = Math.ceil(yardage.totalEstimatedYards * 0.9144);
  writer.paragraph(
    `Total estimated yarn: ~${totalYd} yd / ${totalM} m across ${yardage.perColor.length} color(s). This is a rough approximation from gauge and stitch count, not a precise physical model — actual usage varies with fiber, tension, and finishing. Always buy a margin over the estimate.`,
    { size: 10 },
  );
}

export interface PdfPatternInput {
  technique: Technique;
  gauge?: GaugeSpec;
  grid: Grid;
  pattern: PatternResultJson;
  yardage: YardageEstimate;
  widthStitches: number;
  heightRows: number;
  seamless?: boolean;
  /** Pattern title shown as the document heading and in page footers. */
  title?: string;
}

const TECHNIQUE_LABEL: Record<Technique, string> = {
  stranded: 'Stranded (Fair Isle) Colorwork',
  intarsia: 'Intarsia',
  texture: 'Knit/Purl Texture',
};

/** Helvetica (WinAnsi) can't encode emoji/CJK/etc — strip anything outside Latin-1 so a
 * decorated pattern name degrades gracefully instead of failing the whole export. */
function sanitizeWinAnsi(text: string): string {
  return text
    .replace(/[^\x20-\x7e\u00a0-\u00ff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function renderPatternPdf(input: PdfPatternInput): Promise<Uint8Array> {
  const writer = await PdfWriter.create();
  const title = sanitizeWinAnsi(input.title?.trim() ?? '') || 'Knitting Pattern';

  for (const line of wrapText(title, writer.boldFont, 20, PAGE_WIDTH - MARGIN * 2)) {
    writer.heading(line, 20);
  }
  writer.paragraph(TECHNIQUE_LABEL[input.technique], { size: 12, font: writer.boldFont });
  writer.paragraph(`${input.widthStitches} stitches x ${input.heightRows} rows`, { size: 10.5 });

  if (input.gauge) {
    writer.paragraph(
      `Gauge: ${input.gauge.stitchesPer4In} sts / ${input.gauge.rowsPer4In} rows per 4in (10cm)`,
      { size: 10.5 },
    );
  } else {
    writer.paragraph('No gauge provided — chart uses an approximate default stitch proportion.', {
      size: 9.5,
      color: MUTED,
    });
  }

  if (input.seamless) {
    writer.paragraph(
      'This pattern tiles seamlessly: repeat the chart left-to-right and/or top-to-bottom to continue the design.',
      { size: 9.5, font: writer.boldFont },
    );
  }

  writer.spacer(6);
  drawHowToRead(writer, input.technique);

  writer.spacer(10);
  drawLegend(writer, input.grid, input.yardage, input.technique);

  drawChart(writer, input.grid, input.gauge, input.technique);

  writer.newPage();
  drawInstructions(writer, input.pattern);

  writer.spacer(14);
  drawMaterials(writer, input.yardage, input.grid, input.gauge);

  // Footer post-pass: "title — page N of M" on every page, so loose printed pages can be
  // reassembled (charts are often printed and carried around).
  const pages = writer.doc.getPages();
  pages.forEach((page, index) => {
    const text = `${title}  —  page ${index + 1} of ${pages.length}`;
    page.drawText(text, {
      x: PAGE_WIDTH - MARGIN - writer.font.widthOfTextAtSize(text, 7.5),
      y: MARGIN / 2,
      size: 7.5,
      font: writer.font,
      color: MUTED,
    });
  });

  return writer.doc.save();
}
