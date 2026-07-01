import { useState } from 'react';
import { downloadBlob, exportPdf, exportPng } from '../api/client.js';
import type { PatternSpecBody } from '../api/types.js';

interface Props {
  spec: PatternSpecBody;
  shareUrl: string;
}

export function ExportBar({ spec, shareUrl }: Props) {
  const [busy, setBusy] = useState<'pdf' | 'png' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleExport = async (kind: 'pdf' | 'png') => {
    setBusy(kind);
    setError(null);
    try {
      const blob = kind === 'pdf' ? await exportPdf(spec) : await exportPng(spec);
      downloadBlob(blob, kind === 'pdf' ? 'knitting-pattern.pdf' : 'knitting-pattern-chart.png');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="panel export-bar">
      <h3>Export</h3>
      <div className="export-bar__buttons">
        <button type="button" disabled={busy !== null} onClick={() => void handleExport('pdf')}>
          {busy === 'pdf' ? 'Generating…' : 'Download PDF'}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void handleExport('png')}>
          {busy === 'png' ? 'Generating…' : 'Download chart PNG'}
        </button>
        <button type="button" onClick={() => void handleCopyLink()}>
          {copied ? 'Copied!' : 'Copy shareable link'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
