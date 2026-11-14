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
  const remaining = Math.max(0, limit - used);
  return (
    <div className="mb-5 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm" aria-live="polite">
      <p className="font-semibold text-foreground">{LABELS[stage]} · demo allowance</p>
      <p className="mt-1 text-muted-foreground">
        {used} of {limit} unique {stage === 'fullText' ? 'PDFs' : 'articles'} used · {remaining} remaining.
        {remaining === 0 && ' You can review or retry the same articles. New AI articles require paid access; credit top-ups are not available yet.'}
      </p>
    </div>
  );
}
