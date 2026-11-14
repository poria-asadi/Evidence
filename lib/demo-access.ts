import { env } from 'cloudflare:workers';

export const DEMO_LIMITS = {
  title_abstract: 25,
  full_text: 5,
  extraction: 1,
} as const;

export type DemoStage = keyof typeof DEMO_LIMITS;

export async function accessPlan(userId: string) {
  const row = await env.DB.prepare('SELECT status FROM subscriptions WHERE user_id = ?')
    .bind(userId).first<{ status: string }>();
  return row?.status === 'active' ? 'active' : row?.status === 'demo' ? 'demo' : null;
}

export async function claimDemoUse(userId: string, stage: DemoStage, referenceId: string) {
  const plan = await accessPlan(userId);
  if (plan === 'active') return true;
  if (plan !== 'demo') return false;
  const result = await env.DB.prepare(`INSERT OR IGNORE INTO demo_ai_uses
    (id, user_id, stage, reference_id, created_at)
    SELECT ?, ?, ?, ?, ?
    WHERE (SELECT COUNT(*) FROM demo_ai_uses WHERE user_id = ? AND stage = ?) < ?`)
    .bind(crypto.randomUUID(), userId, stage, referenceId, Date.now(), userId, stage,
      DEMO_LIMITS[stage]).run();
  if (result.meta.changes) return true;
  const existing = await env.DB.prepare(`SELECT 1 AS found FROM demo_ai_uses
    WHERE user_id = ? AND stage = ? AND reference_id = ?`)
    .bind(userId, stage, referenceId).first();
  return Boolean(existing);
}

export async function demoUsage(userId: string) {
  const rows = await env.DB.prepare(`SELECT stage, COUNT(*) AS used
    FROM demo_ai_uses WHERE user_id = ? GROUP BY stage`).bind(userId)
    .all<{ stage: string; used: number }>();
  const counts = Object.fromEntries(rows.results.map(({ stage, used }) => [stage, used]));
  return {
    titleAbstract: { used: Number(counts.title_abstract ?? 0), limit: DEMO_LIMITS.title_abstract },
    fullText: { used: Number(counts.full_text ?? 0), limit: DEMO_LIMITS.full_text },
    extraction: { used: Number(counts.extraction ?? 0), limit: DEMO_LIMITS.extraction },
  };
}
