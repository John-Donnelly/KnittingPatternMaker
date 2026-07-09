import { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyColorEdits,
  buildPatternResult,
  despeckleGrid,
  buildYardageEstimate,
  deserializeGrid,
  encodePatternSpec,
  isIdentityEdits,
  serializeGrid,
  stitchAspectRatio,
  suggestedCropRect,
  WOOL_SHADE_DELTA_E,
  type ColorEdit,
  type CropRect,
  type GaugeSpec,
  type GridJson,
  type PatternResultJson,
  type RepeatSpec,
  type SeamlessMode,
  type YardageEstimate,
} from 'knitting-pattern-core';
import { ImageUploader } from './components/ImageUploader.js';
import { LandingPage } from './components/LandingPage.js';
import { MyPatterns, SavePatternForm } from './components/SavedPatterns.js';
import { ControlsPanel, type FormState } from './components/ControlsPanel.js';
import { CropPreview } from './components/CropPreview.js';
import { ChartView } from './components/ChartView.js';
import { LegendList } from './components/LegendList.js';
import { InstructionsList } from './components/InstructionsList.js';
import { WarningsPanel } from './components/WarningsPanel.js';
import { ExportBar } from './components/ExportBar.js';
import { submitPattern } from './api/client.js';
import {
  ApiError,
  type PatternOptions,
  type PatternResponse,
  type PatternSpecBody,
} from './api/types.js';
import { useDebouncedValue } from './hooks/useDebouncedValue.js';
import { useAuth, type AuthStatus } from './hooks/useAuth.js';
import { readPatternFromLocation } from './shareLink.js';

const DEFAULT_FORM: FormState = {
  mode: 'auto',
  technique: 'stranded',
  widthStitches: 40,
  heightRows: 40,
  useGauge: true,
  stitchesPer4In: 22,
  rowsPer4In: 30,
  maxColors: 8,
  shadeMergeDeltaE: WOOL_SHADE_DELTA_E,
  dither: 'none',
  sampling: 'average',
  cropMode: 'auto',
  seamless: 'none',
  repeatAcross: 1,
  repeatDown: 1,
};

function formGauge(form: FormState): GaugeSpec | undefined {
  return form.useGauge
    ? { stitchesPer4In: form.stitchesPer4In, rowsPer4In: form.rowsPer4In }
    : undefined;
}

interface SharedView {
  grid: GridJson;
  technique: PatternResultJson['technique'];
  gauge: GaugeSpec | undefined;
  pattern: PatternResultJson;
  yardage: YardageEstimate;
  shareUrl: string;
  /** How this view was reached — a share link vs the user's own library. */
  origin: 'link' | 'saved';
}

function loadSharedView(origin: 'link' | 'saved' = 'link'): SharedView | null {
  const spec = readPatternFromLocation();
  if (!spec) return null;
  const pattern = buildPatternResult(spec.technique, spec.grid);
  const yardage = buildYardageEstimate(spec.grid, spec.gauge, pattern);
  return {
    grid: serializeGrid(spec.grid),
    technique: spec.technique,
    gauge: spec.gauge,
    pattern,
    yardage,
    shareUrl: window.location.href,
    origin,
  };
}

