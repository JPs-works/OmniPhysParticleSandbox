import { useEffect, useState } from 'react';

type Katex = typeof import('katex').default;

// KaTeX (and its CSS + fonts) is loaded on first use, so it stays out of the initial bundle.
let katex: Katex | null = null;
let loading: Promise<Katex> | null = null;
const loadKatex = () =>
  (loading ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => {
    katex = m.default;
    return katex;
  }));

export function Tex({ tex, block = false, className = '' }: { tex: string; block?: boolean; className?: string }) {
  const [k, setK] = useState<Katex | null>(katex);
  useEffect(() => {
    if (!k) loadKatex().then((m) => setK(() => m));
  }, [k]);
  if (!k) return <span className={`font-mono text-[0.85em] text-slate-400 ${className}`}>{tex.replace(/\\(dfrac|tfrac|frac|mathbf|mathrm|text|quad|qquad|,|;)/g, ' ').replace(/[{}\\]/g, '')}</span>;
  const html = k.renderToString(tex, { throwOnError: false, displayMode: block, output: 'html' });
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
