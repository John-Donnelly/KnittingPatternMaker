import { useState } from 'react';
import { downloadBlob, exportPdf, exportPng } from '../api/client.js';
import type { PatternSpecBody } from '../api/types.js';

interface Props {
  spec: PatternSpecBody;
  shareUrl: string;
  /** Seed for the pattern-name field (e.g. "stranded 39×50"). */
  defaultTitle?: string | undefined;
}

/** ASCII-safe filename slug mirroring the server's Content-Disposition logic. */
function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
  return slug || 'knitting-pattern';
}

export function ExportBar({ spec, shareUrl, defaultTitle }: Props) {
  const [busy, setBusy] = useState<'pdf' | 'png' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'ok' | 'manual' | null>(null);
  const [title, setTitle] = useState(defaultTitle ?? '');

  const handleExport = async (kind: 'pdf' | 'png') => {
    setBusy(kind);
    setError(null);
    const named: PatternSpecBody = { ...spec, ...(title.trim() ? { title: title.trim() } : {}) };
    try {
      const blob = kind === 'pdf' ? await exportPdf(named) : await exportPng(named);
      const base = slugify(title.trim() || 'knitting-pattern');
      downloadBlob(blob, kind === 'pdf' ? `${base}.pdf` : `${base}-chart.png`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied('ok');
    } catch {
      // Clipboard API can be unavailable (permissions, insecure context) — fall back to
      // showing the URL for manual copying instead of failing silently.
      setCopied('manual');
      window.prompt('Copy this link:', shareUrl);
    }
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="panel export-bar">
      <h3>Export</h3>
      <label className="field">
        <span>Pattern name (printed on the PDF)</span>
        <input
          type="text"
          value={title}
          maxLength={80}
          placeholder="e.g. Winter Forest Cushion"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <div className="export-bar__buttons">
        <button type="button" disabled={busy !== null} onClick={() => void handleExport('pdf')}>
          {busy === 'pdf' ? 'Generating…' : 'Download PDF'}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void handleExport('png')}>
          {busy === 'png' ? 'Generating…' : 'Download chart PNG'}
        </button>
        <button type="button" onClick={() => void handleCopyLink()}>
          {copied === 'ok' ? 'Copied!' : 'Copy shareable link'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
