import { env } from 'cloudflare:workers';
import { isSameOriginPost, normalizeEmail, readAuthInput } from '@/lib/auth';
import {
  newResetToken,
  RESET_LINK_LIFETIME_MS,
  resetTokenDigest,
} from '@/lib/password-reset';
import {
  passwordResetEmailConfigured,
  sendPasswordResetEmail,
} from '@/lib/verification-email';

const REQUEST_WINDOW_MS = 60 * 60 * 1000;
const GENERIC_RESPONSE = {
  ok: true,
  message:
    'If this email has an account, a password reset link will arrive shortly.',
};
type AttemptRow = {
  failures: number;
  windowStart: number;
  blockedUntil: number;
};

export async function POST(request: Request) {
  if (!isSameOriginPost(request))
    return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  const body = await readAuthInput(request);
  const email = normalizeEmail(body?.email);
  if (!email)
    return Response.json(
      { error: 'Enter a valid email address.' },
      { status: 400 },
    );
  if (!passwordResetEmailConfigured())
    return Response.json(
      {
        error:
          'Password recovery email is temporarily unavailable. Please try again later.',
      },
      { status: 503 },
    );

  const now = Date.now();
  const key = `password-reset:${email}`;
  const previous = await env.DB.prepare(
    'SELECT failures, window_start AS windowStart, blocked_until AS blockedUntil FROM login_attempts WHERE username = ?',
  )
    .bind(key)
    .first<AttemptRow>();
  if (previous && previous.blockedUntil > now)
    return Response.json(GENERIC_RESPONSE, {
      headers: { 'Cache-Control': 'no-store' },
    });
  const inWindow = previous && now - previous.windowStart < REQUEST_WINDOW_MS;
  const requests = inWindow ? previous.failures + 1 : 1;
  await env.DB.prepare(`INSERT INTO login_attempts (username, failures, window_start, blocked_until)
    VALUES (?, ?, ?, ?) ON CONFLICT(username) DO UPDATE SET failures = excluded.failures,
    window_start = excluded.window_start, blocked_until = excluded.blocked_until`)
    .bind(
      key,
      requests,
      inWindow ? previous.windowStart : now,
      requests >= 3 ? now + REQUEST_WINDOW_MS : 0,
    )
    .run();
  if (requests > 3)
    return Response.json(GENERIC_RESPONSE, {
      headers: { 'Cache-Control': 'no-store' },
    });

  const user = await env.DB.prepare(
    'SELECT id FROM users WHERE lower(email) = ?',
  )
    .bind(email)
    .first<{ id: string }>();
  if (!user)
    return Response.json(GENERIC_RESPONSE, {
      headers: { 'Cache-Control': 'no-store' },
    });

  const token = newResetToken();
  const tokenHash = await resetTokenDigest(token);
  const saved =
    await env.DB.prepare(`INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET token_hash = excluded.token_hash,
      expires_at = excluded.expires_at, created_at = excluded.created_at
    WHERE password_reset_tokens.created_at <= ?`)
      .bind(tokenHash, user.id, now + RESET_LINK_LIFETIME_MS, now, now - 60_000)
      .run();
  if (!saved.meta.changes)
    return Response.json(GENERIC_RESPONSE, {
      headers: { 'Cache-Control': 'no-store' },
    });

  const publicOrigin = new URL(env.APP_PUBLIC_URL || request.url).origin;
  const link = new URL('/reset-password', publicOrigin);
  link.searchParams.set('token', token);
  if (!(await sendPasswordResetEmail(email, link.toString()))) {
    await env.DB.prepare(
      'DELETE FROM password_reset_tokens WHERE token_hash = ?',
    )
      .bind(tokenHash)
      .run();
    console.error('Password reset email could not be sent');
  }
  return Response.json(GENERIC_RESPONSE, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
