import {
  ApiError,
  type PatternOptions,
  type PatternResponse,
  type PatternSpecBody,
  type SavedPattern,
  type SavedPatternSummary,
} from './types.js';

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Request failed with status ${res.status}`;
  } catch {
    return `Request failed with status ${res.status}`;
  }
}

export async function submitPattern(
  image: File,
  options: PatternOptions,
): Promise<PatternResponse> {
  const form = new FormData();
  form.set('options', JSON.stringify(options));
  form.set('image', image);

  const res = await fetch('/api/pattern', { method: 'POST', body: form });
  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res));
  }
  return (await res.json()) as PatternResponse;
}

async function postForBlob(url: string, spec: PatternSpecBody): Promise<Blob> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res));
  }
  return res.blob();
}

export function exportPdf(spec: PatternSpecBody): Promise<Blob> {
  return postForBlob('/api/export/pdf', spec);
}

export function exportPng(spec: PatternSpecBody): Promise<Blob> {
  return postForBlob('/api/export/png', spec);
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) throw new ApiError(res.status, await readErrorMessage(res));
  return (await res.json()) as T;
}

export async function listSavedPatterns(): Promise<SavedPatternSummary[]> {
  const res = await fetch('/api/patterns');
  const body = await jsonOrThrow<{ patterns: SavedPatternSummary[] }>(res);
  return body.patterns;
}

export async function savePattern(name: string, spec: string): Promise<number> {
  const res = await fetch('/api/patterns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, spec }),
  });
  const body = await jsonOrThrow<{ id: number }>(res);
  return body.id;
}

export async function getSavedPattern(id: number): Promise<SavedPattern> {
  const res = await fetch(`/api/patterns/${id}`);
  return jsonOrThrow<SavedPattern>(res);
}

export async function deleteSavedPattern(id: number): Promise<void> {
  const res = await fetch(`/api/patterns/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new ApiError(res.status, await readErrorMessage(res));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
