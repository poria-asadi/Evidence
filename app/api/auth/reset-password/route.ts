import { env } from 'cloudflare:workers';
import {
  hashPassword,
  isSameOriginPost,
  PASSWORD_ITERATIONS,
  readAuthInput,
  validPassword,
} from '@/lib/auth';
import { resetTokenDigest, validResetToken } from '@/lib/password-reset';

type ResetRow = { userId: string };

export async function POST(request: Request) {
  if (!isSameOriginPost(request))
    return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  const body = await readAuthInput(request);
  if (!validResetToken(body?.token))
    return Response.json(
      { error: 'This reset link is invalid or expired. Request a new one.' },
      { status: 400 },
    );
  if (!validPassword(body?.password))
    return Response.json(
      { error: 'Use a password with at least 12 characters.' },
      { status: 400 },
    );

  const tokenHash = await resetTokenDigest(body.token);
  const now = Date.now();
  const reset = await env.DB.prepare(
    'SELECT user_id AS userId FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ?',
  )
    .bind(tokenHash, now)
    .first<ResetRow>();
  if (!reset)
    return Response.json(
      { error: 'This reset link is invalid or expired. Request a new one.' },
      { status: 400 },
    );

  const { hash, salt } = await hashPassword(body.password);
  const expiresAfter = Date.now();
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE account_credentials SET password_hash = ?, password_salt = ?,
      password_iterations = ? WHERE user_id = ? AND EXISTS (
        SELECT 1 FROM password_reset_tokens WHERE token_hash = ? AND user_id = ? AND expires_at > ?
      )`).bind(hash, salt, PASSWORD_ITERATIONS, reset.userId, tokenHash, reset.userId, expiresAfter),
    env.DB.prepare(`DELETE FROM account_sessions WHERE user_id = ? AND EXISTS (
      SELECT 1 FROM password_reset_tokens WHERE token_hash = ? AND user_id = ? AND expires_at > ?
    )`).bind(reset.userId, tokenHash, reset.userId, expiresAfter),
    env.DB.prepare(`DELETE FROM login_attempts WHERE username = ? AND EXISTS (
      SELECT 1 FROM password_reset_tokens WHERE token_hash = ? AND user_id = ? AND expires_at > ?
    )`).bind(reset.userId, tokenHash, reset.userId, expiresAfter),
    env.DB.prepare('DELETE FROM password_reset_tokens WHERE token_hash = ? AND user_id = ? AND expires_at > ?')
      .bind(tokenHash, reset.userId, expiresAfter),
  ]);
  if (results[0].meta.changes !== 1 || results[3].meta.changes !== 1)
    return Response.json(
      {
        error:
          'This reset link was already used or expired. Request a new one.',
      },
      { status: 400 },
    );

  return Response.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
