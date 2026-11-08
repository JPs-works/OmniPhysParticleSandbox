import { HelpCircle, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { TOOLS } from '../fieldlab/tools';

const KEYS: [string, string][] = [
  ['Space', 'Pause / resume'],
  ['.', 'Single physics step'],
  ['R', 'Reset experiment to its seed'],
  ['Esc', 'Deselect / stop probing'],
  ['Del', 'Delete selected object'],
  ['Ctrl/⌘ + scroll', 'Zoom (or click the canvas first, then scroll)'],
  ['Pinch', 'Zoom on touch; two fingers pan'],
];

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label="Help and keyboard shortcuts" aria-expanded={open} onClick={() => setOpen(!open)} className={`omni-icon-btn ${open ? 'text-cyan-200' : ''}`} title="Help & shortcuts">
        <HelpCircle size={16} />
      </button>
      {open && (
        <div role="dialog" aria-label="Help" className="omni-scroll absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-[300px] overflow-y-auto rounded-lg border border-white/10 bg-slate-950/95 p-3 text-[12px] text-slate-300 shadow-2xl shadow-black/60 backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Keyboard</span>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-0.5 text-slate-400 hover:bg-white/10" aria-label="Close help">
              <X size={13} />
            </button>
          </div>
          <dl className="space-y-1">
            {KEYS.map(([k, d]) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <dt>
                  <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-px font-mono text-[11px] text-slate-100">{k}</kbd>
                </dt>
                <dd className="text-slate-400">{d}</dd>
              </div>
            ))}
          </dl>
          <div className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Tools</div>
          <dl className="space-y-1.5">
            {TOOLS.map((t) => (
              <div key={t.id}>
                <dt className="flex items-center gap-1.5 text-slate-100">
                  <kbd className="rounded border border-white/15 bg-white/5 px-1 py-px font-mono text-[10.5px]">{t.key}</kbd>
                  {t.label}
                </dt>
                <dd className="text-[11.5px] text-slate-400">{t.hint}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            Physics: the non-relativistic Lorentz force F = q(E + v×B) is integrated with a phase-corrected Boris pusher at a fixed time step, in a Web Worker. Pairwise forces use Plummer softening and a Barnes–Hut tree. Charge-to-mass ratios are real; lengths and times are
            scaled.
          </p>
        </div>
      )}
    </div>
  );
}
