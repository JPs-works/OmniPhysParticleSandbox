// Hydrogen-like orbitals |psi_nlm|^2 (real spherical-harmonic form), in units of the Bohr radius a.

import { mulberry32 } from '../physics/engine';
import { ME, MP, type CatalogParticle } from './catalog';

export const A0_PM = 52.9177210903;
export const RY_EV = 13.605693122994;

export interface AtomModel {
  name: string;
  /** reduced mass in electron masses */
  muRel: number;
  aPm: number;
  /** ground-state binding energy (eV) */
  e1: number;
  note: string;
  applicable: boolean;
}

export function atomFor(p: CatalogParticle): AtomModel {
  const red = (m1: number, m2: number) => (m1 * m2) / (m1 + m2) / ME;
  const mk = (name: string, mu: number, note: string, Z = 1): AtomModel => ({
    name,
    muRel: mu,
    aPm: A0_PM / mu / Z,
    e1: RY_EV * mu * Z * Z,
    note,
    applicable: true,
  });
  if (p.confined) return { ...mk('Hydrogen (reference)', red(ME, MP), ''), applicable: false, note: 'Quarks and gluons are confined and cannot form an atom. Ordinary hydrogen is shown for reference.' };
  if (!Number.isFinite(p.mass) || p.mass === 0) return { ...mk('Hydrogen (reference)', red(ME, MP), ''), applicable: false, note: 'A massless or tachyonic particle cannot be bound in a Coulomb orbit. Ordinary hydrogen is shown for reference.' };
  if (p.lifetime !== null && p.lifetime < 1e-15)
    return { ...mk('Hydrogen (reference)', red(ME, MP), ''), applicable: false, note: `The ${p.name} decays far too quickly to orbit anything. Ordinary hydrogen is shown for reference.` };
  if (p.id === 'anti-muon')
    return mk('Muonium (μ⁺e⁻)', red(ME, 105.6583755), 'An electron bound to an antimuon, which acts as a light “proton”. Its reduced mass is 0.9952 mₑ, so it is almost the size of hydrogen. Muonium lives about 2.2 μs, the muon lifetime.');
  if (p.id === 'positron') return mk('Positronium (e⁺e⁻)', red(ME, ME), 'The electron and positron orbit their common centre. The reduced mass is mₑ/2, so the atom is twice the size of hydrogen. Positronium annihilates in 0.1–140 ns.');
  if (p.charge === -1) {
    const nm = p.id === 'electron' ? 'Hydrogen (e⁻p)' : p.id === 'muon' ? 'Muonic hydrogen (μ⁻p)' : p.id === 'antiproton' ? 'Protonium (p̄p)' : p.id === 'pion-minus' ? 'Pionic hydrogen (π⁻p)' : `${p.symbol}–proton atom`;
    const extra =
      p.id === 'muon'
        ? ' It is about 186× smaller than hydrogen, and its Lamb shift drove the “proton radius puzzle”.'
        : p.id === 'antiproton'
          ? ' The strong force and annihilation distort the low levels, so this Coulomb picture is only approximate.'
          : p.id === 'pion-minus'
            ? ' Strong interactions shift the 1s level, which is how it is used to measure pion–nucleon scattering.'
            : '';
    return mk(nm, red(p.mass, MP), `Bound to a proton with reduced mass μ = ${red(p.mass, MP).toPrecision(4)} mₑ.${extra}`);
  }
  if (p.charge === 1 && p.id !== 'w-plus') {
    return { ...mk('Hydrogen (reference)', red(ME, MP), ''), applicable: false, note: `A positive ${p.name} would be the nucleus, not the orbiting particle. Ordinary hydrogen is shown, with the electron orbiting the proton.` };
  }
  return { ...mk('Hydrogen (reference)', red(ME, MP), ''), applicable: false, note: 'A neutral particle feels no Coulomb attraction, so it cannot form a hydrogen-like atom. Ordinary hydrogen is shown for reference.' };
}

