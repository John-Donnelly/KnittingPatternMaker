import type {
  CropRect,
  DitherMode,
  FinishedSize,
  GaugeSpec,
  GridJson,
  PatternResultJson,
  SamplingMode,
  Technique,
  YardageEstimate,
} from 'knitting-pattern-core';

export interface PatternOptions {
  technique: Technique;
  widthStitches: number;
  heightRows: number;
  gauge?: GaugeSpec;
  maxColors: number;
  dither: DitherMode;
  sampling: SamplingMode;
  crop?: CropRect;
  seamless: boolean;
}

export interface PatternResponse {
  grid: GridJson;
  crop: CropRect;
  sourceImage: { width: number; height: number };
  finishedSize?: FinishedSize;
  pattern: PatternResultJson;
  yardage: YardageEstimate;
  shareLink: string;
  seamless: boolean;
}

export interface PatternSpecBody {
  technique: Technique;
  gauge?: GaugeSpec;
  grid: GridJson;
  seamless?: boolean;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
