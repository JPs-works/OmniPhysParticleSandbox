import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function Section({ title, children, defaultOpen = true, right }: { title: string; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-white/5 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400 hover:text-slate-200">
          <ChevronDown size={12} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
          {title}
        </button>
        {right}
      </div>
      {open && <div className="mt-2 space-y-2">{children}</div>}
    </section>
  );
}

const fmt = (v: number) => {
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1000) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 0.1) return v.toFixed(2);
  return v.toPrecision(2);
};

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit,
  hint,
  format = fmt,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
  hint?: string;
  format?: (v: number) => string;
}) {
  const id = useId();
  return (
    <div title={hint}>
      <div className="mb-0.5 flex items-baseline justify-between text-[11.5px]">
        <label htmlFor={id} className="text-slate-300">
          {label}
        </label>
        <span className="font-mono tabular-nums text-cyan-200">
          {format(value)}
          {unit && <span className="ml-0.5 text-slate-400">{unit}</span>}
        </span>
      </div>
      <input id={id} type="range" className="omni-range w-full" min={min} max={max} step={step ?? (max - min) / 200} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  );
}

/** Magnitude on a log scale with an optional sign toggle. */
export function LogSlider({
  label,
  value,
  minExp,
  maxExp,
  onChange,
  signed = false,
  signLabels = ['−', '+'],
  unit,
  hint,
}: {
  label: ReactNode;
  value: number;
  minExp: number;
  maxExp: number;
  onChange: (v: number) => void;
  signed?: boolean;
  signLabels?: [string, string];
  unit?: string;
  hint?: string;
}) {
  const id = useId();
  const sign = value < 0 ? -1 : 1;
  const mag = Math.max(Math.abs(value), 10 ** minExp);
  const exp = Math.log10(mag);
  return (
    <div title={hint}>
      <div className="mb-0.5 flex items-baseline justify-between gap-2 text-[11.5px]">
        <label htmlFor={id} className="text-slate-300">
          {label}
        </label>
        <span className="flex items-center gap-1.5">
          {signed && (
            <span className="inline-flex overflow-hidden rounded border border-white/10 text-[10.5px]">
              {[-1, 1].map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => onChange(s * mag)}
                  className={`px-1.5 py-px ${sign === s ? 'bg-cyan-400/20 text-cyan-100' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {signLabels[s < 0 ? 0 : 1]}
                </button>
              ))}
            </span>
          )}
          <span className="font-mono tabular-nums text-cyan-200">
            {fmt(Math.abs(value))}
            {unit && <span className="ml-0.5 text-slate-400">{unit}</span>}
          </span>
        </span>
      </div>
      <input
        id={id}
        type="range"
        className="omni-range w-full"
        min={minExp}
        max={maxExp}
        step={(maxExp - minExp) / 300}
        value={exp}
        onChange={(e) => {
          const m = 10 ** parseFloat(e.target.value);
          const r = Number(m.toPrecision(3));
          onChange(sign * r);
        }}
      />
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-[11.5px] text-slate-300" title={hint}>
      <span>{label}</span>
      <span className="relative inline-flex">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-4 w-7 rounded-full bg-slate-700 transition-colors peer-checked:bg-cyan-500/70 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-300" />
        <span className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-slate-200 transition-transform peer-checked:translate-x-3" />
      </span>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = 'sm' }: { value: T; options: { v: T; label: ReactNode; hint?: string }[]; onChange: (v: T) => void; size?: 'sm' | 'xs' }) {
  return (
    <div className="inline-flex w-full overflow-hidden rounded-md border border-white/10 bg-black/20">
      {options.map((o) => (
        <button
          type="button"
          key={o.v}
          title={o.hint}
          onClick={() => onChange(o.v)}
          className={`flex-1 px-1.5 ${size === 'xs' ? 'py-0.5 text-[10.5px]' : 'py-1 text-[11.5px]'} transition-colors ${value === o.v ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({ children, onClick, hint, variant = 'default', className = '' }: { children: ReactNode; onClick: () => void; hint?: string; variant?: 'default' | 'danger' | 'primary'; className?: string }) {
  const v =
    variant === 'danger'
      ? 'border-rose-400/30 text-rose-200 hover:bg-rose-500/15'
      : variant === 'primary'
        ? 'border-cyan-300/40 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20'
        : 'border-white/10 text-slate-200 hover:bg-white/5';
  return (
    <button type="button" title={hint} onClick={onClick} className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] transition-colors ${v} ${className}`}>
      {children}
    </button>
  );
}
