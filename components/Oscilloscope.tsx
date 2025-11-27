import React, { useEffect, useRef } from 'react';
import { DataPoint } from '../types';

interface OscilloscopeProps {
  data: DataPoint[];
  color?: string;
  height?: number;
}

const Oscilloscope: React.FC<OscilloscopeProps> = ({ data, color = '#34d399', height = 150 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#020617'; // Slate 950
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();

    if (data.length < 2) return;

    // Draw Waveform
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.shadowBlur = 4;
    ctx.shadowColor = color;

    const maxVoltage = 200; // Scale vertical
    const yBase = canvas.height - 20;

    data.forEach((point, i) => {
      const x = (i / data.length) * canvas.width;
      // Clamp voltage for display
      const v = Math.min(point.voltage, maxVoltage);
      const y = yBase - (v / maxVoltage) * (canvas.height - 40);
      
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw Zero Line
    ctx.strokeStyle = '#475569';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, yBase);
    ctx.lineTo(canvas.width, yBase);
    ctx.stroke();
    ctx.setLineDash([]);

  }, [data, color]);

  return (
    <div className="w-full border border-slate-700 rounded-md overflow-hidden bg-slate-950">
      <canvas 
        ref={canvasRef} 
        width={600} 
        height={height} 
        className="w-full h-full block"
      />
    </div>
  );
};

export default Oscilloscope;