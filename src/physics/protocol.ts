import type { Bounds, FieldObject, ParticleInit, ProbeInfo, SceneSpec, SimParams, SimStats } from './types';

export type ToWorker =
  | { type: 'load'; scene: SceneSpec; seed: number; bounds: Bounds }
  | { type: 'objects'; objects: FieldObject[] }
  | { type: 'params'; params: Partial<SimParams> }
  | { type: 'bounds'; bounds: Bounds }
  | { type: 'advance'; dt: number; paused: boolean; wantStats: boolean; probeId: number; recycle?: ArrayBuffer[] }
  | { type: 'step'; n: number; probeId: number }
  | { type: 'spray'; sp: string; x: number; y: number; r: number; count: number; speed: number }
  | { type: 'add'; particles: ParticleInit[] }
  | { type: 'erase'; x: number; y: number; r: number }
  | { type: 'clear' }
  | { type: 'clearDetectors' }
  | { type: 'pick'; x: number; y: number; r: number; reqId: number };

export interface FrameMsg {
  type: 'frame';
  n: number;
  /** interpolated render positions x,y (views may be longer than n; buffers are recycled) */
  pos: Float32Array;
  /** trail segments: x0,y0,x1,y1 per particle (previous frame -> now) */
  seg: Float32Array;
  sp: Uint8Array;
  ids: Int32Array;
  time: number;
  steps: number;
  stepMs: number;
  stats?: SimStats;
  probe?: ProbeInfo | null;
}

export type FromWorker = FrameMsg | { type: 'picked'; reqId: number; id: number } | { type: 'error'; message: string };
