import { useEffect, useMemo, useState } from 'react';
import {
  buildPatternResult,
  buildYardageEstimate,
  serializeGrid,
  suggestedCropRect,
  WOOL_SHADE_DELTA_E,
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
import { useImageDimensions } from './hooks/useImageDimensions.js';
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
}

function loadSharedView(): SharedView | null {
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
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [response, setResponse] = useState<PatternResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceDims = useImageDimensions(imageUrl);
  const debouncedForm = useDebouncedValue(form, 400);

  const onImageSelected = (nextFile: File) => {
    setFile(nextFile);
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(nextFile);
    });
    setResponse(null);
    setError(null);
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
        if (!cancelled) setResponse(res);
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
            Viewing a shared pattern.{' '}
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
      </main>
    );
  }

  return (
    <main className="app">
      <Header auth={auth} onSignOut={signOut} />

      <ImageUploader onImageSelected={onImageSelected} />

      {imageUrl && sourceDims && (
        <div className="layout">
          <div className="layout__side">
            <ControlsPanel
              value={form}
              onChange={setForm}
              autoDecisions={form.mode === 'auto' ? (response?.autoDecisions ?? null) : null}
              onCustomize={response ? customizeFromAuto : undefined}
            />
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
            {loading && !response && <p className="hint">Processing…</p>}
            {error && <p className="error">{error}</p>}
            {response && (
              <>
                {loading && <p className="hint">Updating…</p>}
                <ResultView
                  grid={response.grid}
                  gauge={resolvedGauge}
                  pattern={response.pattern}
                  yardage={response.yardage}
                  specBody={{
                    technique: response.resolvedOptions.technique,
                    grid: response.grid,
                    seamless: response.seamless !== 'none',
                    ...(resolvedGauge ? { gauge: resolvedGauge } : {}),
                  }}
                  shareUrl={`${window.location.origin}${window.location.pathname}#p=${response.shareLink}`}
                  finishedSize={response.finishedSize}
                  seamless={response.seamless}
                  repeat={response.repeat}
                />
              </>
            )}
          </div>
        </div>
      )}
    </main>
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
      <LegendList grid={grid} yardage={yardage} />
      <WarningsPanel pattern={pattern} />
      <InstructionsList pattern={pattern} />
      <ExportBar spec={specBody} shareUrl={shareUrl} />
    </div>
  );
}
