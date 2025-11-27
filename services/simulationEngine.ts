
import { Particle, PhysicsModel, SimObject, Vector2, SimulationParams } from '../types';

const MAX_PARTICLES = 1200;

interface SimulationRules {
  particleForceType: 'COULOMB' | 'GRAVITY' | 'NONE';
  particleForceK: number;     
  particleInteractionRadiusSq: number;
  baseDrag: number;           
  vacuumJitter: number;       
  magnetMode: 'MONOPOLE'; // Standardized to Monopole for all models per user request
  magnetStrength: number;     
  magnetRange: number;        
  wireConductivity: number;   
  wireResistance: number;     
  wireTunneling: number;      
}

const MODEL_RULES: Record<PhysicsModel, SimulationRules> = {
  [PhysicsModel.STANDARD]: {
    particleForceType: 'COULOMB',
    particleForceK: 4000, 
    particleInteractionRadiusSq: 40000,
    baseDrag: 0.02,
    vacuumJitter: 0.1, 
    magnetMode: 'MONOPOLE',
    magnetStrength: 20000, // Increased for Monopole logic (was 0.8 for Lorentz)
    magnetRange: 500,
    wireConductivity: 0.9,
    wireResistance: 0.02, 
    wireTunneling: 0.0
  },
  [PhysicsModel.QUANTUM]: {
    particleForceType: 'COULOMB',
    particleForceK: 1500,
    particleInteractionRadiusSq: 25000,
    baseDrag: 0.05,
    vacuumJitter: 4.0, 
    magnetMode: 'MONOPOLE',
    magnetStrength: 15000, // Increased for Monopole logic
    magnetRange: 300,
    wireConductivity: 0.6,
    wireResistance: 0.0, 
    wireTunneling: 0.45 
  },
  [PhysicsModel.BEDINI]: {
    particleForceType: 'COULOMB',
    particleForceK: 3000,
    particleInteractionRadiusSq: 60000,
    baseDrag: 0.01,
    vacuumJitter: 2.5, 
    magnetMode: 'MONOPOLE',
    magnetStrength: 25000, 
    magnetRange: 600,
    wireConductivity: 0.95,
    wireResistance: -0.02, 
    wireTunneling: 0.0
  },
  [PhysicsModel.Q_GRAVITY]: {
    particleForceType: 'GRAVITY',
    particleForceK: 100, 
    particleInteractionRadiusSq: 250000, 
    baseDrag: 0.005,
    vacuumJitter: 0.05,
    magnetMode: 'MONOPOLE', 
    magnetStrength: 12000, // Strong enough to deflect charged particles in gravity
    magnetRange: 500,
    wireConductivity: 0.1,
    wireResistance: 0.1,
    wireTunneling: 0.0
  }
};

