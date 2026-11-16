// Follow-up to benchmark-five-articles.mjs: measure column-count sensitivity.
// Run only with --run; this makes paid AI requests.
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

if (!process.argv.includes('--run')) throw new Error('Pass --run to start the paid column benchmark.');

const path = '/private/tmp/evidenceflow-benchmark/report.json';
const report = JSON.parse(readFileSync(path, 'utf8'));
const db = new DatabaseSync('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite');
const userId = db.prepare('SELECT id FROM users WHERE email = ?').get('evidenceflow-benchmark-20261116@local.invalid')?.id;
if (!userId || !report.reviewId || report.stages.extraction.length !== 5) throw new Error('Run the five-paper benchmark first.');
const token = randomBytes(32).toString('hex');
const now = Date.now();
db.prepare('INSERT INTO account_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(createHash('sha256').update(token).digest('hex'), userId, now + 86_400_000, now);
const base = 'http://[::1]:3000';
async function api(path, body) {
  const started = performance.now();
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { Cookie: `ef_session=${token}`, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(value)}`);
  return { seconds: (performance.now() - started) / 1000, value };
}
function usage(operation) {
  const row = db.prepare('SELECT SUM(cost_usd_nanos) AS nanos, COUNT(*) AS requests FROM ai_usage_events WHERE user_id = ? AND operation = ?').get(userId, operation);
  return { usd: Number(row.nanos ?? 0) / 1e9, requests: row.requests };
}
async function measured(stage, operation, paper, body) {
  const before = usage(operation);
  const { seconds } = await api(`/api/reviews/${report.reviewId}/extraction`, body);
  const after = usage(operation);
  const result = { paper, seconds, usd: after.usd - before.usd, requests: after.requests - before.requests };
  report.stages[stage].push(result);
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(`${stage} ${paper}: ${seconds.toFixed(1)} s, $${result.usd.toFixed(6)}, ${result.requests} requests`);
}
report.stages.extraction12 ??= [];
report.stages.extractionPlan12 ??= [];
const headers = ['Article title', 'Publication year', 'Study design', 'LLM models evaluated', 'Review stage evaluated', 'Main finding', 'Publication venue', 'Evaluation dataset', 'Number of evaluated articles', 'Screening accuracy', 'Extraction accuracy', 'Study limitations'];
if (!report.stages.extractionPlan12.length) {
  await api(`/api/reviews/${report.reviewId}/extraction`, { action: 'create', headers });
  await measured('extractionPlan12', 'extraction_plan', 'twelve columns', { action: 'analyze' });
}
const entries = [...readFileSync('/private/tmp/evidenceflow-benchmark/metadata.xml', 'utf8').matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => ({
  id: match[1].match(/<id>[^<]*?(\d{4}\.\d{4,5})v\d+<\/id>/)?.[1],
  title: match[1].match(/<title>([\s\S]*?)<\/title>/)?.[1].replace(/\s+/g, ' ').trim(),
}));
for (const paper of ['2310.17526', '2412.15247']) {
  if (report.stages.extraction12.some((entry) => entry.paper === paper)) continue;
  const title = entries.find((entry) => entry.id === paper)?.title;
  const ref = db.prepare('SELECT id FROM "references" WHERE review_id = ? AND title = ?').get(report.reviewId, title);
  if (!ref) throw new Error(`Missing reference ${paper}`);
  await measured('extraction12', 'extraction', paper, { action: 'extract', referenceId: ref.id });
}
console.log(`Updated ${path}`);
