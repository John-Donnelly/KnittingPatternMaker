import type {
  AutoDecision,
  CropRect,
  DitherMode,
  FinishedSize,
  GaugeSpec,
  GridJson,
  PatternResultJson,
  RepeatSpec,
  ResolvedPatternOptions,
  SamplingMode,
  SeamlessMode,
  Technique,
  YardageEstimate,
} from 'knitting-pattern-core';

/** Every field optional: anything unset is chosen by the backend's auto mode from the image. */
export interface PatternOptions {
  technique?: Technique;
  widthStitches?: number;
  heightRows?: number;
  gauge?: GaugeSpec;
  maxColors?: number;
  dither?: DitherMode;
  sampling?: SamplingMode;
  crop?: CropRect;
  seamless?: SeamlessMode;
  repeat?: RepeatSpec;
  /** Wool-color grouping threshold (CIE76 delta-E); 0 keeps every shade. */
  shadeMergeDeltaE?: number;
}

export interface PatternResponse {
  grid: GridJson;
  crop: CropRect;
  sourceImage: { width: number; height: number };
  finishedSize?: FinishedSize;
  pattern: PatternResultJson;
  yardage: YardageEstimate;
  shareLink: string;
  seamless: SeamlessMode;
  repeat: RepeatSpec;
  motif: { widthStitches: number; heightRows: number };
  /** The concrete options the pattern was generated with (user's + auto-chosen). */
  resolvedOptions: ResolvedPatternOptions;
  /** Choices auto mode made for fields the request left unset, with reasons. */
  autoDecisions: AutoDecision[];
}

export interface PatternSpecBody {
  technique: Technique;
  gauge?: GaugeSpec;
  grid: GridJson;
  seamless?: boolean;
  /** Pattern title printed on the PDF and used in download filenames. */
  title?: string;
}

export interface SavedPatternSummary {
  id: number;
  name: string;
  technique: Technique;
  width: number;
  height: number;
  createdAt: number;
}

export interface SavedPattern extends SavedPatternSummary {
  /** The self-contained share-spec token. */
  spec: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
