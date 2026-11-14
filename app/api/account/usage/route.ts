import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/current-user';
import { accessPlan, demoUsage } from '@/lib/demo-access';

type UsageRow = { requestCount: number; pricedCount: number; unpricedCount: number; costUsdNanos: number | null };

export async function GET() {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const [usage, wallet, demo, plan] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS requestCount,
      SUM(CASE WHEN cost_usd_nanos IS NOT NULL THEN 1 ELSE 0 END) AS pricedCount,
      SUM(CASE WHEN cost_usd_nanos IS NULL THEN 1 ELSE 0 END) AS unpricedCount,
      COALESCE(SUM(cost_usd_nanos), 0) AS costUsdNanos
      FROM ai_usage_events WHERE user_id = ?`).bind(user.userId).first<UsageRow>(),
    env.DB.prepare('SELECT balance_irt AS balanceIrt FROM account_wallets WHERE user_id = ?')
      .bind(user.userId).first<{ balanceIrt: number }>(),
    demoUsage(user.userId),
    accessPlan(user.userId),
  ]);
  return Response.json({
    balanceIrt: wallet?.balanceIrt ?? 0,
    requestCount: usage?.requestCount ?? 0,
    pricedCount: usage?.pricedCount ?? 0,
    unpricedCount: usage?.unpricedCount ?? 0,
    costUsdNanos: usage?.costUsdNanos ?? 0,
    currency: 'IRT',
    paymentReady: false,
    demo,
    plan,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
