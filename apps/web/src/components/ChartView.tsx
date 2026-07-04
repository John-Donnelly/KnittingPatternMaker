import { useEffect, useRef } from 'react';
import { stitchAspectRatio, type GaugeSpec, type GridJson } from 'knitting-pattern-core';
import { computeChartLayout } from '../chartLayout.js';

interface Props {
  grid: GridJson;
  gauge: GaugeSpec | undefined;
}

const MAJOR_GRID_LINE_EVERY = 10;

export function ChartView({ grid, gauge }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const containerWidth = canvas.parentElement?.clientWidth || 640;
      const layout = computeChartLayout(
        grid.width,
        grid.height,
        stitchAspectRatio(gauge),
        Math.min(containerWidth, 640),
        window.devicePixelRatio || 1,
      );

      // Backing store in device pixels + CSS size of exactly backing/dpr: the bitmap maps
      // 1:1 onto device pixels, so no browser resampling and no moire "grid lines".
      canvas.width = layout.canvasW;
      canvas.height = layout.canvasH;
      canvas.style.width = `${layout.cssW}px`;
      canvas.style.height = `${layout.cssH}px`;

      const { cellW, cellH } = layout;
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
          const paletteIndex = grid.indices[y * grid.width + x] ?? 0;
          const color = grid.palette[paletteIndex] ?? { r: 255, g: 255, b: 255 };
          ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
          ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        }
      }

      if (layout.drawGridLines) {
        // 1-device-pixel fillRect lines at exact cell edges — crisp at any zoom, unlike
        // fractional-width strokes centered on integer coordinates.
        for (let x = 0; x <= grid.width; x++) {
          ctx.fillStyle = x % MAJOR_GRID_LINE_EVERY === 0 ? '#5a5a5a' : '#b8b8b8';
          ctx.fillRect(Math.min(x * cellW, layout.canvasW - 1), 0, 1, layout.canvasH);
        }
        for (let y = 0; y <= grid.height; y++) {
          ctx.fillStyle = y % MAJOR_GRID_LINE_EVERY === 0 ? '#5a5a5a' : '#b8b8b8';
          ctx.fillRect(0, Math.min(y * cellH, layout.canvasH - 1), layout.canvasW, 1);
        }
      }
    };

    render();

    // Re-render when the container resizes (mobile rotation, panel collapse, ...).
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => render()) : null;
    if (observer && canvas.parentElement) observer.observe(canvas.parentElement);
    return () => observer?.disconnect();
  }, [grid, gauge]);

  return (
    <div className="chart-view">
      <canvas
        ref={canvasRef}
        className="chart-view__canvas"
        role="img"
        aria-label={`Knitting chart, ${grid.width} stitches wide by ${grid.height} rows tall, using ${grid.palette.length} color${grid.palette.length === 1 ? '' : 's'}`}
      />
    </div>
  );
}
