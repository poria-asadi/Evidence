import { env } from 'cloudflare:workers';

export type UsageContext = {
  userId: string;
  operation: 'title_abstract' | 'full_text' | 'adjudication' | 'extraction_plan' | 'extraction';
  model: string;
};

type OpenRouterUsageResponse = {
  id?: unknown;
  model?: unknown;
  usage?: { cost?: unknown };
};

export class UsageLedgerError extends Error {
  constructor() { super('Usage tracking is temporarily unavailable. Please try again later.'); }
}

export function costUsdNanos(value: unknown): number | null {
  const cost = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(cost) || cost < 0 || cost > 1_000_000) return null;
  return Math.round(cost * 1_000_000_000);
}

export async function trackedOpenRouterFetch(url: string, init: RequestInit, context: UsageContext): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    await recordUsage(context, null, null);
    throw error;
  }
  const payload = await response.clone().json().catch(() => null) as OpenRouterUsageResponse | null;
  await recordUsage(context, response.status, payload);
  return response;
}

async function recordUsage(context: UsageContext, httpStatus: number | null,
  response: OpenRouterUsageResponse | null): Promise<void> {
  const requestId = typeof response?.id === 'string' && response.id.length <= 180 ? response.id : null;
  const model = typeof response?.model === 'string' && response.model.length <= 180 ? response.model : context.model;
  const cost = costUsdNanos(response?.usage?.cost);
  try {
    await env.DB.prepare(`INSERT INTO ai_usage_events
    (id, user_id, provider_request_id, operation, model, http_status, cost_usd_nanos, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider_request_id) DO NOTHING`)
      .bind(crypto.randomUUID(), context.userId, requestId, context.operation, model,
        httpStatus, cost, Date.now()).run();
  } catch {
    console.error('OpenRouter usage event could not be saved', { requestId, userId: context.userId });
    throw new UsageLedgerError();
  }
}
