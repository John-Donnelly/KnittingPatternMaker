import { decodePatternSpec, encodePatternSpec, type PatternSpec } from 'knitting-pattern-core';

const HASH_PARAM = 'p';

export function buildShareUrl(spec: PatternSpec): string {
  const token = encodePatternSpec(spec);
  const url = new URL(window.location.href);
  url.hash = `${HASH_PARAM}=${token}`;
  return url.toString();
}

/** Reads a pattern spec out of the current URL's hash fragment, if present and valid. */
export function readPatternFromLocation(): PatternSpec | undefined {
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const token = params.get(HASH_PARAM);
  if (!token) return undefined;

  try {
    return decodePatternSpec(token);
  } catch {
    return undefined;
  }
}

export function clearPatternFromLocation(): void {
  const url = new URL(window.location.href);
  url.hash = '';
  window.history.replaceState(null, '', url.toString());
}
