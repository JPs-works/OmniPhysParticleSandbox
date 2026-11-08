import { ChevronDown, ChevronUp, Info, PanelRightClose, PanelRightOpen, Pause, Play, Send } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Tex } from '../lib/Tex';
import { Tip } from '../lib/Tip';
import { Segmented, Slider, Toggle } from '../lib/ui';
import { speciesByCatalogId } from '../physics/species';
import { CATALOG, CATALOG_BY_ID, FAMILY_COLOR, HBARC, ME, MP, fmtCharge, fmtLength, fmtMass, fmtSci, fmtSpin, fmtTime, type CatalogParticle, type Family } from './catalog';
import { DoubleSlitView } from './DoubleSlitView';
import { atomFor, orbitalName } from './orbital';
import { OrbitalView } from './OrbitalView';
import { packetInfo, WavePacketView } from './WavePacketView';

type View = 'packet' | 'atom' | 'slit';
const FAMILIES: (Family | 'All')[] = ['All', 'Lepton', 'Quark', 'Boson', 'Hadron', 'Nucleus', 'Hypothetical'];

function sendability(p: CatalogParticle): { ok: boolean; why: string; sp?: string } {
  const s = speciesByCatalogId(p.id);
  if (p.confined) return { ok: false, why: 'Confined: cannot exist as a free particle.' };
  if (p.hypothetical) return { ok: false, why: 'Hypothetical particle.' };
  if (p.charge === 0) return { ok: false, why: 'Neutral: E and B fields would not deflect it.' };
  if (p.lifetime !== null && p.lifetime < 1e-9) return { ok: false, why: `Lifetime ${fmtTime(p.lifetime)} is too short to track in a field.` };
  if (!s) return { ok: false, why: 'Not available as a Field Lab species.' };
  return { ok: true, why: `Fire ${s.symbol} from the Field Lab gun (q/m = ${(s.q / s.m).toPrecision(3)} e/mₚ)`, sp: s.id };
}

function PropertyCard({ p, beta, onSend }: { p: CatalogParticle; beta: number; onSend: (sp: string) => void }) {
  const send = sendability(p);
  const fam = FAMILY_COLOR[p.family];
  const massive = Number.isFinite(p.mass) && p.mass > 0;
  const lambdaC = massive ? (2 * Math.PI * HBARC) / p.mass : NaN;
  const info = massive ? packetInfo(p, beta) : null;
  const gamma = 1 / Math.sqrt(1 - Math.min(beta, 0.999) ** 2);
  const decayLen = p.lifetime && massive && beta > 0 ? gamma * beta * 2.99792458e8 * p.lifetime : NaN;
  const Row = ({ k, v, hint }: { k: ReactNode; v: ReactNode; hint?: string }) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 py-1 text-[12px]" title={hint}>
      <span className="text-slate-400">{k}</span>
      <span className="text-right font-mono tabular-nums text-slate-100">{v}</span>
    </div>
  );
  return (
    <div className="px-3 py-3" data-testid="property-card">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-xl font-semibold text-white" style={{ borderColor: `${fam}66`, background: `radial-gradient(circle at 35% 30%, ${fam}55, transparent 70%)`, boxShadow: `0 0 18px ${fam}33` }}>
          {p.symbol}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-white">{p.name}</h2>
          <div className="mt-0.5 flex flex-wrap gap-1 text-[10.5px]">
            <span className="rounded px-1.5 py-px" style={{ background: `${fam}22`, color: fam }}>
              {p.family}
            </span>
            {p.lifetime !== null ? (
              <span className="rounded bg-rose-500/15 px-1.5 py-px text-rose-200">unstable</span>
            ) : p.confined ? (
              <span className="rounded bg-amber-500/15 px-1.5 py-px text-amber-200" title="Never observed in isolation">confined</span>
            ) : p.hypothetical ? (
              <span className="rounded bg-violet-500/15 px-1.5 py-px text-violet-200">hypothetical</span>
            ) : (
              <span className="rounded bg-emerald-500/15 px-1.5 py-px text-emerald-200">stable</span>
            )}
            <span className="rounded bg-white/5 px-1.5 py-px text-slate-300">{Number.isInteger(p.spin) ? 'boson' : 'fermion'}</span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-slate-300">{p.description}</p>
      {p.caveat && <p className="mt-1.5 rounded-md border border-amber-300/20 bg-amber-400/5 px-2 py-1 text-[11px] text-amber-100/90">{p.caveat}</p>}
      <div className="mt-2">
        <Row k="Mass" v={fmtMass(p.mass)} />
        {massive && <Row k="" v={`${fmtSci(p.mass / ME)} mₑ · ${fmtSci(p.mass / MP)} mₚ`} />}
        <Row k="Charge" v={`${fmtCharge(p.charge)} e`} />
        <Row k="Spin" v={`${fmtSpin(p.spin)} ħ`} />
        <Row k="Lifetime τ" v={p.lifetime !== null ? fmtTime(p.lifetime) : p.confined ? (p.lifetimeNote ?? 'n/a (confined)') : (p.lifetimeNote ?? 'stable')} />
        {p.colorCharge && <Row k="Colour" v={p.colorCharge} />}
        {p.composition && <Row k="Quarks" v={p.composition} />}
        {p.antiparticle && <Row k="Antiparticle" v={p.antiparticle} />}
        {massive && <Row k={<Tex tex="\lambda_C = h/mc" />} v={fmtLength(lambdaC)} hint="Compton wavelength" />}
        {info && beta > 0 && <Row k={<Tex tex="\lambda = h/\gamma m v" />} v={fmtLength(info.lambdaFm)} hint={`de Broglie wavelength at v = ${beta}c`} />}
        {Number.isFinite(decayLen) && <Row k={<Tex tex="\gamma\beta c\tau" />} v={fmtLength(decayLen * 1e15)} hint="Mean decay length at the chosen speed (time dilation included)" />}
      </div>
      <Tip label={send.ok ? 'Send to Field Lab' : 'Cannot send'} hint={send.why} side="top" className="mt-3 w-full">
        <button
          type="button"
          disabled={!send.ok}
          onClick={() => send.sp && onSend(send.sp)}
          data-testid="send-to-lab"
          className={`flex w-full items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors ${send.ok ? 'border-cyan-300/40 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20' : 'cursor-not-allowed border-white/10 text-slate-400'}`}
        >
          <Send size={13} /> Send to Field Lab
        </button>
      </Tip>
      {!send.ok && <p className="mt-1 text-center text-[10.5px] text-slate-400">{send.why}</p>}
    </div>
  );
}

