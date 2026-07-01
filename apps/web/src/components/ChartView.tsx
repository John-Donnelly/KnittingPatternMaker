import { useEffect, useRef } from 'react';
import { stitchAspectRatio, type GaugeSpec, type GridJson } from 'knitting-pattern-core';

interface Props {
  grid: GridJson;
  gauge: GaugeSpec | undefined;
}

const MAX_DISPLAY_WIDTH = 640;
const MAX_DISPLAY_HEIGHT = 640;
const MAX_CELL_PX = 28;
const MIN_CELL_PX = 3;
const GRID_LINE_MIN_CELL_PX = 6;
const MAJOR_GRID_LINE_EVERY = 10;

export function ChartView({ grid, gauge }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const aspect = stitchAspectRatio(gauge);
    const cellH = Math.max(
      MIN_CELL_PX,
      Math.min(
        MAX_CELL_PX,
        Math.floor(MAX_DISPLAY_HEIGHT / grid.height),
        Math.floor(MAX_DISPLAY_WIDTH / (grid.width * aspect)),
      ),
    );
    const cellW = Math.max(1, Math.round(cellH * aspect));

    canvas.width = cellW * grid.width;
    canvas.height = cellH * grid.height;

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const paletteIndex = grid.indices[y * grid.width + x] ?? 0;
        const color = grid.palette[paletteIndex] ?? { r: 255, g: 255, b: 255 };
        ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
        ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
      }
    }

    if (cellH >= GRID_LINE_MIN_CELL_PX) {
      for (let x = 0; x <= grid.width; x++) {
        ctx.strokeStyle = x % MAJOR_GRID_LINE_EVERY === 0 ? '#5a5a5a' : '#a0a0a0';
        ctx.lineWidth = x % MAJOR_GRID_LINE_EVERY === 0 ? 1 : 0.5;
        ctx.beginPath();
        ctx.moveTo(x * cellW, 0);
        ctx.lineTo(x * cellW, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y <= grid.height; y++) {
        ctx.strokeStyle = y % MAJOR_GRID_LINE_EVERY === 0 ? '#5a5a5a' : '#a0a0a0';
        ctx.lineWidth = y % MAJOR_GRID_LINE_EVERY === 0 ? 1 : 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y * cellH);
        ctx.lineTo(canvas.width, y * cellH);
        ctx.stroke();
      }
    }
  }, [grid, gauge]);

  return (
    <div className="chart-view">
      <canvas ref={canvasRef} className="chart-view__canvas" />
    </div>
  );
}
