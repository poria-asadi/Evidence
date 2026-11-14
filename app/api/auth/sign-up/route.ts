import { env } from 'cloudflare:workers';
import { hashPassword, isSameOriginPost, normalizeEmail, normalizeUsername,
  PASSWORD_ITERATIONS, readAuthInput, validPassword, validProfileField } from '@/lib/auth';
import { codeDigest, newVerificationCode, sendVerificationEmail,
  VERIFICATION_CODE_LIFETIME_MS, verificationConfigured } from '@/lib/verification-email';

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  const body = await readAuthInput(request);
  const username = normalizeUsername(body?.username);
  const email = normalizeEmail(body?.email);
  const firstName = body?.firstName;
  const lastName = body?.lastName;
  const fieldOfStudy = body?.fieldOfStudy;
  const educationLevel = body?.educationLevel;
  if (!username) return Response.json({ error: 'Use 3–32 letters, numbers, dots, hyphens or underscores for the username.' }, { status: 400 });
  if (!email) return Response.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (!validProfileField(firstName) || !validProfileField(lastName) ||
      !validProfileField(fieldOfStudy) || !validProfileField(educationLevel))
    return Response.json({ error: 'Complete your name, field of study and education level.' }, { status: 400 });
  if (!validPassword(body?.password)) return Response.json({ error: 'Use a password with at least 12 characters.' }, { status: 400 });
  if (!verificationConfigured()) return Response.json({ error: 'Email verification is not configured yet. Please contact the site administrator.' }, { status: 503 });

  const existing = await env.DB.prepare(`SELECT u.id FROM users u LEFT JOIN account_credentials c ON c.user_id = u.id
    WHERE lower(u.email) = ? OR c.username = ? LIMIT 1`).bind(email, username).first();
  if (existing) return Response.json({ error: 'This email or username is already registered.' }, { status: 409 });
  const now = Date.now();
  const code = newVerificationCode();
  const codeHash = await codeDigest(email, code);
  const { hash, salt } = await hashPassword(body.password);
  const saved = await env.DB.prepare(`INSERT INTO pending_registrations
    (email, username, first_name, last_name, field_of_study, education_level,
      password_hash, password_salt, password_iterations, code_hash, expires_at, attempts, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT(email) DO UPDATE SET username = excluded.username, first_name = excluded.first_name,
      last_name = excluded.last_name, field_of_study = excluded.field_of_study,
      education_level = excluded.education_level, password_hash = excluded.password_hash,
      password_salt = excluded.password_salt, password_iterations = excluded.password_iterations,
      code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at
    WHERE pending_registrations.sent_at <= ?`)
    .bind(email, username, firstName.trim(), lastName.trim(), fieldOfStudy.trim(), educationLevel.trim(),
      hash, salt, PASSWORD_ITERATIONS, codeHash, now + VERIFICATION_CODE_LIFETIME_MS, now, now - 60_000).run();
  if (!saved.meta.changes)
    return Response.json({ error: 'Please wait one minute before requesting another code.' }, { status: 429 });

  if (!(await sendVerificationEmail(email, code))) {
    await env.DB.prepare('DELETE FROM pending_registrations WHERE email = ? AND code_hash = ?')
      .bind(email, codeHash).run();
    return Response.json({ error: 'The verification email could not be sent. Please try again.' }, { status: 502 });
  }
  return Response.json({ ok: true, email }, { headers: { 'Cache-Control': 'no-store' } });
}