const VIEW_TEXT: Record<View, { title: string; eq: string; body: string }> = {
  packet: {
    title: 'Free wave packet',
    eq: 'i\\hbar\\,\\partial_t\\psi = -\\tfrac{\\hbar^2}{2m}\\partial_x^2\\psi,\\quad \\sigma(t)=\\sigma_0\\sqrt{1+(t/t_s)^2}',
    body: 'This is the exact solution for a Gaussian packet. Lighter particles spread faster, because t_s = 2γ³mσ₀²/ħ grows with mass (γ ≈ 1 at low speed). The carrier wavelength is the de Broglie wavelength h/p.',
  },
  atom: {
    title: 'Hydrogen-like orbital',
    eq: '|\\psi_{n\\ell m}|^2,\\qquad a = a_0\\,\\dfrac{m_e}{\\mu},\\quad E_n = -\\dfrac{13.6\\,\\text{eV}\\,(\\mu/m_e)}{n^2}',
    body: 'This samples the exact Coulomb bound-state density. Colour shows the sign of the real wavefunction. Choose n, ℓ, m yourself: these orbital quantum numbers are not the particle’s intrinsic spin.',
  },
  slit: {
    title: 'Double slit · pilot wave',
    eq: '\\dot x = \\tfrac{\\hbar}{m}\\,\\mathrm{Im}\\,\\dfrac{\\partial_x\\psi}{\\psi}',
    body: 'Two Gaussian slits interfere. In de Broglie–Bohm theory each particle follows a definite path guided by ψ, and the paths never cross. It is an interpretation: its predictions match standard quantum mechanics. In these scaled units the fringe shape is the same for every mass.',
  },
};

