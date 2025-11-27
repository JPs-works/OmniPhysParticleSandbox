
import React from 'react';
import { PhysicsModel } from '../types';

interface Props {
  model: PhysicsModel;
}

const ModelContextPanel: React.FC<Props> = ({ model }) => {
  
  const getContent = () => {
    switch (model) {
      case PhysicsModel.STANDARD:
        return {
          title: "Standard Model",
          desc: "Simulates classical electrostatics (Coulomb's Law). Red protons (+) and Blue electrons (-) interact via inverse-square forces. Use the Emitter tools to create atoms or charge clouds.",
          points: [
            "Protons (+): Heavy, Repel each other.",
            "Electrons (-): Light, Orbit protons.",
            "F = k * q1*q2 / r²"
          ]
        };
      case PhysicsModel.BEDINI:
        return {
          title: "Bedini Open System",
          desc: "Visualizes the 'Radiant Energy' theory where the vacuum acts as an active dipole sea. Rapid changes in magnetic fields or resistance collisions invoke energy spikes from the environment.",
          points: [
            "Vacuum is active (Red/Blue dipoles).",
            "Negative Resistance: Field opposition adds velocity.",
            "Spikes: Sudden acceleration events."
          ]
        };
      case PhysicsModel.QUANTUM:
        return {
          title: "Quantum Mechanics",
          desc: "Particles are treated as probabilistic wave packets. They exhibit 'Uncertainty' (jitter) and 'Tunneling', allowing them to occasionally pass through solid wire barriers.",
          points: [
            "Uncertainty Principle: Random position fluctuation.",
            "Tunneling: Non-zero probability to pass barriers.",
            "Wave Interference drift."
          ]
        };
      case PhysicsModel.Q_GRAVITY:
        return {
          title: "Quantum Gravity",
          desc: "Visualizes the attractive force of mass on the fabric of space. All particles attract each other based on mass. Use the (+) Emitter to place heavy gravitational anchors.",
          points: [
            "F = G * m1*m2 / r²",
            "Mass clumps together.",
            "Orbit formation."
          ]
        };
      default:
        return { title: "Physics Sandbox", desc: "Select a model to begin.", points: [] };
    }
  };

  const content = getContent();

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 backdrop-blur-sm">
      <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_cyan]"></span>
        {content.title}
      </h3>
      <p className="text-xs text-slate-300 leading-relaxed mb-3">
        {content.desc}
      </p>
      <div className="flex flex-wrap gap-2">
        {content.points.map((p, i) => (
          <span key={i} className="text-[10px] bg-slate-900/60 text-slate-400 px-2 py-1 rounded border border-slate-700/50">
            {p}
          </span>
        ))}
      </div>
    </div>
  );
};

export default ModelContextPanel;
