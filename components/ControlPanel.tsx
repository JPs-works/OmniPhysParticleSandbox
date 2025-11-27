import React from 'react';
import { PhysicsModel, SimulationParams, ToolType } from '../types';

interface ControlPanelProps {
  params: SimulationParams;
  setParams: React.Dispatch<React.SetStateAction<SimulationParams>>;
  selectedModel: PhysicsModel;
  setSelectedModel: (m: PhysicsModel) => void;
  activeTool: ToolType;
  setActiveTool: (t: ToolType) => void;
  resetSimulation: () => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  params,
  setParams,
  selectedModel,
  setSelectedModel,
  activeTool,
  setActiveTool,
  resetSimulation
}) => {
  
  const tools = [
    { id: ToolType.CURSOR, icon: '👆', label: 'Interact', desc: 'Push/Pull particles' },
    { id: ToolType.WIRE, icon: '〰️', label: 'Wire', desc: 'Draw conductive path' },
    { id: ToolType.BATTERY, icon: '🔋', label: 'Battery', desc: 'DC Power Source' },
    { id: ToolType.MAGNET_N, icon: 'N', label: 'Magnet N', desc: 'North Pole' },
    { id: ToolType.MAGNET_S, icon: 'S', label: 'Magnet S', desc: 'South Pole' },
    { id: ToolType.EMITTER_MINUS, icon: '🔵', label: 'Emit (-)', desc: 'Electron / Light' },
    { id: ToolType.EMITTER_PLUS, icon: '🔴', label: 'Emit (+)', desc: 'Proton / Heavy' },
    { id: ToolType.ERASER, icon: '❌', label: 'Eraser', desc: 'Remove objects' },
  ];

  return (
    <div className="bg-slate-800/90 backdrop-blur p-4 rounded-xl shadow-xl border border-slate-700 flex flex-col gap-4 h-full overflow-y-auto">
      
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Physics Model</h2>
        <select 
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value as PhysicsModel)}
          className="w-full bg-slate-900 border border-slate-600 text-white text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block p-2.5"
        >
          {Object.values(PhysicsModel).sort().map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Toolbox</h2>
        <div className="grid grid-cols-2 gap-2">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              title={tool.desc}
              className={`flex flex-row items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                activeTool === tool.id 
                  ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)]' 
                  : 'bg-slate-700 border-transparent text-slate-400 hover:bg-slate-600 hover:text-slate-200'
              }`}
            >
              <span className="text-xl">{tool.icon}</span>
              <span className="text-[11px] font-medium text-left leading-tight">{tool.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto pt-2 border-t border-slate-700">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Simulation Control</h2>
        
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setParams(p => ({ ...p, paused: !p.paused }))}
            className={`flex-1 py-2 px-3 rounded-lg font-bold text-sm transition-colors ${
              !params.paused 
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' 
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
            }`}
          >
            {!params.paused ? '⏸ Pause' : '▶ Play'}
          </button>
          <button
             onClick={resetSimulation}
             title="Reset Simulation"
             className="px-3 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 border border-slate-600"
          >
            ↺
          </button>
        </div>

        <div className="space-y-3">
           {/* Field Toggle */}
           <div className="flex items-center justify-between">
              <label className="text-[10px] text-slate-300 uppercase">Show Field Map</label>
              <button 
                onClick={() => setParams(p => ({ ...p, showField: !p.showField }))}
                className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors ${params.showField ? 'bg-cyan-600' : 'bg-slate-700'}`}
              >
                <div className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform ${params.showField ? 'translate-x-5' : ''}`}></div>
              </button>
           </div>

           {/* Magnet Power */}
           <div>
             <div className="flex justify-between mb-1">
               <label className="text-[10px] text-slate-300 uppercase">Magnet Power</label>
               <span className="text-[10px] font-mono text-cyan-400">{params.magnetPower.toFixed(1)}x</span>
             </div>
             <input
               type="range"
               min="0.1"
               max="5.0"
               step="0.1"
               value={params.magnetPower}
               onChange={(e) => setParams({ ...params, magnetPower: parseFloat(e.target.value) })}
               className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
             />
           </div>

           <div>
             <div className="flex justify-between mb-1">
               <label className="text-[10px] text-slate-300 uppercase">Time Scale</label>
               <span className="text-[10px] font-mono text-cyan-400">{params.speed.toFixed(1)}x</span>
             </div>
             <input
               type="range"
               min="0.1"
               max="3.0"
               step="0.1"
               value={params.speed}
               onChange={(e) => setParams({ ...params, speed: parseFloat(e.target.value) })}
               className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
             />
           </div>
           
           <div>
             <div className="flex justify-between mb-1">
               <label className="text-[10px] text-slate-300 uppercase">Viscosity</label>
               <span className="text-[10px] font-mono text-cyan-400">{(params.viscosity * 100).toFixed(0)}%</span>
             </div>
             <input
               type="range"
               min="0.01"
               max="0.2"
               step="0.01"
               value={params.viscosity}
               onChange={(e) => setParams({ ...params, viscosity: parseFloat(e.target.value) })}
               className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
             />
           </div>
        </div>
      </div>

    </div>
  );
};

export default ControlPanel;
