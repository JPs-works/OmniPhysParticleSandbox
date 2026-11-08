/// <reference lib="webworker" />
// Runs the Field Lab engine off the main thread. The main thread sends one
// `advance` per rendered frame (only after the previous frame came back), so
// the worker never builds a backlog and rendering never blocks on physics.

import { Engine } from './engine';
import type { FrameMsg, FromWorker, ToWorker } from './protocol';

const engine = new Engine();
let alpha = 0;
const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

// buffers returned by the main thread, reused to avoid per-frame allocation
const pool: ArrayBuffer[] = [];
function take(bytes: number): ArrayBuffer {
  for (let i = 0; i < pool.length; i++)
    if (pool[i].byteLength >= bytes) return pool.splice(i, 1)[0];
  return new ArrayBuffer(Math.max(4096, Math.ceil(bytes * 1.5 / 16) * 16));
}

function frame(wantStats: boolean, probeId: number, stepMs: number): void {
  const n = engine.n;
  const pos = new Float32Array(take(n * 8), 0, n * 2);
  const seg = new Float32Array(take(n * 16), 0, n * 4);
  const sp = new Uint8Array(take(n), 0, n);
  sp.set(engine.sp.subarray(0, n));
  const ids = new Int32Array(take(n * 4), 0, n);
  ids.set(engine.ids.subarray(0, n));
  const { x, y, px, py, fx, fy } = engine;
  for (let i = 0; i < n; i++) {
    const rx = px[i] + (x[i] - px[i]) * alpha;
    const ry = py[i] + (y[i] - py[i]) * alpha;
    pos[i * 2] = rx;
    pos[i * 2 + 1] = ry;
    seg[i * 4] = fx[i];
    seg[i * 4 + 1] = fy[i];
    seg[i * 4 + 2] = rx;
    seg[i * 4 + 3] = ry;
    fx[i] = rx;
    fy[i] = ry;
  }
  const msg: FrameMsg = {
    type: 'frame',
    n,
    pos,
    seg,
    sp,
    ids,
    time: engine.time,
    steps: engine.steps,
    stepMs,
    stats: wantStats ? engine.stats() : undefined,
    probe: probeId > 0 ? engine.probe(probeId) : undefined,
  };
  post(msg, [pos.buffer, seg.buffer, sp.buffer, ids.buffer]);
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  try {
    switch (m.type) {
      case 'load':
        engine.setBounds(m.bounds);
        engine.loadScene(m.scene, m.seed);
        alpha = 0;
        break;
      case 'objects':
        engine.setObjects(m.objects);
        break;
      case 'params':
        engine.setParams(m.params);
        break;
      case 'bounds':
        engine.setBounds(m.bounds);
        break;
      case 'spray':
        engine.spray(m.sp, m.x, m.y, m.r, m.count, m.speed);
        break;
      case 'add':
        for (const p of m.particles) engine.addParticle(p);
        break;
      case 'erase':
        engine.eraseParticles(m.x, m.y, m.r);
        break;
      case 'clear':
        engine.clearParticles();
        break;
      case 'clearDetectors':
        engine.clearDetectors();
        break;
      case 'pick':
        post({ type: 'picked', reqId: m.reqId, id: engine.pick(m.x, m.y, m.r) });
        break;
      case 'step': {
        const t0 = performance.now();
        for (let k = 0; k < m.n; k++) engine.step();
        // show the post-step state; the next advance resumes from here without a visual jump
        alpha = 0.999;
        engine.acc = engine.params.dt * 0.999;
        frame(true, m.probeId, performance.now() - t0);
        break;
      }
      case 'advance': {
        if (m.recycle) for (const b of m.recycle) if (b.byteLength && pool.length < 16) pool.push(b);
        const t0 = performance.now();
        if (!m.paused) alpha = engine.advance(m.dt);
        frame(m.wantStats, m.probeId, performance.now() - t0);
        break;
      }
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
