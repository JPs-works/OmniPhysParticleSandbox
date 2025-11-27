
import React from 'react';
import { PhysicsModel, ParticleLegendItem } from '../types';

interface HUDProps {
  model: PhysicsModel;
  particleCount: number;
  fps: number;
  energy?: number;
}

const HUD: React.FC<HUDProps> = ({ model, particleCount, fps, energy }) => {
  
  const getLegendItems = (): ParticleLegendItem[] => {
    switch(model) {
      case PhysicsModel.STANDARD:
        return [
          { type: 'Proton', color: '#ef4444', symbol: '+', desc: 'Positive Charge, Heavy' },
          { type: 'Electron', color: '#3b82f6', symbol: '-', desc: 'Negative Charge, Light' },
          { type: 'Neutron', color: '#334155', symbol: '•', desc: 'Neutral Dust' },
        ];
      case PhysicsModel.BEDINI:
        return [
          { type: 'North Monopole', color: '#991b1b', symbol: '+', desc: 'Positive Potential Source' },
          { type: 'South Monopole', color: '#1e40af', symbol: '-', desc: 'Negative Potential Source' },
          { type: 'Spark', color: '#fbbf24', symbol: '⚡', desc: 'Radiant Discharge' },
        ];
      case PhysicsModel.QUANTUM:
        return [
          { type: 'Wave Packet', color: '#10b981', symbol: '〰', desc: 'Probabilistic Position' },
          { type: 'Photon', color: '#8b5cf6', symbol: '☀', desc: 'Light Energy' },
        ];
      case PhysicsModel.Q_GRAVITY:
        return [
          { type: 'Mass', color: '#c084fc', symbol: 'M', desc: 'Gravitational Attractor' },
        ];
      default: return [];
    }
  };

  const legend = getLegendItems();

  return (
    <div className="absolute top-24 left-4 pointer-events-none flex flex-col gap-4">
      {/* Stats Block */}
      <div className="bg-slate-900/80 backdrop-blur p-3 rounded-lg border border-slate-700/50 text-[10px] text-slate-400 font-mono w-36 shadow-lg">
        <div className="flex justify-between mb-1">
          <span>FPS:</span>
          <span className="text-cyan-400">{fps.toFixed(0)}</span>
        </div>
        <div className="flex justify-between mb-1">
          <span>Particles:</span>
          <span className="text-amber-400">{particleCount}</span>
        </div>
        <div className="flex justify-between border-t border-slate-800 pt-1 mt-1">
          <span>Sys Energy:</span>
          <span className="text-emerald-400">{(energy || 0).toFixed(1)}k</span>
        </div>
      </div>

      {/* Legend Block */}
      <div className="bg-slate-900/80 backdrop-blur p-3 rounded-lg border border-slate-700/50 pointer-events-auto shadow-lg">
        <h4 className="text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-wider border-b border-slate-800 pb-1">
          Particle Legend
        </h4>
        <div className="space-y-2">
          {legend.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <div 
                className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm shrink-0"
                style={{ backgroundColor: item.color, color: 'rgba(255,255,255,0.9)' }}
              >
                {item.symbol}
              </div>
              <div>
                <div className="text-[11px] font-semibold text-slate-200 leading-none">{item.type}</div>
                <div className="text-[9px] text-slate-400 leading-tight mt-0.5">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HUD;
