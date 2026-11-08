import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type MutableRefObject } from 'react';
import { Engine } from '../physics/engine';
import { newId } from '../physics/presets';
import type { FrameMsg, FromWorker, ToWorker } from '../physics/protocol';
import { SPECIES, speciesIdx } from '../physics/species';
import { SIM_BOUNDS, type Bounds, type FieldObject, type ProbeInfo, type SceneSpec, type SimParams, type SimStats } from '../physics/types';
import { FieldRenderer, type RenderToggles } from '../render/FieldRenderer';
import { DESIGN_VIEW, SOURCE_LIMITS, dirVec, fitView, type Insets, type Tool, type ToolOptions } from './tools';

export interface Toggles extends RenderToggles {
  vectors: boolean;
}

export interface LiveState {
  active: boolean;
  objects: FieldObject[];
  params: SimParams;
  toggles: Toggles;
  tool: Tool;
  opts: ToolOptions;
  paused: boolean;
  probeId: number;
  selectedId: string | null;
}

export interface Telemetry {
  stats: SimStats;
  fps: number;
  stepMs: number;
  /** sim seconds advanced per real second */
  simRate: number;
}

export interface ProbeView {
  info: ProbeInfo;
  speed: number;
  vperp: number;
  vpar: number;
  B: number;
  E: number;
  ke: number;
  omega: number;
  T: number;
  rPred: number;
  rMeas: number | null;
  center: [number, number] | null;
  drift: [number, number] | null;
  planar: boolean;
}

export interface CanvasCallbacks {
  onObjects(objs: FieldObject[], select?: string | null): void;
  onSelect(id: string | null): void;
  onProbe(id: number): void;
  onTelemetry(t: Telemetry): void;
  onProbeInfo(p: ProbeView | null): void;
  onReady(): void;
  onError(msg: string): void;
  onZoom(zoomed: boolean): void;
  /** transient hint/notice for the user (scroll hint, limits) */
  onHint(msg: string): void;
}

export interface SimHandle {
  load(scene: SceneSpec, seed: number): void;
  send(msg: ToWorker): void;
  step(n: number): void;
  syncSources(objects: FieldObject[], params: SimParams): void;
  resetView(): void;
  /** css-pixel space reserved for overlays when framing the scene */
  setInsets(i: Insets): void;
}

const DRAW_TOOLS: Tool[] = ['charge', 'plates', 'bfield', 'gun', 'detector', 'spray', 'eraser'];

type Drag =
  | { kind: 'none' }
  | { kind: 'move'; id: string; start: [number, number]; orig: FieldObject }
  | { kind: 'resize'; id: string; corner: number; orig: FieldObject }
  | { kind: 'endpoint'; id: string; end: 0 | 1 }
  | { kind: 'create'; tool: Tool; a: [number, number]; b: [number, number] }
  | { kind: 'spray'; at: [number, number]; acc: number }
  | { kind: 'erase'; at: [number, number] };

const TOOL_COLOR: Partial<Record<Tool, string>> = {
  plates: '#fb923c',
  bfield: '#c084fc',
  detector: '#e2e8f0',
  gun: '#67e8f9',
};

