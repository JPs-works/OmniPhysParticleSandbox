// Particle catalog for the Particle Zoo (adapted from the QuantumForge prototype).
// Masses: PDG central values, MeV/c^2. Lifetimes in seconds (null = stable / not applicable).

export type Family = 'Quark' | 'Lepton' | 'Boson' | 'Hadron' | 'Nucleus' | 'Hypothetical';

export interface CatalogParticle {
  id: string;
  name: string;
  symbol: string;
  family: Family;
  /** MeV/c^2; NaN for undefined (tachyon) */
  mass: number;
  /** elementary charges */
  charge: number;
  /** units of hbar */
  spin: number;
  /** mean lifetime in seconds, null when stable */
  lifetime: number | null;
  lifetimeNote?: string;
  colorCharge?: string;
  antiparticle?: string;
  composition?: string;
  description: string;
  /** shown prominently: why something is special/limited */
  caveat?: string;
  confined?: boolean;
  hypothetical?: boolean;
}

export const FAMILY_COLOR: Record<Family, string> = {
  Quark: '#f472b6',
  Lepton: '#38bdf8',
  Boson: '#facc15',
  Hadron: '#fb923c',
  Nucleus: '#4ade80',
  Hypothetical: '#a78bfa',
};

const CONFINED = 'Colour confinement: quarks and gluons are never observed in isolation, only inside hadrons.';

