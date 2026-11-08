// Shared, serialisable types for the Field Lab engine, worker and UI.

export interface SpeciesWeight {
  sp: string;
  w: number;
}

export interface PointChargeObj {
  kind: 'charge';
  id: string;
  /** semantic tag set by presets (e.g. 'selector-E') so explainers can read live values */
  role?: string;
  x: number;
  y: number;
  /** source charge in e */
  q: number;
}

/** Parallel-plate capacitor: uniform E inside the rectangle, no fringe field. */
export interface PlatesObj {
  kind: 'plates';
  id: string;
  /** semantic tag set by presets (e.g. 'selector-E') so explainers can read live values */
  role?: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  ex: number;
  ey: number;
  /** electrodes absorb particles that hit them */
  absorb: boolean;
}

/** Uniform B_z inside a rectangle (positive = out of page). */
export interface BRegionObj {
  kind: 'bfield';
  id: string;
  /** semantic tag set by presets (e.g. 'selector-E') so explainers can read live values */
  role?: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  bz: number;
  /** covers the whole world */
  infinite?: boolean;
}

/**
 * Magnetic bottle in slab geometry: Bx = B0 (1 + (R-1)(dx/L)^2), By = -dy dBx/dx,
 * which is divergence-free. Only defined inside |dx|<=L, |dy|<=H.
 */
export interface MirrorObj {
  kind: 'mirror';
  id: string;
  /** semantic tag set by presets (e.g. 'selector-E') so explainers can read live values */
  role?: string;
  x: number;
  y: number;
  L: number;
  H: number;
  b0: number;
  ratio: number;
}

export interface GunObj {
  kind: 'gun';
  id: string;
  /** semantic tag set by presets (e.g. 'selector-E') so explainers can read live values */
  role?: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  /** fractional uniform speed spread, e.g. 0.2 = +-20% */
  speedSpread: number;
  /** full angular spread in radians */
  angleSpread: number;
  /** lateral beam width (sim units) */
  width: number;
  /** particles per sim second */
  rate: number;
  species: SpeciesWeight[];
  enabled: boolean;
  /** stop after this many shots (0/undefined = unlimited) */
  maxCount?: number;
}

/** Absorbing line. record=true makes it a detector screen with a hit histogram. */
export interface DetectorObj {
  kind: 'detector';
  id: string;
  /** semantic tag set by presets (e.g. 'selector-E') so explainers can read live values */
  role?: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  record: boolean;
  label?: string;
}

export type FieldObject = PointChargeObj | PlatesObj | BRegionObj | MirrorObj | GunObj | DetectorObj;
export type FieldObjectKind = FieldObject['kind'];

export type Boundary = 'open' | 'reflect';

export interface SimParams {
  dt: number;
  timeScale: number;
  coulomb: boolean;
  gravity: boolean;
  kCoulomb: number;
  G: number;
  /** Plummer softening for particle-particle forces */
  softening: number;
  /** softening for fixed point-charge objects */
  chargeSoftening: number;
  boundary: Boundary;
  /** linear drag rate (1/s), applied as exp(-drag dt) */
  drag: number;
  theta: number;
  /** use Barnes-Hut above this many particles (direct sum below) */
  bhThreshold: number;
  /** Debye screening length for particle-particle Coulomb (0 = unscreened 1/r) */
  screening: number;
  /** open boundary: particles are removed this far outside the sim box */
  openMargin: number;
  maxParticles: number;
  maxSubsteps: number;
}

/** Fixed simulation box: the 1000 x 600 design box plus a small border. Independent of the camera. */
export const SIM_BOUNDS: Bounds = { x0: -520, y0: -315, x1: 520, y1: 315 };

export const DEFAULT_PARAMS: SimParams = {
  dt: 1 / 120,
  timeScale: 1,
  coulomb: false,
  gravity: false,
  kCoulomb: 1000,
  G: 400,
  softening: 4,
  chargeSoftening: 3,
  boundary: 'open',
  drag: 0,
  theta: 0.6,
  bhThreshold: 500,
  screening: 0,
  openMargin: 450,
  maxParticles: 8000,
  maxSubsteps: 128,
};

export interface ParticleInit {
  sp: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  vz?: number;
  m?: number;
}

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface SceneSpec {
  objects: FieldObject[];
  particles: ParticleInit[];
  params: Partial<SimParams>;
  /** index into particles[] to auto-select for the probe */
  select?: number;
  /** region of interest the camera should frame */
  view?: Bounds;
}

export interface DetectorSummary {
  id: string;
  /** semantic tag set by presets (e.g. 'selector-E') so explainers can read live values */
  role?: string;
  total: number;
  /** hit position along the detector, 0..1, 64 bins, per species index (sparse) */
  bins: Record<number, number[]>;
  /** speeds of recent hits */
  speeds: number[];
}

export interface SimStats {
  n: number;
  time: number;
  steps: number;
  ke: number;
  pe: number;
  /** speed histogram */
  hist: number[];
  histMax: number;
  /** most common species and its mean KE (for MB overlay) */
  domSp: number;
  domFrac: number;
  domMeanKE: number;
  domDof: number;
  removedBoundary: number;
  removedAbsorbed: number;
  spawned: number;
  /** exit-angle histogram (deg, 36 bins of 5 deg) for open boundary removals */
  exitHist: number[];
  detectors: DetectorSummary[];
  angMom: number;
  /** particle count per species index */
  spCounts: Record<number, number>;
}

export interface ProbeInfo {
  id: number;
  sp: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  vz: number;
  q: number;
  m: number;
  ex: number;
  ey: number;
  bx: number;
  by: number;
  bz: number;
}
