// vinext's next/link shim throws on RSC prefetch, so pages link with plain anchors.
// oxlint-disable nextjs/no-html-link-for-pages
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  ClipboardList,
  Download,
  FileSearch,
  FileStack,
  FileText,
  Fingerprint,
  Gavel,
  KeyRound,
  Layers,
  ListChecks,
  Quote,
  ScanSearch,
  ShieldCheck,
  Sheet,
  TableProperties,
  TriangleAlert,
  UserCheck,
  Users,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getChatGPTUser } from './chatgpt-auth';

export const dynamic = 'force-dynamic';

const SIGN_IN = '/sign-in';

export default async function LandingPage() {
  const user = await getChatGPTUser();
  if (user) redirect('/workspace');
  return (
    <div className="min-h-screen overflow-x-clip">
      <SiteHeader />
      <main>
        <Hero />
        <Problems />
        <Workflow />
        <Oversight />
        <Privacy />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}

function Logo() {
  return (
    <a href="/" className="flex w-fit items-center gap-2.5" aria-label="EvidenceFlow home">
      <span className="brand-mark grid size-9 place-items-center rounded-xl text-white">
        <BookOpenCheck className="size-[18px]" />
      </span>
      <span className="text-[17px] font-semibold tracking-tight">EvidenceFlow</span>
    </a>
  );
}

function PrimaryCta({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <a
      href={SIGN_IN}
      className={cn(
        buttonVariants(),
        'h-12 gap-2 rounded-xl px-5 text-[15px] font-semibold shadow-[0_10px_30px_oklch(.53_.21_284/.28)]',
        className,
      )}
    >
      {children}
    </a>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/75 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Page sections" className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
          {[
            ['How it works', '#how-it-works'],
            ['AI oversight', '#oversight'],
            ['Privacy', '#privacy'],
          ].map(([label, href]) => (
            <a key={href} href={href} className="rounded-lg px-3 py-2 transition hover:bg-muted hover:text-foreground">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a href={SIGN_IN} className={cn(buttonVariants({ variant: 'ghost' }), 'hidden h-10 px-3 sm:inline-flex')}>
            Sign in
          </a>
          <a href={SIGN_IN} className={cn(buttonVariants(), 'h-10 rounded-xl px-4 font-semibold')}>
            Start free trial
          </a>
        </div>
      </div>
    </header>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-xs font-semibold uppercase tracking-[.18em] text-primary">{children}</p>
  );
}

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.02fr_.98fr] lg:gap-10 lg:pt-20 lg:pb-28">
      <div>
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
          <ShieldCheck className="size-3.5 text-[var(--success)]" />
          AI-assisted, researcher-controlled
        </span>
        <h1 className="text-[2.6rem] leading-[1.05] font-semibold tracking-[-.045em] text-balance sm:text-6xl">
          Systematic reviews, from search export to{' '}
          <span className="bg-gradient-to-r from-primary to-[oklch(.6_.13_200)] bg-clip-text text-transparent">
            extraction sheet.
          </span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
          EvidenceFlow guides you through every stage of a systematic review: importing and
          deduplicating records, screening titles, abstracts and full texts, and extracting data.
          AI does the heavy reading and shows its reasoning, but every decision is yours.
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <PrimaryCta>
            Start your 14-day free trial <ArrowRight className="size-4" />
          </PrimaryCta>
          <a
            href="#how-it-works"
            className={cn(buttonVariants({ variant: 'outline' }), 'h-12 rounded-xl bg-card px-5 text-[15px] font-semibold')}
          >
            See how it works
          </a>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          Sign in with your ChatGPT account. No new password to create.
        </p>
      </div>
      <HeroMockup />
    </section>
  );
}

const STAGES = ['Protocol', 'Import', 'Screening', 'Full text', 'Extraction'];

const VOTES = [
  { name: 'Reviewer 1', decision: 'Include', confidence: 92 },
  { name: 'Reviewer 2', decision: 'Include', confidence: 87 },
  { name: 'Reviewer 3', decision: 'Unclear', confidence: 58 },
];

function HeroMockup() {
  return (
    <div className="relative" aria-hidden="true">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-[radial-gradient(circle_at_30%_20%,oklch(.86_.1_290/.5),transparent_60%),radial-gradient(circle_at_80%_80%,oklch(.88_.08_195/.45),transparent_60%)] blur-2xl" />
      <div className="surface-card">
        <div className="flex items-center gap-1.5 border-b bg-muted/60 px-4 py-3">
          <span className="size-2.5 rounded-full bg-[oklch(.75_.12_25)]" />
          <span className="size-2.5 rounded-full bg-[oklch(.82_.12_85)]" />
          <span className="size-2.5 rounded-full bg-[oklch(.75_.12_150)]" />
          <span className="ml-3 truncate text-xs text-muted-foreground">Exercise therapy for chronic low back pain</span>
        </div>
        <div className="p-4 sm:p-5">
          <ol className="flex gap-1 overflow-hidden rounded-xl border bg-card p-1.5 text-[11px]">
            {STAGES.map((label, index) => {
              const done = index < 2;
              const active = index === 2;
              return (
                <li
                  key={label}
                  className={cn(
                    'flex min-w-0 flex-auto items-center gap-1.5 rounded-lg px-1.5 py-1.5',
                    active && 'bg-primary/10 font-semibold text-primary',
                    done && 'text-[var(--success-ink)]',
                    !done && !active && 'text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-full border text-[9px]',
                      active && 'border-primary bg-primary text-primary-foreground',
                      done && 'border-[var(--success)] bg-[var(--success-soft)]',
                    )}
                  >
                    {done ? <Check className="size-3" /> : index + 1}
                  </span>
                  <span className="hidden truncate sm:inline">{label}</span>
                </li>
              );
            })}
          </ol>

          <div className="mt-4 rounded-2xl border bg-card p-4">
            <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
              <span>Record 214 of 1,862 · PubMed</span>
              <span className="rounded-full bg-[oklch(.95_.06_85)] px-2 py-0.5 font-semibold text-[oklch(.45_.1_70)]">
                Needs your decision
              </span>
            </div>
            <p className="mt-2.5 text-sm leading-snug font-semibold">
              Supervised exercise versus usual care for adults with chronic low back pain: a randomised
              controlled trial
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['Adults 18+', 'Exercise intervention', 'RCT design'].map((criterion) => (
                <span
                  key={criterion}
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--success-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--success-ink)]"
                >
                  <Check className="size-3" /> {criterion}
                </span>
              ))}
            </div>

            <div className="mt-4 grid gap-2">
              {VOTES.map((vote) => (
                <div key={vote.name} className="grid grid-cols-[5.5rem_4.5rem_1fr_2.25rem] items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{vote.name}</span>
                  <span
                    className={cn(
                      'font-semibold',
                      vote.decision === 'Include' ? 'text-[var(--success-ink)]' : 'text-[oklch(.5_.11_70)]',
                    )}
                  >
                    {vote.decision}
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn(
                        'block h-full rounded-full',
                        vote.decision === 'Include' ? 'bg-[var(--success)]' : 'bg-[oklch(.75_.14_75)]',
                      )}
                      style={{ width: `${vote.confidence}%` }}
                    />
                  </span>
                  <span className="text-right text-muted-foreground tabular-nums">{vote.confidence}%</span>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl bg-[var(--info-soft)] p-3 text-xs leading-5 text-[var(--info-ink)]">
              <span className="font-semibold">Why “Unclear”: </span>
              the abstract doesn’t state whether pain lasted more than 12 weeks.
            </div>

            <div className="mt-4 flex gap-2">
              <span className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
                <Check className="size-3.5" /> Include
              </span>
              <span className="flex h-9 flex-1 items-center justify-center rounded-lg border text-xs font-semibold">
                Exclude
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionIntro({
  eyebrow,
  title,
  children,
  center,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
  center?: boolean;
}) {
  return (
    <div className={cn('max-w-2xl', center && 'mx-auto text-center')}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="text-3xl leading-tight font-semibold tracking-[-.035em] text-balance sm:text-4xl">{title}</h2>
      {children && <p className="mt-4 text-lg leading-8 text-muted-foreground">{children}</p>}
    </div>
  );
}

const PROBLEMS = [
  {
    icon: Layers,
    title: 'Thousands of overlapping records',
    body: 'Searches across several databases return the same studies again and again, and duplicates slip through spreadsheets.',
  },
  {
    icon: Users,
    title: 'Weeks of double screening',
    body: 'Reading every title, abstract and PDF twice is slow, and reconciling inconsistent decisions takes even longer.',
  },
  {
    icon: TableProperties,
    title: 'Error-prone extraction',
    body: 'Copying numbers out of tables by hand invites transcription mistakes that nobody notices until the analysis.',
  },
];

function Problems() {
  return (
    <section className="border-y bg-card/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionIntro eyebrow="Why EvidenceFlow" title="Reviews slow down on volume, not on judgement." center>
          Most of the time goes to repetitive reading and bookkeeping. EvidenceFlow takes on that load
          and leaves the judgement calls to you.
        </SectionIntro>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {PROBLEMS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border bg-card p-6 shadow-[0_12px_36px_rgb(60_40_120/5%)]">
              <span className="section-icon">
                <Icon />
              </span>
              <h3 className="mt-5 font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-[15px] leading-7 text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const WORKFLOW = [
  {
    icon: ClipboardList,
    title: 'Protocol',
    body: 'Write your review question, inclusion and exclusion criteria, and optional PICO elements once. Every AI assessment later on is checked against them.',
    tags: ['Inclusion & exclusion', 'PICO'],
  },
  {
    icon: FileStack,
    title: 'Import & deduplicate',
    body: 'Upload exports from PubMed, Scopus, Web of Science and Embase, up to 25,000 records at a time. Likely duplicate pairs are found for you to confirm, and the records you keep download as RIS.',
    tags: ['RIS', 'PubMed NBIB', 'CSV', 'TXT'],
  },
  {
    icon: ListChecks,
    title: 'Title & abstract screening',
    body: 'Three AI reviewers assess each record independently. Each gives a decision, a confidence score, the criteria it matched and a short reason. Disagreements go to an adjudicator and are flagged for your decision.',
    tags: ['3 independent votes', 'Conflict adjudication'],
  },
  {
    icon: FileSearch,
    title: 'Full-text screening',
    body: 'Upload the PDFs of included records. Each article is assessed in full against your criteria, with the reasoning shown next to it so you can confirm or overrule.',
    tags: ['Searchable PDFs', 'Full-text criteria'],
  },
  {
    icon: Sheet,
    title: 'Data extraction',
    body: 'Bring your own column sheet or build one in the app. Two models extract every value independently, each with the passage it came from, and risky cells are flagged before you export.',
    tags: ['CSV', 'XLSX', 'Evidence excerpts'],
  },
];

function Workflow() {
  return (
    <section id="how-it-works" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <SectionIntro eyebrow="How it works" title="Five guided stages, one continuous trail.">
          Each stage picks up where the last one left off, so you always know what is done, what is
          waiting, and why each record ended up where it did.
        </SectionIntro>
        <ol className="relative mt-14 grid gap-5">
          <span className="absolute top-6 bottom-6 left-6 hidden w-px bg-gradient-to-b from-primary/50 via-primary/25 to-transparent sm:block" />
          {WORKFLOW.map(({ icon: Icon, title, body, tags }, index) => (
            <li key={title} className="relative grid gap-4 sm:grid-cols-[3rem_1fr] sm:gap-6">
              <span className="brand-mark relative z-10 grid size-12 place-items-center rounded-2xl text-white">
                <Icon className="size-5" />
              </span>
              <div className="rounded-2xl border bg-card/90 p-5 shadow-[0_8px_28px_rgb(60_40_120/5%)] sm:p-6">
                <p className="text-xs font-semibold tracking-[.14em] text-muted-foreground uppercase">
                  Stage {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className="mt-1 text-lg font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 max-w-3xl text-[15px] leading-7 text-muted-foreground">{body}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span key={tag} className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const OVERSIGHT = [
  {
    icon: Users,
    title: 'Independent votes',
    body: 'Three AI reviewers assess each record separately, so one model’s mistake doesn’t quietly become the answer.',
  },
  {
    icon: Gavel,
    title: 'Conflicts are surfaced, not hidden',
    body: 'When the reviewers disagree, an adjudicator weighs in and the record is flagged for you instead of being settled silently.',
  },
  {
    icon: Quote,
    title: 'Reasons and evidence attached',
    body: 'Every suggestion lists the criteria it matched and what was missing. Every extracted value carries the passage it came from.',
  },
  {
    icon: UserCheck,
    title: 'You make the final call',
    body: 'AI suggestions never become decisions on their own. You confirm, overrule or return to an earlier stage at any time.',
  },
];

function Oversight() {
  return (
    <section id="oversight" className="scroll-mt-20 border-y bg-[linear-gradient(160deg,oklch(.97_.025_290),oklch(.965_.03_205))]">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1fr] lg:items-center lg:py-28">
        <div>
          <SectionIntro eyebrow="AI you can audit" title="Assistance you can check, line by line.">
            EvidenceFlow is built for work that has to stand up to peer review. The AI shows its
            working, and you stay accountable for every decision.
          </SectionIntro>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {OVERSIGHT.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <Icon className="size-5 text-primary" />
                <h3 className="mt-3 font-semibold tracking-tight">{title}</h3>
                <p className="mt-1.5 text-[15px] leading-7 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
        <ExtractionMockup />
      </div>
    </section>
  );
}

function ExtractionMockup() {
  return (
    <div className="surface-card" aria-hidden="true">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="section-icon !mt-0 !size-8">
            <Sheet />
          </span>
          <div>
            <p className="text-sm font-semibold">Data extraction</p>
            <p className="text-xs text-muted-foreground">Study 7 of 42 · 18 columns</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-[oklch(.95_.06_85)] px-2.5 py-1 text-[11px] font-semibold text-[oklch(.45_.1_70)]">
          <TriangleAlert className="size-3" /> 1 cell to check
        </span>
      </div>
      <div className="divide-y text-sm">
        {[
          ['Country', 'Netherlands'],
          ['Study design', 'Randomised controlled trial'],
        ].map(([header, value]) => (
          <div key={header} className="flex items-center justify-between gap-4 px-5 py-3">
            <span className="text-muted-foreground">{header}</span>
            <span className="flex items-center gap-1.5 text-right font-medium">
              {value}
              <Check className="size-3.5 text-[var(--success)]" />
            </span>
          </div>
        ))}
        <div className="bg-[oklch(.985_.02_85)] px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <span className="font-semibold">Sample size</span>
            <span className="text-xs font-semibold text-[oklch(.45_.1_70)]">Models disagree</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              ['Model A', '128'],
              ['Model B', '126'],
            ].map(([model, value]) => (
              <div key={model} className="rounded-lg border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">{model}</p>
                <p className="font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2 rounded-lg border-l-2 border-primary bg-card px-3 py-2.5 text-xs leading-5 text-muted-foreground">
            <Quote className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>
              “Of the 128 participants randomised, 126 completed the 12-week follow-up…”
              <span className="mt-1 block font-medium text-foreground/70">Results, paragraph 1</span>
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {['Model disagreement', 'Numeric value'].map((reason) => (
              <span key={reason} className="rounded-md bg-[oklch(.94_.05_85)] px-2 py-0.5 text-[11px] font-medium text-[oklch(.42_.09_70)]">
                {reason}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <span className="text-muted-foreground">Follow-up</span>
          <span className="flex items-center gap-1.5 font-medium">
            12 weeks
            <Check className="size-3.5 text-[var(--success)]" />
          </span>
        </div>
      </div>
    </div>
  );
}

const PRIVACY = [
  {
    icon: Fingerprint,
    title: 'A private workspace per researcher',
    body: 'Your reviews, uploads and progress belong to your account, and you can pick up exactly where you left off.',
  },
  {
    icon: KeyRound,
    title: 'No password stored',
    body: 'You sign in with your ChatGPT account. EvidenceFlow never receives or stores your username or password.',
  },
  {
    icon: ScanSearch,
    title: 'Traceable from start to finish',
    body: 'Original files are kept alongside every AI suggestion and researcher decision, so you can retrace how each record was handled.',
  },
  {
    icon: Download,
    title: 'Your data, exportable',
    body: 'Download retained references as RIS, screening results, and the final extraction sheet as CSV or XLSX.',
  },
];

function Privacy() {
  return (
    <section id="privacy" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <SectionIntro eyebrow="Privacy & control" title="Built for transparent, reproducible evidence work." center />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRIVACY.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border bg-card p-6">
              <Icon className="size-5 text-primary" />
              <h3 className="mt-4 font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-[15px] leading-7 text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-4 pb-20 sm:px-6 lg:pb-28">
      <div className="workspace-rail relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] px-6 py-14 text-center text-white sm:px-12 sm:py-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,oklch(.78_.15_193/.3),transparent_45%),radial-gradient(circle_at_90%_100%,oklch(.65_.2_289/.45),transparent_50%)]" />
        <div className="relative">
          <FileText className="mx-auto size-8 text-white/70" />
          <h2 className="mx-auto mt-5 max-w-2xl text-3xl leading-tight font-semibold tracking-[-.035em] text-balance sm:text-4xl">
            Start your next review with a clear trail from the first record.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-8 text-white/75">
            Every new researcher gets a 14-day free trial with the full workflow.
          </p>
          <a
            href={SIGN_IN}
            className="mt-9 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-[15px] font-semibold text-[oklch(.3_.14_284)] shadow-[0_12px_30px_oklch(.1_.05_270/.35)] transition hover:bg-white/90 focus-visible:ring-3 focus-visible:ring-white/60 focus-visible:outline-none"
          >
            Start free trial <ArrowRight className="size-4" />
          </a>
          <p className="mt-4 text-sm text-white/60">Sign in with ChatGPT · No new password to create</p>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t bg-card/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Logo />
        <p>AI suggestions always require researcher oversight.</p>
        <p>© {new Date().getFullYear()} EvidenceFlow</p>
      </div>
    </footer>
  );
}