function assocLegendre(l: number, m: number, x: number): number {
  let pmm = 1;
  if (m > 0) {
    const somx2 = Math.sqrt(Math.max(0, (1 - x) * (1 + x)));
    let fact = 1;
    for (let i = 1; i <= m; i++) {
      pmm *= -fact * somx2;
      fact += 2;
    }
  }
  if (l === m) return pmm;
  let pmmp1 = x * (2 * m + 1) * pmm;
  if (l === m + 1) return pmmp1;
  let pll = 0;
  for (let ll = m + 2; ll <= l; ll++) {
    pll = (x * (2 * ll - 1) * pmmp1 - (ll + m - 1) * pmm) / (ll - m);
    pmm = pmmp1;
    pmmp1 = pll;
  }
  return pll;
}

function laguerre(k: number, a: number, x: number): number {
  if (k === 0) return 1;
  let l0 = 1, l1 = 1 + a - x;
  for (let i = 1; i < k; i++) {
    const l2 = ((2 * i + 1 + a - x) * l1 - (i + a) * l0) / (i + 1);
    l0 = l1;
    l1 = l2;
  }
  return l1;
}

export const radial = (n: number, l: number, r: number) => {
  const rho = (2 * r) / n;
  return Math.pow(rho, l) * Math.exp(-rho / 2) * laguerre(n - l - 1, 2 * l + 1, rho);
};

export const angular = (l: number, m: number, theta: number, phi: number) => {
  const am = Math.abs(m);
  const p = assocLegendre(l, am, Math.cos(theta));
  return m > 0 ? p * Math.cos(am * phi) : m < 0 ? p * Math.sin(am * phi) : p;
};

const LETTER = 'spdfg';
const REAL_NAMES: Record<string, string> = {
  '1,-1': 'p_y', '1,0': 'p_z', '1,1': 'p_x',
  '2,-2': 'd_xy', '2,-1': 'd_yz', '2,0': 'd_z²', '2,1': 'd_xz', '2,2': 'd_x²−y²',
};
export const orbitalName = (n: number, l: number, m: number) => `${n}${LETTER[l]}${REAL_NAMES[`${l},${m}`] ? ` (${REAL_NAMES[`${l},${m}`]})` : ` (m=${m})`}`;

/** Sample N points from |psi_nlm|^2. Returns xyz (units of a) and sign of psi. */
export function sampleOrbital(n: number, l: number, m: number, N: number, seed = 7): { pos: Float32Array; sign: Float32Array; rMax: number } {
  const rng = mulberry32(seed + n * 100 + l * 10 + m);
  // radial CDF of r^2 R^2
  const rMax = 2.5 * n * n + 6;
  const G = 4000;
  const cdf = new Float64Array(G + 1);
  for (let i = 1; i <= G; i++) {
    const r = (i / G) * rMax;
    const R = radial(n, l, r);
    cdf[i] = cdf[i - 1] + r * r * R * R;
  }
  const tot = cdf[G];
  // angular max
  let ymax = 0;
  for (let i = 0; i < 4000; i++) {
    const th = Math.acos(2 * rng() - 1), ph = 2 * Math.PI * rng();
    ymax = Math.max(ymax, angular(l, m, th, ph) ** 2);
  }
  ymax *= 1.15;
  const pos = new Float32Array(N * 3);
  const sign = new Float32Array(N);
  let k = 0, guard = 0;
  while (k < N && guard++ < N * 200) {
    const th = Math.acos(2 * rng() - 1), ph = 2 * Math.PI * rng();
    const Y = angular(l, m, th, ph);
    if (rng() * ymax > Y * Y) continue;
    // inverse CDF for r
    const u = rng() * tot;
    let lo = 0, hi = G;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < u) lo = mid;
      else hi = mid;
    }
    const r = ((lo + rng()) / G) * rMax;
    const R = radial(n, l, r);
    const st = Math.sin(th);
    // three.js y-up: map physics z -> y
    pos[k * 3] = r * st * Math.cos(ph);
    pos[k * 3 + 1] = r * Math.cos(th);
    pos[k * 3 + 2] = r * st * Math.sin(ph);
    sign[k] = Math.sign(R * Y) || 1;
    k++;
  }
  return { pos: pos.subarray(0, k * 3), sign: sign.subarray(0, k), rMax };
}
