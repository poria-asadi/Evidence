'use client';

import { useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpenCheck } from 'lucide-react';
import ErrorFeedback from '@/components/error-feedback';

export default function PasswordRecovery({
  mode,
  token = '',
}: {
  mode: 'request' | 'reset';
  token?: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [errorTarget, setErrorTarget] = useState('recovery-form');
  const isReset = mode === 'reset';

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!event.currentTarget.checkValidity()) {
      const invalid = event.currentTarget.querySelector(
        ':invalid',
      ) as HTMLInputElement | null;
      setErrorTarget(invalid?.id ? `recovery-${invalid.id}` : 'recovery-form');
      setError(
        invalid?.validationMessage ||
          'Correct the highlighted field and try again.',
      );
      return;
    }
    if (isReset && password !== confirmation) {
      setErrorTarget('recovery-confirmation');
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        `/api/auth/${isReset ? 'reset-password' : 'forgot-password'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(isReset ? { token, password } : { email }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Please try again.');
      setDone(true);
      if (isReset) window.history.replaceState(null, '', '/reset-password');
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'Please try again.';
      setErrorTarget(
        /email/i.test(message)
          ? 'recovery-email'
          : /password/i.test(message)
            ? 'recovery-password'
            : 'recovery-form',
      );
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 py-12 text-foreground">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex w-fit items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <BookOpenCheck />
          </span>
          <span className="text-lg font-semibold">EvidenceFlow</span>
        </Link>
        <p className="text-sm font-semibold text-primary">Researcher account</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-.035em]">
          {isReset ? 'Set a new password' : 'Forgot your password?'}
        </h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          {isReset
            ? 'Choose a new password for your account.'
            : 'Enter the email address you used to register. We will send a reset link if an account exists.'}
        </p>
        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-[0_18px_50px_rgb(20_45_62/8%)]">
          {done ? (
            <output className="block space-y-4 text-sm leading-6">
              <p className="font-semibold">
                {isReset ? 'Password updated' : 'Check your email'}
              </p>
              <p>
                {isReset
                  ? 'Your password has been changed. Sign in with the new password.'
                  : 'If this email has an account, a password reset link will arrive shortly. Check your spam folder if needed.'}
              </p>
              <Link
                href="/sign-in"
                className="inline-flex items-center gap-2 font-semibold text-primary hover:underline"
              >
                Return to sign in <ArrowRight className="size-4" />
              </Link>
            </output>
          ) : isReset && !/^[0-9a-f]{64}$/.test(token) ? (
            <div className="space-y-4 text-sm leading-6">
              <p>This reset link is invalid or missing.</p>
              <Link
                href="/forgot-password"
                className="font-semibold text-primary hover:underline"
              >
                Request a new link
              </Link>
            </div>
          ) : (
            <form
              onSubmit={submit}
              noValidate
              data-error-target="recovery-form"
              className="space-y-5"
            >
              {isReset ? (
                <>
                  <div>
                    <label
                      htmlFor="password"
                      className="mb-2 block text-sm font-medium"
                    >
                      New password
                    </label>
                    <input
                      id="password"
                      data-error-target="recovery-password"
                      type="password"
                      required
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Use at least 12 characters.
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor="confirmation"
                      className="mb-2 block text-sm font-medium"
                    >
                      Confirm new password
                    </label>
                    <input
                      id="confirmation"
                      data-error-target="recovery-confirmation"
                      type="password"
                      required
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-medium"
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    data-error-target="recovery-email"
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {busy
                  ? 'Please wait…'
                  : isReset
                    ? 'Update password'
                    : 'Send reset link'}
                <ArrowRight className="size-4" />
              </button>
              <Link
                href="/sign-in"
                className="inline-block text-sm font-semibold text-primary hover:underline"
              >
                Back to sign in
              </Link>
            </form>
          )}
        </div>
      </div>
      <ErrorFeedback
        message={error}
        target={errorTarget}
        fallbackTarget="recovery-form"
        onClose={() => setError('')}
      />
    </main>
  );
}
