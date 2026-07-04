import { useCallback, useEffect, useState } from 'react';
import {
  deleteSavedPattern,
  getSavedPattern,
  listSavedPatterns,
  savePattern,
} from '../api/client.js';
import { ApiError, type SavedPatternSummary } from '../api/types.js';

/** Inline "save this pattern" form, shown under a generated result when signed in. */
export function SavePatternForm({
  spec,
  defaultName,
  onSaved,
}: {
  spec: string;
  defaultName: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    savePattern(name.trim(), spec)
      .then(() => {
        setMessage('Saved to your patterns.');
        onSaved();
      })
      .catch((err: unknown) => {
        setMessage(err instanceof ApiError ? err.message : 'Could not save the pattern.');
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="panel">
      <h3>Save this pattern</h3>
      <div className="save-form">
        <input
          type="text"
          value={name}
          maxLength={100}
          aria-label="Pattern name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <button type="button" disabled={busy || !name.trim()} onClick={submit}>
          Save pattern
        </button>
      </div>
      {message && <p className="hint">{message}</p>}
    </div>
  );
}

/** The signed-in user's pattern library. */
export function MyPatterns({
  refreshKey,
  onOpen,
}: {
  /** Bump to reload the list (e.g. after a save). */
  refreshKey: number;
  /** Called with the share-spec token of the pattern to open. */
  onOpen: (spec: string) => void;
}) {
  const [patterns, setPatterns] = useState<SavedPatternSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    listSavedPatterns()
      .then((list) => {
        setPatterns(list);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Could not load saved patterns.');
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  const open = (id: number) => {
    getSavedPattern(id)
      .then((p) => onOpen(p.spec))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Could not open the pattern.');
      });
  };

  const remove = (id: number, name: string) => {
    // Deleting is permanent (patterns are only stored server-side) — always confirm.
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
    deleteSavedPattern(id)
      .then(reload)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Could not delete the pattern.');
      });
  };

  if (patterns === null && !error) return null;

  return (
    <div className="panel">
      <h3>My patterns</h3>
      {error && <p className="error">{error}</p>}
      {patterns && patterns.length === 0 && (
        <p className="hint">Nothing saved yet — generate a pattern and save it here.</p>
      )}
      {patterns && patterns.length > 0 && (
        <ul className="saved-list">
          {patterns.map((p) => (
            <li key={p.id} className="saved-list__row">
              <span className="saved-list__name">{p.name}</span>
              <span className="saved-list__meta">
                {p.technique} · {p.width}×{p.height} ·{' '}
                {new Date(p.createdAt * 1000).toLocaleDateString()}
              </span>
              <button type="button" onClick={() => open(p.id)}>
                Open
              </button>
              <button
                type="button"
                className="button--quiet"
                aria-label={`Delete ${p.name}`}
                onClick={() => remove(p.id, p.name)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
