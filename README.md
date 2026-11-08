# OmniPhys Particle Sandbox

An interactive, GPU-rendered sandbox for seeing how charged and massive particles move in electric, magnetic and gravitational fields. It also includes a Standard-Model particle zoo with quantum visualisations. It is embedded on [jakeparr.dev](https://jakeparr.dev) and runs entirely in the browser: no server, no API keys.

## Modes

- **Field Lab**: real E and B fields with the Lorentz force `F = q(E + v×B)`, integrated with the Boris pusher at a fixed time step in a Web Worker. Pairwise Coulomb forces and gravity are Plummer-softened and use a Barnes–Hut tree above 500 particles. The run uses a seeded RNG, so it is reproducible. Guided experiments: cyclotron motion, E×B drift, Wien filter, mass spectrometer (neon isotopes), magnetic bottle, capacitor deflection, Rutherford scattering, N-body gravity, thermalisation, and a free sandbox.
- **Particle Zoo**: a catalog browser with property cards and three views: an exact free Gaussian wave packet, hydrogen-like orbitals (including exotic atoms via reduced mass), and a double slit with de Broglie–Bohm trajectories. "Send to Field Lab" loads a charged, long-lived particle into the gun.

Sim units: charge in e and mass in proton masses, so q/m ratios are physical. Lengths and times are scaled.

## Develop

From the repo root (npm workspaces, so do not `npm install` in here):

```sh
npm run dev -w projects/omniphys-particle-sandbox
npm run build -w projects/omniphys-particle-sandbox    # tsc --noEmit && vite build
cd projects/omniphys-particle-sandbox && npx tsx tests/physics.test.ts   # quantitative physics checks
```

The root element exposes `data-ready`, `data-mode`, `data-preset` and `data-particles` for end-to-end tests.
