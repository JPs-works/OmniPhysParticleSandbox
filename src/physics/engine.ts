// OmniPhys Field Lab engine.
//
// - 2D positions, 3D velocities (vz lets the magnetic bottle gyrate out of plane).
// - Lorentz force F = q(E + v x B), non-relativistic. Each fixed step is kick-drift-kick for
//   pairwise forces; inside it every particle takes ns symmetric drift / Boris / drift sub-steps.
//   The Boris rotation is phase-corrected (t = b tan(w h/2)) so the gyro-period is exact, and a
//   sub-step whose gyration is under-resolved (w h > 0.3) uses the exact uniform-field solution.
// - Pairwise Plummer-softened Coulomb and gravity: direct sum up to params.bhThreshold particles,
//   Barnes-Hut quadtree above; optional Debye screening (Yukawa) via a cell list.
// - The sim box (SIM_BOUNDS) is fixed and independent of the camera.
// - Seeded RNG (mulberry32) so reset-to-seed reproduces a run exactly.

import { SPECIES, speciesIdx } from './species';
import type {
  Bounds,
  DetectorSummary,
  FieldObject,
  GunObj,
  ParticleInit,
  ProbeInfo,
  SceneSpec,
  SimParams,
  SimStats,
} from './types';
import { DEFAULT_PARAMS, SIM_BOUNDS } from './types';

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DET_BINS = 64;
const V_FLOOR = 5;

interface DetState {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  record: boolean;
  total: number;
  bins: Map<number, Float64Array>;
  speeds: number[];
}

export class Engine {
  params: SimParams = { ...DEFAULT_PARAMS };
  bounds: Bounds = { ...SIM_BOUNDS };

  cap = 0;
  n = 0;
  x!: Float64Array;
  y!: Float64Array;
  vx!: Float64Array;
  vy!: Float64Array;
  vz!: Float64Array;
  /** position at the start of the latest step (for interpolation + collision) */
  px!: Float64Array;
  py!: Float64Array;
  /** position emitted with the previous render frame (for trails) */
  fx!: Float64Array;
  fy!: Float64Array;
  q!: Float64Array;
  m!: Float64Array;
  sp!: Uint8Array;
  ids!: Int32Array;
  ax!: Float64Array;
  ay!: Float64Array;

  nextId = 1;
  time = 0;
  steps = 0;
  acc = 0;
  rng = mulberry32(1);
  seed = 1;

  removedBoundary = 0;
  removedAbsorbed = 0;
  spawned = 0;
  exitHist = new Float64Array(36);

  objects: FieldObject[] = [];
  // flattened field sources
  private charges = new Float64Array(0); // x,y,q
  private plates = new Float64Array(0); // x0,y0,x1,y1,ex,ey
  private bregs = new Float64Array(0); // x0,y0,x1,y1,bz,inf
  private mirrors = new Float64Array(0); // x,y,L,H,b0,ratio
  private walls = new Float64Array(0); // x0,y0,x1,y1,detIndex(-1 = plain wall)
  private guns: { g: GunObj; acc: number; emitted: number; cum: number[]; spi: number[] }[] = [];
  dets: DetState[] = [];

  // Barnes-Hut storage
  private bhCap = 0;
  private nCx!: Float64Array;
  private nCy!: Float64Array;
  private nHalf!: Float64Array;
  private nM!: Float64Array;
  private nMx!: Float64Array;
  private nMy!: Float64Array;
  private nQ!: Float64Array;
  private nAq!: Float64Array;
  private nQx!: Float64Array;
  private nQy!: Float64Array;
  private nChild!: Int32Array; // 4 per node, -1 none
  private nLeaf!: Int32Array; // particle index, -1 internal/empty, -2 bucket overflow
  private nCount = 0;
  private stack = new Int32Array(4096);

  private f = new Float64Array(5);

  constructor(cap = 8192) {
    this.alloc(cap);
  }

  private alloc(cap: number) {
    const old = this.cap ? this : null;
    const F = (a?: Float64Array) => {
      const b = new Float64Array(cap);
      if (a) b.set(a.subarray(0, Math.min(a.length, cap)));
      return b;
    };
    this.x = F(old?.x);
    this.y = F(old?.y);
    this.vx = F(old?.vx);
    this.vy = F(old?.vy);
    this.vz = F(old?.vz);
    this.px = F(old?.px);
    this.py = F(old?.py);
    this.fx = F(old?.fx);
    this.fy = F(old?.fy);
    this.q = F(old?.q);
    this.m = F(old?.m);
    this.ax = F(old?.ax);
    this.ay = F(old?.ay);
    const sp = new Uint8Array(cap);
    const ids = new Int32Array(cap);
    if (old) {
      sp.set(old.sp.subarray(0, Math.min(old.n, cap)));
      ids.set(old.ids.subarray(0, Math.min(old.n, cap)));
    }
    this.sp = sp;
    this.ids = ids;
    this.cap = cap;
  }

  // ---------------------------------------------------------------- setup

