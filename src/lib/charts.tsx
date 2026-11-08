// Tiny dependency-free SVG charts for the HUD and explainer cards.
import type { ReactElement } from 'react';

export function Sparkline({ data, width = 160, height = 32, color = '#67e8f9' }: { data: number[]; width?: number; height?: number; color?: string }) {
  if (data.length < 2) return <svg width={width} height={height} />;
  let lo = Infinity, hi = -Infinity;
  for (const v of data) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const pad = Math.max((hi - lo) * 0.1, Math.abs(hi) * 1e-4, 1e-9);
  lo -= pad;
  hi += pad;
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * width).toFixed(1)},${(height - ((v - lo) / (hi - lo)) * height).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} className="block overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

export interface BarSeries {
  values: number[];
  color: string;
}

/** Stacked bars with optional overlay curve (same bin count). */
export function Bars({
  series,
  overlay,
  width = 240,
  height = 60,
  log = false,
  markers = [],
}: {
  series: BarSeries[];
  overlay?: { values: number[]; color: string };
  width?: number;
  height?: number;
  log?: boolean;
  markers?: { at: number; color: string; label?: string }[];
}) {
  const n = series[0]?.values.length ?? overlay?.values.length ?? 0;
  if (!n) return <svg width={width} height={height} />;
  const tot = new Array(n).fill(0);
  for (const s of series) s.values.forEach((v, i) => (tot[i] += v));
  let max = Math.max(1e-9, ...tot, ...(overlay?.values ?? []));
  const f = (v: number) => (log ? Math.log10(1 + v) / Math.log10(1 + max) : v / max);
  if (!isFinite(max)) max = 1;
  const bw = width / n;
  const rects: ReactElement[] = [];
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = 0; k < series.length; k++) {
      const v = series[k].values[i];
      if (!v) continue;
      const y0 = f(acc), y1 = f(acc + v);
      acc += v;
      rects.push(<rect key={`${i}-${k}`} x={i * bw + 0.5} width={Math.max(bw - 1, 0.5)} y={height - y1 * height} height={(y1 - y0) * height} fill={series[k].color} opacity={0.85} />);
    }
  }
  const line = overlay
    ? overlay.values.map((v, i) => `${((i + 0.5) * bw).toFixed(1)},${(height - f(v) * height).toFixed(1)}`).join(' ')
    : '';
  return (
    <svg width={width} height={height} className="block overflow-visible">
      <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke="rgba(148,163,184,0.35)" />
      {rects}
      {overlay && <polyline points={line} fill="none" stroke={overlay.color} strokeWidth={1.4} strokeDasharray="3 2" />}
      {markers.map((m, i) => (
        <g key={i}>
          <line x1={m.at * width} x2={m.at * width} y1={0} y2={height} stroke={m.color} strokeWidth={1} strokeDasharray="2 2" />
        </g>
      ))}
    </svg>
  );
}
