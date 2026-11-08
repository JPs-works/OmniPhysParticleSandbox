// Guided-experiment scenes. Every scene is laid out inside the 1000 x 600
// design box centred on the origin, which the camera always keeps fully visible.

import { mulberry32 } from './engine';
import type { FieldObject, GunObj, ParticleInit, SceneSpec } from './types';

export type PresetId =
  | 'cyclotron'
  | 'exb'
  | 'wien'
  | 'massspec'
  | 'bottle'
  | 'capacitor'
  | 'rutherford'
  | 'nbody'
  | 'thermal'
  | 'sandbox';

let uid = 0;
export const newId = (kind: string) => `${kind}-${(++uid).toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

const gun = (g: Partial<GunObj> & { x: number; y: number; species: GunObj['species'] }): GunObj => ({
  kind: 'gun',
  id: newId('gun'),
  angle: 0,
  speed: 100,
  speedSpread: 0,
  angleSpread: 0,
  width: 0,
  rate: 4,
  enabled: true,
  ...g,
});

// ---- shared constants used by both scenes and the explainer readouts
export const CYCLO = { B: 1.2, speeds: [60, 120, 180] };
export const EXB = { E: 100, B: 2 };
export const WIEN = { E: 40, B: 0.4, x0: -300, x1: 0, gap: 40, slit: 6 };
export const MSPEC = { E: 1000, B1: 10, B2: 10, v0: 100, beamY: 200, entryX: -95 };
export const BOTTLE = { b0: 12, ratio: 4, L: 380, H: 260, v: 90, count: 260 };
export const CAP = { E: 0.006, x0: -250, x1: 150, gap: 70, v: 150 };
export const RUTH = { Q: 79, v: 80, x: 120 };
export const NBODY = { M: 1000, count: 420, G: 400 };

export function buildScene(id: PresetId, seed: number): SceneSpec {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const objects: FieldObject[] = [];
  const particles: ParticleInit[] = [];
  switch (id) {
    case 'cyclotron': {
      objects.push({ kind: 'bfield', id: newId('b'), role: 'B', x0: -500, y0: -300, x1: 500, y1: 300, bz: CYCLO.B, infinite: true });
      // q > 0 in B_z > 0 circles clockwise; protons start left of centre, antiprotons right
      for (const v of CYCLO.speeds) {
        particles.push({ sp: 'p', x: -150, y: 0, vx: 0, vy: v });
        particles.push({ sp: 'pbar', x: 150, y: 0, vx: 0, vy: v });
      }
      particles.push({ sp: 'alpha', x: -150, y: 0, vx: 0, vy: -100 });
      particles.push({ sp: 'd', x: 150, y: 0, vx: 0, vy: -100 });
      // a few extra orbits from the centre, capped so closed orbits don't pile up forever
      objects.push(
        gun({ x: 0, y: 0, role: 'gun', angle: Math.PI / 2, speed: 90, speedSpread: 0.6, angleSpread: Math.PI * 2, rate: 1.5, maxCount: 16, species: [{ sp: 'p', w: 1 }, { sp: 'pbar', w: 1 }] }),
      );
      return { objects, particles, params: { boundary: 'open' }, select: 2, view: { x0: -490, y0: -275, x1: 340, y1: 275 } };
    }
    case 'exb': {
      objects.push({ kind: 'bfield', id: newId('b'), role: 'B', x0: -500, y0: -300, x1: 500, y1: 300, bz: EXB.B, infinite: true });
      objects.push({ kind: 'plates', id: newId('pl'), role: 'E', x0: -520, y0: -250, x1: 520, y1: 250, ex: 0, ey: EXB.E, absorb: true });
      const rows: [string, number][] = [['p', 150], ['pbar', 60], ['alpha', -40], ['d', -150]];
      for (const [sp, y] of rows) objects.push(gun({ x: -440, y, speed: 0, rate: 0.7, species: [{ sp, w: 1 }] }));
      for (const [sp, y] of rows) particles.push({ sp, x: -440, y, vx: 0, vy: 0 });
      return { objects, particles, params: { boundary: 'open' }, select: 0, view: { x0: -500, y0: -270, x1: 500, y1: 270 } };
    }
    case 'wien': {
      const { E, B, x0, x1, gap, slit } = WIEN;
      objects.push({ kind: 'plates', id: newId('pl'), role: 'E', x0, y0: -gap, x1, y1: gap, ex: 0, ey: E, absorb: true });
      objects.push({ kind: 'bfield', id: newId('b'), role: 'B', x0, y0: -gap, x1, y1: gap, bz: B });
      // slit wall
      objects.push({ kind: 'detector', id: newId('wall'), x0: x1 + 30, y0: slit, x1: x1 + 30, y1: 280, record: false });
      objects.push({ kind: 'detector', id: newId('wall'), x0: x1 + 30, y0: -280, x1: x1 + 30, y1: -slit, record: false });
      objects.push({ kind: 'detector', id: 'wien-screen', role: 'screen', x0: 440, y0: -150, x1: 440, y1: 150, record: true, label: 'Detector' });
      objects.push(gun({ x: x0 - 60, y: 0, role: 'gun', speed: 100, speedSpread: 0.5, rate: 30, width: 2, species: [{ sp: 'p', w: 1 }] }));
      return { objects, particles, params: { boundary: 'open', timeScale: 2 }, view: { x0: -410, y0: -210, x1: 480, y1: 210 } };
    }
    case 'massspec': {
      const { E, B1, B2, v0, beamY, entryX } = MSPEC;
      // velocity selector (crossed E and B1)
      objects.push({ kind: 'plates', id: newId('pl'), role: 'E1', x0: -430, y0: beamY - 22, x1: -150, y1: beamY + 22, ex: 0, ey: E, absorb: true });
      objects.push({ kind: 'bfield', id: newId('b'), role: 'B1', x0: -430, y0: beamY - 22, x1: -150, y1: beamY + 22, bz: B1 });
      // slit
      objects.push({ kind: 'detector', id: newId('wall'), x0: entryX - 15, y0: beamY + 4, x1: entryX - 15, y1: 295, record: false });
      objects.push({ kind: 'detector', id: newId('wall'), x0: entryX - 15, y0: -295, x1: entryX - 15, y1: beamY - 4, record: false });
      // analyser field
      objects.push({ kind: 'bfield', id: newId('b'), role: 'B2', x0: entryX, y0: -300, x1: 500, y1: beamY + 40, bz: B2 });
      objects.push({ kind: 'detector', id: 'ms-plate', role: 'plate', x0: entryX + 2, y0: -290, x1: entryX + 2, y1: beamY - 30, record: true, label: 'Photographic plate' });
      objects.push(
        gun({
          x: -470,
          y: beamY,
          role: 'gun',
          speed: v0,
          speedSpread: 0.25,
          rate: 80,
          width: 4,
          species: [{ sp: 'ne20', w: 90.48 }, { sp: 'ne21', w: 0.27 }, { sp: 'ne22', w: 9.25 }],
        }),
      );
      return { objects, particles, params: { boundary: 'open', timeScale: 2.5 }, view: { x0: -490, y0: -300, x1: 250, y1: 300 } };
    }
    case 'bottle': {
      const { b0, ratio, L, H, v, count } = BOTTLE;
      objects.push({ kind: 'mirror', id: newId('mir'), role: 'mirror', x: 0, y: 0, L, H, b0, ratio });
      for (let k = 0; k < count; k++) {
        // isotropic 3-D velocity directions
        const cosT = rng() * 2 - 1;
        const sinT = Math.sqrt(1 - cosT * cosT);
        const ph = rng() * Math.PI * 2;
        particles.push({
          sp: 'p',
          x: (rng() - 0.5) * 40,
          y: (rng() - 0.5) * 80,
          vx: v * cosT,
          vy: v * sinT * Math.cos(ph),
          vz: v * sinT * Math.sin(ph),
        });
      }
      return { objects, particles, params: { boundary: 'open' }, select: 0, view: { x0: -440, y0: -210, x1: 440, y1: 210 } };
    }
    case 'capacitor': {
      const { E, x0, x1, gap, v } = CAP;
      objects.push({ kind: 'plates', id: newId('pl'), role: 'E', x0, y0: -gap, x1, y1: gap, ex: 0, ey: E, absorb: true });
      objects.push({ kind: 'detector', id: 'cap-screen', role: 'screen', x0: 470, y0: -210, x1: 470, y1: 210, record: true, label: 'Screen' });
      objects.push(gun({ x: -470, y: 30, role: 'gun-e-', speed: v, rate: 8, species: [{ sp: 'e-', w: 1 }] }));
      objects.push(gun({ x: -470, y: 0, role: 'gun-mu-', speed: v, rate: 4, species: [{ sp: 'mu-', w: 1 }] }));
      objects.push(gun({ x: -470, y: -30, role: 'gun-e+', speed: v, rate: 8, species: [{ sp: 'e+', w: 1 }] }));
      return { objects, particles, params: { boundary: 'open', timeScale: 1.5 }, view: { x0: -490, y0: -230, x1: 490, y1: 230 } };
    }
    case 'rutherford': {
      objects.push({ kind: 'charge', id: newId('q'), role: 'nucleus', x: RUTH.x, y: 0, q: RUTH.Q });
      objects.push(gun({ x: -480, y: 0, role: 'beam', speed: RUTH.v, rate: 30, width: 260, species: [{ sp: 'alpha', w: 1 }] }));
      return { objects, particles, params: { boundary: 'open', chargeSoftening: 1, timeScale: 2 } };
    }
    case 'nbody': {
      const { M, count, G } = NBODY;
      particles.push({ sp: 'star', x: 0, y: 0, vx: 0, vy: 0, m: M });
      const ring: ParticleInit[] = [];
      for (let k = 0; k < count; k++) {
        const r = 60 + 220 * Math.sqrt(rng());
        const a = rng() * Math.PI * 2;
        const vc = Math.sqrt((G * M) / r);
        const jitter = 1 + (rng() - 0.5) * 0.08;
        const mm = 0.05 + rng() * 0.3;
        ring.push({
          sp: 'body',
          x: r * Math.cos(a),
          y: r * Math.sin(a) * 0.95,
          vx: -vc * Math.sin(a) * jitter,
          vy: vc * Math.cos(a) * jitter,
          m: mm,
        });
      }
      particles.push(...ring);
      // a light companion star on a slightly eccentric orbit stirs the disc
      particles.push({ sp: 'star', x: 360, y: 0, vx: 0, vy: Math.sqrt((G * M) / 360) * 0.92, m: 30 });
      // cancel the net momentum of everything (companion included) so the centre of mass stays put
      let px = 0, py = 0, cx = 0, cy = 0, mt = 0;
      for (const p of particles.slice(1)) {
        px += (p.m ?? 1) * p.vx;
        py += (p.m ?? 1) * p.vy;
      }
      particles[0].vx = -px / M;
      particles[0].vy = -py / M;
      for (const p of particles) {
        cx += (p.m ?? 1) * p.x;
        cy += (p.m ?? 1) * p.y;
        mt += p.m ?? 1;
      }
      for (const p of particles) {
        p.x -= cx / mt;
        p.y -= cy / mt;
      }
      return { objects, particles, params: { boundary: 'open', gravity: true, coulomb: false, softening: 3, dt: 1 / 240, G }, select: 1, view: { x0: -420, y0: -320, x1: 420, y1: 320 } };
    }
    case 'thermal': {
      const N = 3000;
      for (let k = 0; k < N; k++) {
        const a = rng() * Math.PI * 2;
        particles.push({ sp: 'p', x: (rng() - 0.5) * 1000, y: (rng() - 0.5) * 600, vx: 60 * Math.cos(a), vy: 60 * Math.sin(a) });
      }
      // Debye-screened repulsion: short-ranged like the ion-ion force in a neutral plasma,
      // so the gas stays uniform and collisions only redistribute energy
      return { objects, particles, params: { boundary: 'reflect', coulomb: true, softening: 2, kCoulomb: 6000, screening: 8 } };
    }
    case 'sandbox':
    default: {
      objects.push({ kind: 'charge', id: newId('q'), x: 120, y: 90, q: 30 });
      objects.push({ kind: 'charge', id: newId('q'), x: 120, y: -90, q: -30 });
      objects.push({ kind: 'bfield', id: newId('b'), x0: -120, y0: -260, x1: 20, y1: 260, bz: -1.5 });
      objects.push(gun({ x: -460, y: 0, speed: 120, angleSpread: 0.25, rate: 12, species: [{ sp: 'p', w: 1 }, { sp: 'alpha', w: 0.5 }, { sp: 'pbar', w: 1 }] }));
      return { objects, particles, params: { boundary: 'open' } };
    }
  }
}