export function App() {
  const [sharedView, setSharedView] = useState<SharedView | null>(() => loadSharedView());
  const { auth, signOut } = useAuth();

  // Tiny path router: '/' is the landing page, '/app' is the pattern maker. Share links
  // (#p=...) take precedence on any path.
  const [route, setRoute] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPopState = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const navigate = (path: string) => {
    window.history.pushState(null, '', path);
    setRoute(path);
  };

  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [sourceDims, setSourceDims] = useState<{ width: number; height: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [response, setResponse] = useState<PatternResponse | null>(null);
  /** Per-palette-color on/off/substitute edits, applied client-side to the generated grid.
   * Reset whenever a fresh pattern arrives. */
  const [colorEdits, setColorEdits] = useState<ColorEdit[] | null>(null);
  /** Remove isolated single stitches (chart cleanup) — applied client-side like colorEdits. */
  const [despeckle, setDespeckle] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedForm = useDebouncedValue(form, 400);

  /** Long edge cap for client-side downscaling: bounds upload size and server memory while
   * staying comfortably above the ~4px-per-cell floor the chart-grid detector needs on
   * typical scans. */
  const MAX_SOURCE_EDGE = 3000;
  /** Formats every backend (Node/sharp AND Workers/WASM) decodes natively. Anything else
   * (GIF, BMP, TIFF, ...) is normalized client-side after decoding. */
  const NATIVE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  /** Monotonic token: if the user picks a second image while the first is still decoding,
   * only the LATEST selection may commit state (decodes can finish out of order). */
  const uploadSeq = useRef(0);

  const onImageSelected = (nextFile: File) => {
    const seq = ++uploadSeq.current;
    setUploadError(null);
    void (async () => {
      let bitmap: ImageBitmap;
      try {
        // Decode up front: catches HEIC/corrupt files the <input accept> filter lets through,
        // instead of silently rendering nothing (the old behavior for iPhone photos).
        bitmap = await createImageBitmap(nextFile);
      } catch {
        if (seq !== uploadSeq.current) return;
        // Keep any already-generated pattern on screen — a failed NEW selection must not
        // destroy the user's current work.
        setUploadError(
          "We couldn't read that image — it may be an unsupported format (like HEIC). Please use a JPG, PNG, or WebP file.",
        );
        return;
      }
      let chosen = nextFile;
      let width = bitmap.width;
      let height = bitmap.height;
      const needsResize = Math.max(width, height) > MAX_SOURCE_EDGE;
      const needsConvert = !NATIVE_TYPES.includes(nextFile.type);
      if (needsResize || needsConvert) {
        const scale = needsResize ? MAX_SOURCE_EDGE / Math.max(width, height) : 1;
        const w = Math.max(1, Math.round(width * scale));
        const h = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0, w, h);
          // Lossless-ish sources (PNG/GIF/BMP — typically flat art) re-encode as PNG so
          // chart screenshots don't gain JPEG halos; photos re-encode as high-quality JPEG.
          const keepPng = nextFile.type !== 'image/jpeg' && nextFile.type !== 'image/webp';
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, keepPng ? 'image/png' : 'image/jpeg', 0.92),
          );
          if (blob) {
            chosen = new File([blob], nextFile.name, { type: blob.type });
            width = w;
            height = h;
          }
        }
      }
      bitmap.close();
      if (seq !== uploadSeq.current) return;
      setResponse(null);
      setError(null);
      setFile(chosen);
      setSourceDims({ width, height });
      setImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(chosen);
      });
    })();
  };

  const manualCrop: CropRect | null = useMemo(() => {
    if (!sourceDims || debouncedForm.mode === 'auto') return null;
    if (debouncedForm.cropMode === 'full') {
      return { x: 0, y: 0, width: sourceDims.width, height: sourceDims.height };
    }
    return suggestedCropRect(
      sourceDims.width,
      sourceDims.height,
      debouncedForm.widthStitches,
      debouncedForm.heightRows,
      formGauge(debouncedForm),
    );
  }, [sourceDims, debouncedForm]);

  // What the crop preview shows: the client-side crop in custom mode, the backend's resolved
  // crop in auto mode (auto sends no crop and lets the backend choose).
  const crop: CropRect | null = form.mode === 'auto' ? (response?.crop ?? null) : manualCrop;

  // "Use full image" ignores the knitted aspect ratio; warn when that visibly distorts.
  const stretchWarning: string | null = useMemo(() => {
    if (form.mode !== 'custom' || form.cropMode !== 'full' || !sourceDims) return null;
    const cellAspect = stitchAspectRatio(formGauge(form));
    const knittedAspect = (form.widthStitches * cellAspect) / form.heightRows;
    const sourceAspect = sourceDims.width / sourceDims.height;
    const ratio = knittedAspect / sourceAspect;
    if (ratio >= 0.87 && ratio <= 1.15) return null;
    // Symmetric distortion: 0.5 means "2x taller", which is 100% distortion, not 50%.
    const pct = Math.round((Math.max(ratio, 1 / ratio) - 1) * 100);
    return `Heads-up: at ${form.widthStitches} × ${form.heightRows} the knitted result will be stretched ~${pct}% ${
      ratio > 1 ? 'wider' : 'taller'
    } than the image. Switch Crop to auto, or adjust the width/height, to keep its proportions.`;
  }, [form, sourceDims]);

  useEffect(() => {
    if (!file) return;
    if (debouncedForm.mode === 'custom' && !manualCrop) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const gauge = formGauge(debouncedForm);
    // Auto mode sends an empty request: the backend chooses every setting from the image
    // and reports its choices (and reasons) back in resolvedOptions / autoDecisions.
    const options: PatternOptions =
      debouncedForm.mode === 'auto'
        ? {}
        : {
            technique: debouncedForm.technique,
            widthStitches: debouncedForm.widthStitches,
            heightRows: debouncedForm.heightRows,
            maxColors: debouncedForm.maxColors,
            shadeMergeDeltaE: debouncedForm.shadeMergeDeltaE,
            dither: debouncedForm.dither,
            sampling: debouncedForm.sampling,
            ...(manualCrop ? { crop: manualCrop } : {}),
            seamless: debouncedForm.seamless,
            repeat: { across: debouncedForm.repeatAcross, down: debouncedForm.repeatDown },
            ...(gauge ? { gauge } : {}),
          };

    submitPattern(file, options)
      .then((res) => {
        if (!cancelled) {
          setResponse(res);
          setColorEdits(null);
          setDespeckle(false);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : 'Something went wrong processing the image.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file, manualCrop, debouncedForm]);

  /** Switch to custom mode pre-filled with what auto picked, so it can be tweaked from there. */
  const customizeFromAuto = () => {
    const resolved = response?.resolvedOptions;
    if (!resolved) return;
    setForm({
      mode: 'custom',
      technique: resolved.technique,
      widthStitches: resolved.widthStitches,
      heightRows: resolved.heightRows,
      useGauge: resolved.gauge !== undefined,
      stitchesPer4In: resolved.gauge?.stitchesPer4In ?? DEFAULT_FORM.stitchesPer4In,
      rowsPer4In: resolved.gauge?.rowsPer4In ?? DEFAULT_FORM.rowsPer4In,
      maxColors: resolved.maxColors,
      shadeMergeDeltaE: resolved.shadeMergeDeltaE,
      dither: resolved.dither,
      sampling: resolved.sampling,
      cropMode: 'auto',
      seamless: resolved.seamless,
      repeatAcross: resolved.repeat.across,
      repeatDown: resolved.repeat.down,
    });
  };

  const startNewPattern = () => {
    setSharedView(null);
    window.history.replaceState(null, '', window.location.pathname);
  };

  /** Bumped after each save so the library list refetches. */
  const [savedRefresh, setSavedRefresh] = useState(0);

  /** Open a saved pattern via its self-contained spec token (renders like a share link). */
  const openSavedPattern = (spec: string) => {
    window.location.hash = `p=${spec}`;
    setSharedView(loadSharedView('saved'));
    window.scrollTo({ top: 0 });
  };

  // Apply any per-color edits CLIENT-SIDE: the edited grid feeds the same pure core
  // functions the share-link view uses, so chart, instructions, yardage, exports, share
  // links, and saves all reflect the edits with no server round trip.
  //
  // Declared before every early return so this hook is called unconditionally on every render
  // (rules-of-hooks); it no-ops to null until a response exists.
  const view = useMemo(() => {
    if (!response) return null;
    const edits: ColorEdit[] = colorEdits ?? response.grid.palette.map(() => ({ enabled: true }));
    if (isIdentityEdits(edits) && !despeckle) {
      return {
        grid: response.grid,
        pattern: response.pattern,
        yardage: response.yardage,
        shareLink: response.shareLink,
        edits,
      };
    }
    const technique = response.resolvedOptions.technique;
    const gauge = response.resolvedOptions.gauge;
    let grid = deserializeGrid(response.grid);
    if (!isIdentityEdits(edits)) grid = applyColorEdits(grid, edits);
    if (despeckle) grid = despeckleGrid(grid);
    const pattern = buildPatternResult(technique, grid);
    const yardage = buildYardageEstimate(grid, gauge, pattern);
    const shareLink = encodePatternSpec({ technique, grid, ...(gauge ? { gauge } : {}) });
    return { grid: serializeGrid(grid), pattern, yardage, shareLink, edits };
  }, [response, colorEdits, despeckle]);

  if (sharedView) {
    const specBody: PatternSpecBody = {
      technique: sharedView.technique,
      grid: sharedView.grid,
      ...(sharedView.gauge ? { gauge: sharedView.gauge } : {}),
    };
    return (
      <main className="app">
        <Header auth={auth} onSignOut={signOut} />
        <div className="panel">
          <p>
            {sharedView.origin === 'saved'
              ? 'Viewing a pattern from your library.'
              : 'Viewing a shared pattern.'}{' '}
            <button type="button" onClick={startNewPattern}>
              Start a new pattern
            </button>
          </p>
        </div>
        <ResultView
          grid={sharedView.grid}
          gauge={sharedView.gauge}
          pattern={sharedView.pattern}
          yardage={sharedView.yardage}
          specBody={specBody}
          shareUrl={sharedView.shareUrl}
        />
        <Footer />
      </main>
    );
  }

  // Ground the result view in what the pattern was actually generated with (the response's
  // resolved options), not the possibly-not-yet-submitted form state.
  const resolvedGauge = response?.resolvedOptions.gauge;

  if (route !== '/app') {
    return (
      <main className="app">
        <Header auth={auth} onSignOut={signOut} />
        <LandingPage onGetStarted={() => navigate('/app')} />
        <Footer />
      </main>
    );
  }

  const mustSignIn = auth !== null && auth.authRequired && !auth.authenticated;
  if (mustSignIn) {
    return (
      <main className="app">
        <Header auth={auth} onSignOut={signOut} />
        <div className="panel">
          <p>Sign in to start making patterns.</p>
          <a className="landing__cta" href="/api/auth/login">
            Sign in
          </a>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main className="app">
      <Header auth={auth} onSignOut={signOut} />

      <ImageUploader onImageSelected={onImageSelected} />
      {uploadError && (
        <p className="error" role="alert">
          {uploadError}
        </p>
      )}

      {imageUrl && sourceDims && (
        <div className="layout">
          <div className="layout__side">
            <ControlsPanel
              value={form}
              onChange={setForm}
              autoDecisions={form.mode === 'auto' ? (response?.autoDecisions ?? null) : null}
              onCustomize={response ? customizeFromAuto : undefined}
            />
            {stretchWarning && (
              <div className="panel panel--warning">
                <p className="hint" style={{ margin: 0 }}>
                  {stretchWarning}
                </p>
              </div>
            )}
            {crop && (
              <CropPreview
                imageUrl={imageUrl}
                sourceWidth={sourceDims.width}
                sourceHeight={sourceDims.height}
                crop={crop}
              />
            )}
          </div>

          <div className="layout__main">
            {/* Screen readers announce generation progress; sighted users see the hint. */}
            <p className="hint" role="status" aria-live="polite">
              {loading ? (response ? 'Updating pattern…' : 'Making your pattern…') : ''}
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {response && view && (
              <div className={loading ? 'results-wrap results-wrap--stale' : 'results-wrap'}>
                <label className="field field--checkbox panel" style={{ marginBottom: 0 }}>
                  <input
                    type="checkbox"
                    checked={despeckle}
                    onChange={(e) => setDespeckle(e.target.checked)}
                  />
                  <span>
                    Remove single stitches (despeckle) — merges isolated stitches into their
                    surroundings for easier knitting
                  </span>
                </label>
                <ResultView
                  grid={view.grid}
                  gauge={resolvedGauge}
                  pattern={view.pattern}
                  yardage={view.yardage}
                  specBody={{
                    technique: response.resolvedOptions.technique,
                    grid: view.grid,
                    seamless: response.seamless !== 'none',
                    ...(resolvedGauge ? { gauge: resolvedGauge } : {}),
                  }}
                  shareUrl={`${window.location.origin}${window.location.pathname}#p=${view.shareLink}`}
                  finishedSize={response.finishedSize}
                  seamless={response.seamless}
                  repeat={response.repeat}
                  defaultTitle=""
                  legendEditable={{
                    originalPalette: response.grid.palette,
                    edits: view.edits,
                    onChange: setColorEdits,
                  }}
                />
                {auth?.authenticated && (
                  <SavePatternForm
                    spec={view.shareLink}
                    defaultName={`${response.resolvedOptions.technique} ${response.grid.width}×${response.grid.height}`}
                    onSaved={() => setSavedRefresh((k) => k + 1)}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {auth?.authenticated && <MyPatterns refreshKey={savedRefresh} onOpen={openSavedPattern} />}
      <Footer />
    </main>
  );
}

function Footer() {
  return (
    <footer className="app__footer">
      <p className="app__footer-brand">
        A{' '}
        <a
          className="app__footer-jad"
          href="https://jadapps.com"
          target="_blank"
          rel="noreferrer noopener"
        >
          JAD Apps
        </a>{' '}
        product
      </p>
      <p>
        © 2026 Knitting Pattern Maker · Patterns you generate are yours to knit, gift, and sell.
      </p>
    </footer>
  );
}

function Header({ auth, onSignOut }: { auth: AuthStatus | null; onSignOut: () => void }) {
  return (
    <header className="app__header">
      <div>
        <h1>Knitting Pattern Maker</h1>
        <p>Turn any image into deterministic pixel art and a complete knitting pattern.</p>
      </div>
      {auth?.authEnabled && (
        <div className="app__auth">
          {auth.authenticated ? (
            <>
              <span className="app__auth-user">{auth.user?.name ?? auth.user?.email ?? ''}</span>
              <button type="button" onClick={onSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <a className="app__auth-link" href="/api/auth/login">
              Sign in
            </a>
          )}
        </div>
      )}
    </header>
  );
}

interface ResultViewProps {
  grid: GridJson;
  gauge: GaugeSpec | undefined;
  pattern: PatternResultJson;
  yardage: YardageEstimate;
  specBody: PatternSpecBody;
  shareUrl: string;
  finishedSize?: { widthIn: number; heightIn: number } | undefined;
  seamless?: SeamlessMode | undefined;
  repeat?: RepeatSpec | undefined;
  defaultTitle?: string | undefined;
  legendEditable?: Parameters<typeof LegendList>[0]['editable'];
}

function ResultView({
  grid,
  gauge,
  pattern,
  yardage,
  specBody,
  shareUrl,
  finishedSize,
  seamless,
  repeat,
  defaultTitle,
  legendEditable,
}: ResultViewProps) {
  const repeated = repeat && (repeat.across > 1 || repeat.down > 1);
  return (
    <div className="results">
      <ChartView grid={grid} gauge={gauge} />
      <p className="hint">
        Chart: {grid.width} stitches × {grid.height} rows
        {repeated ? ` (motif repeated ${repeat.across} × ${repeat.down})` : ''}
      </p>
      {finishedSize && (
        <p className="hint">
          Finished size: ~{finishedSize.widthIn.toFixed(1)}in × {finishedSize.heightIn.toFixed(1)}in
        </p>
      )}
      {seamless && seamless !== 'none' && (
        <p className="hint">
          Seamless join ({seamless}) — the motif&rsquo;s edges are blended so the repeat loops with
          no visible seam.
        </p>
      )}
      <LegendList grid={grid} yardage={yardage} editable={legendEditable} />
      <WarningsPanel pattern={pattern} />
      <InstructionsList pattern={pattern} />
      <ExportBar spec={specBody} shareUrl={shareUrl} defaultTitle={defaultTitle} />
    </div>
  );
}
