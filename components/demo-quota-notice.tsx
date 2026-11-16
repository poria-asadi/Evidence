'use client';

import { useEffect, useState } from 'react';

type Stage = 'titleAbstract' | 'fullText' | 'extraction';
type Usage = {
  plan: 'demo' | 'active' | null;
  demo: Record<Stage, { used: number; limit: number }>;
};

const LABELS: Record<Stage, string> = {
  titleAbstract: 'Title & abstract AI screening',
  fullText: 'Full-text AI screening',
  extraction: 'AI data extraction',
};
const DETAILS: Record<Stage, string> = {
  titleAbstract: 'Screen up to 25 unique records with AI. Rechecking the same record does not use another slot.',
  fullText: 'Screen up to 5 unique article PDFs with AI. Retrying an article already counted does not use another slot.',
  extraction: 'Extract data from 1 unique article. You can repeat extraction for that same article without using a new slot.',
};

export function notifyDemoUsageChanged() {
  window.dispatchEvent(new Event('demo-usage-changed'));
}

export default function DemoQuotaNotice({ stage }: { stage: Stage }) {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      void fetch('/api/account/usage', { cache: 'no-store' })
        .then((response) => response.ok ? response.json() as Promise<Usage> : null)
        .then((value) => { if (mounted && value) setUsage(value); })
        .catch(() => undefined);
    };
    refresh();
    window.addEventListener('demo-usage-changed', refresh);
    return () => { mounted = false; window.removeEventListener('demo-usage-changed', refresh); };
  }, []);

  if (usage?.plan !== 'demo') return null;
  const { used, limit } = usage.demo[stage];
  const displayedUsed = Math.min(Math.max(0, used), limit);
  const remaining = limit - displayedUsed;
  return (
    <section className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-950 shadow-sm" aria-live="polite" aria-label={`${LABELS[stage]} demo limit`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-bold uppercase tracking-wide">Demo version</span>
          <h2 className="mt-2 font-semibold">{LABELS[stage]} allowance</h2>
        </div>
        <p className="text-lg font-bold tabular-nums">{displayedUsed} / {limit} used</p>
      </div>
      <progress aria-label={`${LABELS[stage]} used`} value={displayedUsed} max={limit} className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-amber-200 [&::-moz-progress-bar]:bg-amber-600 [&::-webkit-progress-bar]:bg-amber-200 [&::-webkit-progress-value]:bg-amber-600" />
      <p className="mt-3 leading-6">{DETAILS[stage]} <strong>{remaining} remaining.</strong></p>
      {remaining === 0 && <p className="mt-2 font-medium">Your demo limit is reached for new articles in this step. Previously counted articles can still be reviewed or retried.</p>}
    </section>
  );
}
