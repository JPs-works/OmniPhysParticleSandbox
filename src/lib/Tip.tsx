import type { ReactNode } from 'react';

type Side = 'right' | 'bottom' | 'left' | 'top';

const pos: Record<Side, string> = {
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
};

/** Hover/focus tooltip. Pure CSS so it works without layout measurement. */
export function Tip({ label, hint, side = 'bottom', children, className = '' }: { label: string; hint?: string; side?: Side; children: ReactNode; className?: string }) {
  return (
    <span className={`group/tip relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 ${pos[side]} w-max max-w-[220px] rounded-md border border-white/10 bg-slate-950/95 px-2 py-1 text-[11px] leading-snug text-slate-200 opacity-0 shadow-xl shadow-black/50 transition-opacity delay-150 duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100`}
      >
        <span className="font-medium text-white">{label}</span>
        {hint && <span className="block text-slate-400">{hint}</span>}
      </span>
    </span>
  );
}
