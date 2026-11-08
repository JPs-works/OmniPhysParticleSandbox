import type { Bounds } from '../physics/types';

export type Tool = 'select' | 'probe' | 'charge' | 'plates' | 'bfield' | 'gun' | 'detector' | 'spray' | 'eraser';

export interface ToolDef {
  id: Tool;
  label: string;
  key: string;
  hint: string;
}

export const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Select / move', key: 'V', hint: 'Drag objects to move them, or drag a corner to resize. Click again on overlapping objects to cycle through them. Click a particle to probe it.' },
  { id: 'probe', label: 'Probe', key: 'I', hint: 'Click a particle to read q, m, v, KE, ω and the Larmor radius.' },
  { id: 'charge', label: 'Point charge', key: 'C', hint: 'Click to place a fixed source charge. Set its sign and size in Tool options.' },
  { id: 'plates', label: 'Charged plates', key: 'P', hint: 'Drag a rectangle to make a uniform E field between two electrodes.' },
  { id: 'bfield', label: 'Magnetic region', key: 'B', hint: 'Drag a rectangle of uniform B, either out of the page (⊙) or into it (⊗).' },
  { id: 'gun', label: 'Particle gun', key: 'G', hint: 'Press to place a gun, then drag to aim it. Set species, speed and rate in Tool options.' },
  { id: 'detector', label: 'Detector / wall', key: 'D', hint: 'Drag a line that absorbs particles and records where they hit.' },
  { id: 'spray', label: 'Spray particles', key: 'S', hint: 'Hold and drag to spray particles with random velocities.' },
  { id: 'eraser', label: 'Eraser', key: 'E', hint: 'Drag to erase particles, and any object whose handle you touch.' },
];

export type PlateDir = 'up' | 'down' | 'left' | 'right';

export interface ToolOptions {
  chargeQ: number;
  plateE: number;
  plateDir: PlateDir;
  bz: number;
  gunSpecies: string;
  gunSpeed: number;
  gunRate: number;
  gunSpread: number;
  spraySpecies: string;
  sprayRate: number;
  spraySpeed: number;
  eraserRadius: number;
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  chargeQ: 20,
  plateE: 40,
  plateDir: 'up',
  bz: 2,
  gunSpecies: 'p',
  gunSpeed: 120,
  gunRate: 10,
  gunSpread: 0.1,
  spraySpecies: 'p',
  sprayRate: 300,
  spraySpeed: 40,
  eraserRadius: 30,
};

export const dirVec = (d: PlateDir): [number, number] =>
  d === 'up' ? [0, 1] : d === 'down' ? [0, -1] : d === 'right' ? [1, 0] : [-1, 0];

export const DESIGN_VIEW: Bounds = { x0: -520, y0: -315, x1: 520, y1: 315 };

export interface Insets {
  t: number;
  b: number;
  l: number;
  r: number;
}

/**
 * Camera that frames `roi` (default: the 1000x600 design box) inside a css-pixel viewport, leaving
 * `inset` pixels free on each side for overlays. Aspect is preserved; the free direction is centred.
 */
export function fitView(w: number, h: number, roi: Bounds = DESIGN_VIEW, inset: Insets = { t: 0, b: 0, l: 0, r: 0 }): Bounds {
  const aw = Math.max(40, w - inset.l - inset.r), ah = Math.max(40, h - inset.t - inset.b);
  const rw = roi.x1 - roi.x0, rh = roi.y1 - roi.y0;
  const s = Math.max(rw / aw, rh / ah); // world units per pixel
  const cx = (roi.x0 + roi.x1) / 2, cy = (roi.y0 + roi.y1) / 2;
  // centre of the free area, shifted by the insets
  const x0 = cx - (aw / 2 + inset.l) * s, y1 = cy + (ah / 2 + inset.t) * s;
  return { x0, x1: x0 + w * s, y0: y1 - h * s, y1 };
}

/** Renderer capacity: sources beyond these limits would be simulated but invisible. */
export const SOURCE_LIMITS = { charge: 16, plates: 8, bfield: 8, mirror: 2 } as const;
