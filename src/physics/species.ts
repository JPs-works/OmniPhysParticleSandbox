// Species available to the Field Lab engine.
//
// Sim units: charge in elementary charges (e), mass in proton masses (m_p).
// Charge-to-mass ratios are therefore physical (an electron curves 1836x
// harder than a proton in the same field); absolute length/time scales are not.

export const MEV_PER_U = 931.49410242;
export const PROTON_MEV = 938.27208816;
export const ELECTRON_MEV = 0.51099895;

const ionMeV = (atomicMassU: number, ionCharge: number) =>
  atomicMassU * MEV_PER_U - ionCharge * ELECTRON_MEV;

export interface Species {
  id: string;
  symbol: string;
  name: string;
  /** charge in e */
  q: number;
  /** rest mass in MeV/c^2 (informational) */
  massMeV: number;
  /** mass in sim units (proton masses) */
  m: number;
  color: string;
  /** relative sprite size */
  size: number;
  /** id in the Particle Zoo catalog, if any */
  catalogId?: string;
  note?: string;
  illustrative?: boolean;
}

const mk = (
  id: string,
  symbol: string,
  name: string,
  q: number,
  massMeV: number,
  color: string,
  extra: Partial<Species> = {},
): Species => {
  const m = massMeV / PROTON_MEV;
  return {
    id,
    symbol,
    name,
    q,
    massMeV,
    m,
    color,
    size: 0.7 + 0.18 * Math.log10(Math.max(m, 1e-4) * 1e4),
    ...extra,
  };
};

export const SPECIES: Species[] = [
  mk('e-', 'e⁻', 'Electron', -1, ELECTRON_MEV, '#38bdf8', { catalogId: 'electron' }),
  mk('e+', 'e⁺', 'Positron', 1, ELECTRON_MEV, '#f472b6', { catalogId: 'positron' }),
  mk('mu-', 'μ⁻', 'Muon', -1, 105.6583755, '#a78bfa', { catalogId: 'muon', note: 'Decay (τ = 2.2 μs) not simulated.' }),
  mk('mu+', 'μ⁺', 'Anti-muon', 1, 105.6583755, '#fb7185', { catalogId: 'anti-muon', note: 'Decay (τ = 2.2 μs) not simulated.' }),
  mk('pi+', 'π⁺', 'Pion (+)', 1, 139.57039, '#fbbf24', { catalogId: 'pion-plus', note: 'Decay (τ = 26 ns) not simulated.' }),
  mk('pi-', 'π⁻', 'Pion (−)', -1, 139.57039, '#34d399', { catalogId: 'pion-minus', note: 'Decay (τ = 26 ns) not simulated.' }),
  mk('p', 'p⁺', 'Proton', 1, PROTON_MEV, '#ff7a45', { catalogId: 'proton' }),
  mk('pbar', 'p̄', 'Antiproton', -1, PROTON_MEV, '#22d3ee', { catalogId: 'antiproton' }),
  mk('d', 'd⁺', 'Deuteron', 1, 1875.61294257, '#facc15', { catalogId: 'deuteron' }),
  mk('alpha', 'α', 'Alpha (⁴He²⁺)', 2, 3727.3794066, '#fde68a', { catalogId: 'alpha' }),
  mk('ne20', '²⁰Ne⁺', 'Neon-20 ion', 1, ionMeV(19.9924401762, 1), '#4ade80', { note: 'Natural abundance 90.48%' }),
  mk('ne21', '²¹Ne⁺', 'Neon-21 ion', 1, ionMeV(20.993846685, 1), '#facc15', { note: 'Natural abundance 0.27%' }),
  mk('ne22', '²²Ne⁺', 'Neon-22 ion', 1, ionMeV(21.991385114, 1), '#f472b6', { note: 'Natural abundance 9.25%' }),
  mk('n', 'n⁰', 'Neutron', 0, 939.56542052, '#cbd5e1', { catalogId: 'neutron', note: 'Neutral: ignores E and B.' }),
  {
    id: 'body',
    symbol: 'm',
    name: 'Neutral test mass',
    q: 0,
    massMeV: 0,
    m: 1,
    color: '#e2e8f0',
    size: 0.8,
    illustrative: true,
    note: 'Illustrative neutral body for the gravity demo (mass in arbitrary units).',
  },
  {
    id: 'star',
    symbol: '★',
    name: 'Massive body',
    q: 0,
    massMeV: 0,
    m: 1000,
    color: '#fff1c1',
    size: 2.6,
    illustrative: true,
    note: 'Illustrative heavy body for the gravity demo.',
  },
];

export const SPECIES_INDEX: Record<string, number> = Object.fromEntries(
  SPECIES.map((s, i) => [s.id, i]),
);

export const speciesIdx = (id: string): number => {
  const i = SPECIES_INDEX[id];
  if (i === undefined) throw new Error(`Unknown species ${id}`);
  return i;
};

/** Species the user can pick for the gun / spray tools. */
export const GUN_SPECIES = SPECIES.filter((s) => !s.illustrative || s.id === 'body').map((s) => s.id);

export const speciesByCatalogId = (catalogId: string): Species | undefined =>
  SPECIES.find((s) => s.catalogId === catalogId);

export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
