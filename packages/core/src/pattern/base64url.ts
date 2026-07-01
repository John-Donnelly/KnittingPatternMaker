// Isomorphic base64url encode/decode operating directly on bytes, with no dependency on
// Node's `Buffer` or the browser's `btoa`/`atob` (which only work on binary strings), so this
// behaves identically in the browser (apps/web) and Node (apps/api, tests).

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const REVERSE = (() => {
  const map = new Uint8Array(256).fill(0xff);
  for (let i = 0; i < ALPHABET.length; i++) {
    map[ALPHABET.charCodeAt(i)] = i;
  }
  return map;
})();

export function encodeBase64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)];
    out += ALPHABET[b2 & 0x3f];
  }
  const remaining = bytes.length - i;
  if (remaining === 1) {
    const b0 = bytes[i] ?? 0;
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[(b0 & 0x03) << 4];
  } else if (remaining === 2) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += ALPHABET[(b1 & 0x0f) << 2];
  }
  return out;
}

export function decodeBase64Url(encoded: string): Uint8Array {
  const byteLength = Math.floor((encoded.length * 6) / 8);
  const out = new Uint8Array(byteLength);
  let outIndex = 0;
  let buffer = 0;
  let bitsInBuffer = 0;

  for (let i = 0; i < encoded.length; i++) {
    const code = encoded.charCodeAt(i);
    const value = REVERSE[code];
    if (value === undefined || value === 0xff) {
      throw new Error(`Invalid base64url character at position ${i}`);
    }
    buffer = (buffer << 6) | value;
    bitsInBuffer += 6;
    if (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      out[outIndex++] = (buffer >> bitsInBuffer) & 0xff;
    }
  }

  return out;
}
