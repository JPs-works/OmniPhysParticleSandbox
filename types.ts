
export enum PhysicsModel {
  STANDARD = 'Standard Model',
  QUANTUM = 'Quantum Mechanics',
  BEDINI = 'Bedini Open System',
  Q_GRAVITY = 'Quantum Gravity'
}

export enum ToolType {
  CURSOR = 'Interact',
  WIRE = 'Copper Wire',
  BATTERY = 'Battery (DC)',
  MAGNET_N = 'Magnet (N)',
  MAGNET_S = 'Magnet (S)',
  EMITTER_PLUS = 'Emitter (+)',
  EMITTER_MINUS = 'Emitter (-)',
  ERASER = 'Eraser'
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface Particle {
  id: number;
  pos: Vector2;
  vel: Vector2;
  acc: Vector2;
  charge: number; // -1 (electron), 1 (proton), 0 (neutron/photon)
  mass: number;
  radius: number;
  color: string;
  type: 'electron' | 'proton' | 'photon' | 'aether' | 'neutron';
  life?: number; // Infinity if undefined
}

export interface SimObject {
  id: string;
  type: 'wire' | 'magnet' | 'emitter' | 'battery';
  p1: Vector2; // Start point, Center, or Anode
  p2?: Vector2; // End point or Cathode
  path?: Vector2[]; // For freehand wires
  strength?: number;
  radius?: number;
  angle?: number;
}

export interface SimulationState {
  particleCount: number;
  fps: number;
  fieldStrength: number; // At cursor
  avgEnergy: number;
}

export interface SimulationParams {
  speed: number;
  paused: boolean;
  gravity: boolean;
  viscosity: number;
  showField: boolean;
  magnetPower: number;
}

export interface DataPoint {
  voltage: number;
}

export interface ParticleLegendItem {
  type: string;
  color: string;
  symbol: string;
  desc: string;
}
