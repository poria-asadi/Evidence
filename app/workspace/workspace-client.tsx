'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleHelp,
  Clock3,
  Cpu,
  CreditCard,
  Database,
  Download,
  FileSpreadsheet,
  Files,
  FlaskConical,
  GitMerge,
  History,
  Home,
  Info,
  Layers3,
  LogOut,
  Menu,
  MinusCircle,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UserRound,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  articleTextFromPages,
  normalizedPdfText,
  retainsReadablePdfText,
} from '@/lib/searchable-pdf';
import { optimizePdfStructure } from '@/lib/pdf-optimization';

const FULL_TEXT_COMPRESSION_THRESHOLD = 8 * 1024 * 1024;
const SEARCHABLE_PDF_VERSION = 3;

type Draft = {
  title: string;
  purpose: string;
  inclusion: string;
  exclusion: string;
  population: string;
  intervention: string;
  comparison: string;
  outcomes: string;
};
type Review = Draft & {
  id: string;
  stage: string;
  updatedAt: number;
  referenceCount: number;
};
type ImportResult = {
  fileName: string;
  recordCount: number;
  duplicateCount: number;
  autoResolvedCount: number;
  reviewCount: number;
  duplicates: {
    title: string | null;
    matchType: string;
    confidence: number;
    status: string;
  }[];
  diagnostics: {
    sourceDatabase: string;
    coverage: {
      title: number;
      abstract: number;
      authors: number;
      year: number;
      identifier: number;
    };
    warnings: string[];
  };
  preview: {
    title: string | null;
    authors: string | null;
    year: string | null;
    doi: string | null;
    pmid: string | null;
  }[];
};
type UploadHistory = {
  id: string;
  fileName: string;
  sourceDatabase: string;
  size: number;
  recordCount: number;
  status: string;
  createdAt: number;
};
type DuplicatePair = {
  id: string;
  matchType: string;
  confidence: number;
  status: string;
  leftTitle: string | null;
  leftAuthors: string | null;
  leftYear: string | null;
  leftDoi: string | null;
  leftPmid: string | null;
  rightTitle: string | null;
  rightAuthors: string | null;
  rightYear: string | null;
  rightDoi: string | null;
  rightPmid: string | null;
  leftSource: string;
  leftFileName: string;
  rightSource: string;
  rightFileName: string;
};
type ImportSummary = { fileCount: number; totalRecords: number };
type DuplicateSummary = {
  totalCandidates: number;
  autoResolved: number;
  needsReview: number;
  researcherResolved: number;
};
type ProviderStatus = {
  id: string;
  label: string;
  configured: boolean;
  optional: boolean;
};
type ScreeningReference = {
  id: string;
  title: string | null;
  abstract: string | null;
  authors: string | null;
  year: string | null;
  journal: string | null;
  doi: string | null;
  pmid: string | null;
  researcherDecision: 'include' | 'exclude' | 'unclear' | null;
  researcherNotes: string | null;
  geminiStatus: string | null;
  geminiDecision: 'include' | 'exclude' | 'unclear' | null;
  geminiConfidence: number | null;
  geminiReason: string | null;
  geminiError: string | null;
  openaiStatus: string | null;
  openaiDecision: 'include' | 'exclude' | 'unclear' | null;
  openaiConfidence: number | null;
  openaiReason: string | null;
  openaiError: string | null;
  zeousStatus: string | null;
  zeousDecision: 'include' | 'exclude' | 'unclear' | null;
  zeousConfidence: number | null;
  zeousReason: string | null;
  zeousError: string | null;
  adjudicatorStatus: string | null;
  adjudicatorDecision: 'include' | 'exclude' | 'unclear' | null;
  adjudicatorConfidence: number | null;
  adjudicatorReason: string | null;
  adjudicatorError: string | null;
};
type ScreeningSummary = {
  total: number;
  included: number;
  excluded: number;
  unclear: number;
  unreviewed: number;
  aiAssessed: number;
  conflicts: number;
  unresolvedConflicts: number;
};
type CategorizedResult = {
  id: string;
  title: string | null;
  abstract: string | null;
  authors: string | null;
  doi: string | null;
  geminiDecision: 'include' | 'exclude' | 'unclear';
  geminiReason: string | null;
  openaiDecision: 'include' | 'exclude' | 'unclear';
  openaiReason: string | null;
  zeousDecision: 'include' | 'exclude' | 'unclear';
  zeousReason: string | null;
  researcherDecision: 'include' | 'exclude' | 'unclear' | null;
  adjudicatorStatus: string | null;
  adjudicatorDecision: 'include' | 'exclude' | 'unclear' | null;
  adjudicatorReason: string | null;
  category: 'exclude' | 'include' | 'conflict';
};
type FullTextFile = {
  referenceId: string;
  fileName: string;
  contentType: string;
  size: number;
  aiSize: number | null;
  aiVersion: number;
  status: string;
  createdAt: number;
};
type FullTextCriteria = {
  useTiabCriteria: boolean;
  inclusion: string;
  exclusion: string;
  declared: boolean;
  updatedAt: number | null;
};
type OpenAccessSummary = {
  checked: number;
  added: number;
  unavailable: number;
  errors: number;
};
type FullTextScreeningItem = {
  id: string;
  title: string | null;
  authors: string | null;
  doi: string | null;
  fileName: string;
  size: number;
  researcherDecision: 'include' | 'exclude' | 'unclear' | null;
  researcherNotes: string | null;
  marpleStatus: string | null;
  marpleDecision: 'include' | 'exclude' | 'unclear' | null;
  marpleReason: string | null;
  marpleError: string | null;
  poirotStatus: string | null;
  poirotDecision: 'include' | 'exclude' | 'unclear' | null;
  poirotReason: string | null;
  poirotError: string | null;
  zeousStatus: string | null;
  zeousDecision: 'include' | 'exclude' | 'unclear' | null;
  zeousReason: string | null;
  zeousError: string | null;
  sherlockStatus: string | null;
  sherlockDecision: 'include' | 'exclude' | 'unclear' | null;
  sherlockReason: string | null;
  sherlockError: string | null;
};
type FullTextAssessmentOutcome = 'complete' | 'deferred' | 'fatal';
type ScreeningJob = {
  id: string;
  reviewId: string;
  status: 'running' | 'paused' | 'cancelled' | 'completed';
  requestedCount: number;
  processedCount: number;
  successfulCount: number;
  failedCount: number;
  currentReferenceId: string | null;
  costConfirmed: number;
  createdAt: number;
  updatedAt: number;
};
type ScreeningFilter =
  | 'all'
  | 'unreviewed'
  | 'needs_ai'
  | 'agreement'
  | 'disagreement'
  | 'include'
  | 'unclear'
  | 'exclude';
type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
const blank: Draft = {
  title: '',
  purpose: '',
  inclusion: '',
  exclusion: '',
  population: '',
  intervention: '',
  comparison: '',
  outcomes: '',
};
const blankFullTextCriteria: FullTextCriteria = {
  useTiabCriteria: false,
  inclusion: '',
  exclusion: '',
  declared: false,
  updatedAt: null,
};
const stages = [
  ['01', 'Protocol'],
  ['02', 'Import & deduplicate'],
  ['03', 'Title and Abstract Screening'],
  ['04', 'Full-text Screening'],
];

