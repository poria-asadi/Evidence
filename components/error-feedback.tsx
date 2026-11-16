'use client';

import { useEffect } from 'react';
import { AlertTriangle, LocateFixed, X } from 'lucide-react';

function findTarget(target: string | null | undefined) {
  if (!target || typeof document === 'undefined') return null;
  return (
    Array.from(document.querySelectorAll<HTMLElement>('[data-error-target]'))
      .filter((element) => element.dataset.errorTarget === target)
      .at(-1) ?? null
  );
}

function showTarget(
  target: string | null | undefined,
  fallbackTarget?: string,
) {
  const element = findTarget(target) ?? findTarget(fallbackTarget);
  if (!element) return;
  let details = element.closest('details');
  while (details) {
    details.open = true;
    details = details.parentElement?.closest('details') ?? null;
  }
  element.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
    block: 'center',
  });
  if (element.matches('input, textarea, select'))
    element.focus({ preventScroll: true });
}

function guidanceFor(message: string) {
  const value = message.toLowerCase();
  if (/save your protocol first/.test(value))
    return 'Complete and save the protocol, then open this step again.';
  if (/import references first/.test(value))
    return 'Open Import & deduplicate and add references before screening.';
  if (/finish title and abstract screening/.test(value))
    return 'Open Title and Abstract Screening, finish the decisions, then continue to full-text screening.';
  if (/passwords do not match/.test(value))
    return 'Enter the same password in both password fields, then try again.';
  if (/incorrect code|code expired|verification code/.test(value))
    return 'Check the code in your latest email. If it expired, request a new code.';
  if (/reset link/.test(value))
    return 'Return to Forgot password? and request a new email link.';
  if (/too many attempts/.test(value))
    return 'Wait for the time shown in the message before trying again.';
  if (/ocr|readable text|searchable pdf|text layer|scanned|pdf could not be read/.test(value))
    return 'Try another copy of the article’s PDF, then upload it again.';
  if (/mb|file limit|too large/.test(value))
    return 'Choose a smaller file that fits the stated size limit, then retry.';
  if (/pdf|file type|must be pdf/.test(value))
    return 'Check the selected file and upload a valid PDF for this article.';
  if (
    /required|fill out|give every column|unique name|column needs/.test(value)
  )
    return 'Fill or correct the highlighted field, then try again.';
  if (/demo includes one review/.test(value))
    return 'Open workspace navigation and continue the review already saved to your account.';
  if (/demo|quota|credits|plan/.test(value))
    return 'Continue the review available in your workspace or check your plan and usage.';
  if (/sign in|session|unauthorized/.test(value))
    return 'Sign in again, then retry the action.';
  if (/network|connection|fetch|could not load|timed out|timeout/.test(value))
    return 'Check your connection, then retry. Your previously saved work is still available.';
  return 'Check the highlighted area and try the action again. If it keeps failing, review the item or file you selected.';
}

export default function ErrorFeedback({
  message,
  target,
  fallbackTarget,
  onClose,
}: {
  message: string;
  target?: string | null;
  fallbackTarget?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const frame = requestAnimationFrame(() => {
      const element = findTarget(target) ?? findTarget(fallbackTarget);
      if (element) {
        element.dataset.errorHighlight = 'true';
        showTarget(target, fallbackTarget);
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      const element = findTarget(target) ?? findTarget(fallbackTarget);
      if (element) delete element.dataset.errorHighlight;
    };
  }, [message, target, fallbackTarget]);

  if (!message) return null;
  return (
    <aside
      role="alert"
      className="fixed inset-x-4 top-4 z-[120] mx-auto max-h-[min(70dvh,32rem)] max-w-lg overflow-y-auto rounded-2xl border border-destructive/40 bg-card p-4 text-foreground shadow-2xl sm:right-5 sm:left-auto sm:mx-0"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="mt-0.5 size-5 shrink-0 text-destructive"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-destructive">
            Action needs attention
          </p>
          <p className="mt-1 text-sm leading-6 break-words">{message}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {guidanceFor(message)}
          </p>
          {(target || fallbackTarget) && (
            <button
              type="button"
              onClick={() => showTarget(target, fallbackTarget)}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              <LocateFixed className="size-4" /> Show where
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss error"
          className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
    </aside>
  );
}
