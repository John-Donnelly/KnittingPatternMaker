import { describe, expect, it } from 'vitest';
import { decodeBase64Url, encodeBase64Url } from '../src/pattern/base64url.js';

describe('base64url encode/decode', () => {
  it('round-trips empty input', () => {
    expect(Array.from(decodeBase64Url(encodeBase64Url(new Uint8Array())))).toEqual([]);
  });

  it('round-trips byte lengths of 1, 2, and 3 (all padding cases)', () => {
    for (const bytes of [[1], [1, 2], [1, 2, 3]]) {
      const input = Uint8Array.from(bytes);
      expect(Array.from(decodeBase64Url(encodeBase64Url(input)))).toEqual(bytes);
    }
  });

  it('round-trips all 256 byte values', () => {
    const input = Uint8Array.from(Array.from({ length: 256 }, (_, i) => i));
    expect(Array.from(decodeBase64Url(encodeBase64Url(input)))).toEqual(Array.from(input));
  });

  it('produces only URL-safe characters (no +, /, =)', () => {
    const input = Uint8Array.from(Array.from({ length: 256 }, (_, i) => i));
    const encoded = encodeBase64Url(input);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('throws on invalid characters', () => {
    expect(() => decodeBase64Url('not valid base64!@#')).toThrow();
  });

  it('is deterministic', () => {
    const input = Uint8Array.from([5, 10, 15, 20, 25]);
    expect(encodeBase64Url(input)).toBe(encodeBase64Url(input));
  });
});
