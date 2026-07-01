import { useEffect, useMemo, useState } from 'react';
import {
  buildPatternResult,
  buildYardageEstimate,
  serializeGrid,
  suggestedCropRect,
  type CropRect,
  type GaugeSpec,
  type GridJson,
  type PatternResultJson,
  type YardageEstimate,
} from 'knitting-pattern-core';
import { ImageUploader } from './components/ImageUploader.js';
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
import { readPatternFromLocation } from './shareLink.js';

const DEFAULT_FORM: FormState = {
  technique: 'stranded',
  widthStitches: 40,
  heightRows: 40,
  useGauge: true,
  stitchesPer4In: 22,
  rowsPer4In: 30,
  maxColors: 8,
  dither: 'none',
  sampling: 'average',
  cropMode: 'auto',
  seamless: false,
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

  const crop: CropRect | null = useMemo(() => {
    if (!sourceDims) return null;
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

  useEffect(() => {
    if (!file || !crop) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const gauge = formGauge(debouncedForm);
    const options: PatternOptions = {
      technique: debouncedForm.technique,
      widthStitches: debouncedForm.widthStitches,
      heightRows: debouncedForm.heightRows,
      maxColors: debouncedForm.maxColors,
      dither: debouncedForm.dither,
      sampling: debouncedForm.sampling,
      crop,
      seamless: debouncedForm.seamless,
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
  }, [file, crop, debouncedForm]);

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
        <Header />
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

  const gauge = formGauge(form);

  return (
    <main className="app">
      <Header />

      <ImageUploader onImageSelected={onImageSelected} />

      {imageUrl && sourceDims && (
        <div className="layout">
          <div className="layout__side">
            <ControlsPanel value={form} onChange={setForm} />
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
                  gauge={gauge}
                  pattern={response.pattern}
                  yardage={response.yardage}
                  specBody={{
                    technique: form.technique,
                    grid: response.grid,
                    seamless: response.seamless,
                    ...(gauge ? { gauge } : {}),
                  }}
                  shareUrl={`${window.location.origin}${window.location.pathname}#p=${response.shareLink}`}
                  finishedSize={response.finishedSize}
                  seamless={response.seamless}
                />
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function Header() {
  return (
    <header className="app__header">
      <h1>Knitting Pattern Maker</h1>
      <p>Turn any image into deterministic pixel art and a complete knitting pattern.</p>
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
  seamless?: boolean | undefined;
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
}: ResultViewProps) {
  return (
    <div className="results">
      <ChartView grid={grid} gauge={gauge} />
      {finishedSize && (
        <p className="hint">
          Finished size: ~{finishedSize.widthIn.toFixed(1)}in × {finishedSize.heightIn.toFixed(1)}in
        </p>
      )}
      {seamless && (
        <p className="hint">
          This pattern tiles seamlessly — repeat the chart left-right and/or top-bottom to continue
          the design.
        </p>
      )}
      <LegendList grid={grid} yardage={yardage} />
      <WarningsPanel pattern={pattern} />
      <InstructionsList pattern={pattern} />
      <ExportBar spec={specBody} shareUrl={shareUrl} />
    </div>
  );
}