export class ParticleEngine {
  public particles: Particle[] = [];
  public objects: SimObject[] = [];
  private width: number = 0;
  private height: number = 0;
  private particleIdCounter = 0;

  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }

  public resize(w: number, h: number) {
    this.width = w;
    this.height = h;
  }

  public resetAether(model: PhysicsModel) {
    this.particles = [];
    this.objects = [];
    
    let density = 600;
    if (model === PhysicsModel.Q_GRAVITY) density = 1200;

    for (let i = 0; i < density; i++) {
      this.particles.push(this.createInitialParticle(model));
    }
  }

  private createInitialParticle(model: PhysicsModel): Particle {
    const x = Math.random() * this.width;
    const y = Math.random() * this.height;
    
    let type: Particle['type'] = 'aether';
    let color = '#64748b';
    let charge = 0;
    let mass = 1;
    let radius = 2;
    let vel = { x: (Math.random() - 0.5), y: (Math.random() - 0.5) };

    if (model === PhysicsModel.STANDARD) {
        const r = Math.random();
        if (r > 0.6) {
            type = 'electron';
            color = '#3b82f6';
            charge = -1;
            mass = 1;
            radius = 4;
        } else if (r > 0.5) {
            type = 'proton';
            color = '#ef4444';
            charge = 1;
            mass = 10;
            radius = 7;
            vel = { x: vel.x * 0.2, y: vel.y * 0.2 };
        } else {
            color = '#334155';
            radius = 2;
            charge = 0;
        }
    } 
    else if (model === PhysicsModel.BEDINI) {
        if (Math.random() > 0.5) {
            color = '#dc2626'; 
            charge = 1; 
            type = 'proton';
        } else {
            color = '#2563eb'; 
            charge = -1; 
            type = 'electron';
        }
        radius = 3.5;
        vel = { x: vel.x * 3, y: vel.y * 3 }; 
    } 
    else if (model === PhysicsModel.QUANTUM) {
        color = Math.random() > 0.5 ? '#10b981' : '#8b5cf6';
        radius = 2;
        type = 'photon';
        charge = Math.random() > 0.5 ? 1 : -1; 
    }
    else if (model === PhysicsModel.Q_GRAVITY) {
        mass = Math.random() * 8 + 3;
        radius = mass * 0.8;
        color = `hsl(270, 60%, ${80 - mass * 4}%)`;
        charge = 0; // Base particles are neutral, but tools emit charged ones
    }

    return {
      id: this.particleIdCounter++,
      pos: { x, y },
      vel,
      acc: { x: 0, y: 0 },
      charge,
      mass,
      radius,
      color,
      type
    };
  }

  public update(dt: number, params: SimulationParams, model: PhysicsModel, cursor: Vector2 | null, interacting: boolean) {
    if (params.paused) return;

    const rules = MODEL_RULES[model];
    const timeScale = params.speed;
    const effectiveDt = dt * timeScale;
    const len = this.particles.length;

    for (let i = 0; i < len; i++) {
      const p = this.particles[i];
      p.acc = { x: 0, y: 0 };

      // --- A. VACUUM ENERGY ---
      if (rules.vacuumJitter > 0) {
        p.acc.x += (Math.random() - 0.5) * rules.vacuumJitter * 50;
        p.acc.y += (Math.random() - 0.5) * rules.vacuumJitter * 50;
      }

      // --- B. CURSOR ---
      if (cursor && interacting) {
        const dx = cursor.x - p.pos.x;
        const dy = cursor.y - p.pos.y;
        const d = Math.sqrt(dx*dx + dy*dy + 1);
        if (d < 300) {
            const strength = 1500 / d;
            p.acc.x += (dx/d) * strength;
            p.acc.y += (dy/d) * strength;
        }
      }

      // --- C. PARTICLE FORCES ---
      if (rules.particleForceType !== 'NONE') {
          for (let j = 0; j < len; j++) {
              if (i === j) continue;
              const p2 = this.particles[j];
              const dx = p.pos.x - p2.pos.x;
              const dy = p.pos.y - p2.pos.y;
              const dSq = dx*dx + dy*dy;

              if (dSq > (p.radius+p2.radius)**2 && dSq < rules.particleInteractionRadiusSq) {
                  const d = Math.sqrt(dSq);
                  let force = 0;

                  if (rules.particleForceType === 'COULOMB') {
                      if (p.charge !== 0 && p2.charge !== 0) {
                         force = (rules.particleForceK * p.charge * p2.charge) / dSq;
                      }
                  } else if (rules.particleForceType === 'GRAVITY') {
                      force = -(rules.particleForceK * p.mass * p2.mass) / dSq;
                  }

                  if (force !== 0) {
                      const fx = (dx/d) * force;
                      const fy = (dy/d) * force;
                      p.acc.x += fx / p.mass;
                      p.acc.y += fy / p.mass;
                  }
              }
          }
      }

      // --- D. MAGNETS & BATTERIES ---
      for (const obj of this.objects) {
          if (obj.type === 'magnet') {
              const dx = p.pos.x - obj.p1.x;
              const dy = p.pos.y - obj.p1.y;
              const dSq = dx*dx + dy*dy;
              const d = Math.sqrt(dSq);

              // Min distance clamp to prevent singularities (flinging)
              if (d < 15 || d > rules.magnetRange) continue;

              const magStrength = (obj.strength || 50) * params.magnetPower;
              
              // UNIFIED MONOPOLE LOGIC (Source of Truth: Bedini Model)
              // Treats Magnets as Monopole sources of potential.
              // North (+) repels Protons (+), attracts Electrons (-)
              // South (-) attracts Protons (+), repels Electrons (-)
              if (p.charge !== 0) {
                  const polarity = (magStrength > 0 ? 1 : -1) * (p.charge > 0 ? 1 : -1);
                  
                  // F = k * Q / r^2
                  const forceMag = (Math.abs(magStrength) * rules.magnetStrength) / (dSq + 10); 
                  
                  const fx = (dx/d) * forceMag * polarity;
                  const fy = (dy/d) * forceMag * polarity;

                  p.acc.x += fx / p.mass;
                  p.acc.y += fy / p.mass;
              }
          }
          else if (obj.type === 'battery' && obj.p2) {
              if (p.charge === 0) continue;
              const STRENGTH = 80000; 

              // Anode Repulsion (+)
              const dx1 = p.pos.x - obj.p1.x;
              const dy1 = p.pos.y - obj.p1.y;
              const dSq1 = dx1*dx1 + dy1*dy1;
              const d1 = Math.sqrt(dSq1);
              if (d1 > 10) {
                  const f1 = (STRENGTH * p.charge) / dSq1;
                  p.acc.x += (dx1/d1) * f1;
                  p.acc.y += (dy1/d1) * f1;
              }

              // Cathode Attraction (-)
              const dx2 = p.pos.x - obj.p2.x;
              const dy2 = p.pos.y - obj.p2.y;
              const dSq2 = dx2*dx2 + dy2*dy2;
              const d2 = Math.sqrt(dSq2);
              if (d2 > 10) {
                   const f2 = -(STRENGTH * p.charge) / dSq2; 
                   p.acc.x += (dx2/d2) * f2;
                   p.acc.y += (dy2/d2) * f2;
              }
          }
      }

      // --- E. DRAG ---
      const drag = rules.baseDrag * (params.viscosity * 20);
      p.vel.x *= (1 - drag);
      p.vel.y *= (1 - drag);
    }

    // 2. INTEGRATION & COLLISIONS
    for (const p of this.particles) {
        p.vel.x += p.acc.x * effectiveDt;
        p.vel.y += p.acc.y * effectiveDt;

        let nextX = p.pos.x + p.vel.x * effectiveDt;
        let nextY = p.pos.y + p.vel.y * effectiveDt;
        
        // Wire Interaction
        if (rules.wireConductivity > 0) {
            for (const obj of this.objects) {
                if (obj.type === 'wire' && obj.path && obj.path.length > 1) {
                     
                     let closestDist = 9999;
                     let bx = 0, by = 0; 
                     let tx = 0, ty = 0; 
                     let intercepted = false;

                     for (let k = 0; k < obj.path.length - 1; k++) {
                         const s1 = obj.path[k];
                         const s2 = obj.path[k+1];

                         const minX = Math.min(s1.x, s2.x) - 20;
                         const maxX = Math.max(s1.x, s2.x) + 20;
                         const minY = Math.min(s1.y, s2.y) - 20;
                         const maxY = Math.max(s1.y, s2.y) + 20;

                         if (nextX < minX || nextX > maxX || nextY < minY || nextY > maxY) continue;

                         const wx = s2.x - s1.x;
                         const wy = s2.y - s1.y;
                         const lenSq = wx*wx + wy*wy;
                         if (lenSq === 0) continue;

                         const t = ((nextX - s1.x) * wx + (nextY - s1.y) * wy) / lenSq;
                         const tClamped = Math.max(0, Math.min(1, t));

                         const cx = s1.x + tClamped * wx;
                         const cy = s1.y + tClamped * wy;

                         const dist = Math.sqrt((nextX - cx)**2 + (nextY - cy)**2);
                         
                         if (dist < (p.radius + 10) && dist < closestDist) {
                             closestDist = dist;
                             bx = cx;
                             by = cy;
                             const wLen = Math.sqrt(lenSq);
                             tx = wx / wLen;
                             ty = wy / wLen;
                             intercepted = true;
                         }
                     }

                     if (intercepted) {
                         if (Math.random() < rules.wireTunneling) continue;

                         const dx = nextX - bx;
                         const dy = nextY - by;
                         const normalX = dx / closestDist;
                         const normalY = dy / closestDist;

                         const vDotT = p.vel.x * tx + p.vel.y * ty;
                         const conductionFactor = 1 - rules.wireResistance; 
                         
                         nextX = bx + normalX * (p.radius + 2);
                         nextY = by + normalY * (p.radius + 2);
                         
                         p.vel.x = tx * vDotT * conductionFactor + normalX * 0.5;
                         p.vel.y = ty * vDotT * conductionFactor + normalY * 0.5;
                     }
                }
            }
        }

        p.pos.x = nextX;
        p.pos.y = nextY;

        // Wrap
        if (p.pos.x < 0) p.pos.x = this.width;
        if (p.pos.x > this.width) p.pos.x = 0;
        if (p.pos.y < 0) p.pos.y = this.height;
        if (p.pos.y > this.height) p.pos.y = 0;
    }
  }

  public calculateFieldIntensity(x: number, y: number, model: PhysicsModel): number {
      let intensity = 0;
      
      for (const obj of this.objects) {
          if (obj.type === 'magnet') {
              const dx = x - obj.p1.x;
              const dy = y - obj.p1.y;
              const dSq = dx*dx + dy*dy + 1;
              // Heatmap represents scalar potential strength
              intensity += (Math.abs(obj.strength || 0) * 100) / dSq;
          } else if (obj.type === 'battery' && obj.p2) {
              const d1 = (x - obj.p1.x)**2 + (y - obj.p1.y)**2 + 10;
              const d2 = (x - obj.p2.x)**2 + (y - obj.p2.y)**2 + 10;
              intensity += 15000 / d1 + 15000 / d2;
          }
      }
      return Math.min(intensity, 1); 
  }

  public addObject(obj: SimObject) {
    this.objects.push(obj);
  }

  public removeObjectAt(pos: Vector2) {
     this.objects = this.objects.filter(obj => {
        if (obj.path) {
            return !obj.path.some(p => (p.x-pos.x)**2 + (p.y-pos.y)**2 < 900);
        }
        const pt = obj.p1;
        const d = (pt.x-pos.x)**2 + (pt.y-pos.y)**2;
        return d > 900; 
     });
  }

  public addParticles(pos: Vector2, toolType: string, count: number = 1) {
    for(let i=0; i<count; i++) {
        if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
        
        // Use Standard model template for emitted particles, ensuring they have charge
        const p = this.createInitialParticle(PhysicsModel.STANDARD);
        p.pos = { x: pos.x + (Math.random()-0.5)*15, y: pos.y + (Math.random()-0.5)*15 };
        
        if (toolType === 'electron') {
            p.color = '#3b82f6';
            p.charge = -1;
            p.mass = 1;
            p.radius = 4;
            p.type = 'electron';
        } else if (toolType === 'proton') {
            p.color = '#ef4444';
            p.charge = 1;
            p.mass = 10;
            p.radius = 7;
            p.type = 'proton';
        } 
        
        p.vel = { x: (Math.random()-0.5)*50, y: (Math.random()-0.5)*50 };
        this.particles.push(p);
    }
  }
  
  public getStats() {
      let totalEnergy = 0;
      for(const p of this.particles) {
          totalEnergy += 0.5 * p.mass * (p.vel.x**2 + p.vel.y**2);
      }
      return {
          count: this.particles.length,
          energy: totalEnergy / (this.particles.length || 1)
      };
  }
}
