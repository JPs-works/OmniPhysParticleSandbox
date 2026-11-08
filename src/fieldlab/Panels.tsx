import type { ReactNode } from 'react';
import { Dice5, Eraser, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EXPERIMENT_BY_ID, ExperimentLive, hasLive } from '../content/experiments';
import { useStore, type Store } from '../lib/store';
import type { TelState } from './FieldLab';
import { Tex } from '../lib/Tex';
import { Button, LogSlider, Section, Segmented, Slider, Toggle } from '../lib/ui';
import type { PresetId } from '../physics/presets';
import { GUN_SPECIES, SPECIES, speciesIdx } from '../physics/species';
import type { FieldObject, SimParams } from '../physics/types';
import type { Toggles } from './FieldCanvas';
import { TOOLS, type PlateDir, type Tool, type ToolOptions } from './tools';

function SpeciesSelect({ value, onChange, label = 'Species' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const s = SPECIES[speciesIdx(value)];
  return (
    <label className="flex items-center justify-between gap-2 text-[11.5px] text-slate-300">
      <span>{label}</span>
      <span className="relative flex items-center">
        <span className="pointer-events-none absolute left-2 h-2 w-2 rounded-full" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
        <select value={value} onChange={(e) => onChange(e.target.value)} className="omni-select pl-5">
          {GUN_SPECIES.map((id) => {
            const sp = SPECIES[speciesIdx(id)];
            return (
              <option key={id} value={id}>
                {sp.symbol} · {sp.name}
              </option>
            );
          })}
        </select>
      </span>
    </label>
  );
}

const qm = (id: string) => {
  const s = SPECIES[speciesIdx(id)];
  return s.q === 0 ? '0' : (s.q / s.m).toPrecision(3);
};

// ------------------------------------------------------------------ Experiment

export function ExperimentTab({ preset, store, objects, params }: { preset: PresetId; store: Store<TelState>; objects: FieldObject[]; params: SimParams }) {
  const ex = EXPERIMENT_BY_ID[preset];
  const stats = useStore(store).tel?.stats ?? null;
  return (
    <div className="px-3 py-3 text-[12.5px] leading-relaxed text-slate-300">
      <h2 className="text-[15px] font-semibold text-white">{ex.title}</h2>
      <p className="mt-1">{ex.intro}</p>
      <div className="mt-3 space-y-2">
        {ex.eqs.map((e, i) => (
          <div key={i} className="rounded-md border border-cyan-300/10 bg-cyan-400/[0.04] px-2 py-2 text-center text-slate-100">
            <Tex tex={e.tex} block />
            {e.caption && <div className="-mt-1 text-[10.5px] text-slate-400">{e.caption}</div>}
          </div>
        ))}
      </div>
      {hasLive(preset) && (
        <div className="mt-3">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">Live: predicted vs measured</div>
          <div className="mt-1">
            <ExperimentLive id={preset} stats={stats} objects={objects} params={params} />
          </div>
        </div>
      )}
      <div className="mt-3">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-emerald-300/80">What to notice</div>
        <ul className="mt-1 list-disc space-y-1 pl-4 marker:text-emerald-400/60">
          {ex.notice.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>
      <div className="mt-3">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-amber-300/80">Try this</div>
        <ul className="mt-1 list-disc space-y-1 pl-4 marker:text-amber-400/60">
          {ex.tryThis.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Controls

/** Commits on Enter or blur, so typing a multi-digit seed doesn't reload the scene per keystroke. */
function SeedInput({ seed, setSeed }: { seed: number; setSeed: (s: number) => void }) {
  const [txt, setTxt] = useState(String(seed));
  useEffect(() => setTxt(String(seed)), [seed]);
  const commit = () => {
    const v = Math.max(0, Math.floor(Number(txt) || 0));
    if (v !== seed) setSeed(v);
    else setTxt(String(seed));
  };
  return (
    <input
      type="number"
      value={txt}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setTxt(String(seed));
      }}
      className="omni-input w-24 text-right"
      aria-label="Random seed (press Enter to apply)"
    />
  );
}

export function ToolOptionsSection({ tool, opts, setOpts }: { tool: Tool; opts: ToolOptions; setOpts: (p: Partial<ToolOptions>) => void }) {
  const def = TOOLS.find((t) => t.id === tool)!;
  let body: ReactNode = <p className="text-[11.5px] text-slate-400">{def.hint}</p>;
  switch (tool) {
    case 'charge':
      body = (
        <>
          <p className="text-[11.5px] text-slate-400">{def.hint}</p>
          <LogSlider label="Source charge" value={opts.chargeQ} minExp={0} maxExp={2} signed onChange={(v) => setOpts({ chargeQ: v })} unit="e" />
        </>
      );
      break;
    case 'plates':
      body = (
        <>
          <p className="text-[11.5px] text-slate-400">{def.hint}</p>
          <LogSlider label="|E|" value={opts.plateE} minExp={-3} maxExp={3} onChange={(v) => setOpts({ plateE: v })} />
          <Segmented<PlateDir>
            value={opts.plateDir}
            onChange={(v) => setOpts({ plateDir: v })}
            options={[
              { v: 'up', label: 'E ↑' },
              { v: 'down', label: 'E ↓' },
              { v: 'left', label: 'E ←' },
              { v: 'right', label: 'E →' },
            ]}
          />
        </>
      );
      break;
    case 'bfield':
      body = (
        <>
          <p className="text-[11.5px] text-slate-400">{def.hint}</p>
          <LogSlider label="B" value={opts.bz} minExp={-3} maxExp={1.5} signed signLabels={['⊗ in', '⊙ out']} onChange={(v) => setOpts({ bz: v })} />
        </>
      );
      break;
    case 'gun':
      body = (
        <>
          <p className="text-[11.5px] text-slate-400">{def.hint}</p>
          <SpeciesSelect value={opts.gunSpecies} onChange={(v) => setOpts({ gunSpecies: v })} />
          <Slider label="Speed" value={opts.gunSpeed} min={0} max={400} step={1} onChange={(v) => setOpts({ gunSpeed: v })} unit="u/s" />
          <Slider label="Rate" value={opts.gunRate} min={0.5} max={100} step={0.5} onChange={(v) => setOpts({ gunRate: v })} unit="/s" />
          <Slider label="Angular spread" value={(opts.gunSpread * 180) / Math.PI} min={0} max={360} step={1} onChange={(v) => setOpts({ gunSpread: (v * Math.PI) / 180 })} unit="°" />
        </>
      );
      break;
    case 'spray':
      body = (
        <>
          <p className="text-[11.5px] text-slate-400">{def.hint}</p>
          <SpeciesSelect value={opts.spraySpecies} onChange={(v) => setOpts({ spraySpecies: v })} />
          <Slider label="Spray rate" value={opts.sprayRate} min={10} max={2000} step={10} onChange={(v) => setOpts({ sprayRate: v })} unit="/s" />
          <Slider label="Typical speed" value={opts.spraySpeed} min={0} max={300} step={1} onChange={(v) => setOpts({ spraySpeed: v })} unit="u/s" />
        </>
      );
      break;
    case 'eraser':
      body = (
        <>
          <p className="text-[11.5px] text-slate-400">{def.hint}</p>
          <Slider label="Radius" value={opts.eraserRadius} min={5} max={150} step={1} onChange={(v) => setOpts({ eraserRadius: v })} unit="u" />
        </>
      );
      break;
  }
  return (
    <Section title={`Tool · ${def.label}`}>
      {body}
    </Section>
  );
}

export function ControlsTab({
  tool,
  opts,
  setOpts,
  params,
  setParams,
  toggles,
  setToggles,
  seed,
  setSeed,
  onClearParticles,
  onClearDetectors,
}: {
  tool: Tool;
  opts: ToolOptions;
  setOpts: (p: Partial<ToolOptions>) => void;
  params: SimParams;
  setParams: (p: Partial<SimParams>) => void;
  toggles: Toggles;
  setToggles: (p: Partial<Toggles>) => void;
  seed: number;
  setSeed: (s: number) => void;
  onClearParticles: () => void;
  onClearDetectors: () => void;
}) {
  return (
    <div>
      <ToolOptionsSection tool={tool} opts={opts} setOpts={setOpts} />
      <Section title="Simulation">
        <LogSlider label="Time scale" value={params.timeScale} minExp={-1.3} maxExp={1} onChange={(v) => setParams({ timeScale: v })} unit="×" hint="Sim seconds per real second. The physics step stays fixed." />
        <Toggle label="Particle–particle Coulomb" checked={params.coulomb} onChange={(v) => setParams({ coulomb: v })} hint="Pairwise softened Coulomb forces (Barnes–Hut above 500 particles)" />
        {params.coulomb && <LogSlider label="Coulomb k" value={params.kCoulomb} minExp={0} maxExp={4} onChange={(v) => setParams({ kCoulomb: v })} />}
        <Toggle label="Gravity between particles" checked={params.gravity} onChange={(v) => setParams({ gravity: v })} />
        {params.gravity && <LogSlider label="G" value={params.G} minExp={0} maxExp={4} onChange={(v) => setParams({ G: v })} />}
        {(params.coulomb || params.gravity) && <Slider label="Softening ε" value={params.softening} min={0.5} max={20} step={0.5} onChange={(v) => setParams({ softening: v })} unit="u" />}
        <Slider label="Drag" value={params.drag} min={0} max={2} step={0.01} onChange={(v) => setParams({ drag: v })} unit="/s" hint="Velocity damping exp(−γ·dt), so it does not depend on frame rate" />
        <div className="flex items-center justify-between gap-2 text-[11.5px] text-slate-300">
          <span>Boundary</span>
          <div className="w-36">
            <Segmented
              size="xs"
              value={params.boundary}
              onChange={(v) => setParams({ boundary: v })}
              options={[
                { v: 'open', label: 'Open', hint: 'Particles leaving the view are removed' },
                { v: 'reflect', label: 'Reflect', hint: 'Elastic walls at the view edges' },
              ]}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11.5px] text-slate-300">
          <span>Seed</span>
          <span className="flex items-center gap-1">
            <SeedInput seed={seed} setSeed={setSeed} />
            <button type="button" title="New random seed (resets the experiment)" className="rounded p-1 text-slate-300 hover:bg-white/10" onClick={() => setSeed(Math.floor(Math.random() * 1e6))}>
              <Dice5 size={14} />
            </button>
          </span>
        </div>
        <div className="flex gap-2 pt-1">
          <Button onClick={onClearParticles} hint="Remove all particles (objects stay)">
            <Eraser size={12} /> Clear particles
          </Button>
          <Button onClick={onClearDetectors} hint="Reset detector and scattering histograms">
            Clear hits
          </Button>
        </div>
      </Section>
      <Section title="Visualisation">
        <Toggle label="Potential colour map" checked={toggles.potential} onChange={(v) => setToggles({ potential: v })} hint="Signed electrostatic potential: warm = positive, cool = negative, with equipotential contours" />
        <Toggle label="Field-line flow" checked={toggles.flow} onChange={(v) => setToggles({ flow: v })} hint="Animated line-integral-convolution streaks along E (or in-plane B)" />
        <Toggle label="B-field glyphs (⊙ / ⊗)" checked={toggles.bField} onChange={(v) => setToggles({ bField: v })} />
        <Toggle label="Vector arrows" checked={toggles.vectors} onChange={(v) => setToggles({ vectors: v })} />
        <Toggle label="Grid (50 u)" checked={toggles.grid} onChange={(v) => setToggles({ grid: v })} />
        <Toggle label="Trails" checked={toggles.trails} onChange={(v) => setToggles({ trails: v })} />
        {toggles.trails && <Slider label="Trail persistence" value={toggles.trailTau} min={0.1} max={10} step={0.1} onChange={(v) => setToggles({ trailTau: v })} unit="s" />}
        <Slider label="Bloom" value={toggles.bloom} min={0} max={3} step={0.05} onChange={(v) => setToggles({ bloom: v })} />
      </Section>
      <Section title="Units" defaultOpen={false}>
        <p className="text-[11.5px] leading-relaxed text-slate-400">
          Charge is in e and mass in proton masses, so q/m ratios are physical: an electron curves 1836× harder than a proton. Lengths (u) and times (s) are scaled sim units. All motion is non-relativistic (Newtonian, v ≪ c), with no
          radiation or decay. The integrator uses a fixed step of {(params.dt * 1000).toFixed(2)} ms, with per-particle sub-steps when a particle gyrates or accelerates quickly.
        </p>
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ Inspector

const KIND_LABEL: Record<FieldObject['kind'], string> = { charge: 'Point charge', plates: 'Plates', bfield: 'Magnetic region', mirror: 'Magnetic bottle', gun: 'Gun', detector: 'Detector' };

function objSummary(o: FieldObject): string {
  switch (o.kind) {
    case 'charge':
      return `${o.q > 0 ? '+' : ''}${o.q}e`;
    case 'plates':
      return `E ${Math.hypot(o.ex, o.ey).toPrecision(3)}`;
    case 'bfield':
      return `B ${o.bz >= 0 ? '⊙' : '⊗'} ${Math.abs(o.bz).toPrecision(3)}${o.infinite ? ' (whole world)' : ''}`;
    case 'mirror':
      return `B₀ ${o.b0}, Rₘ ${o.ratio}`;
    case 'gun':
      return `${o.species.map((s) => SPECIES[speciesIdx(s.sp)].symbol).join(' ')} ${o.speed} u/s`;
    case 'detector':
      return o.record ? (o.label ?? 'records hits') : 'wall';
  }
}

export function InspectorTab(props: {
  obj: FieldObject | null;
  objects: FieldObject[];
  onSelect: (id: string | null) => void;
  onChange: (o: FieldObject) => void;
  onDelete: () => void;
  onClearDetectors: () => void;
}) {
  const { obj, objects, onSelect } = props;
  return (
    <div>
      {obj ? (
        <ObjectEditor {...props} obj={obj} />
      ) : (
        <div className="px-3 py-3 text-[12px] text-slate-400">
          <p>Nothing selected. Pick an object below, or use the Select tool (V) and click it on the canvas. Click again on overlapping objects to cycle through them.</p>
        </div>
      )}
      <Section title={`Scene objects (${objects.length})`}>
        <ul className="space-y-0.5" data-testid="object-list">
          {objects.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onSelect(o.id)}
                aria-current={obj?.id === o.id}
                className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[11.5px] ${obj?.id === o.id ? 'bg-cyan-400/15 text-cyan-50' : 'text-slate-300 hover:bg-white/5'}`}
              >
                <span>{KIND_LABEL[o.kind]}</span>
                <span className="truncate font-mono text-[10.5px] text-slate-400">{objSummary(o)}</span>
              </button>
            </li>
          ))}
          {!objects.length && <li className="text-[11.5px] text-slate-400">The scene has no field sources.</li>}
        </ul>
      </Section>
    </div>
  );
}

function ObjectEditor({ obj, onChange, onDelete, onClearDetectors }: { obj: FieldObject; onChange: (o: FieldObject) => void; onDelete: () => void; onClearDetectors: () => void }) {
  const del = (
    <Button variant="danger" onClick={onDelete} hint="Delete this object (Del)">
      <Trash2 size={12} /> Delete
    </Button>
  );
  switch (obj.kind) {
    case 'charge':
      return (
        <Section title="Point charge" right={del}>
          <LogSlider label="Charge Q" value={obj.q} minExp={0} maxExp={2} signed onChange={(q) => onChange({ ...obj, q })} unit="e" />
          <p className="text-[11px] text-slate-400">
            Fixed source. Field <Tex tex="\mathbf E = kQ\,\mathbf r/(r^2+\varepsilon^2)^{3/2}" />. Drag it with Select.
          </p>
        </Section>
      );
    case 'plates': {
      const mag = Math.hypot(obj.ex, obj.ey);
      const dir: PlateDir = Math.abs(obj.ey) >= Math.abs(obj.ex) ? (obj.ey >= 0 ? 'up' : 'down') : obj.ex >= 0 ? 'right' : 'left';
      const set = (m: number, d: PlateDir) => {
        const v = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] }[d];
        onChange({ ...obj, ex: v[0] * m, ey: v[1] * m });
      };
      const gap = Math.abs(obj.ey) >= Math.abs(obj.ex) ? Math.abs(obj.y1 - obj.y0) : Math.abs(obj.x1 - obj.x0);
      return (
        <Section title="Charged plates" right={del}>
          <LogSlider label="|E|" value={mag} minExp={-3} maxExp={3.2} onChange={(m) => set(m, dir)} />
          <Segmented<PlateDir> value={dir} onChange={(d) => set(mag, d)} options={[{ v: 'up', label: 'E ↑' }, { v: 'down', label: 'E ↓' }, { v: 'left', label: 'E ←' }, { v: 'right', label: 'E →' }]} />
          <Toggle label="Electrodes absorb particles" checked={obj.absorb} onChange={(absorb) => onChange({ ...obj, absorb })} />
          <p className="text-[11px] text-slate-400">
            Voltage across the gap: <Tex tex={`\\Delta V = E\\,d = ${(mag * gap).toPrecision(3)}`} />. Ideal plates, no fringe field.
          </p>
        </Section>
      );
    }
    case 'bfield':
      return (
        <Section title="Magnetic region" right={del}>
          <LogSlider label="B" value={obj.bz} minExp={-3} maxExp={1.5} signed signLabels={['⊗ in', '⊙ out']} onChange={(bz) => onChange({ ...obj, bz })} />
          <Toggle label="Fill whole world" checked={!!obj.infinite} onChange={(infinite) => onChange({ ...obj, infinite })} />
          <p className="text-[11px] text-slate-400">Uniform field along z. A proton here gyrates at ω = {Math.abs(obj.bz).toPrecision(3)} rad/s.</p>
        </Section>
      );
    case 'mirror':
      return (
        <Section title="Magnetic bottle" right={del}>
          <Slider label="B₀ (centre)" value={obj.b0} min={1} max={40} step={0.5} onChange={(b0) => onChange({ ...obj, b0 })} />
          <Slider label="Mirror ratio Rₘ" value={obj.ratio} min={1} max={12} step={0.1} onChange={(ratio) => onChange({ ...obj, ratio })} />
          <p className="text-[11px] text-slate-400">Loss-cone angle α = {((Math.asin(Math.sqrt(1 / obj.ratio)) * 180) / Math.PI).toFixed(1)}°</p>
        </Section>
      );
    case 'gun': {
      const sp = obj.species[0]?.sp ?? 'p';
      return (
        <Section title="Particle gun" right={del}>
          <Toggle label="Firing" checked={obj.enabled} onChange={(enabled) => onChange({ ...obj, enabled })} />
          {obj.species.length > 1 ? (
            <div className="text-[11.5px] text-slate-300">
              Mixed beam:{' '}
              {obj.species.map((s) => (
                <span key={s.sp} className="mr-2 font-mono" style={{ color: SPECIES[speciesIdx(s.sp)].color }}>
                  {SPECIES[speciesIdx(s.sp)].symbol} {s.w}
                </span>
              ))}
              <Button className="mt-1" onClick={() => onChange({ ...obj, species: [{ sp, w: 1 }] })}>
                Use a single species
              </Button>
            </div>
          ) : (
            <SpeciesSelect value={sp} onChange={(v) => onChange({ ...obj, species: [{ sp: v, w: 1 }] })} />
          )}
          <div className="text-[11px] text-slate-400">q/m = {qm(sp)} e/mₚ</div>
          <Slider label="Speed" value={obj.speed} min={0} max={400} step={1} onChange={(speed) => onChange({ ...obj, speed })} unit="u/s" />
          <Slider label="Speed spread" value={obj.speedSpread * 100} min={0} max={80} step={1} onChange={(v) => onChange({ ...obj, speedSpread: v / 100 })} unit="%" />
          <Slider label="Rate" value={obj.rate} min={0} max={120} step={0.5} onChange={(rate) => onChange({ ...obj, rate })} unit="/s" />
          <Slider label="Max shots (0 = unlimited)" value={obj.maxCount ?? 0} min={0} max={200} step={1} onChange={(v) => onChange({ ...obj, maxCount: v || undefined })} format={(v) => (v ? String(v) : '∞')} />
          <Slider label="Aim" value={(obj.angle * 180) / Math.PI} min={-180} max={180} step={1} onChange={(v) => onChange({ ...obj, angle: (v * Math.PI) / 180 })} unit="°" />
          <Slider label="Angular spread" value={(obj.angleSpread * 180) / Math.PI} min={0} max={360} step={1} onChange={(v) => onChange({ ...obj, angleSpread: (v * Math.PI) / 180 })} unit="°" />
          <Slider label="Beam width" value={obj.width} min={0} max={400} step={1} onChange={(width) => onChange({ ...obj, width })} unit="u" />
        </Section>
      );
    }
    case 'detector':
      return (
        <Section title={obj.record ? 'Detector' : 'Wall'} right={del}>
          <Toggle label="Record hits (detector)" checked={obj.record} onChange={(record) => onChange({ ...obj, record })} />
          <Button onClick={onClearDetectors}>Clear hits</Button>
          <p className="text-[11px] text-slate-400">Absorbs every particle that crosses it. Drag its endpoints with Select.</p>
        </Section>
      );
  }
}
