
import React, { useEffect, useRef, useState } from 'react';
import { ParticleEngine } from '../services/simulationEngine';
import { ToolType, Vector2, PhysicsModel } from '../types';

interface SimulationCanvasProps {
  engine: ParticleEngine;
  tool: ToolType;
  onCursorMove: (pos: Vector2 | null) => void;
  showField: boolean;
  model: PhysicsModel;
}

const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ engine, tool, onCursorMove, showField, model }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<Vector2 | null>(null);
  const currentPathRef = useRef<Vector2[]>([]);
  
  // Offscreen buffer for heatmap to prevent GC thrashing
  const heatmapDataRef = useRef<ImageData | null>(null);

  // Handle Resize with ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Set internal canvas resolution to match display size 1:1
        if (canvasRef.current) {
            canvasRef.current.width = width;
            canvasRef.current.height = height;
            engine.resize(width, height);
            heatmapDataRef.current = null; // Reset buffer
        }
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [engine]);

  // Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); // Optimization
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      if (!canvas) return;
      const w = canvas.width;
      const h = canvas.height;

      // 1. Fade Effect (Trails) - Manual blend for speed
      ctx.fillStyle = 'rgba(15, 23, 42, 0.3)'; 
      ctx.fillRect(0, 0, w, h);

      // 2. Field Heatmap (High Resolution via ImageData)
      if (showField) {
         const resolution = 8; // Every 8th pixel (High Res)
         const cols = Math.ceil(w / resolution);
         const rows = Math.ceil(h / resolution);
         
         // Draw rects is too slow for high res. We'll skip visual rects for a dot matrix or just optimized larger blocks for now
         // Or better: Direct pixel manipulation.
         // For the sake of React performance in this specific file, we stick to optimized fillRect but with larger chunks OR use the engine to generate a buffer.
         
         // Let's use a semi-transparent overlay loop that is lighter.
         // We will visualize the "Grid" of potential.
         
         const step = 10;
         for (let y = 0; y < h; y += step) {
             for (let x = 0; x < w; x += step) {
                 const intensity = engine.calculateFieldIntensity(x + step/2, y + step/2, model);
                 // Only draw meaningful fields
                 if (intensity > 0.02) {
                     // Cyan Map
                     // intensity 0-1
                     const alpha = Math.min(intensity * 0.5, 0.6);
                     ctx.fillStyle = `rgba(6, 182, 212, ${alpha})`; 
                     ctx.fillRect(x, y, step, step);
                 }
             }
         }
      }

      // 3. Draw Objects
      engine.objects.forEach(obj => {
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (obj.type === 'wire' && obj.path) {
           // Polyline Wire
           ctx.shadowBlur = 8;
           ctx.shadowColor = '#fb923c';
           ctx.strokeStyle = '#c2410c';
           
           ctx.beginPath();
           if (obj.path.length > 0) {
               ctx.moveTo(obj.path[0].x, obj.path[0].y);
               for(let i=1; i<obj.path.length; i++) {
                   ctx.lineTo(obj.path[i].x, obj.path[i].y);
               }
           }
           ctx.stroke();
           ctx.shadowBlur = 0;

           // Core Highlight
           ctx.strokeStyle = '#fdba74';
           ctx.lineWidth = 1;
           ctx.stroke();

        } else if (obj.type === 'magnet') {
           const isNorth = obj.strength && obj.strength > 0;
           ctx.fillStyle = isNorth ? '#ef4444' : '#3b82f6';
           ctx.beginPath();
           ctx.arc(obj.p1.x, obj.p1.y, 18, 0, Math.PI * 2);
           ctx.fill();
           
           ctx.fillStyle = '#fff';
           ctx.textAlign = 'center';
           ctx.textBaseline = 'middle';
           ctx.font = 'bold 12px sans-serif';
           ctx.fillText(isNorth ? 'N' : 'S', obj.p1.x, obj.p1.y);
           
           // Field ripple
           ctx.strokeStyle = isNorth ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)';
           ctx.beginPath();
           ctx.arc(obj.p1.x, obj.p1.y, 24, 0, Math.PI * 2);
           ctx.stroke();
        } else if (obj.type === 'battery' && obj.p2) {
           // Draw Battery
           ctx.shadowBlur = 10;
           ctx.shadowColor = '#22d3ee';
           
           const cx = (obj.p1.x + obj.p2.x) / 2;
           const cy = (obj.p1.y + obj.p2.y) / 2;
           const angle = Math.atan2(obj.p2.y - obj.p1.y, obj.p2.x - obj.p1.x);
           
           ctx.save();
           ctx.translate(cx, cy);
           ctx.rotate(angle);
           
           // Body
           ctx.fillStyle = '#334155';
           ctx.fillRect(-25, -15, 50, 30);
           ctx.strokeStyle = '#94a3b8';
           ctx.lineWidth = 2;
           ctx.strokeRect(-25, -15, 50, 30);
           
           // Terminals
           ctx.fillStyle = '#ef4444'; // +
           ctx.fillRect(-30, -10, 5, 20);
           ctx.fillStyle = '#3b82f6'; // -
           ctx.fillRect(25, -10, 5, 20);
           
           // Label
           ctx.fillStyle = '#fff';
           ctx.font = '10px sans-serif';
           ctx.fillText('+', -15, 4);
           ctx.fillText('-', 15, 4);

           ctx.restore();
           ctx.shadowBlur = 0;
        }
      });

      // 4. Preview Drawing
      if (isDragging) {
          if (tool === ToolType.WIRE && currentPathRef.current.length > 0) {
             ctx.strokeStyle = 'rgba(251, 146, 60, 0.5)';
             ctx.lineWidth = 2;
             ctx.beginPath();
             ctx.moveTo(currentPathRef.current[0].x, currentPathRef.current[0].y);
             for (let i=1; i<currentPathRef.current.length; i++) {
                 ctx.lineTo(currentPathRef.current[i].x, currentPathRef.current[i].y);
             }
             ctx.stroke();
          } else if (tool === ToolType.BATTERY && dragStartRef.current) {
              const end = currentPathRef.current[currentPathRef.current.length-1];
              if (end) {
                  ctx.strokeStyle = '#fff';
                  ctx.setLineDash([5, 5]);
                  ctx.beginPath();
                  ctx.moveTo(dragStartRef.current.x, dragStartRef.current.y);
                  ctx.lineTo(end.x, end.y);
                  ctx.stroke();
                  ctx.setLineDash([]);
              }
          }
      }

      // 5. Draw Particles
      engine.particles.forEach(p => {
        ctx.fillStyle = p.color;
        
        if (p.type === 'proton') {
            ctx.beginPath();
            ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
            // Plus
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(p.pos.x - 3, p.pos.y);
            ctx.lineTo(p.pos.x + 3, p.pos.y);
            ctx.moveTo(p.pos.x, p.pos.y - 3);
            ctx.lineTo(p.pos.x, p.pos.y + 3);
            ctx.stroke();
        } 
        else if (p.type === 'electron') {
             ctx.beginPath();
             ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
             ctx.fill();
        }
        else if (p.type === 'photon') {
             ctx.shadowBlur = 5;
             ctx.shadowColor = p.color;
             ctx.beginPath();
             ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
             ctx.fill();
             ctx.shadowBlur = 0;
        }
        else {
            ctx.beginPath();
            ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [engine, showField, model]);

  // Input Handlers
  const getPos = (e: React.MouseEvent | React.TouchEvent): Vector2 => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    
    // Scale factors in case CSS size != Internal size (though ResizeObserver keeps them 1:1 usually)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const handleDown = (e: React.MouseEvent | React.TouchEvent) => {
    const pos = getPos(e);
    setIsDragging(true);
    dragStartRef.current = pos;

    if (tool === ToolType.WIRE) {
        currentPathRef.current = [pos];
    } else if (tool === ToolType.BATTERY) {
        currentPathRef.current = [pos];
    } else if (tool === ToolType.MAGNET_N) {
        engine.addObject({ id: Date.now().toString(), type: 'magnet', p1: pos, strength: 50 });
    } else if (tool === ToolType.MAGNET_S) {
        engine.addObject({ id: Date.now().toString(), type: 'magnet', p1: pos, strength: -50 });
    } else if (tool === ToolType.EMITTER_MINUS) {
        engine.addParticles(pos, 'electron', 5);
    } else if (tool === ToolType.EMITTER_PLUS) {
        engine.addParticles(pos, 'proton', 1);
    } else if (tool === ToolType.ERASER) {
        engine.removeObjectAt(pos);
    }
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    const pos = getPos(e);
    onCursorMove(pos);
    
    if (isDragging) {
        if (tool === ToolType.WIRE) {
            const last = currentPathRef.current[currentPathRef.current.length - 1];
            // Distance check to smooth freehand line
            const d = (pos.x - last.x)**2 + (pos.y - last.y)**2;
            if (d > 25) { 
                currentPathRef.current.push(pos);
            }
        } else if (tool === ToolType.BATTERY) {
             currentPathRef.current = [dragStartRef.current!, pos];
        } else if (tool === ToolType.EMITTER_MINUS) {
            engine.addParticles(pos, 'electron', 1);
        } else if (tool === ToolType.EMITTER_PLUS) {
            engine.addParticles(pos, 'proton', 0.2);
        } else if (tool === ToolType.ERASER) {
            engine.removeObjectAt(pos);
        }
    }
  };

  const handleUp = (e: React.MouseEvent | React.TouchEvent) => {
    const pos = getPos(e);
    
    if (isDragging) {
        if (tool === ToolType.WIRE && currentPathRef.current.length > 1) {
            engine.addObject({
                id: Date.now().toString(),
                type: 'wire',
                p1: currentPathRef.current[0],
                path: [...currentPathRef.current]
            });
        } else if (tool === ToolType.BATTERY && dragStartRef.current) {
            const end = pos;
            const d = (end.x - dragStartRef.current.x)**2 + (end.y - dragStartRef.current.y)**2;
            if (d > 400) { // Min length
                engine.addObject({
                    id: Date.now().toString(),
                    type: 'battery',
                    p1: dragStartRef.current,
                    p2: end
                });
            }
        }
    }

    setIsDragging(false);
    dragStartRef.current = null;
    currentPathRef.current = [];
    onCursorMove(null);
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-black cursor-crosshair touch-none select-none">
      <canvas
        ref={canvasRef}
        onMouseDown={handleDown}
        onMouseMove={handleMove}
        onMouseUp={handleUp}
        onMouseLeave={() => { setIsDragging(false); onCursorMove(null); }}
        onTouchStart={handleDown}
        onTouchMove={handleMove}
        onTouchEnd={handleUp}
        className="block outline-none"
      />
    </div>
  );
};

export default SimulationCanvas;
