import { Atom, Orbit } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { FieldLab } from './fieldlab/FieldLab';

// The Particle Zoo is a separate chunk, fetched when idle after the Field Lab is up (or on first visit).
const loadZoo = () => import('./zoo/ParticleZoo').then((m) => ({ default: m.ParticleZoo }));
const ParticleZoo = lazy(loadZoo);

export type Mode = 'field-lab' | 'particle-zoo';

export default function App() {
  const [mode, setMode] = useState<Mode>('field-lab');
  const [gunRequest, setGunRequest] = useState<{ sp: string; n: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [zooMounted, setZooMounted] = useState(false);

  const markReady = useCallback(() => {
    if (rootRef.current) rootRef.current.dataset.ready = '1';
  }, []);

  useEffect(() => {
    if (mode === 'particle-zoo') setZooMounted(true);
  }, [mode]);
  useEffect(() => {
    const t = setTimeout(() => void loadZoo(), 2500);
    return () => clearTimeout(t);
  }, []);

  const tabs = (
    <div className="flex items-center gap-1" role="tablist" aria-label="Mode">
      <span className="mr-1 hidden items-center gap-1.5 pl-1 text-[13px] font-semibold tracking-tight text-white sm:flex">
        <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300 to-violet-500 shadow-[0_0_12px_rgba(103,232,249,0.6)]">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
        </span>
        OmniPhys
      </span>
      {(
        [
          ['field-lab', 'Field Lab', Orbit],
          ['particle-zoo', 'Particle Zoo', Atom],
        ] as const
      ).map(([id, label, Icon]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={mode === id}
          aria-label={label}
          title={label}
          data-testid={`tab-${id}`}
          onClick={() => setMode(id)}
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium transition-colors ${mode === id ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
        >
          <Icon size={14} className={mode === id ? 'text-cyan-300' : ''} />
          <span className="max-[420px]:hidden">{label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div ref={rootRef} id="omniphys" data-mode={mode} data-ready="0" data-particles="0" className="h-full w-full overflow-hidden bg-[#04060c] text-slate-200">
      <div className={mode === 'field-lab' ? 'h-full' : 'hidden'}>
        <FieldLab tabs={tabs} active={mode === 'field-lab'} rootRef={rootRef} onReady={markReady} gunRequest={gunRequest} />
      </div>
      <div className={mode === 'particle-zoo' ? 'h-full' : 'hidden'}>
        {zooMounted && (
          <Suspense
            fallback={
              <div className="flex h-full flex-col">
                <header className="flex h-11 shrink-0 items-center gap-2 border-b border-white/10 bg-[#060810]/95 px-2">{tabs}</header>
                <div className="flex flex-1 items-center justify-center text-[12px] text-slate-400">Loading the Particle Zoo…</div>
              </div>
            }
          >
            <ParticleZoo
              tabs={tabs}
              active={mode === 'particle-zoo'}
              onReady={markReady}
              onSendToLab={(sp) => {
                setGunRequest((g) => ({ sp, n: (g?.n ?? 0) + 1 }));
                setMode('field-lab');
              }}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
