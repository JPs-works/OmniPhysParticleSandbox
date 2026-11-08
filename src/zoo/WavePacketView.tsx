import { useEffect, useRef } from 'react';
import { HBARC, fmtLength, fmtTime, type CatalogParticle } from './catalog';

// Exact free-particle Gaussian wave packet in the frame moving with the group velocity.
//   psi(s, tau) = (1 + i tau)^(-1/2) exp(-s^2 / (4 (1 + i tau))) exp(i (kappa s + kappa^2 tau))
// s = (x - v t) / sigma0, tau = t / t_s with t_s = 2 m sigma0^2 / hbar, kappa = p sigma0 / hbar.

export const SIGMA0_FM = 1e6; // 1 nm initial width

export interface PacketInfo {
  ts: number; // spreading time (s)
  kappa: number;
  lambdaFm: number;
  massless: boolean;
}

export function packetInfo(p: CatalogParticle, beta: number): PacketInfo {
  const massless = p.mass === 0;
  if (massless) {
    // photon-like: p = E/c; pick a visible-light-ish carrier, 500 nm
    return { ts: Infinity, kappa: (2 * Math.PI * SIGMA0_FM) / 5e8, lambdaFm: 5e8, massless };
  }
  const b = Math.min(beta, 0.999);
  const gamma = 1 / Math.sqrt(1 - b * b);
  const pc = gamma * p.mass * b; // MeV
  const lambdaFm = pc > 0 ? (2 * Math.PI * HBARC) / pc : Infinity;
  const kappa = pc > 0 ? (pc * SIGMA0_FM) / HBARC : 0;
  // Longitudinal spreading uses the curvature of E(p): d^2E/dp^2 = 1/(gamma^3 m), so the effective mass is
  // gamma^3 m and t_s = 2 gamma^3 m sigma^2 / hbar (quadratic expansion of the relativistic dispersion).
  const ts = (2 * gamma ** 3 * p.mass * SIGMA0_FM * SIGMA0_FM) / (HBARC * 2.99792458e23);
  return { ts, kappa, lambdaFm, massless };
}

export function WavePacketView({ particle, beta, playing }: { particle: CatalogParticle; beta: number; playing: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const tauRef = useRef(0);
  const live = useRef({ particle, beta, playing });
  live.current = { particle, beta, playing };

  useEffect(() => {
    tauRef.current = 0;
  }, [particle.id]);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { particle: p, beta: b, playing: pl } = live.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const info = packetInfo(p, b);
      if (pl) tauRef.current += dt * 0.6;
      if (tauRef.current > 7) tauRef.current = 0;
      const tau = info.massless ? 0 : tauRef.current;
      const visKappa = Math.min(info.kappa, 6);
      const scaled = info.kappa > 6;
      const midY = h * 0.58;
      const amp = h * 0.34;
      const sRange = 14;
      const N = Math.max(200, Math.floor(w));
      const sx = (s: number) => w / 2 + (s / sRange) * (w / 2) * 0.95;

      // axes
      ctx.strokeStyle = 'rgba(148,163,184,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      for (let s = -12; s <= 12; s += 4) {
        ctx.moveTo(sx(s), midY - 4);
        ctx.lineTo(sx(s), midY + 4);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(148,163,184,0.6)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      for (let s = -12; s <= 12; s += 4) ctx.fillText(`${s} nm`, sx(s), midY + 16);

      const re = new Float32Array(N), im = new Float32Array(N), dens = new Float32Array(N);
      // photon: classical pulse with no dispersion in vacuum
      for (let i = 0; i < N; i++) {
        const s = -sRange + (2 * sRange * i) / (N - 1);
        // (1 + i tau)^(-1/2) and exp(-s^2/(4(1+i tau)))
        const den = 1 + tau * tau;
        const ar = -(s * s) / (4 * den);
        const ai = (s * s * tau) / (4 * den);
        const mag = Math.exp(ar) / Math.pow(den, 0.25);
        const phPre = -0.5 * Math.atan(tau);
        // omega t = kappa^2 tau in these units (applied to the carrier as drawn)
        const phase = ai + phPre + visKappa * s + visKappa * visKappa * tau;
        re[i] = mag * Math.cos(phase);
        im[i] = mag * Math.sin(phase);
        dens[i] = mag * mag;
      }
      // |psi|^2 glow
      const grad = ctx.createLinearGradient(0, midY - amp, 0, midY);
      grad.addColorStop(0, 'rgba(253,224,71,0.55)');
      grad.addColorStop(1, 'rgba(251,146,60,0.04)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      for (let i = 0; i < N; i++) ctx.lineTo((i / (N - 1)) * w, midY - dens[i] * amp);
      ctx.lineTo(w, midY);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const line = (arr: Float32Array, color: string, width: number, blur: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const x = (i / (N - 1)) * w, y = midY - arr[i] * amp;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      line(dens, 'rgba(253,224,71,0.95)', 1.6, 10);
      line(re, 'rgba(56,189,248,0.85)', 1.3, 8);
      line(im, 'rgba(167,139,250,0.7)', 1.1, 6);
      ctx.restore();

      // legend & readouts
      ctx.textAlign = 'left';
      ctx.font = '11px ui-monospace, monospace';
      const rows: [string, string][] = [
        ['#fde047', '|ψ|²  probability density'],
        ['#38bdf8', 'Re ψ'],
        ['#a78bfa', 'Im ψ'],
      ];
      rows.forEach(([c, t], i) => {
        ctx.fillStyle = c;
        ctx.fillRect(14, 16 + i * 16, 10, 2);
        ctx.fillStyle = 'rgba(226,232,240,0.85)';
        ctx.fillText(t, 30, 20 + i * 16);
      });
      const right: string[] = [];
      if (info.massless) {
        right.push('massless: no Schrödinger spreading in vacuum');
        right.push('classical light pulse (λ = 500 nm, not to scale): moving at c,');
        right.push('so in this frame it neither spreads nor drifts');
      } else {
        const sigma = Math.sqrt(1 + tau * tau);
        right.push(`t = ${fmtTime(tau * info.ts)}   σ(t) = ${sigma.toFixed(2)} nm`);
        right.push(`spreading time t_s = 2γ³mσ₀²/ħ = ${fmtTime(info.ts)}`);
        right.push(b > 0 ? `λ = h/p = ${fmtLength(info.lambdaFm)}${scaled ? '  (carrier drawn not to scale)' : ''}` : 'p = 0: no carrier wave');
      }
      // narrow screens: stack the readouts under the legend instead of right-aligning them over it
      const stack = w < 640;
      ctx.textAlign = stack ? 'left' : 'right';
      ctx.font = stack ? '10px ui-monospace, monospace' : '11px ui-monospace, monospace';
      right.forEach((t, i) => {
        ctx.fillStyle = 'rgba(203,213,225,0.9)';
        ctx.fillText(t, stack ? 14 : w - 14, stack ? 76 + i * 14 : 20 + i * 16);
      });
      ctx.textAlign = 'center';
      ctx.font = '10.5px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(148,163,184,0.75)';
      ctx.fillText('frame moving with the group velocity · σ₀ = 1 nm', w / 2, h - 12);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="h-full w-full" data-testid="wave-canvas" />;
}
