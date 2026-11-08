import type { ReactNode } from 'react';
import { Bars } from '../lib/charts';
import { Tex } from '../lib/Tex';
import { CYCLO, NBODY, type PresetId } from '../physics/presets';
import { SPECIES, speciesIdx } from '../physics/species';
import type { BRegionObj, DetectorObj, FieldObject, GunObj, MirrorObj, PlatesObj, PointChargeObj, SimParams, SimStats } from '../physics/types';

export interface Experiment {
  id: PresetId;
  title: string;
  short: string;
  /** one line shown on the canvas: what to look at right now */
  watch: string;
  intro: string;
  eqs: { tex: string; caption?: string }[];
  notice: string[];
  tryThis: string[];
}

export const EXPERIMENTS: Experiment[] = [
  {
    id: 'cyclotron',
    title: 'Cyclotron motion',
    short: 'Charges circle in a uniform B field',
    watch: 'Fast and slow protons finish each lap together, while the α takes twice as long.',
    intro:
      'A magnetic force is always perpendicular to velocity, so it bends the path without changing speed. In a uniform field the result is a circle whose radius grows with momentum.',
    eqs: [
      { tex: 'r = \\dfrac{m v_\\perp}{|q| B}', caption: 'Larmor (gyro) radius' },
      { tex: '\\omega_c = \\dfrac{|q| B}{m},\\quad T = \\dfrac{2\\pi m}{|q|B}', caption: 'independent of speed (non-relativistic)' },
    ],
    notice: [
      'Protons and antiprotons circle in opposite senses: the sign of q sets the handedness.',
      'Fast and slow protons complete a lap in the same time, which is what lets a classic cyclotron use a fixed-frequency RF voltage.',
      'That only holds while v ≪ c. Relativistically ω = qB/γm falls as particles speed up, so synchrocyclotrons sweep their RF frequency instead.',
      'The α particle has about half the proton’s q/m, so it takes twice as long per lap.',
    ],
    tryThis: [
      'Click a particle with the Probe to compare the predicted circle with the real trajectory.',
      'Click the “B everywhere” chip, then halve B in the Inspector: every radius doubles.',
    ],
  },
  {
    id: 'exb',
    title: 'E×B drift',
    short: 'Crossed fields push every charge the same way',
    watch: 'Opposite charges loop in opposite directions, yet every species drifts right at the same speed E/B.',
    intro:
      'With crossed electric and magnetic fields, a charge released at rest traces a cycloid. On average it drifts perpendicular to both fields at a speed that depends on neither its charge nor its mass.',
    eqs: [{ tex: '\\mathbf v_d = \\dfrac{\\mathbf E \\times \\mathbf B}{B^2},\\qquad |v_d| = \\dfrac{E}{B}', caption: 'guiding-centre drift' }],
    notice: [
      'p⁺ and p̄ loop in opposite directions but drift together.',
      'The heavier α and d⁺ make taller arches (r = m v_d / qB) yet keep pace with the protons.',
      'In a plasma, E×B drift moves electrons and ions together, so it carries no current.',
    ],
    tryThis: ['Select the plates and raise E: the drift speeds up in proportion.', 'Click the “B everywhere” chip and flip B: the drift reverses.'],
  },
  {
    id: 'wien',
    title: 'Wien velocity filter',
    short: 'Only one speed goes straight',
    watch: 'Of a ±50% spread of speeds, only those near v* = E/B make it through the slit to the detector.',
    intro:
      'Inside the plates the electric force qE pushes one way and the magnetic force qvB pushes the other. They cancel for exactly one speed, so only particles at that speed fly straight through the slit.',
    eqs: [{ tex: 'qE = qvB \\;\\Rightarrow\\; v^{*} = \\dfrac{E}{B}', caption: 'independent of q and m' }],
    notice: ['Faster particles curve one way and slower ones the other, and both hit the plates or the wall.', 'The detector histogram collapses to a narrow spike at v* = E/B.'],
    tryThis: [
      'Click inside the plates to select them (click again to reach the B region underneath), then change E. The passed speed follows E/B.',
      'Switch the gun species: the selected speed does not change.',
    ],
  },
  {
    id: 'massspec',
    title: 'Mass spectrometer',
    short: 'Separating neon isotopes by m/q',
    watch: 'Each neon isotope lands in its own line on the plate: heavier ions swing wider.',
    intro:
      'This is a Bainbridge-type spectrometer (1933). A Wien filter passes one speed, then a uniform B₂ bends each ion into a semicircle. Heavier ions swing wider and land further down the plate. J. J. Thomson first saw neon-22 in 1913 with his parabola method, and Aston’s 1919 mass spectrograph confirmed that neon has isotopes.',
    eqs: [{ tex: 'r = \\dfrac{m v^{*}}{qB_2},\\qquad v^{*} = \\dfrac{E}{B_1}', caption: 'landing distance = 2r ∝ m/q' }],
    notice: [
      'The gun mixes ²⁰Ne⁺, ²¹Ne⁺ and ²²Ne⁺ in their natural abundances (90.5 : 0.27 : 9.25).',
      'Each isotope piles up in its own line. The tiny ²¹Ne line needs patience.',
    ],
    tryThis: ['Select the big B₂ region and lower it: the lines spread apart, and may run off the plate.', 'Delete the selector’s plates and watch the lines smear out.'],
  },
  {
    id: 'bottle',
    title: 'Magnetic bottle',
    short: 'Trapping charges with a mirror field',
    watch: 'Most protons bounce between the coils. Only those inside the loss cone escape out of the ends.',
    intro:
      'The field is weak in the middle and stronger near the coils. As a gyrating particle moves into stronger field, its magnetic moment μ = mv⊥²/2B stays constant, so v⊥ grows and v∥ shrinks until the particle turns back. Particles moving almost straight along the axis escape: they are in the loss cone.',
    eqs: [
      { tex: '\\mu = \\dfrac{m v_\\perp^2}{2B} = \\text{const}', caption: 'adiabatic invariant' },
      { tex: '\\sin^2\\alpha_{lc} = \\dfrac{B_{min}}{B_{max}} = \\dfrac{1}{R_m}', caption: 'loss-cone angle' },
    ],
    notice: ['Velocities are 3-D here: particles gyrate out of the screen (v_z) while bouncing left and right.', 'Earth’s Van Allen belts trap charges the same way.'],
    tryThis: ['Select the bottle and raise the mirror ratio: fewer particles escape.', 'Probe a trapped particle and watch v∥ change sign at each mirror point.'],
  },
  {
    id: 'capacitor',
    title: 'Capacitor deflection',
    short: 'Parabolic paths in a uniform E field',
    watch: 'e⁻ and e⁺ bend apart in opposite directions, while the 207× heavier μ⁻ barely deflects.',
    intro:
      'Between charged plates the force qE is constant, like gravity near the ground, so the path bends into a parabola. Deflection scales with q/m: an electron bends 207× more than a muon at the same speed. This is the principle of the cathode-ray tube and of Thomson’s e/m experiment.',
    eqs: [{ tex: 'y = \\dfrac{qE}{2 m v^2}\\, x^2', caption: 'inside the plates' }],
    notice: [
      'The screen records where each species lands. Compare with the prediction in Live.',
      'These are ideal plates with no fringe field, so a particle that leaves keeps the energy it gained. A real capacitor would take it back through the fringe field.',
    ],
    tryThis: ['Select the plates and double E: the deflection doubles.', 'Slow a gun to half speed: its deflection quadruples.'],
  },
  {
    id: 'rutherford',
    title: 'Rutherford scattering',
    short: 'α particles off a heavy nucleus',
    watch: 'Most α particles barely deflect, but the rare near-head-on ones bounce straight back.',
    intro:
      'α particles (+2e) aimed at a fixed gold nucleus (+79e) follow hyperbolic orbits. Most pass far away and barely deflect, but a rare few come in almost head-on and bounce back. That backscatter showed Rutherford that the atom’s positive charge sits in a tiny nucleus.',
    eqs: [
      { tex: '\\tan\\dfrac{\\theta}{2} = \\dfrac{d}{2b},\\qquad d = \\dfrac{k\\,qQ}{\\tfrac12 m v^2}', caption: 'b = impact parameter, d = closest head-on approach' },
      { tex: '\\dfrac{dN}{d\\theta} \\propto \\csc^2\\dfrac{\\theta}{2}', caption: '2-D (flat beam) version of csc⁴(θ/2)' },
    ],
    notice: ['The histogram compares measured exit angles with the analytic prediction for this beam.', 'Backscattering (θ > 90°) is rare but real.'],
    tryThis: ['Select the gun and raise the beam speed: d shrinks and scattering becomes more forward-peaked.', 'Make the nucleus negative: orbits now wrap around it.'],
  },
  {
    id: 'nbody',
    title: 'Gravitational N-body',
    short: 'A self-gravitating disc around a star',
    watch: 'Inner bodies lap outer ones, so the disc shears into spirals that the companion star stirs.',
    intro:
      'Every body attracts every other body with Plummer-softened Newtonian gravity. With 422 bodies the forces are summed directly; the Barnes–Hut tree takes over above 500. Near-circular orbits shear into spiral structure.',
    eqs: [
      { tex: '\\mathbf F_{ij} = -\\dfrac{G m_i m_j\\, \\mathbf r_{ij}}{(r_{ij}^2+\\varepsilon^2)^{3/2}}', caption: 'softened gravity' },
      { tex: 'v_{circ} = \\sqrt{GM/r},\\qquad T^2 \\propto r^3', caption: 'Kepler' },
    ],
    notice: [
      'The total momentum is zero, so the centre of mass stays put.',
      'Energy and angular momentum are conserved while every body stays in the box. Close encounters can fling a body out, and it then leaves the totals.',
    ],
    tryThis: ['Spray extra bodies with the Spray tool and watch them get captured or flung out.'],
  },
  {
    id: 'thermal',
    title: 'Thermalisation',
    short: '3000 colliding protons relax to Maxwell–Boltzmann',
    watch: 'Every proton starts at the same speed, and collisions spread the speeds into the Maxwell–Boltzmann curve.',
    intro:
      'Every proton starts at exactly the same speed in a random direction. They repel through a Debye-screened (Yukawa) Coulomb force, the short-range ion–ion interaction of a neutral plasma, where the electrons screen each ion. The gas therefore stays uniform, and collisions only trade energy between particles until the speeds relax into the Maxwell–Boltzmann distribution. Nothing is put in by hand.',
    eqs: [
      { tex: 'U = \\dfrac{k q^2}{r}\\,e^{-r/\\lambda_D}', caption: 'screened Coulomb, λ_D = 8 u' },
      { tex: 'f(v) = \\dfrac{m v}{kT}\\, e^{-m v^2/2kT}', caption: '2-D Maxwell–Boltzmann, kT = ⟨KE⟩' },
    ],
    notice: ['Watch the speed histogram in Telemetry go from a single spike to the dashed MB curve in a few seconds.', 'Total energy stays constant, while kinetic energy changes by only a few percent as the start positions relax.', 'This is also the 3000-particle stress test.'],
    tryThis: ['Add drag in Controls to cool the gas and watch it order into a lattice.'],
  },
  {
    id: 'sandbox',
    title: 'Free sandbox',
    short: 'Build your own field configuration',
    watch: 'A mixed beam threads a dipole and a magnetic strip. Build your own experiment with the tools on the left.',
    intro: 'Place charges, plates, magnetic regions, guns and detectors. Every force is the full Lorentz force F = q(E + v×B), integrated with the Boris pusher.',
    eqs: [{ tex: '\\mathbf F = q\\,(\\mathbf E + \\mathbf v \\times \\mathbf B)' }],
    notice: ['Hover or keyboard-focus a tool to see what it does. The Help (?) menu lists all of them.', 'Use Select to drag objects and edit them in the Inspector, which also lists every object in the scene.'],
    tryThis: ['Build your own velocity filter, or a magnetic lens that focuses a diverging beam.'],
  },
];