  reset(seed: number) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.n = 0;
    this.nextId = 1;
    this.time = 0;
    this.steps = 0;
    this.acc = 0;
    this.removedBoundary = 0;
    this.removedAbsorbed = 0;
    this.spawned = 0;
    this.exitHist.fill(0);
    for (const d of this.dets) this.clearDet(d);
    for (const g of this.guns) {
      g.acc = 0;
      g.emitted = 0;
    }
  }

  loadScene(scene: SceneSpec, seed: number) {
    this.params = { ...DEFAULT_PARAMS, ...scene.params };
    this.reset(seed);
    this.setObjects(scene.objects);
    for (const p of scene.particles) this.addParticle(p);
  }

  setParams(p: Partial<SimParams>) {
    Object.assign(this.params, p);
    this.aDirty = true;
  }

  setBounds(b: Bounds) {
    this.bounds = { ...b };
  }

  setObjects(objs: FieldObject[]) {
    this.objects = objs.map((o) => ({ ...o })) as FieldObject[];
    const ch: number[] = [];
    const pl: number[] = [];
    const br: number[] = [];
    const mi: number[] = [];
    const wa: number[] = [];
    const oldDets = new Map(this.dets.map((d) => [d.id, d]));
    const oldGuns = new Map(this.guns.map((g) => [g.g.id, g]));
    this.dets = [];
    this.guns = [];
    for (const o of this.objects) {
      switch (o.kind) {
        case 'charge':
          ch.push(o.x, o.y, o.q);
          break;
        case 'plates': {
          const x0 = Math.min(o.x0, o.x1), x1 = Math.max(o.x0, o.x1);
          const y0 = Math.min(o.y0, o.y1), y1 = Math.max(o.y0, o.y1);
          pl.push(x0, y0, x1, y1, o.ex, o.ey);
          if (o.absorb) {
            if (Math.abs(o.ey) >= Math.abs(o.ex)) wa.push(x0, y0, x1, y0, -1, x0, y1, x1, y1, -1);
            else wa.push(x0, y0, x0, y1, -1, x1, y0, x1, y1, -1);
          }
          break;
        }
        case 'bfield': {
          if (o.infinite) br.push(-1e9, -1e9, 1e9, 1e9, o.bz, 1);
          else br.push(Math.min(o.x0, o.x1), Math.min(o.y0, o.y1), Math.max(o.x0, o.x1), Math.max(o.y0, o.y1), o.bz, 0);
          break;
        }
        case 'mirror':
          mi.push(o.x, o.y, o.L, o.H, o.b0, o.ratio);
          break;
        case 'gun': {
          const cum: number[] = [];
          const spi: number[] = [];
          let s = 0;
          for (const w of o.species) {
            s += w.w;
            cum.push(s);
            spi.push(speciesIdx(w.sp));
          }
          for (let i = 0; i < cum.length; i++) cum[i] /= s || 1;
          this.guns.push({ g: o, acc: oldGuns.get(o.id)?.acc ?? 0, emitted: oldGuns.get(o.id)?.emitted ?? 0, cum, spi });
          break;
        }
        case 'detector': {
          const prev = oldDets.get(o.id);
          const d: DetState = {
            id: o.id,
            x0: o.x0,
            y0: o.y0,
            x1: o.x1,
            y1: o.y1,
            record: o.record,
            total: prev?.total ?? 0,
            bins: prev?.bins ?? new Map(),
            speeds: prev?.speeds ?? [],
          };
          this.dets.push(d);
          wa.push(o.x0, o.y0, o.x1, o.y1, this.dets.length - 1);
          break;
        }
      }
    }
    this.charges = new Float64Array(ch);
    this.plates = new Float64Array(pl);
    this.bregs = new Float64Array(br);
    this.mirrors = new Float64Array(mi);
    this.walls = new Float64Array(wa);
  }

  private clearDet(d: DetState) {
    d.total = 0;
    d.bins = new Map();
    d.speeds = [];
  }

  clearDetectors() {
    for (const d of this.dets) this.clearDet(d);
    this.exitHist.fill(0);
    this.removedAbsorbed = 0;
    this.removedBoundary = 0;
  }

  addParticle(p: ParticleInit): number {
    if (this.n >= this.params.maxParticles) return -1;
    if (this.n >= this.cap) this.alloc(this.cap * 2);
    const i = this.n++;
    const s = speciesIdx(p.sp);
    const spec = SPECIES[s];
    this.x[i] = this.px[i] = this.fx[i] = p.x;
    this.y[i] = this.py[i] = this.fy[i] = p.y;
    this.vx[i] = p.vx;
    this.vy[i] = p.vy;
    this.vz[i] = p.vz ?? 0;
    this.q[i] = spec.q;
    this.m[i] = p.m ?? spec.m;
    this.sp[i] = s;
    this.ax[i] = 0;
    this.ay[i] = 0;
    this.ids[i] = this.nextId++;
    this.spawned++;
    this.aDirty = true;
    return this.ids[i];
  }

  /** Spray `count` particles in a disc with isotropic random velocities of magnitude ~speed. */
  spray(sp: string, cx: number, cy: number, radius: number, count: number, speed: number) {
    for (let k = 0; k < count; k++) {
      const r = radius * Math.sqrt(this.rng());
      const a = this.rng() * Math.PI * 2;
      const va = this.rng() * Math.PI * 2;
      const v = speed * (0.5 + this.rng());
      this.addParticle({ sp, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), vx: v * Math.cos(va), vy: v * Math.sin(va) });
    }
  }

  remove(i: number) {
    const j = --this.n;
    if (i !== j) {
      this.x[i] = this.x[j];
      this.y[i] = this.y[j];
      this.vx[i] = this.vx[j];
      this.vy[i] = this.vy[j];
      this.vz[i] = this.vz[j];
      this.px[i] = this.px[j];
      this.py[i] = this.py[j];
      this.fx[i] = this.fx[j];
      this.fy[i] = this.fy[j];
      this.q[i] = this.q[j];
      this.m[i] = this.m[j];
      this.sp[i] = this.sp[j];
      this.ids[i] = this.ids[j];
      this.ax[i] = this.ax[j];
      this.ay[i] = this.ay[j];
    }
  }

  eraseParticles(cx: number, cy: number, r: number) {
    const r2 = r * r;
    for (let i = this.n - 1; i >= 0; i--) {
      const dx = this.x[i] - cx, dy = this.y[i] - cy;
      if (dx * dx + dy * dy <= r2) this.remove(i);
    }
  }

  clearParticles() {
    this.n = 0;
    this.aDirty = true;
  }

  indexOf(id: number): number {
    for (let i = 0; i < this.n; i++) if (this.ids[i] === id) return i;
    return -1;
  }

  pick(cx: number, cy: number, r: number): number {
    let best = -1, bd = r * r;
    for (let i = 0; i < this.n; i++) {
      const dx = this.x[i] - cx, dy = this.y[i] - cy;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best < 0 ? -1 : this.ids[best];
  }

  // ---------------------------------------------------------------- fields

  /** Writes Ex, Ey, Bx, By, Bz at (x, y) from external sources into out. */
  fieldAt(x: number, y: number, out: Float64Array) {
    let ex = 0, ey = 0, bx = 0, by = 0, bz = 0;
    const ch = this.charges;
    const k = this.params.kCoulomb;
    const e2 = this.params.chargeSoftening * this.params.chargeSoftening;
    for (let c = 0; c < ch.length; c += 3) {
      const dx = x - ch[c], dy = y - ch[c + 1];
      const r2 = dx * dx + dy * dy + e2;
      const inv = (k * ch[c + 2]) / (r2 * Math.sqrt(r2));
      ex += dx * inv;
      ey += dy * inv;
    }
    const pl = this.plates;
    for (let c = 0; c < pl.length; c += 6) {
      if (x >= pl[c] && x <= pl[c + 2] && y >= pl[c + 1] && y <= pl[c + 3]) {
        ex += pl[c + 4];
        ey += pl[c + 5];
      }
    }
    const br = this.bregs;
    for (let c = 0; c < br.length; c += 6) {
      if (x >= br[c] && x <= br[c + 2] && y >= br[c + 1] && y <= br[c + 3]) bz += br[c + 4];
    }
    const mi = this.mirrors;
    for (let c = 0; c < mi.length; c += 6) {
      const dx = x - mi[c], dy = y - mi[c + 1];
      const L = mi[c + 2];
      if (Math.abs(dx) <= L && Math.abs(dy) <= mi[c + 3]) {
        const b0 = mi[c + 4], g = (mi[c + 5] - 1) / (L * L);
        bx += b0 * (1 + g * dx * dx);
        by += -dy * b0 * 2 * g * dx;
      }
    }
    out[0] = ex;
    out[1] = ey;
    out[2] = bx;
    out[3] = by;
    out[4] = bz;
  }

  /** External electrostatic potential (point charges + ideal plates). */
  potentialAt(x: number, y: number): number {
    let phi = 0;
    const ch = this.charges;
    const k = this.params.kCoulomb;
    const e2 = this.params.chargeSoftening * this.params.chargeSoftening;
    for (let c = 0; c < ch.length; c += 3) {
      const dx = x - ch[c], dy = y - ch[c + 1];
      phi += (k * ch[c + 2]) / Math.sqrt(dx * dx + dy * dy + e2);
    }
    const pl = this.plates;
    for (let c = 0; c < pl.length; c += 6) {
      if (x >= pl[c] && x <= pl[c + 2] && y >= pl[c + 1] && y <= pl[c + 3]) {
        const cx = 0.5 * (pl[c] + pl[c + 2]), cy = 0.5 * (pl[c + 1] + pl[c + 3]);
        phi -= pl[c + 4] * (x - cx) + pl[c + 5] * (y - cy);
      }
    }
    return phi;
  }

  // ---------------------------------------------------------------- pairwise

  private ensureBH(n: number) {
    const need = Math.max(64, n * 4 + 64);
    if (this.bhCap >= need) return;
    const c = need * 2;
    this.bhCap = c;
    this.nCx = new Float64Array(c);
    this.nCy = new Float64Array(c);
    this.nHalf = new Float64Array(c);
    this.nM = new Float64Array(c);
    this.nMx = new Float64Array(c);
    this.nMy = new Float64Array(c);
    this.nQ = new Float64Array(c);
    this.nAq = new Float64Array(c);
    this.nQx = new Float64Array(c);
    this.nQy = new Float64Array(c);
    this.nChild = new Int32Array(c * 4);
    this.nLeaf = new Int32Array(c);
  }

  private newNode(cx: number, cy: number, half: number): number {
    if (this.nCount >= this.bhCap) this.growBH();
    const k = this.nCount++;
    this.nCx[k] = cx;
    this.nCy[k] = cy;
    this.nHalf[k] = half;
    this.nM[k] = this.nMx[k] = this.nMy[k] = 0;
    this.nQ[k] = this.nAq[k] = this.nQx[k] = this.nQy[k] = 0;
    this.nChild[k * 4] = this.nChild[k * 4 + 1] = this.nChild[k * 4 + 2] = this.nChild[k * 4 + 3] = -1;
    this.nLeaf[k] = -1;
    return k;
  }

  private growBH() {
    const old = {
      cx: this.nCx, cy: this.nCy, h: this.nHalf, m: this.nM, mx: this.nMx, my: this.nMy,
      q: this.nQ, aq: this.nAq, qx: this.nQx, qy: this.nQy, ch: this.nChild, lf: this.nLeaf,
    };
    const n = this.nCount;
    this.bhCap = 0;
    this.ensureBH(n);
    this.nCx.set(old.cx.subarray(0, n));
    this.nCy.set(old.cy.subarray(0, n));
    this.nHalf.set(old.h.subarray(0, n));
    this.nM.set(old.m.subarray(0, n));
    this.nMx.set(old.mx.subarray(0, n));
    this.nMy.set(old.my.subarray(0, n));
    this.nQ.set(old.q.subarray(0, n));
    this.nAq.set(old.aq.subarray(0, n));
    this.nQx.set(old.qx.subarray(0, n));
    this.nQy.set(old.qy.subarray(0, n));
    this.nChild.set(old.ch.subarray(0, n * 4));
    this.nLeaf.set(old.lf.subarray(0, n));
  }

  private buildTree() {
    const n = this.n;
    this.ensureBH(n);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const xi = this.x[i], yi = this.y[i];
      if (xi < minX) minX = xi;
      if (xi > maxX) maxX = xi;
      if (yi < minY) minY = yi;
      if (yi > maxY) maxY = yi;
    }
    const half = Math.max(maxX - minX, maxY - minY) * 0.5 + 1e-3;
    this.nCount = 0;
    const root = this.newNode((minX + maxX) * 0.5, (minY + maxY) * 0.5, half);
    for (let i = 0; i < n; i++) this.insert(root, i, 0);
    this.summarise(root);
  }

  private insert(node: number, i: number, depth: number) {
    for (;;) {
      const hasChild =
        this.nChild[node * 4] >= 0 || this.nChild[node * 4 + 1] >= 0 || this.nChild[node * 4 + 2] >= 0 || this.nChild[node * 4 + 3] >= 0;
      const leaf = this.nLeaf[node];
      if (!hasChild && leaf === -1) {
        this.nLeaf[node] = i;
        return;
      }
      if (leaf >= 0 || leaf === -2) {
        if (depth > 40) {
          // coincident particles: accumulate directly into this node as a bucket
          if (leaf >= 0) this.accumulate(node, leaf);
          this.nLeaf[node] = -2;
          this.accumulate(node, i);
          return;
        }
        if (leaf >= 0) {
          this.nLeaf[node] = -1;
          this.pushDown(node, leaf, depth);
        }
      }
      // descend
      const cx = this.nCx[node], cy = this.nCy[node];
      const qd = (this.x[i] >= cx ? 1 : 0) + (this.y[i] >= cy ? 2 : 0);
      let ch = this.nChild[node * 4 + qd];
      if (ch < 0) {
        const h = this.nHalf[node] * 0.5;
        ch = this.newNode(cx + (qd & 1 ? h : -h), cy + (qd & 2 ? h : -h), h);
        this.nChild[node * 4 + qd] = ch;
      }
      node = ch;
      depth++;
    }
  }

  private pushDown(node: number, j: number, depth: number) {
    const cx = this.nCx[node], cy = this.nCy[node];
    const qd = (this.x[j] >= cx ? 1 : 0) + (this.y[j] >= cy ? 2 : 0);
    let ch = this.nChild[node * 4 + qd];
    if (ch < 0) {
      const h = this.nHalf[node] * 0.5;
      ch = this.newNode(cx + (qd & 1 ? h : -h), cy + (qd & 2 ? h : -h), h);
      this.nChild[node * 4 + qd] = ch;
    }
    this.insert(ch, j, depth + 1);
  }

  private accumulate(node: number, i: number) {
    const m = this.m[i], q = this.q[i], aq = Math.abs(q);
    this.nM[node] += m;
    this.nMx[node] += m * this.x[i];
    this.nMy[node] += m * this.y[i];
    this.nQ[node] += q;
    this.nAq[node] += aq;
    this.nQx[node] += aq * this.x[i];
    this.nQy[node] += aq * this.y[i];
  }

  private summarise(node: number) {
    // iterative post-order would be faster; recursion depth is bounded (~40)
    const leaf = this.nLeaf[node];
    if (leaf >= 0) {
      this.accumulate(node, leaf);
    }
    for (let c = 0; c < 4; c++) {
      const ch = this.nChild[node * 4 + c];
      if (ch < 0) continue;
      this.summarise(ch);
      this.nM[node] += this.nM[ch];
      this.nMx[node] += this.nMx[ch];
      this.nMy[node] += this.nMy[ch];
      this.nQ[node] += this.nQ[ch];
      this.nAq[node] += this.nAq[ch];
      this.nQx[node] += this.nQx[ch];
      this.nQy[node] += this.nQy[ch];
    }
  }

  private cellHead = new Int32Array(0);
  private cellNext = new Int32Array(0);

  /**
   * Debye-screened (Yukawa) Coulomb, U = k q1 q2 exp(-r_s/lambda) / r_s with r_s = sqrt(r^2 + eps^2),
   * cut off at 6 lambda (potential shifted to 0 there). Adds *forces* into ax/ay. Returns PE if wanted.
   */
  private screenedPairs(wantPE: boolean): number {
    const n = this.n;
    const { kCoulomb: k, screening: lam, softening } = this.params;
    const rc = 6 * lam, rc2 = rc * rc, e2 = softening * softening;
    const rcs = Math.sqrt(rc2 + e2);
    const uCut = Math.exp(-rcs / lam) / rcs;
    const X = this.x, Y = this.y, Q = this.q, AX = this.ax, AY = this.ay;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      if (X[i] < minX) minX = X[i];
      if (X[i] > maxX) maxX = X[i];
      if (Y[i] < minY) minY = Y[i];
      if (Y[i] > maxY) maxY = Y[i];
    }
    const nx = Math.max(1, Math.min(512, Math.ceil((maxX - minX) / rc) + 1));
    const ny = Math.max(1, Math.min(512, Math.ceil((maxY - minY) / rc) + 1));
    const cs = Math.max((maxX - minX) / (nx - 0.5 || 1), (maxY - minY) / (ny - 0.5 || 1), rc);
    const nc = nx * ny;
    if (this.cellHead.length < nc) this.cellHead = new Int32Array(nc);
    if (this.cellNext.length < n) this.cellNext = new Int32Array(Math.max(n, 1024));
    const head = this.cellHead, next = this.cellNext;
    head.fill(-1, 0, nc);
    for (let i = 0; i < n; i++) {
      const cx = Math.min(nx - 1, Math.floor((X[i] - minX) / cs));
      const cy = Math.min(ny - 1, Math.floor((Y[i] - minY) / cs));
      const c = cy * nx + cx;
      next[i] = head[c];
      head[c] = i;
    }
    let pe = 0;
    const pair = (i: number, j: number) => {
      const dx = X[i] - X[j], dy = Y[i] - Y[j];
      const r2 = dx * dx + dy * dy;
      if (r2 >= rc2) return;
      const rs2 = r2 + e2, rs = Math.sqrt(rs2);
      const ex = Math.exp(-rs / lam);
      const kqq = k * Q[i] * Q[j];
      const s = (kqq * ex * (1 / rs + 1 / lam)) / rs2;
      AX[i] += s * dx;
      AY[i] += s * dy;
      AX[j] -= s * dx;
      AY[j] -= s * dy;
      if (wantPE) pe += kqq * (ex / rs - uCut);
    };
    for (let cy = 0; cy < ny; cy++)
      for (let cx = 0; cx < nx; cx++) {
        for (let i = head[cy * nx + cx]; i >= 0; i = next[i]) {
          for (let j = next[i]; j >= 0; j = next[j]) pair(i, j);
          // half-shell neighbours: E, NE, N, NW
          if (cx + 1 < nx) for (let j = head[cy * nx + cx + 1]; j >= 0; j = next[j]) pair(i, j);
          if (cy + 1 < ny) {
            for (let j = head[(cy + 1) * nx + cx]; j >= 0; j = next[j]) pair(i, j);
            if (cx + 1 < nx) for (let j = head[(cy + 1) * nx + cx + 1]; j >= 0; j = next[j]) pair(i, j);
            if (cx > 0) for (let j = head[(cy + 1) * nx + cx - 1]; j >= 0; j = next[j]) pair(i, j);
          }
        }
      }
    return pe;
  }

  /** Writes pairwise accelerations into ax/ay. Returns pairwise PE if wantPE. */
  computePairwise(wantPE = false): number {
    const n = this.n;
    const { coulomb, gravity, kCoulomb: k, G, softening } = this.params;
    this.ax.fill(0, 0, n);
    this.ay.fill(0, 0, n);
    if ((!coulomb && !gravity) || n < 2) return 0;
    const e2 = softening * softening;
    const screened = coulomb && this.params.screening > 0;
    const kq = coulomb && !screened ? k : 0;
    const gm = gravity ? G : 0;
    let pe = 0;
    // short-range (Debye-screened) Coulomb via a cell list; accumulates forces into ax/ay
    if (screened) pe += this.screenedPairs(wantPE);
    if (kq === 0 && gm === 0) {
      for (let i = 0; i < n; i++) {
        this.ax[i] /= this.m[i];
        this.ay[i] /= this.m[i];
      }
      return pe;
    }
    if (n <= this.params.bhThreshold) {
      const X = this.x, Y = this.y, Q = this.q, M = this.m, AX = this.ax, AY = this.ay;
      for (let i = 0; i < n; i++) {
        const xi = X[i], yi = Y[i], qi = Q[i], mi = M[i];
        let axi = 0, ayi = 0;
        for (let j = i + 1; j < n; j++) {
          const dx = xi - X[j], dy = yi - Y[j];
          const r2 = dx * dx + dy * dy + e2;
          const ir = 1 / Math.sqrt(r2);
          const ir3 = ir * ir * ir;
          // force on i along (ri - rj): k qi qj - G mi mj
          const s = (kq * qi * Q[j] - gm * mi * M[j]) * ir3;
          const fx = s * dx, fy = s * dy;
          axi += fx;
          ayi += fy;
          AX[j] -= fx;
          AY[j] -= fy;
          if (wantPE) pe += (kq * qi * Q[j] - gm * mi * M[j]) * ir;
        }
        AX[i] += axi;
        AY[i] += ayi;
      }
      for (let i = 0; i < n; i++) {
        AX[i] /= M[i];
        AY[i] /= M[i];
      }
      return pe;
    }
    this.buildTree();
    const th2 = this.params.theta * this.params.theta;
    // precompute per-node centroids and a leaf flag so the hot loop is pure array reads
    const nn = this.nCount;
    const CH = this.nChild, LF = this.nLeaf, HF = this.nHalf, NM = this.nM, NQ = this.nQ, AQ = this.nAq;
    const gx = new Float64Array(nn), gy = new Float64Array(nn), qx = new Float64Array(nn), qy = new Float64Array(nn), sz2 = new Float64Array(nn);
    const term = new Uint8Array(nn);
    for (let k = 0; k < nn; k++) {
      const m = NM[k], aq = AQ[k];
      gx[k] = m > 0 ? this.nMx[k] / m : this.nCx[k];
      gy[k] = m > 0 ? this.nMy[k] / m : this.nCy[k];
      qx[k] = aq > 0 ? this.nQx[k] / aq : this.nCx[k];
      qy[k] = aq > 0 ? this.nQy[k] / aq : this.nCy[k];
      const sz = HF[k] * 2;
      sz2[k] = sz * sz;
      term[k] = CH[k * 4] < 0 && CH[k * 4 + 1] < 0 && CH[k * 4 + 2] < 0 && CH[k * 4 + 3] < 0 ? 1 : 0;
    }
    const X = this.x, Y = this.y, Q = this.q, M = this.m, NCX = this.nCx, NCY = this.nCy;
    let stack = this.stack;
    for (let i = 0; i < n; i++) {
      const xi = X[i], yi = Y[i], qi = Q[i], mi = M[i];
      const gmi = gm * mi, kqi = kq * qi;
      let fx = 0, fy = 0, phi = 0;
      let sp = 0;
      stack[sp++] = 0;
      while (sp > 0) {
        const nd = stack[--sp];
        const lf = LF[nd];
        if (lf === i) continue;
        const dxc = xi - NCX[nd], dyc = yi - NCY[nd];
        if (term[nd] === 1 || sz2[nd] < th2 * (dxc * dxc + dyc * dyc)) {
          let Mn = NM[nd], Qn = NQ[nd];
          if (lf === -2) {
            // bucket may contain i itself; exclude its contribution
            const dxs = xi - gx[nd], dys = yi - gy[nd];
            if (dxs * dxs + dys * dys < 1e-9) {
              Mn -= mi;
              Qn -= qi;
            }
          }
          if (gmi !== 0 && Mn > 0) {
            const dx = xi - gx[nd], dy = yi - gy[nd];
            const r2 = dx * dx + dy * dy + e2;
            const ir = 1 / Math.sqrt(r2);
            const s = -gmi * Mn * ir * ir * ir;
            fx += s * dx;
            fy += s * dy;
            if (wantPE) phi -= gmi * Mn * ir;
          }
          if (kqi !== 0 && AQ[nd] > 0) {
            const dx = xi - qx[nd], dy = yi - qy[nd];
            const r2 = dx * dx + dy * dy + e2;
            const ir = 1 / Math.sqrt(r2);
            const s = kqi * Qn * ir * ir * ir;
            fx += s * dx;
            fy += s * dy;
            if (wantPE) phi += kqi * Qn * ir;
          }
          continue;
        }
        if (sp + 4 >= stack.length) {
          const s2 = new Int32Array(stack.length * 2);
          s2.set(stack);
          stack = this.stack = s2;
        }
        const c0 = nd * 4;
        if (CH[c0] >= 0) stack[sp++] = CH[c0];
        if (CH[c0 + 1] >= 0) stack[sp++] = CH[c0 + 1];
        if (CH[c0 + 2] >= 0) stack[sp++] = CH[c0 + 2];
        if (CH[c0 + 3] >= 0) stack[sp++] = CH[c0 + 3];
      }
      this.ax[i] = (this.ax[i] + fx) / mi;
      this.ay[i] = (this.ay[i] + fy) / mi;
      pe += 0.5 * phi;
    }
    return pe;
  }

  // ---------------------------------------------------------------- stepping

  private emit() {
    const dt = this.params.dt;
    for (const gs of this.guns) {
      const g = gs.g;
      if (!g.enabled || g.rate <= 0) continue;
      if (g.maxCount && gs.emitted >= g.maxCount) continue;
      gs.acc += g.rate * dt;
      let guard = 0;
      while (gs.acc >= 1 && guard++ < 200) {
        if (g.maxCount && gs.emitted >= g.maxCount) break;
        gs.emitted++;
        gs.acc -= 1;
        const r = this.rng();
        let k = 0;
        while (k < gs.cum.length - 1 && r > gs.cum[k]) k++;
        const s = SPECIES[gs.spi[k]];
        const ang = g.angle + (this.rng() - 0.5) * g.angleSpread;
        const v = g.speed * (1 + (this.rng() * 2 - 1) * g.speedSpread);
        const lat = (this.rng() - 0.5) * g.width;
        const nx = -Math.sin(g.angle), ny = Math.cos(g.angle);
        this.addParticle({
          sp: s.id,
          x: g.x + nx * lat,
          y: g.y + ny * lat,
          vx: v * Math.cos(ang),
          vy: v * Math.sin(ang),
        });
      }
    }
  }

  /** pairwise accelerations in ax/ay are stale (particles added, params changed) */
  aDirty = true;

  /**
   * One fixed step.
   * Outer level: kick-drift-kick for pairwise forces (velocities stay synchronised with positions).
   * Inner level: per particle, ns symmetric drift / Boris / drift sub-steps in the external E,B fields.
   * Each sub-step is a self-contained time-symmetric map, so changing ns between steps is safe, and in
   * a pure magnetic field the Boris rotation conserves |v| exactly.
   */
  step() {
    const p = this.params;
    const dt = p.dt;
    this.emit();
    const pair = p.coulomb || p.gravity;
    if (pair && this.aDirty) this.computePairwise(false);
    const n0 = this.n;
    const f = this.f;
    const maxSub = p.maxSubsteps;
    const damp = p.drag > 0 ? Math.exp(-p.drag * dt) : 1;
    const hdt = 0.5 * dt;
    for (let i = 0; i < n0; i++) {
      let x = this.x[i], y = this.y[i], vx = this.vx[i], vy = this.vy[i], vz = this.vz[i];
      this.px[i] = x;
      this.py[i] = y;
      if (pair) {
        vx += this.ax[i] * hdt;
        vy += this.ay[i] * hdt;
      }
      const qm = this.q[i] / this.m[i];
      let ns = 1;
      if (qm !== 0) {
        this.fieldAt(x, y, f);
        const bmag = Math.sqrt(f[2] * f[2] + f[3] * f[3] + f[4] * f[4]);
        const omega = Math.abs(qm) * bmag;
        const amag = Math.abs(qm) * Math.sqrt(f[0] * f[0] + f[1] * f[1]);
        const vmag = Math.sqrt(vx * vx + vy * vy + vz * vz);
        ns = Math.ceil(Math.max((omega * dt) / 0.1, (amag * dt) / (0.01 * Math.max(vmag, V_FLOOR)), 1));
        if (ns > maxSub) ns = maxSub;
      }
      const h = dt / ns;
      const hh = 0.5 * h;
      for (let s = 0; s < ns; s++) {
        if (qm !== 0) {
          // exact uniform-field step when the gyration is under-resolved (w h > 0.3)
          // decide from the latest field sample (start of step, or previous midpoint)
          if (f[2] * f[2] + f[3] * f[3] + f[4] * f[4] > 0.09 / (qm * qm * h * h)) {
            if (s > 0) this.fieldAt(x, y, f);
            const bm2 = f[2] * f[2] + f[3] * f[3] + f[4] * f[4];
            const bm = Math.sqrt(bm2);
            if (bm === 0) {
              x += vx * h;
              y += vy * h;
              continue;
            }
            const bx = f[2] / bm, by = f[3] / bm, bz = f[4] / bm;
            // E x B drift (E has no z component)
            const vex = (f[1] * f[4]) / bm2, vey = (-f[0] * f[4]) / bm2;
            const vez = (f[0] * f[3] - f[1] * f[2]) / bm2;
            let wx = vx - vex, wy = vy - vey, wz = vz - vez;
            const wpar = wx * bx + wy * by + wz * bz;
            const epar = f[0] * bx + f[1] * by;
            wx -= wpar * bx;
            wy -= wpar * by;
            wz -= wpar * bz;
            const W = qm * bm; // signed gyro-frequency: dv/dt = W v x b
            const th = W * h, c = Math.cos(th), sn = Math.sin(th);
            // u = w_perp x b
            const ux = wy * bz - wz * by, uy = wz * bx - wx * bz, uz = wx * by - wy * bx;
            const apar = qm * epar;
            const vpar1 = wpar + apar * h;
            const spar = wpar * h + 0.5 * apar * h * h;
            x += vex * h + spar * bx + (sn * wx + (1 - c) * ux) / W;
            y += vey * h + spar * by + (sn * wy + (1 - c) * uy) / W;
            vx = vex + vpar1 * bx + c * wx + sn * ux;
            vy = vey + vpar1 * by + c * wy + sn * uy;
            vz = vez + vpar1 * bz + c * wz + sn * uz;
            continue;
          }
        }
        x += vx * hh;
        y += vy * hh;
        if (qm !== 0) {
          this.fieldAt(x, y, f);
          const hq = hh * qm;
          const vmx = vx + hq * f[0];
          const vmy = vy + hq * f[1];
          const vmz = vz;
          if (f[2] !== 0 || f[3] !== 0 || f[4] !== 0) {
            // phase-corrected Boris: |t| = tan(w h / 2) gives the exact rotation angle w h
            const a = Math.abs(hq) * Math.sqrt(f[2] * f[2] + f[3] * f[3] + f[4] * f[4]);
            const corr = a > 1e-4 ? Math.tan(a) / a : 1 + (a * a) / 3;
            const tx = hq * f[2] * corr, ty = hq * f[3] * corr, tz = hq * f[4] * corr;
            const sc = 2 / (1 + tx * tx + ty * ty + tz * tz);
            const vpx = vmx + (vmy * tz - vmz * ty);
            const vpy = vmy + (vmz * tx - vmx * tz);
            const vpz = vmz + (vmx * ty - vmy * tx);
            vx = vmx + sc * (vpy * tz - vpz * ty);
            vy = vmy + sc * (vpz * tx - vpx * tz);
            vz = vmz + sc * (vpx * ty - vpy * tx);
          } else {
            vx = vmx;
            vy = vmy;
            vz = vmz;
          }
          vx += hq * f[0];
          vy += hq * f[1];
        }
        x += vx * hh;
        y += vy * hh;
      }
      if (damp !== 1) {
        vx *= damp;
        vy *= damp;
        vz *= damp;
      }
      this.x[i] = x;
      this.y[i] = y;
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.vz[i] = vz;
    }
    this.postStep();
    if (pair) {
      this.computePairwise(false);
      for (let i = 0; i < this.n; i++) {
        this.vx[i] += this.ax[i] * hdt;
        this.vy[i] += this.ay[i] * hdt;
      }
      this.aDirty = false;
    } else this.aDirty = true;
    this.time += dt;
    this.steps++;
  }

  private postStep() {
    const b = this.bounds;
    const open = this.params.boundary === 'open';
    const margin = this.params.openMargin;
    const wa = this.walls;
    for (let i = this.n - 1; i >= 0; i--) {
      const x0 = this.px[i], y0 = this.py[i], x1 = this.x[i], y1 = this.y[i];
      // walls / detectors
      let hit = false;
      if (wa.length) {
        const ddx = x1 - x0, ddy = y1 - y0;
        if (ddx !== 0 || ddy !== 0) {
          for (let w = 0; w < wa.length; w += 5) {
            const sx = wa[w], sy = wa[w + 1];
            const ex = wa[w + 2] - sx, ey = wa[w + 3] - sy;
            const den = ddx * ey - ddy * ex;
            if (den === 0) continue;
            const ox = sx - x0, oy = sy - y0;
            const t = (ox * ey - oy * ex) / den; // along particle path
            const u = (ox * ddy - oy * ddx) / den; // along wall
            if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
              const di = wa[w + 4];
              if (di >= 0) {
                const d = this.dets[di];
                d.total++;
                if (d.record) {
                  let arr = d.bins.get(this.sp[i]);
                  if (!arr) {
                    arr = new Float64Array(DET_BINS);
                    d.bins.set(this.sp[i], arr);
                  }
                  arr[Math.min(DET_BINS - 1, Math.floor(u * DET_BINS))]++;
                  d.speeds.push(Math.hypot(this.vx[i], this.vy[i], this.vz[i]));
                  if (d.speeds.length > 4000) d.speeds.splice(0, d.speeds.length - 4000);
                }
              }
              hit = true;
              break;
            }
          }
        }
      }
      if (hit) {
        this.removedAbsorbed++;
        this.remove(i);
        continue;
      }
      if (open) {
        if (x1 < b.x0 - margin || x1 > b.x1 + margin || y1 < b.y0 - margin || y1 > b.y1 + margin) {
          const ang = Math.abs(Math.atan2(this.vy[i], this.vx[i])) * (180 / Math.PI);
          this.exitHist[Math.min(35, Math.floor(ang / 5))]++;
          this.removedBoundary++;
          this.remove(i);
        }
      } else {
        if (x1 < b.x0) {
          this.x[i] = 2 * b.x0 - x1;
          this.vx[i] = Math.abs(this.vx[i]);
        } else if (x1 > b.x1) {
          this.x[i] = 2 * b.x1 - x1;
          this.vx[i] = -Math.abs(this.vx[i]);
        }
        if (y1 < b.y0) {
          this.y[i] = 2 * b.y0 - y1;
          this.vy[i] = Math.abs(this.vy[i]);
        } else if (y1 > b.y1) {
          this.y[i] = 2 * b.y1 - y1;
          this.vy[i] = -Math.abs(this.vy[i]);
        }
        // keep inside even after big jumps
        this.x[i] = Math.min(b.x1, Math.max(b.x0, this.x[i]));
        this.y[i] = Math.min(b.y1, Math.max(b.y0, this.y[i]));
        if (this.x[i] !== x1 || this.y[i] !== y1) {
          // avoid a long interpolation streak across the reflection
          this.px[i] = this.x[i];
          this.py[i] = this.y[i];
        }
      }
    }
  }

  /**
   * Advances by real time `realDt` (seconds) through the fixed-step accumulator.
   * Returns interpolation alpha in [0,1).
   */
  advance(realDt: number, maxSteps = Math.min(240, Math.ceil(14 * Math.max(1, this.params.timeScale)))): number {
    const dt = this.params.dt;
    this.acc += Math.min(realDt, 0.1) * this.params.timeScale;
    let k = 0;
    while (this.acc >= dt && k < maxSteps) {
      this.step();
      this.acc -= dt;
      k++;
    }
    if (this.acc >= dt) this.acc = this.acc % dt; // drop backlog: sim slows instead of spiralling
    return this.acc / dt;
  }

  // ---------------------------------------------------------------- measurement

  kineticEnergy(): number {
    let ke = 0;
    for (let i = 0; i < this.n; i++) ke += 0.5 * this.m[i] * (this.vx[i] ** 2 + this.vy[i] ** 2 + this.vz[i] ** 2);
    return ke;
  }

  externalPE(): number {
    let pe = 0;
    for (let i = 0; i < this.n; i++) if (this.q[i] !== 0) pe += this.q[i] * this.potentialAt(this.x[i], this.y[i]);
    return pe;
  }

  totalEnergy(): { ke: number; pe: number } {
    const ke = this.kineticEnergy();
    let pe = this.externalPE();
    if (this.params.coulomb || this.params.gravity) {
      // recompute with PE (restores ax/ay identically, positions unchanged)
      pe += this.computePairwise(true);
    }
    return { ke, pe };
  }

  stats(): SimStats {
    const n = this.n;
    const { ke, pe } = this.totalEnergy();
    let vmax = 1;
    const speeds = new Float64Array(n);
    const counts = new Map<number, number>();
    let angMom = 0;
    for (let i = 0; i < n; i++) {
      const v = Math.sqrt(this.vx[i] ** 2 + this.vy[i] ** 2 + this.vz[i] ** 2);
      speeds[i] = v;
      if (v > vmax) vmax = v;
      counts.set(this.sp[i], (counts.get(this.sp[i]) ?? 0) + 1);
      angMom += this.m[i] * (this.x[i] * this.vy[i] - this.y[i] * this.vx[i]);
    }
    // robust upper edge: 99th percentile-ish via sort of a sample
    if (n > 50) {
      const sorted = Array.from(speeds).sort((a, b) => a - b);
      vmax = Math.max(1, sorted[Math.floor(sorted.length * 0.995)] * 1.1);
    }
    const hist = new Array(32).fill(0);
    for (let i = 0; i < n; i++) {
      const b = Math.floor((speeds[i] / vmax) * 32);
      if (b < 32) hist[b]++;
    }
    let domSp = -1, domN = 0;
    for (const [s, c] of counts) if (c > domN) { domN = c; domSp = s; }
    let domKE = 0, has3D = false;
    for (let i = 0; i < n; i++)
      if (this.sp[i] === domSp) {
        domKE += 0.5 * this.m[i] * (this.vx[i] ** 2 + this.vy[i] ** 2 + this.vz[i] ** 2);
        if (Math.abs(this.vz[i]) > 1e-6) has3D = true;
      }
    const detectors: DetectorSummary[] = this.dets.map((d) => {
      const bins: Record<number, number[]> = {};
      for (const [s, a] of d.bins) bins[s] = Array.from(a);
      return { id: d.id, total: d.total, bins, speeds: d.speeds.slice(-1500) };
    });
    return {
      n,
      time: this.time,
      steps: this.steps,
      ke,
      pe,
      hist,
      histMax: vmax,
      domSp,
      domFrac: n ? domN / n : 0,
      domMeanKE: domN ? domKE / domN : 0,
      domDof: has3D ? 3 : 2,
      removedBoundary: this.removedBoundary,
      removedAbsorbed: this.removedAbsorbed,
      spawned: this.spawned,
      exitHist: Array.from(this.exitHist),
      detectors,
      angMom,
      spCounts: Object.fromEntries(counts),
    };
  }

  probe(id: number): ProbeInfo | null {
    const i = this.indexOf(id);
    if (i < 0) return null;
    const f = new Float64Array(5);
    this.fieldAt(this.x[i], this.y[i], f);
    return {
      id,
      sp: this.sp[i],
      x: this.x[i],
      y: this.y[i],
      vx: this.vx[i],
      vy: this.vy[i],
      vz: this.vz[i],
      q: this.q[i],
      m: this.m[i],
      ex: f[0],
      ey: f[1],
      bx: f[2],
      by: f[3],
      bz: f[4],
    };
  }
}
