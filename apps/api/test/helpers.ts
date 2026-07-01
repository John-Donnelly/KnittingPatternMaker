import sharp from 'sharp';

/** Builds a small synthetic PNG (deterministic, no external fixture file) for upload tests. */
export async function makeTestImagePng(width: number, height: number): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const isLeftHalf = x < width / 2;
      data[i] = isLeftHalf ? 20 : 230;
      data[i + 1] = isLeftHalf ? 20 : 230;
      data[i + 2] = isLeftHalf ? 20 : 230;
      data[i + 3] = 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

/**
 * A flat two-color checkerboard "chart" overlaid with a 1px gray grid on every `cellPx`
 * boundary — mimics a scanned/screenshotted knitting chart. A dominant sampler should recover
 * the two flat colors; an averaging sampler blends the gray gridlines in.
 */
export async function makeGriddedChartPng(
  cellsAcross: number,
  cellsDown: number,
  cellPx: number,
): Promise<Buffer> {
  const width = cellsAcross * cellPx;
  const height = cellsDown * cellPx;
  const GRID: [number, number, number] = [120, 120, 120];
  const A: [number, number, number] = [30, 120, 40];
  const B: [number, number, number] = [245, 245, 245];
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const onGrid = x % cellPx === cellPx - 1 || y % cellPx === cellPx - 1;
      const cellX = Math.floor(x / cellPx);
      const cellY = Math.floor(y / cellPx);
      const [r, g, b] = onGrid ? GRID : (cellX + cellY) % 2 === 0 ? A : B;
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

/** A horizontal grayscale ramp: smooth everywhere except a hard jump at the wrap-around edge
 * (right edge back to left edge) — useful for testing seamless tiling actually helps. */
export async function makeRampImagePng(width: number, height: number): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const value = Math.round((x / (width - 1)) * 255);
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}
