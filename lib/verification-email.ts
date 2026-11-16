import { env } from 'cloudflare:workers';

const CODE_LIFETIME_MS = 10 * 60 * 1000;
export const VERIFICATION_CODE_LIFETIME_MS = CODE_LIFETIME_MS;

export function verificationConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.VERIFICATION_EMAIL_FROM &&
    env.AUTH_CODE_SECRET && env.AUTH_CODE_SECRET.length >= 32);
}

export function newVerificationCode(): string {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
}

export async function codeDigest(email: string, code: string): Promise<string> {
  if (!env.AUTH_CODE_SECRET || env.AUTH_CODE_SECRET.length < 32) throw new Error('Verification is not configured.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.AUTH_CODE_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key,
    new TextEncoder().encode(`${email}:${code}`)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function sameDigest(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export async function sendVerificationEmail(email: string, code: string): Promise<boolean> {
  if (!verificationConfigured()) return false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.VERIFICATION_EMAIL_FROM,
        to: [email],
        subject: 'Your EvidenceFlow verification code',
        text: `Your EvidenceFlow verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function passwordResetEmailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.VERIFICATION_EMAIL_FROM);
}

export async function sendPasswordResetEmail(email: string, link: string): Promise<boolean> {
  if (!passwordResetEmailConfigured()) return false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.VERIFICATION_EMAIL_FROM,
        to: [email],
        subject: 'Reset your EvidenceFlow password',
        text: `Use this link to reset your EvidenceFlow password: ${link}\n\nThe link expires in 30 minutes and can only be used once. If you did not request it, you can ignore this email.`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