export const CATALOG: CatalogParticle[] = [
  // ---------------- quarks
  { id: 'up-quark', name: 'Up quark', symbol: 'u', family: 'Quark', mass: 2.16, charge: 2 / 3, spin: 0.5, lifetime: null, colorCharge: 'r / g / b', antiparticle: 'ū', description: 'The lightest quark. Two up quarks and one down make a proton.', caveat: CONFINED, confined: true },
  { id: 'down-quark', name: 'Down quark', symbol: 'd', family: 'Quark', mass: 4.67, charge: -1 / 3, spin: 0.5, lifetime: null, colorCharge: 'r / g / b', antiparticle: 'd̄', description: 'Pairs with up quarks to form nucleons. One up and two down make a neutron.', caveat: CONFINED, confined: true },
  { id: 'strange-quark', name: 'Strange quark', symbol: 's', family: 'Quark', mass: 93.4, charge: -1 / 3, spin: 0.5, lifetime: null, lifetimeNote: 'decays weakly inside hadrons', colorCharge: 'r / g / b', antiparticle: 's̄', description: 'Found in kaons and hyperons and carries the “strangeness” quantum number.', caveat: CONFINED, confined: true },
  { id: 'charm-quark', name: 'Charm quark', symbol: 'c', family: 'Quark', mass: 1270, charge: 2 / 3, spin: 0.5, lifetime: null, lifetimeNote: '~1e-12 s inside charmed hadrons', colorCharge: 'r / g / b', antiparticle: 'c̄', description: 'Discovered in 1974 through the J/ψ meson (cc̄), the “November Revolution”.', caveat: CONFINED, confined: true },
  { id: 'bottom-quark', name: 'Bottom quark', symbol: 'b', family: 'Quark', mass: 4180, charge: -1 / 3, spin: 0.5, lifetime: null, lifetimeNote: '~1.5e-12 s inside B hadrons', colorCharge: 'r / g / b', antiparticle: 'b̄', description: 'Also called “beauty”. B mesons are the main laboratory for CP violation.', caveat: CONFINED, confined: true },
  { id: 'top-quark', name: 'Top quark', symbol: 't', family: 'Quark', mass: 172570, charge: 2 / 3, spin: 0.5, lifetime: 5e-25, colorCharge: 'r / g / b', antiparticle: 't̄', description: 'The heaviest known elementary particle. It decays before it can form hadrons.', caveat: 'Decays before hadronising, so it never forms bound states.', confined: true },
  // ---------------- leptons
  { id: 'electron', name: 'Electron', symbol: 'e⁻', family: 'Lepton', mass: 0.51099895, charge: -1, spin: 0.5, lifetime: null, lifetimeNote: '> 6.6e28 yr', antiparticle: 'e⁺', description: 'The lightest charged particle. It carries electric current and builds chemistry.' },
  { id: 'positron', name: 'Positron', symbol: 'e⁺', family: 'Lepton', mass: 0.51099895, charge: 1, spin: 0.5, lifetime: null, antiparticle: 'e⁻', description: 'The electron’s antiparticle, predicted by Dirac and found by Anderson in 1932.' },
  { id: 'muon', name: 'Muon', symbol: 'μ⁻', family: 'Lepton', mass: 105.6583755, charge: -1, spin: 0.5, lifetime: 2.1969811e-6, antiparticle: 'μ⁺', description: 'A heavy electron. Cosmic-ray muons reach the ground only because of time dilation.' },
  { id: 'anti-muon', name: 'Antimuon', symbol: 'μ⁺', family: 'Lepton', mass: 105.6583755, charge: 1, spin: 0.5, lifetime: 2.1969811e-6, antiparticle: 'μ⁻', description: 'Antiparticle of the muon, used in muon g−2 precision experiments.' },
  { id: 'tau', name: 'Tau', symbol: 'τ⁻', family: 'Lepton', mass: 1776.93, charge: -1, spin: 0.5, lifetime: 2.903e-13, antiparticle: 'τ⁺', description: 'The heaviest lepton, and heavy enough to decay into hadrons.' },
  { id: 'electron-neutrino', name: 'Electron neutrino', symbol: 'νₑ', family: 'Lepton', mass: 0.45e-6, charge: 0, spin: 0.5, lifetime: null, antiparticle: 'ν̄ₑ', description: 'Interacts only through the weak force. Neutrino flavours oscillate, which proves that at least two neutrino mass states are non-zero.', caveat: 'Flavour states (νₑ, ν_μ, ν_τ) are mixtures of mass states and have no single definite mass. KATRIN (2024) bounds the effective νₑ mass below 0.45 eV; the value shown is that bound, not a measurement.' },
  { id: 'anti-electron-neutrino', name: 'Electron antineutrino', symbol: 'ν̄ₑ', family: 'Lepton', mass: 0.45e-6, charge: 0, spin: 0.5, lifetime: null, antiparticle: 'νₑ', description: 'Emitted in β⁻ decay. Reactor antineutrinos were the first neutrinos ever detected (1956).', caveat: 'Flavour states (νₑ, ν_μ, ν_τ) are mixtures of mass states and have no single definite mass. KATRIN (2024) bounds the effective νₑ mass below 0.45 eV; the value shown is that bound, not a measurement.' },
  // ---------------- bosons
  { id: 'photon', name: 'Photon', symbol: 'γ', family: 'Boson', mass: 0, charge: 0, spin: 1, lifetime: null, description: 'The quantum of light and the carrier of the electromagnetic force.' },
  { id: 'gluon', name: 'Gluon', symbol: 'g', family: 'Boson', mass: 0, charge: 0, spin: 1, lifetime: null, colorCharge: 'colour octet', description: 'Carries the strong force. Gluons carry colour themselves, so they interact with each other.', caveat: CONFINED, confined: true },
  { id: 'w-plus', name: 'W⁺ boson', symbol: 'W⁺', family: 'Boson', mass: 80369, charge: 1, spin: 1, lifetime: 3.2e-25, antiparticle: 'W⁻', description: 'Charged mediator of the weak force, responsible for β decay.' },
  { id: 'w-minus', name: 'W⁻ boson', symbol: 'W⁻', family: 'Boson', mass: 80369, charge: -1, spin: 1, lifetime: 3.2e-25, antiparticle: 'W⁺', description: 'Antiparticle of the W⁺.' },
  { id: 'z-boson', name: 'Z boson', symbol: 'Z⁰', family: 'Boson', mass: 91188, charge: 0, spin: 1, lifetime: 2.6e-25, description: 'Neutral mediator of the weak force. LEP measured its width to count neutrino species (3).' },
  { id: 'higgs', name: 'Higgs boson', symbol: 'H⁰', family: 'Boson', mass: 125200, charge: 0, spin: 0, lifetime: 1.6e-22, description: 'An excitation of the Higgs field, whose vacuum value gives W, Z and fermions their mass. Discovered at the LHC in 2012.' },
  // ---------------- hadrons
  { id: 'proton', name: 'Proton', symbol: 'p⁺', family: 'Hadron', mass: 938.27208816, charge: 1, spin: 0.5, lifetime: null, lifetimeNote: '> 1e34 yr', composition: 'uud', antiparticle: 'p̄', description: 'A stable baryon. Most of its mass comes from gluon field energy, not from the quark masses.' },
  { id: 'antiproton', name: 'Antiproton', symbol: 'p̄', family: 'Hadron', mass: 938.27208816, charge: -1, spin: 0.5, lifetime: null, composition: 'ūūd̄', antiparticle: 'p⁺', description: 'Discovered at the Bevatron in 1955. CERN’s AD traps antiprotons to make antihydrogen.' },
  { id: 'neutron', name: 'Neutron', symbol: 'n⁰', family: 'Hadron', mass: 939.56542052, charge: 0, spin: 0.5, lifetime: 878.4, composition: 'udd', antiparticle: 'n̄', description: 'A free neutron β-decays in about 15 minutes. Inside a nucleus it can be stable.' },
  { id: 'antineutron', name: 'Antineutron', symbol: 'n̄', family: 'Hadron', mass: 939.56542052, charge: 0, spin: 0.5, lifetime: 878.4, composition: 'ūd̄d̄', antiparticle: 'n⁰', description: 'The neutron’s antiparticle. It is neutral but has the opposite magnetic moment.' },
  { id: 'pion-plus', name: 'Pion (π⁺)', symbol: 'π⁺', family: 'Hadron', mass: 139.57039, charge: 1, spin: 0, lifetime: 2.6033e-8, composition: 'ud̄', antiparticle: 'π⁻', description: 'The lightest meson. Yukawa proposed pions as carriers of the nuclear force.' },
  { id: 'pion-minus', name: 'Pion (π⁻)', symbol: 'π⁻', family: 'Hadron', mass: 139.57039, charge: -1, spin: 0, lifetime: 2.6033e-8, composition: 'dū', antiparticle: 'π⁺', description: 'Decays to μ⁻ + ν̄_μ. This is the source of most cosmic-ray muons.' },
  // ---------------- nuclei
  { id: 'deuteron', name: 'Deuteron', symbol: 'd⁺', family: 'Nucleus', mass: 1875.61294257, charge: 1, spin: 1, lifetime: null, composition: 'pn', description: 'The only bound two-nucleon state. Its binding energy is just 2.22 MeV.' },
  { id: 'alpha', name: 'Alpha particle', symbol: 'α', family: 'Nucleus', mass: 3727.3794066, charge: 2, spin: 0, lifetime: null, composition: 'ppnn (⁴He²⁺)', description: 'An exceptionally tightly bound helium-4 nucleus. Rutherford used alphas to discover the nucleus.' },
  // ---------------- hypothetical
  { id: 'graviton', name: 'Graviton', symbol: 'G', family: 'Hypothetical', mass: 0, charge: 0, spin: 2, lifetime: null, description: 'The hypothetical quantum of gravity, expected to be massless with spin 2.', caveat: 'Never detected. Its properties are predictions.', hypothetical: true },
  { id: 'axion', name: 'Axion', symbol: 'a', family: 'Hypothetical', mass: 1e-11, charge: 0, spin: 0, lifetime: null, description: 'Proposed to solve the strong-CP problem, and a leading dark-matter candidate.', caveat: 'Hypothetical. The mass shown (~10 μeV) is only one typical target range.', hypothetical: true },
  { id: 'tachyon', name: 'Tachyon', symbol: 'T', family: 'Hypothetical', mass: NaN, charge: 0, spin: 0, lifetime: null, description: 'A hypothetical particle with imaginary mass that would always travel faster than light. In modern field theory a “tachyon” signals an unstable vacuum rather than a real particle.', caveat: 'Speculative. Imaginary mass (m² < 0), so mass-dependent views are disabled.', hypothetical: true },
];

