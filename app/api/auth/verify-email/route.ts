import { env } from 'cloudflare:workers';
import { createSession, isSameOriginPost, normalizeEmail, readAuthInput } from '@/lib/auth';
import { codeDigest, sameDigest } from '@/lib/verification-email';

type Pending = {
  username: string; firstName: string; lastName: string; fieldOfStudy: string;
  educationLevel: string; passwordHash: string; passwordSalt: string;
  passwordIterations: number; codeHash: string; expiresAt: number; attempts: number;
};

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  const body = await readAuthInput(request);
  const email = normalizeEmail(body?.email);
  const code = body?.code;
  if (!email || typeof code !== 'string' || !/^\d{6}$/.test(code))
    return Response.json({ error: 'Enter the six-digit code from your email.' }, { status: 400 });
  const now = Date.now();
  const pending = await env.DB.prepare(`SELECT username, first_name AS firstName, last_name AS lastName,
    field_of_study AS fieldOfStudy, education_level AS educationLevel, password_hash AS passwordHash,
    password_salt AS passwordSalt, password_iterations AS passwordIterations,
    code_hash AS codeHash, expires_at AS expiresAt, attempts
    FROM pending_registrations WHERE email = ?`).bind(email).first<Pending>();
  if (!pending || pending.expiresAt <= now)
    return Response.json({ error: 'The code expired. Return to sign up to request a new one.' }, { status: 400 });
  if (pending.attempts >= 5)
    return Response.json({ error: 'Too many attempts. Return to sign up to request a new code.' }, { status: 429 });
  const attempt = await env.DB.prepare(`UPDATE pending_registrations SET attempts = attempts + 1
    WHERE email = ? AND code_hash = ? AND expires_at > ? AND attempts < 5`)
    .bind(email, pending.codeHash, now).run();
  if (!attempt.meta.changes) return Response.json({ error: 'The code expired or was replaced.' }, { status: 400 });
  if (!sameDigest(await codeDigest(email, code), pending.codeHash))
    return Response.json({ error: 'Incorrect code. Please try again.' }, { status: 400 });

  const consumed = await env.DB.prepare('DELETE FROM pending_registrations WHERE email = ? AND code_hash = ?')
    .bind(email, pending.codeHash).run();
  if (!consumed.meta.changes)
    return Response.json({ error: 'The code was already used or replaced. Please request a new code.' }, { status: 409 });

  const userId = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, email, display_name, first_name, last_name,
        field_of_study, education_level, email_verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(userId, email, `${pending.firstName} ${pending.lastName}`, pending.firstName,
          pending.lastName, pending.fieldOfStudy, pending.educationLevel, now, now),
      env.DB.prepare(`INSERT INTO account_credentials
        (user_id, username, password_hash, password_salt, password_iterations, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(userId, pending.username, pending.passwordHash, pending.passwordSalt,
          pending.passwordIterations, now),
      env.DB.prepare(`INSERT INTO subscriptions (user_id, plan, status, updated_at)
        VALUES (?, 'demo', 'demo', ?)`)
        .bind(userId, now),
      env.DB.prepare('INSERT INTO account_wallets (user_id, balance_irt, updated_at) VALUES (?, 0, ?)')
        .bind(userId, now),
    ]);
  } catch {
    return Response.json({ error: 'This email or username is already registered. Please sign in.' }, { status: 409 });
  }
  const cookie = await createSession(userId, request);
  return Response.json({ ok: true }, { status: 201,
    headers: { 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } });
}
