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
  paletteLabel,
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

const CHART_HEADER_H = 20;
const COL_LABEL_H = 14;
const ROW_LABEL_W = 26;
const MIN_TILE_CELL_PT = 9;
const MAX_CELL_PT = 18;
const MIN_SINGLE_PAGE_CELL_PT = 8;

function drawChart(writer: PdfWriter, grid: Grid, gauge: GaugeSpec | undefined): void {
  const availableW = PAGE_WIDTH - MARGIN * 2 - ROW_LABEL_W;
  const availableH = PAGE_HEIGHT - MARGIN * 2 - CHART_HEADER_H - COL_LABEL_H;
  const aspect = stitchAspectRatio(gauge);

  // Cell height is the free variable; width = height * aspect. Fit both dimensions.
  const fitByHeight = Math.min(
    Math.floor(availableH / grid.height),
    Math.floor(availableW / (grid.width * aspect)),
  );
  const singlePageFits = fitByHeight >= MIN_SINGLE_PAGE_CELL_PT;

  const cellH = singlePageFits ? Math.min(fitByHeight, MAX_CELL_PT) : MIN_TILE_CELL_PT;
  const cellW = Math.max(1, Math.round(cellH * aspect));

  const tileCols = Math.max(1, Math.floor(availableW / cellW));
  const tileRows = Math.max(1, Math.floor(availableH / cellH));
  const pagesAcross = Math.ceil(grid.width / tileCols);
  const pagesDown = Math.ceil(grid.height / tileRows);

  writer.heading('Chart');
  if (!singlePageFits) {
    writer.paragraph(
      `This chart is larger than one page at a legible size, so it is split into ${pagesAcross * pagesDown} tile(s) (${pagesAcross} across x ${pagesDown} down). Row/column numbers on each tile show where it fits in the full chart.`,
      { color: MUTED, size: 9.5 },
    );
  }

  for (let tileRow = 0; tileRow < pagesDown; tileRow++) {
    for (let tileCol = 0; tileCol < pagesAcross; tileCol++) {
      writer.newPage();
      const gx0 = tileCol * tileCols;
      const gy0 = tileRow * tileRows;
      const gx1 = Math.min(grid.width, gx0 + tileCols);
      const gy1 = Math.min(grid.height, gy0 + tileRows);

      const title =
        pagesAcross * pagesDown > 1
          ? `Chart — tile row ${tileRow + 1}/${pagesDown}, column ${tileCol + 1}/${pagesAcross}`
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

      // Column labels (grid x -> stitch column number, 1-indexed, image order left-to-right).
      for (let gx = gx0; gx < gx1; gx += Math.max(1, Math.ceil(10 / Math.max(cellW, 1)))) {
        const label = String(gx + 1);
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
        const chartRowNumber = grid.height - gy; // see docs/KNITTING_NOTES.md chart-row convention
        const rowTopY = chartTop - (gy - gy0) * cellH - cellH;

        if (chartRowNumber === 1 || chartRowNumber % 5 === 0 || gy === gy0) {
          const label = String(chartRowNumber);
          writer.page.drawText(label, {
            x: MARGIN,
            y: rowTopY + cellH / 2 - 3,
            size: 6,
            font: writer.font,
            color: MUTED,
          });
        }

        for (let gx = gx0; gx < gx1; gx++) {
          const paletteIndex = grid.indices[gy * grid.width + gx] ?? 0;
          const color = grid.palette[paletteIndex] ?? { r: 255, g: 255, b: 255 };
          writer.page.drawRectangle({
            x: originX + (gx - gx0) * cellW,
            y: rowTopY,
            width: cellW,
            height: cellH,
            color: toPdfColor(color),
            borderColor: rgb(0.75, 0.75, 0.75),
            borderWidth: cellH >= 6 ? 0.4 : 0,
          });
        }
      }

      writer.y = MARGIN;
    }
  }
}

// --- Section builders --------------------------------------------------------

function drawLegend(writer: PdfWriter, grid: Grid, yardage: YardageEstimate): void {
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
    const hex = `#${[color.r, color.g, color.b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    const stitches = est?.stitchCount ?? 0;
    const yards = est?.estimatedYards ?? 0;
    writer.page.drawText(
      `${paletteLabel(i)}  ${hex}  —  ${stitches} stitches  —  ~${yards.toFixed(1)} yd`,
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

function drawInstructions(writer: PdfWriter, pattern: PatternResultJson): void {
  writer.heading('Row-by-Row Instructions');
  writer.paragraph(
    'Worked flat, bottom-up. Odd rows are RS (read right-to-left below); even rows are WS (read left-to-right). See docs/KNITTING_NOTES.md for conventions.',
    { size: 9, color: MUTED },
  );
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

function drawMaterials(writer: PdfWriter, yardage: YardageEstimate): void {
  writer.heading('Materials (Estimated)');
  writer.paragraph(
    `Total estimated yardage: ~${yardage.totalEstimatedYards.toFixed(1)} yd across ${yardage.perColor.length} color(s). This is a rough approximation from gauge and stitch count, not a precise physical model — actual usage varies with fiber, tension, and finishing.`,
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
}

const TECHNIQUE_LABEL: Record<Technique, string> = {
  stranded: 'Stranded (Fair Isle) Colorwork',
  intarsia: 'Intarsia',
  texture: 'Knit/Purl Texture',
};

export async function renderPatternPdf(input: PdfPatternInput): Promise<Uint8Array> {
  const writer = await PdfWriter.create();

  writer.heading('Knitting Pattern', 20);
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

  writer.spacer(10);
  drawLegend(writer, input.grid, input.yardage);

  drawChart(writer, input.grid, input.gauge);

  writer.newPage();
  drawInstructions(writer, input.pattern);

  writer.spacer(14);
  drawMaterials(writer, input.yardage);

  return writer.doc.save();
}
