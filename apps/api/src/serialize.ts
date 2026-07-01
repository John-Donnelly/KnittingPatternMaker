import type { Grid, RGB } from 'knitting-pattern-core';

export interface GridJson {
  width: number;
  height: number;
  indices: number[];
  palette: RGB[];
}

export function serializeGrid(grid: Grid): GridJson {
  return {
    width: grid.width,
    height: grid.height,
    indices: Array.from(grid.indices),
    palette: grid.palette,
  };
}

export function deserializeGrid(json: GridJson): Grid {
  return {
    width: json.width,
    height: json.height,
    indices: Uint16Array.from(json.indices),
    palette: json.palette,
  };
}

/** JSON has no Map type; serialize `Map<number, number>` as an array of [key, value] pairs. */
export function serializeNumberMap(map: ReadonlyMap<number, number>): [number, number][] {
  return Array.from(map.entries());
}
