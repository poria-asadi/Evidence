'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, BookOpenCheck, Check } from 'lucide-react';

export default function AuthForm({ mode, returnTo }: { mode: 'sign-in' | 'sign-up'; returnTo: string }) {
  const isSignUp = mode === 'sign-up';
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [fieldOfStudy, setFieldOfStudy] = useState('');
  const [educationLevel, setEducationLevel] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (isSignUp && !awaitingCode && password !== confirmation) return setError('Passwords do not match.');
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${awaitingCode ? 'verify-email' : mode}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify(awaitingCode ? { email, code } : isSignUp
          ? { username, email, firstName, lastName, fieldOfStudy, educationLevel, password }
          : { identifier: username, password, rememberMe }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Please try again.');
      if (isSignUp && !awaitingCode) {
        setAwaitingCode(true);
        setBusy(false);
        return;
      }
      window.location.assign(returnTo);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again.');
      setBusy(false);
    }
  }

  const alternative = `${isSignUp ? '/sign-in' : '/sign-up'}?return_to=${encodeURIComponent(returnTo)}`;
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_.9fr]">
      <section className="hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <a href="/" className="flex w-fit items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-white/15"><BookOpenCheck /></span><span className="text-lg font-semibold">EvidenceFlow</span></a>
        <div className="max-w-xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[.18em] text-primary-foreground/65">Your evidence workspace</p>
          <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-.045em]">Continue every review exactly where you left it.</h1>
          <div className="mt-10 grid gap-4 text-sm text-primary-foreground/80">
            {['Private review history for each researcher', 'Original files and decisions remain traceable', 'AI suggestions always require researcher oversight'].map((item) => (
              <div key={item} className="flex items-center gap-3"><span className="grid size-6 place-items-center rounded-full bg-white/12"><Check className="size-3.5" /></span>{item}</div>
            ))}
          </div>
        </div>
        <p className="text-xs text-primary-foreground/55">Built for transparent, reproducible evidence work.</p>
      </section>
      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <a href="/" className="mb-8 flex w-fit items-center gap-3 lg:hidden"><span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><BookOpenCheck /></span><span className="text-lg font-semibold">EvidenceFlow</span></a>
          <p className="text-sm font-semibold text-primary">Researcher account</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-.035em]">{awaitingCode ? 'Verify your email' : isSignUp ? 'Create your account' : 'Welcome back'}</h2>
          {(awaitingCode || !isSignUp) && <p className="mt-3 leading-7 text-muted-foreground">{awaitingCode ? `Enter the six-digit code sent to ${email}. It expires in 10 minutes.` : 'Sign in with your email or username and password.'}</p>}
          <form onSubmit={submit} className="mt-8 space-y-5 rounded-2xl border bg-card p-6 shadow-[0_18px_50px_rgb(20_45_62/8%)]">
            {awaitingCode ? <>
              <div><label htmlFor="code" className="mb-2 block text-sm font-medium">Verification code</label><input id="code" name="code" type="text" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} className="h-11 w-full rounded-xl border bg-background px-3 text-center text-lg tracking-[.35em] outline-none focus-visible:ring-2 focus-visible:ring-primary" /></div>
              <button type="button" onClick={() => { setAwaitingCode(false); setCode(''); setError(''); }} className="text-sm font-semibold text-primary hover:underline">Edit details or request a new code</button>
            </> : <>
              {isSignUp && <>
                <div className="grid grid-cols-2 gap-3"><div><label htmlFor="firstName" className="mb-2 block text-sm font-medium">First name</label><input id="firstName" type="text" required autoComplete="given-name" maxLength={120} value={firstName} onChange={(event) => setFirstName(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary" /></div><div><label htmlFor="lastName" className="mb-2 block text-sm font-medium">Last name</label><input id="lastName" type="text" required autoComplete="family-name" maxLength={120} value={lastName} onChange={(event) => setLastName(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary" /></div></div>
                <div><label htmlFor="fieldOfStudy" className="mb-2 block text-sm font-medium">Field of study</label><input id="fieldOfStudy" type="text" required maxLength={120} value={fieldOfStudy} onChange={(event) => setFieldOfStudy(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary" /></div>
                <div><label htmlFor="educationLevel" className="mb-2 block text-sm font-medium">Education level</label><select id="educationLevel" required value={educationLevel} onChange={(event) => setEducationLevel(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary"><option value="">Select your level</option><option value="Undergraduate">Undergraduate</option><option value="Master's">Master&apos;s</option><option value="Doctorate">Doctorate</option><option value="Postdoctoral">Postdoctoral</option><option value="Other">Other</option></select></div>
                <div><label htmlFor="email" className="mb-2 block text-sm font-medium">Email address</label><input id="email" type="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary" /></div>
              </>}
              <div><label htmlFor="username" className="mb-2 block text-sm font-medium">{isSignUp ? 'Username' : 'Email or username'}</label><input id="username" name="username" type="text" required minLength={isSignUp ? 3 : undefined} maxLength={isSignUp ? 32 : 254} autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(event) => setUsername(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary" />{isSignUp && <p className="mt-1.5 text-xs text-muted-foreground">3–32 letters, numbers, dots, hyphens or underscores.</p>}</div>
              <div><label htmlFor="password" className="mb-2 block text-sm font-medium">Password</label><input id="password" name="password" type="password" required minLength={isSignUp ? 12 : undefined} maxLength={128} autoComplete={isSignUp ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary" />{isSignUp && <p className="mt-1.5 text-xs text-muted-foreground">Use at least 12 characters. A long passphrase works well.</p>}</div>
              {isSignUp ? <div><label htmlFor="confirmation" className="mb-2 block text-sm font-medium">Confirm password</label><input id="confirmation" name="confirmation" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary" /></div> : <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="size-4 accent-primary" />Remember me</label>}
            </>}
            {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            <button type="submit" disabled={busy} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{busy ? 'Please wait…' : awaitingCode ? 'Verify and create account' : isSignUp ? 'Send verification code' : 'Sign in'}<ArrowRight className="size-4" /></button>
            <p className="text-center text-sm text-muted-foreground">{isSignUp ? 'Already have an account?' : 'New to EvidenceFlow?'} <a href={alternative} className="font-semibold text-primary hover:underline">{isSignUp ? 'Sign in' : 'Create an account'}</a></p>
          </form>
        </div>
      </section>
    </main>
  );
}