export default function WorkspaceClient({
  user,
}: {
  user: { name: string; email: string };
}) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [draft, setDraft] = useState<Draft>(blank);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [subscription, setSubscription] = useState<{
    plan: string;
    status: string;
    trialEndsAt: number;
  } | null>(null);
  const [showBilling, setShowBilling] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [uploads, setUploads] = useState<UploadHistory[]>([]);
  const [importSummary, setImportSummary] = useState<ImportSummary>({
    fileCount: 0,
    totalRecords: 0,
  });
  const [duplicatePairs, setDuplicatePairs] = useState<DuplicatePair[]>([]);
  const [duplicateSummary, setDuplicateSummary] = useState<DuplicateSummary>({
    totalCandidates: 0,
    autoResolved: 0,
    needsReview: 0,
    researcherResolved: 0,
  });
  const [duplicatePage, setDuplicatePage] = useState(1);
  const [duplicateTotalPages, setDuplicateTotalPages] = useState(1);
  const [importView, setImportView] = useState<
    'upload' | 'duplicates' | 'history'
  >('upload');
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [screeningReferences, setScreeningReferences] = useState<
    ScreeningReference[]
  >([]);
  const [categorizedResults, setCategorizedResults] = useState<
    CategorizedResult[]
  >([]);
  const [screeningSummary, setScreeningSummary] = useState<ScreeningSummary>({
    total: 0,
    included: 0,
    excluded: 0,
    unclear: 0,
    unreviewed: 0,
    aiAssessed: 0,
    conflicts: 0,
    unresolvedConflicts: 0,
  });
  const [unresolvedDuplicates, setUnresolvedDuplicates] = useState(0);
  const [screeningLoading, setScreeningLoading] = useState(false);
  const [screeningSaving, setScreeningSaving] = useState<string | null>(null);
  const [aiRunningId, setAiRunningId] = useState<string | null>(null);
  const [screeningJob, setScreeningJob] = useState<ScreeningJob | null>(null);
  const [batchSize, setBatchSize] = useState(10);
  const [costConfirmed, setCostConfirmed] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [screeningFilter, setScreeningFilter] =
    useState<ScreeningFilter>('all');
  const [screeningPage, setScreeningPage] = useState(1);
  const [screeningTotalPages, setScreeningTotalPages] = useState(1);
  const [fullTextFiles, setFullTextFiles] = useState<FullTextFile[]>([]);
  const [fullTextCriteria, setFullTextCriteria] = useState<FullTextCriteria>(
    blankFullTextCriteria,
  );
  const [fullTextCriteriaDraft, setFullTextCriteriaDraft] =
    useState<FullTextCriteria>(blankFullTextCriteria);
  const [fullTextCriteriaSaving, setFullTextCriteriaSaving] = useState(false);
  const [openAccessSearching, setOpenAccessSearching] = useState(false);
  const [openAccessSummary, setOpenAccessSummary] =
    useState<OpenAccessSummary | null>(null);
  const [fullTextLoading, setFullTextLoading] = useState(false);
  const [fullTextUploadingId, setFullTextUploadingId] = useState<string | null>(
    null,
  );
  const [fullTextOptimizingId, setFullTextOptimizingId] = useState<
    string | null
  >(null);
  const [fullTextScreeningItems, setFullTextScreeningItems] = useState<
    FullTextScreeningItem[]
  >([]);
  const [fullTextProviders, setFullTextProviders] = useState<ProviderStatus[]>(
    [],
  );
  const [fullTextScreeningLoading, setFullTextScreeningLoading] =
    useState(false);
  const [fullTextRunningId, setFullTextRunningId] = useState<string | null>(
    null,
  );
  const [fullTextDecisionSavingId, setFullTextDecisionSavingId] = useState<
    string | null
  >(null);
  const [fullTextCostConfirmed, setFullTextCostConfirmed] = useState(false);
  const [fullTextBatchProgress, setFullTextBatchProgress] = useState<{
    processed: number;
    total: number;
    deferred: number;
    automaticRetrying: boolean;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const batchStopRequested = useRef(false);
  const openAccessStartedForReview = useRef<string | null>(null);
  const fullTextOptimizationAttempts = useRef(new Set<string>());

  const completed = useMemo(
    () =>
      ['title', 'purpose', 'inclusion', 'exclusion'].filter((key) =>
        draft[key as keyof Draft].trim(),
      ).length,
    [draft],
  );
  const filtered = reviews.filter((review) =>
    (review.title || review.purpose)
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const trialDays = subscription
    ? Math.max(0, Math.ceil((subscription.trialEndsAt - Date.now()) / 86400000))
    : 14;
  const fullTextCriteriaDirty =
    fullTextCriteria.useTiabCriteria !==
      fullTextCriteriaDraft.useTiabCriteria ||
    fullTextCriteria.inclusion !== fullTextCriteriaDraft.inclusion ||
    fullTextCriteria.exclusion !== fullTextCriteriaDraft.exclusion;

  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (activeId && step === 2) void loadImportWorkspace(activeId);
  }, [activeId, step]);
  useEffect(() => {
    if ((step === 3 || step === 4) && activeId) {
      void loadProviders();
      void loadScreening(activeId, screeningFilter, screeningPage);
      if (step === 3) void loadScreeningJob(activeId);
      if (step === 4) {
        void Promise.all([
          loadFullTextFiles(activeId),
          loadFullTextScreening(activeId),
          loadFullTextCriteria(activeId),
        ]);
        if (openAccessStartedForReview.current !== activeId) {
          openAccessStartedForReview.current = activeId;
          void discoverOpenAccessFullTexts(activeId);
        }
      }
    }
  }, [step, activeId, screeningFilter, screeningPage]);
  useEffect(() => {
    if (step !== 4 || !activeId || fullTextOptimizingId) return;
    const candidate = fullTextFiles.find(
      (file) =>
        file.contentType === 'application/pdf' &&
        file.size > FULL_TEXT_COMPRESSION_THRESHOLD &&
        (!file.aiSize || file.aiVersion < SEARCHABLE_PDF_VERSION),
    );
    if (!candidate) return;
    const key = `${activeId}:${candidate.referenceId}:${candidate.createdAt}`;
    if (fullTextOptimizationAttempts.current.has(key)) return;
    fullTextOptimizationAttempts.current.add(key);
    void optimizeStoredFullText(activeId, candidate);
  }, [step, activeId, fullTextFiles, fullTextOptimizingId]);
  useEffect(() => {
    if (
      step === 3 &&
      activeId &&
      screeningJob?.status === 'running' &&
      !batchRunning
    )
      void processScreeningBatch(screeningJob.id);
  }, [step, activeId, screeningJob?.id, screeningJob?.status, batchRunning]);
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: 'stage_review_protocol',
          title: 'Stage review protocol',
          description:
            'Fill the visible EvidenceFlow protocol draft. This does not save, upload, or run screening.',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              purpose: { type: 'string' },
              inclusion: { type: 'string' },
              exclusion: { type: 'string' },
              population: { type: 'string' },
              intervention: { type: 'string' },
              comparison: { type: 'string' },
              outcomes: { type: 'string' },
            },
            required: ['title', 'purpose', 'inclusion', 'exclusion'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input: unknown) {
            if (!input || typeof input !== 'object')
              throw new Error('Protocol fields are required.');
            const value = input as Partial<Draft>;
            for (const field of [
              'title',
              'purpose',
              'inclusion',
              'exclusion',
            ] as const)
              if (typeof value[field] !== 'string' || !value[field]?.trim())
                throw new Error(`${field} is required.`);
            setDraft({
              ...blank,
              ...Object.fromEntries(
                Object.entries(value).map(([key, entry]) => [
                  key,
                  typeof entry === 'string' ? entry.trim() : '',
                ]),
              ),
            });
            setActiveId(null);
            setStep(1);
            setNotice('Protocol staged for your review. Save when ready.');
            setError('');
            return { status: 'staged', saved: false };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);
  async function refresh(selectId?: string) {
    try {
      const response = await fetch('/api/reviews');
      if (!response.ok) throw new Error('Could not load your reviews.');
      const data = (await response.json()) as {
        reviews: Review[];
        subscription: {
          plan: string;
          status: string;
          trialEndsAt: number;
        };
      };
      setReviews(data.reviews);
      setSubscription(data.subscription);
      if (selectId) {
        const selected = data.reviews.find(
          (item: Review) => item.id === selectId,
        );
        if (selected) choose(selected);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not load your workspace.',
      );
    } finally {
      setLoading(false);
    }
  }
  function choose(review: Review) {
    setActiveId(review.id);
    setDraft({
      title: review.title || '',
      purpose: review.purpose,
      inclusion: review.inclusion,
      exclusion: review.exclusion,
      population: review.population || '',
      intervention: review.intervention || '',
      comparison: review.comparison || '',
      outcomes: review.outcomes || '',
    });
    setStep(
      review.stage === 'fulltext'
        ? 4
        : review.stage === 'screening'
          ? 3
          : review.stage === 'import'
            ? 2
            : 1,
    );
    setImportResult(null);
    setDuplicatePage(1);
    setScreeningFilter('all');
    setScreeningPage(1);
    setScreeningJob(null);
    setCostConfirmed(false);
    setNotice('');
    setError('');
    setNavOpen(false);
  }
  function startNew() {
    setActiveId(null);
    setDraft(blank);
    setStep(1);
    setImportResult(null);
    setDuplicatePage(1);
    setScreeningFilter('all');
    setScreeningPage(1);
    setScreeningJob(null);
    setCostConfirmed(false);
    setNotice('');
    setError('');
    setNavOpen(false);
  }
  function update(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setNotice('');
  }
  async function saveProtocol() {
    if (completed < 4) {
      setError(
        'Review title, main purpose, inclusion criteria, and exclusion criteria are required.',
      );
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch(
        activeId ? `/api/reviews/${activeId}` : '/api/reviews',
        {
          method: activeId ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(draft),
        },
      );
      const data = (await response.json()) as { error?: string; id: string };
      if (!response.ok)
        throw new Error(data.error || 'The protocol could not be saved.');
      setActiveId(data.id);
      await refresh();
      setStep(2);
      setImportView('upload');
      setNotice('Protocol saved. You can now import your references.');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The protocol could not be saved.',
      );
    } finally {
      setSaving(false);
    }
  }
  async function upload(files: File[]) {
    if (!activeId) {
      setError('Save the protocol before importing references.');
      return;
    }
    if (!files.length) return;
    setImporting(true);
    setError('');
    setNotice('');
    let importedFiles = 0;
    let importedRecords = 0;
    let autoResolved = 0;
    let needsReview = 0;
    try {
      for (const file of files) {
        if (file.size > 30 * 1024 * 1024)
          throw new Error(`${file.name} is larger than the 30 MB file limit.`);
        const form = new FormData();
        form.append('file', file);
        const response = await fetch(`/api/reviews/${activeId}/imports`, {
          method: 'POST',
          body: form,
        });
        const responseText = await response.text();
        let data: ImportResult & { error?: string };
        try {
          data = JSON.parse(responseText) as ImportResult & { error?: string };
        } catch {
          if (response.status === 413)
            throw new Error(`${file.name} exceeded the 30 MB file limit.`);
          throw new Error(
            responseText || `${file.name} could not be imported.`,
          );
        }
        if (!response.ok)
          throw new Error(data.error || `${file.name} could not be imported.`);
        setImportResult(data);
        importedFiles++;
        importedRecords += data.recordCount;
        autoResolved += data.autoResolvedCount;
        needsReview += data.reviewCount;
      }
      setStep(2);
      setImportView('upload');
      setDuplicatePage(1);
      await Promise.all([refresh(), loadImportWorkspace(activeId, 1)]);
      setNotice(
        `${importedFiles} file${importedFiles === 1 ? '' : 's'} added with ${importedRecords.toLocaleString()} references. ${autoResolved} duplicate${autoResolved === 1 ? '' : 's'} auto-resolved; ${needsReview} need${needsReview === 1 ? 's' : ''} your review.`,
      );
    } catch (cause) {
      if (importedFiles) {
        setDuplicatePage(1);
        await Promise.all([refresh(), loadImportWorkspace(activeId, 1)]);
      }
      setError(cause instanceof Error ? cause.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  }

  async function loadImportWorkspace(reviewId: string, page = duplicatePage) {
    setDetailsLoading(true);
    try {
      const resolveResponse = await fetch(
        `/api/reviews/${reviewId}/duplicates`,
        {
          method: 'POST',
        },
      );
      if (!resolveResponse.ok) {
        const resolveData = (await resolveResponse.json()) as {
          error?: string;
        };
        throw new Error(
          resolveData.error || 'Automatic duplicate resolution failed.',
        );
      }
      const [historyResponse, duplicatesResponse] = await Promise.all([
        fetch(`/api/reviews/${reviewId}/imports/history`),
        fetch(`/api/reviews/${reviewId}/duplicates?page=${page}`),
      ]);
      const historyData = (await historyResponse.json()) as {
        error?: string;
        uploads: UploadHistory[];
        summary?: ImportSummary;
      };
      const duplicateData = (await duplicatesResponse.json()) as {
        error?: string;
        pairs: DuplicatePair[];
        summary: DuplicateSummary;
        pagination?: { page: number; totalPages: number };
      };
      if (!historyResponse.ok)
        throw new Error(
          historyData.error || 'Import history could not be loaded.',
        );
      if (!duplicatesResponse.ok)
        throw new Error(
          duplicateData.error || 'Duplicate candidates could not be loaded.',
        );
      setUploads(historyData.uploads);
      setImportSummary(
        historyData.summary ?? {
          fileCount: historyData.uploads.length,
          totalRecords: historyData.uploads.reduce(
            (total: number, item: UploadHistory) => total + item.recordCount,
            0,
          ),
        },
      );
      setDuplicatePairs(duplicateData.pairs);
      setDuplicateSummary(duplicateData.summary);
      setDuplicatePage(duplicateData.pagination?.page ?? page);
      setDuplicateTotalPages(duplicateData.pagination?.totalPages ?? 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Import details could not be loaded.',
      );
    } finally {
      setDetailsLoading(false);
    }
  }

  async function decideDuplicate(
    pairId: string,
    decision: 'confirmed_duplicate' | 'keep_both',
  ) {
    if (!activeId) return;
    setDuplicatePairs((pairs) =>
      pairs.map((pair) =>
        pair.id === pairId ? { ...pair, status: decision } : pair,
      ),
    );
    setDuplicateSummary((summary) => ({
      ...summary,
      needsReview: Math.max(0, summary.needsReview - 1),
      researcherResolved: summary.researcherResolved + 1,
    }));
    const response = await fetch(
      `/api/reviews/${activeId}/duplicates/${pairId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      },
    );
    if (!response.ok) {
      setError('The duplicate decision could not be saved.');
      await loadImportWorkspace(activeId);
    }
  }

  async function loadProviders() {
    setProvidersLoading(true);
    try {
      const response = await fetch('/api/ai/providers');
      const data = (await response.json()) as {
        error?: string;
        providers: ProviderStatus[];
      };
      if (!response.ok)
        throw new Error(
          data.error || 'AI detective status could not be loaded.',
        );
      setProviders(data.providers);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'AI detective status could not be loaded.',
      );
    } finally {
      setProvidersLoading(false);
    }
  }

  async function loadScreening(
    reviewId: string,
    filter = screeningFilter,
    page = screeningPage,
  ) {
    setScreeningLoading(true);
    try {
      const response = await fetch(
        `/api/reviews/${reviewId}/screening?filter=${filter}&page=${page}`,
      );
      const data = (await response.json()) as {
        error?: string;
        references: ScreeningReference[];
        categorizedResults?: CategorizedResult[];
        summary?: Partial<ScreeningSummary>;
        unresolvedDuplicates?: number;
        pagination?: { totalPages?: number };
      };
      if (!response.ok)
        throw new Error(data.error || 'Screening queue could not be loaded.');
      setScreeningReferences(data.references);
      setCategorizedResults(data.categorizedResults || []);
      setScreeningSummary({
        total: Number(data.summary?.total ?? 0),
        included: Number(data.summary?.included ?? 0),
        excluded: Number(data.summary?.excluded ?? 0),
        unclear: Number(data.summary?.unclear ?? 0),
        unreviewed: Number(data.summary?.unreviewed ?? 0),
        aiAssessed: Number(data.summary?.aiAssessed ?? 0),
        conflicts: Number(data.summary?.conflicts ?? 0),
        unresolvedConflicts: Number(data.summary?.unresolvedConflicts ?? 0),
      });
      setUnresolvedDuplicates(Number(data.unresolvedDuplicates ?? 0));
      setScreeningTotalPages(Number(data.pagination?.totalPages ?? 1));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Screening queue could not be loaded.',
      );
    } finally {
      setScreeningLoading(false);
    }
  }

  async function loadScreeningJob(reviewId: string) {
    try {
      const response = await fetch(`/api/reviews/${reviewId}/screening/jobs`);
      const data = (await response.json()) as {
        error?: string;
        job: ScreeningJob | null;
      };
      if (!response.ok)
        throw new Error(data.error || 'Screening status could not be loaded.');
      setScreeningJob(data.job);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Screening status could not be loaded.',
      );
    }
  }

  async function startScreeningBatch() {
    if (!activeId) return;
    setError('');
    setNotice('');
    setBatchRunning(true);
    batchStopRequested.current = false;
    try {
      const response = await fetch(`/api/reviews/${activeId}/screening/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestedCount: batchSize, costConfirmed }),
      });
      const data = (await response.json()) as {
        error?: string;
        job: ScreeningJob;
      };
      if (!response.ok)
        throw new Error(data.error || 'Screening could not be started.');
      setScreeningJob(data.job);
      setCostConfirmed(false);
      await processScreeningBatch(data.job.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Screening could not be started.',
      );
      setBatchRunning(false);
    }
  }

  async function processScreeningBatch(jobId: string) {
    if (!activeId) return;
    setBatchRunning(true);
    setError('');
    setNotice('');
    try {
      let current: ScreeningJob | null = screeningJob;
      let retryAttempt = 0;
      let lastProcessedCount = current?.processedCount ?? 0;
      while (!batchStopRequested.current) {
        const response = await fetch(
          `/api/reviews/${activeId}/screening/jobs/${jobId}/process`,
          { method: 'POST' },
        );
        const data = (await response.json()) as {
          error?: string;
          job: ScreeningJob;
          result?: {
            status?: string;
            providers?: { errorCode?: string | null }[];
          };
        };
        if (
          !response.ok &&
          (response.status === 429 || response.status >= 500)
        ) {
          retryAttempt += 1;
          await waitForAutomaticRetry(retryAttempt);
          continue;
        }
        if (!response.ok)
          throw new Error(data.error || 'The batch could not continue.');
        current = data.job as ScreeningJob;
        setScreeningJob(current);
        if (data.result?.status === 'partial_failure') {
          if (!canRetryAutomatically(data.result.providers))
            throw new Error(
              'A detective connection needs attention before screening can continue.',
            );
          retryAttempt += 1;
          await waitForAutomaticRetry(retryAttempt);
          continue;
        }
        if (current.processedCount > lastProcessedCount) {
          lastProcessedCount = current.processedCount;
          retryAttempt = 0;
        }
        if (current.status !== 'running') break;
      }
      if (current?.status === 'completed')
        setNotice(
          `${current.successfulCount} records were assessed in this screening run.`,
        );
    } catch (cause) {
      batchStopRequested.current = true;
      setError(
        cause instanceof Error
          ? cause.message
          : 'Screening could not continue.',
      );
      try {
        const response = await fetch(
          `/api/reviews/${activeId}/screening/jobs/${jobId}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'cancel' }),
          },
        );
        if (response.ok) {
          const data = (await response.json()) as { job: ScreeningJob };
          setScreeningJob(data.job);
        }
      } catch {
        // The visible error above is enough; a later status refresh reconciles
        // the job if the local connection itself is unavailable.
      }
      await loadScreeningJob(activeId);
    } finally {
      setBatchRunning(false);
      await loadScreening(activeId, screeningFilter, screeningPage);
    }
  }

  async function cancelScreeningBatch() {
    if (!activeId || !screeningJob) return;
    batchStopRequested.current = true;
    try {
      const response = await fetch(
        `/api/reviews/${activeId}/screening/jobs/${screeningJob.id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'cancel' }),
        },
      );
      const data = (await response.json()) as {
        error?: string;
        job: ScreeningJob;
      };
      if (!response.ok)
        throw new Error(data.error || 'Screening could not be stopped.');
      setScreeningJob(data.job);
      setNotice(
        'Screening stopped. Saved assessments remain available in the queue.',
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Screening could not be stopped.',
      );
    }
  }

  async function decideScreening(
    referenceId: string,
    decision: 'include' | 'exclude' | 'unclear',
  ) {
    if (!activeId) return;
    setScreeningSaving(referenceId);
    setError('');
    try {
      const response = await fetch(
        `/api/reviews/${activeId}/screening/${referenceId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ decision }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(
          data.error || 'The screening decision could not be saved.',
        );
      await Promise.all([loadScreening(activeId), refresh()]);
      setNotice('Researcher decision saved.');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The screening decision could not be saved.',
      );
    } finally {
      setScreeningSaving(null);
    }
  }

  async function decideScreeningCategory(category: 'include' | 'exclude') {
    if (!activeId) return;
    setScreeningSaving(`all-${category}`);
    setError('');
    try {
      const response = await fetch(`/api/reviews/${activeId}/screening`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceCategory: category, decision: category }),
      });
      const data = (await response.json()) as {
        error?: string;
        updated?: number;
      };
      if (!response.ok)
        throw new Error(data.error || 'The bulk decision could not be saved.');
      await Promise.all([loadScreening(activeId), refresh()]);
      setNotice(
        `${data.updated || 0} article${data.updated === 1 ? '' : 's'} marked ${category}.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The bulk decision could not be saved.',
      );
    } finally {
      setScreeningSaving(null);
    }
  }

  async function openFullTextScreening() {
    if (!activeId) return;
    setError('');
    try {
      const response = await fetch(`/api/reviews/${activeId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...draft, stage: 'fulltext' }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(
          data.error || 'Full-text screening could not be opened.',
        );
      setStep(4);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Full-text screening could not be opened.',
      );
    }
  }

  async function loadFullTextCriteria(reviewId: string) {
    try {
      const response = await fetch(
        `/api/reviews/${reviewId}/full-texts/criteria`,
      );
      const data = (await response.json()) as FullTextCriteria & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          data.error || 'Full-text criteria could not be loaded.',
        );
      const next = {
        useTiabCriteria: data.useTiabCriteria,
        inclusion: data.inclusion || '',
        exclusion: data.exclusion || '',
        declared: data.declared,
        updatedAt: data.updatedAt,
      };
      setFullTextCriteria(next);
      setFullTextCriteriaDraft(next);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Full-text criteria could not be loaded.',
      );
    }
  }

  async function saveFullTextCriteria() {
    if (!activeId) return;
    setFullTextCriteriaSaving(true);
    setError('');
    try {
      const response = await fetch(
        `/api/reviews/${activeId}/full-texts/criteria`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            useTiabCriteria: fullTextCriteriaDraft.useTiabCriteria,
            inclusion: fullTextCriteriaDraft.inclusion,
            exclusion: fullTextCriteriaDraft.exclusion,
          }),
        },
      );
      const data = (await response.json()) as FullTextCriteria & {
        error?: string;
        assessmentsReset?: boolean;
      };
      if (!response.ok)
        throw new Error(data.error || 'Full-text criteria could not be saved.');
      const next = {
        useTiabCriteria: data.useTiabCriteria,
        inclusion: data.inclusion || '',
        exclusion: data.exclusion || '',
        declared: true,
        updatedAt: data.updatedAt,
      };
      setFullTextCriteria(next);
      setFullTextCriteriaDraft(next);
      if (data.assessmentsReset) await loadFullTextScreening(activeId);
      setNotice(
        data.assessmentsReset
          ? 'Full-text criteria saved. Previous full-text detective results were cleared for a fresh screening.'
          : 'Required full-text criteria saved.',
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Full-text criteria could not be saved.',
      );
    } finally {
      setFullTextCriteriaSaving(false);
    }
  }

  async function discoverOpenAccessFullTexts(
    reviewId: string,
    retryErrors = false,
  ) {
    setOpenAccessSearching(true);
    if (!retryErrors) setOpenAccessSummary(null);
    const totals: OpenAccessSummary = {
      checked: 0,
      added: 0,
      unavailable: 0,
      errors: 0,
    };
    try {
      let remaining = 1;
      while (remaining > 0) {
        const response = await fetch(
          `/api/reviews/${reviewId}/full-texts/open-access`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ retryErrors }),
          },
        );
        const data = (await response.json()) as OpenAccessSummary & {
          error?: string;
          remaining?: number;
        };
        if (!response.ok)
          throw new Error(data.error || 'Open-access search could not run.');
        totals.checked += data.checked || 0;
        totals.added += data.added || 0;
        totals.unavailable += data.unavailable || 0;
        totals.errors += data.errors || 0;
        remaining = retryErrors ? 0 : Number(data.remaining || 0);
        setOpenAccessSummary({ ...totals });
        if (!data.checked) break;
      }
      await Promise.all([
        loadFullTextFiles(reviewId),
        loadFullTextScreening(reviewId),
      ]);
      if (totals.added)
        setNotice(
          `${totals.added} open-access full text${totals.added === 1 ? '' : 's'} added automatically.`,
        );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Open-access search could not run.',
      );
    } finally {
      setOpenAccessSearching(false);
    }
  }

  async function loadFullTextFiles(reviewId: string) {
    setFullTextLoading(true);
    try {
      const response = await fetch(`/api/reviews/${reviewId}/full-texts`);
      const data = (await response.json()) as {
        error?: string;
        files?: FullTextFile[];
      };
      if (!response.ok)
        throw new Error(data.error || 'Full-text files could not be loaded.');
      setFullTextFiles(data.files || []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Full-text files could not be loaded.',
      );
    } finally {
      setFullTextLoading(false);
    }
  }

  async function uploadFullText(referenceId: string, file: File) {
    if (!activeId) return;
    setFullTextUploadingId(referenceId);
    setError('');
    try {
      if (file.size > 25 * 1024 * 1024)
        throw new Error('Full-text PDFs must be 25 MB or smaller.');
      const { aiFile, articleText } = await preparePdfForAi(file);
      const form = new FormData();
      form.append('referenceId', referenceId);
      form.append('file', file);
      form.append('articleText', articleText);
      if (aiFile) form.append('aiFile', aiFile);
      const response = await fetch(`/api/reviews/${activeId}/full-texts`, {
        method: 'POST',
        body: form,
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error || 'The full text could not be uploaded.');
      await Promise.all([
        loadFullTextFiles(activeId),
        loadFullTextScreening(activeId),
      ]);
      setFullTextBatchProgress(null);
      setNotice(
        file.size > FULL_TEXT_COMPRESSION_THRESHOLD && !aiFile
          ? 'Full text added. AI will read the extracted article text; the original PDF is available in the reader.'
          : 'Full text added to the article.',
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The full text could not be uploaded.',
      );
    } finally {
      setFullTextUploadingId(null);
    }
  }

  async function optimizeStoredFullText(reviewId: string, file: FullTextFile) {
    setFullTextOptimizingId(file.referenceId);
    setError('');
    try {
      const sourceResponse = await fetch(
        `/api/reviews/${reviewId}/full-texts/${file.referenceId}/content`,
      );
      if (!sourceResponse.ok)
        throw new Error('The stored full text could not be prepared.');
      const { aiFile, articleText } = await preparePdfForAi(
        await sourceResponse.blob(),
      );
      const form = new FormData();
      form.append('articleText', articleText);
      if (aiFile) form.append('file', aiFile);
      const saveResponse = await fetch(
        `/api/reviews/${reviewId}/full-texts/${file.referenceId}/optimize`,
        { method: 'POST', body: form },
      );
      const data = (await saveResponse.json()) as { error?: string };
      if (!saveResponse.ok)
        throw new Error(
          data.error || 'The optimized AI copy could not be saved.',
        );
      await Promise.all([
        loadFullTextFiles(reviewId),
        loadFullTextScreening(reviewId),
      ]);
      setFullTextBatchProgress(null);
      if (!aiFile)
        setNotice('AI will read the extracted article text; the original PDF is available in the reader.');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'This PDF could not be prepared for AI screening.',
      );
    } finally {
      setFullTextOptimizingId(null);
    }
  }

  async function loadFullTextScreening(reviewId: string) {
    setFullTextScreeningLoading(true);
    try {
      const response = await fetch(
        `/api/reviews/${reviewId}/full-texts/screening`,
      );
      const data = (await response.json()) as {
        error?: string;
        items?: FullTextScreeningItem[];
        providers?: ProviderStatus[];
      };
      if (!response.ok)
        throw new Error(
          data.error || 'Full-text screening results could not be loaded.',
        );
      setFullTextScreeningItems(data.items || []);
      setFullTextProviders(data.providers || []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Full-text screening results could not be loaded.',
      );
    } finally {
      setFullTextScreeningLoading(false);
    }
  }

  async function requestFullTextAssessment(
    referenceId: string,
    adjudicate = false,
    batchRun = false,
  ): Promise<FullTextAssessmentOutcome> {
    if (!activeId) return 'fatal';
    setFullTextRunningId(referenceId);
    setError('');
    try {
      const response = await fetch(
        `/api/reviews/${activeId}/full-texts/screening`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            referenceId,
            adjudicate,
            costConfirmed: true,
          }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        status?: string;
        providers?: { errorCode?: string | null }[];
      };
      if (!response.ok && (response.status === 429 || response.status >= 500)) {
        if (!batchRun)
          setNotice(
            'This article was set aside after an AI service interruption. Run the unfinished articles again to retry it.',
          );
        return 'deferred';
      }
      if (!response.ok)
        throw new Error(data.error || 'Full-text screening could not run.');
      if (data.status === 'partial_failure') {
        if (!canRetryAutomatically(data.providers))
          throw new Error(
            'A detective connection needs attention before full-text screening can continue.',
          );
        if (!batchRun) {
          await loadFullTextScreening(activeId);
          setNotice(
            'This article was set aside after automatic retries. Run the unfinished articles again when the AI service is available.',
          );
        }
        return 'deferred';
      }
      if (!batchRun) {
        await loadFullTextScreening(activeId);
        setNotice(
          adjudicate
            ? 'Sherlock Holmes saved an advisory full-text opinion.'
            : 'All three full-text detective decisions were saved.',
        );
      }
      return 'complete';
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Full-text screening could not run.',
      );
      return 'fatal';
    } finally {
      setFullTextRunningId(null);
    }
  }

  async function decideFullText(
    referenceId: string,
    decision: 'include' | 'exclude' | 'unclear',
  ) {
    if (!activeId) return;
    setFullTextDecisionSavingId(referenceId);
    setError('');
    try {
      const response = await fetch(
        `/api/reviews/${activeId}/full-texts/${referenceId}/decision`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ decision }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(
          data.error || 'The full-text decision could not be saved.',
        );
      await loadFullTextScreening(activeId);
      setNotice(
        `Researcher full-text decision saved as ${screeningDecisionLabel(decision)}.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The full-text decision could not be saved.',
      );
    } finally {
      setFullTextDecisionSavingId(null);
    }
  }

  async function runFullTextBatch() {
    if (!activeId || !fullTextCostConfirmed || !fullTextCriteria.declared)
      return;
    const pending = fullTextScreeningItems
      .filter((item) => {
        const hasOptimizedCopy = fullTextFiles.some(
          (file) => file.referenceId === item.id && Boolean(file.aiSize),
        );
        return (
          (item.marpleStatus !== 'complete' ||
            item.poirotStatus !== 'complete' ||
            item.zeousStatus !== 'complete') &&
          (fullTextDetectiveIssues(item).length === 0 ||
            (fullTextNeedsLongRun(item) &&
              (item.size <= FULL_TEXT_COMPRESSION_THRESHOLD ||
                hasOptimizedCopy)))
        );
      })
      .sort((left, right) => left.size - right.size);
    setError('');
    setNotice('');
    setFullTextBatchProgress({
      processed: 0,
      total: pending.length,
      deferred: 0,
      automaticRetrying: false,
    });
    let deferredItems: FullTextScreeningItem[] = [];
    let processed = 0;
    let stopped = false;
    for (let index = 0; index < pending.length; index += 1) {
      const outcome = await requestFullTextAssessment(
        pending[index].id,
        false,
        true,
      );
      if (outcome === 'fatal') {
        stopped = true;
        break;
      }
      processed += 1;
      if (outcome === 'deferred') deferredItems.push(pending[index]);
      setFullTextBatchProgress({
        processed,
        total: pending.length,
        deferred: deferredItems.length,
        automaticRetrying: false,
      });
    }
    if (!stopped && deferredItems.length) {
      setFullTextBatchProgress({
        processed,
        total: pending.length,
        deferred: deferredItems.length,
        automaticRetrying: true,
      });
      await waitForAutomaticRetry(1);
      const stillDeferred: FullTextScreeningItem[] = [];
      for (let index = 0; index < deferredItems.length; index += 1) {
        const item = deferredItems[index];
        const outcome = await requestFullTextAssessment(item.id, false, true);
        if (outcome === 'fatal') {
          stopped = true;
          stillDeferred.push(...deferredItems.slice(index));
          break;
        }
        if (outcome === 'deferred') stillDeferred.push(item);
        setFullTextBatchProgress({
          processed,
          total: pending.length,
          deferred: stillDeferred.length + (deferredItems.length - index - 1),
          automaticRetrying: true,
        });
      }
      deferredItems = stillDeferred;
    }
    setFullTextCostConfirmed(false);
    await loadFullTextScreening(activeId);
    setFullTextBatchProgress({
      processed,
      total: pending.length,
      deferred: deferredItems.length,
      automaticRetrying: false,
    });
    if (!stopped) {
      setNotice(
        deferredItems.length
          ? `Automatic screening finished. ${deferredItems.length} article${deferredItems.length === 1 ? ' needs' : 's need'} attention; the exact article and issue are shown below.`
          : `Full-text screening finished for ${processed} article${processed === 1 ? '' : 's'}.`,
      );
    }
  }

  async function resolveAllFullTextConflicts() {
    if (!activeId) return;
    const conflicts = fullTextScreeningItems.filter(
      (item) =>
        fullTextCategory(item) === 'conflict' &&
        item.sherlockStatus !== 'complete',
    );
    let reviewed = 0;
    let deferred = 0;
    for (const item of conflicts) {
      const outcome = await requestFullTextAssessment(item.id, true, true);
      if (outcome === 'fatal') break;
      if (outcome === 'complete') reviewed += 1;
      if (outcome === 'deferred') deferred += 1;
    }
    await loadFullTextScreening(activeId);
    if (reviewed || deferred)
      setNotice(
        deferred
          ? `Sherlock Holmes reviewed ${reviewed} conflict${reviewed === 1 ? '' : 's'}; ${deferred} slow article${deferred === 1 ? ' was' : 's were'} set aside for retry.`
          : `Sherlock Holmes reviewed ${reviewed} full-text conflict${reviewed === 1 ? '' : 's'}.`,
      );
  }

  async function runAiScreening(referenceId: string, adjudicate = false) {
    if (!activeId) return;
    setAiRunningId(referenceId);
    setError('');
    setNotice('');
    try {
      let retryAttempt = 0;
      while (true) {
        const response = await fetch(`/api/reviews/${activeId}/screening/run`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ referenceId, adjudicate }),
        });
        const data = (await response.json()) as {
          error?: string;
          status?: string;
          providers?: { errorCode?: string | null }[];
        };
        if (
          !response.ok &&
          (response.status === 429 || response.status >= 500)
        ) {
          retryAttempt += 1;
          await waitForAutomaticRetry(retryAttempt);
          continue;
        }
        if (!response.ok)
          throw new Error(data.error || 'AI screening could not be completed.');
        if (data.status === 'partial_failure') {
          if (!canRetryAutomatically(data.providers))
            throw new Error(
              'A detective connection needs attention before screening can continue.',
            );
          retryAttempt += 1;
          await waitForAutomaticRetry(retryAttempt);
          continue;
        }
        break;
      }
      await loadScreening(activeId);
      if (!adjudicate) setCostConfirmed(false);
      setNotice(
        adjudicate
          ? 'The optional conflict review was saved.'
          : 'All three detective decisions were saved.',
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'AI screening could not be completed.',
      );
    } finally {
      setAiRunningId(null);
    }
  }

  async function resolveAllScreeningConflicts() {
    if (!activeId) return;
    const conflictCount = screeningSummary.unresolvedConflicts;
    if (!conflictCount) return;
    setAiRunningId('all-conflicts');
    setError('');
    setNotice('');
    try {
      let reviewed = 0;
      for (let index = 0; index < conflictCount; index += 1) {
        const response = await fetch(`/api/reviews/${activeId}/screening/run`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ resolveNextConflict: true }),
        });
        const data = (await response.json()) as {
          error?: string;
          status?: string;
        };
        if (response.status === 409) break;
        if (!response.ok)
          throw new Error(data.error || 'A conflict could not be reviewed.');
        if (data.status === 'partial_failure')
          throw new Error(
            'Sherlock Holmes could not complete a review. Completed opinions were saved; try again when ready.',
          );
        reviewed += 1;
      }
      await loadScreening(activeId);
      setNotice(
        `Sherlock Holmes reviewed ${reviewed} conflict${reviewed === 1 ? '' : 's'}. The advisory decisions are saved separately.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The conflict could not be reviewed.',
      );
    } finally {
      setAiRunningId(null);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="min-h-screen">
        {navOpen && (
          <button
            aria-label="Close workspace navigation"
            className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[2px]"
            onClick={() => setNavOpen(false)}
          />
        )}
        <aside
          className={`fixed left-0 top-0 z-50 h-screen w-[min(348px,calc(100vw-20px))] overflow-hidden border-r bg-card shadow-2xl transition-transform duration-300 ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="grid h-full grid-cols-[74px_minmax(0,1fr)]">
            <div className="workspace-rail flex h-full flex-col items-center py-4 text-white">
              <span className="brand-mark grid size-11 place-items-center rounded-2xl">
                <BookOpenCheck className="size-5" />
              </span>
              <nav className="mt-8 flex flex-col gap-2" aria-label="Primary">
                <RailButton label="Home" active icon={<Home />} />
                <RailButton label="Library" icon={<Layers3 />} />
                <RailButton label="Settings" icon={<Settings />} />
              </nav>
              <div className="mt-auto flex flex-col items-center gap-3">
                <button
                  onClick={() => setShowBilling(true)}
                  className="grid size-10 place-items-center rounded-xl text-white/60 transition hover:bg-white/10 hover:text-white"
                  aria-label="Plan"
                >
                  <Sparkles className="size-5" />
                </button>
                <span className="grid size-10 place-items-center rounded-xl bg-white/12 text-sm font-semibold">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
              </div>
            </div>
            <div className="flex min-w-0 flex-col bg-card p-4">
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="font-semibold tracking-tight">EvidenceFlow</p>
                  <p className="text-xs text-muted-foreground">
                    Research workspace
                  </p>
                </div>
                <button
                  onClick={() => setNavOpen(false)}
                  className="grid size-9 place-items-center rounded-xl border bg-card"
                  aria-label="Close workspace navigation"
                >
                  <X />
                </button>
              </div>
              <Button
                onClick={startNew}
                className="mt-5 h-11 w-full justify-start shadow-lg shadow-primary/15"
              >
                <Plus /> New review
              </Button>
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your reviews"
                  className="h-10 w-full rounded-xl border bg-muted/45 pl-9 pr-3 text-sm outline-none transition focus:border-primary/40 focus:bg-card focus:ring-4 focus:ring-primary/8"
                />
              </div>
              <div className="mb-2 mt-7 flex items-center justify-between px-1">
                <p className="text-xs font-semibold uppercase tracking-[.15em] text-muted-foreground">
                  Recent reviews
                </p>
                <Badge variant="outline">{reviews.length}</Badge>
              </div>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
                {loading && (
                  <p className="px-2 py-3 text-sm text-muted-foreground">
                    Loading your reviews…
                  </p>
                )}
                {!loading && filtered.length === 0 && (
                  <p className="px-2 py-3 text-sm leading-6 text-muted-foreground">
                    No saved reviews yet. Start one above.
                  </p>
                )}
                {filtered.map((review) => (
                  <button
                    key={review.id}
                    onClick={() => choose(review)}
                    className={`review-link w-full rounded-xl border px-3 py-3 text-left transition ${activeId === review.id ? 'active border-primary/20' : 'border-transparent hover:bg-muted/60'}`}
                  >
                    <span className="block truncate text-sm font-semibold">
                      {review.title || 'Untitled review'}
                    </span>
                    <span className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock3 className="size-3" />{' '}
                      {new Date(review.updatedAt).toLocaleDateString()}{' '}
                      <span>·</span> {review.referenceCount} refs
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border bg-gradient-to-br from-primary/8 to-cyan-400/8 p-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <span className="text-sm font-semibold">
                    {subscription?.status === 'active'
                      ? 'Pro plan'
                      : `${trialDays} trial days left`}
                  </span>
                </div>
                <button
                  onClick={() => setShowBilling(true)}
                  className="mt-2 text-xs font-medium text-primary hover:underline"
                >
                  Manage plan →
                </button>
              </div>
              <div className="mt-3 flex items-center gap-3 border-t px-1 pt-4">
                <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
                  <UserRound className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {user.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </span>
                <a
                  href="/signout-with-chatgpt?return_to=/"
                  target="_top"
                  aria-label="Sign out"
                >
                  <LogOut className="size-4 text-muted-foreground" />
                </a>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="workspace-header sticky top-0 z-30 flex h-[72px] items-center justify-between border-b px-4 backdrop-blur-xl sm:px-7">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setNavOpen(true)}
                className="grid size-10 place-items-center rounded-xl border bg-card"
                aria-label="Open workspace navigation"
              >
                <Menu className="size-4" />
              </button>
              <div>
                <p className="text-sm font-semibold">
                  {activeId
                    ? draft.title || 'Untitled review'
                    : 'New systematic review'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {activeId
                    ? 'All changes saved to this workspace'
                    : 'Complete the protocol to save'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="hidden border-emerald-200 bg-emerald-50 text-emerald-700 sm:flex"
              >
                <ShieldCheck /> Researcher controlled
              </Badge>
              <Button
                variant="outline"
                size="icon"
                aria-label="Help"
                className="bg-card"
              >
                <CircleHelp />
              </Button>
            </div>
          </header>
          <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-8 lg:py-10">
            <div className="mb-8 overflow-x-auto">
              <div className="flex min-w-[760px] items-center">
                {stages.map(([number, label], index) => (
                  <div key={number} className="flex flex-1 items-center">
                    <button
                      onClick={() => setStep(index + 1)}
                      disabled={
                        (index > 0 && !activeId) ||
                        (index === 2 &&
                          !reviews.find((review) => review.id === activeId)
                            ?.referenceCount) ||
                        (index === 3 &&
                          reviews.find((review) => review.id === activeId)
                            ?.stage !== 'fulltext')
                      }
                      className={`flex min-w-0 items-center gap-2 whitespace-nowrap ${index >= 1 && index <= 3 ? 'text-[11px]' : 'text-xs'} ${step === index + 1 ? 'font-semibold text-primary' : index < step ? 'text-[var(--success-ink)]' : 'text-muted-foreground'} disabled:opacity-55`}
                    >
                      <span
                        className={`grid size-7 min-h-7 min-w-7 shrink-0 place-items-center overflow-hidden rounded-full border text-[10px] leading-none ${step === index + 1 ? 'border-primary bg-primary text-primary-foreground' : index < step ? 'border-[var(--success)] bg-[var(--success-soft)]' : 'bg-card'}`}
                      >
                        {index < step ? <Check className="size-3.5" /> : number}
                      </span>
                      {label}
                    </button>
                    {index < stages.length - 1 && (
                      <span className="mx-2 h-px min-w-4 flex-1 bg-border" />
                    )}
                  </div>
                ))}
              </div>
            </div>
            {error && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive"
              >
                {error}
              </div>
            )}
            {notice && (
              <div
                role="status"
                className="mb-5 rounded-xl border border-[var(--success)]/25 bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success-ink)]"
              >
                {notice}
              </div>
            )}
            {step === 1 ? (
              <ProtocolStep
                draft={draft}
                update={update}
                completed={completed}
                saving={saving}
                save={saveProtocol}
              />
            ) : step === 2 ? (
              <ImportStep
                activeId={activeId}
                importing={importing}
                result={importResult}
                fileInput={fileInput}
                upload={upload}
                uploads={uploads}
                importSummary={importSummary}
                pairs={duplicatePairs}
                duplicateSummary={duplicateSummary}
                duplicatePage={duplicatePage}
                duplicateTotalPages={duplicateTotalPages}
                changeDuplicatePage={(page) => {
                  setDuplicatePage(page);
                  if (activeId) void loadImportWorkspace(activeId, page);
                }}
                view={importView}
                setView={setImportView}
                loading={detailsLoading}
                decide={decideDuplicate}
                continueToScreening={() => setStep(3)}
              />
            ) : step === 3 ? (
              <ScreeningSetup
                providers={providers}
                providersLoading={providersLoading}
                references={screeningReferences}
                categorizedResults={categorizedResults}
                summary={screeningSummary}
                queueLoading={screeningLoading}
                unresolvedDuplicates={unresolvedDuplicates}
                savingId={screeningSaving}
                aiRunningId={aiRunningId}
                decide={decideScreening}
                decideCategory={decideScreeningCategory}
                runAi={runAiScreening}
                resolveAllConflicts={resolveAllScreeningConflicts}
                job={screeningJob}
                batchSize={batchSize}
                setBatchSize={setBatchSize}
                costConfirmed={costConfirmed}
                setCostConfirmed={setCostConfirmed}
                batchRunning={batchRunning}
                startBatch={startScreeningBatch}
                cancelBatch={cancelScreeningBatch}
                activeId={activeId}
                filter={screeningFilter}
                setFilter={(filter) => {
                  setScreeningFilter(filter);
                  setScreeningPage(1);
                }}
                page={screeningPage}
                totalPages={screeningTotalPages}
                setPage={setScreeningPage}
                continueToFullText={openFullTextScreening}
              />
            ) : (
              <FullTextStep
                reviewId={activeId}
                results={categorizedResults}
                files={fullTextFiles}
                loading={
                  screeningLoading ||
                  fullTextLoading ||
                  fullTextScreeningLoading
                }
                uploadingId={fullTextUploadingId}
                optimizingId={fullTextOptimizingId}
                upload={uploadFullText}
                runResolver={(id) => runAiScreening(id, true)}
                aiRunningId={aiRunningId}
                adjudicatorReady={providers.some(
                  (provider) =>
                    provider.id === 'adjudicator' && provider.configured,
                )}
                backToScreening={() => setStep(3)}
                screeningItems={fullTextScreeningItems}
                screeningProviders={fullTextProviders}
                screeningRunningId={fullTextRunningId}
                costConfirmed={fullTextCostConfirmed}
                setCostConfirmed={setFullTextCostConfirmed}
                batchProgress={fullTextBatchProgress}
                startScreening={runFullTextBatch}
                askFullTextSherlock={(id) =>
                  requestFullTextAssessment(id, true)
                }
                askAllFullTextSherlock={resolveAllFullTextConflicts}
                decisionSavingId={fullTextDecisionSavingId}
                decideFullText={decideFullText}
                criteria={fullTextCriteria}
                criteriaDraft={fullTextCriteriaDraft}
                setCriteriaDraft={setFullTextCriteriaDraft}
                criteriaDirty={fullTextCriteriaDirty}
                criteriaSaving={fullTextCriteriaSaving}
                saveCriteria={saveFullTextCriteria}
                openAccessSearching={openAccessSearching}
                openAccessSummary={openAccessSummary}
                retryOpenAccess={() =>
                  activeId && discoverOpenAccessFullTexts(activeId, true)
                }
              />
            )}
          </div>
        </section>
      </div>
      {showBilling && <BillingDialog close={() => setShowBilling(false)} />}
    </main>
  );
}

function ProtocolStep({
  draft,
  update,
  completed,
  saving,
  save,
}: {
  draft: Draft;
  update: (field: keyof Draft, value: string) => void;
  completed: number;
  saving: boolean;
  save: () => void;
}) {
  return (
    <div>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-primary">
            Step 1 · Review protocol
          </p>
          <h1 className="text-3xl font-semibold tracking-[-.035em]">
            Define what evidence belongs.
          </h1>
        </div>
        <div className="min-w-48 rounded-xl border bg-card p-3">
          <div className="mb-2 flex justify-between text-xs">
            <span>Required fields</span>
            <span>{completed}/4</span>
          </div>
          <Progress value={(completed / 4) * 100} />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="surface-card xl:col-span-2">
          <SectionHeading icon={<FlaskConical />} title="Review purpose" />
          <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-2">
            <Field label="Review title" required>
              <Input
                value={draft.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder="e.g. Digital interventions for adherence"
                className="h-11"
              />
            </Field>
            <Field label="Main purpose" required>
              <Textarea
                value={draft.purpose}
                onChange={(e) => update('purpose', e.target.value)}
                placeholder="We want to determine whether…"
                className="min-h-28"
              />
            </Field>
          </div>
        </section>
        <section className="surface-card">
          <SectionHeading icon={<Check />} title="Inclusion criteria" />
          <div className="p-5 sm:p-6">
            <Field label="Inclusion criteria" required>
              <Textarea
                value={draft.inclusion}
                onChange={(e) => update('inclusion', e.target.value)}
                placeholder={'Adults aged 18+\nRandomized controlled trials'}
                className="min-h-44"
              />
            </Field>
          </div>
        </section>
        <section className="surface-card">
          <SectionHeading icon={<X />} title="Exclusion criteria" />
          <div className="p-5 sm:p-6">
            <Field label="Exclusion criteria" required>
              <Textarea
                value={draft.exclusion}
                onChange={(e) => update('exclusion', e.target.value)}
                placeholder={'Conference abstracts only\nAnimal studies'}
                className="min-h-44"
              />
            </Field>
          </div>
        </section>
        <section className="surface-card xl:col-span-2">
          <SectionHeading icon={<Files />} title="PICO framework" />
          <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-2">
            {(
              [
                ['population', 'P · Population'],
                ['intervention', 'I · Intervention'],
                ['comparison', 'C · Comparison'],
                ['outcomes', 'O · Outcomes'],
              ] as const
            ).map(([field, label]) => (
              <Field key={field} label={label} optional>
                <Textarea
                  value={draft[field]}
                  onChange={(e) => update(field, e.target.value)}
                  className="min-h-24"
                />
              </Field>
            ))}
          </div>
        </section>
      </div>
      <div className="mt-6 flex justify-end">
        <Button
          onClick={save}
          disabled={completed < 4 || saving}
          size="lg"
          className="h-11 px-5"
        >
          {saving ? 'Saving…' : 'Save & continue'} <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

function ImportStep({
  activeId,
  importing,
  result,
  fileInput,
  upload,
  uploads,
  importSummary,
  pairs,
  duplicateSummary,
  duplicatePage,
  duplicateTotalPages,
  changeDuplicatePage,
  view,
  setView,
  loading,
  decide,
  continueToScreening,
}: {
  activeId: string | null;
  importing: boolean;
  result: ImportResult | null;
  fileInput: React.RefObject<HTMLInputElement | null>;
  upload: (files: File[]) => void;
  uploads: UploadHistory[];
  importSummary: ImportSummary;
  pairs: DuplicatePair[];
  duplicateSummary: DuplicateSummary;
  duplicatePage: number;
  duplicateTotalPages: number;
  changeDuplicatePage: (page: number) => void;
  view: 'upload' | 'duplicates' | 'history';
  setView: (view: 'upload' | 'duplicates' | 'history') => void;
  loading: boolean;
  decide: (id: string, decision: 'confirmed_duplicate' | 'keep_both') => void;
  continueToScreening: () => void;
}) {
  const pending = duplicateSummary.needsReview;
  return (
    <div>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-primary">
            Step 2 · Import & deduplicate
          </p>
          <h1 className="text-3xl font-semibold tracking-[-.04em] sm:text-4xl">
            Build one trustworthy library.
          </h1>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Summary label="Files" value={importSummary.fileCount} />
          <Summary label="Articles" value={importSummary.totalRecords} />
          <Summary
            label="Auto-resolved"
            value={duplicateSummary.autoResolved}
          />
          <Summary label="To review" value={pending} />
        </div>
      </div>
      {uploads.length > 0 && (
        <div className="mb-5 flex flex-col justify-between gap-4 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-card to-card p-4 shadow-sm sm:flex-row sm:items-center">
          <div>
            <p className="font-semibold">Deduplicated library ready</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Export the retained references with their complete bibliographic
              metadata.
            </p>
            {pending > 0 && (
              <p className="mt-1 text-sm font-medium text-amber-700">
                Resolve {pending} possible duplicate{pending === 1 ? '' : 's'}{' '}
                before exporting.
              </p>
            )}
          </div>
          {pending === 0 && activeId ? (
            <a
              href={`/api/reviews/${activeId}/references/export-ris`}
              download
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:bg-primary/90"
            >
              <Download className="size-4" /> Download retained RIS
            </a>
          ) : (
            <Button disabled className="h-11 shrink-0 px-5">
              <Download /> Download retained RIS
            </Button>
          )}
        </div>
      )}
      <div className="mb-5 flex gap-2 overflow-x-auto rounded-2xl border bg-card/75 p-1.5 shadow-sm backdrop-blur">
        {(
          [
            ['upload', UploadCloud, 'Import'],
            [
              'duplicates',
              GitMerge,
              `Duplicates${duplicateSummary.totalCandidates ? ` · ${duplicateSummary.totalCandidates}` : ''}`,
            ],
            ['history', History, 'History'],
          ] as const
        ).map(([key, Icon, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium transition ${view === key ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20' : 'text-muted-foreground hover:bg-muted'}`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>
      {loading && (
        <div className="surface-card grid min-h-64 place-items-center text-sm text-muted-foreground">
          Loading review data…
        </div>
      )}
      {!loading && view === 'upload' && (
        <section className="surface-card">
          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[.72fr_1.28fr]">
            <div>
              <input
                ref={fileInput}
                className="hidden"
                type="file"
                multiple
                accept=".ris,.nbib,.csv,.txt,text/plain"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  if (files.length) upload(files);
                  event.currentTarget.value = '';
                }}
              />
              <button
                disabled={!activeId || importing}
                onClick={() => fileInput.current?.click()}
                className="upload-zone flex min-h-64 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-primary/35 p-6 text-center disabled:opacity-50"
              >
                <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
                  <UploadCloud />
                </span>
                <span className="mt-5 font-semibold">
                  {importing
                    ? 'Adding library files…'
                    : 'Add one or more library files'}
                </span>
                <span className="mt-2 text-sm text-muted-foreground">
                  RIS, PubMed NBIB, CSV, or bibliographic TXT · up to 25,000
                  records and 30 MB per file
                </span>
                <span className="mt-4 rounded-full bg-card px-3 py-1.5 text-xs font-medium text-primary shadow-sm">
                  Choose files
                </span>
              </button>
              <div className="mt-4 flex gap-3 rounded-xl bg-[var(--info-soft)] p-4 text-sm leading-6 text-[var(--info-ink)]">
                <Info className="mt-1 size-4 shrink-0" />
                Importing is free. Add more files whenever needed; every source
                remains private and traceable.
              </div>
            </div>
            <div>
              {!result ? (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border bg-muted/20 p-8 text-center">
                  <Database className="size-10 text-primary/35" />
                  <h2 className="mt-4 font-semibold">
                    Your import summary will appear here
                  </h2>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                    Exports from PubMed, Scopus, Web of Science, and Embase are
                    normalized into the same reference structure.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <Summary
                      label="References imported"
                      value={result.recordCount}
                    />
                    <Summary
                      label="Auto-resolved"
                      value={result.autoResolvedCount}
                    />
                    <Summary label="Needs review" value={result.reviewCount} />
                  </div>
                  <ImportQuality diagnostics={result.diagnostics} />
                  <ReferencePreview rows={result.preview} />
                </>
              )}
            </div>
          </div>
        </section>
      )}
      {!loading && view === 'duplicates' && (
        <>
          <div className="mb-4 flex flex-col justify-between gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center">
            <div>
              <p className="font-semibold">Confidence-based resolution</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {duplicateSummary.autoResolved} matches above 90% were resolved
                automatically. Expand any comparison to inspect its similarity,
                source files, title, authors, and identifiers. {pending}{' '}
                uncertain {pending === 1 ? 'pair needs' : 'pairs need'} your
                review.
              </p>
            </div>
          </div>
          <DuplicateQueue pairs={pairs} page={duplicatePage} decide={decide} />
          {duplicateTotalPages > 1 && (
            <div className="mt-4 flex items-center justify-between rounded-2xl border bg-card px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Duplicate audit page {duplicatePage} of {duplicateTotalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={duplicatePage <= 1}
                  onClick={() => changeDuplicatePage(duplicatePage - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={duplicatePage >= duplicateTotalPages}
                  onClick={() => changeDuplicatePage(duplicatePage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {!loading && view === 'history' && <ImportHistory uploads={uploads} />}
      {!loading && uploads.length > 0 && (
        <div className="mt-6 flex justify-end">
          <Button
            onClick={continueToScreening}
            disabled={pending > 0}
            size="lg"
          >
            {pending
              ? 'Review duplicates first'
              : 'Continue to screening setup'}{' '}
            <ArrowRight />
          </Button>
        </div>
      )}
    </div>
  );
}

function ImportQuality({
  diagnostics,
}: {
  diagnostics: ImportResult['diagnostics'];
}) {
  return (
    <div className="mt-4 rounded-2xl border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">
            Detected source
          </p>
          <p className="mt-1 font-semibold">{diagnostics.sourceDatabase}</p>
        </div>
        <Badge variant="outline" className="bg-card">
          Field check complete
        </Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Object.entries(diagnostics.coverage).map(([field, value]) => (
          <div
            key={field}
            className="rounded-xl bg-card p-2.5 text-center shadow-sm"
          >
            <p className="text-lg font-semibold tabular-nums">{value}%</p>
            <p className="mt-0.5 text-xs capitalize text-muted-foreground">
              {field}
            </p>
          </div>
        ))}
      </div>
      {diagnostics.warnings.length > 0 && (
        <div className="mt-4 space-y-2">
          {diagnostics.warnings.map((warning) => (
            <p
              key={warning}
              className="flex gap-2 text-sm leading-5 text-amber-700"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {warning}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function ReferencePreview({ rows }: { rows: ImportResult['preview'] }) {
  return (
    <div className="mt-4 overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Recognized reference</TableHead>
            <TableHead>Year</TableHead>
            <TableHead>Identifier</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((item, index) => (
            <TableRow key={index}>
              <TableCell className="max-w-72 truncate font-medium">
                {item.title || 'Untitled record'}
              </TableCell>
              <TableCell>{item.year || '—'}</TableCell>
              <TableCell className="text-muted-foreground">
                {item.doi
                  ? `DOI ${item.doi}`
                  : item.pmid
                    ? `PMID ${item.pmid}`
                    : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DuplicateQueue({
  pairs,
  page,
  decide,
}: {
  pairs: DuplicatePair[];
  page: number;
  decide: (id: string, decision: 'confirmed_duplicate' | 'keep_both') => void;
}) {
  if (!pairs.length)
    return (
      <div className="surface-card grid min-h-72 place-items-center p-8 text-center">
        <div>
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--success-soft)] text-[var(--success-ink)]">
            <CheckCircle2 />
          </span>
          <h2 className="mt-4 text-lg font-semibold">
            No duplicate comparisons yet
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Add two or more database exports and possible matches will appear
            here with their source and similarity.
          </p>
        </div>
      </div>
    );
  return (
    <div className="space-y-3">
      {pairs.map((pair, index) => (
        <details key={pair.id} className="surface-card group overflow-hidden">
          <summary className="cursor-pointer list-none px-4 py-4 sm:px-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <DuplicateStatus pair={pair} />
                  <Badge variant="outline" className="bg-card">
                    {pair.confidence}% similarity
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Comparison {(page - 1) * 100 + index + 1}
                  </span>
                </div>
                <p className="mt-2 truncate text-sm font-semibold">
                  {pair.leftTitle || 'Untitled reference'}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {pair.leftSource || 'Unknown source'} ↔{' '}
                  {pair.rightSource || 'Unknown source'} ·{' '}
                  {pair.rightTitle || 'Untitled reference'}
                </p>
              </div>
              <ChevronDown className="mt-1 size-5 shrink-0 text-muted-foreground transition group-open:rotate-180" />
            </div>
          </summary>
          <div className="border-t">
            <div className="grid md:grid-cols-2">
              <ReferenceSide
                label="Record A"
                title={pair.leftTitle}
                authors={pair.leftAuthors}
                year={pair.leftYear}
                source={pair.leftSource}
                fileName={pair.leftFileName}
                identifier={
                  pair.leftDoi
                    ? `DOI ${pair.leftDoi}`
                    : pair.leftPmid
                      ? `PMID ${pair.leftPmid}`
                      : 'No identifier'
                }
              />
              <ReferenceSide
                label="Record B"
                title={pair.rightTitle}
                authors={pair.rightAuthors}
                year={pair.rightYear}
                source={pair.rightSource}
                fileName={pair.rightFileName}
                identifier={
                  pair.rightDoi
                    ? `DOI ${pair.rightDoi}`
                    : pair.rightPmid
                      ? `PMID ${pair.rightPmid}`
                      : 'No identifier'
                }
              />
            </div>
            {pair.status === 'suggested' && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-amber-50/60 px-5 py-4 dark:bg-amber-950/15">
                <p className="text-sm text-muted-foreground">
                  Are these the same study record?
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => decide(pair.id, 'keep_both')}
                  >
                    Keep both
                  </Button>
                  <Button
                    onClick={() => decide(pair.id, 'confirmed_duplicate')}
                  >
                    <GitMerge /> Mark duplicate
                  </Button>
                </div>
              </div>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

function DuplicateStatus({ pair }: { pair: DuplicatePair }) {
  if (pair.status === 'suggested')
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300">
        Needs your review
      </Badge>
    );
  if (pair.status === 'keep_both')
    return (
      <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300">
        Kept as separate records
      </Badge>
    );
  return (
    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300">
      {pair.confidence > 90
        ? 'Duplicate · auto-resolved'
        : 'Duplicate confirmed'}
    </Badge>
  );
}

function ReferenceSide({
  label,
  title,
  authors,
  year,
  source,
  fileName,
  identifier,
}: {
  label: string;
  title: string | null;
  authors: string | null;
  year: string | null;
  source: string;
  fileName: string;
  identifier: string;
}) {
  return (
    <div className="min-w-0 border-b p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
      <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">
        {label}
      </p>
      <div className="mt-2 flex min-w-0 items-center gap-2">
        <Badge variant="outline" className="shrink-0 bg-primary/5 text-primary">
          {source || 'Unknown source'}
        </Badge>
        <span
          className="truncate text-xs text-muted-foreground"
          title={fileName}
        >
          {fileName}
        </span>
      </div>
      <h3 className="mt-3 font-semibold leading-6">
        {title || 'Untitled reference'}
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {authors || 'Authors not supplied'}
        {year ? ` · ${year}` : ''}
      </p>
      <p className="mt-3 inline-flex rounded-lg bg-muted px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
        {identifier}
      </p>
    </div>
  );
}

function ImportHistory({ uploads }: { uploads: UploadHistory[] }) {
  if (!uploads.length)
    return (
      <div className="surface-card grid min-h-72 place-items-center text-sm text-muted-foreground">
        No files imported yet.
      </div>
    );
  return (
    <div className="surface-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Imported</TableHead>
            <TableHead>Records</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {uploads.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                    <FileSpreadsheet className="size-4" />
                  </span>
                  <span className="max-w-72 truncate font-medium">
                    {item.fileName}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{item.sourceDatabase}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(item.createdAt).toLocaleString()}
              </TableCell>
              <TableCell>{item.recordCount}</TableCell>
              <TableCell>{formatBytes(item.size)}</TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className="bg-[var(--success-soft)] text-[var(--success-ink)]"
                >
                  {item.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ScreeningSetup({
  providers,
  providersLoading,
  references,
  categorizedResults,
  summary,
  queueLoading,
  unresolvedDuplicates,
  savingId,
  aiRunningId,
  decide,
  decideCategory,
  runAi,
  resolveAllConflicts,
  job,
  batchSize,
  setBatchSize,
  costConfirmed,
  setCostConfirmed,
  batchRunning,
  startBatch,
  cancelBatch,
  activeId,
  filter,
  setFilter,
  page,
  totalPages,
  setPage,
  continueToFullText,
}: {
  providers: ProviderStatus[];
  providersLoading: boolean;
  references: ScreeningReference[];
  categorizedResults: CategorizedResult[];
  summary: ScreeningSummary;
  queueLoading: boolean;
  unresolvedDuplicates: number;
  savingId: string | null;
  aiRunningId: string | null;
  decide: (id: string, decision: 'include' | 'exclude' | 'unclear') => void;
  decideCategory: (category: 'include' | 'exclude') => void;
  runAi: (id: string, adjudicate?: boolean) => void;
  resolveAllConflicts: () => void;
  job: ScreeningJob | null;
  batchSize: number;
  setBatchSize: (size: number) => void;
  costConfirmed: boolean;
  setCostConfirmed: (confirmed: boolean) => void;
  batchRunning: boolean;
  startBatch: () => void;
  cancelBatch: () => void;
  activeId: string | null;
  filter: ScreeningFilter;
  setFilter: (filter: ScreeningFilter) => void;
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
  continueToFullText: () => void;
}) {
  const primaryProviders = providers.filter((provider) => !provider.optional);
  const ready =
    primaryProviders.length === 3 &&
    primaryProviders.every((provider) => provider.configured);
  const adjudicatorReady = providers.some(
    (provider) => provider.id === 'adjudicator' && provider.configured,
  );
  const remainingRecords = Math.max(0, summary.total - summary.aiAssessed);
  const selectableRecords = Math.min(2000, remainingRecords);
  const screeningAllAvailable =
    selectableRecords > 0 && batchSize === selectableRecords;
  useEffect(() => {
    if (selectableRecords > 0 && batchSize > selectableRecords)
      setBatchSize(selectableRecords);
  }, [batchSize, selectableRecords, setBatchSize]);
  return (
    <div>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-primary">
            Step 3 · Title & abstract screening
          </p>
          <h1 className="text-3xl font-semibold tracking-[-.04em] sm:text-4xl">
            Review the evidence queue.
          </h1>
        </div>
        <div className="flex gap-2">
          <Summary label="After deduplication" value={summary.total} />
          <Summary label="AI screened" value={summary.aiAssessed} />
          <Summary label="Conflicts" value={summary.conflicts} />
        </div>
      </div>
      {unresolvedDuplicates > 0 && (
        <div className="mb-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="size-5 shrink-0" />
          <span>
            <strong>
              {unresolvedDuplicates} duplicate candidate
              {unresolvedDuplicates === 1 ? '' : 's'} still need a decision.
            </strong>{' '}
            They remain visible until you resolve them in Step 2.
          </span>
        </div>
      )}
      <div className="space-y-5">
        <section className="surface-card">
          <SectionHeading icon={<Cpu />} title="AI detectives" />
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
            {providersLoading ? (
              <p className="text-sm text-muted-foreground">
                Checking secure AI configuration…
              </p>
            ) : (
              providers.map((provider) => (
                <article
                  key={provider.id}
                  className="rounded-2xl border bg-muted/20 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Sparkles className="size-4" />
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        provider.configured
                          ? 'bg-[var(--success-soft)] text-[var(--success-ink)]'
                          : 'bg-amber-50 text-amber-700'
                      }
                    >
                      {provider.configured
                        ? 'Connected'
                        : provider.optional
                          ? 'Optional'
                          : 'Setup needed'}
                    </Badge>
                  </div>
                  <h2 className="mt-4 font-semibold">{provider.label}</h2>
                  {provider.id === 'adjudicator' && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Runs only when the researcher requests conflict review.
                    </p>
                  )}
                </article>
              ))
            )}
          </div>
          <div className="border-t bg-muted/20 p-5 sm:px-6">
            <div className="rounded-2xl border bg-card p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <p className="font-semibold">Launch the investigation</p>
                </div>
                {job && (
                  <Badge variant="outline" className="w-fit capitalize">
                    {job.status}
                  </Badge>
                )}
              </div>
              {job && (job.status === 'running' || batchRunning) ? (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span>
                      {job.processedCount} of {job.requestedCount} records
                      complete
                    </span>
                    <span className="font-medium tabular-nums">
                      {Math.round(
                        (job.processedCount / job.requestedCount) * 100,
                      )}
                      %
                    </span>
                  </div>
                  <Progress
                    value={(job.processedCount / job.requestedCount) * 100}
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(job.status === 'running' || batchRunning) && (
                      <Button variant="outline" onClick={cancelBatch}>
                        <X /> Stop screening
                      </Button>
                    )}
                  </div>
                  {job.failedCount > 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Temporary interruptions are retried automatically. Saved
                      detective decisions are never requested again.
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <label
                    htmlFor="screen-all-remaining"
                    className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${selectableRecords ? 'cursor-pointer bg-primary/5 hover:border-primary/35' : 'cursor-not-allowed bg-muted/30 text-muted-foreground'}`}
                  >
                    <Checkbox
                      id="screen-all-remaining"
                      checked={screeningAllAvailable}
                      disabled={!selectableRecords}
                      onCheckedChange={(checked) => {
                        if (checked === true && selectableRecords)
                          setBatchSize(selectableRecords);
                        else if (checked === false)
                          setBatchSize(Math.min(10, selectableRecords || 10));
                      }}
                      className="mt-0.5"
                    />
                    <span>
                      <strong>
                        {remainingRecords > 2000
                          ? `Screen 2,000 of ${remainingRecords.toLocaleString()} remaining records`
                          : `Screen all ${remainingRecords.toLocaleString()} remaining records`}
                      </strong>
                      {remainingRecords > 2000 && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          The investigation limit is 2,000 records per run.
                        </span>
                      )}
                    </span>
                  </label>
                  <div className="grid gap-4 sm:grid-cols-[130px_1fr]">
                    <label
                      htmlFor="screening-batch-size"
                      className="text-sm font-medium"
                    >
                      Records
                      <Input
                        id="screening-batch-size"
                        className="mt-2"
                        type="number"
                        min={1}
                        max={Math.max(1, selectableRecords)}
                        value={batchSize}
                        onChange={(event) =>
                          setBatchSize(
                            Math.max(
                              1,
                              Math.min(
                                Math.max(1, selectableRecords),
                                Number(event.target.value) || 1,
                              ),
                            ),
                          )
                        }
                      />
                      <span className="mt-1.5 block text-xs font-normal text-muted-foreground">
                        Up to {selectableRecords.toLocaleString() || '2,000'}
                      </span>
                    </label>
                    <div>
                      <label
                        htmlFor="screening-cost-confirmation"
                        className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm"
                      >
                        <Checkbox
                          id="screening-cost-confirmation"
                          checked={costConfirmed}
                          onCheckedChange={(checked) =>
                            setCostConfirmed(checked === true)
                          }
                          className="mt-0.5"
                        />
                        <span>
                          <strong>I understand this charges my account.</strong>
                        </span>
                      </label>
                      <Button
                        className="mt-3"
                        disabled={
                          !ready ||
                          unresolvedDuplicates > 0 ||
                          summary.total === 0 ||
                          !costConfirmed ||
                          batchRunning
                        }
                        onClick={startBatch}
                      >
                        <Sparkles /> Start Title and Abstract screening
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
        <section className="rounded-3xl border border-primary/25 bg-primary/5 p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <Sparkles className="size-5" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">
                    Ask Sherlock Holmes about conflicts
                  </h2>
                  <Badge
                    variant="outline"
                    className="border-primary/25 bg-card"
                  >
                    Optional · account charge
                  </Badge>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {summary.unresolvedConflicts > 0
                    ? `${summary.unresolvedConflicts} screening conflict${summary.unresolvedConflicts === 1 ? '' : 's'} await an optional second opinion.`
                    : summary.conflicts > 0
                      ? 'All detected conflicts already have a Sherlock Holmes advisory decision.'
                      : 'No screening conflicts are waiting for review.'}
                </p>
              </div>
            </div>
            <Button
              className="h-11 shrink-0 px-5 shadow-lg shadow-primary/20"
              disabled={
                !adjudicatorReady ||
                summary.unresolvedConflicts === 0 ||
                Boolean(aiRunningId) ||
                batchRunning
              }
              onClick={resolveAllConflicts}
            >
              <Sparkles />
              {aiRunningId === 'all-conflicts'
                ? 'Sherlock Holmes is reviewing all…'
                : 'Ask all conflicts'}
            </Button>
          </div>
          {!adjudicatorReady && (
            <p className="mt-4 text-sm font-medium text-amber-700">
              Sherlock Holmes must be connected before conflict review can run.
            </p>
          )}
        </section>
      </div>
      <section className="mt-6 space-y-5">
        <div className="rounded-3xl border border-primary/25 bg-card p-5 shadow-[0_18px_50px_-30px_var(--primary)] sm:p-6">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                <FileSpreadsheet className="size-5" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold">
                    {summary.aiAssessed > 0
                      ? 'Screening results are ready'
                      : 'Screening results'}
                  </h2>
                  {summary.aiAssessed > 0 && (
                    <Badge className="bg-primary text-primary-foreground">
                      Ready to export
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {summary.aiAssessed} of {summary.total} articles have complete
                  decisions from all three screening detectives. The workbook
                  includes all three decisions and the requested reasoning.
                </p>
              </div>
            </div>
            {activeId && summary.aiAssessed > 0 ? (
              <a
                href={`/api/reviews/${activeId}/screening/export`}
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Download className="size-4" /> Download screening Excel
              </a>
            ) : (
              <span className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-muted px-5 text-sm font-medium text-muted-foreground">
                <Download className="size-4" /> Export available after screening
              </span>
            )}
          </div>
        </div>
        <CategorizedResults
          results={categorizedResults}
          savingId={savingId}
          decide={decide}
          decideCategory={decideCategory}
          runResolver={(id) => runAi(id, true)}
          runAllResolvers={resolveAllConflicts}
          aiRunningId={aiRunningId}
          adjudicatorReady={adjudicatorReady}
        />
        <div className="flex justify-end">
          <Button size="lg" onClick={continueToFullText}>
            Continue to full-text screening <ArrowRight />
          </Button>
        </div>
        <div className="surface-card p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--info-soft)] text-[var(--info-ink)]">
                <ShieldCheck />
              </span>
              <div>
                <h2 className="font-semibold">Optional manual review</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Inspect articles or record researcher decisions only when you
                  want to. AI decisions remain separate.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center sm:min-w-72">
              <MiniStat label="Include" value={summary.included} />
              <MiniStat label="Needs decision" value={summary.unclear} />
              <MiniStat label="Exclude" value={summary.excluded} />
            </div>
          </div>
        </div>
        <details className="surface-card group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold sm:p-6">
            <span>
              Optional researcher screening
              <span className="mt-1 block text-sm font-normal text-muted-foreground">
                Open the article list only when you want to screen or override a
                record manually.
              </span>
            </span>
            <span className="text-sm font-medium text-primary group-open:hidden">
              Open queue
            </span>
            <span className="hidden text-sm font-medium text-primary group-open:inline">
              Close queue
            </span>
          </summary>
          <div className="space-y-4 border-t p-5 sm:p-6">
            <div className="flex gap-2 overflow-x-auto rounded-2xl border bg-card/75 p-1.5">
              {(
                [
                  ['all', 'All'],
                  ['unreviewed', 'Unreviewed'],
                  ['needs_ai', 'Needs AI'],
                  ['agreement', 'Agreement'],
                  ['disagreement', 'Disagreement'],
                  ['include', 'Included'],
                  ['unclear', 'Needs decision'],
                  ['exclude', 'Excluded'],
                ] as [ScreeningFilter, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`h-9 shrink-0 rounded-xl px-3 text-sm font-medium transition ${filter === value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {queueLoading && (
              <div className="surface-card grid min-h-48 place-items-center text-sm text-muted-foreground">
                Loading references…
              </div>
            )}
            {!queueLoading && references.length === 0 && (
              <div className="surface-card grid min-h-48 place-items-center text-sm text-muted-foreground">
                Import references to begin screening.
              </div>
            )}
            {!queueLoading &&
              references.map((reference, index) => (
                <ScreeningCard
                  key={reference.id}
                  reference={reference}
                  index={index}
                  saving={savingId === reference.id}
                  aiRunning={aiRunningId === reference.id}
                  decide={decide}
                  runAi={runAi}
                  aiReady={ready && unresolvedDuplicates === 0}
                  adjudicatorReady={adjudicatorReady}
                />
              ))}
            {!queueLoading && totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </details>
      </section>
    </div>
  );
}

function CategorizedResults({
  results,
  savingId,
  decide,
  decideCategory,
  runResolver,
  runAllResolvers,
  aiRunningId,
  adjudicatorReady,
}: {
  results: CategorizedResult[];
  savingId: string | null;
  decide: (id: string, decision: 'include' | 'exclude' | 'unclear') => void;
  decideCategory: (category: 'include' | 'exclude') => void;
  runResolver: (id: string) => void;
  runAllResolvers: () => void;
  aiRunningId: string | null;
  adjudicatorReady: boolean;
}) {
  const categories = [
    {
      id: 'include' as const,
      label: 'Include',
      description: 'At least two detectives decided to include the article.',
      className: 'border-emerald-300 bg-emerald-50/80',
      badgeClass: 'bg-emerald-600 text-white',
    },
    {
      id: 'conflict' as const,
      label: 'Conflicts',
      description:
        'At least two need a decision, or all three detectives disagree.',
      className: 'border-amber-300 bg-amber-50/80',
      badgeClass: 'bg-amber-600 text-white',
    },
    {
      id: 'exclude' as const,
      label: 'Exclude',
      description: 'At least two detectives decided to exclude the article.',
      className: 'border-rose-300 bg-rose-50/80',
      badgeClass: 'bg-rose-600 text-white',
    },
  ];

  return (
    <section className="surface-card p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">
            Organized results
          </p>
          <h2 className="mt-2 text-xl font-semibold">Screening result</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Review each article, open its abstract when useful, and move it to
            the category that matches your final researcher decision.
          </p>
        </div>
        <Badge variant="outline">{results.length} screened articles</Badge>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {categories.map((category) => {
          const items = results.filter((item) => item.category === category.id);
          const unresolvedItems = items.filter(
            (item) => item.adjudicatorStatus !== 'complete',
          );
          return (
            <div
              key={category.id}
              className={`overflow-hidden rounded-2xl border ${category.className}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/5 p-4">
                <div>
                  <h3 className="font-semibold">{category.label}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {category.description}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {category.id === 'include' && items.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingId === 'all-include'}
                      onClick={() => decideCategory('include')}
                      className="border-emerald-300 bg-white/80 text-emerald-800 hover:bg-emerald-100"
                    >
                      <Check />
                      {savingId === 'all-include' ? 'Saving…' : 'Include all'}
                    </Button>
                  )}
                  {category.id === 'conflict' && items.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        !adjudicatorReady ||
                        Boolean(aiRunningId) ||
                        unresolvedItems.length === 0
                      }
                      onClick={runAllResolvers}
                      className="border-amber-300 bg-white/80 text-amber-900 hover:bg-amber-100"
                    >
                      <Sparkles />
                      {aiRunningId === 'all-conflicts'
                        ? 'Investigating all…'
                        : unresolvedItems.length === 0
                          ? 'All conflicts reviewed'
                          : 'Ask all conflicts from Sherlock Holmes'}
                    </Button>
                  )}
                  {category.id === 'exclude' && items.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingId === 'all-exclude'}
                      onClick={() => decideCategory('exclude')}
                      className="border-rose-300 bg-white/80 text-rose-800 hover:bg-rose-100"
                    >
                      <X />
                      {savingId === 'all-exclude' ? 'Saving…' : 'Exclude all'}
                    </Button>
                  )}
                  <span
                    className={`grid min-w-8 place-items-center rounded-full px-2 py-1 text-xs font-semibold ${category.badgeClass}`}
                  >
                    {items.length}
                  </span>
                </div>
              </div>
              <div className="max-h-[34rem] space-y-2 overflow-y-auto p-2.5">
                {items.length === 0 ? (
                  <p className="rounded-xl border border-dashed bg-white/50 p-4 text-center text-sm text-muted-foreground">
                    No articles in this category.
                  </p>
                ) : (
                  items.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-xl border bg-white/90 p-3 shadow-sm"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-medium leading-6">
                            {item.title || 'Untitled article'}
                          </h4>
                          <p className="mt-1 line-clamp-1 text-xs leading-5 text-muted-foreground">
                            {item.authors || 'Authors not supplied'} ·{' '}
                            {item.doi ? `DOI ${item.doi}` : 'DOI not supplied'}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-64 sm:justify-end">
                          {item.researcherDecision && (
                            <Badge
                              className={
                                item.researcherDecision === 'include'
                                  ? 'bg-emerald-600 text-white'
                                  : item.researcherDecision === 'exclude'
                                    ? 'bg-rose-600 text-white'
                                    : 'bg-violet-600 text-white'
                              }
                            >
                              Researcher:{' '}
                              {item.researcherDecision === 'unclear'
                                ? 'Needs decision'
                                : item.researcherDecision}
                            </Badge>
                          )}
                          {item.adjudicatorStatus === 'complete' && (
                            <Badge
                              className={
                                category.id === 'conflict'
                                  ? 'bg-amber-500 text-amber-950'
                                  : 'bg-violet-600 text-white'
                              }
                            >
                              Sherlock Holmes:{' '}
                              {screeningDecisionLabel(item.adjudicatorDecision)}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-700">
                          Miss Marple:{' '}
                          {screeningDecisionLabel(item.geminiDecision)}
                        </span>
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-700">
                          Poirot: {screeningDecisionLabel(item.openaiDecision)}
                        </span>
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-700">
                          Zeous: {screeningDecisionLabel(item.zeousDecision)}
                        </span>
                      </div>
                      {(item.geminiReason ||
                        item.openaiReason ||
                        item.zeousReason) && (
                        <div className="mt-2 grid gap-2 lg:grid-cols-3">
                          {item.geminiReason && (
                            <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs leading-5 text-slate-700">
                              <strong>Miss Marple:</strong> {item.geminiReason}
                            </p>
                          )}
                          {item.openaiReason && (
                            <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs leading-5 text-slate-700">
                              <strong>Poirot:</strong> {item.openaiReason}
                            </p>
                          )}
                          {item.zeousReason && (
                            <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs leading-5 text-slate-700">
                              <strong>Zeous:</strong> {item.zeousReason}
                            </p>
                          )}
                        </div>
                      )}
                      {item.adjudicatorStatus === 'complete' &&
                        item.adjudicatorReason && (
                          <p
                            className={`mt-2 rounded-lg px-3 py-2 text-xs leading-5 ${
                              category.id === 'conflict'
                                ? 'bg-amber-100/70 text-amber-900'
                                : 'bg-violet-100/70 text-violet-900'
                            }`}
                          >
                            <strong>Sherlock Holmes opinion:</strong>{' '}
                            {item.adjudicatorReason}
                          </p>
                        )}
                      <details className="group mt-2 rounded-lg border bg-white/70">
                        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-primary">
                          <span className="group-open:hidden">
                            Open abstract
                          </span>
                          <span className="hidden group-open:inline">
                            Close abstract
                          </span>
                        </summary>
                        <p className="border-t px-3 py-3 text-sm leading-6 text-muted-foreground">
                          {item.abstract ||
                            'No abstract was supplied in the imported reference.'}
                        </p>
                      </details>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={savingId === item.id}
                          onClick={() => decide(item.id, 'include')}
                          className={
                            item.researcherDecision === 'include'
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : ''
                          }
                          variant={
                            item.researcherDecision === 'include'
                              ? 'default'
                              : 'outline'
                          }
                        >
                          <Check /> Include
                        </Button>
                        <Button
                          size="sm"
                          disabled={savingId === item.id}
                          onClick={() => decide(item.id, 'exclude')}
                          className={
                            item.researcherDecision === 'exclude'
                              ? 'bg-rose-600 text-white hover:bg-rose-700'
                              : ''
                          }
                          variant={
                            item.researcherDecision === 'exclude'
                              ? 'default'
                              : 'outline'
                          }
                        >
                          <X /> Exclude
                        </Button>
                        <Button
                          size="sm"
                          disabled={savingId === item.id}
                          onClick={() => decide(item.id, 'unclear')}
                          className={
                            item.researcherDecision === 'unclear'
                              ? 'bg-violet-600 text-white hover:bg-violet-700'
                              : ''
                          }
                          variant={
                            item.researcherDecision === 'unclear'
                              ? 'default'
                              : 'outline'
                          }
                        >
                          <MinusCircle /> Needs decision
                        </Button>
                        {category.id === 'conflict' &&
                          item.adjudicatorStatus !== 'complete' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                              disabled={
                                !adjudicatorReady || Boolean(aiRunningId)
                              }
                              onClick={() => runResolver(item.id)}
                            >
                              <Sparkles />
                              {aiRunningId === item.id
                                ? 'Investigating…'
                                : 'Ask Sherlock Holmes'}
                            </Button>
                          )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FullTextStep({
  reviewId,
  results,
  files,
  loading,
  uploadingId,
  optimizingId,
  upload,
  runResolver,
  aiRunningId,
  adjudicatorReady,
  backToScreening,
  screeningItems,
  screeningProviders,
  screeningRunningId,
  costConfirmed,
  setCostConfirmed,
  batchProgress,
  startScreening,
  askFullTextSherlock,
  askAllFullTextSherlock,
  decisionSavingId,
  decideFullText,
  criteria,
  criteriaDraft,
  setCriteriaDraft,
  criteriaDirty,
  criteriaSaving,
  saveCriteria,
  openAccessSearching,
  openAccessSummary,
  retryOpenAccess,
}: {
  reviewId: string | null;
  results: CategorizedResult[];
  files: FullTextFile[];
  loading: boolean;
  uploadingId: string | null;
  optimizingId: string | null;
  upload: (referenceId: string, file: File) => void;
  runResolver: (referenceId: string) => void;
  aiRunningId: string | null;
  adjudicatorReady: boolean;
  backToScreening: () => void;
  screeningItems: FullTextScreeningItem[];
  screeningProviders: ProviderStatus[];
  screeningRunningId: string | null;
  costConfirmed: boolean;
  setCostConfirmed: (confirmed: boolean) => void;
  batchProgress: {
    processed: number;
    total: number;
    deferred: number;
    automaticRetrying: boolean;
  } | null;
  startScreening: () => void;
  askFullTextSherlock: (referenceId: string) => void;
  askAllFullTextSherlock: () => void;
  decisionSavingId: string | null;
  decideFullText: (
    referenceId: string,
    decision: 'include' | 'exclude' | 'unclear',
  ) => void;
  criteria: FullTextCriteria;
  criteriaDraft: FullTextCriteria;
  setCriteriaDraft: React.Dispatch<React.SetStateAction<FullTextCriteria>>;
  criteriaDirty: boolean;
  criteriaSaving: boolean;
  saveCriteria: () => void;
  openAccessSearching: boolean;
  openAccessSummary: OpenAccessSummary | null;
  retryOpenAccess: () => void;
}) {
  const [readerReferenceId, setReaderReferenceId] = useState<string | null>(
    null,
  );
  const included = results.filter((item) => item.category === 'include');
  const excluded = results.filter((item) => item.category === 'exclude');
  const conflicts = results.filter((item) => item.category === 'conflict');
  const unresolvedConflict = conflicts.find(
    (item) => item.adjudicatorStatus !== 'complete',
  );
  const firstLineReady = screeningProviders
    .filter((provider) => !provider.optional)
    .every((provider) => provider.configured);
  const fullTextSherlockReady = Boolean(
    screeningProviders.find((provider) => provider.id === 'adjudicator')
      ?.configured,
  );
  const pendingFullTexts = screeningItems.filter(
    (item) =>
      item.marpleStatus !== 'complete' ||
      item.poirotStatus !== 'complete' ||
      item.zeousStatus !== 'complete',
  );
  const optimizedReferenceIds = new Set(
    files.filter((file) => file.aiSize).map((file) => file.referenceId),
  );
  const canScreenFullText = (item: FullTextScreeningItem) =>
    fullTextDetectiveIssues(item).length === 0 ||
    (fullTextNeedsLongRun(item) &&
      (item.size <= FULL_TEXT_COMPRESSION_THRESHOLD ||
        optimizedReferenceIds.has(item.id)));
  const incompleteFullTexts = pendingFullTexts.filter(
    (item) => item.id !== optimizingId && !canScreenFullText(item),
  );
  const readyForFullTextScreening = pendingFullTexts.filter(
    (item) => item.id !== optimizingId && canScreenFullText(item),
  );
  const readerItem = screeningItems.find(
    (item) => item.id === readerReferenceId,
  );

  return (
    <div>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-primary">
            Step 4 · Full-text screening
          </p>
          <h1 className="text-3xl font-semibold tracking-[-.04em] sm:text-4xl">
            Continue with the included studies.
          </h1>
        </div>
        <Button variant="outline" onClick={backToScreening}>
          Return to title and abstract
        </Button>
      </div>

      <section className="surface-card p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="section-icon">
            <BookOpenCheck />
          </span>
          <h2 className="text-xl font-semibold">Title and abstract summary</h2>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Summary label="Include" value={included.length} />
          <Summary label="Exclude" value={excluded.length} />
          <Summary label="Conflicts" value={conflicts.length} />
        </div>
        {unresolvedConflict && (
          <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
            <p className="font-semibold text-violet-950">
              Finish uncertain records before finalizing this stage
            </p>
            <p className="mt-1 text-sm leading-6 text-violet-800">
              You can return to Step 3 for a researcher decision or request a
              Sherlock Holmes opinion charged to your account.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {unresolvedConflict && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!adjudicatorReady || Boolean(aiRunningId)}
                  onClick={() => runResolver(unresolvedConflict.id)}
                  className="border-amber-300 bg-amber-50 text-amber-900"
                >
                  <Sparkles />
                  {aiRunningId === unresolvedConflict.id
                    ? 'Investigating…'
                    : 'Ask Sherlock about a conflict'}
                </Button>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="surface-card mt-6 p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">
                Full-text screening criteria
              </h2>
              <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100">
                Required
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Declare which criteria the detectives must apply before screening
              can begin.
            </p>
          </div>
          {criteria.declared && !criteriaDirty && (
            <Badge
              variant="outline"
              className="border-emerald-200 bg-emerald-50 text-emerald-700"
            >
              <Check className="size-3.5" /> Saved
            </Badge>
          )}
        </div>

        <label
          htmlFor="full-text-use-tiab"
          className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-4"
        >
          <Checkbox
            id="full-text-use-tiab"
            aria-label="Investigate with Ti/Ab criteria"
            checked={criteriaDraft.useTiabCriteria}
            onCheckedChange={(checked) =>
              setCriteriaDraft((current) => ({
                ...current,
                useTiabCriteria: checked === true,
              }))
            }
          />
          <span>
            <span className="block text-sm font-semibold text-violet-950">
              Investigate with Ti/Ab criteria
            </span>
            <span className="mt-1 block text-xs leading-5 text-violet-800">
              Use the inclusion and exclusion criteria already saved for title
              and abstract screening.
            </span>
          </span>
        </label>

        {!criteriaDraft.useTiabCriteria && (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <label
              htmlFor="full-text-inclusion"
              className="grid gap-2 text-sm font-semibold"
            >
              Full-text inclusion criteria
              <Textarea
                id="full-text-inclusion"
                value={criteriaDraft.inclusion}
                onChange={(event) =>
                  setCriteriaDraft((current) => ({
                    ...current,
                    inclusion: event.target.value,
                  }))
                }
                placeholder="Enter the conditions a complete article must meet."
                className="min-h-32 resize-y bg-white font-normal"
              />
            </label>
            <label
              htmlFor="full-text-exclusion"
              className="grid gap-2 text-sm font-semibold"
            >
              Full-text exclusion criteria
              <Textarea
                id="full-text-exclusion"
                value={criteriaDraft.exclusion}
                onChange={(event) =>
                  setCriteriaDraft((current) => ({
                    ...current,
                    exclusion: event.target.value,
                  }))
                }
                placeholder="Enter the conditions that exclude a complete article."
                className="min-h-32 resize-y bg-white font-normal"
              />
            </label>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            className="bg-primary shadow-md shadow-primary/20"
            disabled={
              criteriaSaving ||
              (!criteriaDraft.useTiabCriteria &&
                (!criteriaDraft.inclusion.trim() ||
                  !criteriaDraft.exclusion.trim()))
            }
            onClick={saveCriteria}
          >
            <Check />
            {criteriaSaving ? 'Saving criteria…' : 'Save full-text criteria'}
          </Button>
          {criteriaDirty && criteria.declared && (
            <p className="text-xs font-medium text-amber-700">
              Save these changes before starting screening.
            </p>
          )}
        </div>
      </section>

      <section className="surface-card mt-6 overflow-hidden">
        <div className="border-b p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h2 className="text-xl font-semibold">Included articles</h2>
              <Badge variant="outline" className="mt-2">
                {included.length} ready for full text
              </Badge>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={openAccessSearching}
              onClick={retryOpenAccess}
            >
              <Search />
              {openAccessSearching
                ? 'Searching open access…'
                : 'Retry open-access search'}
            </Button>
          </div>
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            {openAccessSearching ? (
              <span>
                Searching trusted open-access records and adding available full
                texts automatically…
              </span>
            ) : openAccessSummary ? (
              <span>
                Checked {openAccessSummary.checked} article
                {openAccessSummary.checked === 1 ? '' : 's'} · added{' '}
                {openAccessSummary.added} full text
                {openAccessSummary.added === 1 ? '' : 's'} automatically
                {openAccessSummary.errors
                  ? ` · ${openAccessSummary.errors} lookup${openAccessSummary.errors === 1 ? '' : 's'} can be retried`
                  : ''}
              </span>
            ) : (
              <span>
                Open-access full texts are searched automatically. Upload a PDF
                only when no open version is found.
              </span>
            )}
          </div>
        </div>
        {loading ? (
          <div className="grid min-h-48 place-items-center text-sm text-muted-foreground">
            Loading included articles…
          </div>
        ) : included.length === 0 ? (
          <div className="grid min-h-48 place-items-center p-6 text-center text-sm text-muted-foreground">
            No articles are currently in Include. Return to Step 3 to review the
            screening result.
          </div>
        ) : (
          <div className="divide-y">
            {included.map((item) => {
              const stored = files.find((file) => file.referenceId === item.id);
              const screeningItem = screeningItems.find(
                (entry) => entry.id === item.id,
              );
              const inputId = `full-text-${item.id}`;
              return (
                <article
                  key={item.id}
                  className="flex flex-col justify-between gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5"
                >
                  <button
                    type="button"
                    disabled={!stored}
                    onClick={() => stored && setReaderReferenceId(item.id)}
                    className="group min-w-0 flex-1 rounded-xl px-2 py-1 text-left transition hover:bg-violet-50 disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold leading-5 group-hover:text-primary">
                          {item.title || 'Untitled article'}
                        </h3>
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                          {item.authors || 'Authors not supplied'} ·{' '}
                          {item.doi ? `DOI ${item.doi}` : 'DOI not supplied'}
                        </p>
                      </div>
                      {screeningItem?.researcherDecision && (
                        <ResearcherDecisionBadge
                          decision={screeningItem.researcherDecision}
                        />
                      )}
                    </div>
                    {stored && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                        <BookOpenCheck className="size-3.5" />
                        {stored.status === 'open_access'
                          ? 'Open-access full text added automatically'
                          : 'Full text uploaded'}{' '}
                        · {stored.fileName} · {formatBytes(stored.size)} · Open
                        reader
                      </p>
                    )}
                  </button>
                  <div className="shrink-0">
                    <input
                      id={inputId}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) upload(item.id, file);
                        event.currentTarget.value = '';
                      }}
                    />
                    <label
                      htmlFor={inputId}
                      className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${
                        uploadingId === item.id
                          ? 'pointer-events-none bg-muted text-muted-foreground'
                          : stored
                            ? 'border bg-card hover:bg-muted'
                            : 'bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90'
                      }`}
                    >
                      <UploadCloud className="size-4" />
                      {uploadingId === item.id
                        ? 'Adding…'
                        : stored
                          ? 'Replace full text'
                          : 'Add full text'}
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="surface-card mt-6 p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">
              Full-text AI detectives
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              Investigate the complete articles
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Miss Marple, Poirot, and Zeous independently apply your saved
              inclusion and exclusion criteria. Sherlock Holmes is available
              only when their decisions do not produce an include or exclude
              majority.
            </p>
          </div>
          <Badge variant="outline">
            {screeningItems.length} full texts ·{' '}
            {readyForFullTextScreening.length} ready to screen
            {incompleteFullTexts.length
              ? ` · ${incompleteFullTexts.length} needs attention`
              : ''}
          </Badge>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['gemini', 'Miss Marple', 'First-line detective'],
            ['openai', 'Poirot', 'First-line detective'],
            ['zeous', 'Zeous', 'First-line detective'],
            ['adjudicator', 'Sherlock Holmes', 'Conflict detective'],
          ].map(([id, name, role]) => {
            const provider = screeningProviders.find((item) => item.id === id);
            return (
              <div key={id} className="rounded-2xl border bg-muted/25 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{name}</p>
                  <Badge
                    variant="outline"
                    className={
                      provider?.configured
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                    }
                  >
                    {provider?.configured ? 'Ready' : 'Not ready'}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{role}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3 text-sm">
            <Checkbox
              aria-label="Confirm account charge for full-text screening"
              checked={costConfirmed}
              onCheckedChange={(checked) => setCostConfirmed(checked === true)}
            />
            <span className="font-medium">
              I understand this charges my account
            </span>
          </div>
          {batchProgress && (
            <div className="mt-4">
              <div className="mb-2 flex justify-between text-xs font-medium text-muted-foreground">
                <span>
                  {batchProgress.automaticRetrying
                    ? 'Automatic recovery pass'
                    : 'Full-text screening progress'}
                </span>
                <span>
                  {batchProgress.processed}/{batchProgress.total}
                </span>
              </div>
              <Progress
                value={
                  batchProgress.total
                    ? (batchProgress.processed / batchProgress.total) * 100
                    : 100
                }
              />
              {batchProgress.deferred > 0 && (
                <p className="mt-2 text-xs font-medium text-amber-700">
                  {batchProgress.deferred} interrupted article
                  {batchProgress.deferred === 1 ? '' : 's'} will be tried again
                  automatically.
                </p>
              )}
            </div>
          )}
          <Button
            className="mt-4 h-11 bg-primary px-5 shadow-lg shadow-primary/20"
            disabled={
              !costConfirmed ||
              !criteria.declared ||
              criteriaDirty ||
              !firstLineReady ||
              readyForFullTextScreening.length === 0 ||
              Boolean(screeningRunningId) ||
              Boolean(optimizingId)
            }
            onClick={startScreening}
          >
            <Sparkles />
            {screeningRunningId
              ? 'Detectives are investigating…'
              : readyForFullTextScreening.length
                ? 'Start Full-text Screening'
                : incompleteFullTexts.length
                  ? 'Screening finished with issues'
                  : 'Full-text screening complete'}
          </Button>
        </div>

        {incompleteFullTexts.length > 0 && (
          <div className="mt-5 overflow-hidden rounded-2xl border border-rose-300 bg-rose-50/70">
            <div className="flex flex-col justify-between gap-2 border-b border-rose-200 px-4 py-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-rose-700" />
                <h3 className="font-semibold text-rose-950">
                  Articles needing attention
                </h3>
              </div>
              <Badge className="bg-rose-600 text-white hover:bg-rose-600">
                {incompleteFullTexts.length} incomplete
              </Badge>
            </div>
            <p className="px-4 pt-3 text-sm leading-6 text-rose-900">
              Automatic retries have already run. These articles were not
              silently omitted from the screening result.
            </p>
            <div className="divide-y divide-rose-200">
              {incompleteFullTexts.map((item) => {
                const issues = fullTextDetectiveIssues(item);
                const inputId = `full-text-issue-${item.id}`;
                return (
                  <article key={item.id} className="p-4">
                    <h4 className="text-sm font-semibold leading-5 text-rose-950">
                      {item.title || 'Untitled article'}
                    </h4>
                    <p className="mt-1 text-xs text-rose-800">
                      {item.fileName} · {formatBytes(item.size)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {issues.map((issue) => (
                        <Badge
                          key={issue.name}
                          variant="outline"
                          className="border-rose-300 bg-white text-rose-800"
                        >
                          {issue.name}: {providerErrorText(issue.error)}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-sm leading-6 text-rose-900">
                      {fullTextIssueAdvice(item)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-rose-300 bg-white text-rose-900"
                        onClick={() => setReaderReferenceId(item.id)}
                      >
                        <BookOpenCheck /> Open full text
                      </Button>
                      <input
                        id={inputId}
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) upload(item.id, file);
                          event.currentTarget.value = '';
                        }}
                      />
                      <label
                        htmlFor={inputId}
                        className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-rose-300 bg-white px-3 text-sm font-semibold text-rose-900 transition hover:bg-rose-100 ${
                          uploadingId === item.id
                            ? 'pointer-events-none opacity-60'
                            : ''
                        }`}
                      >
                        <UploadCloud className="size-4" />
                        {uploadingId === item.id
                          ? 'Replacing…'
                          : 'Replace with searchable PDF'}
                      </label>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {screeningItems.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Add or retrieve at least one included article full text to begin
            screening.
          </div>
        ) : (
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {(
              [
                ['include', 'Include', 'border-emerald-300 bg-emerald-50/70'],
                ['conflict', 'Conflict', 'border-amber-300 bg-amber-50/70'],
                ['exclude', 'Exclude', 'border-rose-300 bg-rose-50/70'],
              ] as const
            ).map(([category, label, color]) => {
              const items = screeningItems.filter(
                (item) => fullTextCategory(item) === category,
              );
              const unresolved = items.filter(
                (item) => item.sherlockStatus !== 'complete',
              ).length;
              return (
                <div key={category} className={`rounded-2xl border ${color}`}>
                  <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
                    <h3 className="font-semibold">{label}</h3>
                    <div className="flex items-center gap-2">
                      {category === 'conflict' && unresolved > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-amber-300 bg-white/80 text-amber-900"
                          disabled={
                            !fullTextSherlockReady ||
                            Boolean(screeningRunningId)
                          }
                          onClick={askAllFullTextSherlock}
                        >
                          <Sparkles /> Ask all conflicts
                        </Button>
                      )}
                      <Badge variant="outline" className="bg-white/70">
                        {items.length}
                      </Badge>
                    </div>
                  </div>
                  <div className="max-h-[32rem] space-y-2 overflow-y-auto p-2.5">
                    {items.length === 0 ? (
                      <p className="rounded-xl border border-dashed bg-white/50 p-4 text-center text-sm text-muted-foreground">
                        No screened articles in this category.
                      </p>
                    ) : (
                      items.map((item) => (
                        <FullTextResultCard
                          key={item.id}
                          item={item}
                          category={category}
                          running={screeningRunningId === item.id}
                          sherlockReady={fullTextSherlockReady}
                          askSherlock={askFullTextSherlock}
                          openReader={() => setReaderReferenceId(item.id)}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      {reviewId && readerItem && (
        <FullTextReader
          reviewId={reviewId}
          items={screeningItems}
          item={readerItem}
          close={() => setReaderReferenceId(null)}
          navigate={setReaderReferenceId}
          saving={decisionSavingId === readerItem.id}
          decide={decideFullText}
        />
      )}
    </div>
  );
}

function FullTextReader({
  reviewId,
  items,
  item,
  close,
  navigate,
  saving,
  decide,
}: {
  reviewId: string;
  items: FullTextScreeningItem[];
  item: FullTextScreeningItem;
  close: () => void;
  navigate: (referenceId: string) => void;
  saving: boolean;
  decide: (
    referenceId: string,
    decision: 'include' | 'exclude' | 'unclear',
  ) => void;
}) {
  const index = items.findIndex((entry) => entry.id === item.id);
  const previous = index > 0 ? items[index - 1] : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null;
  const contentUrl = `/api/reviews/${reviewId}/full-texts/${item.id}/content`;

  useEffect(() => {
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft' && previous) navigate(previous.id);
      if (event.key === 'ArrowRight' && next) navigate(next.id);
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [close, navigate, next, previous]);

  const decisionButtonClass = (decision: 'include' | 'exclude' | 'unclear') => {
    const selected = item.researcherDecision === decision;
    if (decision === 'include')
      return selected
        ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100';
    if (decision === 'exclude')
      return selected
        ? 'border-rose-600 bg-rose-600 text-white hover:bg-rose-700'
        : 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100';
    return selected
      ? 'border-violet-600 bg-violet-600 text-white hover:bg-violet-700'
      : 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100';
  };

  return (
    <dialog
      open
      aria-label={`Full-text reader for ${item.title || 'untitled article'}`}
      className="fixed inset-0 z-[100] m-0 grid h-dvh max-h-none w-screen max-w-none grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-slate-100 p-0 text-foreground"
    >
      <header className="flex min-h-16 items-center gap-2 border-b bg-white px-3 py-2 shadow-sm sm:px-5">
        <Button
          size="icon"
          variant="ghost"
          aria-label="Close full-text reader"
          onClick={close}
        >
          <X />
        </Button>
        <Button
          size="icon"
          variant="outline"
          aria-label="Previous full-text article"
          disabled={!previous}
          onClick={() => previous && navigate(previous.id)}
        >
          <ChevronLeft />
        </Button>
        <div className="min-w-0 flex-1 px-1 sm:px-3">
          <h2 className="line-clamp-1 text-sm font-semibold sm:text-base">
            {item.title || 'Untitled article'}
          </h2>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {item.authors || 'Authors not supplied'}
            {item.doi ? ` · DOI ${item.doi}` : ''}
          </p>
        </div>
        {item.researcherDecision && (
          <ResearcherDecisionBadge decision={item.researcherDecision} />
        )}
        <span className="hidden text-xs font-medium text-muted-foreground sm:block">
          {index + 1} of {items.length}
        </span>
        <Button
          size="icon"
          variant="outline"
          aria-label="Next full-text article"
          disabled={!next}
          onClick={() => next && navigate(next.id)}
        >
          <ChevronRight />
        </Button>
      </header>

      <div className="min-h-0 bg-slate-200/70 p-0 sm:p-3">
        <iframe
          key={item.id}
          src={contentUrl}
          title={`Full text: ${item.title || 'Untitled article'}`}
          referrerPolicy="no-referrer"
          className="h-full w-full border-0 bg-white sm:rounded-xl sm:border sm:shadow-xl"
        />
      </div>

      <footer className="border-t bg-white px-3 py-3 shadow-[0_-10px_30px_rgba(15,23,42,.08)] sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-center">
          <p className="mr-2 text-center text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground sm:text-left">
            Researcher decision
          </p>
          <Button
            className={`h-11 flex-1 border sm:max-w-56 ${decisionButtonClass('include')}`}
            disabled={saving}
            onClick={() => decide(item.id, 'include')}
          >
            <Check /> Include
          </Button>
          <Button
            className={`h-11 flex-1 border sm:max-w-56 ${decisionButtonClass('unclear')}`}
            disabled={saving}
            onClick={() => decide(item.id, 'unclear')}
          >
            <CircleHelp /> Needs decision
          </Button>
          <Button
            className={`h-11 flex-1 border sm:max-w-56 ${decisionButtonClass('exclude')}`}
            disabled={saving}
            onClick={() => decide(item.id, 'exclude')}
          >
            <X /> Exclude
          </Button>
        </div>
      </footer>
    </dialog>
  );
}

function ResearcherDecisionBadge({
  decision,
}: {
  decision: 'include' | 'exclude' | 'unclear';
}) {
  const style =
    decision === 'include'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : decision === 'exclude'
        ? 'border-rose-200 bg-rose-50 text-rose-800'
        : 'border-violet-200 bg-violet-50 text-violet-800';
  return (
    <Badge variant="outline" className={`shrink-0 ${style}`}>
      {screeningDecisionLabel(decision)}
    </Badge>
  );
}

function fullTextCategory(item: FullTextScreeningItem) {
  if (
    item.marpleStatus !== 'complete' ||
    item.poirotStatus !== 'complete' ||
    item.zeousStatus !== 'complete' ||
    item.marpleDecision === null ||
    item.poirotDecision === null ||
    item.zeousDecision === null
  )
    return 'pending';
  const decisions = [
    item.marpleDecision,
    item.poirotDecision,
    item.zeousDecision,
  ];
  if (decisions.filter((decision) => decision === 'include').length >= 2)
    return 'include';
  if (decisions.filter((decision) => decision === 'exclude').length >= 2)
    return 'exclude';
  return 'conflict';
}

function FullTextResultCard({
  item,
  category,
  running,
  sherlockReady,
  askSherlock,
  openReader,
}: {
  item: FullTextScreeningItem;
  category: 'include' | 'conflict' | 'exclude';
  running: boolean;
  sherlockReady: boolean;
  askSherlock: (referenceId: string) => void;
  openReader: () => void;
}) {
  return (
    <article className="rounded-xl border bg-white/90 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={openReader}
          className="group min-w-0 flex-1 text-left"
        >
          <h4 className="text-sm font-semibold leading-5">
            {item.title || 'Untitled article'}
          </h4>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {item.authors || 'Authors not supplied'} ·{' '}
            {item.doi ? `DOI ${item.doi}` : 'DOI not supplied'}
          </p>
          <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary opacity-80 group-hover:opacity-100">
            <BookOpenCheck className="size-3.5" /> Open full-text reader
          </span>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {item.researcherDecision && (
            <ResearcherDecisionBadge decision={item.researcherDecision} />
          )}
          {item.sherlockStatus === 'complete' && (
            <Badge className="bg-amber-500 text-amber-950">
              Sherlock: {screeningDecisionLabel(item.sherlockDecision)}
            </Badge>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-700">
          Miss Marple: {screeningDecisionLabel(item.marpleDecision)}
        </span>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-700">
          Poirot: {screeningDecisionLabel(item.poirotDecision)}
        </span>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-700">
          Zeous: {screeningDecisionLabel(item.zeousDecision)}
        </span>
      </div>
      {(item.marpleReason || item.poirotReason || item.zeousReason) && (
        <div className="mt-2 grid gap-2">
          {item.marpleReason && (
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs leading-5 text-slate-700">
              <strong>Miss Marple:</strong> {item.marpleReason}
            </p>
          )}
          {item.poirotReason && (
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs leading-5 text-slate-700">
              <strong>Poirot:</strong> {item.poirotReason}
            </p>
          )}
          {item.zeousReason && (
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs leading-5 text-slate-700">
              <strong>Zeous:</strong> {item.zeousReason}
            </p>
          )}
        </div>
      )}
      {item.sherlockStatus === 'complete' && item.sherlockReason && (
        <p className="mt-2 rounded-lg bg-amber-100/70 px-3 py-2 text-xs leading-5 text-amber-900">
          <strong>Sherlock Holmes opinion:</strong> {item.sherlockReason}
        </p>
      )}
      {category === 'conflict' && item.sherlockStatus !== 'complete' && (
        <Button
          size="sm"
          variant="outline"
          className="mt-3 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
          disabled={!sherlockReady || running}
          onClick={() => askSherlock(item.id)}
        >
          <Sparkles /> {running ? 'Investigating…' : 'Ask Sherlock Holmes'}
        </Button>
      )}
    </article>
  );
}

function ScreeningCard({
  reference,
  index,
  saving,
  aiRunning,
  decide,
  runAi,
  aiReady,
  adjudicatorReady,
}: {
  reference: ScreeningReference;
  index: number;
  saving: boolean;
  aiRunning: boolean;
  decide: (id: string, decision: 'include' | 'exclude' | 'unclear') => void;
  runAi: (id: string, adjudicate?: boolean) => void;
  aiReady: boolean;
  adjudicatorReady: boolean;
}) {
  const firstLineComplete =
    reference.geminiStatus === 'complete' &&
    reference.openaiStatus === 'complete' &&
    reference.zeousStatus === 'complete';
  const decisions = [
    reference.geminiDecision,
    reference.openaiDecision,
    reference.zeousDecision,
  ];
  const conflict =
    firstLineComplete &&
    decisions.filter((decision) => decision === 'include').length < 2 &&
    decisions.filter((decision) => decision === 'exclude').length < 2;
  const needsAi =
    reference.geminiStatus !== 'complete' ||
    reference.openaiStatus !== 'complete' ||
    reference.zeousStatus !== 'complete';
  const buttonClass = (decision: ScreeningReference['researcherDecision']) =>
    reference.researcherDecision === decision
      ? 'border-primary bg-primary text-primary-foreground'
      : 'bg-card';
  return (
    <article className="surface-card">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">
              Record {index + 1}
              {reference.year ? ` · ${reference.year}` : ''}
            </p>
            <h3 className="mt-2 text-lg font-semibold leading-7">
              {reference.title || 'Untitled reference'}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {reference.authors || 'Authors not supplied'}
              {reference.journal ? ` · ${reference.journal}` : ''}
            </p>
          </div>
          {reference.researcherDecision && (
            <Badge variant="outline" className="shrink-0 capitalize">
              {reference.researcherDecision}
            </Badge>
          )}
        </div>
        <div className="rounded-xl bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
          {reference.abstract ||
            'No abstract was supplied in the database export. Review the available citation carefully.'}
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <ModelAssessment
            label="Miss Marple"
            status={reference.geminiStatus}
            decision={reference.geminiDecision}
            reason={reference.geminiReason}
            error={reference.geminiError}
          />
          <ModelAssessment
            label="Poirot"
            status={reference.openaiStatus}
            decision={reference.openaiDecision}
            reason={reference.openaiReason}
            error={reference.openaiError}
          />
          <ModelAssessment
            label="Zeous"
            status={reference.zeousStatus}
            decision={reference.zeousDecision}
            reason={reference.zeousReason}
            error={reference.zeousError}
          />
          {reference.adjudicatorStatus && (
            <div className="lg:col-span-3">
              <ModelAssessment
                label="Sherlock Holmes opinion"
                status={reference.adjudicatorStatus}
                decision={reference.adjudicatorDecision}
                reason={reference.adjudicatorReason}
                error={reference.adjudicatorError}
              />
            </div>
          )}
        </div>
        {firstLineComplete && (
          <div
            className={`rounded-xl border p-3 text-sm ${conflict ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
          >
            <strong>
              {conflict ? 'Screening conflict' : 'Detective majority'}
            </strong>
            <span className="mt-1 block">
              Miss Marple: {screeningDecisionLabel(reference.geminiDecision)} ·
              Poirot: {screeningDecisionLabel(reference.openaiDecision)} ·
              Zeous: {screeningDecisionLabel(reference.zeousDecision)}
            </span>
            {reference.adjudicatorStatus === 'complete' && (
              <span className="mt-1 block">
                Sherlock Holmes opinion:{' '}
                {screeningDecisionLabel(reference.adjudicatorDecision)}
              </span>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {reference.doi
              ? `DOI ${reference.doi}`
              : reference.pmid
                ? `PMID ${reference.pmid}`
                : 'No DOI or PMID'}
          </p>
          <div className="flex flex-wrap gap-2">
            {needsAi && (
              <button
                disabled={!aiReady || aiRunning}
                onClick={() => runAi(reference.id)}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-primary/25 bg-primary/8 px-3 text-sm font-medium text-primary transition hover:bg-primary/12 disabled:opacity-50"
              >
                <Sparkles className="size-4" />
                {aiRunning
                  ? 'Assessing…'
                  : reference.geminiStatus === 'failed' ||
                      reference.openaiStatus === 'failed' ||
                      reference.zeousStatus === 'failed'
                    ? 'Retry failed model'
                    : 'Run all three detectives'}
              </button>
            )}
            {conflict &&
              adjudicatorReady &&
              reference.adjudicatorStatus !== 'complete' && (
                <button
                  disabled={aiRunning}
                  onClick={() => runAi(reference.id, true)}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                >
                  <Sparkles className="size-4" />
                  {aiRunning
                    ? 'Reviewing conflict…'
                    : 'Resolve conflict with AI'}
                </button>
              )}
            <button
              disabled={saving}
              onClick={() => decide(reference.id, 'exclude')}
              className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition disabled:opacity-50 ${buttonClass('exclude')}`}
            >
              <X className="size-4" /> Exclude
            </button>
            <button
              disabled={saving}
              onClick={() => decide(reference.id, 'unclear')}
              className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition disabled:opacity-50 ${buttonClass('unclear')}`}
            >
              <MinusCircle className="size-4" /> Needs decision
            </button>
            <button
              disabled={saving}
              onClick={() => decide(reference.id, 'include')}
              className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition disabled:opacity-50 ${buttonClass('include')}`}
            >
              <Check className="size-4" /> Include
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function ModelAssessment({
  label,
  status,
  decision,
  reason,
  error,
}: {
  label: string;
  status: string | null;
  decision: 'include' | 'exclude' | 'unclear' | null;
  reason: string | null;
  error: string | null;
}) {
  if (!status)
    return (
      <div className="rounded-xl border border-dashed p-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold">{label}</p>
          <Badge variant="outline">Not run</Badge>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          No assessment has been requested.
        </p>
      </div>
    );
  if (status === 'failed')
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold">{label}</p>
          <Badge variant="outline" className="border-rose-200 text-rose-700">
            Failed safely
          </Badge>
        </div>
        <p className="mt-3 text-sm text-rose-700">{providerErrorText(error)}</p>
      </div>
    );
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{label}</p>
        <Badge>{screeningDecisionLabel(decision)}</Badge>
      </div>
      {reason && (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{reason}</p>
      )}
    </div>
  );
}

function screeningDecisionLabel(
  decision: 'include' | 'exclude' | 'unclear' | null,
) {
  return decision === 'include'
    ? 'Include'
    : decision === 'exclude'
      ? 'Exclude'
      : decision === 'unclear'
        ? 'Needs decision'
        : 'Not available';
}

function providerErrorText(code: string | null) {
  const messages: Record<string, string> = {
    provider_authentication: 'The AI service connection was rejected.',
    provider_credit: 'The AI service account has insufficient credits.',
    provider_rate_limit: 'The AI service rate limit was reached.',
    provider_unavailable: 'The AI service is temporarily unavailable.',
    provider_timeout: 'The AI service did not respond within one minute.',
    invalid_json: 'The AI service returned unreadable output.',
    invalid_schema: 'The AI output did not match the screening format.',
    missing_output: 'The AI service returned no assessment.',
  };
  return (
    messages[code || ''] ||
    'The AI request failed without changing any researcher decision.'
  );
}

function fullTextDetectiveIssues(item: FullTextScreeningItem) {
  return [
    {
      name: 'Miss Marple',
      status: item.marpleStatus,
      error: item.marpleError,
    },
    { name: 'Poirot', status: item.poirotStatus, error: item.poirotError },
    { name: 'Zeous', status: item.zeousStatus, error: item.zeousError },
  ].filter(
    (issue): issue is { name: string; status: string; error: string | null } =>
      issue.status === 'failed' || Boolean(issue.error),
  );
}

function fullTextNeedsLongRun(item: FullTextScreeningItem) {
  const issues = fullTextDetectiveIssues(item);
  return (
    issues.length > 0 &&
    issues.every((issue) => issue.error === 'provider_timeout')
  );
}

function fullTextIssueAdvice(item: FullTextScreeningItem) {
  const issues = fullTextDetectiveIssues(item);
  if (issues.some((issue) => issue.error === 'provider_timeout'))
    return `This ${formatBytes(item.size)} PDF previously reached the old response-time limit. It will now be scheduled after smaller files and allowed to continue without an application timeout.`;
  if (
    issues.some((issue) =>
      [
        'provider_authentication',
        'provider_credit',
        'provider_not_configured',
      ].includes(issue.error || ''),
    )
  )
    return 'This is an AI service account or configuration issue rather than an article-content problem. Ask the workspace administrator to check the private AI connection.';
  if (
    issues.some((issue) =>
      ['invalid_json', 'invalid_schema', 'missing_output'].includes(
        issue.error || '',
      ),
    )
  )
    return 'The detectives could read the request but did not return a usable screening decision after automatic retries. The article remains incomplete and has not been categorized.';
  return 'The article could not be completed after automatic retries. It remains clearly marked as incomplete and has not been placed in Include, Conflict, or Exclude.';
}

const NON_RETRYABLE_PROVIDER_ERRORS = new Set([
  'provider_authentication',
  'provider_credit',
  'provider_not_configured',
  'provider_request_rejected',
]);

function canRetryAutomatically(
  providers: { errorCode?: string | null }[] | undefined,
) {
  return !providers?.some((provider) =>
    NON_RETRYABLE_PROVIDER_ERRORS.has(provider.errorCode || ''),
  );
}

function waitForAutomaticRetry(attempt: number) {
  const delay = Math.min(15000, 750 * 2 ** Math.min(attempt - 1, 5));
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-muted/35 p-3">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

async function preparePdfForAi(sourceFile: Blob) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const sourceBytes = new Uint8Array(await sourceFile.arrayBuffer());
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(sourceBytes),
  });
  const source = await loadingTask.promise;
  const pageTexts: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
      const page = await source.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      pageTexts.push(text);
      page.cleanup();
    }
    const articleText = articleTextFromPages(pageTexts);
    if (normalizedPdfText(pageTexts.join(' ')).length < 200)
      throw new Error(
        'This PDF has no readable article text. Upload a searchable PDF with OCR text before AI screening.',
      );
    if (articleText.length > 300_000)
      throw new Error(
        'The extracted article text is too long for reliable AI screening.',
      );
    if (sourceBytes.byteLength <= FULL_TEXT_COMPRESSION_THRESHOLD)
      return { aiFile: null, articleText };

    // Try lossless structural compression. Never rasterize pages or replace
    // their text with an invisible overlay.
    const candidates: Uint8Array[] = [];
    try { candidates.push(await optimizePdfStructure(sourceBytes)); } catch {
      // A malformed PDF can still be assessed from its extracted text.
    }
    try {
      const { PDFDocument } = await import('pdf-lib');
      const document = await PDFDocument.load(sourceBytes);
      candidates.push(await document.save({ useObjectStreams: true }));
    } catch {
      // Keep the original and use the validated text when rewriting fails.
    }
    candidates.sort((a, b) => a.byteLength - b.byteLength);
    for (const bytes of candidates) {
      if (
        bytes.byteLength <= FULL_TEXT_COMPRESSION_THRESHOLD &&
        (await hasReadablePdfText(pdfjs, bytes, pageTexts))
      ) return { aiFile: searchablePdfFile(bytes), articleText };
    }
    return { aiFile: null, articleText };
  } finally {
    await loadingTask.destroy();
  }
}

function searchablePdfFile(bytes: Uint8Array<ArrayBufferLike>) {
  return new File([new Uint8Array(bytes)], 'ai-lossless-v3.pdf', {
    type: 'application/pdf',
  });
}

async function hasReadablePdfText(
  pdfjs: typeof import('pdfjs-dist'),
  bytes: Uint8Array<ArrayBufferLike>,
  sourcePages: string[],
) {
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  try {
    const document = await task.promise;
    const candidatePages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      candidatePages.push(content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' '));
      page.cleanup();
    }
    return retainsReadablePdfText(sourcePages, candidatePages);
  } catch {
    return false;
  } finally {
    await task.destroy();
  }
}

function formatBytes(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
}

function BillingDialog({ close }: { close: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="billing-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="billing-title" className="text-lg font-semibold">
              EvidenceFlow Pro
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Billing is prepared as a 14-day trial gate. A payment provider
              must be connected before real charges can be collected.
            </p>
          </div>
          <button onClick={close} aria-label="Close billing">
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-5 rounded-xl border bg-muted/35 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold">Pro workspace</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Saved reviews, imports, screening, and exports
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-semibold">$29</span>
              <span className="text-sm text-muted-foreground">/month</span>
            </div>
          </div>
          <ul className="mt-5 space-y-2 text-sm">
            {[
              'Private review history',
              'Up to 25,000 references per file',
              'Researcher-controlled AI workflow',
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <Check className="size-4 text-[var(--success-ink)]" />
                {item}
              </li>
            ))}
          </ul>
          <Button disabled className="mt-5 w-full">
            <CreditCard /> Checkout connection required
          </Button>
        </div>
      </div>
    </div>
  );
}
function RailButton({
  label,
  icon,
  active = false,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`grid size-11 place-items-center rounded-2xl transition ${active ? 'bg-white text-primary shadow-lg' : 'text-white/55 hover:bg-white/10 hover:text-white'} [&_svg]:size-5`}
    >
      {icon}
    </button>
  );
}
function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
function SectionHeading({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string;
}) {
  return (
    <div className="section-heading">
      <span className="section-icon">{icon}</span>
      <div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
    </div>
  );
}
function Field({
  label,
  required,
  optional,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {label}
        {required && (
          <span className="text-xs font-normal text-destructive">Required</span>
        )}
        {optional && (
          <span className="text-xs font-normal text-muted-foreground">
            Optional
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
