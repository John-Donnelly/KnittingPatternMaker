/**
 * Image decoding on Workers: WASM codecs (@jsquash) replace sharp, which is a native module
 * and cannot load in workerd. Dimensions are parsed from the image HEADER first so oversized
 * images are rejected before allocating the RGBA plane (a 48MP photo is ~190MB decoded —
 * over the 128MB isolate limit). EXIF orientation is applied to the decoded RGBA to match
 * the Node server's sharp .rotate() behavior.
 */
import decodeJpeg, { init as initJpegDecode } from '@jsquash/jpeg/decode.js';
import { decode as decodePng, init as initPngDecode } from '@jsquash/png/decode.js';
import decodeWebp, { init as initWebpDecode } from '@jsquash/webp/decode.js';
import JPEG_DEC_WASM from '../../../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm';
// @ts-expect-error - the package ships wasm-bindgen typings for this file, but wrangler
// bundles a raw .wasm import as a compiled WebAssembly.Module default export.
import PNG_DEC_WASM from '../../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm';
import WEBP_DEC_WASM from '../../../node_modules/@jsquash/webp/codec/dec/webp_dec.wasm';
import exifr from 'exifr';
import type { PixelBuffer } from 'knitting-pattern-core';

export class ImageDecodeError extends Error {}

/** Uploaded images above this many pixels are rejected pre-decode (isolate memory bound).
 * The frontend downscales client-side to a 3000px long edge (9MP) — this is the backstop
 * for direct API callers. */
export const MAX_MEGAPIXELS = 24;

let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  // WASM modules are compiled once per isolate and reused across requests.
  wasmReady ??= Promise.all([
    initJpegDecode(JPEG_DEC_WASM),
    initPngDecode(PNG_DEC_WASM),
    initWebpDecode(WEBP_DEC_WASM),
  ]).then(() => undefined);
  return wasmReady;
}

type Format = 'jpeg' | 'png' | 'webp';

function sniffFormat(bytes: Uint8Array): Format | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'jpeg';
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png';
  }
  if (
    bytes.length > 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

/** Parses width/height from the image header without decoding pixel data. */
export function headerDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const format = sniffFormat(bytes);
  if (format === 'png') {
    // IHDR is always the first chunk: width/height at fixed offsets 16/20.
    if (bytes.length < 24) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (format === 'jpeg') {
    // Scan markers for a Start-Of-Frame segment (SOF0..SOF15 except DHT/JPG/DAC).
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1] ?? 0;
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
        offset += 2;
        continue;
      }
      const length = view.getUint16(offset + 2);
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      }
      offset += 2 + length;
    }
    return null;
  }
  if (format === 'webp') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const fourcc = String.fromCharCode(...bytes.slice(12, 16));
    if (fourcc === 'VP8X' && bytes.length >= 30) {
      const w = 1 + (view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16));
      const h = 1 + (view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16));
      return { width: w, height: h };
    }
    if (fourcc === 'VP8 ' && bytes.length >= 30) {
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    }
    if (fourcc === 'VP8L' && bytes.length >= 25) {
      const b0 = view.getUint8(21);
      const b1 = view.getUint8(22);
      const b2 = view.getUint8(23);
      const b3 = view.getUint8(24);
      const w = 1 + (((b1 & 0x3f) << 8) | b0);
      const h = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { width: w, height: h };
    }
    return null;
  }
  return null;
}

/** Applies an EXIF orientation (1-8) to an RGBA buffer, returning a new upright buffer. */
export function applyOrientation(src: PixelBuffer, orientation: number): PixelBuffer {
  if (orientation <= 1 || orientation > 8) return src;
  const { width: w, height: h, data } = src;
  const swap = orientation >= 5; // 5-8 involve a 90-degree rotation
  const outW = swap ? h : w;
  const outH = swap ? w : h;
  const out = new Uint8ClampedArray(outW * outH * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ox: number;
      let oy: number;
      switch (orientation) {
        case 2:
          ox = w - 1 - x;
          oy = y;
          break; // mirror horizontal
        case 3:
          ox = w - 1 - x;
          oy = h - 1 - y;
          break; // rotate 180
        case 4:
          ox = x;
          oy = h - 1 - y;
          break; // mirror vertical
        case 5:
          ox = y;
          oy = x;
          break; // transpose
        case 6:
          ox = h - 1 - y;
          oy = x;
          break; // rotate 90 CW
        case 7:
          ox = h - 1 - y;
          oy = w - 1 - x;
          break; // transverse
        default:
          ox = y;
          oy = w - 1 - x;
          break; // 8: rotate 270 CW
      }
      const si = (y * w + x) * 4;
      const di = (oy * outW + ox) * 4;
      out[di] = data[si] ?? 0;
      out[di + 1] = data[si + 1] ?? 0;
      out[di + 2] = data[si + 2] ?? 0;
      out[di + 3] = data[si + 3] ?? 255;
    }
  }
  return { width: outW, height: outH, data: out };
}

export async function decodeImage(buffer: ArrayBuffer): Promise<PixelBuffer> {
  const bytes = new Uint8Array(buffer);
  const format = sniffFormat(bytes);
  if (!format) {
    throw new ImageDecodeError('Unsupported image format — please upload a JPG, PNG, or WebP file');
  }

  const dims = headerDimensions(bytes);
  if (dims && dims.width * dims.height > MAX_MEGAPIXELS * 1_000_000) {
    throw new ImageDecodeError(
      `Image is too large (${Math.round((dims.width * dims.height) / 1_000_000)} megapixels — max ${MAX_MEGAPIXELS}). Downscale it and try again.`,
    );
  }

  await ensureWasm();
  let decoded: { width: number; height: number; data: Uint8ClampedArray | Uint8Array };
  try {
    decoded =
      format === 'jpeg'
        ? await decodeJpeg(buffer)
        : format === 'png'
          ? await decodePng(buffer)
          : await decodeWebp(buffer);
  } catch (err) {
    throw new ImageDecodeError(
      `Could not decode image: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let pixels: PixelBuffer = {
    width: decoded.width,
    height: decoded.height,
    data:
      decoded.data instanceof Uint8ClampedArray
        ? decoded.data
        : new Uint8ClampedArray(
            decoded.data.buffer,
            decoded.data.byteOffset,
            decoded.data.byteLength,
          ),
  };

  if (format === 'jpeg') {
    try {
      const orientation = (await exifr.orientation(buffer)) ?? 1;
      pixels = applyOrientation(pixels, orientation);
    } catch {
      // Missing/corrupt EXIF is fine — use the image as decoded.
    }
  }
  return pixels;
}