export const EXPERIMENT_BY_ID = Object.fromEntries(EXPERIMENTS.map((e) => [e.id, e])) as Record<PresetId, Experiment>;

const sp = (id: string) => SPECIES[speciesIdx(id)];
const f = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');

function Row({ k, v, c }: { k: ReactNode; v: ReactNode; c?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-[12px]">
      <span className="text-slate-400" style={c ? { color: c } : undefined}>
        {k}
      </span>
      <span className="font-mono tabular-nums text-slate-100">{v}</span>
    </div>
  );
}

function Chart({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-2 rounded-md border border-white/5 bg-black/30 p-2">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">{title}</div>
      {children}
    </div>
  );
}

function Missing({ what }: { what: string }) {
  return <p className="text-[11.5px] text-amber-200/80">The {what} has been removed, so there is nothing to predict. Press R to restore the experiment.</p>;
}

/** Find the scene object a preset tagged with `role` (falls back to the first of that kind). */
function byRole<K extends FieldObject['kind']>(objects: FieldObject[], kind: K, role?: string): Extract<FieldObject, { kind: K }> | undefined {
  const all = objects.filter((o) => o.kind === kind) as Extract<FieldObject, { kind: K }>[];
  const tagged = role ? all.find((o) => o.role === role) : undefined;
  // a user-built replacement has no role tag: accept it when it is the only object of its kind
  return tagged ?? (all.length === 1 ? all[0] : undefined);
}
const eMag = (p?: PlatesObj) => (p ? Math.hypot(p.ex, p.ey) : NaN);

