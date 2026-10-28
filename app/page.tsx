import { redirect } from 'next/navigation';
import { BookOpenCheck, Check, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { chatGPTSignInPath, getChatGPTUser } from './chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function SignInPage() {
  const user = await getChatGPTUser();
  if (user) redirect('/workspace');
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.15fr_.85fr]">
      <section className="hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-white/15">
            <BookOpenCheck />
          </span>
          <span className="text-lg font-semibold">EvidenceFlow</span>
        </div>
        <div className="max-w-xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[.18em] text-primary-foreground/65">
            Your evidence workspace
          </p>
          <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-.045em]">
            Continue every review exactly where you left it.
          </h1>
          <div className="mt-10 grid gap-4 text-sm text-primary-foreground/80">
            {[
              'Private review history for each researcher',
              'Original files and decisions remain traceable',
              'AI suggestions always require researcher oversight',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <span className="grid size-6 place-items-center rounded-full bg-white/12">
                  <Check className="size-3.5" />
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-primary-foreground/55">
          Built for transparent, reproducible evidence work.
        </p>
      </section>
      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <BookOpenCheck />
            </span>
            <span className="text-lg font-semibold">EvidenceFlow</span>
          </div>
          <p className="text-sm font-semibold text-primary">
            Researcher sign in
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-.035em]">
            Welcome back
          </h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            Sign in to access your private reviews, uploaded references, and
            saved progress.
          </p>
          <div className="mt-8 rounded-2xl border bg-card p-6 shadow-[0_18px_50px_rgb(20_45_62/8%)]">
            <div className="mb-5 flex gap-3 rounded-xl bg-muted p-4">
              <LockKeyhole className="mt-0.5 size-5 shrink-0 text-primary" />
              <p className="text-sm leading-6 text-muted-foreground">
                <strong className="text-foreground">
                  No separate password to remember.
                </strong>
                <br />
                Your username and password are handled by your secure ChatGPT
                account. EvidenceFlow never receives or stores them.
              </p>
            </div>
            <Button
              size="lg"
              className="h-12 w-full"
              render={
                <a href={chatGPTSignInPath('/workspace')} target="_top" />
              }
            >
              Sign in with ChatGPT
            </Button>
            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4" /> Secure, account-specific
              workspace
            </div>
          </div>
          <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
            New researchers receive a 14-day trial. Account charging will be
            required afterward.
          </p>
        </div>
      </section>
    </main>
  );
}