function rectOf(o: FieldObject): [number, number, number, number] | null {
  if (o.kind === 'plates' || (o.kind === 'bfield' && !o.infinite))
    return [Math.min(o.x0, o.x1), Math.min(o.y0, o.y1), Math.max(o.x0, o.x1), Math.max(o.y0, o.y1)];
  if (o.kind === 'mirror') return [o.x - o.L, o.y - o.H, o.x + o.L, o.y + o.H];
  return null;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / Math.max(dx * dx + dy * dy, 1e-9)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

const fmtQ = (q: number) => `${q > 0 ? '+' : q < 0 ? '−' : ''}${Math.abs(q) >= 10 ? Math.abs(q).toFixed(0) : Math.abs(q).toPrecision(2)}e`;
const fmtN = (v: number) => {
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toPrecision(3);
  return v.toPrecision(2);
};

export const FieldCanvas = forwardRef<SimHandle, { live: MutableRefObject<LiveState>; cb: MutableRefObject<CanvasCallbacks>; ariaLabel: string }>(
  function FieldCanvas({ live, cb, ariaLabel }, ref) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const glRef = useRef<HTMLCanvasElement>(null);
    const ovRef = useRef<HTMLCanvasElement>(null);
    const workerRef = useRef<Worker | null>(null);
    const rendererRef = useRef<FieldRenderer | null>(null);
    /** camera view (may be zoomed); fitRef frames the scene's region of interest. The sim box is fixed (SIM_BOUNDS). */
    const viewRef = useRef<Bounds>(fitView(1000, 600));
    const fitRef = useRef<Bounds>(fitView(1000, 600));
    const roiRef = useRef<Bounds>(DESIGN_VIEW);
    const insetRef = useRef<Insets>({ t: 0, b: 0, l: 0, r: 0 });
    const resizeRef = useRef<() => void>(() => {});
    const outstanding = useRef(0);
    const [touchActive, setTouchActive] = useState(false);
    const zoomRef = useRef({ s: 1, cx: 0, cy: 0 });
    const applyViewRef = useRef<() => void>(() => {});
    const sizeRef = useRef<[number, number]>([1000, 600]);
    const evalRef = useRef(new Engine(16));
    const frameRef = useRef<FrameMsg | null>(null);
    const statsRef = useRef<SimStats | null>(null);
    const probeRef = useRef<ProbeView | null>(null);
    const histRef = useRef<{ id: number; pts: { t: number; x: number; y: number }[] }>({ id: 0, pts: [] });
    const dragRef = useRef<Drag>({ kind: 'none' });
    const hoverRef = useRef<[number, number] | null>(null);
    const pendingLoad = useRef<{ scene: SceneSpec; seed: number } | null>(null);

    const post = (m: ToWorker, transfer: Transferable[] = []) => {
      const w = workerRef.current;
      if (!w) return;
      // every advance/step is answered by exactly one frame; count them so we never stack requests
      if (m.type === 'advance' || m.type === 'step') outstanding.current++;
      w.postMessage(m, transfer);
    };

    useImperativeHandle(ref, () => ({
      load(scene, seed) {
        histRef.current = { id: 0, pts: [] };
        rendererRef.current?.resetTrails();
        roiRef.current = scene.view ?? DESIGN_VIEW;
        zoomRef.current = { s: 1, cx: 0, cy: 0 };
        resizeRef.current();
        if (!workerRef.current) {
          pendingLoad.current = { scene, seed };
          return;
        }
        post({ type: 'load', scene, seed, bounds: SIM_BOUNDS });
      },
      send: (m) => post(m),
      resetView() {
        zoomRef.current = { s: 1, cx: 0, cy: 0 };
        applyViewRef.current();
      },
      setInsets(i) {
        const o = insetRef.current;
        if (o.t === i.t && o.b === i.b && o.l === i.l && o.r === i.r) return;
        insetRef.current = i;
        resizeRef.current();
      },
      step(n) {
        post({ type: 'step', n, probeId: live.current.probeId });
      },
      syncSources(objects, params) {
        const ev = evalRef.current;
        ev.setParams(params);
        ev.setObjects(objects);
        const r = rendererRef.current;
        if (!r) return;
        // characteristic scales for colour mapping (sample the design box)
        const phis: number[] = [], es: number[] = [];
        let bmax = 0;
        const f = new Float64Array(5);
        for (let i = 0; i < 40; i++)
          for (let j = 0; j < 24; j++) {
            const x = -500 + (i + 0.5) * 25, y = -300 + (j + 0.5) * 25;
            const p = ev.potentialAt(x, y);
            if (p !== 0) phis.push(Math.abs(p));
            ev.fieldAt(x, y, f);
            const e = Math.hypot(f[0], f[1]);
            if (e > 0) es.push(e);
            bmax = Math.max(bmax, Math.hypot(f[2], f[3]));
          }
        const pct = (a: number[], q: number) => (a.length ? a.sort((x, y) => x - y)[Math.floor(a.length * q)] : 1);
        r.setSources(objects, params, { phi: pct(phis, 0.9) * 1.6, e: pct(es, 0.6), b: bmax || 1 });
      },
    }));

    useEffect(() => {
      const wrap = wrapRef.current!, gl = glRef.current!, ov = ovRef.current!;
      let renderer: FieldRenderer;
      try {
        renderer = new FieldRenderer(gl);
      } catch (e) {
        cb.current.onError('WebGL2 is not available in this browser, so the Field Lab cannot render.');
        return;
      }
      rendererRef.current = renderer;
      const worker = new Worker(new URL('../physics/sim.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      const ctx = ov.getContext('2d')!;

      let accReal = 0;
      let spare: ArrayBuffer[] = [];
      let quality = 1, slowFor = 0, fastFor = 0;
      let frameNo = 0;
      let ready = false;
      let fpsFrames = 0, fpsT = performance.now(), fps = 0;
      let lastSimTime = 0, lastSimWall = performance.now(), simRate = 0;
      let lastStepMs = 0;
      let lastProbePush = 0;

      worker.onmessage = (ev: MessageEvent<FromWorker>) => {
        const m = ev.data;
        if (m.type === 'frame') {
          outstanding.current = Math.max(0, outstanding.current - 1);
          // the previous frame's buffers can go back to the worker with the next request
          const prev = frameRef.current;
          if (prev) spare = [prev.pos.buffer, prev.seg.buffer, prev.sp.buffer, prev.ids.buffer] as ArrayBuffer[];
          frameRef.current = m;
          renderer.setParticles(m.n, m.pos, m.seg, m.sp);
          lastStepMs = m.stepMs;
          if (m.probe !== undefined) updateProbe(m.probe, m.time);
          if (m.stats) {
            statsRef.current = m.stats;
            const now = performance.now();
            if (now - lastSimWall > 400) {
              simRate = (m.time - lastSimTime) / ((now - lastSimWall) / 1000);
              lastSimTime = m.time;
              lastSimWall = now;
            }
            cb.current.onTelemetry({ stats: m.stats, fps, stepMs: lastStepMs, simRate });
          }
        } else if (m.type === 'error') {
          outstanding.current = 0;
          console.warn('[omniphys worker]', m.message);
        }
      };
      worker.onerror = (e) => {
        outstanding.current = 0;
        console.warn('[omniphys worker]', e.message);
      };

      function updateProbe(info: ProbeInfo | null, t: number) {
        const L = live.current;
        if (!info) {
          if (probeRef.current) {
            probeRef.current = null;
            cb.current.onProbeInfo(null);
          }
          if (L.probeId > 0) cb.current.onProbe(0);
          return;
        }
        const h = histRef.current;
        if (h.id !== info.id) {
          h.id = info.id;
          h.pts = [];
        }
        const lastPt = h.pts[h.pts.length - 1];
        if (!lastPt || t > lastPt.t) h.pts.push({ t, x: info.x, y: info.y });
        if (h.pts.length > 6000) h.pts.splice(0, h.pts.length - 6000);
        const { vx, vy, vz, bx, by, bz, ex, ey, q, m } = info;
        const B = Math.hypot(bx, by, bz);
        const speed = Math.hypot(vx, vy, vz);
        let vpar = 0, vperp = speed;
        if (B > 0) {
          vpar = (vx * bx + vy * by + vz * bz) / B;
          vperp = Math.sqrt(Math.max(0, speed * speed - vpar * vpar));
        }
        const omega = B > 0 && q !== 0 ? (Math.abs(q) * B) / m : 0;
        const planar = B > 0 && Math.abs(bz) > 0.98 * B && Math.abs(vz) < 1e-6 * (speed + 1);
        let drift: [number, number] | null = null;
        let center: [number, number] | null = null;
        let rPred = omega > 0 ? (m * vperp) / (Math.abs(q) * B) : Infinity;
        if (planar && q !== 0) {
          drift = [ey / bz, -ex / bz];
          const wx = vx - drift[0], wy = vy - drift[1];
          rPred = (m * Math.hypot(wx, wy)) / (Math.abs(q) * B);
          const k = m / (q * bz);
          center = [info.x + k * wy, info.y - k * wx];
          if (Math.hypot(drift[0], drift[1]) < 1e-9) drift = null;
        }
        const T = omega > 0 ? (2 * Math.PI) / omega : Infinity;
        // measured radius: last full period of history, with mean drift removed
        let rMeas: number | null = null;
        if (planar && isFinite(T) && h.pts.length > 20) {
          const tEnd = h.pts[h.pts.length - 1].t;
          const seg = h.pts.filter((p) => p.t >= tEnd - T);
          const covered = seg.length > 1 ? seg[seg.length - 1].t - seg[0].t : 0;
          if (covered > 0.97 * T && seg.length > 24) {
            const a = seg[0], b = seg[seg.length - 1];
            const dvx = (b.x - a.x) / covered, dvy = (b.y - a.y) / covered;
            let cx = 0, cy = 0;
            const pts = seg.map((p) => [p.x - dvx * (p.t - a.t), p.y - dvy * (p.t - a.t)]);
            for (const p of pts) {
              cx += p[0];
              cy += p[1];
            }
            cx /= pts.length;
            cy /= pts.length;
            let rs = 0;
            for (const p of pts) rs += Math.hypot(p[0] - cx, p[1] - cy);
            rMeas = rs / pts.length;
          }
        }
        probeRef.current = {
          info,
          speed,
          vperp,
          vpar,
          B,
          E: Math.hypot(ex, ey),
          ke: 0.5 * m * speed * speed,
          omega,
          T,
          rPred,
          rMeas,
          center,
          drift,
          planar,
        };
        const now = performance.now();
        if (now - lastProbePush > 100) {
          lastProbePush = now;
          cb.current.onProbeInfo(probeRef.current);
        }
      }

      // ------------------------------------------------------------ sizing
      const resize = () => {
        const r = wrap.getBoundingClientRect();
        const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
        sizeRef.current = [w, h];
        const fit = fitView(w, h, roiRef.current, insetRef.current);
        fitRef.current = fit;
        renderer.resize(w, h, fit);
        applyView();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        ov.width = Math.round(w * dpr);
        ov.height = Math.round(h * dpr);
        ov.style.width = `${w}px`;
        ov.style.height = `${h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      resizeRef.current = resize;
      let wasZoomed = false;
      function applyView() {
        const f = fitRef.current, z = zoomRef.current;
        z.s = Math.min(10, Math.max(0.6, z.s));
        const hw = (f.x1 - f.x0) / 2 / z.s, hh = (f.y1 - f.y0) / 2 / z.s;
        const fcx = (f.x0 + f.x1) / 2, fcy = (f.y0 + f.y1) / 2;
        // zoom/pan offsets are relative to the framed view; keep the camera over the sim box
        const B = SIM_BOUNDS;
        const cx = Math.min(B.x1 + 200, Math.max(B.x0 - 200, fcx + z.cx));
        const cy = Math.min(B.y1 + 200, Math.max(B.y0 - 200, fcy + z.cy));
        z.cx = cx - fcx;
        z.cy = cy - fcy;
        const v = { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
        viewRef.current = v;
        renderer.setView(v);
        renderer.deferTrailReset();
        const zoomed = Math.abs(z.s - 1) > 0.001 || Math.abs(z.cx) > 0.5 || Math.abs(z.cy) > 0.5;
        if (zoomed !== wasZoomed) {
          wasZoomed = zoomed;
          cb.current.onZoom(zoomed);
        }
      }
      applyViewRef.current = applyView;
      const ro = new ResizeObserver(resize);
      ro.observe(wrap);
      resize();
      if (pendingLoad.current) {
        post({ type: 'load', ...pendingLoad.current, bounds: SIM_BOUNDS });
        pendingLoad.current = null;
      }
      // sources may have been synced before the renderer existed
      const L0 = live.current;
      (ref as MutableRefObject<SimHandle | null>)?.current?.syncSources(L0.objects, L0.params);
      post({ type: 'objects', objects: L0.objects });
      post({ type: 'params', params: L0.params });

      // ------------------------------------------------------------ helpers
      const toScreen = (x: number, y: number): [number, number] => {
        const v = viewRef.current, [w, h] = sizeRef.current;
        return [((x - v.x0) / (v.x1 - v.x0)) * w, ((v.y1 - y) / (v.y1 - v.y0)) * h];
      };
      const toWorld = (sx: number, sy: number): [number, number] => {
        const v = viewRef.current, [w, h] = sizeRef.current;
        return [v.x0 + (sx / w) * (v.x1 - v.x0), v.y1 - (sy / h) * (v.y1 - v.y0)];
      };
      const wpp = () => (viewRef.current.x1 - viewRef.current.x0) / sizeRef.current[0];

      // ------------------------------------------------------------ overlay
      const drawOverlay = () => {
        const [w, h] = sizeRef.current;
        const L = live.current;
        ctx.clearRect(0, 0, w, h);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const font = (px: number, weight = 500) => `${weight} ${px}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
        const mono = (px: number) => `${px}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        const label = (text: string, x: number, y: number, color = 'rgba(226,232,240,0.85)', align: CanvasTextAlign = 'left', size = 11) => {
          ctx.font = mono(size);
          {
            const tw0 = ctx.measureText(text).width;
            if (align === 'center') x = Math.min(w - tw0 / 2 - 6, Math.max(tw0 / 2 + 6, x));
            else if (align === 'left') x = Math.min(w - tw0 - 6, Math.max(6, x));
          }
          ctx.textAlign = align;
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(2,6,23,0.65)';
          const tw = ctx.measureText(text).width;
          const bx = align === 'left' ? x - 3 : align === 'right' ? x - tw - 3 : x - tw / 2 - 3;
          ctx.fillRect(bx, y - size * 0.7, tw + 6, size * 1.4);
          ctx.fillStyle = color;
          ctx.fillText(text, x, y);
        };

        // vector arrows
        if (L.toggles.vectors) {
          const ev = evalRef.current;
          const f = new Float64Array(5);
          const step = w < 500 ? 34 : 42;
          const samples: [number, number, number, number, number, boolean][] = [];
          let maxE = 0;
          for (let sy = step / 2; sy < h; sy += step)
            for (let sx = step / 2; sx < w; sx += step) {
              const [x, y] = toWorld(sx, sy);
              ev.fieldAt(x, y, f);
              let ux = f[0], uy = f[1], isB = false;
              let mag = Math.hypot(ux, uy);
              if (mag === 0) {
                ux = f[2];
                uy = f[3];
                mag = Math.hypot(ux, uy);
                isB = true;
              }
              if (mag === 0) continue;
              if (!isB) maxE = Math.max(maxE, mag);
              samples.push([sx, sy, ux / mag, uy / mag, mag, isB]);
            }
          for (const [sx, sy, ux, uy, mag, isB] of samples) {
            const rel = isB ? 0.6 : Math.log10(1 + (9 * mag) / Math.max(maxE, 1e-12));
            const len = 6 + rel * (step * 0.42);
            const ex = sx + ux * len * 0.5, ey = sy - uy * len * 0.5;
            const bx = sx - ux * len * 0.5, by = sy + uy * len * 0.5;
            ctx.strokeStyle = isB ? 'rgba(196,148,255,0.75)' : `rgba(186,230,253,${0.35 + 0.5 * rel})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(ex, ey);
            const a = Math.atan2(-uy, ux);
            ctx.lineTo(ex - 4 * Math.cos(a - 0.5), ey - 4 * Math.sin(a - 0.5));
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - 4 * Math.cos(a + 0.5), ey - 4 * Math.sin(a + 0.5));
            ctx.stroke();
          }
        }

        const stats = statsRef.current;
        if (L.params.boundary === 'reflect') {
          const [ax, ay] = toScreen(SIM_BOUNDS.x0, SIM_BOUNDS.y1);
          const [bx, by] = toScreen(SIM_BOUNDS.x1, SIM_BOUNDS.y0);
          ctx.strokeStyle = 'rgba(148,163,184,0.55)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(ax, ay, bx - ax, by - ay);
          ctx.setLineDash([]);
        }
        // gun labels avoid each other (stacked guns in the capacitor scene)
        const gunLabels: [number, number][] = [];
        for (const o of L.objects) {
          const sel = o.id === L.selectedId;
          switch (o.kind) {
            case 'charge': {
              const [sx, sy] = toScreen(o.x, o.y);
              ctx.font = font(15, 700);
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = 'rgba(255,255,255,0.95)';
              ctx.fillText(o.q >= 0 ? '+' : '−', sx, sy + 0.5);
              label(fmtQ(o.q), sx + 16, sy - 14, o.q >= 0 ? '#fdba74' : '#93c5fd');
              if (sel) {
                ctx.setLineDash([4, 3]);
                ctx.strokeStyle = '#67e8f9';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.arc(sx, sy, 18, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
              }
              break;
            }
            case 'plates':
            case 'bfield':
            case 'mirror': {
              // whole-world regions are labelled (and selectable) by an HTML chip in FieldLab
              if (o.kind === 'bfield' && o.infinite) break;
              const r = rectOf(o)!;
              const [ax, ay] = toScreen(r[0], r[3]);
              const [bx, by] = toScreen(r[2], r[1]);
              if (o.kind === 'plates') {
                const vertical = Math.abs(o.ey) >= Math.abs(o.ex);
                const posFirst = vertical ? o.ey >= 0 : o.ex >= 0;
                ctx.font = font(13, 700);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const n = Math.max(2, Math.min(9, Math.round((vertical ? bx - ax : by - ay) / 60)));
                for (let k = 0; k < n; k++) {
                  const t = (k + 0.5) / n;
                  if (vertical) {
                    const x = ax + (bx - ax) * t;
                    ctx.fillStyle = posFirst ? '#fdba74' : '#93c5fd';
                    ctx.fillText(posFirst ? '+' : '−', x, by + 9);
                    ctx.fillStyle = posFirst ? '#93c5fd' : '#fdba74';
                    ctx.fillText(posFirst ? '−' : '+', x, ay - 9);
                  } else {
                    const y = ay + (by - ay) * t;
                    ctx.fillStyle = posFirst ? '#fdba74' : '#93c5fd';
                    ctx.fillText(posFirst ? '+' : '−', ax - 9, y);
                    ctx.fillStyle = posFirst ? '#93c5fd' : '#fdba74';
                    ctx.fillText(posFirst ? '−' : '+', bx + 9, y);
                  }
                }
                const em = Math.hypot(o.ex, o.ey);
                const arrow = vertical ? (o.ey >= 0 ? '↑' : '↓') : o.ex >= 0 ? '→' : '←';
                label(`E ${arrow} ${fmtN(em)}`, ax + 4, ay + 12, '#fed7aa');
              } else if (o.kind === 'bfield') {
                const twin = L.objects.find((q) => q.kind === 'plates' && Math.abs(Math.min(q.x0, q.x1) - r[0]) < 1 && Math.abs(Math.max(q.y0, q.y1) - r[3]) < 1 && Math.abs(Math.max(q.x0, q.x1) - r[2]) < 1 && Math.abs(Math.min(q.y0, q.y1) - r[1]) < 1);
                if (twin) {
                  label(`B ${o.bz >= 0 ? '⊙' : '⊗'} ${fmtN(Math.abs(o.bz))}  (crossed E×B)`, ax + 4, Math.max(14, ay - 24), o.bz >= 0 ? '#e9d5ff' : '#99f6e4');
                } else label(`B ${o.bz >= 0 ? '⊙' : '⊗'} ${fmtN(Math.abs(o.bz))}`, ax + 4, by - 12, o.bz >= 0 ? '#e9d5ff' : '#99f6e4');
              } else {
                label(`Magnetic bottle  B₀=${fmtN(o.b0)}  Rₘ=${fmtN(o.ratio)}`, ax + 4, ay + 12, '#e9d5ff');
              }
              if (sel) {
                ctx.setLineDash([5, 4]);
                ctx.strokeStyle = '#67e8f9';
                ctx.lineWidth = 1.2;
                ctx.strokeRect(ax, ay, bx - ax, by - ay);
                ctx.setLineDash([]);
                ctx.fillStyle = '#67e8f9';
                for (const [hx, hy] of [[ax, ay], [bx, ay], [ax, by], [bx, by]]) ctx.fillRect(hx - 4, hy - 4, 8, 8);
              }
              break;
            }
            case 'gun': {
              const [sx, sy] = toScreen(o.x, o.y);
              const col = SPECIES[speciesIdx(o.species[0]?.sp ?? 'p')].color;
              ctx.save();
              ctx.translate(sx, sy);
              ctx.rotate(-o.angle);
              ctx.fillStyle = 'rgba(15,23,42,0.9)';
              ctx.strokeStyle = o.enabled ? col : 'rgba(148,163,184,0.6)';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.roundRect(-14, -7, 22, 14, 3);
              ctx.fill();
              ctx.stroke();
              ctx.fillStyle = o.enabled ? col : 'rgba(148,163,184,0.6)';
              ctx.fillRect(8, -3, 7, 6);
              if (o.width > 4) {
                const wpx = o.width / wpp();
                ctx.strokeStyle = 'rgba(103,232,249,0.25)';
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(15, -wpx / 2);
                ctx.lineTo(15, wpx / 2);
                ctx.stroke();
                ctx.setLineDash([]);
              }
              if (o.angleSpread > 0.05 && o.angleSpread < 6) {
                ctx.strokeStyle = 'rgba(103,232,249,0.25)';
                ctx.beginPath();
                ctx.moveTo(15, 0);
                ctx.arc(15, 0, 26, -o.angleSpread / 2, o.angleSpread / 2);
                ctx.closePath();
                ctx.stroke();
              }
              ctx.restore();
              const syms = o.species.map((s) => SPECIES[speciesIdx(s.sp)].symbol).join(' ');
              let ly = sy + 18;
              for (let k = 0; k < 4 && gunLabels.some(([gx, gy]) => Math.abs(gx - sx) < 90 && Math.abs(gy - ly) < 13); k++) ly += 13;
              if (!gunLabels.some(([gx, gy]) => Math.abs(gx - sx) < 90 && Math.abs(gy - ly) < 13)) {
                gunLabels.push([sx, ly]);
                label(`${syms}  ${fmtN(o.speed)} u/s`, sx, ly, col, 'center', 10);
              }
              if (sel) {
                ctx.setLineDash([4, 3]);
                ctx.strokeStyle = '#67e8f9';
                ctx.beginPath();
                ctx.arc(sx, sy, 20, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
              }
              break;
            }
            case 'detector': {
              const [ax, ay] = toScreen(o.x0, o.y0);
              const [bx, by] = toScreen(o.x1, o.y1);
              ctx.strokeStyle = o.record ? 'rgba(226,232,240,0.9)' : 'rgba(100,116,139,0.9)';
              ctx.lineWidth = o.record ? 2 : 3;
              ctx.beginPath();
              ctx.moveTo(ax, ay);
              ctx.lineTo(bx, by);
              ctx.stroke();
              if (o.record) {
                const d = stats?.detectors.find((x) => x.id === o.id);
                if (d) {
                  const keys = Object.keys(d.bins).map(Number);
                  const nb = 64;
                  let max = 1;
                  const tot = new Array(nb).fill(0);
                  for (const k of keys) d.bins[k].forEach((v, i) => (tot[i] += v));
                  for (const v of tot) max = Math.max(max, v);
                  const len = Math.hypot(bx - ax, by - ay);
                  const ux = (bx - ax) / len, uy = (by - ay) / len;
                  // bars on the left-hand normal of the screen
                  const nx = uy, ny = -ux;
                  for (let i = 0; i < nb; i++) {
                    let acc = 0;
                    for (const k of keys) {
                      const v = d.bins[k][i];
                      if (!v) continue;
                      const h0 = (Math.log1p(acc) / Math.log1p(max)) * 46;
                      acc += v;
                      const h1 = (Math.log1p(acc) / Math.log1p(max)) * 46;
                      const t = (i + 0.5) / nb;
                      const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
                      ctx.strokeStyle = SPECIES[k].color;
                      ctx.lineWidth = Math.max(1.5, (len / nb) * 0.8);
                      ctx.lineCap = 'butt';
                      ctx.beginPath();
                      ctx.moveTo(px + nx * (4 + h0), py + ny * (4 + h0));
                      ctx.lineTo(px + nx * (4 + h1), py + ny * (4 + h1));
                      ctx.stroke();
                    }
                  }
                  ctx.lineCap = 'round';
                }
                label(`${o.label ?? 'Detector'}${d ? ` · ${d.total}` : ''}`, (ax + bx) / 2, Math.max(ay, by) + 12, '#e2e8f0', 'center', 10);
              }
              if (sel) {
                ctx.fillStyle = '#67e8f9';
                ctx.fillRect(ax - 4, ay - 4, 8, 8);
                ctx.fillRect(bx - 4, by - 4, 8, 8);
              }
              break;
            }
          }
        }

        // probe overlay
        const pv = probeRef.current;
        if (pv && L.probeId > 0) {
          const { info } = pv;
          const [sx, sy] = toScreen(info.x, info.y);
          const col = SPECIES[info.sp].color;
          // history path (last ~1 period)
          const pts = histRef.current.pts;
          if (pts.length > 1) {
            const tEnd = pts[pts.length - 1].t;
            const span = isFinite(pv.T) ? pv.T * 1.05 : 6;
            ctx.strokeStyle = 'rgba(255,255,255,0.55)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            let started = false;
            for (const p of pts) {
              if (p.t < tEnd - span) continue;
              const [px, py] = toScreen(p.x, p.y);
              if (!started) {
                ctx.moveTo(px, py);
                started = true;
              } else ctx.lineTo(px, py);
            }
            ctx.stroke();
          }
          if (pv.center && isFinite(pv.rPred)) {
            const [cx, cy] = toScreen(pv.center[0], pv.center[1]);
            const rr = pv.rPred / wpp();
            if (rr > 2 && rr < 5000) {
              ctx.setLineDash([6, 5]);
              ctx.strokeStyle = 'rgba(103,232,249,0.9)';
              ctx.lineWidth = 1.3;
              ctx.beginPath();
              ctx.arc(cx, cy, rr, 0, Math.PI * 2);
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.strokeStyle = 'rgba(103,232,249,0.9)';
              ctx.beginPath();
              ctx.moveTo(cx - 5, cy);
              ctx.lineTo(cx + 5, cy);
              ctx.moveTo(cx, cy - 5);
              ctx.lineTo(cx, cy + 5);
              ctx.stroke();
              label(`r = mv⊥/qB = ${fmtN(pv.rPred)}`, cx, cy - rr - 12, '#a5f3fc', 'center', 10);
            }
          }
          // velocity arrow
          if (pv.speed > 0) {
            const k = 0.35 / wpp();
            const ex = sx + info.vx * k, ey = sy - info.vy * k;
            ctx.strokeStyle = '#fde68a';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            const a = Math.atan2(ey - sy, ex - sx);
            ctx.lineTo(ex - 6 * Math.cos(a - 0.45), ey - 6 * Math.sin(a - 0.45));
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - 6 * Math.cos(a + 0.45), ey - 6 * Math.sin(a + 0.45));
            ctx.stroke();
          }
          ctx.strokeStyle = col;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx, sy, 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(sx, sy, 14, 0, Math.PI * 2);
          ctx.stroke();
        }

        // drag previews and cursors
        const d = dragRef.current;
        if (d.kind === 'create') {
          const [ax, ay] = toScreen(d.a[0], d.a[1]);
          const [bx, by] = toScreen(d.b[0], d.b[1]);
          ctx.strokeStyle = TOOL_COLOR[d.tool] ?? '#67e8f9';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 4]);
          if (d.tool === 'plates' || d.tool === 'bfield') {
            ctx.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
            ctx.setLineDash([]);
            label(d.tool === 'plates' ? `E ${({ up: '↑', down: '↓', left: '←', right: '→' })[L.opts.plateDir]} ${fmtN(L.opts.plateE)}` : `B ${L.opts.bz >= 0 ? '⊙' : '⊗'} ${fmtN(Math.abs(L.opts.bz))}`, Math.min(ax, bx) + 4, Math.min(ay, by) + 12);
          } else if (d.tool === 'detector') {
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
          } else if (d.tool === 'gun') {
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(ax, ay, 8, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.setLineDash([]);
        }
        const hv = hoverRef.current;
        if (hv && (L.tool === 'eraser' || L.tool === 'spray')) {
          const [sx, sy] = toScreen(hv[0], hv[1]);
          const r = L.tool === 'eraser' ? L.opts.eraserRadius / wpp() : 26;
          ctx.strokeStyle = L.tool === 'eraser' ? 'rgba(248,113,113,0.8)' : 'rgba(103,232,249,0.7)';
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      };

      // ------------------------------------------------------------ loop
      let last = performance.now();
      let raf = 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
        last = now;
        const L = live.current;
        if (!L.active) return;
        fpsFrames++;
        if (now - fpsT >= 500) {
          fps = (fpsFrames * 1000) / (now - fpsT);
          fpsFrames = 0;
          fpsT = now;
        }
        // continuous tools
        const d = dragRef.current;
        if (d.kind === 'spray') {
          d.acc += L.opts.sprayRate * dt;
          const c = Math.floor(d.acc);
          if (c > 0) {
            d.acc -= c;
            post({ type: 'spray', sp: L.opts.spraySpecies, x: d.at[0], y: d.at[1], r: 22 * wpp(), count: c, speed: L.opts.spraySpeed });
          }
        }
        if (L.paused) accReal = 0;
        else accReal += dt;
        if (outstanding.current === 0) {
          const recycle = spare;
          spare = [];
          post({ type: 'advance', dt: accReal, paused: L.paused, wantStats: frameNo % 6 === 0, probeId: L.probeId, recycle }, recycle);
          frameNo++;
          accReal = 0;
        }
        // adaptive resolution: drop the pixel ratio if we can't hold ~45 fps, restore when there is headroom
        if (fps > 0) {
          if (fps < 45) slowFor += dt;
          else slowFor = 0;
          if (fps > 58) fastFor += dt;
          else fastFor = 0;
          if (slowFor > 2 && quality > 0.67) {
            quality = 0.67;
            slowFor = 0;
            renderer.setQuality(quality);
          } else if (fastFor > 6 && quality < 1) {
            quality = 1;
            fastFor = 0;
            renderer.setQuality(quality);
          }
        }
        renderer.render(dt, L.toggles);
        drawOverlay();
        if (!ready && frameRef.current) {
          ready = true;
          cb.current.onReady();
        }
      };
      raf = requestAnimationFrame(loop);

      // ------------------------------------------------------------ pointer input
      const evWorld = (e: PointerEvent): [number, number] => {
        const r = ov.getBoundingClientRect();
        return toWorld(e.clientX - r.left, e.clientY - r.top);
      };

      const pickParticle = (x: number, y: number, rPx: number): number => {
        const f = frameRef.current;
        if (!f) return 0;
        const r = rPx * wpp();
        let best = 0, bd = r * r;
        for (let i = 0; i < f.n; i++) {
          const dx = f.pos[i * 2] - x, dy = f.pos[i * 2 + 1] - y;
          const dd = dx * dx + dy * dy;
          if (dd < bd) {
            bd = dd;
            best = f.ids[i];
          }
        }
        return best;
      };

      const hitObject = (x: number, y: number): Extract<Drag, { id: string }> | null => {
        const L = live.current;
        const tol = 14 * wpp();
        // point-like objects first (topmost = last drawn)
        for (let i = L.objects.length - 1; i >= 0; i--) {
          const o = L.objects[i];
          if ((o.kind === 'charge' || o.kind === 'gun') && Math.hypot(o.x - x, o.y - y) < tol * 1.2)
            return { kind: 'move', id: o.id, start: [x, y], orig: { ...o } };
          if (o.kind === 'detector') {
            if (Math.hypot(o.x0 - x, o.y0 - y) < tol) return { kind: 'endpoint', id: o.id, end: 0 };
            if (Math.hypot(o.x1 - x, o.y1 - y) < tol) return { kind: 'endpoint', id: o.id, end: 1 };
            if (segDist(x, y, o.x0, o.y0, o.x1, o.y1) < tol * 0.6) return { kind: 'move', id: o.id, start: [x, y], orig: { ...o } };
          }
        }
        // resize handles of the selected rect
        const sel = L.objects.find((o) => o.id === L.selectedId);
        if (sel) {
          const r = rectOf(sel);
          if (r) {
            const corners = [[r[0], r[1]], [r[2], r[1]], [r[0], r[3]], [r[2], r[3]]];
            for (let c = 0; c < 4; c++)
              if (Math.hypot(corners[c][0] - x, corners[c][1] - y) < tol) return { kind: 'resize', id: sel.id, corner: c, orig: { ...sel } };
          }
        }
        return null;
      };

      /** Rect-like objects under the point, smallest first; repeated clicks cycle through overlaps. */
      const hitRect = (x: number, y: number): Drag | null => {
        const L = live.current;
        const tol = 8 * wpp();
        const hits: { o: FieldObject; a: number; i: number }[] = [];
        L.objects.forEach((o, i) => {
          const r = rectOf(o);
          if (!r) return;
          if (x >= r[0] - tol && x <= r[2] + tol && y >= r[1] - tol && y <= r[3] + tol) hits.push({ o, a: (r[2] - r[0]) * (r[3] - r[1]), i });
        });
        if (!hits.length) return null;
        hits.sort((p, q) => p.a - q.a || p.i - q.i);
        const cur = hits.findIndex((h) => h.o.id === L.selectedId);
        const pick = hits[cur >= 0 ? (cur + 1) % hits.length : 0].o;
        return { kind: 'move', id: pick.id, start: [x, y], orig: { ...pick } };
      };
      const atLimit = (kind: keyof typeof SOURCE_LIMITS): boolean => {
        const n = live.current.objects.filter((o) => o.kind === kind).length;
        if (n < SOURCE_LIMITS[kind]) return false;
        const names = { charge: 'point charges', plates: 'plate pairs', bfield: 'magnetic regions', mirror: 'magnetic bottles' };
        cb.current.onHint(`Limit reached: at most ${SOURCE_LIMITS[kind]} ${names[kind]} can be drawn. Delete one first.`);
        return true;
      };

      const updateObj = (id: string, fn: (o: FieldObject) => FieldObject) => {
        const L = live.current;
        const objs = L.objects.map((o) => (o.id === id ? fn(o) : o));
        cb.current.onObjects(objs);
      };

      const eraseAt = (x: number, y: number) => {
        const L = live.current;
        const r = L.opts.eraserRadius;
        post({ type: 'erase', x, y, r });
        const keep = L.objects.filter((o) => {
          if (o.kind === 'charge' || o.kind === 'gun') return Math.hypot(o.x - x, o.y - y) > r;
          if (o.kind === 'detector') return segDist(x, y, o.x0, o.y0, o.x1, o.y1) > r;
          const rc = rectOf(o);
          if (rc) {
            const edge = Math.min(
              segDist(x, y, rc[0], rc[1], rc[2], rc[1]),
              segDist(x, y, rc[0], rc[3], rc[2], rc[3]),
              segDist(x, y, rc[0], rc[1], rc[0], rc[3]),
              segDist(x, y, rc[2], rc[1], rc[2], rc[3]),
            );
            return edge > r * 0.6;
          }
          return true;
        });
        if (keep.length !== L.objects.length) cb.current.onObjects(keep, null);
      };

      // ---- zoom / pan (camera only)
      const touches = new Map<number, [number, number]>();
      let pinch: { d: number; mid: [number, number]; s: number; cx: number; cy: number } | null = null;
      const zoomAt = (sx: number, sy: number, factor: number) => {
        const [wx, wy] = toWorld(sx, sy);
        const z = zoomRef.current;
        const ns = Math.min(10, Math.max(0.6, z.s * factor));
        const k = z.s / ns;
        z.cx = wx + (z.cx - wx) * k;
        z.cy = wy + (z.cy - wy) * k;
        z.s = ns;
        applyView();
      };
      // the page must keep scrolling past the embed: zoom only with Ctrl/Cmd (trackpad pinch sets ctrlKey)
      // or after the user has clicked into the canvas
      let wheelArmed = false, lastHint = 0;
      const onWheel = (e: WheelEvent) => {
        if (!(e.ctrlKey || e.metaKey || wheelArmed)) {
          const now = performance.now();
          if (now - lastHint > 4000) {
            lastHint = now;
            cb.current.onHint('To zoom, hold Ctrl (⌘ on Mac) and scroll, or click the canvas first.');
          }
          return;
        }
        e.preventDefault();
        const r = ov.getBoundingClientRect();
        zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey && !wheelArmed ? 0.01 : 0.0015)));
      };
      const startPinch = () => {
        const pts = [...touches.values()];
        const d = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
        const z = zoomRef.current;
        pinch = { d, mid: [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2], s: z.s, cx: z.cx, cy: z.cy };
      };
      const movePinch = () => {
        if (!pinch) return;
        const pts = [...touches.values()];
        const d = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
        const mid: [number, number] = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
        const z = zoomRef.current;
        z.s = pinch.s;
        z.cx = pinch.cx;
        z.cy = pinch.cy;
        applyView();
        const [w0x, w0y] = toWorld(pinch.mid[0], pinch.mid[1]);
        z.s = Math.min(10, Math.max(0.6, pinch.s * (d / Math.max(pinch.d, 1))));
        applyView();
        const [w1x, w1y] = toWorld(mid[0], mid[1]);
        z.cx += w0x - w1x;
        z.cy += w0y - w1y;
        applyView();
      };

      const onDown = (e: PointerEvent) => {
        if (e.pointerType === 'mouse') wheelArmed = true;
        if (e.pointerType === 'touch') {
          // first touch on the canvas turns off page scrolling over it (touch-action) until the user taps elsewhere
          setTouchActive(true);
          const r = ov.getBoundingClientRect();
          touches.set(e.pointerId, [e.clientX - r.left, e.clientY - r.top]);
          if (touches.size === 2) {
            // second finger: abandon the tool gesture and pinch/pan instead
            dragRef.current = { kind: 'none' };
            startPinch();
            return;
          }
          if (touches.size > 2) return;
        }
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        ov.setPointerCapture(e.pointerId);
        const [x, y] = evWorld(e);
        hoverRef.current = [x, y];
        const L = live.current;
        switch (L.tool) {
          case 'select': {
            const h = hitObject(x, y);
            if (h) {
              dragRef.current = h;
              cb.current.onSelect(h.id);
              return;
            }
            const pid = pickParticle(x, y, 14);
            if (pid) {
              cb.current.onProbe(pid);
              return;
            }
            const hr = hitRect(x, y);
            if (hr && hr.kind === 'move') {
              dragRef.current = hr;
              cb.current.onSelect(hr.id);
              return;
            }
            cb.current.onSelect(null);
            return;
          }
          case 'probe': {
            cb.current.onProbe(pickParticle(x, y, 22));
            return;
          }
          case 'charge': {
            if (atLimit('charge')) return;
            const o: FieldObject = { kind: 'charge', id: newId('q'), x, y, q: L.opts.chargeQ };
            cb.current.onObjects([...L.objects, o], o.id);
            return;
          }
          case 'plates':
          case 'bfield':
          case 'detector':
          case 'gun':
            dragRef.current = { kind: 'create', tool: L.tool, a: [x, y], b: [x, y] };
            return;
          case 'spray':
            dragRef.current = { kind: 'spray', at: [x, y], acc: 8 };
            return;
          case 'eraser':
            dragRef.current = { kind: 'erase', at: [x, y] };
            eraseAt(x, y);
            return;
        }
      };

      const onMove = (e: PointerEvent) => {
        if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
          const r = ov.getBoundingClientRect();
          touches.set(e.pointerId, [e.clientX - r.left, e.clientY - r.top]);
          if (pinch) {
            movePinch();
            return;
          }
        }
        const [x, y] = evWorld(e);
        hoverRef.current = [x, y];
        const d = dragRef.current;
        switch (d.kind) {
          case 'move': {
            const dx = x - d.start[0], dy = y - d.start[1];
            const o = d.orig;
            updateObj(d.id, () => {
              switch (o.kind) {
                case 'charge':
                case 'gun':
                  return { ...o, x: o.x + dx, y: o.y + dy };
                case 'mirror':
                  return { ...o, x: o.x + dx, y: o.y + dy };
                case 'plates':
                case 'bfield':
                case 'detector':
                  return { ...o, x0: o.x0 + dx, y0: o.y0 + dy, x1: o.x1 + dx, y1: o.y1 + dy };
              }
            });
            break;
          }
          case 'resize': {
            const o = d.orig;
            updateObj(d.id, () => {
              const r = rectOf(o)!;
              const nr = [...r];
              if (d.corner === 0 || d.corner === 2) nr[0] = x;
              else nr[2] = x;
              if (d.corner === 0 || d.corner === 1) nr[1] = y;
              else nr[3] = y;
              const x0 = Math.min(nr[0], nr[2]), x1 = Math.max(nr[0], nr[2]);
              const y0 = Math.min(nr[1], nr[3]), y1 = Math.max(nr[1], nr[3]);
              if (o.kind === 'mirror') return { ...o, x: (x0 + x1) / 2, y: (y0 + y1) / 2, L: Math.max(20, (x1 - x0) / 2), H: Math.max(20, (y1 - y0) / 2) };
              return { ...(o as Extract<FieldObject, { x0: number }>), x0, y0, x1, y1 };
            });
            break;
          }
          case 'endpoint':
            updateObj(d.id, (o) => (o.kind === 'detector' ? (d.end === 0 ? { ...o, x0: x, y0: y } : { ...o, x1: x, y1: y }) : o));
            break;
          case 'create':
            d.b = [x, y];
            break;
          case 'spray':
            d.at = [x, y];
            break;
          case 'erase':
            d.at = [x, y];
            eraseAt(x, y);
            break;
        }
      };

      const onUp = (e: PointerEvent) => {
        if (ov.hasPointerCapture(e.pointerId)) ov.releasePointerCapture(e.pointerId);
        if (e.pointerType === 'touch') {
          touches.delete(e.pointerId);
          if (pinch) {
            if (touches.size < 2) pinch = null;
            dragRef.current = { kind: 'none' };
            return;
          }
        }
        const d = dragRef.current;
        dragRef.current = { kind: 'none' };
        if (d.kind !== 'create') return;
        const L = live.current;
        const [ax, ay] = d.a, [bx, by] = d.b;
        const size = Math.hypot(bx - ax, by - ay);
        const minSize = 12 * wpp();
        let o: FieldObject | null = null;
        if ((d.tool === 'plates' && atLimit('plates')) || (d.tool === 'bfield' && atLimit('bfield'))) return;
        if (d.tool === 'plates' && Math.abs(bx - ax) > minSize && Math.abs(by - ay) > minSize) {
          const [ux, uy] = dirVec(L.opts.plateDir);
          o = { kind: 'plates', id: newId('pl'), x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by), ex: ux * L.opts.plateE, ey: uy * L.opts.plateE, absorb: true };
        } else if (d.tool === 'bfield' && Math.abs(bx - ax) > minSize && Math.abs(by - ay) > minSize) {
          o = { kind: 'bfield', id: newId('b'), x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by), bz: L.opts.bz };
        } else if (d.tool === 'detector' && size > minSize) {
          o = { kind: 'detector', id: newId('det'), x0: ax, y0: ay, x1: bx, y1: by, record: true, label: 'Detector' };
        } else if (d.tool === 'gun') {
          const angle = size > minSize ? Math.atan2(by - ay, bx - ax) : 0;
          o = {
            kind: 'gun',
            id: newId('gun'),
            x: ax,
            y: ay,
            angle,
            speed: L.opts.gunSpeed,
            speedSpread: 0,
            angleSpread: L.opts.gunSpread,
            width: 0,
            rate: L.opts.gunRate,
            species: [{ sp: L.opts.gunSpecies, w: 1 }],
            enabled: true,
          };
        }
        if (o) cb.current.onObjects([...L.objects, o], o.id);
      };
      const onLeave = (e: PointerEvent) => {
        hoverRef.current = null;
        if (e.pointerType === 'mouse') wheelArmed = false;
      };
      const onDocDown = (e: PointerEvent) => {
        if (e.pointerType === 'touch' && !wrap.contains(e.target as Node)) setTouchActive(false);
      };
      document.addEventListener('pointerdown', onDocDown);

      ov.addEventListener('wheel', onWheel, { passive: false });
      ov.addEventListener('pointerdown', onDown);
      ov.addEventListener('pointermove', onMove);
      ov.addEventListener('pointerup', onUp);
      ov.addEventListener('pointercancel', onUp);
      ov.addEventListener('pointerleave', onLeave);

      return () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        ov.removeEventListener('wheel', onWheel);
        ov.removeEventListener('pointerdown', onDown);
        ov.removeEventListener('pointermove', onMove);
        ov.removeEventListener('pointerup', onUp);
        ov.removeEventListener('pointercancel', onUp);
        ov.removeEventListener('pointerleave', onLeave);
        document.removeEventListener('pointerdown', onDocDown);
        worker.terminate();
        workerRef.current = null;
        renderer.dispose();
        rendererRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toolCursor = (): string => {
      const t = live.current.tool;
      return t === 'select' ? 'default' : t === 'eraser' || t === 'spray' ? 'none' : 'crosshair';
    };

    // touch: let the page scroll vertically over the canvas until the user taps into it or picks a drawing tool
    const touchAction = touchActive || DRAW_TOOLS.includes(live.current.tool) ? 'none' : 'pan-y';
    return (
      <div ref={wrapRef} className="absolute inset-0 overflow-hidden bg-[#03040a]">
        <canvas ref={glRef} className="absolute inset-0 h-full w-full" aria-hidden />
        <canvas
          ref={ovRef}
          className="absolute inset-0 h-full w-full select-none"
          style={{ cursor: toolCursor(), touchAction }}
          data-testid="field-canvas"
          role="img"
          aria-label={ariaLabel}
          data-touch={touchAction}
        />
      </div>
    );
  },
);
