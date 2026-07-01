/**
 * Practical bounds shared by the frontend form validation, the backend request validation, and
 * the (untrusted-input) share-link decoder. Centralized so all three can never drift apart.
 */

/** Large enough for real hand-knitting projects, small enough to process/render/print reliably. */
export const MAX_GRID_DIMENSION = 400;

export const MAX_COLORS = 40;

/**
 * Upper bound on an encoded share-link token's length, checked *before* attempting to
 * decompress it. Share links are decoded from untrusted URL input (anyone can craft one), and
 * deflate can expand a small payload by orders of magnitude (e.g. a highly repetitive index
 * array) — this bound, combined with the post-decode MAX_GRID_DIMENSION check, keeps a
 * maliciously crafted link from triggering a multi-gigabyte allocation in the browser.
 * Generous relative to real patterns: a 400x400, 40-color pattern encodes to well under this.
 */
export const MAX_SHARE_LINK_LENGTH = 200_000;