export const hasLive = (id: PresetId) => id !== 'sandbox';

/** Live, experiment-specific predicted-vs-measured readouts, computed from the current scene objects. */
export function ExperimentLive({ id, stats, objects, params }: { id: PresetId; stats: SimStats | null; objects: FieldObject[]; params: SimParams }) {
  const det = (did: string) => stats?.detectors.find((d) => d.id === did);
  switch (id) {
    case 'cyclotron': {
      const b = byRole(objects, 'bfield', 'B') as BRegionObj | undefined;
      if (!b) return <Missing what="magnetic field" />;
      const B = Math.abs(b.bz);
      return (
        <div>
          <Row k={<Tex tex="B" />} v={`${B.toPrecision(3)} ${b.bz >= 0 ? '⊙' : '⊗'}`} />
          {CYCLO.speeds.map((v) => (
            <Row key={v} k={`p⁺ launched at v=${v}`} v={`r = ${f((sp('p').m * v) / B)}`} c={sp('p').color} />
          ))}
          <Row k="α launched at v=100" v={`r = ${f((sp('alpha').m * 100) / (2 * B))}`} c={sp('alpha').color} />
          <Row k="T (p⁺, any speed)" v={f((2 * Math.PI * sp('p').m) / B, 2)} />
          <Row k="T (α)" v={f((2 * Math.PI * sp('alpha').m) / (2 * B), 2)} />
        </div>
      );
    }
    case 'exb': {
      const pl = byRole(objects, 'plates', 'E') as PlatesObj | undefined;
      const b = byRole(objects, 'bfield', 'B') as BRegionObj | undefined;
      if (!pl || !b) return <Missing what={!pl ? 'pair of plates' : 'magnetic field'} />;
      const E = eMag(pl), B = Math.abs(b.bz), vd = E / B;
      // E x B for in-plane E, B_z: (Ey Bz, -Ex Bz)
      const dir = Math.atan2(-pl.ex * b.bz, pl.ey * b.bz);
      const arrow = ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'][(Math.round(dir / (Math.PI / 4)) + 8) % 8];
      return (
        <div>
          <Row k="E / B" v={`${E.toPrecision(3)} / ${B.toPrecision(3)}`} />
          <Row k="predicted drift" v={`${f(vd)} u/s ${arrow}`} />
          {['p', 'pbar', 'alpha', 'd'].map((s) => (
            <Row key={s} k={`${sp(s).symbol} arch height 2r`} v={f((2 * sp(s).m * vd) / (Math.abs(sp(s).q) * B))} c={sp(s).color} />
          ))}
        </div>
      );
    }
    case 'wien': {
      const pl = byRole(objects, 'plates', 'E') as PlatesObj | undefined;
      const b = byRole(objects, 'bfield', 'B') as BRegionObj | undefined;
      if (!pl || !b) return <Missing what={!pl ? 'pair of plates' : 'magnetic region'} />;
      const vstar = eMag(pl) / Math.abs(b.bz);
      const d = det('wien-screen');
      const vs = d?.speeds ?? [];
      const mean = vs.length ? vs.reduce((a, x) => a + x, 0) / vs.length : NaN;
      const sd = vs.length > 1 ? Math.sqrt(vs.reduce((a, x) => a + (x - mean) ** 2, 0) / (vs.length - 1)) : NaN;
      const lo = 0.5 * vstar, hi = 1.5 * vstar;
      const bins = new Array(40).fill(0);
      for (const v of vs) {
        const k = Math.floor(((v - lo) / (hi - lo)) * 40);
        if (k >= 0 && k < 40) bins[k]++;
      }
      return (
        <div>
          <Row k={<Tex tex="v^* = E/B" />} v={`${f(vstar)} u/s`} />
          <Row k="passed through slit" v={`${d?.total ?? 0} of ${stats?.spawned ?? 0}`} />
          <Row k="measured speed" v={vs.length ? `${f(mean, 2)} ± ${f(sd, 2)}` : '—'} />
          <Chart title={`detector speeds (${f(lo, 0)} → ${f(hi, 0)} u/s; line = v*)`}>
            <Bars series={[{ values: bins, color: sp('p').color }]} markers={[{ at: 0.5, color: '#e2e8f0' }]} width={250} height={50} />
          </Chart>
        </div>
      );
    }
    case 'massspec': {
      const e1 = byRole(objects, 'plates', 'E1') as PlatesObj | undefined;
      const b1 = byRole(objects, 'bfield', 'B1') as BRegionObj | undefined;
      const b2 = byRole(objects, 'bfield', 'B2') as BRegionObj | undefined;
      const plate = byRole(objects, 'detector', 'plate') as DetectorObj | undefined;
      if (!b2 || !plate) return <Missing what={!b2 ? 'analyser field B₂' : 'photographic plate'} />;
      const gunObj = byRole(objects, 'gun', 'gun') as GunObj | undefined;
      const selector = !!(e1 && b1);
      const vstar = selector ? eMag(e1) / Math.abs(b1.bz) : (gunObj?.speed ?? NaN);
      const beamY = gunObj?.y ?? 200;
      const d = det(plate.id);
      const ids = ['ne20', 'ne21', 'ne22'];
      const py0 = Math.min(plate.y0, plate.y1), py1 = Math.max(plate.y0, plate.y1);
      return (
        <div>
          <Row k={selector ? <Tex tex="v^* = E/B_1" /> : 'beam speed (no selector)'} v={`${f(vstar)} u/s`} />
          <Row k={<Tex tex="B_2" />} v={Math.abs(b2.bz).toPrecision(3)} />
          {ids.map((s) => {
            const r = (sp(s).m * vstar) / Math.abs(b2.bz);
            const hits = d?.bins[speciesIdx(s)]?.reduce((a, x) => a + x, 0) ?? 0;
            return <Row key={s} k={`${sp(s).symbol}: r = ${f(r)}`} v={`${hits} hits`} c={sp(s).color} />;
          })}
          <Chart title="plate hits by position (log; dashed = predicted 2r)">
            <Bars
              log
              width={250}
              height={56}
              series={ids.map((s) => ({ values: (d?.bins[speciesIdx(s)] ?? new Array(64).fill(0)).slice().reverse(), color: sp(s).color }))}
              markers={ids
                .map((s) => {
                  const y = beamY - (2 * sp(s).m * vstar) / Math.abs(b2.bz);
                  return { at: 1 - (y - py0) / (py1 - py0), color: sp(s).color };
                })
                .filter((m) => m.at >= 0 && m.at <= 1)}
            />
          </Chart>
        </div>
      );
    }
    case 'bottle': {
      const m = byRole(objects, 'mirror', 'mirror') as MirrorObj | undefined;
      if (!m) return <Missing what="magnetic bottle" />;
      const lc = Math.asin(Math.sqrt(1 / Math.max(m.ratio, 1)));
      const pred = 1 - Math.cos(lc);
      const sp0 = stats?.spawned ?? 0;
      const esc = stats?.removedBoundary ?? 0;
      return (
        <div>
          <Row k="mirror ratio R" v={m.ratio.toPrecision(3)} />
          <Row k="loss-cone angle" v={`${f((lc * 180) / Math.PI)}°`} />
          <Row k="predicted escape (isotropic)" v={`${f(pred * 100)}%`} />
          <Row k="escaped so far" v={sp0 ? `${esc} / ${sp0} = ${f((100 * esc) / sp0)}%` : '—'} />
        </div>
      );
    }
    case 'capacitor': {
      const pl = byRole(objects, 'plates', 'E') as PlatesObj | undefined;
      const screen = byRole(objects, 'detector', 'screen') as DetectorObj | undefined;
      if (!pl) return <Missing what="pair of plates" />;
      const x0 = Math.min(pl.x0, pl.x1), x1 = Math.max(pl.x0, pl.x1), L = x1 - x0;
      const Ey = pl.ey;
      const d = screen ? det(screen.id) : undefined;
      const rows = (['e-', 'mu-', 'e+'] as const).map((s) => {
        const g = byRole(objects, 'gun', `gun-${s}`) as GunObj | undefined;
        if (!g) return null;
        const S = sp(s);
        const a = (S.q * Ey) / S.m;
        const v = g.speed;
        const yExit = g.y + (a * L * L) / (2 * v * v);
        const slope = (a * L) / (v * v);
        const yScreen = screen ? yExit + slope * (screen.x0 - x1) : NaN;
        // measured mean landing height from the screen histogram
        let n = 0, m = 0;
        if (d && screen) {
          const sy0 = screen.y0, sy1 = screen.y1;
          d.bins[speciesIdx(s)]?.forEach((c, i) => {
            n += c;
            m += c * (sy0 + ((i + 0.5) / 64) * (sy1 - sy0));
          });
        }
        return { s, S, yExit, yScreen, n, meas: n ? m / n : NaN };
      });
      return (
        <div>
          <Row k="E" v={`${Math.abs(Ey).toPrecision(3)} ${Ey >= 0 ? '↑' : '↓'}`} />
          {rows.map((r) =>
            r ? (
              <div key={r.s}>
                <Row k={`${r.S.symbol} deflection at exit`} v={f(r.yExit - (byRole(objects, 'gun', `gun-${r.s}`) as GunObj).y, 2)} c={r.S.color} />
                <Row k={`  lands at y (pred / meas)`} v={`${f(r.yScreen)} / ${r.n ? f(r.meas) : '—'}${r.n ? ` (${r.n})` : ''}`} />
              </div>
            ) : null,
          )}
          {screen && <p className="mt-1 text-[10.5px] text-slate-400">Screen bins are {((Math.abs(screen.y1 - screen.y0)) / 64).toFixed(1)} u wide; landing heights are bin-averaged.</p>}
        </div>
      );
    }
    case 'rutherford': {
      const nuc = byRole(objects, 'charge', 'nucleus') as PointChargeObj | undefined;
      const beam = byRole(objects, 'gun', 'beam') as GunObj | undefined;
      if (!nuc || !beam) return <Missing what={!nuc ? 'nucleus' : 'α beam'} />;
      const a = sp('alpha');
      const ke = 0.5 * a.m * beam.speed * beam.speed;
      const d = (params.kCoulomb * a.q * nuc.q) / ke;
      const W = Math.max(beam.width, 1e-6);
      const meas = stats?.exitHist ?? new Array(36).fill(0);
      const N = meas.reduce((x, y) => x + y, 0);
      const repulsive = d > 0;
      const bOf = (th: number) => Math.min(W / 2, Math.abs(d) / 2 / Math.tan(th / 2));
      const pred = meas.map((_, i) => {
        const t1 = (i * 5 * Math.PI) / 180, t2 = ((i + 1) * 5 * Math.PI) / 180;
        const b1 = i === 0 ? W / 2 : bOf(t1);
        return (N * 2 * (b1 - bOf(t2))) / W;
      });
      const back = meas.slice(18).reduce((x, y) => x + y, 0);
      const backPred = pred.slice(18).reduce((x, y) => x + y, 0);
      return (
        <div>
          <Row k={<Tex tex="d = kqQ/\tfrac12 mv^2" />} v={`${f(Math.abs(d), 1)} u`} />
          <Row k="scattered so far" v={N} />
          <Row k="backscattered θ>90°" v={repulsive ? `${back} (pred ${f(backPred, 0)})` : back} />
          {repulsive ? (
            <Chart title="exit angle 0° → 180° (log; dashed = theory)">
              <Bars log width={250} height={56} series={[{ values: meas, color: a.color }]} overlay={{ values: pred, color: '#e2e8f0' }} />
            </Chart>
          ) : (
            <p className="mt-1 text-[11px] text-slate-400">An attractive nucleus gives the same |θ| distribution in this ideal model, but orbits can wrap around it, so exits are more mixed.</p>
          )}
        </div>
      );
    }
    case 'nbody':
      return (
        <div>
          <Row k="G, M★" v={`${params.G}, ${NBODY.M}`} />
          <Row k="bodies in the box" v={stats?.n ?? '—'} />
          <Row k="total energy" v={stats ? f(stats.ke + stats.pe, 0) : '—'} />
          <Row k="angular momentum" v={stats ? f(stats.angMom, 0) : '—'} />
          <Row k="force summation" v={(stats?.n ?? 0) > params.bhThreshold ? 'Barnes–Hut' : 'direct'} />
        </div>
      );
    case 'thermal':
      return (
        <div>
          <Row k="particles" v={stats?.n ?? '—'} />
          <Row k="kT = ⟨KE⟩ (2-D)" v={stats ? f(stats.domMeanKE, 1) : '—'} />
          <Row k="initial speed" v="60 u/s (all equal)" />
          <Row k="Debye length λ_D" v={params.screening > 0 ? `${params.screening} u` : 'off (pure Coulomb)'} />
        </div>
      );
    default:
      return null;
  }
}
