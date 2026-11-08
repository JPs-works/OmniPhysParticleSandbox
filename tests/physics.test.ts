// Headless quantitative checks for the Field Lab engine.
// Run: npx tsx tests/physics.test.ts   (from the project directory)

import { Engine, mulberry32 } from '../src/physics/engine';
import { buildScene, BOTTLE, CAP, MSPEC, RUTH, WIEN, EXB } from '../src/physics/presets';
import { SPECIES, speciesIdx } from '../src/physics/species';
import type { FieldObject, ParticleInit } from '../src/physics/types';

let failures = 0;
const results: string[] = [];
function check(name: string, ok: boolean, detail: string) {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(50)} ${detail}`);
  if (!ok) failures++;
}
const pct = (a: number, b: number) => (100 * (a - b)) / b;
const sp = (id: string) => SPECIES[speciesIdx(id)];
const HUGE = { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 };
const uniformB = (bz: number): FieldObject => ({ kind: 'bfield', id: 'b', x0: 0, y0: 0, x1: 0, y1: 0, bz, infinite: true });

function engineWith(objects: FieldObject[], particles: ParticleInit[], params = {}, bounds = HUGE) {
  const e = new Engine();
  e.loadScene({ objects, particles, params }, 1);
  e.setBounds(bounds);
  return e;
}

// ---------------------------------------------------------------- 1. Cyclotron radius + energy
function cyclotron(s: string, B: number, v: number) {
  const e = engineWith([uniformB(B)], [{ sp: s, x: 0, y: 0, vx: v, vy: 0 }]);
  const S = sp(s);
  const omega = (Math.abs(S.q) * B) / S.m;
  const T = (2 * Math.PI) / omega;
  const rPred = (S.m * v) / (Math.abs(S.q) * B);
  const nSteps = Math.max(240, Math.round((10 * T) / e.params.dt));
  const ke0 = e.kineticEnergy();
  let maxDrift = 0, cx = 0, cy = 0;
  const xs: number[] = [], ys: number[] = [];
  for (let k = 0; k < nSteps; k++) {
    e.step();
    xs.push(e.x[0]);
    ys.push(e.y[0]);
    cx += e.x[0];
    cy += e.y[0];
    maxDrift = Math.max(maxDrift, Math.abs(e.kineticEnergy() - ke0) / ke0);
  }
  cx /= xs.length;
  cy /= ys.length;
  let rmin = Infinity, rmax = 0, rs = 0;
  for (let k = 0; k < xs.length; k++) {
    const r = Math.hypot(xs[k] - cx, ys[k] - cy);
    rs += r;
    rmin = Math.min(rmin, r);
    rmax = Math.max(rmax, r);
  }
  return { rPred, rMeas: rs / xs.length, rmin, rmax, maxDrift, nSteps };
}
for (const [s, B, v] of [
  ['p', 1.2, 120],
  ['alpha', 1.2, 100],
  ['e-', 0.002, 120],
  ['e-', 1.2, 120],
] as [string, number, number][]) {
  const r = cyclotron(s, B, v);
  const worst = Math.max(Math.abs(pct(r.rmax, r.rPred)), Math.abs(pct(r.rmin, r.rPred)));
  check(`cyclotron ${s} B=${B} radius (>=10 orbits)`, worst < 2, `r_pred=${r.rPred.toPrecision(5)} r_meas=${r.rMeas.toPrecision(5)} worst ${worst.toFixed(3)}%`);
  check(`cyclotron ${s} B=${B} energy drift`, r.maxDrift < 0.005, `max |dKE/KE| = ${(r.maxDrift * 100).toExponential(2)}%`);
}

// ---------------------------------------------------------------- 2. Period independent of speed
{
  const B = 1.2, Tp = (2 * Math.PI * sp('p').m) / B;
  const periods: string[] = [];
  let worst = 0;
  for (const v of [30, 120, 300]) {
    const e = engineWith([uniformB(B)], [{ sp: 'p', x: 0, y: 0, vx: v, vy: 0 }]);
    // count upward zero crossings of vy and interpolate their times
    const cross: number[] = [];
    let prev = e.vy[0], t = 0;
    for (let k = 0; k < Math.round((20.5 * Tp) / e.params.dt); k++) {
      e.step();
      t += e.params.dt;
      const cur = e.vy[0];
      if (prev < 0 && cur >= 0) cross.push(t - e.params.dt * (cur / (cur - prev)));
      prev = cur;
    }
    const T = (cross[cross.length - 1] - cross[0]) / (cross.length - 1);
    worst = Math.max(worst, Math.abs(pct(T, Tp)));
    periods.push(`v=${v}: ${T.toFixed(5)}`);
  }
  check('cyclotron period independent of speed', worst < 0.1, `${periods.join(', ')} vs 2πm/qB=${Tp.toFixed(5)} (worst ${worst.toFixed(4)}%)`);
}

// ---------------------------------------------------------------- 3. Gyration at extreme w*h
for (const [B, label] of [
  [2.09, 'phase-corrected Boris, wh=0.25'],
  [7.53, 'exact sub-step, wh=0.9'],
  [31.6, 'exact sub-step, wh=3.8'],
] as [number, string][]) {
  const v = 120;
  const e = engineWith([uniformB(B)], [{ sp: 'e-', x: 0, y: 0, vx: v, vy: 0 }]);
  const S = sp('e-');
  const W = Math.abs(S.q / S.m) * B;
  const steps = 600;
  for (let k = 0; k < steps; k++) e.step();
  const t = steps * e.params.dt;
  // electron (q<0) in B_z>0 rotates counter-clockwise
  const ang = W * t;
  const vErr = Math.hypot(e.vx[0] - v * Math.cos(ang), e.vy[0] - v * Math.sin(ang)) / v;
  const r = v / W;
  // centre of the exact orbit: started at origin moving +x, counter-clockwise -> centre (0, r)
  const rMeas = Math.hypot(e.x[0], e.y[0] - r);
  check(`gyration at extreme B (${label})`, vErr < 1e-6 && Math.abs(pct(rMeas, r)) < 1, `${(W * t / (2 * Math.PI)).toFixed(0)} turns: phase error ${vErr.toExponential(1)} rad, r ${rMeas.toPrecision(6)} vs ${r.toPrecision(6)}`);
}

// ---------------------------------------------------------------- 4. E x B drift
for (const s of ['p', 'pbar', 'alpha', 'e-']) {
  const S = sp(s);
  const scale = s === 'e-' ? 1 / 500 : 1;
  const B = EXB.B * scale, E = EXB.E * scale;
  const e = engineWith([uniformB(B), { kind: 'plates', id: 'pl', x0: -1e5, y0: -1e5, x1: 1e5, y1: 1e5, ex: 0, ey: E, absorb: false }], [{ sp: s, x: 0, y: 0, vx: 0, vy: 0 }]);
  const T = (2 * Math.PI * S.m) / (Math.abs(S.q) * B);
  const n = Math.round((10 * T) / e.params.dt);
  for (let k = 0; k < n; k++) e.step();
  const vd = e.x[0] / (n * e.params.dt);
  check(`ExB drift ${s}`, Math.abs(pct(vd, E / B)) < 2, `v_d=${vd.toFixed(3)} vs E/B=${E / B} (${pct(vd, E / B).toFixed(3)}%)`);
}

// ---------------------------------------------------------------- 5. Wien filter
{
  const scene = buildScene('wien', 1);
  for (const o of scene.objects) if (o.kind === 'gun') o.enabled = false;
  const e = new Engine();
  e.loadScene(scene, 1);
  let launched = 0;
  for (let v = 50; v <= 150; v += 0.5, launched++) e.addParticle({ sp: 'p', x: WIEN.x0 - 60, y: 0, vx: v, vy: 0 });
  for (let k = 0; k < 120 * 60 && e.n > 0; k++) e.step();
  const det = e.dets.find((d) => d.id === 'wien-screen')!;
  const passed = det.speeds.slice().sort((a, b) => a - b);
  const pred = WIEN.E / WIEN.B;
  check('Wien filter passes only v ~ E/B', passed.length > 0 && Math.abs(pct(passed[0], pred)) < 5 && Math.abs(pct(passed[passed.length - 1], pred)) < 5, `${passed.length}/${launched} passed, v in [${passed[0]?.toFixed(2)}, ${passed[passed.length - 1]?.toFixed(2)}], E/B=${pred}`);
}

// ---------------------------------------------------------------- 6. Mass spectrometer: exact speed, then the real +-25% beam
{
  const scene = buildScene('massspec', 1);
  for (const o of scene.objects) if (o.kind === 'gun') o.enabled = false;
  const e = new Engine();
  e.loadScene(scene, 1);
  const ids: Record<string, number> = {};
  for (const s of ['ne20', 'ne21', 'ne22']) ids[s] = e.addParticle({ sp: s, x: -470, y: MSPEC.beamY, vx: MSPEC.v0, vy: 0 });
  const land: Record<string, number> = {};
  const prev = new Map<number, number>();
  for (let k = 0; k < 120 * 30 && e.n > 0; k++) {
    for (let i = 0; i < e.n; i++) prev.set(e.ids[i], e.y[i]);
    e.step();
    for (const [s, id] of Object.entries(ids)) if (land[s] === undefined && e.indexOf(id) < 0) land[s] = prev.get(id)!;
  }
  const r: Record<string, number> = {};
  for (const s of Object.keys(ids)) {
    r[s] = (MSPEC.beamY - land[s]) / 2;
    const pred = (sp(s).m * MSPEC.v0) / MSPEC.B2;
    check(`mass spec ${s} radius (v = v*)`, Math.abs(pct(r[s], pred)) < 2, `r=${r[s].toFixed(2)} vs mv/qB=${pred.toFixed(2)}`);
  }
  check('mass spec r22/r20 = m22/m20', Math.abs(pct(r.ne22 / r.ne20, sp('ne22').m / sp('ne20').m)) < 1, `${(r.ne22 / r.ne20).toFixed(4)} vs ${(sp('ne22').m / sp('ne20').m).toFixed(4)}`);
}
{
  const e = new Engine();
  e.loadScene(buildScene('massspec', 2), 2);
  for (let k = 0; k < 120 * 40; k++) e.step();
  const d = e.dets.find((x) => x.id === 'ms-plate')!;
  const plateY0 = -290, plateY1 = MSPEC.beamY - 30, nb = 64, bw = (plateY1 - plateY0) / nb;
  const vstar = MSPEC.E / MSPEC.B1;
  const stat = (s: string) => {
    const a = d.bins.get(speciesIdx(s));
    if (!a) return { n: 0, y: NaN };
    let n = 0, m = 0;
    a.forEach((c, i) => {
      n += c;
      m += c * (plateY0 + (i + 0.5) * bw);
    });
    return { n, y: m / n };
  };
  const s20 = stat('ne20'), s22 = stat('ne22');
  const y20 = MSPEC.beamY - (2 * sp('ne20').m * vstar) / MSPEC.B2, y22 = MSPEC.beamY - (2 * sp('ne22').m * vstar) / MSPEC.B2;
  const ratio = s22.n / s20.n;
  check(
    'mass spec real beam (selector + slit, +-25% speeds)',
    Math.abs(s20.y - y20) < bw && Math.abs(s22.y - y22) < bw && Math.abs(ratio - 9.25 / 90.48) < 0.04 && s20.n > 100,
    `Ne20 line at ${s20.y.toFixed(1)} (pred ${y20.toFixed(1)}), Ne22 at ${s22.y.toFixed(1)} (pred ${y22.toFixed(1)}), bin ${bw.toFixed(1)} u; N20=${s20.n}, N22/N20=${ratio.toFixed(3)} (natural 0.102)`,
  );
}

// ---------------------------------------------------------------- 7. Capacitor deflection
{
  const { E, x0, x1, gap, v } = CAP;
  const e = engineWith([{ kind: 'plates', id: 'pl', x0, y0: -gap, x1, y1: gap, ex: 0, ey: E, absorb: true }], [{ sp: 'e-', x: x0 - 20, y: 0, vx: v, vy: 0 }]);
  let yExit = NaN;
  for (let k = 0; k < 120 * 5; k++) {
    const xb = e.x[0], yb = e.y[0];
    e.step();
    if (xb < x1 && e.x[0] >= x1) yExit = yb + ((x1 - xb) / (e.x[0] - xb)) * (e.y[0] - yb);
  }
  const L = x1 - x0, pred = (sp('e-').q * E * L * L) / (2 * sp('e-').m * v * v);
  check('capacitor deflection y = qEL^2/(2mv^2)', Math.abs(pct(yExit, pred)) < 1, `y_exit=${yExit.toFixed(3)} vs ${pred.toFixed(3)} (${pct(yExit, pred).toFixed(2)}%)`);
}

// ---------------------------------------------------------------- 8. Magnetic bottle: mu conservation + loss cone
{
  const { b0, ratio, L, H } = BOTTLE;
  const mir: FieldObject = { kind: 'mirror', id: 'm', x: 0, y: 0, L, H, b0, ratio };
  const pitch = (60 * Math.PI) / 180, v = 90;
  const e = engineWith([mir], [{ sp: 'p', x: 0, y: 0, vx: v * Math.cos(pitch), vy: v * Math.sin(pitch), vz: 0 }]);
  const f = new Float64Array(5);
  const mus: number[] = [];
  let bounces = 0, lastSign = Math.sign(e.vx[0]);
  for (let k = 0; k < 120 * 30; k++) {
    e.step();
    e.fieldAt(e.x[0], e.y[0], f);
    const B = Math.hypot(f[2], f[3], f[4]);
    const vpar = (e.vx[0] * f[2] + e.vy[0] * f[3] + e.vz[0] * f[4]) / B;
    const v2 = e.vx[0] ** 2 + e.vy[0] ** 2 + e.vz[0] ** 2;
    mus.push((v2 - vpar * vpar) / (2 * B));
    const sg = Math.sign(vpar);
    if (sg !== lastSign && sg !== 0) {
      bounces++;
      lastSign = sg;
    }
  }
  const mean = mus.reduce((a, b) => a + b, 0) / mus.length;
  const dev = Math.max(...mus.map((m) => Math.abs(m - mean) / mean));
  check('magnetic bottle: mu = m v_perp^2/2B conserved', dev < 0.05 && bounces >= 2, `${bounces} mirror bounces, max |dmu/mu| = ${(dev * 100).toFixed(2)}%`);

  // loss cone: 3 seeds x 2000 isotropic particles; count only those that left through the mirror ends
  const pred = 1 - Math.sqrt(1 - 1 / ratio);
  const fr: number[] = [];
  let total = 0, escaped = 0;
  for (const seed of [11, 12, 13]) {
    const rng = mulberry32(seed);
    const ps: ParticleInit[] = [];
    for (let k = 0; k < 2000; k++) {
      const c = rng() * 2 - 1, s = Math.sqrt(1 - c * c), ph = rng() * 2 * Math.PI;
      ps.push({ sp: 'p', x: (rng() - 0.5) * 20, y: (rng() - 0.5) * 20, vx: v * c, vy: v * s * Math.cos(ph), vz: v * s * Math.sin(ph) });
    }
    const eb = engineWith([mir], ps);
    for (let k = 0; k < 120 * 25; k++) eb.step();
    // escaped = no longer inside the bottle (all leave through the mirror ends; none are removed)
    let out = 0;
    for (let i = 0; i < eb.n; i++) if (Math.abs(eb.x[i]) > L || Math.abs(eb.y[i]) > H) out++;
    out += 2000 - eb.n;
    fr.push(out / 2000);
    total += 2000;
    escaped += out;
  }
  const f0 = escaped / total, sigma = Math.sqrt((pred * (1 - pred)) / total);
  check('magnetic bottle escape fraction = 1 - cos(a_lc)', Math.abs(f0 - pred) < 3 * sigma + 0.01, `escaped ${(f0 * 100).toFixed(2)}% (seeds: ${fr.map((x) => (x * 100).toFixed(1)).join(', ')}%) vs ${(pred * 100).toFixed(2)}% (3σ = ${(3 * sigma * 100).toFixed(2)}%)`);
}

// ---------------------------------------------------------------- 9. Rutherford: single orbit + angular distribution
{
  const scene = buildScene('rutherford', 1);
  for (const o of scene.objects) if (o.kind === 'gun') o.enabled = false;
  const e = new Engine();
  e.loadScene(scene, 1);
  e.setBounds(HUGE);
  e.addParticle({ sp: 'alpha', x: -480, y: 3, vx: 80, vy: 0 });
  const E0 = e.totalEnergy();
  let maxErr = 0;
  for (let k = 0; k < 120 * 15; k++) {
    e.step();
    const E = e.totalEnergy();
    maxErr = Math.max(maxErr, Math.abs(E.ke + E.pe - (E0.ke + E0.pe)) / (E0.ke + E0.pe));
  }
  const ang = Math.abs((Math.atan2(e.vy[0], e.vx[0]) * 180) / Math.PI);
  const d = (e.params.kCoulomb * 2 * RUTH.Q) / (0.5 * sp('alpha').m * 80 * 80);
  const thPred = (2 * Math.atan(d / (2 * 3)) * 180) / Math.PI;
  check('Rutherford orbit (b=3): energy + angle', maxErr < 0.005 && Math.abs(ang - thPred) < 3, `|dE/E|=${(maxErr * 100).toFixed(3)}%, θ=${ang.toFixed(2)}° vs ${thPred.toFixed(2)}°`);
}
{
  const e = new Engine();
  e.loadScene(buildScene('rutherford', 3), 3);
  for (let k = 0; k < 120 * 140; k++) e.step();
  const h = Array.from(e.exitHist);
  const N = h.reduce((a, b) => a + b, 0);
  const d = (e.params.kCoulomb * 2 * RUTH.Q) / (0.5 * sp('alpha').m * RUTH.v * RUTH.v);
  const W = 260;
  const bOf = (deg: number) => Math.min(W / 2, d / 2 / Math.tan((deg * Math.PI) / 360));
  const bins: [number, number][] = [[10, 20], [20, 40], [40, 90], [90, 180]];
  let ok = true;
  const parts: string[] = [];
  for (const [a, b] of bins) {
    const obs = h.slice(a / 5, b / 5).reduce((x, y) => x + y, 0);
    const pred = (N * 2 * (bOf(a) - bOf(b))) / W;
    if (Math.abs(obs - pred) > 3 * Math.sqrt(pred) + 0.1 * pred) ok = false;
    parts.push(`${a}-${b}°: ${obs} vs ${pred.toFixed(0)}`);
  }
  check('Rutherford angular distribution vs theory', ok && N > 2000, `N=${N}; ${parts.join('; ')}`);
}

// ---------------------------------------------------------------- 10. Barnes-Hut accuracy (all components, two distributions)
function bhError(e: Engine, theta: number) {
  e.params.theta = theta;
  e.params.bhThreshold = 1e9;
  e.computePairwise(false);
  const ax = Float64Array.from(e.ax.subarray(0, e.n)), ay = Float64Array.from(e.ay.subarray(0, e.n));
  e.params.bhThreshold = 0;
  e.computePairwise(false);
  let num = 0, den = 0;
  for (let i = 0; i < e.n; i++) {
    num += (e.ax[i] - ax[i]) ** 2 + (e.ay[i] - ay[i]) ** 2;
    den += ax[i] ** 2 + ay[i] ** 2;
  }
  return Math.sqrt(num / den);
}
{
  const gas = new Engine();
  const sc = buildScene('thermal', 3);
  sc.params = { ...sc.params, screening: 0, kCoulomb: 1000 };
  gas.loadScene(sc, 3);
  for (let k = 0; k < 120; k++) gas.step();
  const disc = new Engine();
  disc.loadScene(buildScene('nbody', 4), 4);
  for (let k = 0; k < 480; k++) disc.step();
  const r = [bhError(gas, 0.6), bhError(gas, 0.8), bhError(disc, 0.6), bhError(disc, 0.8)];
  check('Barnes-Hut force error (|a| over x and y)', r[0] < 0.03 && r[1] < 0.06 && r[2] < 0.03 && r[3] < 0.06, `Coulomb gas N=3000: ${(r[0] * 100).toFixed(2)}% (θ=0.6), ${(r[1] * 100).toFixed(2)}% (θ=0.8); gravitating disc N=423: ${(r[2] * 100).toFixed(2)}%, ${(r[3] * 100).toFixed(2)}%`);
}

// ---------------------------------------------------------------- 11. Energy: Coulomb gases, measured against KE
{
  const sc = buildScene('thermal', 3);
  sc.params = { ...sc.params, screening: 0, kCoulomb: 150, theta: 0.6 };
  const e = new Engine();
  e.loadScene(sc, 3);
  const E0 = e.totalEnergy();
  for (let s = 0; s < 240; s++) e.step();
  const E1 = e.totalEnergy();
  const rel = Math.abs(E1.ke + E1.pe - E0.ke - E0.pe) / E0.ke;
  check('unscreened Coulomb (Barnes-Hut) energy drift / KE', rel < 0.02, `|dE|/KE0 = ${(rel * 100).toFixed(2)}% over 2 s (PE0/KE0 = ${(E0.pe / E0.ke).toFixed(1)})`);
}
{
  const e = new Engine();
  e.loadScene(buildScene('thermal', 5), 5);
  const E0 = e.totalEnergy();
  const moment = () => {
    let m2 = 0, m4 = 0;
    for (let i = 0; i < e.n; i++) {
      const v2 = e.vx[i] ** 2 + e.vy[i] ** 2;
      m2 += v2;
      m4 += v2 * v2;
    }
    return (m4 / e.n) / (m2 / e.n) ** 2;
  };
  const t0 = performance.now();
  for (let k = 0; k < 120 * 8; k++) e.step();
  const ms = (performance.now() - t0) / (120 * 8);
  const E1 = e.totalEnergy();
  const rel = Math.abs(E1.ke + E1.pe - E0.ke - E0.pe) / E0.ke;
  check('thermalisation: screened gas, energy + MB relaxation', rel < 0.01 && E1.ke / E0.ke < 1.15 && moment() > 1.85, `|dE|/KE0=${(rel * 100).toFixed(3)}%, KE x${(E1.ke / E0.ke).toFixed(3)}, <v^4>/<v^2>^2 = ${moment().toFixed(2)} (2-D MB = 2) at 8 s, ${ms.toFixed(2)} ms/step N=3000`);
}

// ---------------------------------------------------------------- 12. N-body conservation (no escapes allowed to leave)
{
  const e = new Engine();
  e.loadScene(buildScene('nbody', 1), 1);
  e.setBounds(HUGE);
  const mom = () => {
    let px = 0, py = 0, L = 0;
    for (let i = 0; i < e.n; i++) {
      px += e.m[i] * e.vx[i];
      py += e.m[i] * e.vy[i];
      L += e.m[i] * (e.x[i] * e.vy[i] - e.y[i] * e.vx[i]);
    }
    return { p: Math.hypot(px, py), L };
  };
  const E0 = e.totalEnergy(), m0 = mom();
  for (let k = 0; k < 240 * 10; k++) e.step();
  const E1 = e.totalEnergy(), m1 = mom();
  const dE = Math.abs((E1.ke + E1.pe - E0.ke - E0.pe) / (E0.ke + E0.pe));
  const dL = Math.abs((m1.L - m0.L) / m0.L);
  check('N-body: E, L, P conserved over 10 s', dE < 0.01 && dL < 1e-6 && m0.p < 1e-6, `|dE/E|=${(dE * 100).toFixed(3)}%, |dL/L|=${dL.toExponential(1)}, |P|=${m0.p.toExponential(1)} -> ${m1.p.toExponential(1)}, N=${e.n}`);
}

// ---------------------------------------------------------------- 13. Walls, detectors and boundaries
{
  const wall: FieldObject = { kind: 'detector', id: 'd', x0: 100, y0: -50, x1: 100, y1: 50, record: true };
  const e = engineWith([wall], [{ sp: 'p', x: 0, y: 10, vx: 80, vy: 0 }, { sp: 'p', x: 0, y: 200, vx: 80, vy: 0 }]);
  for (let k = 0; k < 240; k++) e.step();
  const d = e.dets[0];
  const absorbed = e.removedAbsorbed === 1 && d.total === 1 && Math.abs(d.speeds[0] - 80) < 1e-9 && e.n === 1;
  const o = engineWith([], [{ sp: 'p', x: 0, y: 0, vx: 200, vy: 0 }], {}, { x0: -100, y0: -100, x1: 100, y1: 100 });
  o.params.openMargin = 50;
  let removedAt = NaN;
  for (let k = 0; k < 240 && o.n; k++) {
    o.step();
    if (!o.n) removedAt = k;
  }
  const rf = engineWith([], [{ sp: 'p', x: 0, y: 0, vx: 173, vy: 97 }], { boundary: 'reflect' }, { x0: -100, y0: -100, x1: 100, y1: 100 });
  let inside = true;
  for (let k = 0; k < 1200; k++) {
    rf.step();
    if (Math.abs(rf.x[0]) > 100 || Math.abs(rf.y[0]) > 100) inside = false;
  }
  const speedKept = Math.abs(Math.hypot(rf.vx[0], rf.vy[0]) - Math.hypot(173, 97)) < 1e-9;
  check('walls absorb + record; open boundary removes; reflect keeps', absorbed && o.removedBoundary === 1 && inside && speedKept, `detector hits=${d.total}, open removal after ${removedAt} steps (x≈${(0 + 200 * (removedAt + 1) / 120).toFixed(0)} > 150), reflect inside=${inside} speed kept=${speedKept}`);
}

// ---------------------------------------------------------------- 14. Gun shot cap + time-scale budget
{
  const e = new Engine();
  e.loadScene(buildScene('cyclotron', 1), 1);
  const n0 = e.n;
  for (let k = 0; k < 120 * 60; k++) e.step();
  const fired = e.spawned - n0;
  const f = new Engine();
  f.loadScene({ objects: [], particles: [], params: { timeScale: 10 } }, 1);
  f.advance(1 / 60);
  check('cyclotron gun capped; 10x time scale keeps up', fired === 16 && f.steps === 20, `gun fired ${fired} in 60 s (cap 16); 1/60 s at 10x -> ${f.steps} steps (expected 20)`);
}

// ---------------------------------------------------------------- 15. Determinism: engine and the worker message path
{
  const run = () => {
    const e = new Engine();
    e.loadScene(buildScene('sandbox', 42), 42);
    for (let k = 0; k < 600; k++) e.step();
    let h = 0;
    for (let i = 0; i < e.n; i++) h += e.x[i] * (i + 1) + e.y[i];
    return [e.n, h];
  };
  const a = run(), b = run();
  check('deterministic replay from seed (engine)', a[0] === b[0] && a[1] === b[1], `n=${a[0]} hash=${a[1].toFixed(6)}`);
}
{
  const frames: { steps: number; n: number; pos: Float32Array }[] = [];
  const g = globalThis as unknown as { self: { postMessage: (m: unknown) => void; onmessage?: (e: { data: unknown }) => void } };
  g.self = {
    postMessage: (m: unknown) => {
      const f = m as { type: string; steps: number; n: number; pos: Float32Array };
      if (f.type === 'frame') frames.push({ steps: f.steps, n: f.n, pos: f.pos.slice(0, f.n * 2) });
    },
  };
  await import('../src/physics/sim.worker.ts');
  const send = (data: unknown) => g.self.onmessage!({ data });
  const bounds = { x0: -520, y0: -315, x1: 520, y1: 315 };
  // run A: 300 single steps; run B: same seed, driven by uneven 'advance' frames until 300 steps
  send({ type: 'load', scene: buildScene('massspec', 9), seed: 9, bounds });
  send({ type: 'step', n: 300, probeId: 0 });
  const A = frames[frames.length - 1];
  send({ type: 'load', scene: buildScene('massspec', 9), seed: 9, bounds });
  const dts = [1 / 61, 1 / 47, 1 / 90, 1 / 30];
  const last = () => (frames.length ? frames[frames.length - 1].steps : 0);
  frames.length = 0;
  // each advance adds at most 4 steps, so stop below 296 and finish with exact single steps
  for (let k = 0; k === 0 || last() < 296; k++) send({ type: 'advance', dt: dts[k % dts.length], paused: false, wantStats: false, probeId: 0 });
  send({ type: 'step', n: 300 - last(), probeId: 0 });
  const B = frames[frames.length - 1];
  // compare post-step positions (step frames show the state after the last step)
  send({ type: 'step', n: 0, probeId: 0 });
  const B2 = frames[frames.length - 1];
  let same = A.n === B2.n;
  for (let i = 0; same && i < A.n * 2; i++) if (A.pos[i] !== B2.pos[i]) same = false;
  check('deterministic through the worker protocol', same && B.steps === 300, `step-driven vs uneven-frame-driven runs: n=${A.n}/${B2.n} at step ${B2.steps}, positions ${same ? 'bit-identical' : 'differ'}`);
}

console.log(results.join('\n'));
console.log(failures ? `\n${failures} FAILED` : `\nall ${results.length} passed`);
process.exit(failures ? 1 : 0);
