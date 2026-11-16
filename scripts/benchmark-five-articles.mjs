// Local, opt-in benchmark. Uses the five public arXiv PDFs in
// /private/tmp/evidenceflow-benchmark and a separate account in local D1.
// Run only with --run; this makes paid AI requests.
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

if (!process.argv.includes('--run')) throw new Error('Pass --run to start the paid local AI benchmark.');

const dir = '/private/tmp/evidenceflow-benchmark';
const ids = ['2405.14445', '2310.17526', '2412.15247', '2406.17755', '2404.15667'];
const db = new DatabaseSync('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite');
const email = 'evidenceflow-benchmark-20261116@local.invalid';
const userId = db.prepare('SELECT id FROM users WHERE email = ?').get(email)?.id ?? randomUUID();
if (db.prepare('SELECT 1 AS found FROM reviews WHERE owner_id = ? LIMIT 1').get(userId))
  throw new Error('This benchmark account already has a review; reuse its saved report instead of running again.');
const now = Date.now();
db.prepare('INSERT OR IGNORE INTO users (id, email, display_name, created_at) VALUES (?, ?, ?, ?)').run(userId, email, 'Benchmark User', now);
db.prepare('INSERT OR IGNORE INTO account_credentials (user_id, username, password_hash, password_salt, password_iterations, created_at) VALUES (?, ?, ?, ?, 600000, ?)').run(userId, 'evidenceflow_benchmark_20261116', randomBytes(32).toString('hex'), randomBytes(32).toString('hex'), now);
db.prepare("INSERT OR IGNORE INTO subscriptions (user_id, plan, status, updated_at) VALUES (?, 'active', 'active', ?)").run(userId, now);
const token = randomBytes(32).toString('hex');
db.prepare('INSERT INTO account_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(createHash('sha256').update(token).digest('hex'), userId, now + 86_400_000, now);
const base = 'http://[::1]:3000';
const cookie = `ef_session=${token}`;
async function api(path, method = 'GET', body) {
  const headers = { Cookie: cookie, Origin: base };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const started = performance.now();
  const response = await fetch(`${base}${path}`, { method, headers, ...(payload === undefined ? {} : { body: payload }) });
  const value = await response.json().catch(() => ({}));
  const seconds = (performance.now() - started) / 1000;
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(value)}`);
  return { value, seconds };
}
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const entries = [...readFileSync(`${dir}/metadata.xml`, 'utf8').matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => {
  const xml = match[1];
  const get = (tag) => decode(xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? '');
  return { id: get('id').match(/\d{4}\.\d{4,5}/)?.[0], title: get('title'), abstract: get('summary'), year: get('published').slice(0, 4), authors: [...xml.matchAll(/<author>\s*<name>(.*?)<\/name>/gs)].map((a) => decode(a[1])).join('; ') };
});
if (entries.length !== 5 || ids.some((id) => !entries.some((e) => e.id === id))) throw new Error('Expected metadata for five papers.');
const reportPath = `${dir}/report.json`;
const report = { papers: ids, stages: { titleAbstract: [], fullText: [], extractionPlan: [], extraction: [] }, extractionColumns: 6 };
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2));
const review = await api('/api/reviews', 'POST', {
  title: 'Benchmark: LLM support for systematic reviews (five open-access articles)',
  purpose: 'Evaluate published research on large language models supporting systematic-review screening or data extraction.',
  inclusion: 'Research or methodological articles that evaluate, develop, or discuss large language models for systematic-review screening, evidence synthesis, or data extraction.',
  exclusion: 'Articles unrelated to systematic reviews or large language models; duplicate records.',
  population: 'Systematic reviews and evidence-synthesis workflows',
  intervention: 'Large language models',
  outcomes: 'Screening or extraction methods and performance',
});
const reviewId = review.value.id;
report.reviewId = reviewId; save();
console.log(`Created isolated benchmark review ${reviewId}`);
const ris = ids.map((id) => {
  const e = entries.find((item) => item.id === id);
  return `TY  - JOUR\nTI  - ${e.title}\nAB  - ${e.abstract}\nAU  - ${e.authors}\nPY  - ${e.year}\nUR  - https://arxiv.org/abs/${id}\nER  -`;
}).join('\n\n');
const importForm = new FormData();
importForm.append('file', new File([ris], 'benchmark-papers.ris', { type: 'text/plain' }));
await api(`/api/reviews/${reviewId}/imports`, 'POST', importForm);
const refs = db.prepare('SELECT id, title FROM "references" WHERE review_id = ?').all(reviewId);
if (refs.length !== 5) throw new Error(`Expected five references, got ${refs.length}`);
const cost = (operation) => {
  const row = db.prepare('SELECT SUM(cost_usd_nanos) AS nanos, COUNT(*) AS requests FROM ai_usage_events WHERE user_id = ? AND operation = ?').get(userId, operation);
  return { usd: Number(row.nanos ?? 0) / 1e9, requests: row.requests };
};
async function measured(stage, operation, id, action) {
  const before = cost(operation);
  const { seconds, value } = await action();
  const after = cost(operation);
  const item = { paper: id, seconds, usd: after.usd - before.usd, requests: after.requests - before.requests };
  report.stages[stage].push(item); save();
  console.log(`${stage} ${id}: ${seconds.toFixed(1)} s, $${item.usd.toFixed(6)}, ${item.requests} requests`);
  return value;
}
for (const id of ids) {
  const e = entries.find((item) => item.id === id);
  const ref = refs.find((r) => r.title === e.title);
  if (!ref) throw new Error(`Reference missing: ${id}`);
  await measured('titleAbstract', 'title_abstract', id, () => api(`/api/reviews/${reviewId}/screening/run`, 'POST', { referenceId: ref.id }));
  await api(`/api/reviews/${reviewId}/screening/${ref.id}`, 'PATCH', { decision: 'include', notes: 'Benchmark inclusion to measure all stages.' });
}
await api(`/api/reviews/${reviewId}/full-texts/criteria`, 'PATCH', { useTiabCriteria: true });
for (const id of ids) {
  const e = entries.find((item) => item.id === id);
  const ref = refs.find((r) => r.title === e.title);
  const pdf = readFileSync(`${dir}/${id}.pdf`);
  const form = new FormData();
  form.append('referenceId', ref.id);
  form.append('file', new File([pdf], `${id}.pdf`, { type: 'application/pdf' }));
  await api(`/api/reviews/${reviewId}/full-texts`, 'POST', form);
  await measured('fullText', 'full_text', id, () => api(`/api/reviews/${reviewId}/full-texts/screening`, 'POST', { referenceId: ref.id, costConfirmed: true }));
  await api(`/api/reviews/${reviewId}/full-texts/${ref.id}/decision`, 'PATCH', { decision: 'include', notes: 'Benchmark inclusion to measure extraction.' });
}
const columns = ['Article title', 'Publication year', 'Study design', 'LLM models evaluated', 'Review stage evaluated', 'Main finding'];
await api(`/api/reviews/${reviewId}/extraction`, 'POST', { action: 'create', headers: columns });
await measured('extractionPlan', 'extraction_plan', 'six columns', () => api(`/api/reviews/${reviewId}/extraction`, 'POST', { action: 'analyze' }));
for (const id of ids) {
  const e = entries.find((item) => item.id === id);
  const ref = refs.find((r) => r.title === e.title);
  await measured('extraction', 'extraction', id, () => api(`/api/reviews/${reviewId}/extraction`, 'POST', { action: 'extract', referenceId: ref.id }));
}
console.log(`Benchmark report: ${reportPath}`);
