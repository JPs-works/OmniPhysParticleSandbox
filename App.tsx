import React, { useState, useEffect, useRef } from 'react';
import { PhysicsModel, SimulationParams, ToolType, Vector2 } from './types';
import { ParticleEngine } from './services/simulationEngine';
import SimulationCanvas from './components/SSGCanvas';
import ControlPanel from './components/ControlPanel';
import ModelContextPanel from './components/ModelContextPanel';
import HUD from './components/HUD';

const App: React.FC = () => {
  // --- State ---
  const [selectedModel, setSelectedModel] = useState<PhysicsModel>(PhysicsModel.Q_GRAVITY);
  const [activeTool, setActiveTool] = useState<ToolType>(ToolType.CURSOR);
  const [params, setParams] = useState<SimulationParams>({
    speed: 1.0,
    paused: false,
    gravity: false,
    viscosity: 0.05,
    showField: false,
    magnetPower: 1.0
  });
  const [stats, setStats] = useState({ count: 0, fps: 0, energy: 0 });

  // Refs
  const engineRef = useRef<ParticleEngine | null>(null);
  // Initialize engine once
  if (!engineRef.current) {
    engineRef.current = new ParticleEngine(window.innerWidth, window.innerHeight);
  }
  const engine = engineRef.current;

  // Cursor state for physics interaction
  const cursorRef = useRef<Vector2 | null>(null);
  
  // Stats Loop
  useEffect(() => {
      const interval = setInterval(() => {
          if (engine) {
              const s = engine.getStats();
              setStats({ count: s.count, fps: 60, energy: s.energy }); // Mocking FPS for now
          }
      }, 500);
      return () => clearInterval(interval);
  }, [engine]);

  // Physics Loop
  useEffect(() => {
    let requestID: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1); // Cap dt
      lastTime = time;

      // Update Engine
      engine.update(dt, params, selectedModel, cursorRef.current, activeTool === ToolType.CURSOR);
      
      requestID = requestAnimationFrame(loop);
    };

    requestID = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestID);
  }, [params, selectedModel, activeTool, engine]);

  // Model Change Handler
  useEffect(() => {
    engine.resetAether(selectedModel);
  }, [selectedModel, engine]);

  const handleReset = () => {
    engine.resetAether(selectedModel);
  };

  const handleCursorMove = (pos: Vector2 | null) => {
    cursorRef.current = pos;
  };

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-200 flex flex-col overflow-hidden font-sans">
      
      {/* Canvas Layer (Absolute background) */}
      <div className="absolute inset-0 z-0">
        <SimulationCanvas 
            engine={engine} 
            tool={activeTool}
            onCursorMove={handleCursorMove}
            showField={params.showField}
            model={selectedModel}
        />
      </div>

      {/* UI Overlay Layer */}
      <div className="relative z-10 pointer-events-none flex flex-col h-full p-4">
        
        {/* Header */}
        <header className="flex justify-between items-start mb-4 pointer-events-auto">
          <div className="bg-slate-900/80 backdrop-blur px-4 py-3 rounded-xl border border-slate-800 shadow-lg">
            <h1 className="text-lg font-bold text-white tracking-tight">OmniPhys <span className="font-normal text-slate-400 text-sm">| Sandbox</span></h1>
          </div>
          
          <div className="w-64 flex flex-col gap-4">
              <ModelContextPanel model={selectedModel} />
              
              <div className="bg-slate-900/50 backdrop-blur p-4 rounded-xl border border-slate-800 text-slate-400 text-xs">
                <p className="font-bold text-cyan-400 mb-1">Tool Tips:</p>
                <ul className="flex flex-col gap-2">
                    <li className="flex items-center gap-2"><span>〰️</span> <span><strong>Wire:</strong> Draw freehand conductive paths. Particles stick to skin.</span></li>
                    <li className="flex items-center gap-2"><span>🔋</span> <span><strong>Battery:</strong> Click & Drag to create voltage. + attracts -, - attracts +.</span></li>
                    <li className="flex items-center gap-2"><span>🧲</span> <span><strong>Magnet:</strong> Adjust power in panel.</span></li>
                    <li className="flex items-center gap-2"><span>👆</span> <span><strong>Interact:</strong> Disturbs the field.</span></li>
                </ul>
              </div>
          </div>
        </header>

        {/* Heads Up Display (Left) */}
        <HUD model={selectedModel} particleCount={stats.count} fps={stats.fps} energy={stats.energy} />

        {/* Main Content Area (Empty center for viewing) */}
        <div className="flex-1"></div>

        {/* Footer / Controls */}
        <div className="flex gap-4 items-end pointer-events-auto">
            <div className="w-72">
                <ControlPanel 
                    params={params}
                    setParams={setParams}
                    selectedModel={selectedModel}
                    setSelectedModel={setSelectedModel}
                    activeTool={activeTool}
                    setActiveTool={setActiveTool}
                    resetSimulation={handleReset}
                />
            </div>
        </div>
      </div>
    </div>
  );
};

export default App;