'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Download, FileSpreadsheet, Plus, Sparkles, UploadCloud, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { runExtractionBatch } from '@/lib/extraction-batch';
import { EXTRACTION_PROVIDERS, EXTRACTION_PROVIDER_LABELS, type ExtractionProvider } from '@/lib/extraction-providers';

type DetectiveResult = { extracted: boolean; values: string[] | null;
  reviewFields: { index: number; reason: string }[] };
type DetectiveSummary = { label: string; configured: boolean; prepared: boolean;
  extractedCount: number; reviewCount: number };

type ExtractionState = {
  template: {
    fileName: string;
    format: 'csv' | 'xlsx';
    headers: string[];
    columnGuidance: Record<string, string>;
    preview: string[][];
  } | null;
  includedCount: number;
  providers: Record<ExtractionProvider, DetectiveSummary>;
  articles: { id: string; title: string; results: Record<ExtractionProvider, DetectiveResult> }[];
};
type DraftColumn = { id: number; name: string; guidance: string };

export default function ExtractionStep({ reviewId, back }: { reviewId: string; back: () => void }) {
  const [state, setState] = useState<ExtractionState | null>(null);
  const [draft, setDraft] = useState<DraftColumn[]>([{ id: 1, name: '', guidance: '' }]);
  const [openGuidance, setOpenGuidance] = useState<number[]>([]);
  const nextId = useRef(2);
  const columnInputs = useRef(new Map<number, HTMLInputElement>());
  const [focusColumnId, setFocusColumnId] = useState<number | null>(null);
  const [busy, setBusy] = useState<'upload' | 'save' | 'analyze' | 'extract' | 'reextract' | null>(null);
  const [progress, setProgress] = useState(0);
  const [runTotal, setRunTotal] = useState(0);
  const [currentArticle, setCurrentArticle] = useState('');
  const [activeProvider, setActiveProvider] = useState<ExtractionProvider | null>(null);
  const [runMode, setRunMode] = useState<'pending' | 'completed'>('pending');
  const [selectionMode, setSelectionMode] = useState<'all' | 'count'>('all');
  const [articleCount, setArticleCount] = useState(10);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setState(null);
    setDraft([{ id: 1, name: '', guidance: '' }]);
    setOpenGuidance([]);
    setFocusColumnId(null);
    setRunMode('pending');
    setSelectionMode('all');
    setArticleCount(10);
    nextId.current = 2;
    void refresh(true);
  }, [reviewId]);
  useEffect(() => {
    if (focusColumnId === null) return;
    const input = columnInputs.current.get(focusColumnId);
    if (input) {
      input.focus();
      setFocusColumnId(null);
    }
  }, [draft, focusColumnId]);

  async function refresh(initialize = false) {
    const response = await fetch(`/api/reviews/${reviewId}/extraction`, { cache: 'no-store' });
    const data = await response.json() as ExtractionState & { error?: string };
    if (response.ok) {
      setState(data);
      if (initialize && data.template) {
        if (data.template.fileName === 'EvidenceFlow-Columns.xlsx') {
          setDraft(data.template.headers.map((name, index) => ({ id: index + 1, name,
            guidance: data.template?.columnGuidance?.[name] || '' })));
          nextId.current = data.template.headers.length + 1;
        }
      }
    }
    else setError(data.error || 'The extraction workspace could not be loaded.');
    return data;
  }
  async function post(body: FormData | Record<string, unknown>) {
    const response = await fetch(`/api/reviews/${reviewId}/extraction`, {
      method: 'POST',
      ...(body instanceof FormData ? { body } : {
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    const data = await response.json() as { error?: string; code?: string; errors?: string[] };
    if (!response.ok) throw Object.assign(new Error(data.error || 'Sherlock could not complete the request.'), { code: data.code, status: response.status });
    return data;
  }
  async function upload(file: File) {
    setBusy('upload'); setError(''); setNotice('');
    try {
      const form = new FormData(); form.append('file', file);
      await post(form);
      await refresh();
      setBusy('analyze');
      const prepared = await post({ action: 'analyze' });
      await refresh();
      if (prepared.errors?.length) setError(prepared.errors.join(' • '));
      else setNotice('The sheet is ready for Sherlock.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The sheet could not be uploaded.');
    } finally { setBusy(null); }
  }
  async function saveColumns() {
    const headers = draft.map((column) => column.name.trim());
    if (!headers.length || headers.some((header) => !header)) {
      setError('Give every column a name before saving.');
      return;
    }
    if (new Set(headers.map((header) => header.toLocaleLowerCase())).size !== headers.length) {
      setError('Each column needs a unique name.');
      return;
    }
    setBusy('save'); setError(''); setNotice('');
    try {
      await post({ action: 'create', headers, guidance: draft.map((column) => column.guidance.trim()) });
      await refresh();
      setBusy('analyze');
      const prepared = await post({ action: 'analyze' });
      await refresh();
      if (prepared.errors?.length) setError(prepared.errors.join(' • '));
      else setNotice('Your columns were saved and prepared for Sherlock.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The columns could not be saved.');
    } finally { setBusy(null); }
  }
  function insertAfter(index: number) {
    const id = nextId.current++;
    setDraft((current) => [
      ...current.slice(0, index + 1),
      { id, name: '', guidance: '' },
      ...current.slice(index + 1),
    ]);
    setFocusColumnId(id);
  }
  function advanceColumn(index: number) {
    const next = draft[index + 1];
    if (next) columnInputs.current.get(next.id)?.focus();
    else insertAfter(index);
  }
  function move(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const updated = [...current];
      [updated[index], updated[target]] = [updated[target], updated[index]];
      return updated;
    });
  }
  async function analyze(provider?: ExtractionProvider) {
    setBusy('analyze'); setError('');
    try {
      const prepared = await post({ action: 'analyze', ...(provider ? { provider } : {}) });
      await refresh();
      if (prepared.errors?.length) setError(prepared.errors.join(' • '));
      else setNotice('Sherlock prepared the extraction fields.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The sheet could not be analyzed.');
    } finally { setBusy(null); }
  }
  async function extract(provider: ExtractionProvider) {
    if (!state) return;
    const candidates = state.articles.filter((article) => article.results[provider].extracted === (runMode === 'completed'));
    const selected = selectionMode === 'all' ? candidates : candidates.slice(0, articleCount);
    if (!selected.length) return;
    setBusy('extract'); setActiveProvider(provider); setError(''); setNotice(''); setProgress(0); setRunTotal(selected.length);
    try {
      if (!state.providers[provider].prepared) {
        const prepared = await post({ action: 'analyze', provider });
        if (prepared.errors?.length) throw new Error(prepared.errors.join(' • '));
        await refresh();
      }
      const result = await runExtractionBatch(selected, async (article, attempt) => {
        setCurrentArticle(`${article.title}${attempt > 1 ? ` · retry ${attempt - 1}` : ''}`);
        try {
          await extractOne(article.id, provider, runMode === 'completed' ? 'reextract' : 'extract');
        } catch (cause) {
          if (runMode === 'pending') {
            const latest = await refresh().catch(() => null);
            if (latest?.articles?.some((item) => item.id === article.id && item.results[provider].extracted)) return;
          }
          throw cause;
        }
        await refresh().catch(() => undefined);
      }, {
        maxAttempts: 3,
        retryable: (cause) => {
          const status = (cause as { status?: number })?.status;
          return status === undefined || status === 408 || status === 429 || status >= 500;
        },
        onCompleted: setProgress,
        onRetry: (remaining, nextAttempt) => setNotice(`Automatically retrying ${remaining} interrupted article(s), attempt ${nextAttempt} of 3…`),
      });
      if (result.failures.length) {
        setNotice('');
        setError(`${result.failures.length} article(s) still need attention after automatic retries. ${result.failures.slice(0, 3).map(({ item, error: cause }) => `${item.title}: ${cause instanceof Error ? cause.message : 'Extraction failed'}`).join(' • ')}`);
      }
      else {
        const latest = await refresh();
        const reviewCount = latest.providers[provider].reviewCount;
        setNotice(reviewCount
          ? `${EXTRACTION_PROVIDER_LABELS[provider]} finished. ${reviewCount} article(s) have fields that need researcher review.`
          : `${EXTRACTION_PROVIDER_LABELS[provider]} finished ${runMode === 'completed' ? 're-extracting' : 'extracting'} ${selected.length} article(s).`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${EXTRACTION_PROVIDER_LABELS[provider]} could not start extraction.`);
    } finally { setCurrentArticle(''); setActiveProvider(null); setBusy(null); }
  }
  async function extractOne(referenceId: string, provider: ExtractionProvider, action: 'extract' | 'reextract') {
    await post({ action, referenceId, provider });
  }
  async function reextract(referenceId: string, title: string, provider: ExtractionProvider) {
    setBusy('reextract'); setActiveProvider(provider); setCurrentArticle(title); setError(''); setNotice('');
    try {
      await extractOne(referenceId, provider, 'reextract');
      await refresh();
      setNotice(`${EXTRACTION_PROVIDER_LABELS[provider]} updated “${title}”.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The article could not be re-extracted.');
    } finally { setCurrentArticle(''); setActiveProvider(null); setBusy(null); }
  }

  const previewHeaders = draft.map((column, index) => column.name.trim() || `Column ${index + 1}`);
  const extractedCount = state?.providers.watson.extractedCount ?? 0;
  const reviewArticles = state?.articles.filter((article) => EXTRACTION_PROVIDERS.some((provider) => article.results[provider].reviewFields.length)).length ?? 0;
  const saveLabel = busy === 'save' ? 'Saving columns…' : busy === 'analyze' ? 'Sherlock is preparing…' : state?.template?.fileName === 'EvidenceFlow-Columns.xlsx' ? 'Save updated columns' : 'Save columns as XLSX';

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-primary">Step 5 · Data extraction</p>
        <h1 className="text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Build the sheet your review needs.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Name the extraction columns here or upload your own sheet. Sherlock extracts the requested fields from each included article.</p>
      </div>
      <Button variant="outline" onClick={back}>Return to full-text screening</Button>
    </div>

    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}

    <nav aria-label="Data extraction sections" className="flex gap-2 overflow-x-auto pb-1 text-sm [scrollbar-width:thin]">
      {[['#sheet-builder', 'Define sheet'], ['#sheet-upload', 'Upload sheet'], ['#run-extraction', 'Run extraction'], ['#extracted-articles', 'Review results']].map(([href, label]) =>
        <a key={href} href={href} className="shrink-0 rounded-xl border bg-card px-3 py-2 font-medium text-primary hover:bg-primary/5">{label}</a>)}
    </nav>

    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div className="surface-card p-3 sm:p-5"><p className="text-xs text-muted-foreground sm:text-sm">Final included articles</p><p className="mt-1 text-2xl font-semibold sm:mt-2 sm:text-3xl">{state?.includedCount ?? '—'}</p></div>
      <div className="surface-card p-3 sm:p-5"><p className="text-xs text-muted-foreground sm:text-sm">Extracted articles</p><p className="mt-1 text-2xl font-semibold sm:mt-2 sm:text-3xl">{state ? extractedCount : '—'}</p></div>
      <div className="surface-card p-3 sm:p-5"><p className="text-xs text-muted-foreground sm:text-sm">Waiting for extraction</p><p className="mt-1 text-2xl font-semibold sm:mt-2 sm:text-3xl">{state ? state.includedCount - extractedCount : '—'}</p></div>
      <div className="surface-card p-3 sm:p-5"><p className="text-xs text-muted-foreground sm:text-sm">Need review</p><p className="mt-1 text-2xl font-semibold sm:mt-2 sm:text-3xl">{state ? reviewArticles : '—'}</p></div>
    </div>

    <section id="sheet-builder" className="surface-card scroll-mt-24 overflow-hidden">
      <div className="border-b p-5 sm:p-6">
        <div className="flex items-start gap-3"><FileSpreadsheet className="mt-0.5 size-6 text-primary" /><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Define the extraction sheet</p><h2 className="mt-1 text-lg font-semibold">Add the columns you want in the final sheet</h2><p className="mt-1 text-sm text-muted-foreground">Add as many fields as your review needs. Their order here becomes the order in the downloaded XLSX.</p></div></div>
      </div>
      <div className="grid min-h-[26rem] lg:grid-cols-[minmax(0,1fr)_minmax(23rem,30rem)]">
        <div className="min-w-0 border-b bg-slate-50/70 p-5 lg:border-b-0 lg:border-r sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Live sheet preview</p><h3 className="mt-1 font-semibold">Your columns, in order</h3></div><Badge variant="outline" className="bg-white">{previewHeaders.length} columns</Badge></div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Each included article becomes a row beneath these headings.</p>
          <div className="mt-5 max-w-full overflow-x-auto rounded-xl border bg-white shadow-sm"><table className="min-w-full border-collapse text-left text-xs"><thead><tr className="bg-slate-100"><th className="w-10 border-r px-3 py-2 font-medium text-slate-400">#</th>{previewHeaders.map((header, index) => <th key={`${index}-${header}`} className="min-w-40 border-r px-3 py-2 font-medium text-slate-400">{columnLetter(index)}</th>)}</tr><tr><th className="border-r border-t bg-slate-50 px-3 py-3 font-medium text-slate-400">1</th>{previewHeaders.map((header, index) => <th key={`${index}-${header}`} className="min-w-40 border-r border-t bg-violet-50/70 px-3 py-3 font-semibold text-slate-800">{header}</th>)}</tr></thead><tbody>{Array.from({ length: 3 }, (_, rowIndex) => <tr key={rowIndex}><td className="border-r border-t bg-slate-50 px-3 py-3 text-slate-400">{rowIndex + 2}</td>{previewHeaders.map((_, columnIndex) => <td key={columnIndex} className="min-w-40 border-r border-t px-3 py-3 text-muted-foreground">{rowIndex === 0 ? 'Article data' : '\u00a0'}</td>)}</tr>)}</tbody></table></div>
        </div>
        <div className="min-w-0 bg-white p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Column builder</p><h3 className="mt-1 text-lg font-semibold">Name each field to extract</h3><p className="mt-2 text-sm leading-5 text-muted-foreground">Add optional guidance under a column to tell Sherlock exactly what to look for. Press Enter in a column name to move to the next field, or use +.</p></div><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-100 text-sm font-semibold text-violet-800">{draft.length}</span></div>
          <div className="mt-5 max-h-[min(50dvh,34rem)] space-y-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]" aria-label="Extraction columns">
            {draft.map((column, index) => <div key={column.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-2 focus-within:border-primary/50 focus-within:bg-white">
              <div className="flex items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-xs font-semibold tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
              <input aria-label={`Column ${index + 1} name`} ref={(element) => { if (element) columnInputs.current.set(column.id, element); else columnInputs.current.delete(column.id); }} value={column.name} onChange={(event) => setDraft((current) => current.map((item) => item.id === column.id ? { ...item, name: event.target.value } : item))} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); advanceColumn(index); } }} placeholder="e.g. Sample size" dir="auto" maxLength={180} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/15" />
              <button type="button" aria-label={`Add column after ${index + 1}`} title="Add column after" onClick={() => insertAfter(index)} className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition hover:opacity-85"><Plus className="size-5" /></button>
              <div className="flex flex-col"><button type="button" aria-label={`Move column ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)} className="grid size-5 place-items-center text-slate-400 hover:text-primary disabled:opacity-30"><ArrowUp className="size-3.5" /></button><button type="button" aria-label={`Move column ${index + 1} down`} disabled={index === draft.length - 1} onClick={() => move(index, 1)} className="grid size-5 place-items-center text-slate-400 hover:text-primary disabled:opacity-30"><ArrowDown className="size-3.5" /></button></div>
              <button type="button" aria-label={`Remove column ${index + 1}`} disabled={draft.length === 1} onClick={() => setDraft((current) => current.filter((item) => item.id !== column.id))} className="text-slate-400 hover:text-rose-600 disabled:opacity-30"><X className="size-4" /></button>
              </div>
              <button type="button" aria-expanded={openGuidance.includes(column.id)} aria-controls={`guidance-${column.id}`} onClick={() => setOpenGuidance((current) => current.includes(column.id) ? current.filter((id) => id !== column.id) : [...current, column.id])} className="mt-1 flex min-h-8 items-center gap-1 pl-1 text-xs font-medium text-primary hover:underline"><ChevronDown className={`size-3.5 transition-transform ${openGuidance.includes(column.id) ? 'rotate-180' : ''}`} />{column.guidance.trim() ? 'Edit guidance' : 'Add optional guidance'}</button>
              {openGuidance.includes(column.id) && <label id={`guidance-${column.id}`} className="mt-1 block text-xs font-medium text-slate-600">Guidance for column {index + 1}
                <textarea aria-label={`Column ${index + 1} extraction guidance`} value={column.guidance} onChange={(event) => setDraft((current) => current.map((item) => item.id === column.id ? { ...item, guidance: event.target.value } : item))} placeholder="e.g. Use the preoperative value for the intervention group" dir="auto" maxLength={1000} rows={2} className="mt-1 block w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/15" />
              </label>}
            </div>)}
          </div>
          <button type="button" onClick={() => insertAfter(draft.length - 1)} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"><Plus className="size-4" /> Add another column</button>
          {Boolean(state && extractedCount) && <p className="mt-4 text-xs leading-5 text-amber-700">Saving a new column layout starts a fresh Sherlock extraction.</p>}
          <Button className="mt-5 w-full" disabled={Boolean(busy)} onClick={() => void saveColumns()}><FileSpreadsheet className="size-4" />{saveLabel}</Button>
        </div>
      </div>
    </section>

    <section id="sheet-upload" className="surface-card scroll-mt-24 p-5 sm:p-6">
      <div className="flex items-start gap-3"><UploadCloud className="mt-0.5 size-6 text-primary" /><div><h2 className="text-lg font-semibold">Or upload your own extraction sheet</h2><p className="mt-1 text-sm text-muted-foreground">CSV or XLSX, up to 5 MB. Original headings and existing rows are retained in the download.</p></div></div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className={`inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-primary bg-white px-4 text-sm font-semibold text-primary ${busy ? 'pointer-events-none opacity-60' : 'hover:bg-primary/5'}`}><UploadCloud className="size-4" />{busy === 'upload' ? 'Uploading…' : 'Choose a sheet'}<input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ''; }} /></label>
        {state?.template && <span className="text-sm text-muted-foreground">Current saved sheet: {state.template.fileName === 'EvidenceFlow-Columns.xlsx' ? 'Created in EvidenceFlow' : state.template.fileName} · {state.template.headers.length} columns</span>}
      </div>
      {Boolean(state && extractedCount) && <p className="mt-3 text-xs text-amber-700">Uploading a new sheet starts a fresh Sherlock extraction.</p>}
      {state?.template && <div className="mt-5 overflow-x-auto rounded-xl border"><table className="min-w-full text-left text-xs"><thead className="bg-muted/60"><tr>{state.template.headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2 font-semibold">{header}</th>)}</tr></thead><tbody>{state.template.preview.slice(0, 2).map((row, index) => <tr key={index} className="border-t">{row.map((value, cell) => <td key={cell} className="max-w-52 truncate px-3 py-2">{value}</td>)}</tr>)}</tbody></table></div>}
    </section>

    <section id="run-extraction" className="surface-card scroll-mt-24 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Sherlock data extraction</h2>
      <p className="mt-1 text-sm text-muted-foreground">Sherlock reads the included articles and fills your sheet. Completed articles are skipped on the next run.</p>
      <div className="mt-5 max-w-xl">
        {EXTRACTION_PROVIDERS.map((provider) => {
          const summary = state?.providers[provider];
          const pending = state ? state.includedCount - summary!.extractedCount : 0;
          const available = runMode === 'completed' ? summary?.extractedCount ?? 0 : pending;
          return <div key={provider} className="rounded-2xl border bg-muted/20 p-4">
            <div className="flex items-start justify-between gap-3"><h3 className="font-semibold">{EXTRACTION_PROVIDER_LABELS[provider]}</h3><Badge variant="outline" className="bg-white">{summary?.extractedCount ?? 0}/{state?.includedCount ?? 0}</Badge></div>
            <p className="mt-2 text-xs text-muted-foreground">{summary?.reviewCount ?? 0} article(s) need review · {pending} pending</p>
            <fieldset className="mt-4 space-y-3 rounded-xl border bg-white p-3">
              <legend className="px-1 text-sm font-medium">Choose articles for this run</legend>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name={`extraction-run-${provider}`} checked={runMode === 'pending'} disabled={Boolean(busy)} onChange={() => setRunMode('pending')} />
                Extract pending articles ({pending})
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name={`extraction-run-${provider}`} checked={runMode === 'completed'} disabled={Boolean(busy)} onChange={() => setRunMode('completed')} />
                Re-extract completed articles ({summary?.extractedCount ?? 0})
              </label>
              {available > 0 && <div className="space-y-3 border-t pt-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name={`extraction-selection-${provider}`} checked={selectionMode === 'all'} disabled={Boolean(busy)} onChange={() => setSelectionMode('all')} />
                All {available} {runMode === 'completed' ? 'completed' : 'remaining included'} articles
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name={`extraction-selection-${provider}`} checked={selectionMode === 'count'} disabled={Boolean(busy)} onChange={() => setSelectionMode('count')} />
                Choose a number
              </label>
              {selectionMode === 'count' && <label className="block text-xs font-medium text-muted-foreground" htmlFor={`extraction-count-${provider}`}>
                Number of articles (1–{available})
                <input id={`extraction-count-${provider}`} type="number" min={1} max={available} value={Math.min(articleCount, available)} disabled={Boolean(busy)} onChange={(event) => setArticleCount(Math.max(1, Math.min(available, Math.trunc(Number(event.target.value) || 1))))} className="mt-1 block h-10 w-28 rounded-lg border bg-background px-3 text-sm text-foreground" />
              </label>}
              <p className="text-xs text-muted-foreground">{runMode === 'completed' ? 'New results replace the previous extraction for each selected article.' : 'Completed articles are skipped. The next run continues with the remaining articles.'}</p>
              </div>}
            </fieldset>
            {!summary?.configured && <p className="mt-4 text-xs text-rose-700">Model configuration is required.</p>}
            {state?.template && summary?.configured && !summary.prepared && <Button variant="outline" className="mt-4 w-full" disabled={Boolean(busy)} onClick={() => void analyze(provider)}><Sparkles />Prepare columns</Button>}
            <Button className="mt-4 w-full" disabled={!state?.template || !summary?.configured || !available || Boolean(busy)} onClick={() => void extract(provider)}><Sparkles />{busy === 'extract' && activeProvider === provider ? 'Extracting…' : `${runMode === 'completed' ? 'Re-extract' : 'Extract'} ${selectionMode === 'all' ? available : Math.min(articleCount, available)} article(s) with ${EXTRACTION_PROVIDER_LABELS[provider]}`}</Button>
            {busy === 'extract' && activeProvider === provider && <div className="mt-3"><p className="mb-2 truncate text-xs text-muted-foreground">{progress}/{runTotal} · {currentArticle}</p><Progress value={runTotal ? progress / runTotal * 100 : 0} /></div>}
            {Boolean(summary?.extractedCount) && <a href={`/api/reviews/${reviewId}/extraction/export?provider=${provider}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"><Download className="size-4" />Download final extraction sheet</a>}
          </div>;
        })}
      </div>
    </section>

    <section id="extracted-articles" className="surface-card scroll-mt-24 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Extracted articles</h2>
      <p className="mt-1 text-sm text-muted-foreground">Open an article to review Sherlock&apos;s extracted values. NR means Not Retrieved: the requested data was not found or could not be verified.</p>
      <div className="mt-5 divide-y rounded-xl border">{state?.articles.length ? state.articles.map((article) => <details key={article.id} className="group px-4 py-3">
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 text-sm"><span className="min-w-0 flex-1 font-medium">{article.title}</span><span className="flex flex-wrap gap-2">{EXTRACTION_PROVIDERS.map((provider) => {
          const result = article.results[provider];
          return <span key={provider} className={`rounded-full px-2 py-1 text-[11px] font-semibold ${result.extracted ? result.reviewFields.length ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{EXTRACTION_PROVIDER_LABELS[provider]} · {result.extracted ? result.reviewFields.length ? 'Review' : 'Done' : 'Pending'}</span>;
        })}</span></summary>
        <div className="mt-4 overflow-x-auto rounded-xl border"><table className="min-w-[32rem] w-full text-left text-xs"><thead className="bg-muted/60"><tr><th className="w-1/3 p-3">Sheet column</th>{EXTRACTION_PROVIDERS.map((provider) => <th key={provider} className="w-2/3 p-3">{EXTRACTION_PROVIDER_LABELS[provider]}</th>)}</tr></thead><tbody>{state.template?.headers.map((header, index) => <tr key={`${index}-${header}`} className="border-t align-top"><th className="p-3 font-semibold">{header}</th>{EXTRACTION_PROVIDERS.map((provider) => {
          const result = article.results[provider];
          const review = result.reviewFields.find((field) => field.index === index);
          return <td key={provider} className={`whitespace-pre-wrap break-words p-3 ${review ? 'bg-amber-50' : ''}`}>{!result.extracted ? <span className="text-muted-foreground">Pending</span> : review ? <span className="text-amber-800">{result.values?.[index] || 'NR'}<span className="mt-1 block text-[11px]">Needs review: {review.reason}</span></span> : result.values?.[index] || 'NR'}</td>;
        })}</tr>)}</tbody></table></div>
        <div className="mt-3 flex flex-wrap gap-2">{EXTRACTION_PROVIDERS.map((provider) => article.results[provider].extracted && <Button key={provider} variant="outline" size="sm" disabled={Boolean(busy) || !state.providers[provider].configured} onClick={() => void reextract(article.id, article.title, provider)}><Sparkles />{busy === 'reextract' && activeProvider === provider && currentArticle === article.title ? 'Updating…' : `Re-extract with ${EXTRACTION_PROVIDER_LABELS[provider]}`}</Button>)}</div>
      </details>) : <p className="p-4 text-sm text-muted-foreground">No full-text articles are currently included.</p>}</div>
    </section>
  </div>;
}

function columnLetter(index: number) {
  let label = '';
  for (let value = index + 1; value; value = Math.floor((value - 1) / 26))
    label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  return label;
}
