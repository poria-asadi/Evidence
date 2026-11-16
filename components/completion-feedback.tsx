'use client';

import { CheckCircle2, ArrowRight, X } from 'lucide-react';

export default function CompletionFeedback({
  message,
  resultId,
  canContinue,
  onClose,
}: {
  message: string;
  resultId: string;
  canContinue: boolean;
  onClose: () => void;
}) {
  if (!message) return null;

  function viewResults() {
    document.getElementById(resultId)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'start',
    });
    onClose();
  }

  return (
    <aside
      aria-live="polite"
      className="fixed inset-x-4 top-4 z-[110] mx-auto max-w-lg rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 shadow-2xl sm:right-5 sm:left-auto sm:mx-0"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2
          className="mt-0.5 size-5 shrink-0 text-emerald-700"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">AI work complete</p>
          <p className="mt-1 text-sm leading-6">{message}</p>
          <p className="mt-1 text-sm leading-6 text-emerald-800">
            {canContinue
              ? 'You can review the results now or continue to the next step.'
              : 'The results are ready for you to review.'}
          </p>
          <button
            type="button"
            onClick={viewResults}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-900 hover:underline"
          >
            View results <ArrowRight className="size-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss completion message"
          className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-emerald-100"
        >
          <X className="size-4" />
        </button>
      </div>
    </aside>
  );
}
