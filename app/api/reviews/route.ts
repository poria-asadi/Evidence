import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/current-user';

export async function GET() {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const reviews = await env.DB.prepare(`SELECT r.id, r.title, r.purpose, r.inclusion, r.exclusion,
    r.population, r.intervention, r.comparison, r.outcomes, r.stage, r.updated_at AS updatedAt,
    (SELECT COUNT(*) FROM "references" x WHERE x.review_id = r.id) AS referenceCount
    FROM reviews r WHERE r.owner_id = ? ORDER BY r.updated_at DESC LIMIT 30`).bind(user.userId).all();
  const subscription = await env.DB.prepare('SELECT plan, status, trial_ends_at AS trialEndsAt FROM subscriptions WHERE user_id = ?').bind(user.userId).first();
  return Response.json({ reviews: reviews.results, subscription });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const title = required(body.title, 'Review title');
  const purpose = required(body.purpose, 'Main purpose');
  const inclusion = required(body.inclusion, 'Inclusion criteria');
  const exclusion = required(body.exclusion, 'Exclusion criteria');
  if (title instanceof Response) return title;
  if (purpose instanceof Response) return purpose;
  if (inclusion instanceof Response) return inclusion;
  if (exclusion instanceof Response) return exclusion;
  const id = crypto.randomUUID(); const now = Date.now();
  await env.DB.prepare(`INSERT INTO reviews (id, owner_id, title, purpose, inclusion, exclusion, population, intervention, comparison, outcomes, stage, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'protocol', ?, ?)`).bind(id, user.userId, title, purpose, inclusion, exclusion, optional(body.population), optional(body.intervention), optional(body.comparison), optional(body.outcomes), now, now).run();
  return Response.json({ id, updatedAt: now }, { status: 201 });
}

function optional(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function required(value: unknown, label: string): string | Response { return typeof value === 'string' && value.trim() ? value.trim() : Response.json({ error: `${label} is required.` }, { status: 400 }); }