export function ParticleZoo({ tabs, active, onReady, onSendToLab }: { tabs: ReactNode; active: boolean; onReady: () => void; onSendToLab: (sp: string) => void }) {
  const [sel, setSel] = useState('electron');
  const [family, setFamily] = useState<Family | 'All'>('All');
  const [view, setView] = useState<View>('packet');
  const [beta, setBeta] = useState(0.01);
  const [playing, setPlaying] = useState(true);
  const [nlm, setNlm] = useState<[number, number, number]>([2, 1, 0]);
  const [traj, setTraj] = useState(true);
  const [width, setWidth] = useState(1000);
  const [cardOpen, setCardOpen] = useState(true);
  const [infoOpen, setInfoOpen] = useState(true);
  const userInfo = useRef(false);
  const userToggled = useRef(false);
  const ref = useRef<HTMLDivElement>(null);
  const p = CATALOG_BY_ID[sel];
  const list = useMemo(() => CATALOG.filter((x) => family === 'All' || x.family === family), [family]);
  const atom = atomFor(p);
  const wide = width >= 820;
  const narrow = width < 640;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      if (w === 0) return;
      setWidth(w);
      if (!userToggled.current) setCardOpen(w >= 820);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (active) {
      const id = requestAnimationFrame(() => onReady());
      return () => cancelAnimationFrame(id);
    }
  }, [active, onReady]);

  const vt = VIEW_TEXT[view];
  const [n, l, m] = nlm;
  const toggleCard = () => {
    userToggled.current = true;
    setCardOpen((v) => !v);
  };

  const catalogList = (
    <nav className="omni-scroll flex w-[220px] shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-[#060810]/95" aria-label="Particle catalog">
      <div className="flex flex-wrap gap-1 border-b border-white/5 p-2">
        {FAMILIES.map((f) => (
          <button
            type="button"
            key={f}
            onClick={() => setFamily(f)}
            className={`rounded-full border px-2 py-0.5 text-[10.5px] transition-colors ${family === f ? 'border-cyan-300/40 bg-cyan-400/10 text-cyan-100' : 'border-white/10 text-slate-400 hover:text-slate-200'}`}
          >
            {f}
          </button>
        ))}
      </div>
      <ul className="p-1">
        {list.map((x) => (
          <li key={x.id}>
            <button
              type="button"
              onClick={() => setSel(x.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors ${sel === x.id ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5'}`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold" style={{ color: FAMILY_COLOR[x.family], background: `${FAMILY_COLOR[x.family]}1a` }}>
                {x.symbol}
              </span>
              <span className="min-w-0 flex-1 truncate">{x.name}</span>
              <span className="font-mono text-[10px] text-slate-400">{fmtCharge(x.charge)}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );

  const labScale =
    p.mass > 0 && packetInfo(p, Math.max(beta, 0.01)).lambdaFm < Infinity
      ? `Lab scale for a ${p.symbol} at v = ${Math.max(beta, 0.01)}c: slits 1 μm apart with a screen 1 m away give fringes ${fmtLength((packetInfo(p, Math.max(beta, 0.01)).lambdaFm * 1e15) / 1e9)} apart.`
      : null;

  const explainer = (
    <div className="text-[12px] leading-relaxed text-slate-300" data-testid="view-explainer">
      <div className="overflow-x-auto py-1 text-center text-slate-100">
        <Tex tex={vt.eq} />
      </div>
      <p>{vt.body}</p>
      {view === 'atom' && atom.note && <p className={`mt-1 text-[11.5px] ${atom.applicable ? 'text-slate-400' : 'text-amber-200/90'}`}>{atom.note}</p>}
      {view === 'slit' && p.mass === 0 && <p className="mt-1 text-[11.5px] text-amber-200/90">Massless {p.name}: Bohmian guidance for photons is not standard, so only the interference intensity is shown.</p>}
      {view === 'slit' && labScale && <p className="mt-1 text-[11.5px] text-slate-400">{labScale}</p>}
      {view === 'packet' && <p className="mt-1 text-[11.5px] text-slate-400">Relativistic speeds use p = γmv and the longitudinal effective mass γ³m. This is a quadratic expansion of the dispersion, not a full Klein–Gordon or Dirac treatment.</p>}
    </div>
  );

  const controls = (
    <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 bg-[#060810]/80 px-2 py-1 text-[11.5px]" data-testid="view-controls">
      {narrow && (
        <div className="w-full">
          <Segmented<View> value={view} onChange={setView} options={[{ v: 'packet', label: 'Packet' }, { v: 'atom', label: 'Atom' }, { v: 'slit', label: 'Slits' }]} />
        </div>
      )}
      {view === 'packet' && (
        <div className="w-full max-w-[300px]">
          <Slider label="speed v/c" value={beta} min={0} max={0.99} step={0.001} onChange={setBeta} format={(v) => v.toFixed(3)} />
        </div>
      )}
      {view === 'atom' && (
        <>
          <div className="flex items-center gap-2">
            {(['n', 'ℓ', 'm'] as const).map((lab, i) => {
              const opts = i === 0 ? [1, 2, 3, 4] : i === 1 ? Array.from({ length: n }, (_, k) => k) : Array.from({ length: 2 * l + 1 }, (_, k) => k - l);
              return (
                <label key={lab} className="flex items-center gap-1 text-slate-400">
                  {lab}
                  <select
                    className="omni-select py-0.5"
                    value={nlm[i]}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (i === 0) setNlm([v, Math.min(l, v - 1), Math.max(-Math.min(l, v - 1), Math.min(m, Math.min(l, v - 1)))]);
                      else if (i === 1) setNlm([n, v, Math.max(-v, Math.min(v, m))]);
                      else setNlm([n, l, v]);
                    }}
                  >
                    {opts.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
          <span className="text-slate-200">
            <span className="font-semibold">{atom.name}</span> · {orbitalName(n, l, m)} · a = {atom.aPm < 1 ? `${(atom.aPm * 1000).toPrecision(3)} fm` : `${atom.aPm.toPrecision(3)} pm`} · E<sub>{n}</sub> = {fmtSci(-atom.e1 / (n * n))} eV
          </span>
        </>
      )}
      {view === 'slit' && p.mass !== 0 && (
        <div className="w-56">
          <Toggle label="Show Bohmian trajectories" checked={traj} onChange={setTraj} />
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="relative z-40 flex h-11 shrink-0 items-center gap-2 border-b border-white/10 bg-[#060810]/95 px-2">
        {tabs}
        <div className="mx-1 h-5 w-px bg-white/10" />
        {narrow ? (
          <select value={sel} onChange={(e) => setSel(e.target.value)} className="omni-select min-w-0 max-w-[40vw]" aria-label="Particle">
            {CATALOG.map((x) => (
              <option key={x.id} value={x.id}>
                {x.symbol} {x.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="w-[300px]">
            <Segmented<View>
              value={view}
              onChange={setView}
              options={[
                { v: 'packet', label: 'Wave packet' },
                { v: 'atom', label: 'Atom' },
                { v: 'slit', label: 'Double slit' },
              ]}
            />
          </div>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <Tip label={playing ? 'Pause animation' : 'Play animation'} side="bottom">
            <button type="button" aria-label={playing ? 'Pause animation' : 'Play animation'} className="omni-icon-btn" onClick={() => setPlaying(!playing)}>
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
          </Tip>
          <Tip label={cardOpen ? 'Hide properties' : 'Show properties'} side="bottom">
            <button type="button" aria-label="Toggle properties panel" aria-expanded={cardOpen} className={`omni-icon-btn ${cardOpen ? 'text-cyan-200' : ''}`} onClick={toggleCard}>
              {cardOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          </Tip>
        </div>
      </header>
      <div ref={ref} className="relative flex min-h-0 flex-1">
        {!narrow && catalogList}
        <div className="flex min-w-0 flex-1 flex-col bg-[#03040a]">
          {controls}
          <div className="relative min-h-0 flex-1" key={view}>
            {view === 'packet' && <WavePacketView particle={p} beta={beta} playing={playing && active} />}
            {view === 'atom' && <OrbitalView n={n} l={l} m={m} playing={playing && active} />}
            {view === 'slit' && <DoubleSlitView showTrajectories={traj && p.mass !== 0} playing={playing && active} />}
          </div>
          {!wide && (
            <div className="omni-scroll max-h-[40%] shrink-0 overflow-y-auto border-t border-white/10 bg-[#070a13] px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  userInfo.current = true;
                  setInfoOpen(!infoOpen);
                }}
                className="flex w-full items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400 hover:text-slate-200"
                aria-expanded={infoOpen}
              >
                <Info size={12} className="text-cyan-300" /> {vt.title}
                <span className="ml-auto">{infoOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}</span>
              </button>
              {infoOpen && <div className="mt-1">{explainer}</div>}
            </div>
          )}
        </div>
        {cardOpen && (
          <aside className={`omni-scroll overflow-y-auto border-l border-white/10 bg-[#070a13]/95 ${wide ? 'w-[300px] shrink-0' : 'absolute inset-y-0 right-0 z-30 w-[min(310px,92%)] shadow-2xl shadow-black/70 backdrop-blur-md'}`}>
            {wide && (
              <section className="border-b border-white/10 px-3 py-3">
                <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <Info size={12} className="text-cyan-300" /> {vt.title}
                </div>
                {explainer}
              </section>
            )}
            <PropertyCard p={p} beta={beta} onSend={onSendToLab} />
          </aside>
        )}
        {cardOpen && !wide && <div className="absolute inset-0 z-20 bg-black/40" onClick={toggleCard} aria-hidden />}
      </div>
    </div>
  );
}
