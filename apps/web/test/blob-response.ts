/**
 * A stand-in for `new Response(blob)` in the jsdom environment.
 *
 * jsdom installs its own `Blob`, which has no `.stream()`. undici's `Response`
 * requires one, so `new Response(jsdomBlob)` throws
 * `TypeError: object.stream is not a function` on Node 22. Node 24 happens to
 * pair implementations that interoperate, which is why this only ever broke on
 * CI (pinned to 22 by .nvmrc) and never locally on a newer runtime.
 *
 * The code under test reads `ok` and calls `blob()`, so a literal covering
 * exactly that surface is both sufficient and independent of which Blob and
 * Response implementations happen to be paired at runtime.
 */
export function blobResponse(blob: Blob, init: { ok?: boolean; status?: number } = {}) {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    blob: async () => blob,
    arrayBuffer: async () => blob.arrayBuffer(),
    text: async () => blob.text(),
  } as unknown as Response;
}
