export interface Run<T> {
  value: T;
  count: number;
}

/** Run-length encodes a sequence, preserving order. Pure/deterministic. */
export function runLengthEncode<T>(values: readonly T[]): Run<T>[] {
  const runs: Run<T>[] = [];
  for (const value of values) {
    const last = runs[runs.length - 1];
    if (last && last.value === value) {
      last.count++;
    } else {
      runs.push({ value, count: 1 });
    }
  }
  return runs;
}
