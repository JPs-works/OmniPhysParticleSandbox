import {
  Atom,
  Crosshair,
  Eraser,
  FlaskConical,
  Grid2x2,
  Magnet,
  MousePointer2,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  RotateCcw,
  ScanLine,
  SlidersHorizontal,
  SprayCan,
  StepForward,
  Target,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { EXPERIMENTS, EXPERIMENT_BY_ID } from '../content/experiments';
import { HelpButton } from '../lib/Help';
import { createStore, useStore, type Store } from '../lib/store';
import { Tip } from '../lib/Tip';
import { buildScene, type PresetId } from '../physics/presets';
import { SPECIES, speciesIdx } from '../physics/species';
import { DEFAULT_PARAMS, type FieldObject, type SimParams } from '../physics/types';
import { FieldCanvas, type CanvasCallbacks, type LiveState, type ProbeView, type SimHandle, type Telemetry, type Toggles } from './FieldCanvas';
import { Hud, ProbeCard } from './Hud';
import { ControlsTab, ExperimentTab, InspectorTab } from './Panels';
import { DEFAULT_TOOL_OPTIONS, TOOLS, type Tool, type ToolOptions } from './tools';

const TOOL_ICON: Record<Tool, LucideIcon> = {
  select: MousePointer2,
  probe: Crosshair,
  charge: Atom,
  plates: Grid2x2,
  bfield: Magnet,
  gun: Zap,
  detector: ScanLine,
  spray: SprayCan,
  eraser: Eraser,
};

const DEFAULT_TOGGLES: Toggles = {
  potential: true,
  flow: true,
  bField: true,
  grid: true,
  trails: true,
  trailTau: 2.5,
  bloom: 1.1,
  vectors: false,
};

const PRESET_TRAIL: Partial<Record<PresetId, number>> = { cyclotron: 6, exb: 6, wien: 1.5, massspec: 1.6, bottle: 1.2, capacitor: 2, rutherford: 1.8, nbody: 1.5, thermal: 0.35, sandbox: 2.5 };
/** dense beams saturate under strong bloom */
const PRESET_BLOOM: Partial<Record<PresetId, number>> = { wien: 0.8, massspec: 0.5, rutherford: 0.55, capacitor: 0.9, thermal: 0.7, bottle: 0.9 };

type PanelTab = 'experiment' | 'controls' | 'inspect';

export interface TelState {
  tel: Telemetry | null;
  energy: number[];
  base: number;
}

/** Space would also "press" a focused button/tab/link; leave those keys to the browser. */
const isInteractive = (t: EventTarget | null) =>
  t instanceof HTMLElement && !!t.closest('input, select, textarea, button, a, summary, [role=button], [role=tab], [role=switch], [role=checkbox], [contenteditable=true]');

/** Mouse clicks shouldn't leave focus on toolbar buttons (keeps Space for pause); keyboard focus stays. */
const blurOnMouse = (e: MouseEvent<HTMLElement>) => {
  if (e.detail > 0) e.currentTarget.blur();
};

function HudConnected({ store, open, setOpen, showMB }: { store: Store<TelState>; open: boolean; setOpen: (v: boolean) => void; showMB: boolean }) {
  const v = useStore(store);
  return <Hud tel={v.tel} energy={v.energy} energyBase={v.base} open={open} setOpen={setOpen} showMB={showMB} />;
}

function ProbeConnected({ store, onClose, sheet }: { store: Store<ProbeView | null>; onClose: () => void; sheet: boolean }) {
  const p = useStore(store);
  if (!p) return null;
  return <ProbeCard p={p} onClose={onClose} sheet={sheet} />;
}

export function FieldLab({
  tabs,
  active,
  rootRef,
  onReady,
  gunRequest,
}: {
  tabs: ReactNode;
  active: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
  onReady: () => void;
  gunRequest: { sp: string; n: number } | null;
}) {
  const [preset, setPreset] = useState<PresetId>('cyclotron');
  const [seed, setSeedState] = useState(1);
  const initial = useMemo(() => buildScene('cyclotron', 1), []);
  const [objects, setObjects] = useState<FieldObject[]>(initial.objects);
  const [params, setParamsState] = useState<SimParams>({ ...DEFAULT_PARAMS, ...initial.params });
  const [toggles, setTogglesState] = useState<Toggles>({ ...DEFAULT_TOGGLES, trailTau: PRESET_TRAIL.cyclotron! });
  const [tool, setTool] = useState<Tool>('select');
  const [opts, setOptsState] = useState<ToolOptions>(DEFAULT_TOOL_OPTIONS);
  const [paused, setPaused] = useState(false);
  const [probeId, setProbeId] = useState(initial.select !== undefined ? initial.select + 1 : 0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>('experiment');
  const [width, setWidth] = useState(1000);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hudOpen, setHudOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const telStore = useMemo(() => createStore<TelState>({ tel: null, energy: [], base: 0 }), []);
  const probeStore = useMemo(() => createStore<ProbeView | null>(null), []);
  const energyRef = useRef<number[]>([]);
  /** index into energyRef where the particle count last changed */
  const energyBase = useRef<{ i: number; n: number }>({ i: 0, n: -1 });
  const simRef = useRef<SimHandle | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userToggledPanel = useRef(false);
  const userToggledHud = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wide = width >= 820;
  const narrow = width < 600;

  const showToast = useCallback((msg: string, ms = 4500) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  // "Send to Field Lab" from the Particle Zoo: arm the gun tool and re-load every gun in the scene
  useEffect(() => {
    if (!gunRequest) return;
    const sp = SPECIES[speciesIdx(gunRequest.sp)];
    setOptsState((o) => ({ ...o, gunSpecies: sp.id, spraySpecies: sp.id }));
    setTool('gun');
    setObjects((list) => list.map((o) => (o.kind === 'gun' ? { ...o, species: [{ sp: sp.id, w: 1 }] } : o)));
    showToast(`Gun species set to ${sp.symbol} (${sp.name}). Guns in this scene now fire ${sp.symbol}. Click and drag on the canvas to place another gun.`, 6000);
  }, [gunRequest, showToast]);

  // ---- live ref for the canvas (read every frame; never stale)
  const live = useRef<LiveState>({ active, objects, params, toggles, tool, opts, paused, probeId, selectedId });
  live.current = { active, objects, params, toggles, tool, opts, paused, probeId, selectedId };

  const setParams = useCallback((p: Partial<SimParams>) => setParamsState((s) => ({ ...s, ...p })), []);
  const setToggles = useCallback((p: Partial<Toggles>) => setTogglesState((s) => ({ ...s, ...p })), []);
  const setOpts = useCallback((p: Partial<ToolOptions>) => setOptsState((s) => ({ ...s, ...p })), []);

  const selectObject = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setPanelTab('inspect');
  }, []);

  const cb = useRef<CanvasCallbacks>(null as unknown as CanvasCallbacks);
  cb.current = {
    onObjects: (objs, select) => {
      setObjects(objs);
      if (select !== undefined) selectObject(select);
    },
    onSelect: selectObject,
    onProbe: (id) => {
      setProbeId(id);
      if (!id) probeStore.set(null);
    },
    onTelemetry: (t) => {
      const e = energyRef.current;
      e.push(t.stats.ke + t.stats.pe);
      const base = energyBase.current;
      if (t.stats.n !== base.n) {
        base.n = t.stats.n;
        base.i = e.length - 1;
      }
      if (e.length > 150) {
        e.shift();
        base.i = Math.max(0, base.i - 1);
      }
      telStore.set({ tel: t, energy: e.slice(), base: base.i });
      const root = rootRef.current;
      if (root) root.dataset.particles = String(t.stats.n);
    },
    onProbeInfo: (p) => probeStore.set(p),
    onReady,
    onError: (m) => setError(m),
    onZoom: (z) => setZoomed(z),
    onHint: (m) => showToast(m),
  };

  // ---- loading presets
  const loadPreset = useCallback(
    (id: PresetId, s: number) => {
      const scene = buildScene(id, s);
      setPreset(id);
      setObjects(scene.objects);
      setParamsState({ ...DEFAULT_PARAMS, ...scene.params });
      setTogglesState((t) => ({ ...t, trailTau: PRESET_TRAIL[id] ?? 2.5, bloom: PRESET_BLOOM[id] ?? DEFAULT_TOGGLES.bloom }));
      setSelectedId(null);
      setProbeId(scene.select !== undefined ? scene.select + 1 : 0);
      probeStore.set(null);
      energyRef.current = [];
      energyBase.current = { i: 0, n: -1 };
      telStore.set({ tel: telStore.get().tel, energy: [], base: 0 });
      simRef.current?.load(scene, s);
    },
    [probeStore, telStore],
  );

  useEffect(() => {
    simRef.current?.load(initial, 1);
  }, [initial]);

  useEffect(() => {
    const root = rootRef.current;
    if (root) root.dataset.preset = preset;
  }, [preset, rootRef]);

  useEffect(() => {
    simRef.current?.send({ type: 'objects', objects });
    simRef.current?.syncSources(objects, params);
  }, [objects, params]);

  useEffect(() => {
    simRef.current?.send({ type: 'params', params });
  }, [params]);

  const setSeed = (s: number) => {
    setSeedState(s);
    loadPreset(preset, s);
  };
  const reset = useCallback(() => loadPreset(preset, seed), [loadPreset, preset, seed]);
  const step = useCallback(() => {
    setPaused(true);
    simRef.current?.step(1);
  }, []);

  // ---- responsive layout
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      if (w === 0) return;
      setWidth(w);
      if (!userToggledPanel.current) setPanelOpen(w >= 1180);
      if (!userToggledHud.current) setHudOpen(w >= 1100);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // space reserved around the framed experiment for the caption (top) and the HUD/chip row (bottom)
  useEffect(() => {
    simRef.current?.setInsets(narrow ? { t: 58, b: 44, l: 4, r: 4 } : { t: 42, b: 40, l: 8, r: 8 });
  }, [narrow]);

  // ---- keyboard
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === ' ') {
        if (isInteractive(e.target)) return;
        e.preventDefault();
        setPaused((p) => !p);
      } else if (k === '.') step();
      else if (k === 'r' || k === 'R') reset();
      else if (k === 'Escape') {
        setSelectedId(null);
        setProbeId(0);
        probeStore.set(null);
      } else if ((k === 'Delete' || k === 'Backspace') && live.current.selectedId) {
        const id = live.current.selectedId;
        setObjects((o) => o.filter((x) => x.id !== id));
        setSelectedId(null);
      } else {
        const td = TOOLS.find((x) => x.key.toLowerCase() === k.toLowerCase());
        if (td) setTool(td.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, reset, step, probeStore]);

  const selectedObj = objects.find((o) => o.id === selectedId) ?? null;
  const togglePanel = () => {
    userToggledPanel.current = true;
    setPanelOpen((v) => !v);
  };
  const openNotes = () => {
    userToggledPanel.current = true;
    setPanelTab('experiment');
    setPanelOpen(true);
  };
  const ex = EXPERIMENT_BY_ID[preset];
  const worldB = objects.filter((o): o is Extract<FieldObject, { kind: 'bfield' }> => o.kind === 'bfield' && !!o.infinite);

  const panel = (
    <aside
      className={`flex min-h-0 flex-col border-l border-white/10 bg-[#070a13]/95 ${wide ? 'w-[300px] shrink-0' : 'absolute inset-y-0 right-0 z-30 w-[min(320px,92%)] shadow-2xl shadow-black/70 backdrop-blur-md'}`}
      data-testid="side-panel"
    >
      <div className="flex shrink-0 border-b border-white/10" role="tablist" aria-label="Panel">
        {(
          [
            ['experiment', 'Experiment', FlaskConical],
            ['controls', 'Controls', SlidersHorizontal],
            ['inspect', 'Inspect', Target],
          ] as [PanelTab, string, LucideIcon][]
        ).map(([id, label, Icon]) => (
          <button
            type="button"
            key={id}
            role="tab"
            aria-selected={panelTab === id}
            onClick={(e) => {
              setPanelTab(id);
              blurOnMouse(e);
            }}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-[11.5px] transition-colors ${panelTab === id ? 'border-b-2 border-cyan-300 text-cyan-100' : 'border-b-2 border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
        {!wide && (
          <button type="button" onClick={togglePanel} className="px-2 text-slate-400 hover:text-white" aria-label="Close panel" title="Close panel">
            <PanelRightClose size={15} />
          </button>
        )}
      </div>
      <div className="omni-scroll min-h-0 flex-1 overflow-y-auto">
        {panelTab === 'experiment' && <ExperimentTab preset={preset} store={telStore} objects={objects} params={params} />}
        {panelTab === 'controls' && (
          <ControlsTab
            tool={tool}
            opts={opts}
            setOpts={setOpts}
            params={params}
            setParams={setParams}
            toggles={toggles}
            setToggles={setToggles}
            seed={seed}
            setSeed={setSeed}
            onClearParticles={() => simRef.current?.send({ type: 'clear' })}
            onClearDetectors={() => simRef.current?.send({ type: 'clearDetectors' })}
          />
        )}
        {panelTab === 'inspect' && (
          <InspectorTab
            obj={selectedObj}
            objects={objects}
            onSelect={selectObject}
            onChange={(o) => setObjects((list) => list.map((x) => (x.id === o.id ? o : x)))}
            onDelete={() => {
              setObjects((list) => list.filter((x) => x.id !== selectedId));
              setSelectedId(null);
            }}
            onClearDetectors={() => simRef.current?.send({ type: 'clearDetectors' })}
          />
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* top bar */}
      <header className="relative z-40 flex h-11 shrink-0 items-center gap-2 border-b border-white/10 bg-[#060810]/95 px-2">
        {tabs}
        <div className="mx-1 h-5 w-px bg-white/10" />
        <label className="flex min-w-0 items-center gap-1.5">
          <span className="sr-only">Experiment</span>
          <select
            value={preset}
            onChange={(e) => loadPreset(e.target.value as PresetId, seed)}
            className="omni-select min-w-0 max-w-[44vw] font-medium"
            data-testid="preset-select"
            title="Guided experiments"
          >
            {EXPERIMENTS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-0.5">
          <Tip label={paused ? 'Play' : 'Pause'} hint="Space" side="bottom">
            <button
              type="button"
              aria-label={paused ? 'Play' : 'Pause'}
              onClick={(e) => {
                setPaused((p) => !p);
                blurOnMouse(e);
              }}
              className={`omni-icon-btn ${paused ? 'text-amber-200' : ''}`}
              data-testid="play-pause"
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
          </Tip>
          <Tip label="Single step" hint="." side="bottom">
            <button
              type="button"
              aria-label="Single step"
              onClick={(e) => {
                step();
                blurOnMouse(e);
              }}
              className="omni-icon-btn"
            >
              <StepForward size={16} />
            </button>
          </Tip>
          <Tip label="Reset to seed" hint={`R: restart this experiment (seed ${seed})`} side="bottom">
            <button
              type="button"
              aria-label="Reset"
              onClick={(e) => {
                reset();
                blurOnMouse(e);
              }}
              className="omni-icon-btn"
            >
              <RotateCcw size={16} />
            </button>
          </Tip>
          <div className="mx-1 h-5 w-px bg-white/10" />
          <HelpButton />
          <Tip label={panelOpen ? 'Hide panel' : 'Show panel'} hint="Experiment notes, controls, inspector" side="bottom">
            <button type="button" aria-label="Toggle side panel" aria-expanded={panelOpen} onClick={togglePanel} className={`omni-icon-btn ${panelOpen ? 'text-cyan-200' : ''}`}>
              {panelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          </Tip>
        </div>
      </header>

      <div ref={containerRef} className="relative flex min-h-0 flex-1">
        {/* toolbar */}
        <nav className="z-20 flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-white/10 bg-[#060810]/95 py-1.5" aria-label="Tools">
          {TOOLS.map((t, i) => {
            const Icon = TOOL_ICON[t.id];
            return (
              <div key={t.id} className="contents">
                {(i === 2 || i === 7) && <div className="my-1 h-px w-6 bg-white/10" />}
                <Tip label={`${t.label}  (${t.key})`} hint={t.hint} side="right">
                  <button
                    type="button"
                    aria-label={`${t.label} (${t.key})`}
                    aria-pressed={tool === t.id}
                    data-tool={t.id}
                    onClick={(e) => {
                      setTool(t.id);
                      if (t.id !== 'select' && t.id !== 'probe' && panelOpen) setPanelTab('controls');
                      blurOnMouse(e);
                    }}
                    className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${tool === t.id ? 'bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-300/40' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'}`}
                  >
                    <Icon size={16} />
                  </button>
                </Tip>
              </div>
            );
          })}
        </nav>

        {/* canvas */}
        <div className="relative min-w-0 flex-1">
          <FieldCanvas ref={simRef} live={live} cb={cb} ariaLabel={`${ex.title} simulation. ${ex.watch} Use the tools on the left to add sources; Space pauses, R resets.`} />
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-rose-200">
              <div className="max-w-sm rounded-lg border border-rose-400/30 bg-rose-950/60 p-4">{error}</div>
            </div>
          )}

          {/* top-left: one-line "watch this" caption */}
          <div className={`pointer-events-none absolute left-2 top-2 z-10 ${narrow ? 'right-2' : 'max-w-[min(640px,calc(100%-260px))]'}`}>
            <div className="pointer-events-auto flex items-start gap-2 rounded-lg border border-white/10 bg-slate-950/75 px-2.5 py-1.5 text-[12px] text-slate-200 shadow-lg shadow-black/40 backdrop-blur-md" data-testid="watch-caption">
              <FlaskConical size={13} className="mt-0.5 shrink-0 text-cyan-300" />
              <p className={`min-w-0 ${narrow ? 'line-clamp-2' : ''}`}>
                <span className="font-semibold text-white">{ex.title}.</span> <span className="text-slate-300">{ex.watch}</span>
              </p>
              {!panelOpen && (
                <button type="button" onClick={openNotes} className="shrink-0 rounded bg-cyan-400/15 px-1.5 py-px text-[11px] text-cyan-100 hover:bg-cyan-400/25" data-testid="experiment-chip">
                  Notes
                </button>
              )}
            </div>
          </div>

          {/* top-right (wide) / bottom sheet (narrow): probe */}
          {probeId > 0 && (
            <div className={`pointer-events-none absolute z-10 ${narrow ? 'inset-x-2 bottom-11' : 'right-2 top-2'}`}>
              <ProbeConnected
                store={probeStore}
                sheet={narrow}
                onClose={() => {
                  setProbeId(0);
                  probeStore.set(null);
                }}
              />
            </div>
          )}

          {toast && (
            <div className={`pointer-events-none absolute left-1/2 z-20 w-max max-w-[86%] -translate-x-1/2 rounded-lg border border-cyan-300/30 bg-slate-950/90 px-3 py-1.5 text-center text-[12px] text-cyan-50 shadow-xl backdrop-blur ${narrow ? 'top-16' : 'top-12'}`} role="status" data-testid="toast">
              {toast}
            </div>
          )}

          {/* bottom row: telemetry (left), field chips + zoom (right) */}
          <div className="pointer-events-none absolute bottom-2 left-2 z-10">
            <HudConnected
              store={telStore}
              open={hudOpen}
              setOpen={(v) => {
                userToggledHud.current = true;
                setHudOpen(v);
              }}
              showMB={preset === 'thermal' || preset === 'sandbox'}
            />
          </div>
          <div className="pointer-events-none absolute bottom-2 right-2 z-10 flex max-w-[55%] flex-wrap items-end justify-end gap-1.5">
            {zoomed && (
              <button type="button" onClick={() => simRef.current?.resetView()} className="pointer-events-auto rounded-full border border-white/15 bg-slate-950/80 px-2.5 py-0.5 text-[11px] text-slate-200 shadow-lg backdrop-blur hover:border-cyan-300/40" title="Frame the whole experiment again">
                Reset view
              </button>
            )}
            {worldB.map((b) => (
              <button
                type="button"
                key={b.id}
                onClick={() => {
                  selectObject(b.id);
                  if (!panelOpen) {
                    userToggledPanel.current = true;
                    setPanelOpen(true);
                  }
                }}
                className={`pointer-events-auto rounded-full border px-2.5 py-0.5 font-mono text-[11px] shadow-lg backdrop-blur ${selectedId === b.id ? 'border-cyan-300/60 bg-cyan-950/70 text-cyan-50' : 'border-white/15 bg-slate-950/80 hover:border-cyan-300/40'} ${b.bz >= 0 ? 'text-violet-100' : 'text-teal-100'}`}
                title="Uniform magnetic field filling the whole world: click to edit or delete it"
                data-testid="world-b-chip"
              >
                B {b.bz >= 0 ? '⊙' : '⊗'} {Math.abs(b.bz).toPrecision(3)} everywhere
              </button>
            ))}
          </div>
          {paused && (
            <div className={`pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 rounded-full border border-amber-300/30 bg-amber-950/60 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-amber-100 backdrop-blur ${narrow ? 'bottom-24' : 'bottom-2'}`}>
              PAUSED · Space resumes · . steps
            </div>
          )}
        </div>

        {panelOpen && panel}
        {panelOpen && !wide && <div className="absolute inset-0 z-20 bg-black/40" onClick={togglePanel} aria-hidden />}
      </div>
    </div>
  );
}
