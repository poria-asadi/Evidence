import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const COOKIE_NAME = 'ef_session';
const SESSION_AGE_SECONDS = 30 * 24 * 60 * 60;
const SHORT_SESSION_AGE_SECONDS = 24 * 60 * 60;
export const PASSWORD_ITERATIONS = 600_000;

export type AccountUser = {
  userId: string;
  username: string;
  displayName: string;
};

export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const username = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) ? username : null;
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function validProfileField(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 120;
}

export function validPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 12 &&
    value.length <= 128 && new TextEncoder().encode(value).length <= 256;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g)!, (pair) => parseInt(pair, 16));
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt).buffer, iterations }, key, 256);
  return toHex(new Uint8Array(bits));
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  return { hash: await derivePassword(password, salt, PASSWORD_ITERATIONS), salt: toHex(salt) };
}

export async function verifyPassword(password: string, expected: string, saltHex: string, iterations: number): Promise<boolean> {
  const salt = fromHex(saltHex);
  const expectedBytes = fromHex(expected);
  if (!salt || !expectedBytes || salt.length !== 32 || expectedBytes.length !== 32 || iterations !== PASSWORD_ITERATIONS) return false;
  const actualBytes = fromHex(await derivePassword(password, salt, iterations))!;
  let difference = 0;
  for (let i = 0; i < expectedBytes.length; i++) difference |= expectedBytes[i] ^ actualBytes[i];
  return difference === 0;
}

async function hashToken(token: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
}

export async function getSessionUser(): Promise<AccountUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await env.DB.prepare(`SELECT u.id AS userId, c.username, u.display_name AS displayName
    FROM account_sessions s
    JOIN users u ON u.id = s.user_id
    JOIN account_credentials c ON c.user_id = u.id
    WHERE s.token_hash = ? AND s.expires_at > ?`).bind(await hashToken(token), Date.now()).first<AccountUser>();
  return row ?? null;
}

export async function requireSessionUser(returnTo: string): Promise<AccountUser> {
  const user = await getSessionUser();
  if (user) return user;
  redirect(`/sign-in?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`);
}

export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/workspace';
  try {
    const url = new URL(value, 'https://app.local');
    return url.origin === 'https://app.local' && !['/sign-in', '/sign-up'].includes(url.pathname) && !url.pathname.startsWith('/api/')
      ? `${url.pathname}${url.search}${url.hash}` : '/workspace';
  } catch {
    return '/workspace';
  }
}

export function isSameOriginPost(request: Request): boolean {
  const origin = request.headers.get('origin');
  return Boolean(origin && origin === new URL(request.url).origin);
}

export async function readAuthInput(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return null;
  if (Number(request.headers.get('content-length') ?? 0) > 4096) return null;
  const text = await request.text();
  if (text.length > 4096) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function createSession(userId: string, request: Request, remember = false): Promise<string> {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  const age = remember ? SESSION_AGE_SECONDS : SHORT_SESSION_AGE_SECONDS;
  await env.DB.prepare('INSERT INTO account_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await hashToken(token), userId, now + age * 1000, now).run();
  return cookieHeader(token, request, remember ? age : undefined);
}

export async function deleteSession(request: Request): Promise<void> {
  const cookie = request.headers.get('cookie') ?? '';
  const token = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (token && /^[0-9a-f]{64}$/.test(token)) {
    await env.DB.prepare('DELETE FROM account_sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
  }
}

export function clearSessionCookie(request: Request): string {
  return cookieHeader('', request, 0);
}

function cookieHeader(token: string, request: Request, maxAge?: number): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict${maxAge === undefined ? '' : `; Max-Age=${maxAge}`}${secure}`;
}
