import { useEffect, useRef } from 'react';
import { mulberry32 } from '../physics/engine';

// Two Gaussian slits at x = +-D/2 evolving freely (units: sigma0 = 1, hbar/m = 1, tau = t / t_s).
//   psi_j(x,tau) = (1 + i tau)^(-1/2) exp(-(x - x_j)^2 / (4 (1 + i tau)))
// de Broglie-Bohm guidance: dx/dtau = 2 Im(psi'/psi). Same |psi|^2 statistics as standard QM.

const D = 12;
const XR = 42;
const TAU_MAX = 12;

type C = [number, number];

function psi(x: number, tau: number): { v: C; d: C } {
  // 1/(1+i tau) = (1 - i tau)/(1+tau^2)
  const den = 1 + tau * tau;
  const ir = 1 / den, ii = -tau / den;
  // (1+i tau)^(-1/2)
  const mag = Math.pow(den, -0.25), ph = -0.5 * Math.atan(tau);
  const pr = mag * Math.cos(ph), pi = mag * Math.sin(ph);
  let vr = 0, vi = 0, dr = 0, di = 0;
  for (const xj of [-D / 2, D / 2]) {
    const u = x - xj;
    // exponent = -(u^2/4) * (ir + i ii)
    const er = -(u * u * 0.25) * ir, ei = -(u * u * 0.25) * ii;
    const em = Math.exp(er);
    const cr = em * Math.cos(ei), ci = em * Math.sin(ei);
    const gr = pr * cr - pi * ci, gi = pr * ci + pi * cr;
    vr += gr;
    vi += gi;
    // derivative factor: -(u/2) * (ir + i ii)
    const fr = -(u / 2) * ir, fi = -(u / 2) * ii;
    dr += gr * fr - gi * fi;
    di += gr * fi + gi * fr;
  }
  return { v: [vr, vi], d: [dr, di] };
}

function velocity(x: number, tau: number): number {
  const { v, d } = psi(x, tau);
  const den = v[0] * v[0] + v[1] * v[1] + 1e-300;
  // Im(d / v) = (d_i v_r - d_r v_i)/|v|^2
  return 2 * ((d[1] * v[0] - d[0] * v[1]) / den);
}

function trajectories(count: number): Float32Array[] {
  // initial positions: quantiles of |psi(x,0)|^2 (deterministic, equal weight)
  const G = 4000;
  const cdf = new Float64Array(G + 1);
  for (let i = 1; i <= G; i++) {
    const x = -XR + (2 * XR * i) / G;
    const p = psi(x, 0).v;
    cdf[i] = cdf[i - 1] + p[0] * p[0] + p[1] * p[1];
  }
  const out: Float32Array[] = [];
  const steps = 700;
  const h = TAU_MAX / steps;
  for (let k = 0; k < count; k++) {
    const u = ((k + 0.5) / count) * cdf[G];
    let lo = 0, hi = G;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < u) lo = mid;
      else hi = mid;
    }
    let x = -XR + (2 * XR * lo) / G;
    const path = new Float32Array(steps + 1);
    path[0] = x;
    let t = 0;
    for (let s = 1; s <= steps; s++) {
      const k1 = velocity(x, t);
      const k2 = velocity(x + 0.5 * h * k1, t + 0.5 * h);
      const k3 = velocity(x + 0.5 * h * k2, t + 0.5 * h);
      const k4 = velocity(x + h * k3, t + h);
      x += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      t += h;
      path[s] = x;
    }
    out.push(path);
  }
  return out;
}

function heat(v: number): [number, number, number] {
  // dark -> violet -> magenta -> amber -> white
  const stops: [number, number, number, number][] = [
    [0, 3, 4, 10],
    [0.25, 46, 16, 101],
    [0.5, 160, 32, 140],
    [0.75, 245, 120, 60],
    [1, 255, 240, 200],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i];
      const t = (v - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
    }
  }
  return [255, 240, 200];
}

