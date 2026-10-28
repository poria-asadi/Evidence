import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';

export async function requireApiUser() {
  const user = await getChatGPTUser();
  if (!user) return null;
  const now = Date.now();
  const isLocalDevelopment = env.LOCAL_DEV_AUTH === 'true';
  const trialEndsAt = now + 14 * 24 * 60 * 60 * 1000;
  const statements = [
    env.DB.prepare(`INSERT INTO users (id, email, display_name, created_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name`).bind(
      user.userId,
      user.email,
      user.displayName,
      now,
    ),
    isLocalDevelopment
      ? env.DB.prepare(`INSERT INTO subscriptions (user_id, plan, status, trial_ends_at, updated_at)
          VALUES (?, 'development', 'active', ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, status = excluded.status,
            trial_ends_at = excluded.trial_ends_at, updated_at = excluded.updated_at`).bind(
          user.userId,
          trialEndsAt,
          now,
        )
      : env.DB.prepare(`INSERT INTO subscriptions (user_id, plan, status, trial_ends_at, updated_at)
          VALUES (?, 'trial', 'trialing', ?, ?) ON CONFLICT(user_id) DO NOTHING`).bind(
          user.userId,
          trialEndsAt,
          now,
        ),
  ];
  await env.DB.batch(statements);
  return user;
}

export async function hasActiveAccess(userId: string) {
  // Local development must remain usable while payment integration is not yet
  // connected. Hosted environments do not define LOCAL_DEV_AUTH and continue
  // to enforce their stored trial/subscription status.
  if (env.LOCAL_DEV_AUTH === 'true') return true;
  const row = await env.DB.prepare(
    'SELECT status, trial_ends_at AS trialEndsAt FROM subscriptions WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ status: string; trialEndsAt: number }>();
  return Boolean(
    row &&
    (row.status === 'active' ||
      (row.status === 'trialing' && row.trialEndsAt > Date.now())),
  );
}