export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map((p) => [p.id, p])) as Record<string, CatalogParticle>;

export const HBARC = 197.3269804; // MeV fm
export const ME = 0.51099895;
export const MP = 938.27208816;
export const C = 299792458;

export function fmtCharge(q: number): string {
  if (q === 0) return '0';
  const s = q > 0 ? '+' : '−';
  const a = Math.abs(q);
  if (Math.abs(a - 2 / 3) < 1e-6) return `${s}2/3`;
  if (Math.abs(a - 1 / 3) < 1e-6) return `${s}1/3`;
  return `${s}${a}`;
}

export const fmtSpin = (s: number) => (Number.isInteger(s) ? String(s) : `${Math.round(s * 2)}/2`);

export function fmtSci(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= -2 && e < 5) return Number(v.toPrecision(digits)).toString();
  const m = v / 10 ** e;
  const sup = String(e).replace(/-/g, '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);
  return `${m.toFixed(digits - 1)}×10${sup}`;
}

/** Length in fm -> human string with unit. */
export function fmtLength(fm: number): string {
  if (!Number.isFinite(fm)) return '—';
  const units: [number, string][] = [
    [1e18, 'km'],
    [1e15, 'm'],
    [1e12, 'mm'],
    [1e9, 'μm'],
    [1e6, 'nm'],
    [1e3, 'pm'],
    [1, 'fm'],
  ];
  for (const [f, u] of units) if (Math.abs(fm) >= f) return `${Number((fm / f).toPrecision(3))} ${u}`;
  return `${fmtSci(fm)} fm`;
}

export function fmtTime(s: number): string {
  if (!Number.isFinite(s)) return '—';
  const units: [number, string][] = [
    [3.156e7, 'yr'],
    [1, 's'],
    [1e-3, 'ms'],
    [1e-6, 'μs'],
    [1e-9, 'ns'],
    [1e-12, 'ps'],
    [1e-15, 'fs'],
  ];
  for (const [f, u] of units) if (s >= f) return `${Number((s / f).toPrecision(3))} ${u}`;
  return `${fmtSci(s)} s`;
}

export function fmtMass(mev: number): string {
  if (!Number.isFinite(mev)) return 'imaginary';
  if (mev === 0) return '0';
  if (mev >= 1000) return `${Number((mev / 1000).toPrecision(4))} GeV/c²`;
  if (mev >= 1) return `${Number(mev.toPrecision(5))} MeV/c²`;
  if (mev >= 1e-3) return `${Number((mev * 1000).toPrecision(4))} keV/c²`;
  return `${fmtSci(mev * 1e6)} eV/c²`;
}
