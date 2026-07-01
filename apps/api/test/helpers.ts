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
