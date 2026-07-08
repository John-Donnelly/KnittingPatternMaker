/**
 * Practical bounds shared by the frontend form validation, the backend request validation, and
 * the (untrusted-input) share-link decoder. Centralized so all three can never drift apart.
 */

/**
 * Largest chart dimension (stitches wide or rows tall). 800 covers essentially any hand-knit
 * project — an 800-stitch row is ~12 ft wide at a typical worsted gauge — while keeping worst-
 * case processing bounded (measured: a pathological 800x800 noise image quantizes in ~7s; a
 * realistic flat-color chart in ~1s) and the encoded share-link within MAX_SHARE_LINK_LENGTH.
 */
export const MAX_GRID_DIMENSION = 800;

export const MAX_COLORS = 40;

/**
 * Upper bound on an encoded share-link token's length, checked *before* attempting to
 * decompress it. Share links live in the URL fragment (never sent to a server), so a large
 * value is safe for the browser; the cap exists because deflate can expand a small malicious
 * payload by orders of magnitude, and this bound plus the post-decode MAX_GRID_DIMENSION check
 * stops a crafted link from triggering a huge allocation. Sized so a worst-case (noisy)
 * MAX_GRID_DIMENSION x MAX_GRID_DIMENSION, MAX_COLORS pattern still encodes under it (~350k),
 * with headroom; a realistic flat-color pattern is a few KB.
 */
export const MAX_SHARE_LINK_LENGTH = 600_000;