export function DoubleSlitView({ showTrajectories, playing }: { showTrajectories: boolean; playing: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ showTrajectories, playing });
  live.current = { showTrajectories, playing };

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    const paths = trajectories(90);
    const rng = mulberry32(11);
    // final-screen density for sampling detector hits
    const G = 600;
    const scr = new Float64Array(G);
    let tot = 0;
    for (let i = 0; i < G; i++) {
      const p = psi(-XR + ((i + 0.5) / G) * 2 * XR, TAU_MAX).v;
      scr[i] = p[0] * p[0] + p[1] * p[1];
      tot += scr[i];
    }
    const hits: number[] = [];
    let heatImg: ImageBitmap | HTMLCanvasElement | null = null;
    let heatKey = '';
    let prog = 0;
    let raf = 0;
    let last = performance.now();
    let hitAcc = 0;

    const buildHeat = (w: number, h: number) => {
      const W = Math.max(64, Math.floor(w / 2)), H = Math.max(64, Math.floor(h / 2));
      const off = document.createElement('canvas');
      off.width = W;
      off.height = H;
      const octx = off.getContext('2d')!;
      const img = octx.createImageData(W, H);
      for (let j = 0; j < H; j++) {
        const tau = (j / (H - 1)) * TAU_MAX;
        const row = new Float64Array(W);
        let mx = 0;
        for (let i = 0; i < W; i++) {
          const p = psi(-XR + ((i + 0.5) / W) * 2 * XR, tau).v;
          row[i] = p[0] * p[0] + p[1] * p[1];
          mx = Math.max(mx, row[i]);
        }
        for (let i = 0; i < W; i++) {
          const [r, g, b] = heat(Math.pow(row[i] / mx, 0.6) * 0.92);
          const o = (j * W + i) * 4;
          img.data[o] = r;
          img.data[o + 1] = g;
          img.data[o + 2] = b;
          img.data[o + 3] = 255;
        }
      }
      octx.putImageData(img, 0, 0);
      return off;
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { showTrajectories: st, playing: pl } = live.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const top = 34, screenH = 46, bottom = h - screenH - 26;
      const left = 12, right = w - 12;
      const key = `${Math.round(right - left)}x${Math.round(bottom - top)}`;
      if (key !== heatKey) {
        heatImg = buildHeat(right - left, bottom - top);
        heatKey = key;
      }
      if (pl) {
        prog = Math.min(1, prog + dt * 0.12);
        hitAcc += dt * 40;
        while (hitAcc >= 1 && hits.length < 6000) {
          hitAcc--;
          let u = rng() * tot, i = 0;
          while (i < G - 1 && u > scr[i]) u -= scr[i++];
          hits.push(i + rng());
        }
        if (prog >= 1 && hits.length >= 6000) {
          prog = 0;
          hits.length = 0;
        }
      }
      ctx.fillStyle = '#03040a';
      ctx.fillRect(0, 0, w, h);
      const sx = (x: number) => left + ((x + XR) / (2 * XR)) * (right - left);
      const sy = (t: number) => top + (t / TAU_MAX) * (bottom - top);
      if (heatImg) {
        ctx.globalAlpha = 0.85;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(heatImg, left, top, right - left, bottom - top);
        ctx.globalAlpha = 1;
      }
      // slit barrier
      ctx.fillStyle = '#cbd5e1';
      const slitHalf = 1.6;
      ctx.fillRect(left, top - 4, sx(-D / 2 - slitHalf) - left, 4);
      ctx.fillRect(sx(-D / 2 + slitHalf), top - 4, sx(D / 2 - slitHalf) - sx(-D / 2 + slitHalf), 4);
      ctx.fillRect(sx(D / 2 + slitHalf), top - 4, right - sx(D / 2 + slitHalf), 4);
      // trajectories
      if (st) {
        const steps = paths[0].length - 1;
        const upto = Math.max(1, Math.floor(prog * steps));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(165,243,252,0.55)';
        ctx.lineWidth = 1;
        for (const p of paths) {
          ctx.beginPath();
          for (let s = 0; s <= upto; s += 2) {
            const X = sx(p[s]), Y = sy((s / steps) * TAU_MAX);
            if (s === 0) ctx.moveTo(X, Y);
            else ctx.lineTo(X, Y);
          }
          ctx.stroke();
        }
        ctx.fillStyle = '#ecfeff';
        ctx.shadowColor = '#67e8f9';
        ctx.shadowBlur = 8;
        for (const p of paths) {
          ctx.beginPath();
          ctx.arc(sx(p[upto]), sy((upto / steps) * TAU_MAX), 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      // detector screen with accumulating single hits
      const sTop = bottom + 10;
      ctx.fillStyle = 'rgba(15,23,42,0.9)';
      ctx.fillRect(left, sTop, right - left, screenH);
      ctx.fillStyle = 'rgba(253,224,71,0.85)';
      const hr = mulberry32(5);
      for (const hx of hits) {
        const X = left + (hx / G) * (right - left);
        ctx.fillRect(X, sTop + 3 + hr() * (screenH - 6), 1.2, 1.2);
      }
      // theory curve on screen
      let mx = 0;
      for (let i = 0; i < G; i++) mx = Math.max(mx, scr[i]);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < G; i++) {
        const X = left + ((i + 0.5) / G) * (right - left), Y = sTop + screenH - (scr[i] / mx) * (screenH - 4);
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      ctx.stroke();
      ctx.font = '10.5px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(203,213,225,0.85)';
      ctx.textAlign = 'left';
      ctx.fillText('two slits', left, 14);
      ctx.fillText(w < 520 ? `screen · ${hits.length} hits` : `screen · ${hits.length} single-particle hits · white = |ψ|²`, left, h - 8);
      ctx.textAlign = 'right';
      const longLbl = st ? 'Bohmian trajectories over |ψ|² (each row normalised)' : '|ψ|² (each row normalised)';
      ctx.fillText(w < 520 ? (st ? 'Bohm paths · |ψ|²' : '|ψ|²') : longLbl, right, 14);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="h-full w-full" data-testid="slit-canvas" />;
}
