import { useState, type ReactNode } from 'react';
import { Activity, ChevronDown, ChevronUp, Crosshair, X } from 'lucide-react';
import { Bars, Sparkline } from '../lib/charts';
import { SPECIES } from '../physics/species';
import type { ProbeView, Telemetry } from './FieldCanvas';

const fmt = (v: number, d = 3) => {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e5 || a < 1e-3) return v.toExponential(2);
  return v.toPrecision(d);
};

export function Hud({ tel, energy, energyBase, open, setOpen, showMB }: { tel: Telemetry | null; energy: number[]; energyBase: number; open: boolean; setOpen: (v: boolean) => void; showMB: boolean }) {
  const s = tel?.stats;
  const fpsColor = !tel ? 'text-slate-400' : tel.fps >= 55 ? 'text-emerald-300' : tel.fps >= 30 ? 'text-amber-300' : 'text-rose-300';
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pointer-events-auto flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/75 px-2 py-1 font-mono text-[11px] text-slate-300 shadow-lg shadow-black/40 backdrop-blur-md hover:bg-slate-900/80"
        title="Show telemetry"
      >
        <Activity size={12} className="text-cyan-300" />
        <span className={fpsColor}>{tel ? tel.fps.toFixed(0) : '–'} fps</span>
        <span>N {s?.n ?? 0}</span>
        <ChevronUp size={12} />
      </button>
    );
  // Maxwell-Boltzmann overlay for the dominant species
  let mb: number[] | undefined;
  if (showMB && s && s.domFrac > 0.85 && s.n > 50 && s.domMeanKE > 0) {
    const m = SPECIES[s.domSp].m;
    const dof = s.domDof;
    const kT = (2 * s.domMeanKE) / dof;
    const bw = s.histMax / s.hist.length;
    mb = s.hist.map((_, i) => {
      const v = (i + 0.5) * bw;
      const f =
        dof === 2
          ? ((m * v) / kT) * Math.exp((-m * v * v) / (2 * kT))
          : Math.sqrt(2 / Math.PI) * Math.pow(m / kT, 1.5) * v * v * Math.exp((-m * v * v) / (2 * kT));
      return f * bw * s.n * (s.domFrac || 1);
    });
  }
  // drift is only meaningful while the particle count is unchanged
  const e0 = energy[energyBase], e1 = energy[energy.length - 1];
  const settled = energy.length - 1 - energyBase >= 3;
  const drift = settled && Math.abs(e0) > 1e-9 ? ((e1 - e0) / Math.abs(e0)) * 100 : NaN;
  const legend = s ? Object.entries(s.spCounts).sort((a, b) => b[1] - a[1]) : [];
  return (
    <div className="pointer-events-auto w-[236px] rounded-lg border border-white/10 bg-slate-950/75 p-2 text-[11px] text-slate-300 shadow-xl shadow-black/40 backdrop-blur-md" data-testid="hud">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          <Activity size={12} className="text-cyan-300" /> Telemetry
        </div>
        <button type="button" onClick={() => setOpen(false)} className="rounded p-0.5 text-slate-400 hover:bg-white/10" title="Collapse telemetry">
          <ChevronDown size={12} />
        </button>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-1 font-mono tabular-nums">
        <div>
          <div className="text-[9.5px] uppercase text-slate-400">fps</div>
          <div className={fpsColor} data-testid="fps">
            {tel ? tel.fps.toFixed(0) : '–'}
          </div>
        </div>
        <div>
          <div className="text-[9.5px] uppercase text-slate-400">particles</div>
          <div className="text-slate-100">{s?.n ?? 0}</div>
        </div>
        <div title="Physics cost per frame in the worker, and sim seconds advanced per real second">
          <div className="text-[9.5px] uppercase text-slate-400">sim</div>
          <div className="text-slate-100">
            {tel ? `${tel.simRate.toFixed(2)}×` : '–'}
            <span className="ml-1 text-slate-400">{tel ? `${tel.stepMs.toFixed(1)}ms` : ''}</span>
          </div>
        </div>
      </div>
      <div className="mt-1.5" title="Total energy KE + PE (external + pairwise). B does no work.">
        <div className="flex justify-between text-[9.5px] uppercase text-slate-400">
          <span>energy KE+PE</span>
          <span className="font-mono normal-case text-slate-300">
            {s ? fmt(s.ke + s.pe) : '—'} {Number.isFinite(drift) ? (
              <span className={Math.abs(drift) < 0.5 ? 'text-emerald-300/80' : 'text-amber-300/80'} title="Change since the particle count last changed">
                ({drift >= 0 ? '+' : ''}
                {drift.toFixed(2)}%)
              </span>
            ) : (
              <span className="text-slate-400" title="Particles are being added or removed, so total energy is not expected to be constant">(open system)</span>
            )}
          </span>
        </div>
        <Sparkline data={energy} width={220} height={24} />
      </div>
      <div className="mt-1.5">
        <div className="flex justify-between text-[9.5px] uppercase text-slate-400">
          <span>speed histogram</span>
          <span className="font-mono normal-case">0 → {s ? s.histMax.toFixed(0) : '—'} u/s</span>
        </div>
        <Bars series={[{ values: s?.hist ?? new Array(32).fill(0), color: '#38bdf8' }]} overlay={mb ? { values: mb, color: '#fde68a' } : undefined} width={220} height={30} />
        {mb && <div className="text-[9.5px] text-amber-200/70">dashed: Maxwell–Boltzmann ({s?.domDof}-D) at measured ⟨KE⟩</div>}
      </div>
      {legend.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
          {legend.slice(0, 6).map(([k, c]) => {
            const sp = SPECIES[Number(k)];
            return (
              <span key={k} className="flex items-center gap-1 font-mono" title={`${sp.name}: q=${sp.q}e, m=${sp.m.toPrecision(4)} mₚ`}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: sp.color, boxShadow: `0 0 6px ${sp.color}` }} />
                <span style={{ color: sp.color }}>{sp.symbol}</span>
                <span className="text-slate-400">{c}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function R({ k, v, hint }: { k: ReactNode; v: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2" title={hint}>
      <span className="text-slate-400">{k}</span>
      <span className="font-mono tabular-nums text-slate-100">{v}</span>
    </div>
  );
}

export function ProbeCard({ p, onClose, sheet = false }: { p: ProbeView; onClose: () => void; sheet?: boolean }) {
  const [more, setMore] = useState(false);
  const sp = SPECIES[p.info.sp];
  const err = p.rMeas !== null && isFinite(p.rPred) ? ((p.rMeas - p.rPred) / p.rPred) * 100 : null;
  const mass = sp.illustrative ? `${fmt(p.info.m, 3)} (arb. units)` : `${fmt(p.info.m, 4)} mₚ`;
  const rMeasTxt = p.rMeas !== null ? `${fmt(p.rMeas)} (${err! >= 0 ? '+' : ''}${err!.toFixed(2)}%)` : p.planar ? 'tracking…' : 'n/a (3-D)';
  return (
    <div className={`pointer-events-auto rounded-lg border border-white/10 bg-slate-950/85 p-2 text-[11px] shadow-xl shadow-black/40 backdrop-blur-md ${sheet ? 'w-full' : 'w-[214px]'}`} data-testid="probe">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Crosshair size={12} className="shrink-0 text-cyan-300" />
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: sp.color, boxShadow: `0 0 8px ${sp.color}` }} />
          <span className="truncate font-semibold text-white">
            {sp.symbol} <span className="font-normal text-slate-400">{sp.name}</span>
          </span>
        </div>
        <div className="flex shrink-0 items-center">
          <button type="button" onClick={() => setMore(!more)} className="rounded px-1 text-[10.5px] text-cyan-200 hover:bg-white/10" aria-expanded={more} title={more ? 'Fewer details' : 'More details'}>
            {more ? 'less' : 'more'}
          </button>
          <button type="button" onClick={onClose} className="rounded p-0.5 text-slate-400 hover:bg-white/10" title="Stop probing (Esc)" aria-label="Stop probing">
            <X size={12} />
          </button>
        </div>
      </div>
      <div className={`mt-1 ${sheet && !more ? 'grid grid-cols-3 gap-x-3' : 'space-y-0.5'}`}>
        <R k="|v|" v={`${fmt(p.speed)} u/s`} />
        {p.omega > 0 ? (
          <>
            <R k="r = mv⊥/|q|B" v={<span className="text-cyan-200">{fmt(p.rPred)}</span>} hint="Predicted Larmor radius (in the drift frame if E×B)" />
            <R k="r measured" v={rMeasTxt} hint="Mean distance from the orbit centroid over the last full period" />
          </>
        ) : (
          <R k="KE" v={fmt(p.ke)} />
        )}
        {more && (
          <>
            <R k="q, m" v={`${p.info.q}e, ${mass}`} />
            <R k="KE = ½mv²" v={fmt(p.ke)} />
            <R k="|E|, |B| here" v={`${fmt(p.E)}, ${fmt(p.B)}`} />
            {p.omega > 0 && (
              <>
                <R k="v∥, v⊥" v={`${fmt(p.vpar)}, ${fmt(p.vperp)}`} hint="Components along and across B" />
                <R k="ω = |q|B/m" v={`${fmt(p.omega)} rad/s`} />
                <R k="T = 2π/ω" v={`${fmt(p.T)} s`} />
                {p.drift && <R k="E×B drift" v={`${fmt(Math.hypot(p.drift[0], p.drift[1]))} u/s`} />}
              </>
            )}
            {sp.note && <div className="pt-0.5 text-[10px] text-slate-400">{sp.note}</div>}
          </>
        )}
      </div>
    </div>
  );
}
