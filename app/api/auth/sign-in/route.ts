import { env } from 'cloudflare:workers';
import { createSession, isSameOriginPost, normalizeEmail, normalizeUsername, readAuthInput, verifyPassword } from '@/lib/auth';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

type CredentialRow = { userId: string; passwordHash: string; passwordSalt: string; passwordIterations: number };
type AttemptRow = { failures: number; windowStart: number; blockedUntil: number };

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  const body = await readAuthInput(request);
  const identifier = typeof body?.identifier === 'string' ? body.identifier : '';
  const login = identifier.includes('@') ? normalizeEmail(identifier) : normalizeUsername(identifier);
  const password = body?.password;
  if (!login || typeof password !== 'string' || password.length > 128) {
    return Response.json({ error: 'Invalid email/username or password.' }, { status: 401 });
  }

  const now = Date.now();
  const credential = await env.DB.prepare(`SELECT c.user_id AS userId, c.password_hash AS passwordHash,
    c.password_salt AS passwordSalt, c.password_iterations AS passwordIterations
    FROM account_credentials c JOIN users u ON u.id = c.user_id
    WHERE c.username = ? OR lower(u.email) = ? LIMIT 1`).bind(login, login).first<CredentialRow>();
  const attemptKey = credential?.userId ?? login;
  const attempt = await env.DB.prepare('SELECT failures, window_start AS windowStart, blocked_until AS blockedUntil FROM login_attempts WHERE username = ?')
    .bind(attemptKey).first<AttemptRow>();
  if (attempt && attempt.blockedUntil > now) {
    return Response.json({ error: 'Too many attempts. Please try again in 15 minutes.' }, { status: 429 });
  }

  const valid = credential
    ? await verifyPassword(password, credential.passwordHash, credential.passwordSalt, credential.passwordIterations)
    : false;
  if (!credential || !valid) {
    const failures = attempt && now - attempt.windowStart < WINDOW_MS ? attempt.failures + 1 : 1;
    const windowStart = attempt && now - attempt.windowStart < WINDOW_MS ? attempt.windowStart : now;
    const blockedUntil = failures >= MAX_FAILURES ? now + WINDOW_MS : 0;
    await env.DB.prepare(`INSERT INTO login_attempts (username, failures, window_start, blocked_until) VALUES (?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET failures = excluded.failures,
      window_start = excluded.window_start, blocked_until = excluded.blocked_until`)
      .bind(attemptKey, failures, windowStart, blockedUntil).run();
    return Response.json({ error: 'Invalid email/username or password.' }, { status: 401 });
  }

  await env.DB.prepare('DELETE FROM login_attempts WHERE username = ?').bind(attemptKey).run();
  const cookie = await createSession(credential.userId, request, body?.rememberMe === true);
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } });
}
